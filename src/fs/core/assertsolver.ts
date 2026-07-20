import { AST, MatchTable, NodeType } from "./ast.js";
import { FSError } from "./error.js";

export type AtomicNF = { type: 'nf'; name: string; vs: Set<string>; qs: Set<string> };
export type AtomicOF = { type: 'of'; name: string; qs: Set<string> };
export type AtomicDT = { type: 'dt'; vs: Set<string> };
type ExistsEq = { type: 'exists_eq'; vs: Set<string> };

export type Constraint = AtomicNF | AtomicOF | AtomicDT | ExistsEq;

class SolverState {
    private parent: Map<string, string> = new Map();
    public neq: Map<string, Set<string>> = new Map();

    private static isNormal(name: string): boolean {
        return !name.startsWith('$');
    }

    find(x: string): string {
        if (!this.parent.has(x)) {
            this.parent.set(x, x);
            this.neq.set(x, new Set());
            return x;
        }
        if (this.parent.get(x) !== x) {
            const p = this.find(this.parent.get(x)!);
            this.parent.set(x, p);
        }
        return this.parent.get(x)!;
    }

    union(a: string, b: string): boolean {
        let ra = this.find(a);
        let rb = this.find(b);
        if (ra === rb) return true;

        if (this.neq.get(ra)?.has(rb) || this.neq.get(rb)?.has(ra)) return false;

        if (SolverState.isNormal(ra) && SolverState.isNormal(rb)) return false;

        this.parent.set(rb, ra);
        for (const item of this.neq.get(rb) || []) {
            this.neq.get(item)!.delete(rb);
            this.neq.get(item)!.add(ra);
            this.neq.get(ra)!.add(item);
        }
        this.neq.delete(rb);
        return true;
    }

    add_neq(a: string, b: string): boolean {
        let ra = this.find(a);
        let rb = this.find(b);
        if (ra === rb) return false;
        this.neq.get(ra)!.add(rb);
        this.neq.get(rb)!.add(ra);
        return true;
    }

    clone(): SolverState {
        const s = new SolverState();
        s.parent = new Map(this.parent);
        s.neq = new Map();
        for (const [k, v] of this.neq) {
            s.neq.set(k, new Set(v));
        }
        return s;
    }

    getEqualityClasses(): string[][] {
        const rootToVars: Map<string, string[]> = new Map();
        const allVars = new Set([...this.parent.keys()]);
        for (const v of allVars) {
            const r = this.find(v);
            if (!rootToVars.has(r)) rootToVars.set(r, []);
            rootToVars.get(r)!.push(v);
        }
        return Array.from(rootToVars.values());
    }

    getInequalities(): [string, string][] {
        const result: [string, string][] = [];
        const seen = new Set<string>();
        for (const [a, set] of this.neq) {
            for (const b of set) {
                const key = [a, b].sort().join('|');
                if (!seen.has(key)) {
                    seen.add(key);
                    result.push([a, b]);
                }
            }
        }
        return result;
    }
}
export type AssertionCheckResult = { passed: boolean; counterexample?: { equalityClasses: string[][]; inequalities: [string, string][]; failedConclusion: Constraint } };
// ==================== AtomSolver 主类 ====================
export class AtomSolver {
    // ---------- 内部静态辅助方法 ----------
    private static checkConstraints(state: SolverState, constraints: Constraint[]): boolean {
        for (const c of constraints) {
            if (c.type === 'of') {
                let ok = false;
                for (const q of c.qs) {
                    if (state.find(c.name) === state.find(q)) { ok = true; break; }
                }
                if (!ok) return false;
            } else if (c.type === 'nf') {
                if (c.vs.size === 0) continue;
                let inVs = false;
                for (const v of c.vs) {
                    if (state.find(c.name) === state.find(v)) { inVs = true; break; }
                }
                if (!inVs) continue;
                let inQs = false;
                for (const q of c.qs) {
                    if (state.find(c.name) === state.find(q)) { inQs = true; break; }
                }
                if (!inQs) return false;
            } else if (c.type === 'dt') {
                const arr = Array.from(c.vs);
                for (let i = 0; i < arr.length; i++) {
                    for (let j = i + 1; j < arr.length; j++) {
                        const ri = state.find(arr[i]);
                        const rj = state.find(arr[j]);
                        if (ri === rj) return false;
                        if (!(state.neq.get(ri)?.has(rj) || state.neq.get(rj)?.has(ri))) {
                            return false;
                        }
                    }
                }
            } else if (c.type === 'exists_eq') {
                const arr = Array.from(c.vs);
                let found = false;
                for (let i = 0; i < arr.length; i++) {
                    for (let j = i + 1; j < arr.length; j++) {
                        if (state.find(arr[i]) === state.find(arr[j])) { found = true; break; }
                    }
                    if (found) break;
                }
                if (!found) return false;
            }
        }
        return true;
    }

