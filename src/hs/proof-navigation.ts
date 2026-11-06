import { AST } from "./core/ast.js";
import { HilbertSystem, HSContext } from "./core/core.js";
import { Proposition } from "./core/deduction.js";
import { HSError } from "./core/error.js";
import { HSParser } from "./core/parser.js";

// Rules contain cyclic proposition references. Preserve their prototypes while
// isolating both stored proofs and any rules generated lazily during inspection.
function copyProof<T>(value: T, copies = new Map<object, any>()): T {
    if (value === null || typeof value !== "object") return value;
    if (copies.has(value)) return copies.get(value);
    const result = value instanceof Map ? new Map()
        : value instanceof Set ? new Set()
            : Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
    copies.set(value, result);
    if (value instanceof Map) {
        for (const [key, item] of value) result.set(copyProof(key, copies), copyProof(item, copies));
    } else if (value instanceof Set) {
        for (const item of value) result.add(copyProof(item, copies));
    } else {
        for (const key of Object.keys(value)) result[key] = copyProof((value as Record<string, unknown>)[key], copies);
    }
    return result;
}

export class ProofNavigator {
    private contexts: HSContext[] = [];

    constructor(private system: HilbertSystem, private refresh: () => void) { }

    get active(): boolean { return this.contexts.length > 0; }
    get depth(): number { return this.contexts.length; }
    get parentContext(): HSContext | undefined { return this.contexts[this.contexts.length - 1]; }
    get rootContext(): HSContext | undefined { return this.contexts[0]; }

    private createPreview(): HilbertSystem {
        const preview = new HilbertSystem();
        preview.rules = copyProof(this.system.rules);
        preview.renamedSysRule = new Map(this.system.renamedSysRule);
        return preview;
    }

    private enter(preview: HilbertSystem): void {
        this.contexts.push(this.system.saveContext());
        this.system.loadContext(preview.saveContext());
        this.refresh();
    }

    enterRule(name: AST): void {
        const preview = this.createPreview();
        const rule = preview.getD(name.clone());
        if (rule.error) throw HSError.expandFail(HSError.errRuleUsed(name.toString(), rule.error.cause));
        if (!rule.step?.length) throw HSError.atomicStep(name);
        const commands = preview.genCmd(rule.step).map(command => new HSParser().parse(command, "cmd"));
        preview.fromCmd(commands);
        this.enter(preview);
    }

    enterStep(step: Proposition): void {
        if (this.system.getP(String(step.id)) !== step) throw HSError.expandFail(HSError.notInList);
        if (step.from.type !== "d") throw HSError.expandFail(HSError.noConclusion);
        const preview = this.createPreview();
        for (const prop of this.system.props) {
            if (prop.from.type !== "a") break;
            preview.hyp(prop.ast.clone());
        }
        const data = step.from.data;
        const conditions = data.conditions.map(condition => preview.hyp(
            this.system.ref_addCaptureScopeToAST(condition.ast,
                this.system.captureScope(step.parent, condition)).clone()
        ));
        const target = new Proposition(step.ast.clone(), {
            type: "d", data: {
                deduction: data.deduction.clone(), conditions,
                replaceValues: Object.fromEntries(Object.entries(data.replaceValues).map(([name, ast]) => [name, ast.clone()])),
            },
        });
        preview.props.push(target);
        preview.updatePropIdx();
        preview.expand(target);
        const conclusion = preview.ref_addCaptureScopeToAST(target.ast, preview.captureScope(null, target));
        if (!conclusion.equal(step.ast)) throw HSError.expandFail(HSError.replayConclusionMismatch);
        this.enter(preview);
    }

    // True keeps the browsing command active; false means the original table is restored.
    back(): boolean {
        const context = this.contexts.pop();
        if (context) {
            this.system.loadContext(context);
            this.refresh();
        }
        return this.active;
    }

    close(): void {
        const context = this.rootContext;
        if (!context) return;
        this.contexts.length = 0;
        this.system.loadContext(context);
        this.refresh();
    }
}
