import { NodeType } from "../asttype.js";
import { AtomSolver } from "./core/assert.js";
import { AST } from "./core/ast.js";
import { HilbertSystem } from "./core/core.js";
import { Deduction, Proposition } from "./core/deduction.js";
import { HSParser } from "./core/parser.js";

// Copy the complete object graph, including assertion sets and proof references.
// Sharing only the rule Map would let proof generation mutate live rule objects.
function isolated<T>(value: T, copies = new Map<object, unknown>()): T {
    if (value === null || typeof value !== "object") return value;
    if (copies.has(value)) return copies.get(value) as T;
    const copy = value instanceof Map ? new Map() : value instanceof Set ? new Set()
        : Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
    copies.set(value, copy);
    if (value instanceof Map) for (const [key, item] of value) copy.set(isolated(key, copies), isolated(item, copies));
    else if (value instanceof Set) for (const item of value) copy.add(isolated(item, copies));
    else for (const key of Object.keys(value)) copy[key] = isolated((value as Record<string, unknown>)[key], copies);
    return copy;
}

function sameSchema(left: Deduction, right: Deduction): boolean {
    return left.conclusion.equal(right.conclusion)
        && left.conditions.length === right.conditions.length
        && left.conditions.every((value, i) => value.equal(right.conditions[i]))
        && left.assertions.length === right.assertions.length
        && left.assertions.every((value, i) => AtomSolver.print(value) === AtomSolver.print(right.assertions[i]))
        && left.replaceNames.length === right.replaceNames.length
        && left.replaceNames.every(([name, item], i) => name === right.replaceNames[i][0] && item === right.replaceNames[i][1]);
}

/** Rebuild one rule from the current sheet, publishing only an independently replayed proof. */
export function rerecordRule(system: HilbertSystem, target: Deduction): Deduction {
    const name = target.name.name;
    if (target.name.type !== NodeType.ATOM_DNAME || system.rules.get(name) !== target) {
        throw Error("The rule to rerecord is no longer current.");
    }
    if (!target.error && !target.step) throw Error("An axiom cannot be rerecorded.");

    const scratch = new HilbertSystem();
    const snapshot = isolated({ rules: system.rules, aliases: system.renamedSysRule, context: system.saveContext() });
    scratch.rules = snapshot.rules;
    scratch.renamedSysRule = snapshot.aliases;
    const expected = scratch.rules.get(name)!;
    const blocked = new Set([name]);
    for (const [id, rule] of scratch.rules) if (rule.error) blocked.add(id);
    for (const id of blocked) scratch.rules.delete(id);

    let work = 32768;
    const charge = () => { if (--work < 0) throw Error("Rule rerecording exceeded its proof budget."); };
    const activeRules = new Set<Deduction>(), checkedRules = new Set<Deduction>();
    const activeNames = new Set<AST>();
    const inspectName = (ast: AST): void => {
        charge();
        if (activeNames.has(ast)) throw Error("Cyclic proof rule name.");
        activeNames.add(ast);
        try {
            if (ast.type === NodeType.ATOM_DNAME) {
                if (blocked.has(ast.name)) throw Error(`Proof uses an unavailable rule: ${ast.name}`);
                const rule = scratch.rules.get(ast.name);
                if (rule) inspectRule(rule);
            }
            for (const child of ast.nodes) inspectName(child);
        } finally { activeNames.delete(ast); }
    };
    const inspectProof = (steps: Proposition[]): void => {
        const tree = new Set<Proposition>(), refs = new Set<Proposition>(), active = new Set<Proposition>();
        const reference = (step: Proposition): void => {
            charge();
            if (active.has(step)) throw Error("Cyclic proof reference.");
            if (refs.has(step)) return;
            active.add(step);
            const parents = new Set<Proposition>();
            for (let parent = step.parent; parent; parent = parent.parent) {
                charge();
                if (parents.has(parent)) throw Error("Cyclic proof scope.");
                parents.add(parent);
            }
            if (step.from.type === "d") {
                inspectName(step.from.data.deduction);
                for (const condition of step.from.data.conditions) reference(condition);
            }
            active.delete(step);
            refs.add(step);
        };
        const walk = (step: Proposition): void => {
            charge();
            if (tree.has(step)) throw Error("Cyclic or duplicated proof row.");
            tree.add(step);
            reference(step);
            for (const child of step.children ?? []) walk(child);
        };
        for (const step of steps) walk(step);
    };
    const inspectRule = (rule: Deduction): void => {
        charge();
        if (activeRules.has(rule)) throw Error("Cyclic proof dependency.");
        if (checkedRules.has(rule)) return;
        if (rule.error) throw Error("Proof uses a failed rule.");
        activeRules.add(rule);
        for (const id of rule.dependence) inspectName(new AST(NodeType.ATOM_DNAME, id));
        if (rule.step) inspectProof(rule.step);
        activeRules.delete(rule);
        checkedRules.add(rule);
    };
    const resolve = scratch.getD.bind(scratch);
    scratch.getD = (ast, withProof = true, previewWork) => {
        inspectName(ast);
        return resolve(ast, withProof, previewWork);
    };
    const candidate = (): Deduction => {
        const proof = scratch.checkConclusionInPropList();
        const value = new Deduction(new Set(), expected.name.clone(), proof.asserts, proof.conditions,
            proof.conclusion, scratch.props.slice());
        if (!sameSchema(value, expected)) throw Error("The proof does not match the complete rule schema.");
        return value;
    };

    scratch.loadContext(snapshot.context);
    inspectProof(scratch.props);
    candidate();
    const commands = scratch.genCmd();
    const allowed = new Set(["hyp", "d", "mcpt", "mcnt", "cond", "var", "dir", "pop", "cd", "name"]);
    const parsed = commands.map(text => {
        charge();
        const cmd = new HSParser().parse(text, "cmd");
        if (!cmd || cmd.end !== text.length || !allowed.has(cmd.name)) {
            throw Error("A rerecorded proof cannot contain rule-changing commands.");
        }
        return cmd;
    });
    scratch.loadContext(scratch.createEmptyContext());
    scratch.fromCmd(parsed);
    inspectProof(scratch.props);
    const result = candidate();
    if (system.rules.get(name) !== target) throw Error("The rule to rerecord is no longer current.");
    system.rules.set(name, result);
    return result;
}
