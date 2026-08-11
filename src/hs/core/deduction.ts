// import { Assertion } from "./assert.js";
import { NodeType } from "../../asttype.js";
import { Assertion, AtomicAssertion, AtomSolver } from "./assert.js";
import { AST, MatchTable } from "./ast.js";
import { HSError } from "./error.js";

export type DeductionStep = { deduction: AST, conditions: Proposition[], replaceValues: MatchTable }
export class Deduction {
    dependence: Set<string>; // record which axioms are used
    name: AST; assertions: AtomicAssertion[]; conditions: AST[]; conclusion: AST;
    step?: Proposition[];
    replaceNames: [string, boolean][];
    constructor(dependence: Set<string>, name: AST, assertions: AtomicAssertion[], conditions: AST[], conclusion: AST, step?: Proposition[]) {
        try {
            this.dependence = dependence;
            this.name = name; this.assertions = assertions;
            this.conditions = conditions; this.conclusion = conclusion;
            this.step = step;
            const conclusionReplvars = conclusion.getReplvars();
            const conditionReplvars = new Map<string, boolean>();
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
            });//.sort((a, b) => a[0].localeCompare(b[0]));
        } catch (e) { throw HSError.createRule(name, e); }
    }
    toString() {
        return this.assertions.map(e => AtomSolver.print(e)).concat(this.conditions as any).join(",") + "⊢" + this.conclusion;
    }
    getNewReplName(type: 'wff' | 'var') {
        const vars = new Map<string, boolean>();
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
                    } else {
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

// deduction|hyp|assert
type PropositionFrom = { type: "d", data: DeductionStep } | { type: "h" } | { type: "f" } | { type: "c" } | { type: "v" } | { type: "a", data: AtomicAssertion };
export class Proposition {
    ast: AST;
    from: PropositionFrom;
    children?: Proposition[];
    active?: boolean;
    name: string = "";
    id: number = 0;
    uuid!: number;
    parent: Proposition | null;
    relyBefore?: Proposition[];
    relyAfter?: Proposition[];
    constructor(ast: AST, from: PropositionFrom, name?: string) {
        this.from = from;
        this.ast = ast;
        this.name = name || "";
        this.parent = null;
    }
    static hyp(ast: AST): Proposition {
        if (ast.type === NodeType.ASSERT) {
            try { ast.checkAssert(); ast.getReplvars(); } catch (e) { throw HSError.hypFail(e); }
            const atomicAssertion = AtomSolver.fromAST(ast);

            return new Proposition(ast, { type: "a", data: atomicAssertion });
        }
        try { ast.checkWFF(); ast.getReplvars(); } catch (e) { throw HSError.hypFail(e); }
        return new Proposition(ast, { type: 'h' });
    }
    static mkdir(type: "c" | "v" | "f", ast: AST) {
        if (type === "c") try { ast.checkWFF(); ast.getReplvars(); } catch (e) { throw HSError.hypFail(e); }
        if (type === "v") try { ast.checkVAR(); } catch (e) { throw HSError.hypFail(e); }
        const p = new Proposition(ast, { type });
        if (type === "f") p.name = ast.name;
        p.children = [];
        return p;
    }
    getCmd() {
        if (this.from.type === "a" || this.from.type === "h") {
            return `hyp ${this.ast}`;
        } else if (this.from.type === "f") {
            return `dir ${this.name}`;
        } else if (this.from.type === "c") {
            return `cond ${this.ast}`;
        } else if (this.from.type === "v") {
            return `var ${this.ast.name}`;
        } else if (this.from.type === "d") {
            const data = this.from.data;
            const cond = data.conditions.map(p => p.id).join(" ");
            return `d ${data.deduction} ${cond ? cond + " " : ""}${Object.values(data.replaceValues).join(" ")}`.trimEnd();
        }
        throw "can't reach";
    }
}
