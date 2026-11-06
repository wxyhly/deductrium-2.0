import { HilbertSystem } from "../core/core.js";
import { HSParser } from "../core/parser.js";
/** One input update owns one bounded batch. No previews survive a rules edit. */
export function createRulePreview(system) {
    let remaining = 32768;
    const stop = Symbol("preview budget");
    const parser = new HSParser();
    const scratch = new HilbertSystem();
    // Formula-only getD reads existing schemas and clones transformed ASTs. Its
    // separate map/context also keeps any future generated cache off the live UI.
    scratch.rules = new Map(system.rules);
    const resolve = scratch.getD.bind(scratch);
    const charge = (count = 1) => {
        remaining -= count;
        if (remaining < 0)
            throw stop;
    };
    const size = (root, limit) => {
        const pending = [root];
        let count = 0;
        while (pending.length) {
            const ast = pending.pop();
            charge(1 + ast.name.length);
            if (++count > limit)
                throw stop;
            pending.push(...ast.nodes);
        }
    };
    const schema = (rule) => {
        if (rule.error || rule.conditions.length > 32 || rule.assertions.length > 32)
            throw stop;
        for (const ast of [...rule.conditions, rule.conclusion])
            size(ast, 512);
        for (const a of rule.assertions) {
            charge(1 + (a.type === "nf" || a.type === "dt" ? a.vs.size : 0)
                + (a.type === "nf" || a.type === "of" ? a.qs.size : 0));
        }
    };
    scratch.getD = ast => {
        charge();
        const rule = resolve(ast, false, charge);
        schema(rule);
        return rule;
    };
    return name => {
        if (name.length > 128 || remaining < 0)
            return;
        try {
            charge();
            const ast = parser.parse(name, "dname");
            if (!ast || ast.start !== 0 || ast.end !== name.length)
                return;
            size(ast, 24);
            return scratch.getD(ast).toString();
        }
        catch {
            // Incomplete, invalid or costly names leave a usable name candidate.
            return;
        }
    };
}
//# sourceMappingURL=rule-preview.js.map