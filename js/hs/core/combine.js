import { NodeType } from "../../asttype.js";
import { Assertion, AtomSolver, NFAssertion } from "./assert.js";
import { AST } from "./ast.js";
import { Deduction } from "./deduction.js";
import { HSError } from "./error.js";
// 组合元定理的匹配思路：先把条件和结论所有变量重命名，令条件的结论跟结论的条件相等，用solveConstrain解算变量约束关系
// 通过matchEq找到变量应该等于的表达式，得到一堆可能矛盾的变量约束集(MatchTable)。下面求解约束：
//     :处理循环与不一致
//     若变量等于的式子相同，丢弃一条
//     若变量等于不同的变量，丢弃这条，把右边的变量全部换成该变量
//     若变量等于的式子不同（此时都是表达式），则继续通过matchEq加入表达式相等的约束，并删除后来的式子，重新回到:处理循环与不一致（设置个迭代深度）
//     :生成替换顺序表
//     找到一个只在等式左边出现的变量，若找不到，报错（不允许出现无穷循环替换）
//     找到后，把其它条中所有的该变量用这条公式替换，把这条约束放入最终的replaceTable
//     若所有约束都放入了最终的replaceTable，结束，否则继续:生成替换顺序表
export class RuleCombiner {
    matchEq(a, b, matchTable, constrains) {
        if (a.isReplvar()) {
            if (!matchTable[a.name]) {
                matchTable[a.name] = b;
            }
            else if (!matchTable[a.name].equal(b)) {
                constrains.push([matchTable[a.name], b]);
            }
            return true;
        }
        if (b.isReplvar()) {
            if (!matchTable[b.name]) {
                matchTable[b.name] = a;
            }
            else if (!matchTable[b.name].equal(a)) {
                constrains.push([matchTable[b.name], a]);
            }
            return true;
        }
        if (a.type !== b.type)
            return false;
        if (a.name !== b.name)
            return false;
        if (a.nodes.length !== b.nodes.length)
            return false;
        for (let i = 0; i < a.nodes.length; i++) {
            const res = this.matchEq(a.nodes[i], b.nodes[i], matchTable, constrains);
            if (res === false)
                return false;
        }
        return true;
    }
    solveConstrain(constrains) {
        const matchTable = {};
        let depth = 0;
        while (constrains.length > 0) {
            if (depth++ > 64)
                throw HSError.combineCyclic;
            const [left, right] = constrains.shift();
            if (left.equal(right)) {
                // 丢弃
                continue;
            }
            else {
                // 都是表达式，则继续加入表达式相等的约束
                const res = this.matchEq(left, right, matchTable, constrains);
                if (res === false)
                    throw HSError.combineInconsist;
            }
        }
        return matchTable;
    }
    // 反复应用matchTable直到稳定（matchTable的值中可能仍含其它键，链式替换需要多轮），返回替换后的克隆
    applyMatchTable(ast, mt) {
        ast = ast.clone();
        // 预处理：mt 中"变量→另一个replvar"的别名逐条就地替换（替换到 ast 与 mt 的其余值中）
        // 后丢弃该条。这样链式/循环别名（如 $1→$2→$3→$1）被逐步消解为同一变量，
        // 否则固定点迭代可能不收敛报 combineCyclic（如 .<>(.ne,.ni)）。
        mt = Object.assign({}, mt);
        let guard = 0;
        while (guard++ < 64) {
            let aliasKey = null;
            let aliasVal = null;
            for (const [k, v] of Object.entries(mt)) {
                const rv = v.isReplvar();
                if (rv && rv !== k) {
                    aliasKey = k;
                    aliasVal = new AST(v.type === NodeType.ATOM_ITEM ? NodeType.ATOM_ITEM : NodeType.ATOM_WFF, rv);
                    break;
                }
            }
            if (aliasKey === null)
                break;
            ast.mut_replaceByMatchTable({ [aliasKey]: aliasVal });
            for (const key of Object.keys(mt)) {
                if (mt[key])
                    mt[key] = mt[key].clone().mut_replaceByMatchTable({ [aliasKey]: aliasVal });
            }
            delete mt[aliasKey];
        }
        let guard2 = 0;
        while (guard2++ < 64) {
            const snapshot = ast.toString();
            ast.mut_replaceByMatchTable(mt);
            if (ast.toString() === snapshot)
                break;
        }
        if (guard2 > 64)
            throw HSError.combineCyclic;
        return ast;
    }
}
export const assertToAST = (a) => {
    if (a.type === "nf") {
        return new AST(NodeType.ASSERT, "nf", new AST(NodeType.ATOM_UKNOWN, a.name), new AST(NodeType.FN, " ", ...[...a.vs].map(v => new AST(NodeType.ATOM_ITEM, v))), new AST(NodeType.FN, " ", ...[...a.qs].map(v => new AST(NodeType.ATOM_ITEM, v))));
    }
    if (a.type === "of") {
        return new AST(NodeType.ASSERT, "of", new AST(NodeType.ATOM_UKNOWN, a.name), new AST(NodeType.FN, " ", ...[...a.qs].map(v => new AST(NodeType.ATOM_ITEM, v))));
    }
    return new AST(NodeType.ASSERT, "dt", ...[...a.vs].map(v => new AST(NodeType.ATOM_ITEM, v)));
};
// ==================== c/v 元规则 step 生成 ====================
// name==="c"/"v" 包装的规则（如 c:mp、c:.t、v:mp）：生成 step，使肢解可用。
// 生成失败（如缺系统规则）返回 undefined（保持无 step，视为原子/公理）。
// c: 条件/结论前加 $c→；v: 加 ∀$v:。step 中变量名保持 d 的原名（c/v 是包装不改变量名）。
const mkVar = (name, isItem = false) => new AST(isItem ? NodeType.ATOM_ITEM : NodeType.ATOM_WFF, name);
const defaultRV = (d) => {
    const rv = {};
    for (const [name, isItem] of d.replaceNames)
        rv[name] = mkVar(name, isItem);
    return rv;
};
// 生成 c:d 的 step（条件前缀 $c→）
export function genConditionStep(host, d, c) {
    const isMp = d.name.type === NodeType.ATOM_DNAME && d.name.name === "mp";
    const saved = host.saveContext();
    host.loadContext(host.createEmptyContext());
    try {
        host.clear();
        // 断言直接复制
        for (const a of d.assertions) {
            try {
                host.hyp(assertToAST(a));
            }
            catch (e) {
                if (e?.type === "assertNeverFail")
                    continue;
                throw e;
            }
        }
        if (isMp) {
            // 写死 cmp：hyp $c→($1→$2); hyp $c→$1; d a2 $c $1 $2; d mp 3 1; d mp 4 2
            const h1 = host.hyp(new AST(NodeType.LOGIC, ">", c.clone(), new AST(NodeType.LOGIC, ">", mkVar("$1"), mkVar("$2"))));
            const h2 = host.hyp(new AST(NodeType.LOGIC, ">", c.clone(), mkVar("$1")));
            const a2p = host.d(host.getD(new AST(NodeType.ATOM_DNAME, "a2")), [], { $1: c.clone(), $2: mkVar("$1"), $3: mkVar("$2") });
            const m1 = host.d(host.getD(new AST(NodeType.ATOM_DNAME, "mp")), [a2p, h1], {});
            host.d(host.getD(new AST(NodeType.ATOM_DNAME, "mp")), [m1, h2], {});
        }
        else if (!d.conditions.length) {
            // 公理/无假设：d 默认rv → <a1 加条件
            const d1 = host.d(d, [], defaultRV(d));
            const lt = host.getD(new AST(NodeType.NODE_DNAME, "<", new AST(NodeType.ATOM_DNAME, "a1")));
            host.d(lt, [d1], { [lt.replaceNames[0][0]]: c.clone() });
        }
        else {
            // 有假设：hyp $c→ci; cond $c; mp 各($c→ci)与$c → ci; d d 推理
            const condHyps = d.conditions.map(cc => host.hyp(new AST(NodeType.LOGIC, ">", c.clone(), cc.clone())));
            const cf = host.c(c.clone());
            const cis = condHyps.map(h => host.d(host.getD(new AST(NodeType.ATOM_DNAME, "mp")), [h, cf], {}));
            host.d(d, cis, defaultRV(d));
        }
        const steps = host.props.slice(0);
        host.loadContext(saved);
        return steps;
    }
    catch (e) {
        host.loadContext(saved);
        return undefined;
    }
}
// 生成 v:d 的 step（量词前缀 ∀$v:）
export function genQuantStep(host, d, v) {
    const isMp = d.name.type === NodeType.ATOM_DNAME && d.name.name === "mp";
    const saved = host.saveContext();
    host.loadContext(host.createEmptyContext());
    try {
        host.clear();
        for (const a of d.assertions) {
            try {
                host.hyp(assertToAST(a));
            }
            catch (e) {
                if (e?.type === "assertNeverFail")
                    continue;
                throw e;
            }
        }
        if (isMp) {
            // 写死 vmp：hyp ∀$v:($1→$2); hyp ∀$v:$1; d a5 $v $1 $2; d mp 3 1; d mp 4 2
            const q1 = host.hyp(new AST(NodeType.QUANT, "\\a", v.clone(), new AST(NodeType.LOGIC, ">", mkVar("$1"), mkVar("$2"))));
            const q2 = host.hyp(new AST(NodeType.QUANT, "\\a", v.clone(), mkVar("$1")));
            const a5p = host.d(host.getD(new AST(NodeType.ATOM_DNAME, "a5")), [], { $x: v.clone(), $1: mkVar("$1"), $2: mkVar("$2") });
            const m1 = host.d(host.getD(new AST(NodeType.ATOM_DNAME, "mp")), [a5p, q1], {});
            host.d(host.getD(new AST(NodeType.ATOM_DNAME, "mp")), [m1, q2], {});
        }
        else if (!d.conditions.length) {
            // 无条件规则加 v：
            // - 公理（没有 step 的一般 d 规则）：不允许肢解（公理加 v 还是公理）
            // - 非公理（.i/.<>i/.ne 等有 step）：把原规则 step 包进 var 文件夹，
            //   重放后结论自然 wrap 成 ∀$v:conclusion
            if (!d.step?.length) {
                host.loadContext(saved);
                return undefined;
            }
            host.v(v.clone());
            host.replaySteps(d.step);
        }
        else {
            // 有假设：hyp ∀$v:ci; var $v; <a4 去量词 → ci; d d 推理
            const qhyps = d.conditions.map(cc => host.hyp(new AST(NodeType.QUANT, "\\a", v.clone(), cc.clone())));
            const vf = host.v(v.clone());
            const la4 = host.getD(new AST(NodeType.NODE_DNAME, "<", new AST(NodeType.ATOM_DNAME, "a4")));
            const a4rvName = la4.replaceNames[0]?.[0];
            const cis = qhyps.map(h => host.d(la4, [h], a4rvName ? { [a4rvName]: v.clone() } : {}));
            host.d(d, cis, defaultRV(d));
        }
        const steps = host.props.slice(0);
        host.loadContext(saved);
        return steps;
    }
    catch (e) {
        host.loadContext(saved);
        return undefined;
    }
}
// 生成 u:d 的 step（只给结论加全称量词 ∀$v:，条件保持原样）
// 与 v:d 的区别：u 的条件不加量词，但要求条件中的 replvar 都不自由出现 $v，
// 因此新增 nf 断言（#nf(条件中每个replvar, $v)）。步骤生成：
//   对每个条件用 <a6（#nf($,$x),$⊢∀$x:$）加上量词（断言检查自动通过），
//   再应用 v:d 得到 ∀$v:conclusion。注意不使用 v:d(<a6,<a6) 组合规则——
//   组合会对变量 fresh 重命名，破坏原规则变量名；这里直接生成 <a6 步骤 + d v:d。
export function genUnivStep(host, a, d, v) {
    const saved = host.saveContext();
    host.loadContext(host.createEmptyContext());
    try {
        host.clear();
        // 原规则断言直接复制
        for (const a of d.assertions) {
            try {
                host.hyp(assertToAST(a));
            }
            catch (e) {
                if (e?.type === "assertNeverFail")
                    continue;
                throw e;
            }
        }
        // // 新增 nf 断言：每个条件中不自由出现v。
        // let asssertRes = { asts: [] as Assertion[], atoms: [] as AtomicAssertion[] };
        // for (const cc of d.conditions) {
        //     new NFAssertion(cc, new Set([v.name]), new Set()).reduce(asssertRes);
        // }
        // if (asssertRes.asts.length) throw "can't reach";
        for (const atom of a)
            try {
                host.hyp(assertToAST(atom));
            }
            catch (e) {
                if (e?.type === "assertNeverFail")
                    continue;
                throw e;
            }
        // 条件 hyp（保持原样）
        const condHyps = d.conditions.map(cc => host.hyp(cc.clone()));
        // <a6 加量词：d <a6 <条件idx> <$v> → ∀$v:ci（断言 #nf(ci,$v) 由上下文 nf 断言蕴含）
        const la6 = host.getD(new AST(NodeType.NODE_DNAME, "<", new AST(NodeType.ATOM_DNAME, "a6")));
        const a6rvName = la6.replaceNames[0]?.[0];
        const qcis = condHyps.map(h => host.d(la6, [h], a6rvName ? { [a6rvName]: v.clone() } : {}));
        // 应用 v:d（动态生成；其量词变量名可能与 v 不同，条件匹配会绑定到 v）
        const vD = host.getD(new AST(NodeType.NODE_DNAME, "v", d.name.clone()));
        host.d(vD, qcis, {});
        const steps = host.props.slice(0);
        host.loadContext(saved);
        return steps;
    }
    catch (e) {
        host.loadContext(saved);
        return undefined;
    }
}
export function combineRules(host, dname) {
    const combiner = new RuleCombiner();
    try {
        if (!dname.nodes.length)
            throw HSError.combineNoFn;
        const fn = host.getD(dname.nodes[0]);
        // 参数不足用#补足（与旧版"参数少于条件时补#"一致）
        const args = dname.nodes.slice(1);
        while (fn.conditions.length > args.length)
            args.push(new AST(NodeType.ATOM_DNAME, "#"));
        if (args.length > fn.conditions.length)
            throw HSError.combineArgCount;
        const argDs = args.map(a => (a.type === NodeType.ATOM_DNAME && a.name === "#") ? null : host.getD(a));
        // ---- 1. 元变量重命名：每个子规则独立分配新名字，避免相互冲突 ----
        // 注意：只跟踪“已分配的新名”，不要把原始名（$1/$2等）也放进去占槽位——
        // 原始名在各自规则重命名后即消失，若占用会让后续编号跳跃（如 a1 的 $1/$2
        // 导致后面的新名被迫从 $3 开始）。已分配新名全局唯一即可保证约束求解正确。
        const assigned = new Set();
        const makeFresh = (isItem) => {
            const name = Deduction.freshReplName(assigned, isItem);
            assigned.add(name);
            return name;
        };
        // tables[k][原名] = 新名节点；k=0为函数规则，k=1..n为参数规则
        const tables = [fn, ...argDs].map(() => ({}));
        const renameAst = (ast, k) => {
            const res = ast.clone();
            const walk = (n) => {
                const rv = n.isReplvar();
                if (rv) {
                    if (!tables[k][rv]) {
                        tables[k][rv] = new AST(n.type === NodeType.ATOM_ITEM ? NodeType.ATOM_ITEM : NodeType.ATOM_WFF, makeFresh(n.type === NodeType.ATOM_ITEM));
                    }
                    n.name = tables[k][rv].name;
                    return;
                }
                n.nodes.forEach(walk);
            };
            walk(res);
            return res;
        };
        const fnConds = fn.conditions.map(c => renameAst(c, 0));
        const fnConc = renameAst(fn.conclusion, 0);
        const argConds = argDs.map((d, i) => d ? d.conditions.map(c => renameAst(c, i + 1)) : null);
        const argConcs = argDs.map((d, i) => d ? renameAst(d.conclusion, i + 1) : null);
        // ---- 2. 求解约束：参数规则的结论 == 函数规则的对应条件 ----
        const constrains = [];
        for (let i = 0; i < args.length; i++) {
            if (argDs[i])
                constrains.push([argConcs[i], fnConds[i]]);
        }
        const mt = combiner.solveConstrain(constrains);
        const applyMT = (ast) => combiner.applyMatchTable(ast, mt);
        const fnConds2 = fnConds.map(applyMT);
        const fnConc2 = applyMT(fnConc);
        const argConds2 = argConds.map(c => c ? c.map(applyMT) : null);
        const argConcs2 = argConcs.map(c => c ? applyMT(c) : null);
        // ---- 3. 组合规则的模板：条件 = 各参数规则的条件 + "#"位置保留的函数规则条件；结论 = 函数规则的结论 ----
        const conditions = [];
        for (let i = 0; i < args.length; i++) {
            if (argDs[i])
                conditions.push(...argConds2[i]);
            else
                conditions.push(fnConds2[i]);
        }
        const conclusion = fnConc2;
        const dependence = new Set();
        [fn, ...argDs].forEach(d => { if (!d)
            return; d.dependence.forEach(x => dependence.add(x)); });
        // 断言：各子规则的断言用 fromAtomic 转成非原子断言对象（nf/of/dt 自带
        // mut_replaceByMatchTable），经重命名+mt 后 reduce：
        //   reduce 结果的 atoms 就是要添加的原子断言假设，逐个用 AtomSolver.check
        //   检查是否已被前面断言蕴含（冗余则跳过，同 addP 的 assertNeverFail 逻辑）；
        //   若 asts 非空说明含无法化简的断言（如#sb），此时才报错不处理
        const assertions = [];
        [fn, ...argDs].forEach((d, k) => {
            if (!d)
                return;
            for (const a of d.assertions) {
                const ass = Assertion.fromAtomic(a);
                // 该断言用到的变量：收集后分配新鲜名并应用mt，得到最终名
                const names = new Set();
                if (a.type !== "dt")
                    names.add(a.name);
                if (a.type === "nf" || a.type === "of")
                    a.qs.forEach(n => names.add(n));
                if (a.type === "nf" || a.type === "dt")
                    a.vs.forEach(n => names.add(n));
                const renameMT = {};
                for (const n of names) {
                    if (!tables[k][n])
                        tables[k][n] = new AST(NodeType.ATOM_UKNOWN, makeFresh(false));
                    renameMT[n] = applyMT(tables[k][n].clone());
                }
                ass.mut_replaceByMatchTable(renameMT);
                const res = ass.reduce();
                if (res.asts.length)
                    throw HSError.combineIrreducible;
                for (const atom of res.atoms) {
                    if (atom.type === "ex")
                        throw HSError.combineEx;
                    if (AtomSolver.check(assertions, [atom]).passed)
                        continue; // 冗余断言跳过
                    assertions.push(atom);
                }
            }
        });
        // ---- 4. 模拟执行生成step：只有成功推出结论才生成最终的Deduction ----
        // 注意：saveContext保存的是props数组引用，clear()会原地清空该数组，
        // 因此模拟时先切换到全新的空context，结束再恢复，避免破坏调用方状态
        const saved = host.saveContext();
        host.loadContext(host.createEmptyContext());
        try {
            host.clear();
            // 添加断言（重命名后），冗余断言跳过
            for (const a of assertions) {
                try {
                    host.hyp(assertToAST(a));
                }
                catch (e) {
                    if (e?.type === "assertNeverFail")
                        continue;
                    throw e;
                }
            }
            // 添加条件hyp
            const hyps = [];
            for (let i = 0; i < args.length; i++) {
                if (argDs[i])
                    hyps.push(argConds2[i].map(c => host.hyp(c.clone())));
                else
                    hyps.push([host.hyp(fnConds2[i].clone())]);
            }
            // 应用各参数规则得到结论
            const pcs = [];
            for (let i = 0; i < args.length; i++) {
                if (!argDs[i]) {
                    pcs.push(hyps[i][0]);
                    continue;
                }
                const rv = {};
                for (const [name] of argDs[i].replaceNames) {
                    const fresh = tables[i + 1][name];
                    rv[name] = fresh ? applyMT(fresh.clone()) : new AST(NodeType.ATOM_WFF, name);
                }
                pcs.push(host.d(argDs[i], hyps[i], rv));
            }
            // 应用函数规则
            const rvFn = {};
            for (const [name] of fn.replaceNames) {
                const fresh = tables[0][name];
                rvFn[name] = fresh ? applyMT(fresh.clone()) : new AST(NodeType.ATOM_WFF, name);
            }
            const finalP = host.d(fn, pcs, rvFn);
            if (!finalP.ast.equal(conclusion))
                throw HSError.combineConclusionMismatch;
            const steps = host.props.slice(0);
            host.loadContext(saved);
            // nameMap：fn规则replaceNames原名 -> 组合后最终表达式，供外部把原rv键映射到组合后变量名
            const nameMap = {};
            for (const [name] of fn.replaceNames) {
                const fresh = tables[0][name];
                if (fresh)
                    nameMap[name] = applyMT(fresh.clone());
            }
            // ---- 5. 组合结果元变量重编号 ----
            // fn 的变量可能被约束替换消除（如 <<.<>2(d/\) 中 fn 的 $0/$1 被 mt 换成具体
            // 表达式），导致最终规则出现编号空洞（¬($2→¬$3)⊢$2∧$3）。按出现顺序
            // （条件→结论→断言→步骤）把元变量重排为 $1..（wff）/$a..（item），
            // 与手写规则（mp:ax: $1→$2,$1⊢$2）的编号习惯一致。
            const renumMT = {};
            const usedNames = new Set();
            const allocRenum = (isItem) => {
                if (!isItem) {
                    let i = 1;
                    while (usedNames.has("$" + i))
                        i++;
                    usedNames.add("$" + i);
                    return "$" + i;
                }
                // 字典序：$a..$z, 然后$aa..$zz，再$aaa...（与 Deduction.freshReplName 一致）
                for (let len = 1;; len++) {
                    const arr = new Array(len).fill('a'.charCodeAt(0));
                    while (true) {
                        const name = "$" + arr.map(c => String.fromCharCode(c)).join("");
                        if (!usedNames.has(name)) {
                            usedNames.add(name);
                            return name;
                        }
                        let i = len - 1;
                        while (i >= 0) {
                            if (arr[i] < 'z'.charCodeAt(0)) {
                                arr[i]++;
                                break;
                            }
                            arr[i] = 'a'.charCodeAt(0);
                            i--;
                        }
                        if (i < 0)
                            break;
                    }
                }
            };
            const walkRenum = (ast) => {
                const rv = ast.isReplvar();
                if (rv) {
                    if (!renumMT[rv]) {
                        const isItem = ast.type === NodeType.ATOM_ITEM;
                        renumMT[rv] = new AST(isItem ? NodeType.ATOM_ITEM : NodeType.ATOM_WFF, allocRenum(isItem));
                    }
                    return;
                }
                ast.nodes.forEach(walkRenum);
            };
            for (const c of conditions)
                walkRenum(c);
            walkRenum(conclusion);
            for (const a of assertions) {
                if (a.type !== "dt") {
                    const nm = a.name;
                    if (nm.startsWith("$") && !renumMT[nm])
                        renumMT[nm] = new AST(NodeType.ATOM_WFF, allocRenum(false));
                }
                if (a.type === "nf" || a.type === "dt") {
                    for (const n of a.vs)
                        if (n.startsWith("$") && !renumMT[n])
                            renumMT[n] = new AST(NodeType.ATOM_ITEM, allocRenum(true));
                }
                if (a.type === "nf" || a.type === "of") {
                    for (const n of a.qs)
                        if (n.startsWith("$") && !renumMT[n])
                            renumMT[n] = new AST(NodeType.ATOM_ITEM, allocRenum(true));
                }
            }
            for (const sp of steps) {
                if (sp.from.type === "d") {
                    for (const val of Object.values(sp.from.data.replaceValues))
                        walkRenum(val);
                }
                walkRenum(sp.ast);
            }
            // 应用重编号（step的replaceValues键是子规则原名，保持不动，只改值）
            for (let i = 0; i < conditions.length; i++)
                conditions[i].mut_replaceByMatchTable(renumMT);
            conclusion.mut_replaceByMatchTable(renumMT);
            const newAssertions = [];
            for (const a of assertions) {
                const ass = Assertion.fromAtomic(a).mut_replaceByMatchTable(renumMT);
                newAssertions.push(...ass.reduce().atoms);
            }
            assertions.splice(0, assertions.length, ...newAssertions);
            for (const sp of steps) {
                sp.ast.mut_replaceByMatchTable(renumMT);
                if (sp.from.type === "d") {
                    for (const val of Object.values(sp.from.data.replaceValues))
                        val.mut_replaceByMatchTable(renumMT);
                }
            }
            for (const [k, v] of Object.entries(nameMap))
                nameMap[k] = v.mut_replaceByMatchTable(renumMT);
            return new Deduction(dependence, dname, assertions, conditions, conclusion, steps, nameMap);
        }
        catch (e) {
            host.loadContext(saved);
            throw e;
        }
    }
    catch (e) {
        throw HSError.createRule(dname, e);
    }
}
export class MCPT {
    ast;
    steps = [];
    popCount = -1;
    proofEnumsTable = [];
    // 最大原子数：真值表 2^n 行，超出会指数爆炸/位移溢出，直接报错
    static MAX_ATOMS = 20;
    constructor(ast) { this.ast = ast; }
    // 收集原子命题：只分解 > ~ /\ \/ <> 联结词，其余（量词/谓词/原子命题/等号等）视为不可分割原子
    genAtomWff() {
        const atoms = [];
        const map = new Map();
        const isConnective = (t, n) => t === NodeType.LOGIC && (n === ">" || n === "~" || n === "/\\" || n === "\\/" || n === "<>");
        const visit = (ast) => {
            if (isConnective(ast.type, ast.name)) {
                for (const n of ast.nodes)
                    visit(n);
                return;
            }
            // 原子：去重（用 equal 判断）
            for (let i = 0; i < atoms.length; i++) {
                if (atoms[i].equal(ast)) {
                    map.set(ast, i);
                    return;
                }
            }
            map.set(ast, atoms.length);
            atoms.push(ast.clone());
        };
        visit(this.ast);
        return { atoms, map };
    }
    check(genstep) {
        const { atoms, map } = this.genAtomWff();
        if (atoms.length > MCPT.MAX_ATOMS)
            throw HSError.mcptTooMany(atoms.length, MCPT.MAX_ATOMS);
        const hypEnums = 1 << atoms.length;
        if (genstep) {
            this.steps = [];
            this.popCount = -1;
            this.proofEnumsTable = new Array(atoms.length).fill(0);
            const n = atoms.length;
            let prevConclusions = [];
            const total = 1 << n;
            for (let i = 0; i < total; i++) {
                // ----- 1. 通过位变化加cond -----
                const start = i === 0 ? 0 : n - (32 - Math.clz32(i ^ (i - 1)));
                for (let k = start; k < n; k++) {
                    const bit = i & (1 << (n - k - 1));
                    let condStr = bit === 0 ? "cond ¬(" + atoms[k] + ")" : "cond " + atoms[k];
                    this.steps.push(condStr);
                    this.proofEnumsTable[k] = this.steps.length - 1 - this.popCount;
                }
                // ----- 3. 执行 genStepIter -----
                let [ok, conclusionLogicIdx] = this.genStepIter(this.ast, i, atoms, map);
                if (!ok)
                    throw HSError.mcptFalse(atoms, i);
                // ----- 4. pop合并
                let mergedIdx = conclusionLogicIdx;
                for (let k = 0; k < n; k++) {
                    this.steps.push("pop");
                    this.popCount++;
                    if ((i & (1 << k)) === 0) {
                        prevConclusions.push(mergedIdx);
                        break;
                    }
                    this.steps.push(".m2 " + mergedIdx + " " + prevConclusions.pop());
                    mergedIdx = this.steps.length - 1 - this.popCount;
                }
            }
            return this.steps;
        }
        for (let i = 0; i < hypEnums; i++) {
            if (!this.checkIter(this.ast, i, atoms, map))
                throw HSError.mcptFalse(atoms, i);
        }
    }
    checkIter(ast, hyp, atoms, map) {
        const atomIdx = map.get(ast);
        if (atomIdx !== undefined)
            return ((hyp >> atomIdx) & 1) === 1;
        if (ast.type === NodeType.LOGIC) {
            if (ast.name === "~") {
                return !this.checkIter(ast.nodes[0], hyp, atoms, map);
            }
            if (ast.name === "/\\") {
                return this.checkIter(ast.nodes[0], hyp, atoms, map) && this.checkIter(ast.nodes[1], hyp, atoms, map);
            }
            if (ast.name === "\\/") {
                return this.checkIter(ast.nodes[0], hyp, atoms, map) || this.checkIter(ast.nodes[1], hyp, atoms, map);
            }
            if (ast.name === "<>") {
                return this.checkIter(ast.nodes[0], hyp, atoms, map) === this.checkIter(ast.nodes[1], hyp, atoms, map);
            }
            if (ast.name === ">") {
                return !this.checkIter(ast.nodes[0], hyp, atoms, map) || this.checkIter(ast.nodes[1], hyp, atoms, map);
            }
        }
        throw "can't reach";
    }
    genStepIter(ast, hyp, atoms, map) {
        const atomIdx = map.get(ast);
        // const prefix = "".padEnd(atoms.length, "c");
        if (atomIdx !== undefined)
            return [((hyp >> (atoms.length - 1 - atomIdx)) & 1) === 1, this.proofEnumsTable[atomIdx]];
        if (ast.type === NodeType.LOGIC) {
            if (ast.name === "~") {
                const [ta, pa] = this.genStepIter(ast.nodes[0], hyp, atoms, map);
                if (!ta)
                    return [true, pa];
                this.steps.push("<.ni " + pa);
                return [false, this.steps.length - 1 - this.popCount];
            }
            if (ast.name === ">") {
                const [tb, pb] = this.genStepIter(ast.nodes[1], hyp, atoms, map);
                // . > T : T
                if (tb) {
                    this.steps.push("<a1 " + pb + " " + ast.nodes[0]);
                    return [true, this.steps.length - 1 - this.popCount];
                }
                const [ta, pa] = this.genStepIter(ast.nodes[0], hyp, atoms, map);
                // T > F : F
                if (ta) {
                    this.steps.push(".>n " + pa + " " + pb);
                    return [false, this.steps.length - 1 - this.popCount];
                }
                // F > U : T
                this.steps.push("<.m " + pa + " " + ast.nodes[1]);
                return [true, this.steps.length - 1 - this.popCount];
            }
            const [ta, pa] = this.genStepIter(ast.nodes[0], hyp, atoms, map);
            const [tb, pb] = this.genStepIter(ast.nodes[1], hyp, atoms, map);
            if (ast.name === "<>") {
                const dname = (ta ? "T" : "F") + (tb ? "T" : "F") + "<>";
                this.steps.push("." + dname + " " + pa + " " + pb);
                return [ta === tb, this.steps.length - 1 - this.popCount];
            }
            if (ast.name === "\\/") {
                const dname = ta ? "1" : tb ? "2" : "n";
                const conditionIdxs = ta ? [pa] : tb ? [pb] : [pa, pb];
                const replaceValues = ta ? [ast.nodes[1]] : tb ? [ast.nodes[0]] : [];
                this.steps.push(".\\/" + dname + " " + conditionIdxs.join(" ") + " " + replaceValues.join(" "));
                return [ta || tb, this.steps.length - 1 - this.popCount];
            }
            if (ast.name === "/\\") {
                const dname = !ta ? "<<.a30(>./\\1)" : !tb ? "<<.a30(>./\\2)" : "./\\";
                const conditionIdxs = !ta ? [pa] : !tb ? [pb] : [pa, pb];
                const replaceValues = !ta ? [ast.nodes[1]] : !tb ? [ast.nodes[0]] : [];
                this.steps.push(dname + " " + conditionIdxs.join(" ") + " " + replaceValues.join(" "));
                return [ta && tb, this.steps.length - 1 - this.popCount];
            }
            throw "can't reach";
        }
        throw "can't reach";
    }
}
// 替换元定理:
// msbt>：已知A<>B或a=b，自动将命题中的A或a替换为B或b。
// msbt<：已知A<>B或a=b，自动将命题中的B或b替换为A或a。
export class MSBT {
    // msbt>或msbt<命令（它们差不多，只有微小区别，下面统称为“msbt”）前面的命令当成dname来parse，后面的参数当成ast来parse(跟d命令后面的参数那样不分是item还是wff)。有三种格式：
    // msbt(匹配模板规则名) 被替换的wff或推理步骤 替换索引
    // msbt(mcpt) 匹配模板wff 被替换的wff或推理步骤 替换索引
    // msbt 匹配模板推理步骤 被替换的wff或推理步骤 替换索引
    // msbt(...) dname ast中的参数所给的"匹配模板规则"（不允许带条件，但可带断言）或匹配模板wff、匹配模板推理步骤（注意var/f类型的步骤非法），它们都必须是xx=xxx或xxx<>xxx的形式。
    // 它将执行把等式或<>的左边(或右边)内容去匹配“wff或推理步骤”，然后替换成等式右边(或左边)的东西，如果是wff则生成“替换前<>替换后”这个命题，如果是推理步骤，则肢解生成替换后的命题。具体不一定是全部匹配。
    // 替换索引为0代表替换全部，正整数代表从左到右只替换第n个匹配的，负整数代表从右往左。还可以写成集合形式：{1,2,-2}代表分别替换从左往右第1\2个匹配项，以及从右往左第二个匹配项。
    // 一些细节：用户如果提供的是msbt(规则名)或msbt(mspt)，则等式中的replvar是通配符，可以匹配任意内容。
    // 如果用户提供的是推理步骤，则必须精确匹配，哪怕里面有$xx，也不能看成是通配符，要完全一样才行。这是因为只有是应用规则时才能替换变量，如果在推理表中，则没有替换功能（除非是用m指令录制后才行）
    // 关于msbt(mcpt)的细节：首先用户先输入mcpt的wff，然后执行mcpt的检查穷举真值的逻辑（不生成步骤），然后用该wff模式匹配，里面的replvar可以是通配符。
    // 例子：msbt>(d/\) $1∧$2↔¬($1→¬$2) 0 或 msbt>(d/\) $1∧$2↔¬($1→¬$2) 1 或 msbt>(d/\) $1∧$2↔¬($1→¬$2) -1 执行后均得到¬($1→¬$2)↔¬($1→¬$2)
    // 例子：msbt<(d/\) $1∧$2↔¬($1→¬$2) 0 或 msbt>(d/\) $1∧$2↔¬($1→¬$2) 1 或 msbt>(d/\) $1∧$2↔¬($1→¬$2) -1 执行后均得到$1∧$2↔$1∧$2
    // 例子：msbt>(mcpt) $1↔¬¬$1 $1∧$2↔¬($1→¬$2) 0 执行得到 ($1∧$2↔¬($1→¬$2))↔¬¬($1∧$2↔¬($1→¬$2))，因为根节点就匹配了通配符$1，因此整个表达式就全部替换了。注意不允许替换后接着查找替换，那样就无穷无尽了。可能实现上需要先标记哪些要换，然后最后直接一起换。
    // 例子: 推理表中有一个步骤a:$1↔¬¬$1，下面执行msbt< a ¬¬$1∧¬¬$2↔¬¬(¬¬$1→¬$2) -1 或 msbt< a ¬¬$1∧¬¬$2↔¬¬(¬¬$1→¬$2) {-1} 得到 (¬¬$1∧¬¬$2↔¬¬(¬¬$1→¬$2))↔(¬¬$1∧¬¬$2↔¬¬($1→¬$2)) 因为虽然从左往右根节点优先，所以最后遍历的是最里面的¬¬$1。注意这里参数写-2也不能替换外层的¬¬(¬¬$1→¬$2) ，因为没有通配符机制让¬¬$1匹配¬¬(¬¬$1→¬$2) （它们要精确相等）
    // 例子: 推理表中有一个步骤a:$1↔¬¬$1，还有个步骤b: ¬¬$1∧¬¬$1↔¬¬(¬¬$1→¬$1) 下面执行msbt< a b {1,-1} 得到 $1∧¬¬$1↔¬¬($1→¬$1)
    // 例子: 推理表中有一个规则sa:$1↔¬¬$1，还有个步骤b: ¬¬$1∧¬¬$1↔¬¬(¬¬$1→¬$1) 下面执行msbt<(sa) b {1,-2} 得到 $1∧¬¬$1↔(¬¬$1→¬$1) 这个跟上面的区别是，-2是从左往右匹配根节点优先的倒数第二个，现在sa是规则，则有通配符机制让¬¬$1匹配¬¬(¬¬$1→¬$2)
    steps = [];
    popCount = -1;
    pattern;
    exactMatch;
    ast;
    genIff;
    right;
    // subIndices：全部替换(0)对应undefined，{1,2,3,-1}就对应里面的number
    subIndices;
    res;
    absPosRes = [];
    rule;
    templateProp;
    isMcpt = false;
    asserts;
    // 生成上下文预置的断言数（生成命令编号需要从断言之后开始）
    assertCount = 0;
    // 断言检查需要访问推理系统接口（量词捕获检查用 getAsserts），与组合规则共用 CombineHost 避免循环依赖
    host;
    constructor(host, pattern, exactMatch, ast, genIff, right, asserts = host.getAsserts(), subIndices, rule, templateProp) {
        if (!(pattern.type === NodeType.LOGIC && pattern.name === "<>") && !(pattern.type === NodeType.PRED && pattern.name === "="))
            throw HSError.msbtBadTemplate;
        this.pattern = pattern;
        this.exactMatch = exactMatch;
        this.ast = ast;
        this.genIff = genIff;
        this.right = right;
        this.subIndices = subIndices;
        this.host = host;
        this.rule = rule;
        this.templateProp = templateProp;
        this.res = [];
        this.asserts = asserts;
    }
    // 把用户输入的0、1\-1、{1,2,-2}这种ast转换成number[]数组（0=全部→undefined）
    static getsubIndices(ast) {
        const atom = ast.isAtom();
        if (atom) {
            if (atom === "0")
                return undefined;
            const n = Number(atom);
            if (!Number.isInteger(n))
                throw HSError.msbtBadIndex;
            return [n];
        }
        if (ast.type === NodeType.FN && ast.name === "{}") {
            const res = [];
            for (const n of ast.nodes) {
                const v = Number(n.name);
                if (!Number.isInteger(v))
                    throw HSError.msbtBadIndex;
                res.push(v);
            }
            return res;
        }
        throw HSError.msbtBadIndex;
    }
    check(genstep) {
        const originAst = this.ast;
        const replacedAst = this.ast.clone();
        // msbt>：用左边A去匹配、替换成右边B；msbt<：用右边B去匹配、替换成左边A
        const originPattern = this.pattern.nodes[this.right ? 0 : 1];
        const replacedPattern = this.pattern.nodes[this.right ? 1 : 0];
        this.searchIter(originPattern, replacedAst);
        if (!this.res.length)
            throw HSError.msbtNoMatch;
        if (this.subIndices) {
            // 正整数=从左往右第n个；负整数=从右往左第n个；集合可混合。
            const len = this.res.length;
            this.res = this.res.filter((_, i) => this.subIndices.some(s => s > 0 ? s === i + 1 : s === -(len - i)));
            if (!this.res.length)
                throw HSError.msbtNoMatch;
        }
        for (const r of this.res) {
            // 精确匹配：replacedPattern 原样替换；通配匹配：按绑定表替换后替换
            const k = Array.isArray(r)
                ? replacedPattern.clone().mut_replaceByMatchTable(r[1])
                : replacedPattern.clone();
            const target = Array.isArray(r) ? r[0] : r;
            target.mut_ref(k); // 已克隆，直接安全转移所有权
        }
        return this.genIff ? new AST(NodeType.LOGIC, "<>", originAst, replacedAst) : replacedAst;
    }
    // 加入了genAbsPos参数，一般为undefined，要生成则传入空数组[]，这样就能写入到this.absPosRes中
    searchIter(pattern, ast, genAbsPos) {
        if (!this.exactMatch) {
            try {
                this.res.push([ast, ast.match(pattern)]);
                if (genAbsPos)
                    this.absPosRes?.push(genAbsPos);
                // 不许短路：此时是查找，非替换阶段。替换逻辑也不用改。
            }
            catch (e) { }
        }
        else if (ast.equal(pattern)) {
            // 精确匹配
            this.res.push(ast);
            if (genAbsPos)
                this.absPosRes?.push(genAbsPos);
            // 如果是精确匹配了，那么递归子节点一定不能再匹配，这里直接短路return
            if (this.exactMatch)
                return;
        }
        if (ast.nodes) {
            if (this.exactMatch) {
                // 精确匹配（来自推理表）进入量词/绑定器时：用断言系统检查该绑定变量是否
                // 允许自由出现（host.getAsserts() 提供当前断言，如 #nf 断言表示某变量
                // 不在某表达式中自由出现）。断言不通过则整个子树被量词捕获，直接忽略。
                const bv = ast.getBoundVarName();
                if (bv) {
                    const assertions = this.asserts;
                    const constraint = new NFAssertion(this.pattern, new Set([ast.getBoundVarName()]), new Set).reduce();
                    const check = Assertion.check(assertions, constraint);
                    if (!check.passed)
                        return;
                }
            }
            for (let i = 0; i < ast.nodes.length; i++) {
                const n = ast.nodes[i];
                this.searchIter(pattern, n, genAbsPos ? [...genAbsPos, i] : undefined);
            }
        }
    }
    static eq = (a, b) => a.length === b.length && a.every((v, k) => v === b[k]);
    // 规则宏步骤重放时的替换索引重算：
    // 录制时索引（0=全部、{1,-1}等）是在"未替换"的目标上匹配得到的；肢解重放时规则rv
    // 会把目标（及模板）中的元变量替换成具体内容，可能产生录制时没有的新匹配
    // （原本不匹配的元变量被宏填入而匹配），原索引会误替换新匹配。办法：替换前先
    // 查找记录每个匹配的绝对位置（子节点路径数组，替换不改变该编号），替换后再查找
    // 一遍，用 indexOf 式反查把原选中范围映射回新索引。
    // template/newTemplate：录制时模板与替换后模板（格式1规则结论不随rv变，两者相同）。
    // 返回 undefined 表示替换后仍是"全部替换"(0)，否则返回新的索引集合（1-based正索引）。
    static reindexAfterReplace(host, template, newTemplate, right, exactMatch, originTarget, newTarget, subIndices) {
        const originPattern = template.nodes[right ? 0 : 1];
        const newPattern = newTemplate.nodes[right ? 0 : 1];
        // 替换前：查找并记录每个匹配的绝对位置。注意 searchIter 对"与模式完全相等"的节点
        const m1 = new MSBT(host, template, exactMatch, originTarget, false, false, undefined);
        m1.searchIter(originPattern, originTarget, []);
        const len = m1.res.length;
        if (!len)
            return subIndices;
        // 原索引选中哪些条目 → 按绝对位置去重后收集
        const selected = [];
        for (let i = 0; i < len; i++) {
            const hit = subIndices ? subIndices.some(s => s > 0 ? s === i + 1 : s === -(len - i)) : true;
            if (hit) {
                const p = m1.absPosRes[i];
                if (!selected.some(q => MSBT.eq(q, p)))
                    selected.push(p);
            }
        }
        if (!selected.length)
            return subIndices;
        // 替换后：重新查找，绝对位置反查新索引（同位置的重复条目只取第一个，避免索引膨胀）
        const m2 = new MSBT(host, newTemplate, exactMatch, newTarget, false, false, undefined);
        m2.searchIter(newPattern, newTarget, []);
        const newIdx = [];
        const used = [];
        let distinct2 = 0;
        for (let i = 0; i < m2.res.length; i++) {
            const p = m2.absPosRes[i];
            const isNewPos = !used.some(q => MSBT.eq(q, p));
            if (isNewPos) {
                used.push(p);
                distinct2++;
            }
            if (isNewPos && selected.some(q => MSBT.eq(q, p)))
                newIdx.push(i + 1);
        }
        if (!newIdx.length)
            return subIndices;
        if (newIdx.length === distinct2)
            return undefined; // 新匹配仍全部选中 → 保持0
        return newIdx;
    }
    // 把重算后的索引集合还原成命令里的索引ast（undefined=0全部；单个=数字；多个={..}）
    static toIndexAst(subIndices) {
        if (!subIndices)
            return new AST(NodeType.ATOM_UKNOWN, "0");
        if (subIndices.length === 1)
            return new AST(NodeType.ATOM_UKNOWN, String(subIndices[0]));
        return new AST(NodeType.FN, "{}", ...subIndices.map(i => new AST(NodeType.ATOM_UKNOWN, String(i))));
    }
    // assertCount：生成上下文预置的断言数（由调用方在空上下文里先 hyp 断言后统计，
    // 与规则录制时的上下文一致，供 captureScope 的量词捕获检查使用）。
    // 注意：模板步骤的 hyp 在 wff 目标时也必须保留（证明要用它作前提），只有目标 hyp 才按 targetIsStep 决定。
    generateStep(rule, templateProp, isMcpt = false, targetIsStep = true, assertCount = 0) {
        const originPattern = this.pattern.nodes[this.right ? 0 : 1];
        const replacedPattern = this.pattern.nodes[this.right ? 1 : 0];
        const originAst = this.ast.clone();
        const replacedAst = this.ast.clone();
        this.res = [];
        this.absPosRes = [];
        this.searchIter(originPattern, originAst, []);
        if (!this.res.length)
            throw HSError.msbtNoMatch;
        if (this.subIndices) {
            const len = this.res.length;
            const keep = this.res.map((_, i) => this.subIndices.some(s => s > 0 ? s === i + 1 : s === -(len - i)));
            this.res = this.res.filter((_, i) => keep[i]);
            this.absPosRes = this.absPosRes.filter((_, i) => keep[i]);
            if (!this.res.length)
                throw HSError.msbtNoMatch;
        }
        const selectedPositions = this.absPosRes.slice();
        // 嵌套匹配剔除（只影响肢解步骤生成，不改变替换结果）：若某位置是另一位置的
        // 祖先，剔除子孙——正常 check() 时祖先替换后子孙内容已被换走，替换子孙无实际
        // 影响；但肢解要为每个点位生成一步证明，嵌套点位会生成多余/错误的步骤。
        // exactMatch 的 searchIter 对精确匹配已短路跳过嵌套，此处只对规则模板生效。
        const isAncestor = (a, b) => a.length < b.length && a.every((v, k) => v === b[k]);
        const topPositions = selectedPositions.filter(p => !selectedPositions.some(q => isAncestor(q, p)));
        const selectedTargets = selectedPositions.map(pos => this.findAt(replacedAst, pos));
        for (let i = 0; i < this.res.length; i++) {
            const r = this.res[i];
            const replacement = Array.isArray(r) ? replacedPattern.clone().mut_replaceByMatchTable(r[1]) : replacedPattern.clone();
            selectedTargets[i].mut_ref(replacement);
        }
        this.steps = [];
        this.assertCount = assertCount;
        // 目标 hyp 的编号（wff 目标无目标 hyp，unwrap 步骤只在步骤目标时生成）
        const preloadedCount = targetIsStep ? (assertCount + (templateProp ? 2 : 1)) : 0;
        if (templateProp)
            this.steps.push(`hyp ${templateProp.ast}`);
        if (targetIsStep)
            this.steps.push(`hyp ${this.ast}`);
        // 前置 hyp 已经计入 steps.length，沿用 genStepIter 的原始编号基准。
        this.popCount = -1;
        this.rule = rule;
        this.templateProp = templateProp;
        this.isMcpt = isMcpt;
        const isEq = this.pattern.type === NodeType.PRED && this.pattern.name === "=";
        if (isEq) {
            // = 模板：a8/#sb 线性替换（与 <> 模板的同余组合不同），见 genEqSteps
            this.genEqSteps(originAst, topPositions, preloadedCount, targetIsStep);
            return this.steps;
        }
        const eqIdx = this.genStepIter(originAst, replacedAst, []);
        if (!targetIsStep)
            return this.steps;
        this.steps.push(`d <<.<>${this.right ? 1 : 2} ${eqIdx} ${preloadedCount}`);
        return this.steps;
    }
    findAt(ast, pos) {
        for (const i of pos)
            ast = ast.nodes[i];
        return ast;
    }
    // 当前刚压入的步骤编号（genEqSteps 全程在根级，popCount 保持 -1）
    curIdx() {
        return this.assertCount + this.steps.length;
    }
    // ===== 替换模板为 xxx=xxx（等号）时的肢解步骤生成 =====
    // 与 <> 模板的“同余组合”（genStepIter + .<>rX）不同，= 模板没有同余规则可用，
    // 改由 a8 公理（$A=$B→#sb($,$x,$A)→#sb($,$x,$B)）做替换：
    //   把选中替换点位替换成 # 开头的局部变量构造“框架”，<a8 在框架中分别代入
    //   A/B 得到 原ast→替换后ast；需要 wrap<> 时用 .=s 交换等式方向再反向代入一次，
    //   最后 .<> 合成双向。非 exactMatch（规则模板）每次匹配内容不同，不能一次 #sb
    //   完成，故逐点位各做一次（替换第二个点位时在已替换的表达式上做），用 .t 串联。
    genEqSteps(originAst, positions, preloadedCount, targetIsStep) {
        // 局部变量：# 开头，且不出现在模板和替换目标中
        const used = new Set();
        this.pattern.getLocalvars(used);
        this.ast.getLocalvars(used);
        let localName = "#";
        let n = 0;
        while (used.has(localName))
            localName = "#" + (n++);
        const localVar = new AST(NodeType.ATOM_ITEM, localName);
        // = 模板在生成上下文中的 hyp 编号（exactMatch 才有；规则模板先 d 规则得等式）
        const templateIdx = this.assertCount + 1;
        // 正向：原ast→替换后ast。msbt> 模板等式（左=右）直接可用；msbt< 需先 .=s 交换
        const forward = (eqIdx, frame) => {
            if (this.right) {
                this.steps.push(`d <a8 ${eqIdx} ${frame} ${localVar}`);
            }
            else {
                this.steps.push(`d .=s ${eqIdx}`);
                const swapIdx = this.curIdx();
                this.steps.push(`d <a8 ${swapIdx} ${frame} ${localVar}`);
            }
            return this.curIdx();
        };
        // 反向：替换后ast→原ast（方向与 forward 相反）
        const reverse = (eqIdx, frame) => {
            if (!this.right) {
                this.steps.push(`d <a8 ${eqIdx} ${frame} ${localVar}`);
            }
            else {
                this.steps.push(`d .=s ${eqIdx}`);
                const swapIdx = this.curIdx();
                this.steps.push(`d <a8 ${swapIdx} ${frame} ${localVar}`);
            }
            return this.curIdx();
        };
        if (this.exactMatch) {
            if (!this.templateProp)
                throw HSError.msbtNoMatch;
            // 一次性框架：所有选中点位换成局部变量，一次 <a8 完成全部替换
            const frame = originAst.clone();
            for (const pos of positions)
                this.findAt(frame, pos).mut_ref(localVar.clone());
            const fwdIdx = forward(templateIdx, frame);
            if (targetIsStep) {
                // 步骤目标：mp（原ast→替换后ast）与目标hyp（原ast）得替换后ast
                this.steps.push(`d mp ${fwdIdx} ${preloadedCount}`);
                return this.curIdx();
            }
            // wff 目标：wrap<>，反向证明后 .<> 合成
            const revIdx = reverse(templateIdx, frame);
            this.steps.push(`d .<> ${fwdIdx} ${revIdx}`);
            return this.curIdx();
        }
        // 非 exactMatch（规则模板）：逐点位替换，.t 串联
        // 注意 = 模板不可能是 mcpt（等式不是重言式，mcpt 检查不会通过）
        if (this.isMcpt || !this.rule)
            throw HSError.msbtNoMatch;
        const ruleOrigin = this.rule.conclusion.nodes[this.right ? 0 : 1];
        const ruleReplaced = this.rule.conclusion.nodes[this.right ? 1 : 0];
        // current：前面点位已换成实际替换值，本点位换局部变量作框架
        let current = originAst.clone();
        const eqIdxs = [];
        const frames = [];
        let fwdChain = 0;
        for (let k = 0; k < positions.length; k++) {
            const pos = positions[k];
            const content = this.findAt(current, pos);
            const mt = {};
            content.match(ruleOrigin, mt);
            const values = this.rule.replaceNames.map(([name]) => mt[name]);
            if (values.some(v => !v))
                throw HSError.msbtNoMatch;
            this.steps.push(`d ${this.rule.name} ${values.join(" ")}`);
            const eqIdx = this.curIdx();
            eqIdxs.push(eqIdx);
            const frame = current.clone();
            this.findAt(frame, pos).mut_ref(localVar.clone());
            frames.push(frame);
            const stepIdx = forward(eqIdx, frame);
            if (k === 0)
                fwdChain = stepIdx;
            else {
                this.steps.push(`d .t ${fwdChain} ${stepIdx}`);
                fwdChain = this.curIdx();
            }
            // 更新状态：本点位替换为实际替换值，供下一点位作框架
            const bVal = ruleReplaced.clone().mut_replaceByMatchTable(mt);
            this.findAt(current, pos).mut_ref(bVal);
        }
        if (targetIsStep) {
            this.steps.push(`d mp ${fwdChain} ${preloadedCount}`);
            return this.curIdx();
        }
        // 反向：同样从左到右，对每个等式 .=s 后反向代入；.t 串联顺序颠倒
        // （本步骤的结论是上一步的前提，故先写当前步骤、再写上一步）
        let revChain = 0;
        for (let k = 0; k < positions.length; k++) {
            const revStep = reverse(eqIdxs[k], frames[k]);
            if (k === 0)
                revChain = revStep;
            else {
                this.steps.push(`d .t ${revStep} ${revChain}`);
                revChain = this.curIdx();
            }
        }
        this.steps.push(`d .<> ${fwdChain} ${revChain}`);
        return this.curIdx();
    }
    // 在生成步骤前，需要先生成替换的位置和表达式。其中a是替换前，b是替换后，这里的genStepIter生成a<>b。然后如果要取消掉这个<>的wrap，执行完这个递归函数后，外面最后再加一步<<.<>1或<<.<>2（这两个的区别是方向，一个是从a得到b。一个是从b得到a），就可以得到单独的a或b了。
    genStepIter(a, b, pos = []) {
        if (a.equal(b)) {
            // a == b : a <> a
            this.steps.push("d .<>i " + a);
            return this.assertCount + this.steps.length - 1 - this.popCount;
        }
        // 如果这个位置要替换
        if (this.absPosRes.some(e => MSBT.eq(e, pos))) {
            // 如果是exactMatch，这里就该返回模板定理的编号。注意模板定理是不在steps里面的步骤，因此我们先弄个占位符0。
            // 之后在外面去找那个定理的真实号码，或还有其它更好的方式？看你觉得怎么实现更好
            if (this.exactMatch) {
                if (!this.templateProp)
                    throw HSError.msbtNoMatch;
                // 模板步骤 hyp 在生成上下文中位于预置断言之后（assertCount+1）
                return this.assertCount + 1;
            }
            // 否则是规则生成、匹配的
            // MCPT 没有 Deduction 实体，直接生成重言式证明命令。
            if (this.isMcpt) {
                this.steps.push(`mcpt (${a})↔(${b})`);
            }
            else if (this.rule) {
                // 普通规则直接执行规则名，并传入匹配表中的替换值。
                const matchTable = {};
                a.match(this.rule.conclusion.nodes[this.right ? 0 : 1], matchTable);
                const values = this.rule.replaceNames.map(([name]) => matchTable[name]);
                if (values.some(v => !v))
                    throw HSError.msbtNoMatch;
                const dname = this.rule.name.toString();
                this.steps.push(`d ${dname} ${values.join(" ")}`);
            }
            else
                throw "can't reach";
            return this.assertCount + this.steps.length - 1 - this.popCount;
            // 只有命题精确匹配和规则模糊匹配两种情况
        }
        if (a.type === NodeType.LOGIC) {
            if (a.name === ">" || a.name === "<>" || a.name === "/\\" || a.name === "\\/") {
                this.steps.push(`d .<>r${a.name} ${this.genStepIter(a.nodes[0], b.nodes[0], [...pos, 0])} ${this.genStepIter(a.nodes[1], b.nodes[1], [...pos, 1])}`);
                return this.assertCount + this.steps.length - 1 - this.popCount;
            }
            if (a.name === "~") {
                this.steps.push(`d .<>r~ ${this.genStepIter(a.nodes[0], b.nodes[0], [...pos, 0])}`);
                return this.assertCount + this.steps.length - 1 - this.popCount;
            }
        }
        if (a.type === NodeType.QUANT) {
            this.steps.push("var " + a.getBoundVarName());
            const inner = this.genStepIter(a.nodes[1], b.nodes[1], [...pos, 1]);
            this.steps.push("pop");
            this.popCount++;
            this.steps.push("d .<>r" + a.name + " " + inner);
            return this.assertCount + this.steps.length - 1 - this.popCount;
        }
        throw "can't reach";
    }
}
export class MCNT {
    ast;
    // 原始ast（wrap<>时用）；targetStepId 无 → wff目标（结果wrap<>），有 → 步骤目标（结果不wrap）
    origAst;
    targetStepId;
    subindices;
    res = [];
    absPosRes = [];
    // 当前环境断言（量词捕获检查用）
    asserts;
    // targetStepId没有说明输入的是wff，要wrap<>，否则是步骤，要unwrap<>。
    constructor(ast, targetStepId, subindices, asserts = []) {
        this.ast = ast.clone();
        this.origAst = ast.clone();
        this.targetStepId = targetStepId;
        this.subindices = subindices;
        this.asserts = asserts;
    }
    // 把用户输入的{x,.,y}、{{3,x},{y,-1}}这种ast转换成Map<number,string>。注意由于不知道能匹配多少个，负数在这里保留
    // 每个元素：单变量→位置索引(1-based)；{索引,变量}或{变量,索引} pair；. 或 {} 占位符忽略
    static getsubIndices(ast) {
        // 空集符号 {}（无任何替换）→ undefined
        if (ast.isAtom() === "{}")
            return undefined;
        if (ast.type !== NodeType.FN || ast.name !== "{}")
            throw HSError.mcntBadIndex;
        const res = new Map();
        ast.nodes.forEach((node, i) => {
            const nm = node.isAtom();
            // 占位符：. 或 {}（空集）
            if (nm === "." || nm === "{}")
                return;
            // 单变量：位置索引 i+1
            if (nm !== undefined) {
                if (Number.isInteger(Number(nm)))
                    throw HSError.mcntBadIndex; // 单个数字无意义
                res.set(i + 1, nm);
                return;
            }
            // pair {索引,变量} 或 {变量,索引}
            if (node.type === NodeType.FN && node.name === "{}" && node.nodes.length === 2) {
                let idx;
                let varName;
                for (const n of node.nodes) {
                    const name = n.isAtom();
                    if (name === undefined)
                        throw HSError.mcntBadIndex;
                    const num = Number(name);
                    if (Number.isInteger(num))
                        idx = num;
                    else
                        varName = name;
                }
                if (idx === undefined || varName === undefined)
                    throw HSError.mcntBadIndex;
                res.set(idx, varName);
                return;
            }
            throw HSError.mcntBadIndex;
        });
        if (!res.size)
            return undefined;
        return res;
    }
    // genAbsPos现在必填
    searchIter(ast, genAbsPos) {
        if (ast.type === NodeType.QUANT) {
            // 这里只添加quant ast
            this.res.push(ast);
            this.absPosRes.push(genAbsPos);
        }
        if (ast.nodes) {
            for (let i = 0; i < ast.nodes.length; i++) {
                const n = ast.nodes[i];
                this.searchIter(n, [...genAbsPos, i]);
            }
        }
    }
    // 一次换名：把 this.ast 中 absPos=pos 的 QUANT 的绑定变量换成 newName。
    // 1) 断言检查 newName 不自由出现在 body 中；2) 用 #sb(body, 旧名, newName) wrap 后化简（黑箱）。
    replaceOne(pos, newName) {
        let node = this.ast;
        for (const i of pos)
            node = node.nodes[i];
        const quant = node; // QUANT
        const oldName = quant.nodes[0].name;
        if (oldName === newName)
            return;
        const body = quant.nodes[1];
        // 断言检查：newName 不自由出现在 body 中（NFAssertion.reduce + Assertion.check，与msbt同款）
        const constraint = new NFAssertion(body, new Set([newName]), new Set()).reduce();
        const check = Assertion.check(this.asserts, constraint);
        if (!check.passed)
            throw HSError.mcntAssertFail(check.counterexample);
        // wrap #sb：\a newName: #sb(body, oldName, newName)
        quant.nodes[0] = new AST(NodeType.ATOM_ITEM, newName);
        quant.nodes[1] = new AST(NodeType.SB, "", body, new AST(NodeType.ATOM_ITEM, oldName), new AST(NodeType.ATOM_ITEM, newName), new AST(NodeType.FN, " "));
        // 化简 #sb（黑箱，含捕获检测：失败会抛 sbFail）
        Assertion.reduceSbFn(this.asserts, quant.nodes[1]);
    }
    // 生成临时 fresh 局部变量（# 开头，不在 ast 和用户新名字中出现过）
    freshTempVar() {
        const used = new Set();
        this.ast.getLocalvars(used);
        for (const name of this.subindices.values())
            used.add(name);
        let n = 0;
        let name = "#";
        while (used.has(name))
            name = "#" + (n++);
        return name;
    }
    check(genstep) {
        this.searchIter(this.ast, []);
        if (!this.res.length)
            throw HSError.mcntNoMatch;
        // 有了length，就可以把角标统一换算成正整数的位置索引了，我们这里更新this.subindices。
        if (this.subindices.size) {
            const len = this.res.length;
            const m = new Map();
            for (const [idx, name] of this.subindices)
                m.set(idx > 0 ? idx : len + idx + 1, name);
            this.subindices = m;
        }
        // 做一次filter，把subindices没指定替换的和替换后的名字跟ast.nodes[0].name的名字一样的也踢掉。
        // 注意 subindices 的 key 是原始位置索引，filter 后要同步收集每个保留项的目标新名
        const keep = [];
        const targetNames = [];
        this.res.forEach((r, i) => {
            const newName = this.subindices.get(i + 1);
            const k = newName !== undefined && newName !== r.nodes[0].name;
            keep.push(k);
            if (k)
                targetNames.push(newName);
        });
        this.res = this.res.filter((_, i) => keep[i]);
        this.absPosRes = this.absPosRes.filter((_, i) => keep[i]);
        if (!this.res.length)
            return this.targetStepId === undefined ? new AST(NodeType.LOGIC, "<>", this.origAst, this.ast.clone()) : this.ast;
        // 检查filter后的indices对应的这些absPosRes，它们有没有互相包含的关系？（即看有没有一个数组是另一个的前段：如[]跟[0]有包含，但[0,1]跟[0,0没有）只要找到一个
        // 有的话做这个分步两次替换逻辑：
        const isPrefix = (a, b) => a.length < b.length && a.every((v, k) => v === b[k]);
        const hasNesting = this.absPosRes.some((p, i) => this.absPosRes.some((q, j) => j !== i && isPrefix(p, q)));
        if (hasNesting) {
            // 第一次替换：每个点位换成本ast中未出现过的临时fresh局部变量
            for (let i = 0; i < this.res.length; i++) {
                this.replaceOne(this.absPosRes[i], this.freshTempVar());
                // 下次循环时，要用替换后的表达式（replaceOne 原地修改 this.ast，天然满足）
            }
            // 第二次替换：把临时fresh变量换成真正最终变量
            for (let i = 0; i < this.res.length; i++) {
                this.replaceOne(this.absPosRes[i], targetNames[i]);
            }
        }
        else {
            // 否则一次替换搞定，不要临时变量
            for (let i = 0; i < this.res.length; i++) {
                this.replaceOne(this.absPosRes[i], targetNames[i]);
            }
        }
        // 最后该wrap/unwrap <>的在这里处理（genstep 的步骤生成留到以后，先不写）
        if (this.targetStepId === undefined) {
            return new AST(NodeType.LOGIC, "<>", this.origAst, this.ast);
        }
        return this.ast;
    }
}
//# sourceMappingURL=combine.js.map