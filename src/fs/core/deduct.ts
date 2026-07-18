// import { Assertion } from "./assert.js";
import { AST, MatchTable } from "./ast.js";
import { FSError } from "./error.js";


type Assertion = any;

export type DeductionStep = { conditionIdxs: number[], deduction: string, replaceValues: AST[] }
export class Deduction {
    system: string; // record which axioms are used
    name: string; assertions: Assertion[]; conditions: AST[]; conclusion: AST;
    step?: DeductionStep[];
    replaceNames: [string, boolean][];
    constructor(name: string, system: string, assertions: Assertion[], conditions: AST[], conclusion: AST, step?: DeductionStep[]) {
        try {
            this.system = system;
            this.name = name; this.assertions = assertions; this.conditions = conditions; this.conclusion = conclusion;
            this.step = step;
            const conclusionReplvars = conclusion.getReplvars();
            const conditionReplvars = new Map<string, boolean>();
            conditions.forEach(c => c.getReplvars(conditionReplvars));

            this.replaceNames = [...conclusionReplvars.entries()].filter(e => {
                if (conditionReplvars.has(e[0])) {
                    if (conditionReplvars.get(e[0]) !== e[1]) {
                        throw FSError.isItemAndWff(e[0]);
                    }
                    return false;
                }
                return true;
            }).sort((a, b) => a[0].localeCompare(b[0]));
        } catch (e) { throw FSError.createRule(name, e); }
    }
    deduct(assertions: Assertion[], conditions: AST[], replaceValues: MatchTable): AST {
        try {
            if (conditions.length !== this.conditions.length) throw FSError.inconsistCondNum();
            for (let i = 0; i < conditions.length; i++) {
                try { conditions[i].match(this.conditions[i], replaceValues) } catch (e) { throw FSError.matchCond(i + 1, e); }
            }
            for (let i = 0; i < assertions.length; i++) {
                try { assertions[i].replaceByMatchTable(replaceValues).check(assertions); } catch (e) {
                    throw FSError.assertFail(i + 1, e);
                }
            }
            try {
                const res = this.conclusion.clone().mut_replaceByMatchTable(replaceValues);
                res.checkWFF();
                return res;
            } catch (e) { throw FSError.conclusionFail(e); }
        } catch (e) { throw FSError.deductFail(this.name, e); }
    }
}

class Proposition {
    // type: "h" | "d" | "m";


}
