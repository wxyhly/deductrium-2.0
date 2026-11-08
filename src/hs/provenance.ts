import { NodeType } from "../asttype.js";
import { AtomSolver } from "./core/assert.js";
import { AST } from "./core/ast.js";
import { MCNT, MCPT, MSBT, assertToAST } from "./core/combine.js";
import { HilbertSystem } from "./core/core.js";
import { Deduction, Proposition } from "./core/deduction.js";
import { initialCreativeRules } from "./core/initial.js";
import { intuitionisticRules } from "./core/intuitionistic.js";
import { HSParser } from "./core/parser.js";
import { getNumberLiteralDefinition } from "./core/number/literals.js";
import { createProofResolver } from "./map-policy.js";
import { PROOF_TAGS, validProofTags } from "./proof-tags.js";

export { PROOF_TAGS } from "./proof-tags.js";

export interface ProofProvenance {
    sources: Array<{ id: string; tag: string }>;
    tags: string[];
    valid: boolean;
    error?: string;
}

interface Summary {
    sources: Map<string, string>;
    used: Set<number>;
}
interface Frame {
    inputs: Map<Proposition, number>;
    refs: Map<Proposition, Map<Proposition | null, Summary | null>>;
    assertions: Deduction["assertions"];
}
const empty = (): Summary => ({ sources: new Map(), used: new Set() });
const merge = (target: Summary, value: Summary): void => {
    for (const [id, tag] of value.sources) target.sources.set(id, tag);
    for (const index of value.used) target.used.add(index);
};
const source = (id: string, tag: string): Summary => ({ sources: new Map([[id, tag]]), used: new Set() });
const parser = new HSParser();

// This immutable catalogue is the only process-wide cache. Player rules,
// aliases, proofs and failures are never retained between analyses.
const primitives = new Map<string, { schema: string; tag: string }>();
function schema(rule: Deduction): string {
    return JSON.stringify([
        rule.assertions.map(value => AtomSolver.print(value)).sort(),
        rule.conditions.map(value => value.toString()), rule.conclusion.toString(),
    ]);
}
function parseRule(id: string, text: string): Deduction {
    const parsed = parser.parse(text, "rule");
    const assertions = parsed.nodes.filter(node => node.type === NodeType.ASSERT).map(node => AtomSolver.fromAST(node));
    const nodes = parsed.nodes.filter(node => node.type !== NodeType.ASSERT);
    return new Deduction(new Set(), new AST(NodeType.ATOM_DNAME, id), assertions, nodes.slice(0, -1), nodes.at(-1)!);
}
function catalogue(text: string, initialTag: string): void {
    let tag = initialTag;
    for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (line.includes("[en]ZFC Set Theory")) tag = "zfc";
        else if (line.includes("[en]NBG Theory")) tag = "nbg";
        else if (line.includes("[en]Peano Arithmetic")) tag = "peano";
        else if (line.includes("[en]Natural Numbers")) tag = "natural";
        else if (line.includes("[en]Integers")) tag = "integer";
        else if (line.includes("[en]Rational Numbers")) tag = "rational";
        else if (line.includes("[en]Real Numbers")) tag = "real";
        const match = /^([^:]+):ax:\s*([^;]+);/.exec(line);
        if (!match) continue;
        const [, id, formula] = match;
        let category = tag;
        if (["mp", "a1", "a2"].includes(id)) category = "propositional";
        else if (["a3", "d<>1", "d<>2", "d/\\", "d\\/"].includes(id)) category = "classical";
        primitives.set(id, { schema: schema(parseRule(id, formula)), tag: category });
    }
}
catalogue(initialCreativeRules, "first-order");
catalogue(intuitionisticRules, "intuitionistic");

class Analysis {
    private resolver;
    private scratch: HilbertSystem;
    private rules = new Map<Deduction, Summary | null>();
    private names = new Map<string, Summary | null>();
    private depth = 0;

    constructor(private original: HilbertSystem) {
        this.resolver = createProofResolver(original);
        this.scratch = this.resolver.system;
        // Nested lifts resolve the same inner transformations repeatedly. Keep
        // only this analysis's successfully checked proofs, with charged lookups
        // and an in-progress marker so recursive generation still fails closed.
        const resolve = this.scratch.getD.bind(this.scratch);
        const generated = new Map<string, Deduction | null>();
        this.scratch.getD = (ast, withProof = true) => {
            if (!withProof) return resolve(ast, false);
            this.resolver.charge();
            const key = this.resolver.key(ast);
            if (generated.has(key)) {
                const cached = generated.get(key);
                if (!cached) throw Error("Cyclic proof generation");
                return cached;
            }
            generated.set(key, null);
            const rule = resolve(ast, true);
            generated.set(key, rule);
            return rule;
        };
        const mcpt = this.scratch.mcpt.bind(this.scratch);
        this.scratch.mcpt = formula => {
            this.tautologyBudget(formula);
            return mcpt(formula);
        };
    }

