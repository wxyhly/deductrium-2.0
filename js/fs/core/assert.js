// import { AST, MatchTable, NodeType } from "./ast.js";
// import { and3, F, not3, or3, T, U } from "./bool3.js";
// import { FSError } from "./error.js";
// ==================== 状态管理 ====================
class SolverState {
    parent = new Map();
    neq = new Map(); // 改为 public，以便外部读取
    static isNormal(name) {
        return !name.startsWith('$');
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
    union(a, b) {
        let ra = this.find(a);
        let rb = this.find(b);
        if (ra === rb)
            return true;
        if (this.neq.get(ra)?.has(rb) || this.neq.get(rb)?.has(ra))
            return false;
        if (SolverState.isNormal(ra) && SolverState.isNormal(rb))
            return false;
        this.parent.set(rb, ra);
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
    // 提取等价类（所有变量分组）
    getEqualityClasses() {
        const rootToVars = new Map();
        // 收集所有已出现的变量
        const allVars = new Set([...this.parent.keys()]);
        for (const v of allVars) {
            const r = this.find(v);
            if (!rootToVars.has(r))
                rootToVars.set(r, []);
            rootToVars.get(r).push(v);
        }
        return Array.from(rootToVars.values());
    }
    // 提取所有不等对（去重）
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
// ==================== 约束满足检查 ====================
function checkConstraints(state, constraints) {
    for (const c of constraints) {
        if (c.type === 'of') {
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
            if (c.vs.size === 0)
                continue;
            let inVs = false;
            for (const v of c.vs) {
                if (state.find(c.name) === state.find(v)) {
                    inVs = true;
                    break;
                }
            }
            if (!inVs)
                continue;
            let inQs = false;
            for (const q of c.qs) {
                if (state.find(c.name) === state.find(q)) {
                    inQs = true;
                    break;
                }
            }
            if (!inQs)
                return false;
        }
        else if (c.type === 'dt') {
            const arr = Array.from(c.vs);
            for (let i = 0; i < arr.length; i++) {
                for (let j = i + 1; j < arr.length; j++) {
                    const ri = state.find(arr[i]);
                    const rj = state.find(arr[j]);
                    if (ri === rj)
                        return false;
                    if (!(state.neq.get(ri)?.has(rj) || state.neq.get(rj)?.has(ri))) {
                        return false;
                    }
                }
            }
        }
        else if (c.type === 'exists_eq') {
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
// ==================== 确定性传播 ====================
function propagate(state, constraints) {
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
            if (c.vs.size === 0) {
                continue;
            }
            if (c.qs.size === 0) {
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
// ==================== DPLL 求解器（返回满足状态或 null） ====================
function solve(state, constraints) {
    const prop = propagate(state, constraints);
    if (!prop.ok)
        return null;
    state = prop.state;
    constraints = prop.constraints;
    if (checkConstraints(state, constraints))
        return state;
    let idx = constraints.findIndex(c => c.type === 'of');
    if (idx === -1)
        idx = constraints.findIndex(c => c.type === 'nf');
    if (idx === -1)
        idx = constraints.findIndex(c => c.type === 'exists_eq');
    if (idx === -1)
        return null;
    const c = constraints[idx];
    const rest = constraints.slice(0, idx).concat(constraints.slice(idx + 1));
    if (c.type === 'of') {
        for (const q of c.qs) {
            const ns = state.clone();
            if (ns.union(c.name, q)) {
                const result = solve(ns, rest);
                if (result)
                    return result;
            }
        }
        return null;
    }
    else if (c.type === 'nf') {
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
            const result = solve(ns1, rest);
            if (result)
                return result;
        }
        // 分支2：name in qs
        for (const q of c.qs) {
            const ns2 = state.clone();
            if (ns2.union(c.name, q)) {
                const result = solve(ns2, rest);
                if (result)
                    return result;
            }
        }
        return null;
    }
    else if (c.type === 'exists_eq') {
        const arr = Array.from(c.vs);
        for (let i = 0; i < arr.length; i++) {
            for (let j = i + 1; j < arr.length; j++) {
                const ns = state.clone();
                if (ns.union(arr[i], arr[j])) {
                    const result = solve(ns, rest);
                    if (result)
                        return result;
                }
            }
        }
        return null;
    }
    return null;
}
// ==================== 主检查函数 ====================
export function check(premises, conclusions) {
    // 收集所有变量
    const allVars = new Set();
    const gather = (c) => {
        if (c.type === 'of') {
            allVars.add(c.name);
            for (const q of c.qs)
                allVars.add(q);
        }
        else if (c.type === 'nf') {
            allVars.add(c.name);
            for (const v of c.vs)
                allVars.add(v);
            for (const q of c.qs)
                allVars.add(q);
        }
        else if (c.type === 'dt' || c.type === 'exists_eq') {
            for (const v of c.vs)
                allVars.add(v);
        }
    };
    for (const p of premises)
        gather(p);
    for (const con of conclusions)
        gather(con);
    const normalVars = Array.from(allVars).filter(v => !v.startsWith('$'));
    for (const con of conclusions) {
        let constraints = premises.slice();
        if (con.type === 'of') {
            // 否定：name 与 qs 中所有变量不等
        }
        else if (con.type === 'nf') {
            constraints.push({ type: 'of', name: con.name, qs: con.vs });
        }
        else if (con.type === 'dt') {
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
            if (!ok)
                break;
        }
        if (!ok)
            continue;
        // 添加结论否定中要求的不等
        if (con.type === 'of') {
            for (const q of con.qs) {
                if (!initState.add_neq(con.name, q)) {
                    ok = false;
                    break;
                }
            }
        }
        else if (con.type === 'nf') {
            for (const q of con.qs) {
                if (!initState.add_neq(con.name, q)) {
                    ok = false;
                    break;
                }
            }
        }
        if (!ok)
            continue;
        const resultState = solve(initState, constraints);
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
export function test() {
    function parse(str) {
        const k = str.trim().split(" ");
        return {
            type: k[0], name: k[1],
            vs: k[0] === "nf" ? new Set(k[2]?.split(",")) : k[0] === 'dt' ? new Set(k[1]?.split(",")) : undefined,
            qs: k[0] === "nf" ? new Set(k[3]?.split(",")) : new Set(k[2]?.split(","))
        };
    }
    function p(cond, conc, expect) {
        const v = check(cond.split("&").map(parse), conc.split("&").map(parse));
        console.log(v.passed === expect ? "[ok] " : "[no] ", cond, "=>", conc, " : ", v.passed, v.counterexample); // true
    }
    p("nf e f", "nf a $b", false);
    p("nf a b", "nf a b c", true);
    p("nf $a $b", "nf $a $b $c", true);
    p("nf $a $b", "nf $a $c", false);
    p("nf $a $b $b", "nf $a $b", false);
    p("nf $a $b,$c", "nf $a $d $a", true);
    p("nf $a $d $a", "nf $a $b,$c", false);
    p("nf $a $b & nf $a $c", "nf $a $b,$c", true);
    p("nf $a $b,$c", "nf $a $b & nf $a $c", true);
    p("of $a $b,$c", "nf $a $b", false);
    p("of $a", "nf $a $b", true);
    p("dt $1,$2", "nf $1 $2", true);
    p("nf $1 $2", "dt $1,$2", true);
    p("nf $1 $2", "nf $2 $1", true);
    p("nf $1 $2 & nf $1 $3 $2", "nf $3 $1", true);
    p("dt $1,$2 & dt $3,$4 & nf $2 $3 $4", "nf $3 $1 $4", false);
    p("nf $f $1,$2,$3,$4,$5,$6,$7,$8 & nf $a $b & nf $a $c", "nf $f $3 $9", true);
}
//# sourceMappingURL=assert.js.map