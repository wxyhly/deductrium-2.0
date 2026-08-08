// import { Assertion } from "./assert.js";
import { NodeType } from "../../asttype.js";
import { Assertion, AtomSolver } from "./assert.js";
import { AST } from "./ast.js";
import { HSError } from "./error.js";
export class Deduction {
    dependence; // record which axioms are used
    name;
    assertions;
    conditions;
    conclusion;
    step;
    replaceNames;
    constructor(dependence, name, assertions, conditions, conclusion, step) {
        try {
            this.dependence = dependence;
            this.name = name;
            this.assertions = assertions;
            this.conditions = conditions;
            this.conclusion = conclusion;
            this.step = step;
            const conclusionReplvars = conclusion.getReplvars();
            const conditionReplvars = new Map();
            conditions.forEach(c => c.getReplvars(conditionReplvars));
            assertions.forEach(c => AtomSolver.getReplvars(c, conclusionReplvars));
            this.replaceNames = [...conclusionReplvars.entries()].filter(e => {
                if (conditionReplvars.has(e[0])) {
                    if (conditionReplvars.get(e[0]) !== e[1]) {
                        throw HSError.isItemAndWff(e[0]);
                    }
                    return false;
                }
                return true;
            }); //.sort((a, b) => a[0].localeCompare(b[0]));
        }
        catch (e) {
            throw HSError.createRule(name, e);
        }
    }
    toString() {
        return this.assertions.map(e => AtomSolver.print(e)).concat(this.conditions).join(",") + "⊢" + this.conclusion;
    }
    getNewReplName(type) {
        const vars = new Map();
        this.conditions.forEach(c => c.getReplvars(vars));
        this.conclusion.getReplvars(vars);
        if (type === 'wff') {
            let name = "$0", i = 0;
            while (vars.has(name)) {
                name = "$" + (i++);
            }
            return new AST(NodeType.ATOM_WFF, name);
        }
        if (type === 'var') {
            let name = "$a", i = ['a'.charCodeAt(0)];
            while (vars.has(name)) {
                // 生成字典顺序：a-z,然后aa~az ba~bz ...zz，然后aaa...
                for (let j = i.length - 1; j >= 0; j--) {
                    if (i[j] < 'z'.charCodeAt(0)) {
                        i[j]++;
                        break;
                    }
                    else {
                        i[j] = 'a'.charCodeAt(0);
                        if (j === 0) {
                            i.push('a'.charCodeAt(0));
                        }
                    }
                }
                name = "$" + (i.map(e => String.fromCharCode(e)).join(""));
            }
            return new AST(NodeType.ATOM_ITEM, name);
        }
        throw "can't reach";
    }
}
export class Proposition {
    ast;
    from;
    children;
    active;
    name = "";
    id = 0;
    relyBefore;
    relyAfter;
    constructor(ast, from, name) {
        this.from = from;
        this.ast = ast;
        this.name = name || "";
    }
    static hyp(ast) {
        if (ast.type === NodeType.ASSERT) {
            try {
                ast.checkAssert();
                ast.getReplvars();
            }
            catch (e) {
                throw HSError.hypFail(e);
            }
            const atomicAssertion = AtomSolver.fromAST(ast);
            return new Proposition(ast, { type: "a", data: atomicAssertion });
        }
        try {
            ast.checkWFF();
            ast.getReplvars();
        }
        catch (e) {
            throw HSError.hypFail(e);
        }
        return new Proposition(ast, { type: 'h' });
    }
    static d(deduction, assertions, conditions, replaceValues) {
        try {
            if (conditions.length !== deduction.conditions.length)
                throw HSError.inconsistCondNum();
            for (const [name, isItem] of deduction.replaceNames) {
                if (isItem)
                    replaceValues[name]?.becomeItem();
            }
            for (let i = 0; i < conditions.length; i++) {
                const cond = conditions[i];
                if (cond.from.type !== "h" && cond.from.type !== "d" && cond.from.type !== "c")
                    throw HSError.matchCond(i + 1, HSError.isNotWFF(cond.ast));
                try {
                    cond.ast.match(deduction.conditions[i], replaceValues);
                }
                catch (e) {
                    throw HSError.matchCond(i + 1, e);
                }
            }
            for (let i = 0; i < deduction.assertions.length; i++) {
                try {
                    const constraint = Assertion.fromAtomic(deduction.assertions[i]).mut_replaceByMatchTable(replaceValues).reduce();
                    const check = Assertion.check(assertions, constraint);
                    if (!check.passed) {
                        throw check.counterexample;
                    }
                }
                catch (e) {
                    throw HSError.assertFail(i + 1, e);
                }
            }
            try {
                const res = deduction.conclusion.clone().mut_replaceByMatchTable(replaceValues);
                res.checkWFF();
                return new Proposition(res, { type: "d", data: { deduction: deduction.name, conditions, replaceValues } });
            }
            catch (e) {
                throw HSError.conclusionFail(e);
            }
        }
        catch (e) {
            throw HSError.deductFail(deduction.name.toString(), e);
        }
    }
    static mkdir(type, ast) {
        if (type === "c")
            try {
                ast.checkWFF();
                ast.getReplvars();
            }
            catch (e) {
                throw HSError.hypFail(e);
            }
        if (type === "v")
            try {
                ast.checkVAR();
            }
            catch (e) {
                throw HSError.hypFail(e);
            }
        const p = new Proposition(ast, { type });
        p.children = [];
        return p;
    }
    getCmd() {
        if (this.from.type === "a" || this.from.type === "h") {
            return `hyp ${this.ast}`;
        }
        if (this.from.type === "c" || this.from.type === "v") {
            return `hyp ${this.ast}`;
        }
        if (this.from.type === "d") {
            const data = this.from.data;
            return `d ${data.deduction} ${data.conditions.map(p => p.id).join(" ")} ${Object.values(data.replaceValues).join(" ")}`.trimEnd();
        }
        throw "can't reach";
    }
}
//# sourceMappingURL=deduct.js.map