    private tautologyBudget(formula: AST): void {
        const size = this.resolver.size(formula);
        this.resolver.charge(size * size);
        const atoms = new MCPT(formula).genAtomWff().atoms.length;
        this.resolver.charge(size * 2 ** atoms);
    }

    private enter<T>(action: () => T): T {
        this.resolver.charge();
        if (++this.depth > 96) throw Error("Proof provenance exceeds dependency depth");
        try { return action(); } finally { this.depth--; }
    }

    private originalID(id: string): string {
        const seen = new Set<string>();
        for (;;) {
            this.resolver.charge();
            if (seen.has(id)) throw Error("Cyclic proof rule alias");
            seen.add(id);
            const aliases = [...this.original.renamedSysRule].filter(([, alias]) => alias === id);
            if (!aliases.length) return id;
            if (aliases.length !== 1) throw Error("Ambiguous proof rule alias");
            id = aliases[0][0];
        }
    }

    private primitive(rule: Deduction): Summary {
        const id = this.originalID(rule.name.name);
        const trusted = primitives.get(id);
        let tag = trusted?.schema === schema(rule) ? trusted.tag : "custom";
        // Closed numeric literal definitions are generated from a pure schema.
        if (!trusted && id.length <= 128) {
            const literal = getNumberLiteralDefinition(id);
            if (literal && schema(parseRule(id, literal)) === schema(rule)) {
                tag = /r$|^dR/.test(id) ? "real" : /q$|^dQ|\./.test(id) ? "rational" : /^dZ/.test(id) ? "integer" : "peano";
            }
        }
        const result = source(id, tag);
        rule.conditions.forEach((_, index) => result.used.add(index));
        return result;
    }

    private last(steps: readonly Proposition[]): Proposition {
        this.resolver.charge();
        const step = steps.at(-1);
        if (!step) throw Error("Proof has no conclusion");
        return this.enter(() => step.children?.length ? this.last(step.children) : step);
    }

    rule(rule: Deduction): Summary {
        return this.enter(() => {
            if (this.rules.has(rule)) {
                const cached = this.rules.get(rule);
                if (!cached) throw Error("Cyclic proof rule");
                return cached;
            }
            this.resolver.schema(rule);
            this.resolver.key(rule.name);
            this.rules.set(rule, null);
            let result: Summary;
            if (rule.name.type === NodeType.NODE_DNAME) result = this.transformed(rule.name);
            else if (rule.step) {
                const frame: Frame = { inputs: new Map(), refs: new Map(), assertions: rule.assertions };
                for (const step of rule.step) {
                    this.resolver.charge();
                    if (step.from.type !== "h" && step.from.type !== "a") break;
                    if (step.from.type === "h") frame.inputs.set(step, frame.inputs.size);
                }
                if (frame.inputs.size !== rule.conditions.length) throw Error("Proof premises do not match rule schema");
                const last = this.last(rule.step);
                if (last.from.type !== "d" && last.from.type !== "c") throw Error("Proof has no derived conclusion");
                const layers = this.layers(last, null);
                const conclusion = this.scratch.ref_addCaptureScopeToAST(last.ast, layers);
                if (!conclusion.equal(rule.conclusion)) throw Error("Proof conclusion does not match rule schema");
                result = this.reference(last, null, frame);
            } else result = this.primitive(rule);
            this.rules.set(rule, result);
            return result;
        });
    }

    private name(ast: AST): Summary {
        return this.enter(() => {
            const key = this.resolver.key(ast);
            if (this.names.has(key)) {
                const cached = this.names.get(key);
                if (!cached) throw Error("Cyclic proof dependency");
                return cached;
            }
            this.names.set(key, null);
            let result: Summary;
            if (ast.type === NodeType.NODE_DNAME) result = this.transformed(ast);
            else {
                const rule = this.scratch.rules.get(ast.name);
                if (!rule) throw Error(`Unknown proof rule: ${ast.name}`);
                result = this.rule(rule);
            }
            this.names.set(key, result);
            return result;
        });
    }

