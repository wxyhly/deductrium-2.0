import { NodeType } from "../asttype.js";
import { AST } from "./core/ast.js";
import { HilbertSystem } from "./core/core.js";
// A policy is evaluated afresh: rewards, aliases and recorded macros can change.
export class MapAxiomPolicy {
    system;
    disabled;
    constructor(system, disabled) {
        this.system = system;
        this.disabled = disabled;
    }
    checkName(name) {
        if (!this.disabled.size)
            return;
        try {
            new PolicyCheck(this.system, this.disabled).name(name);
        }
        catch (cause) {
            if (cause instanceof Error)
                throw cause;
            throw new Error("无法验证地图推理规则", { cause });
        }
    }
    allowsRule(rule) {
        if (!this.disabled.size)
            return true;
        try {
            const check = new PolicyCheck(this.system, this.disabled);
            check.name(rule.name);
            check.rule(rule);
            return true;
        }
        catch {
            return false;
        }
    }
    allowsStep(step) {
        if (!this.disabled.size)
            return true;
        try {
            new PolicyCheck(this.system, this.disabled).tree(step);
            return true;
        }
        catch {
            return false;
        }
    }
}
// Provenance shares the charged, isolated proof generator, not the policy's
// deliberately broader traversal of every stored proof row.
export function createProofResolver(system) {
    return new PolicyCheck(system, new Set(), true).resolver();
}
class PolicyCheck {
    selective;
    remaining = 8192;
    scratch;
    blocked;
    names = new Map();
    rules = new Map();
    trees = new Map();
    refs = new Map();
    resolutions = 128;
    work = 32768;
    exhausted = false;
    schemas = new WeakMap();
    shapes = new WeakSet();
    constructor(system, disabled, selective = false) {
        this.selective = selective;
        this.scratch = new HilbertSystem();
        this.scratch.rules = new Map(system.rules);
        this.scratch.renamedSysRule = new Map(system.renamedSysRule);
        this.boundGeneration();
        this.blocked = new Set(disabled);
        // Resolve aliases in either direction, including a renamed disabled name.
        for (let changed = true; changed;) {
            changed = false;
            for (const [original, alias] of system.renamedSysRule) {
                this.consume();
                if (!this.blocked.has(original) && !this.blocked.has(alias))
                    continue;
                if (!this.blocked.has(original) || !this.blocked.has(alias))
                    changed = true;
                this.blocked.add(original);
                this.blocked.add(alias);
            }
        }
    }
    resolver() {
        return {
            system: this.scratch,
            charge: this.charge,
            size: (ast) => this.size(ast),
            schema: (rule) => this.schema(rule),
            key: (ast) => this.key(ast),
        };
    }
    charge = (count = 1) => {
        if (this.exhausted || (this.work -= count) < 0) {
            this.exhausted = true;
            throw Error("地图公理检查超过证明生成预算");
        }
    };
    size(root) {
        let count = 0;
        const active = new Set();
        const walk = (ast, depth) => {
            if (!ast || active.has(ast) || depth > 64 || ++count > 512)
                throw Error("地图公理检查的公式过于复杂");
            this.charge(1 + ast.name.length);
            active.add(ast);
            for (const node of ast.nodes)
                walk(node, depth + 1);
            active.delete(ast);
        };
        walk(root, 0);
        return count;
    }
    schema(rule) {
        const previous = this.schemas.get(rule);
        if (previous !== undefined)
            return previous;
        if (rule.error || rule.conditions.length > 32 || rule.assertions.length > 32)
            throw Error("无法验证地图推理规则");
        let size = this.size(rule.conclusion);
        for (const condition of rule.conditions)
            size += this.size(condition);
        for (const assertion of rule.assertions) {
            const variables = (assertion.type === "nf" || assertion.type === "dt" ? assertion.vs.size : 0)
                + (assertion.type === "nf" || assertion.type === "of" ? assertion.qs.size : 0);
            this.charge(1 + variables);
            size += 1 + variables;
        }
        this.schemas.set(rule, size);
        return size;
    }
    proofShape(rule) {
        if (this.shapes.has(rule))
            return;
        const seen = new Set();
        const walk = (steps, depth) => {
            if (depth > 64)
                throw Error("地图公理检查的证明过深");
            for (const step of steps) {
                this.charge();
                if (seen.has(step))
                    throw Error("地图公理检查遇到循环证明");
                seen.add(step);
                this.size(step.ast);
                if (step.from.type === "d") {
                    this.key(step.from.data.deduction);
                    for (const value of Object.values(step.from.data.replaceValues))
                        this.size(value);
                }
                if (step.children)
                    walk(step.children, depth + 1);
            }
        };
        walk(rule.step ?? [], 0);
        this.shapes.add(rule);
    }
    boundGeneration() {
        const preview = new HilbertSystem();
        preview.rules = this.scratch.rules;
        preview.renamedSysRule = this.scratch.renamedSysRule;
        const formula = preview.getD.bind(preview), resolve = this.scratch.getD.bind(this.scratch);
        const previews = new Map();
        preview.getD = ast => {
            this.charge();
            const key = this.key(ast);
            const cached = previews.get(key);
            if (cached)
                return cached;
            // Uncached arithmetic generators have separate, unbounded proof work.
            if (ast.type === NodeType.ATOM_DNAME && !preview.rules.has(ast.name))
                throw Error("无法验证地图推理规则");
            const rule = formula(ast, false, this.charge);
            this.schema(rule);
            previews.set(key, rule);
            return rule;
        };
        this.scratch.getD = (ast, withProof = true) => {
            this.charge();
            this.key(ast);
            // Cyclic combination substitution must stop *before* getD(true).
            // All recursive core lookups pass through this same charged preflight.
            const shape = preview.getD(ast);
            if (!withProof)
                return shape;
            this.proofShape(shape);
            // combineRules(true) has no allocation callback. Its proof adds only
            // applications of its operands, whose names/proofs are checked by
            // name(); use the charged schema instead of invoking that allocator.
            if (ast.type === NodeType.NODE_DNAME && ast.name === "")
                return shape;
            const rule = resolve(ast, true);
            this.charge(); // c/v/u generators may catch an inner budget exception.
            this.schema(rule);
            this.proofShape(rule);
            if (ast.type === NodeType.NODE_DNAME && ["c", "u", "<", ">"].includes(ast.name) && !rule.step?.length) {
                throw Error("地图推理规则缺少可验证的证明");
            }
            if (ast.type === NodeType.NODE_DNAME && ast.name === "v" && !rule.step?.length) {
                const child = preview.getD(ast.nodes[0]);
                if (child.conditions.length || child.step?.length || ast.nodes[0].type === NodeType.NODE_DNAME && ast.nodes[0].name === "") {
                    throw Error("地图推理规则缺少可验证的证明");
                }
            }
            return rule;
        };
        const deduce = this.scratch.d.bind(this.scratch);
        this.scratch.d = (rule, conditions, values) => {
            // d substitutes only once. Bound that allocation before cloning or
            // matching; a substituted formula cannot exceed schema × argument.
            const weight = this.schema(rule);
            let largest = 1;
            for (const condition of conditions) {
                let overhead = 64;
                if (this.selective) {
                    // The provenance collector checks only reachable rows. Charge
                    // actual capture sizes rather than a worst-case 64-level
                    // wrapper for every generated application.
                    const active = this.scratch.saveContext().activeProp;
                    for (const root of [condition, active]) {
                        const seen = new Set();
                        for (let node = root; node; node = node.parent) {
                            this.charge();
                            if (seen.has(node) || seen.size > 64)
                                throw Error("Cyclic or oversized proof scope");
                            seen.add(node);
                            this.size(node.ast);
                        }
                    }
                    overhead = this.scratch.captureScope(active, condition)
                        .reduce((size, layer) => size + 1 + this.size(layer.ast), 0);
                }
                largest = Math.max(largest, this.size(condition.ast) + overhead);
            }
            const replacements = {};
            for (const [key, value] of Object.entries(values)) {
                largest = Math.max(largest, this.size(value));
                replacements[key] = value.clone();
            }
            this.charge(weight * largest);
            const step = deduce(rule, conditions, replacements);
            this.size(step.ast);
            return step;
        };
    }
    consume() {
        if (--this.remaining < 0)
            throw Error("地图公理检查超过依赖预算");
    }
    enter(visited, key, inspect) {
        this.consume();
        if (visited.has(key)) {
            if (!visited.get(key))
                throw Error("地图公理检查遇到循环依赖");
            return;
        }
        visited.set(key, false);
        inspect();
        visited.set(key, true);
    }
    key(ast) {
        let nodes = 128;
        const active = new Set();
        const walk = (node, depth) => {
            this.consume();
            if (!node || --nodes < 0 || depth > 24 || node.name.length > 128 || active.has(node))
                throw Error("地图公理检查的规则名过于复杂");
            active.add(node);
            if (node.type !== NodeType.ATOM_DNAME && node.type !== NodeType.NODE_DNAME)
                throw Error("无效推理规则名");
            if (this.blocked.has(node.name))
                throw Error(`地图已禁用公理：${node.name}`);
            for (const child of node.nodes)
                walk(child, depth + 1);
            active.delete(node);
        };
        walk(ast, 0);
        return ast.toString();
    }
    name(ast) {
        const key = this.key(ast);
        if (ast.type === NodeType.ATOM_DNAME && ast.name === "#")
            return;
        this.enter(this.names, key, () => {
            for (const child of ast.nodes)
                this.name(child);
            if (--this.resolutions < 0)
                throw Error("地图公理检查超过规则预算");
            // Never generate transformed proofs in the player's live context.
            const rule = this.scratch.getD(ast.clone(), true);
            if (rule.error)
                throw Error("无法验证地图推理规则");
            this.rule(rule);
        });
    }
    rule(rule) {
        this.enter(this.rules, rule, () => {
            this.key(rule.name);
            if (rule.error)
                throw Error("无法验证地图推理规则");
            for (const dependency of rule.dependence)
                this.name(new AST(NodeType.ATOM_DNAME, dependency));
            for (const step of rule.step ?? [])
                this.tree(step);
        });
    }
    tree(step) {
        this.enter(this.trees, step, () => {
            this.reference(step, null);
            for (const child of step.children ?? [])
                this.tree(child);
        });
    }
    layers(step, scope) {
        const ancestors = new Set();
        for (let p = scope; p; p = p.parent) {
            this.consume();
            if (ancestors.has(p))
                throw Error("地图公理检查遇到循环作用域");
            ancestors.add(p);
        }
        const layers = [], seen = new Set();
        for (let p = step.children ? step : step.parent; p && !ancestors.has(p); p = p.parent) {
            this.consume();
            if (seen.has(p))
                throw Error("地图公理检查遇到循环作用域");
            seen.add(p);
            if (p.from.type === "c" || p.from.type === "v")
                layers.push(p);
        }
        return layers;
    }
    lifted(ast, layers) {
        let name = ast;
        for (const layer of layers) {
            name = new AST(NodeType.NODE_DNAME, layer.from.type, name);
            const key = this.key(name);
            // A generated c:d/v:d proof can contain d in its own c/v scope.
            // Its proof is already being checked; genuine named cycles still fail.
            if (this.names.get(key) !== false)
                this.name(name);
        }
    }
    reference(step, scope) {
        let scopes = this.refs.get(step);
        if (!scopes)
            this.refs.set(step, scopes = new Map());
        this.enter(scopes, scope, () => {
            const layers = this.layers(step, scope);
            if (step.from.type === "d") {
                const data = step.from.data;
                this.name(data.deduction);
                this.lifted(data.deduction, layers);
                for (const condition of data.conditions) {
                    this.reference(condition, step.parent);
                    if (layers.length)
                        this.reference(condition, scope);
                }
            }
            else if (step.from.type === "c" && layers.includes(step)) {
                // Referencing a discharged assumption proves A→A, not its siblings.
                for (const root of ["a1", "a2", "mp"])
                    this.name(new AST(NodeType.ATOM_DNAME, root));
            }
        });
    }
}
//# sourceMappingURL=map-policy.js.map