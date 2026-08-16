import { NodeType } from "../../asttype.js";
import { Assertion, AtomSolver } from "./assert.js";
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
        let guard = 0;
        while (guard++ < 64) {
            const snapshot = ast.toString();
            ast.mut_replaceByMatchTable(mt);
            if (ast.toString() === snapshot)
                break;
        }
        if (guard > 64)
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
            // 公理加 v：不生成 step（不允许展开，提示同公理）
            host.loadContext(saved);
            return undefined;
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
//# sourceMappingURL=combine.js.map