    private static propagate(state: SolverState, constraints: Constraint[]): { state: SolverState; constraints: Constraint[]; ok: boolean } {
        const newCons: Constraint[] = [];
        for (const c of constraints) {
            if (c.type === 'dt') {
                const arr = Array.from(c.vs);
                let ok = true;
                for (let i = 0; i < arr.length; i++) {
                    for (let j = i + 1; j < arr.length; j++) {
                        if (!state.add_neq(arr[i], arr[j])) { ok = false; break; }
                    }
                    if (!ok) break;
                }
                if (!ok) return { state, constraints: [], ok: false };
                continue;
            }

            if (c.type === 'of') {
                if (c.qs.size === 1) {
                    const q = Array.from(c.qs)[0];
                    if (!state.union(c.name, q)) {
                        return { state, constraints: [], ok: false };
                    }
                    continue;
                }
                newCons.push(c);
            } else if (c.type === 'nf') {
                if (c.vs.size === 0) {
                    continue;
                }
                if (c.qs.size === 0) {
                    let ok = true;
                    for (const v of c.vs) {
                        if (!state.add_neq(c.name, v)) { ok = false; break; }
                    }
                    if (!ok) return { state, constraints: [], ok: false };
                    continue;
                }
                newCons.push(c);
            } else {
                newCons.push(c);
            }
        }
        return { state, constraints: newCons, ok: true };
    }

    private static solve(state: SolverState, constraints: Constraint[]): SolverState | null {
        const prop = this.propagate(state, constraints);
        if (!prop.ok) return null;
        state = prop.state;
        constraints = prop.constraints;

        if (this.checkConstraints(state, constraints)) return state;

        let idx = constraints.findIndex(c => c.type === 'of');
        if (idx === -1) idx = constraints.findIndex(c => c.type === 'nf');
        if (idx === -1) idx = constraints.findIndex(c => c.type === 'exists_eq');
        if (idx === -1) return null;

        const c = constraints[idx];
        const rest = constraints.slice(0, idx).concat(constraints.slice(idx + 1));

        if (c.type === 'of') {
            for (const q of c.qs) {
                const ns = state.clone();
                if (ns.union(c.name, q)) {
                    const result = this.solve(ns, rest);
                    if (result) return result;
                }
            }
            return null;
        } else if (c.type === 'nf') {
            // 分支1：name notin vs
            const ns1 = state.clone();
            let ok = true;
            for (const v of c.vs) {
                if (!ns1.add_neq(c.name, v)) { ok = false; break; }
            }
            if (ok) {
                const result = this.solve(ns1, rest);
                if (result) return result;
            }

            // 分支2：name in qs
            for (const q of c.qs) {
                const ns2 = state.clone();
                if (ns2.union(c.name, q)) {
                    const result = this.solve(ns2, rest);
                    if (result) return result;
                }
            }
            return null;
        } else if (c.type === 'exists_eq') {
            const arr = Array.from(c.vs);
            for (let i = 0; i < arr.length; i++) {
                for (let j = i + 1; j < arr.length; j++) {
                    const ns = state.clone();
                    if (ns.union(arr[i], arr[j])) {
                        const result = this.solve(ns, rest);
                        if (result) return result;
                    }
                }
            }
            return null;
        }
        return null;
    }

    // ---------- 公共接口 ----------
    /**
     * 检查 premises 是否蕴含所有 conclusions。
     * @param premises 已知原子断言列表
     * @param conclusions 待检查的原子断言列表
     * @returns { passed: boolean; counterexample?: { equalityClasses: string[][]; inequalities: [string, string][]; failedConclusion: Constraint } }
     */
    public static check(premises: Constraint[], conclusions: Constraint[]): AssertionCheckResult {
        // 收集所有变量
        const allVars = new Set<string>();
        const gather = (c: Constraint) => {
            if (c.type === 'of') {
                allVars.add(c.name);
                for (const q of c.qs) allVars.add(q);
            } else if (c.type === 'nf') {
                allVars.add(c.name);
                for (const v of c.vs) allVars.add(v);
                for (const q of c.qs) allVars.add(q);
            } else if (c.type === 'dt' || c.type === 'exists_eq') {
                for (const v of c.vs) allVars.add(v);
            }
        };
        for (const p of premises) gather(p);
        for (const con of conclusions) gather(con);
        const normalVars = Array.from(allVars).filter(v => !v.startsWith('$'));

        for (const con of conclusions) {
            let constraints: Constraint[] = premises.slice();

            if (con.type === 'of') {
                // 否定：name 与 qs 中所有变量不等（通过初始不等实现）
            } else if (con.type === 'nf') {
                // 否定：name in vs 且 name notin qs
                constraints.push({ type: 'of', name: con.name, qs: con.vs });
                // name notin qs 将在初始状态中 add_neq
            } else if (con.type === 'dt') {
                // 否定：存在一对变量相等
                constraints.push({ type: 'exists_eq', vs: con.vs });
            }

            const initState = new SolverState();

            // 普通变量默认不等
            let ok = true;
            for (let i = 0; i < normalVars.length; i++) {
                for (let j = i + 1; j < normalVars.length; j++) {
                    if (!initState.add_neq(normalVars[i], normalVars[j])) {
                        ok = false;
                        break;
                    }
                }
                if (!ok) break;
            }
            if (!ok) continue;

            // 添加结论否定中要求的不等
            if (con.type === 'of') {
                for (const q of con.qs) {
                    if (!initState.add_neq(con.name, q)) { ok = false; break; }
                }
            } else if (con.type === 'nf') {
                for (const q of con.qs) {
                    if (!initState.add_neq(con.name, q)) { ok = false; break; }
                }
            }
            if (!ok) continue;

            const resultState = this.solve(initState, constraints);
            if (resultState) {
                // 找到反例
                return {
                    passed: false,
                    counterexample: {
                        equalityClasses: resultState.getEqualityClasses(),
                        inequalities: resultState.getInequalities(),
                        failedConclusion: con
                    }
                };
            }
        }

        return { passed: true };
    }
}

