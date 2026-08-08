import { AST, NodeType } from "./ast.js";
import { F3, T3, U3 } from "./bool3.js";
import { FSError } from "./error.js";
// ==================== 求解状态 ====================
class SolverState {
    parent = new Map();
    neq = new Map();
    eq(a, b) {
        a = this.find(a);
        b = this.find(b);
        if (a === b)
            return T3;
        if (a.startsWith('#') || b.startsWith('#'))
            return F3;
        if (!a.startsWith('$') && !b.startsWith('$'))
            return F3;
        if (this.neq.get(a)?.has(b) || this.neq.get(b)?.has(a))
            return F3;
        return U3;
    }
    in(a, bs) {
        let allF = true;
        for (const b of bs) {
            const eq = this.eq(a, b);
            if (eq === T3)
                return T3;
            if (eq === U3)
                allF = false;
        }
        return allF ? F3 : U3;
    }
    find(x) {
        if (!this.parent.has(x)) {
            this.parent.set(x, x);
            this.neq.set(x, new Set());
            return x;
        }
        if (this.parent.get(x) !== x) {
            const p = this.find(this.parent.get(x));
            this.parent.set(x, p);
        }
        return this.parent.get(x);
    }
    // 合并两个等价类，优先保留普通变量作为根
    union(a, b) {
        const isEq = this.eq(a, b);
        if (isEq === T3)
            return true;
        if (isEq === F3)
            return false;
        let ra = this.find(a);
        let rb = this.find(b);
        // 优先选择普通变量作为根
        if (!rb.startsWith("$") && ra.startsWith("$")) {
            [ra, rb] = [rb, ra];
        }
        // 现在 ra 是优先根（如果存在普通变量，则 ra 就是它）
        this.parent.set(rb, ra);
        // 合并不等关系
        for (const item of this.neq.get(rb) || []) {
            this.neq.get(item).delete(rb);
            this.neq.get(item).add(ra);
            this.neq.get(ra).add(item);
        }
        this.neq.delete(rb);
        return true;
    }
    add_neq(a, b) {
        let ra = this.find(a);
        let rb = this.find(b);
        if (ra === rb)
            return false;
        this.neq.get(ra).add(rb);
        this.neq.get(rb).add(ra);
        return true;
    }
    clone() {
        const s = new SolverState();
        s.parent = new Map(this.parent);
        s.neq = new Map();
        for (const [k, v] of this.neq) {
            s.neq.set(k, new Set(v));
        }
        return s;
    }
    getEqualityClasses() {
        const rootToVars = new Map();
        const allVars = new Set([...this.parent.keys()]);
        for (const v of allVars) {
            const r = this.find(v);
            if (!rootToVars.has(r))
                rootToVars.set(r, []);
            rootToVars.get(r).push(v);
        }
        return Array.from(rootToVars.values());
    }
    getInequalities() {
        const result = [];
        const seen = new Set();
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
export class AtomSolver {
    // ---------- 约束检查是否一定满足----------
    static checkConstraints(state, constraints) {
        for (const c of constraints) {
            if (c.type === 'of') {
                if (state.find(c.name) === '0')
                    continue;
                if (c.qs.size === 0) {
                    return false;
                }
                let ok = false;
                for (const q of c.qs) {
                    if (state.find(c.name) === state.find(q)) {
                        ok = true;
                        break;
                    }
                }
                if (!ok)
                    return false;
            }
            else if (c.type === 'nf') {
                if (c.vs.size === 0 || state.find(c.name) === '0')
                    continue; // 恒真
                // 先检查 name 是否在 qs 中
                let inQs = false;
                for (const q of c.qs) {
                    if (state.find(c.name) === state.find(q)) {
                        inQs = true;
                        break;
                    }
                }
                if (inQs)
                    continue; // 满足
                // 检查 name 是否在 vs 中（确定不满足）
                let inVs = false;
                for (const v of c.vs) {
                    if (state.find(c.name) === state.find(v)) {
                        inVs = true;
                        break;
                    }
                }
                if (inVs)
                    return false; // 因为 inQs 为 false
                // name 不在 vs 中，但不确定是否以后会合并，必须检查是否已经确定不等
                if (state.in(c.name, c.vs) === F3)
                    continue; // 确定满足
                return false; // 不确定
            }
            else if (c.type === 'dt') {
                const arr = Array.from(c.vs);
                for (let i = 0; i < arr.length; i++) {
                    for (let j = i + 1; j < arr.length; j++) {
                        if (state.eq(arr[i], arr[j]) !== F3)
                            return false;
                    }
                }
            }
            else if (c.type === 'ex') {
                const arr = Array.from(c.vs);
                let found = false;
                for (let i = 0; i < arr.length; i++) {
                    for (let j = i + 1; j < arr.length; j++) {
                        if (state.find(arr[i]) === state.find(arr[j])) {
                            found = true;
                            break;
                        }
                    }
                    if (found)
                        break;
                }
                if (!found)
                    return false;
            }
        }
        return true;
    }
    // ---------- 传播 ----------
    static propagate(state, constraints) {
        const newCons = [];
        for (const c of constraints) {
            if (c.type === 'dt') {
                const arr = Array.from(c.vs);
                let ok = true;
                for (let i = 0; i < arr.length; i++) {
                    for (let j = i + 1; j < arr.length; j++) {
                        if (!state.add_neq(arr[i], arr[j])) {
                            ok = false;
                            break;
                        }
                    }
                    if (!ok)
                        break;
                }
                if (!ok)
                    return { state, constraints: [], ok: false };
                continue;
            }
            if (c.type === 'of') {
                const eq0 = state.eq(c.name, '0');
                if (eq0 !== F3)
                    continue; // 恒真
                if (c.qs.size === 0) {
                    return { state, constraints: [], ok: false };
                }
                if (c.qs.size === 1) {
                    const q = Array.from(c.qs)[0];
                    if (!state.union(c.name, q)) {
                        return { state, constraints: [], ok: false };
                    }
                    continue;
                }
                newCons.push(c);
            }
            else if (c.type === 'nf') {
                const eq0 = state.eq(c.name, '0');
                if (c.vs.size === 0 || eq0 !== F3)
                    continue;
                if (c.qs.size === 0 || state.in(c.name, c.qs) === F3) {
                    let ok = true;
                    for (const v of c.vs) {
                        if (!state.add_neq(c.name, v)) {
                            ok = false;
                            break;
                        }
                    }
                    if (!ok)
                        return { state, constraints: [], ok: false };
                    continue;
                }
                newCons.push(c);
            }
            else {
                newCons.push(c);
            }
        }
        return { state, constraints: newCons, ok: true };
    }
    // ---------- DPLL ----------
    static solve(state, constraints) {
        if (!constraints.length)
            return state;
        const prop = this.propagate(state, constraints);
        if (!prop.ok)
            return null;
        state = prop.state;
        constraints = prop.constraints;
        if (this.checkConstraints(state, constraints))
            return state;
        let idx = constraints.findIndex(c => c.type === 'of');
        if (idx === -1)
            idx = constraints.findIndex(c => c.type === 'nf');
        if (idx === -1)
            idx = constraints.findIndex(c => c.type === 'ex');
        if (idx === -1)
            return null;
        const c = constraints[idx];
        const rest = constraints.slice(0, idx).concat(constraints.slice(idx + 1));
        if (c.type === 'of') {
            const ns = state.clone();
            if (ns.union(c.name, '0')) {
                const result = this.solve(ns, rest);
                if (result)
                    return result;
            }
            for (const q of c.qs) {
                const ns = state.clone();
                if (ns.union(c.name, q)) {
                    const result = this.solve(ns, rest);
                    if (result)
                        return result;
                }
            }
            return null;
        }
        else if (c.type === 'nf') {
            const ns = state.clone();
            // 分支0：name is const
            if (ns.union(c.name, '0')) {
                const result = this.solve(ns, rest);
                if (result)
                    return result;
            }
            // 分支1：name notin vs
            const ns1 = state.clone();
            let ok = true;
            for (const v of c.vs) {
                if (!ns1.add_neq(c.name, v)) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                const result = this.solve(ns1, rest);
                if (result)
                    return result;
            }
            // 分支2：name in qs
            for (const q of c.qs) {
                const ns2 = state.clone();
                if (ns2.union(c.name, q)) {
                    const result = this.solve(ns2, rest);
                    if (result)
                        return result;
                }
            }
            return null;
        }
        else if (c.type === 'ex') {
            const arr = Array.from(c.vs);
            for (let i = 0; i < arr.length; i++) {
                for (let j = i + 1; j < arr.length; j++) {
                    const ns = state.clone();
                    if (ns.union(arr[i], arr[j])) {
                        const result = this.solve(ns, rest);
                        if (result)
                            return result;
                    }
                }
            }
            return null;
        }
        return null;
    }
    // ---------- 公共 check ----------
    static check(premises, conclusions) {
        for (const con of conclusions) {
            let constraints = premises.slice();
            const initState = new SolverState();
            let ok = true;
            // 添加条件中变量不是常量的约束
            for (const p of premises) {
                if (p.type === "of" || p.type === "nf") {
                    for (const q of p.qs) {
                        if (!initState.add_neq(q, '0')) {
                            ok = false;
                            break;
                        }
                    }
                }
                if (p.type === "nf" || p.type === "dt" || p.type === "ex") {
                    for (const v of p.vs) {
                        if (!initState.add_neq(v, '0')) {
                            ok = false;
                            break;
                        }
                    }
                }
            }
            // 添加结论否定中要求的不等
            if (con.type === 'of') {
                if (!initState.add_neq(con.name, '0')) {
                    ok = false;
                    break;
                }
                for (const q of con.qs) {
                    if (!initState.add_neq(con.name, q)) {
                        ok = false;
                        break;
                    }
                    if (!initState.add_neq(q, '0')) {
                        ok = false;
                        break;
                    }
                }
            }
            else if (con.type === 'nf') {
                constraints.push({ type: 'of', name: con.name, qs: con.vs });
                if (!initState.add_neq(con.name, '0')) {
                    ok = false;
                    break;
                }
                for (const v of con.vs) {
                    if (!initState.add_neq(v, '0')) {
                        ok = false;
                        break;
                    }
                }
                for (const q of con.qs) {
                    if (!initState.add_neq(q, '0')) {
                        ok = false;
                        break;
                    }
                    if (!initState.add_neq(con.name, q)) {
                        ok = false;
                        break;
                    }
                }
            }
            else if (con.type === 'dt') {
                for (const v of con.vs) {
                    if (!initState.add_neq(v, '0')) {
                        ok = false;
                        break;
                    }
                }
                constraints.push({ type: 'ex', vs: con.vs });
            }
            if (!ok)
                continue;
            const resultState = this.solve(initState, constraints);
            if (resultState) {
                return {
                    passed: false,
                    counterexample: {
                        equalityClasses: resultState.getEqualityClasses(),
                        inequalities: resultState.getInequalities(),
                        failedConclusion: con,
                    },
                };
            }
        }
        return { passed: true };
    }
    // 在 AtomSolver 类中新增一个静态方法（复用现有逻辑）
    static isSatisfiable(constraints) {
        const initState = new SolverState();
        for (const c of constraints) {
            if (c.type === "of" || c.type === "nf") {
                for (const q of c.qs) {
                    if (!initState.add_neq(q, '0')) {
                        return false;
                    }
                }
            }
            if (c.type === "nf" || c.type === "dt" || c.type === "ex") {
                for (const v of c.vs) {
                    if (!initState.add_neq(v, '0')) {
                        return false;
                    }
                }
            }
        }
        const result = AtomSolver.solve(initState, constraints);
        return result !== null;
    }
    static fromAST(ast) {
        if (ast.type !== NodeType.ASSERT)
            throw "This is not an atomic assertion";
        if (ast.name === "nf") {
            return { type: "nf", name: ast.nodes[0].name, vs: new Set(ast.nodes[1].nodes.map(e => e.name)), qs: new Set(ast.nodes[2].nodes.map(e => e.name)) };
        }
        if (ast.name === "of") {
            return { type: "of", name: ast.nodes[0].name, qs: new Set(ast.nodes[1].nodes.map(e => e.name)) };
        }
        if (ast.name === "dt") {
            const vs = new Set(ast.nodes.map(e => e.name));
            if (vs.size !== ast.nodes.length)
                throw FSError.distinctFail();
            return { type: "dt", vs };
        }
        throw "can't reach here";
    }
    static getReplvars(a, res = new Map()) {
        if (a.type === "dt" || a.type === "nf") {
            for (const n of a.vs) {
                if (!n.startsWith("$"))
                    continue;
                const oldIsItem = res.get(n);
                if (oldIsItem !== undefined && oldIsItem !== true) {
                    throw FSError.isItemAndWff(n);
                }
                res.set(n, true);
            }
        }
        if (a.type === "of" || a.type === "nf") {
            for (const n of a.qs) {
                if (!n.startsWith("$"))
                    continue;
                const oldIsItem = res.get(n);
                if (oldIsItem !== undefined && oldIsItem !== true) {
                    throw FSError.isItemAndWff(n);
                }
                res.set(n, true);
            }
        }
        return res;
    }
    static print(a) {
        if (a.type === "dt")
            return `#dt(${Array.from(a.vs).join(" ")})`;
        if (a.type === "nf")
            return `#nf(${a.name},${Array.from(a.vs).join(" ")},${Array.from(a.qs).join(" ")})`.replace(",)", ")");
        if (a.type === "of")
            return `#of(${a.name},${Array.from(a.qs).join(" ")})`.replace(",)", ")");
    }
}
export class Assertion {
    static replaceVarsetByMatchTable(vs, mt) {
        const newVs = new Set();
        for (const v of vs) {
            if (mt[v]) {
                const ast = mt[v];
                ast.checkVAR();
                newVs.add(ast.name);
            }
            else {
                newVs.add(v);
            }
        }
        return newVs;
    }
    static fromAtomic(a) {
        if (a.type === "nf") {
            return new NFAssertion(new AST(NodeType.ATOM_WFF, a.name), new Set(a.vs), new Set(a.qs));
        }
        if (a.type === "of") {
            return new OFAssertion(new AST(NodeType.ATOM_WFF, a.name), new Set(a.qs));
        }
        if (a.type === "dt") {
            return new DTAssertion(new Set(a.vs));
        }
        throw 'unknown atomic constrain';
    }
    static isSetsEqual(setA, setB) {
        if (setA.size !== setB.size)
            return false;
        for (const item of setA) {
            if (!setB.has(item))
                return false;
        }
        return true;
    }
    static check(premises, res) {
        let undetermined = false;
        let a;
        while (a = res.asts.pop()) {
            if ((a instanceof DTAssertion) || a.ast.type !== NodeType.SB)
                throw "can't reach";
            if (a instanceof NFAssertion) {
                // nf #sb(..) {b}UB CU{b} <=> nf #sb(..) B CU{b}
                // nf a B D2  ∧  nf c B D2  ⇒  nf #sb(a,b,c,D1) B D2
                const [body, src, dst, qsNodes] = a.ast.nodes;
                const subres = new NFAssertion(body, a.vs, a.qs).reduce();
                new NFAssertion(dst, a.vs, a.qs).reduce(subres);
                if (this.check(premises, subres).passed)
                    continue;
                // nf c b D2 ∧ D1 ⊆ D2  ⇒  nf #sb(a,b,c,D1) b D2
                if (a.vs.has(src.name)) {
                    // check D1 ⊆ D2
                    const qs = new Set(qsNodes.nodes.map(n => n.name));
                    for (const d1 of qs) {
                        if (!a.qs.has(d1)) {
                            undetermined = true;
                            break;
                        }
                    }
                    if (this.check(premises, new NFAssertion(dst, new Set([src.name]), a.qs).reduce()).passed) {
                        const reducedA = a.clone();
                        reducedA.vs.delete(src.name);
                        res.asts.push(reducedA);
                    }
                }
            }
            if (a instanceof OFAssertion) {
                // of a B  ∧  of c B  ⇒  of #sb(a,b,c,D) B
                const [body, src, dst, qs] = a.ast.nodes;
                const subres = new OFAssertion(body, a.qs).reduce();
                new OFAssertion(dst, a.qs).reduce(subres);
                if (this.check(premises, res).passed)
                    continue;
            }
            undetermined = true;
            break;
        }
        if (undetermined)
            return { passed: false };
        return AtomSolver.check(premises, res.atoms);
    }
    /** this function will modify ast, reduce all #sb fns if it can do that */
    static reduceSbFn(premises, mut_ast) {
        if (mut_ast.type === NodeType.SB) {
            const [body, src, dst, ...qs] = mut_ast.nodes;
            this.reduceSbFn(premises, body);
            this.reduceSbFn(premises, dst);
            this.unwrapSbFn(mut_ast);
            return this.reduceSbFnInside(premises, mut_ast, src.name, dst, new Set(qs.map(q => q.name)));
        }
        if (mut_ast.nodes) {
            for (const n of mut_ast.nodes)
                this.reduceSbFn(premises, n);
        }
    }
    static unwrapSbFn(mut_ast) {
        const sub = mut_ast.nodes[0];
        mut_ast.type = sub.type;
        mut_ast.name = sub.name;
        mut_ast.nodes = sub.nodes;
    }
    static wrapSbFn(mut_ast, src, dst, qs) {
        mut_ast.nodes = [mut_ast.clone(), new AST(NodeType.ATOM_ITEM, src), dst, ...Array.from(qs).map(n => new AST(NodeType.ATOM_ITEM, n))];
        mut_ast.type = NodeType.SB;
        mut_ast.name = "";
    }
    static assign(mut_ast, dst) {
        mut_ast.type = dst.type;
        mut_ast.name = dst.name;
        mut_ast.nodes = dst.nodes.map(e => e.clone());
    }
    static reduceSbFnInside(premises, mut_body, src, dst, qs) {
        const bodyName = mut_body.isAtom();
        // if body = src and src is not bounded by qs, then:
        if (bodyName?.match(/^[\$a-z\#]/) && src === mut_body.name && AtomSolver.check(premises, [{ type: "nf", name: src, vs: qs, qs: new Set }])) {
            const check = Assertion.check(premises, new NFAssertion(dst, qs, new Set).reduce());
            // if dst has variables bounded by qs, then fail and throw error, else #sb(body, src, dst, qs) => dst
            if (check.passed)
                return Assertion.assign(mut_body, dst);
            else
                throw FSError.sbFail(dst, qs, check.counterexample);
        }
        // if body is const or src = dst or #nf body src qs, then #sb(body, src, dst, qs) => body
        if (bodyName?.match(/^([A-Z]|[^\$a-z\#])/) || (dst.type === NodeType.ATOM_ITEM && dst.name === src) ||
            Assertion.check(premises, new NFAssertion(mut_body, new Set([src]), qs).reduce()).passed)
            return; // keep body unwrapped
        if (mut_body.type === NodeType.LOGIC || mut_body.type === NodeType.PRED || mut_body.type === NodeType.FN) {
            for (const n of mut_body.nodes)
                this.reduceSbFnInside(premises, n, src, dst, qs);
            return;
        }
        if (mut_body.type === NodeType.QUANT || mut_body.type === NodeType.CLASS) {
            const nqs = new Set(qs);
            nqs.add(mut_body.nodes[0].name);
            this.reduceSbFnInside(premises, mut_body.nodes[1], src, dst, nqs);
            return;
        }
        // 可移除约束变量集合中替换的源和目标中都不自由出现的变量，即若断言nf b D & nf c D成立，则#sb(a,b,c,E) <=> #sb(a,b,c,E\D)
        qs = new Set(qs);
        for (const q of qs) {
            const singleton = new Set([q]);
            const res = {
                atoms: [{ type: "nf", name: src, vs: singleton, qs: new Set }], asts: []
            };
            const check = Assertion.check(premises, new NFAssertion(dst, singleton, new Set).reduce(res));
            if (check.passed) {
                qs.delete(q);
            }
        }
        if (mut_body.type === NodeType.SB) {
            const [innerBody, innerSrcNode, innerDstNode, ...innerQsNodes] = mut_body.nodes;
            // const innerSrc = innerSrcNode.name;
            // const innerQs = new Set(innerQsNodes.map(n => n.name));
            // 连续替换规则：如果外层 src 不在 innerBody 中自由出现（或受外层 qs 保护）
            const nfCheck = Assertion.check(premises, new NFAssertion(innerBody, new Set([src]), qs).reduce());
            if (nfCheck.passed) {
                // innerDst in mut_body -> #sb(innerDst, src, dst, qs)
                this.reduceSbFnInside(premises, innerDstNode, src, dst, qs);
                // return mut_body := #sb(innerBody, innerSrc, #sb(innerDst, src, dst, qs), innerQs)
                return;
            }
        }
        // if we cannot determine, keep the #sb function as is
        this.wrapSbFn(mut_body, src, dst, qs);
    }
}
export class NFAssertion extends Assertion {
    ast;
    vs;
    qs;
    constructor(ast, vs, qs) {
        super();
        this.ast = ast;
        this.vs = vs;
        this.qs = qs;
    }
    clone() {
        return new NFAssertion(this.ast.clone(), new Set(this.vs), new Set(this.qs));
    }
    mut_replaceByMatchTable(mt) {
        this.ast.mut_replaceByMatchTable(mt);
        this.vs = Assertion.replaceVarsetByMatchTable(this.vs, mt);
        this.qs = Assertion.replaceVarsetByMatchTable(this.qs, mt);
        return this;
    }
    reduce(res = { asts: [], atoms: [] }) {
        let astName;
        if (astName = this.ast.isAtom()) {
            if (astName.match(/^[A-Z]/))
                return res; // normal atom wff
            if (astName.match(/^[^\$\#a-z]/))
                return res; // constant
            res.atoms.push({ type: "nf", name: astName, vs: this.vs, qs: this.qs }); // atom assertion
            return res;
        }
        if (this.ast.type === NodeType.LOGIC || this.ast.type === NodeType.PRED || this.ast.type === NodeType.FN) {
            for (const n of this.ast.nodes) {
                new NFAssertion(n, this.vs, this.qs).reduce(res);
            }
            return res;
        }
        if (this.ast.type === NodeType.QUANT || this.ast.type === NodeType.CLASS) {
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[0].name);
            new NFAssertion(this.ast.nodes[1], this.vs, nqs).reduce(res);
            return res;
        }
        if (this.ast.type === NodeType.BOUNDED_QUANT) {
            new NFAssertion(this.ast.nodes[1], this.vs, this.qs).reduce(res);
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[0].name);
            new NFAssertion(this.ast.nodes[2], this.vs, nqs).reduce(res);
            return res;
        }
        if (this.ast.type === NodeType.SEP) {
            new NFAssertion(this.ast.nodes[1], this.vs, this.qs).reduce(res);
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[0].name);
            new NFAssertion(this.ast.nodes[2], this.vs, nqs).reduce(res);
            return res;
        }
        if (this.ast.type === NodeType.RPL) {
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[1].name);
            new NFAssertion(this.ast.nodes[0], this.vs, nqs).reduce(res);
            new NFAssertion(this.ast.nodes[2], this.vs, this.qs).reduce(res);
            return res;
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
    ast;
    qs;
    constructor(ast, qs) {
        super();
        this.ast = ast;
        this.qs = qs;
    }
    clone() {
        return new OFAssertion(this.ast.clone(), new Set(this.qs));
    }
    mut_replaceByMatchTable(mt) {
        this.ast.mut_replaceByMatchTable(mt);
        this.qs = Assertion.replaceVarsetByMatchTable(this.qs, mt);
        return this;
    }
    reduce(res = { asts: [], atoms: [] }) {
        let astName;
        if (astName = this.ast.isAtom()) {
            if (astName.match(/^[A-Z]/))
                return res; // normal atom wff
            if (astName.match(/^[^\$\#a-z]/))
                return res; // constant
            res.atoms.push({ type: "of", name: astName, qs: this.qs }); // atom assertion
            return res;
        }
        if (this.ast.type === NodeType.LOGIC || this.ast.type === NodeType.PRED || this.ast.type === NodeType.FN) {
            for (const n of this.ast.nodes) {
                new OFAssertion(n, this.qs).reduce(res);
            }
            return res;
        }
        if (this.ast.type === NodeType.QUANT || this.ast.type === NodeType.CLASS) {
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[0].name);
            new OFAssertion(this.ast.nodes[1], nqs).reduce(res);
            return res;
        }
        if (this.ast.type === NodeType.BOUNDED_QUANT) {
            new OFAssertion(this.ast.nodes[1], this.qs).reduce(res);
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[0].name);
            new OFAssertion(this.ast.nodes[2], nqs).reduce(res);
            return res;
        }
        if (this.ast.type === NodeType.SEP) {
            new OFAssertion(this.ast.nodes[1], this.qs).reduce(res);
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[0].name);
            new OFAssertion(this.ast.nodes[2], nqs).reduce(res);
            return res;
        }
        if (this.ast.type === NodeType.RPL) {
            const nqs = new Set(this.qs);
            nqs.add(this.ast.nodes[1].name);
            new OFAssertion(this.ast.nodes[0], nqs).reduce(res);
            new OFAssertion(this.ast.nodes[2], this.qs).reduce(res);
            return res;
        }
        if (this.ast.type === NodeType.SB) {
            res.asts.push(this);
            return res;
        }
        throw "can't reach";
    }
}
export class DTAssertion extends Assertion {
    vs;
    constructor(vs) {
        super();
        this.vs = vs;
    }
    clone() {
        return new DTAssertion(new Set(this.vs));
    }
    mut_replaceByMatchTable(mt) {
        const length = this.vs.size;
        this.vs = Assertion.replaceVarsetByMatchTable(this.vs, mt);
        if (this.vs.size !== length)
            throw FSError.distinctFail();
        return this;
    }
    reduce(res = { asts: [], atoms: [] }) {
        res.atoms.push({ type: "dt", vs: this.vs });
        return res;
    }
}
//# sourceMappingURL=assertsolver.js.map