    private transformed(ast: AST): Summary {
        if (!["", "c", "v", "u", "<", ">", "e"].includes(ast.name)) throw Error("Unknown proof transformation");
        // Validate combinations through the bounded unifier without allocating
        // an expanded proof. Only arguments used by the function's final proof
        // contribute sources or used external premises.
        if (ast.name === "") {
            this.scratch.getD(ast, false);
            const fn = this.scratch.getD(ast.nodes[0], false);
            const summary = this.name(ast.nodes[0]);
            const result: Summary = { sources: new Map(summary.sources), used: new Set() };
            let offset = 0;
            for (let index = 0; index < fn.conditions.length; index++) {
                const arg = ast.nodes[index + 1];
                const hole = !arg || arg.type === NodeType.ATOM_DNAME && arg.name === "#";
                if (hole) {
                    if (summary.used.has(index)) result.used.add(offset);
                    offset++;
                } else {
                    const argument = this.scratch.getD(arg, false);
                    if (summary.used.has(index)) {
                        const value = this.name(arg);
                        for (const [id, tag] of value.sources) result.sources.set(id, tag);
                        for (const used of value.used) result.used.add(offset + used);
                    }
                    offset += argument.conditions.length;
                }
            }
            return result;
        }
        const rule = this.scratch.getD(ast, true);
        if (ast.name === "e") {
            const result = empty();
            merge(result, this.name(ast.nodes[0]));
            result.sources.set("e", "first-order");
            return result;
        }
        if (!rule.step?.length) {
            if (ast.name !== "v") throw Error("Transformed rule has no proof");
            const result = empty();
            merge(result, this.name(ast.nodes[0]));
            result.sources.set("v", "first-order");
            return result;
        }
        // The generated proof has a non-atomic name, so inspect its body here
        // instead of dispatching back into transformed().
        const body = Object.create(Object.getPrototypeOf(rule)) as Deduction;
        Object.assign(body, rule, { name: new AST(NodeType.ATOM_DNAME, "@generated") });
        return this.rule(body);
    }

    private layers(step: Proposition, scope: Proposition | null): Proposition[] {
        const ancestors = new Set<Proposition>();
        for (let current = scope; current; current = current.parent) {
            this.resolver.charge();
            if (ancestors.has(current)) throw Error("Cyclic proof scope");
            ancestors.add(current);
        }
        const result: Proposition[] = [], seen = new Set<Proposition>();
        for (let current = step.children ? step : step.parent; current && !ancestors.has(current); current = current.parent) {
            this.resolver.charge();
            if (seen.has(current)) throw Error("Cyclic proof scope");
            seen.add(current);
            if (current.from.type === "c" || current.from.type === "v") result.push(current);
        }
        return result;
    }

    step(step: Proposition): Summary {
        return this.reference(step.children?.length ? this.last(step.children) : step, null,
            { inputs: new Map(), refs: new Map(), assertions: this.original.getAsserts() });
    }

    private reference(step: Proposition, scope: Proposition | null, frame: Frame): Summary {
        return this.enter(() => {
            let refs = frame.refs.get(step);
            if (!refs) frame.refs.set(step, refs = new Map());
            if (refs.has(scope)) {
                const cached = refs.get(scope);
                if (!cached) throw Error("Cyclic proof reference");
                return cached;
            }
            refs.set(scope, null);
            this.resolver.size(step.ast);
            const result = empty(), layers = this.layers(step, scope);
            if (step.from.type === "d") {
                const data = step.from.data;
                const special = this.special(step, frame);
                const summary = special ?? this.name(data.deduction);
                for (const [id, tag] of summary.sources) result.sources.set(id, tag);
                let lifted = data.deduction;
                for (const layer of layers) {
                    if (special) {
                        // Special meta commands have no ordinary getD name.
                        if (layer.from.type === "v") result.sources.set("v", "first-order");
                        else for (const id of ["mp", "a1", "a2"]) {
                            for (const [root, tag] of this.name(new AST(NodeType.ATOM_DNAME, id)).sources) result.sources.set(root, tag);
                        }
                        continue;
                    }
                    lifted = new AST(NodeType.NODE_DNAME, layer.from.type, lifted);
                    // Generated c:d/v:d proofs reference d inside their own
                    // discharge scope. Only this synthetic lift may be skipped.
                    if (this.names.get(this.resolver.key(lifted)) === null) continue;
                    for (const [id, tag] of this.name(lifted).sources) result.sources.set(id, tag);
                }
                for (const index of summary.used) {
                    const condition = data.conditions[index];
                    if (!condition) throw Error("Missing proof premise");
                    // The outer reference includes the premise's intrinsic
                    // proof as well as its captures. Walking it locally too
                    // repeats that same used chain at every discharged scope.
                    merge(result, this.reference(condition, layers.length ? scope : step.parent, frame));
                }
            } else if (step.from.type === "h") {
                const index = frame.inputs.get(step);
                if (index !== undefined) result.used.add(index);
            } else if (step.from.type === "c" && layers.includes(step)) {
                for (const id of ["mp", "a1", "a2"]) {
                    for (const [root, tag] of this.name(new AST(NodeType.ATOM_DNAME, id)).sources) result.sources.set(root, tag);
                }
            } else if (step.from.type === "v") result.sources.set("v", "first-order");
            else if (step.from.type !== "a" && step.from.type !== "c" && step.from.type !== "f") throw Error("Unknown proof step");
            refs.set(scope, result);
            return result;
        });
    }