export type ReduceResult = { asts: Assertion[], atoms: Constraint[] };

export abstract class Assertion {
    abstract clone(): Assertion;
    abstract mut_replaceByMatchTable(mt: MatchTable): Assertion;
    abstract reduce(res?: ReduceResult): ReduceResult;
    static replaceVarsetByMatchTable(vs: Set<string>, mt: MatchTable): Set<string> {
        const newVs = new Set<string>();
        for (const v of vs) {
            if (mt[v]) {
                const ast = mt[v];
                if (ast.type !== NodeType.VAR && ast.type !== NodeType.ATOM_ITEM) {
                    throw FSError.isNotVar(ast, v);
                }
                newVs.add(ast.name);
            } else {
                newVs.add(v);
            }
        }
        return newVs;
    }
    static fromAtomic(a: Constraint): Assertion {
        if (a.type === "nf") {
            return new NFAssertion(new AST(NodeType.ATOM_WFF, a.name), a.vs, a.qs);
        }
        if (a.type === "of") {
            return new OFAssertion(new AST(NodeType.ATOM_WFF, a.name), a.qs);
        }
        if (a.type === "dt") {
            return new DTAssertion(a.vs);
        }
        throw 'unknown atomic constrain';
    }
    static isSetsEqual(setA: Set<string>, setB: Set<string>) {
        if (setA.size !== setB.size) return false;
        for (const item of setA) {
            if (!setB.has(item)) return false;
        }
        return true;
    }
    static checkReduced(premises: Constraint[], res: ReduceResult): AssertionCheckResult {
        let undetermined = false;
        for (const a of res.asts) {
            if (a instanceof NFAssertion && a.ast.type === NodeType.SB) {
                // nf c b D  ⇒  nf #sb(a,b,c,D) b D
                // nf a B D  ∧  nf c B D  ⇒  nf #sb(a,b,c,D) B D
                // of a B  ∧  of c B  ⇒  of #sb(a,b,c,D) B

                // #sb的可替换条件：nf c D
                // #sb的化简条件：nf b D & nf c D => #sb(a,b,c,E) => #sb(a,b,c,E\D)
                // const [ast, { name: src }, dst] = a.ast.nodes;
                // const qs = new Set(a.ast.nodes.slice(3).map(e => e.name));
                // if (!this.isSetsEqual(qs, a.qs)) continue;
                // if (src!== a.) continue;
                undetermined = true; break;
            }
        }
        if (undetermined) return { passed: false };
        return AtomSolver.check(premises, res.atoms);
    }
}
export class NFAssertion extends Assertion {
    ast: AST;
    vs: Set<string>;
    qs: Set<string>;
    constructor(ast: AST, vs: Set<string>, qs: Set<string>) {
        super();
        this.ast = ast; this.vs = vs; this.qs = qs;
    }
    clone(): NFAssertion {
        return new NFAssertion(this.ast.clone(), new Set(this.vs), new Set(this.qs));
    }
    mut_replaceByMatchTable(mt: MatchTable): NFAssertion {
        this.ast.mut_replaceByMatchTable(mt);
        this.vs = Assertion.replaceVarsetByMatchTable(this.vs, mt);
        this.qs = Assertion.replaceVarsetByMatchTable(this.qs, mt);
        return this;
    }
    reduce(res: ReduceResult): ReduceResult {
        if (this.ast.type === NodeType.VAR || this.ast.type === NodeType.ATOM_WFF || this.ast.type === NodeType.ATOM_ITEM) {
            if (this.ast.name.match(/^[A-Z]/)) return res; // normal atom wff
            if (this.ast.name.match(/^[^\$\#a-z]/)) return res; // constant
            res.atoms.push({ type: "nf", name: this.ast.name, vs: this.vs, qs: this.qs }); // atom assertion
            return res;
        }
        if (this.ast.type === NodeType.LOGIC || this.ast.type === NodeType.PRED || this.ast.type === NodeType.FN) {
            for (const n of this.ast.nodes) {
                new NFAssertion(n, this.vs, this.qs).reduce(res);
            }
        }
        if (this.ast.type === NodeType.QUANT || this.ast.type === NodeType.CLASS) {
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[0].name);
            new NFAssertion(this.ast.nodes[1], this.vs, nqs).reduce(res);
        }
        if (this.ast.type === NodeType.BOUNDED_QUANT) {
            new NFAssertion(this.ast.nodes[1], this.vs, this.qs).reduce(res);
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[0].name);
            new NFAssertion(this.ast.nodes[2], this.vs, nqs).reduce(res);
        }
        if (this.ast.type === NodeType.SEP) {
            new NFAssertion(this.ast.nodes[1], this.vs, this.qs).reduce(res);
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[0].name);
            new NFAssertion(this.ast.nodes[2], this.vs, nqs).reduce(res);
        }
        if (this.ast.type === NodeType.RPL) {
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[1].name);
            new NFAssertion(this.ast.nodes[0], this.vs, nqs).reduce(res);
            new NFAssertion(this.ast.nodes[2], this.vs, this.qs).reduce(res);
        }
        if (this.ast.type === NodeType.SB) {
            // nf c b D  →  nf #sb(a,b,c,D) b D
            res.asts.push(this);
            return res;
        }
        throw "can't reach";
    }
}
export class OFAssertion extends Assertion {
    ast: AST;
    qs: Set<string>;
    constructor(ast: AST, qs: Set<string>) {
        super();
        this.ast = ast; this.qs = qs;
    }
    clone(): OFAssertion {
        return new OFAssertion(this.ast.clone(), new Set(this.qs));
    }
    mut_replaceByMatchTable(mt: MatchTable): OFAssertion {
        this.ast.mut_replaceByMatchTable(mt);
        this.qs = Assertion.replaceVarsetByMatchTable(this.qs, mt);
        return this;
    }
    reduce(res: ReduceResult): ReduceResult {
        if (this.ast.type === NodeType.VAR || this.ast.type === NodeType.ATOM_WFF || this.ast.type === NodeType.ATOM_ITEM) {
            if (this.ast.name.match(/^[A-Z]/)) return res; // normal atom wff
            if (this.ast.name.match(/^[^\$\#a-z]/)) return res; // constant
            res.atoms.push({ type: "of", name: this.ast.name, qs: this.qs }); // atom assertion
            return res;
        }
        if (this.ast.type === NodeType.LOGIC || this.ast.type === NodeType.PRED || this.ast.type === NodeType.FN) {
            for (const n of this.ast.nodes) {
                new OFAssertion(n, this.qs).reduce(res);
            }
        }
        if (this.ast.type === NodeType.QUANT || this.ast.type === NodeType.CLASS) {
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[0].name);
            new OFAssertion(this.ast.nodes[1], nqs).reduce(res);
        }
        if (this.ast.type === NodeType.BOUNDED_QUANT) {
            new OFAssertion(this.ast.nodes[1], this.qs).reduce(res);
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[0].name);
            new OFAssertion(this.ast.nodes[2], nqs).reduce(res);
        }
        if (this.ast.type === NodeType.SEP) {
            new OFAssertion(this.ast.nodes[1], this.qs).reduce(res);
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[0].name);
            new OFAssertion(this.ast.nodes[2], nqs).reduce(res);
        }
        if (this.ast.type === NodeType.RPL) {
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[1].name);
            new OFAssertion(this.ast.nodes[0], nqs).reduce(res);
            new OFAssertion(this.ast.nodes[2], this.qs).reduce(res);
        }
        if (this.ast.type === NodeType.SB) {
            res.asts.push(this);
            return res;
        }
        throw "can't reach";
    }
}
export class DTAssertion extends Assertion {
    vs: Set<string>;
    constructor(vs: Set<string>) {
        super(); this.vs = vs;
    }
    clone(): DTAssertion {
        return new DTAssertion(new Set(this.vs));
    }
    mut_replaceByMatchTable(mt: MatchTable): DTAssertion {
        const length = this.vs.size;
        this.vs = Assertion.replaceVarsetByMatchTable(this.vs, mt);
        if (this.vs.size !== length) throw FSError.distinctFail();
        return this;
    }
    reduce(res: ReduceResult): ReduceResult {
        res.atoms.push({ type: "dt", vs: this.vs });
        return res;
    }
}