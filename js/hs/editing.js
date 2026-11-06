import { NodeType } from "../asttype.js";
import { HilbertSystem } from "./core/core.js";
import { HSError } from "./core/error.js";
import { HSParser } from "./core/parser.js";
// Remember rule identities across the UI's confirmation interval.
const plannedRules = new WeakMap();
const label = (name) => ({ name, id: 0 });
function flatten(steps, into = new Set()) {
    for (const p of steps) {
        if (into.has(p))
            continue;
        into.add(p);
        if (p.children)
            flatten(p.children, into);
    }
    return into;
}
function macro(system, name) {
    const rule = system.rules.get(name);
    if (!rule || (!rule.step && !rule.error)) {
        throw HSError.delFail(label(name), [], rule ? HSError.atomicStep(rule.name) : HSError.dname404(name));
    }
    return rule;
}
/** Expand selected proof folders. Rule-list folders are expanded by the caller. */
export function planDeletion(system, steps, macros) {
    const plan = { steps: flatten(steps), macros: new Set(macros) };
    plannedRules.set(plan, new Map([...plan.macros].map(name => [name, macro(system, name)])));
    return plan;
}
function ruleRefs(ast, refs) {
    if (ast.type === NodeType.ATOM_DNAME)
        refs.add(ast.name);
    for (const node of ast.nodes)
        ruleRefs(node, refs);
}
function proofRefs(steps) {
    const refs = new Set();
    for (const p of steps)
        if (p.from.type === "d")
            ruleRefs(p.from.data.deduction, refs);
    return refs;
}
// A prototype-preserving graph copy also isolates mutable ASTs, assertions, maps,
// and macro proofs used by getD's generated rules. Nothing in validation is live.
function copyGraph(value, copies = new Map()) {
    if (value === null || typeof value !== "object")
        return value;
    if (copies.has(value))
        return copies.get(value);
    if (value instanceof Map) {
        const result = new Map();
        copies.set(value, result);
        for (const [key, entry] of value)
            result.set(copyGraph(key, copies), copyGraph(entry, copies));
        return result;
    }
    if (value instanceof Set) {
        const result = new Set();
        copies.set(value, result);
        for (const entry of value)
            result.add(copyGraph(entry, copies));
        return result;
    }
    const result = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
    copies.set(value, result);
    for (const [key, entry] of Object.entries(value))
        result[key] = copyGraph(entry, copies);
    return result;
}
function candidate(contexts, plan) {
    const source = contexts[0];
    const copies = new Map();
    const props = copyGraph(source.props, copies);
    const originals = new Map();
    const lists = [];
    const filter = (list) => {
        const kept = list.filter(p => !plan.steps.has(p));
        lists.push({ original: list, kept });
        const cloned = copies.get(list);
        cloned.splice(0, cloned.length, ...kept.map(p => copies.get(p)));
        for (const p of kept) {
            originals.set(copies.get(p), p);
            if (p.children)
                filter(p.children);
        }
    };
    filter(source.props);
    const active = source.activeProp && !plan.steps.has(source.activeProp) ? source.activeProp : null;
    for (const [p, original] of originals)
        p.active = original === active;
    const scratch = new HilbertSystem();
    scratch.loadContext({ ...scratch.createEmptyContext(), props });
    scratch.updatePropIdx();
    const context = scratch.saveContext();
    for (const p of originals.keys()) {
        if (p.from.type === "f")
            continue;
        p.ast.getReplvars(context.replvars);
        p.ast.getReplvarVars(context.replvarVars);
    }
    return { contexts, context, originals, lists };
}
function replay(system, rules, props, item, original) {
    const scratch = new HilbertSystem();
    scratch.rules = copyGraph(rules);
    scratch.renamedSysRule = new Map(system.renamedSysRule);
    const parser = new HSParser();
    const mapped = new Map();
    for (const p of flatten(props)) {
        try {
            const parent = p.parent ? mapped.get(p.parent) : null;
            if (p.parent && !parent)
                throw HSError.unmappedStepProp;
            if (parent)
                scratch.cd(parent);
            else
                scratch.clearActiveDir();
            // Candidate indices already match the surviving tree, including named
            // folders and special mcpt/mcnt/msbt commands.
            scratch.fromCmd([parser.parse(p.getCmd(), "cmd")]);
            const result = scratch.getP(String(p.id));
            if (!result || (p.from.type !== "f" && !result.ast.equal(p.ast)))
                throw HSError.replayConclusionMismatch;
            result.name = p.name;
            scratch.updatePropIdx();
            mapped.set(p, result);
        }
        catch (cause) {
            throw HSError.delFail(item, [original(p)], cause);
        }
    }
}
function prepare(system, plan, contexts) {
    const active = system.saveContext();
    const groups = new Map();
    for (const ctx of [active, ...contexts]) {
        const group = groups.get(ctx.props);
        if (group) {
            if (!group.includes(ctx))
                group.push(ctx);
        }
        else
            groups.set(ctx.props, [ctx]);
    }
    const allSteps = new Set();
    for (const props of groups.keys())
        flatten(props, allSteps);
    for (const p of plan.steps) {
        if (!allSteps.has(p))
            throw HSError.delFail(p, [], HSError.notInList);
        const missing = (p.children || []).filter(child => !plan.steps.has(child));
        if (missing.length)
            throw HSError.delFail(p, missing, HSError.notInList);
    }
    for (const name of plan.macros) {
        const rule = macro(system, name);
        const expected = plannedRules.get(plan)?.get(name);
        if (expected && expected !== rule)
            throw HSError.delFail(label(name), [], HSError.notInList);
    }
    const graph = new Map();
    for (const [name, rule] of system.rules) {
        const refs = proofRefs(flatten(rule.step || []));
        // Generated rules can omit proof steps and have an empty dependence set.
        // Their structured name still records the rules used to construct them.
        if (rule.name.type === NodeType.NODE_DNAME)
            ruleRefs(rule.name, refs);
        for (const dep of rule.dependence) {
            if (dep === name)
                continue;
            if (system.rules.has(dep))
                refs.add(dep);
            else {
                // A derived dependency need not have a registered cache entry.
                // Ignore historical non-rule metadata that does not parse.
                try {
                    const ast = new HSParser().parse(dep, "dname");
                    if (ast)
                        ruleRefs(ast, refs);
                }
                catch { /* Not a rule dependency. */ }
            }
        }
        if (rule.error) {
            for (const cmd of rule.error.cmds.split(";")) {
                let ast;
                try {
                    ast = new HSParser().parse(cmd, "cmd");
                }
                catch {
                    continue;
                }
                if (ast?.name === "d" && ast.nodes[0])
                    ruleRefs(ast.nodes[0], refs);
            }
        }
        graph.set(name, refs);
    }
    const deletedDependency = (refs, seen = new Set()) => {
        for (const ref of refs) {
            if (plan.macros.has(ref))
                return ref;
            if (seen.has(ref))
                continue;
            seen.add(ref);
            const found = deletedDependency(graph.get(ref) || [], seen);
            if (found !== undefined)
                return found;
        }
    };
    const checkProof = (proof, owner) => {
        for (const p of proof) {
            if (!owner && plan.steps.has(p))
                continue;
            if (p.from.type !== "d")
                continue;
            // Macro proof nodes belong to the macro even when m() originally
            // copied a sheet's array. Only references outside that proof cross it.
            const removed = p.from.data.conditions.find(c => plan.steps.has(c) && (!owner || !proof.has(c)));
            if (removed)
                throw HSError.delFail(removed, [owner ? label(owner) : p], null);
            const dep = deletedDependency(proofRefs([p]));
            if (dep !== undefined)
                throw HSError.delFail(label(dep), [owner ? label(owner) : p], null);
        }
    };
    checkProof(allSteps);
    for (const [name, rule] of system.rules) {
        if (plan.macros.has(name))
            continue;
        const dep = deletedDependency(graph.get(name) || []);
        if (dep !== undefined)
            throw HSError.delFail(label(dep), [label(name)], null);
        checkProof(flatten(rule.step || []), name);
    }
    const candidates = [];
    const rules = new Map([...system.rules].filter(([name]) => !plan.macros.has(name)));
    for (const group of groups.values()) {
        const removed = [...flatten(group[0].props)].filter(p => plan.steps.has(p));
        if (!removed.length)
            continue;
        let next;
        try {
            next = candidate(group, plan);
        }
        catch (cause) {
            throw HSError.delFail(removed[0], [], cause);
        }
        const assertion = removed.find(p => p.from.type === "a");
        if (assertion)
            replay(system, rules, next.context.props, assertion, p => next.originals.get(p));
        candidates.push(next);
    }
    return candidates;
}
/** Read-only validation; callers must supply every sheet's context. */
export function checkDeletion(system, plan, contexts) {
    prepare(system, plan, contexts);
}
/** Validate again after confirmation, then publish the entire batch synchronously. */
export function deleteSelection(system, plan, contexts) {
    const candidates = prepare(system, plan, contexts);
    for (const { contexts: targets, context, originals, lists } of candidates) {
        for (const { original, kept } of lists)
            original.splice(0, original.length, ...kept);
        const original = (p) => originals.get(p);
        for (const [p, target] of originals) {
            target.id = p.id;
            target.parent = p.parent ? original(p.parent) : null;
            target.active = p.active;
            target.relyBefore = p.relyBefore.map(original);
            target.relyAfter = p.relyAfter.map(original);
        }
        for (const target of targets) {
            target.activeProp = context.activeProp ? original(context.activeProp) : null;
            target.flatProps.clear();
            for (const [key, p] of context.flatProps)
                target.flatProps.set(key, original(p));
            target.replvars.clear();
            for (const [key, value] of context.replvars)
                target.replvars.set(key, value);
            target.replvarVars.clear();
            for (const value of context.replvarVars)
                target.replvarVars.add(value);
        }
    }
    for (const name of plan.macros)
        system.rules.delete(name);
    // The first context in the active sheet's group is the fresh saveContext().
    const active = candidates.find(c => c.contexts[0].props === system.props);
    if (active)
        system.loadContext(active.contexts[0]);
}
//# sourceMappingURL=editing.js.map