    private special(step: Proposition, frame: Frame): Summary | undefined {
        if (step.from.type !== "d") return;
        const data = step.from.data, name = data.deduction;
        const operator = name.type === NodeType.NODE_DNAME && name.name === "" ? name.nodes[0]?.name : name.name;
        if (operator === "mcpt") {
            this.tautologyBudget(step.ast);
            new MCPT(step.ast).check(false);
            return source("mcpt", "classical");
        }
        if (!["msbt>", "msbt<", "mcnt"].includes(operator)) return;
        for (const value of Object.values(data.replaceValues)) this.resolver.size(value);
        const targetIsStep = !data.replaceValues.$t;
        const target = data.replaceValues.$t ?? data.conditions.at(-1)?.ast;
        if (!target) throw Error("Missing meta-rule target");
        const size = this.resolver.size(target);
        // The command builders do not accept a work callback. Bound their
        // nested formula walks before invoking them and charge replay as usual.
        this.resolver.charge(size * size * 2);
        const saved = this.scratch.saveContext();
        try {
            this.scratch.loadContext(this.scratch.createEmptyContext());
            let assertCount = 0;
            for (const assertion of frame.assertions) {
                const formula = assertToAST(assertion);
                this.resolver.size(formula);
                this.scratch.hyp(formula);
                assertCount++;
            }
            let commands: string[];
            if (operator === "mcnt") {
                const generator = new MCNT(target.clone(), targetIsStep ? 1 : undefined,
                    MCNT.getsubIndices(data.replaceValues.$i) ?? new Map(), frame.assertions);
                commands = generator.generateStep(assertCount);
            } else {
                const inner = name.type === NodeType.NODE_DNAME ? name.nodes[1] : undefined;
                const isMcpt = inner?.name === "mcpt";
                const templateRule = inner && !isMcpt ? this.scratch.getD(inner) : undefined;
                const templateProp = !inner ? data.conditions[0] : undefined;
                const pattern = isMcpt ? data.replaceValues.$p : templateRule?.conclusion ?? templateProp?.ast;
                if (!pattern) throw Error("Missing substitution template");
                const patternSize = this.resolver.size(pattern);
                this.resolver.charge(patternSize * size * 2);
                const generator = new MSBT(this.scratch, pattern.clone(), !inner, target.clone(), false,
                    operator === "msbt>", frame.assertions, MSBT.getsubIndices(data.replaceValues.$i));
                commands = generator.generateStep(templateRule, templateProp, isMcpt, targetIsStep, assertCount);
            }
            this.resolver.charge(commands.length);
            if (commands.length > 512) throw Error("Meta proof exceeds command budget");
            // mcpt is a checked classical primitive in the provenance model;
            // fromCmd checks its formula but never constructs its truth-table proof.
            this.scratch.fromCmd(commands.map(command => parser.parse(command, "cmd")));
            const rule = new Deduction(new Set(), new AST(NodeType.ATOM_DNAME, "@meta"), frame.assertions,
                data.conditions.map(condition => condition.ast), step.ast, this.scratch.props.slice());
            return this.rule(rule);
        } finally { this.scratch.loadContext(saved); }
    }
}

function result(action: () => Summary): ProofProvenance {
    try {
        const summary = action();
        const sources = [...summary.sources].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([id, tag]) => ({ id, tag }));
        const tags = PROOF_TAGS.filter(tag => sources.some(source => source.tag === tag.id)).map(tag => tag.id);
        return { sources, tags, valid: true };
    } catch (error) {
        return { sources: [], tags: [], valid: false, error: error instanceof Error ? error.message : "Cannot verify proof provenance" };
    }
}

export function ruleProvenance(system: HilbertSystem, rule: Deduction): ProofProvenance {
    return result(() => new Analysis(system).rule(rule));
}

export function stepProvenance(system: HilbertSystem, step: Proposition): ProofProvenance {
    return result(() => new Analysis(system).step(step));
}

export function permitsProvenance(value: ProofProvenance, allowedTags: readonly string[]): boolean {
    return value.valid && validProofTags(allowedTags) && value.tags.every(tag => allowedTags.includes(tag));
}
