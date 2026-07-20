// import { Assertion } from "./assert.js";
import { AST, MatchTable } from "./ast.js";
import { FSError } from "./error.js";


export type Assertion = any;

export type DeductionStep = { conditions: AST[], deduction: string, replaceValues: MatchTable }
export class Deduction {
    dependence: Set<string>; // record which axioms are used
    name: string; assertions: Assertion[]; conditions: AST[]; conclusion: AST;
    step?: DeductionStep[];
    replaceNames: [string, boolean][];
    constructor(dependence: Set<string>, name: string, assertions: Assertion[], conditions: AST[], conclusion: AST, step?: DeductionStep[]) {
        try {
            this.dependence = dependence;
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
}

type PropositionFrom = DeductionStep | "h";
export class Proposition {
    ast: AST;
    from?: PropositionFrom;
    constructor(ast: AST, from: PropositionFrom) {
        this.from = from;
        this.ast = ast;
    }
    static hyp(ast: AST) {
        try { ast.checkWFF(); } catch (e) { FSError.hypFail(e); }
        return new Proposition(ast, 'h');
    }
    static d(deduction:Deduction,assertions: Assertion[], conditions: AST[], replaceValues: MatchTable): AST {
        try {
            if (conditions.length !== deduction.conditions.length) throw FSError.inconsistCondNum();
            for (let i = 0; i < conditions.length; i++) {
                try { conditions[i].match(deduction.conditions[i], replaceValues) } catch (e) { throw FSError.matchCond(i + 1, e); }
            }
            for (let i = 0; i < assertions.length; i++) {
                try { assertions[i].replaceByMatchTable(replaceValues).check(assertions); } catch (e) {
                    throw FSError.assertFail(i + 1, e);
                }
            }
            try {
                const res = deduction.conclusion.clone().mut_replaceByMatchTable(replaceValues);
                res.checkWFF();
                return res;
            } catch (e) { throw FSError.conclusionFail(e); }
        } catch (e) { throw FSError.deductFail(this.name, e); }
    }
}
