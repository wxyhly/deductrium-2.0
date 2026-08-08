import { Assertion, AtomSolver } from "./assertsolver.js";
import { AST, NodeType } from "./ast.js";
import { Deduction } from "./deduct.js";
import { FSError } from "./error.js";
export class HilbertSystem {
    rules = new Map;
    props = [];
    asserts = [];
    flatProps = new Map;
    getD(dname) {
        if (dname.type === NodeType.ATOM_DNAME) {
            const d = this.rules.get(dname.name);
            if (!d)
                throw FSError.dname404(dname.name);
            return d;
        }
        if (dname.type === NodeType.NODE_DNAME) {
            if (dname.name) {
                const d = this.getD(dname.nodes[0]);
                if (!d)
                    throw FSError.dname404(dname.nodes[0].toString());
                if (dname.name === "c") {
                    const mapFn = (ast) => {
                        ast = ast.clone();
                        const c = d.getNewReplName("wff");
                        return new AST(NodeType.LOGIC, ">", c, ast);
                    };
                    return new Deduction(d.dependence, dname, d.assertions, d.conditions.map(mapFn), mapFn(d.conclusion));
                }
                if (dname.name === "v") {
                    const c = d.getNewReplName("var");
                    const mapFn = (ast) => {
                        ast = ast.clone();
                        return new AST(NodeType.QUANT, "\\a", c.clone(), ast);
                    };
                    return new Deduction(d.dependence, dname, d.assertions, d.conditions.map(mapFn), mapFn(d.conclusion));
                }
                if (dname.name === "<") {
                    if (d.conclusion.type !== NodeType.LOGIC || d.conclusion.name !== ">")
                        throw FSError.createRule(dname, "错误的元规则");
                    const [c, conc] = d.conclusion.nodes;
                    const conds = d.conditions.map(c => c.clone());
                    conds.push(c.clone());
                    return new Deduction(d.dependence, dname, d.assertions, conds, conc.clone());
                }
                if (dname.name === ">") {
                    if (!d.conditions.length)
                        throw FSError.createRule(dname, "错误的元规则");
                    const conds = d.conditions.map(c => c.clone());
                    const c = conds.pop();
                    const conc = new AST(NodeType.LOGIC, ">", c, d.conclusion.clone());
                    return new Deduction(d.dependence, dname, d.assertions, conds, conc);
                }
                if (dname.name === "e") {
                    if (d.conditions.length > 1)
                        throw FSError.createRule(dname, "错误的元规则");
                    const c = d.getNewReplName("var");
                    const mapFn = (ast) => {
                        ast = ast.clone();
                        return new AST(NodeType.QUANT, "\\e", c.clone(), ast);
                    };
                    return new Deduction(d.dependence, dname, d.assertions, d.conditions.map(mapFn), mapFn(d.conclusion));
                }
                return d;
            }
        }
        throw "can't reach";
    }
    updatePropIdx() {
        let idx = 1;
        this.flatProps.clear();
        const iter = (arr) => {
            if (!arr)
                return;
            for (const p of arr) {
                this.flatProps.set(String(idx), p);
                p.id = idx++;
                p.relyBefore = [];
                p.relyAfter = [];
                if (p.from.type === "d") {
                    for (const c of (p.from.data.conditions)) {
                        c.relyAfter.push(p);
                        p.relyBefore.push(c);
                    }
                }
                if (p.name)
                    this.flatProps.set(p.name, p);
                iter(p.children);
            }
        };
        iter(this.props);
    }
    getP(pname) {
        return this.flatProps.get(pname);
    }
    getAsserts() {
        let pos = this.props.findIndex(e => e.from.type !== "a");
        pos = pos === -1 ? this.props.length : pos;
        const asserts = this.props.slice(0, pos).map((e) => (e.from.data));
        return asserts;
    }
    addP(prop) {
        // 收集所有asserts
        let pos = this.props.findIndex(e => e.from.type !== "a");
        pos = pos === -1 ? this.props.length : pos;
        const asserts = this.props.slice(0, pos).map((e) => (e.from.data));
        // 根据assets化简#sb函数
        if (prop.ast.hasSbFn()) {
            prop.ast = prop.ast.clone();
            Assertion.reduceSbFn(asserts, prop.ast);
        }
        // assert/hyp依次在最前
        if (prop.from.type === "a") {
            if (AtomSolver.check(asserts, [prop.from.data]).passed)
                throw FSError.assertNeverFail(prop.ast);
            asserts.push(prop.from.data);
            if (!AtomSolver.isSatisfiable(asserts))
                throw FSError.assertForeverFail(prop.ast);
            this.props.splice(pos, 0, prop);
            // 添加了新断言，检查是否有可化简的#sb函数
            const iter = (arr) => {
                for (const p of arr) {
                    if (p.from.type !== "a" && p.ast.hasSbFn()) {
                        Assertion.reduceSbFn(asserts, p.ast);
                    }
                    if (p.children)
                        iter(p.children);
                }
            };
            iter(this.props);
        }
        else if (prop.from.type === "h") {
            if (prop.ast.hasSbFn())
                throw FSError.hypFail(FSError.sbInHyp());
            let pos = this.props.findIndex(e => e.from.type !== "h" && e.from.type !== "a");
            pos = pos === -1 ? this.props.length : pos;
            this.props.splice(pos, 0, prop);
        }
        else {
            // 不是假设的命题，递归放到child的里面的最后
            const iter = (arr) => {
                const p = arr[arr.length - 1];
                if (p?.children) {
                    iter(p.children);
                }
                else {
                    arr.push(prop);
                }
            };
            iter(this.props);
        }
        this.updatePropIdx();
    }
    pop() {
        const iter = (arr) => {
            const p = arr[arr.length - 1];
            if (p?.children?.length) {
                iter(p.children);
            }
            else {
                arr.pop();
            }
        };
        iter(this.props);
        this.updatePropIdx();
    }
    clear() {
        this.props.length = 0;
        this.flatProps.clear();
    }
    allowReorder(sourceId, targetId, position) {
        // 1. 确定区间 [start, end]
        const start = Math.min(sourceId, targetId);
        const end = Math.max(sourceId, targetId);
        // 2. 构造区间内的原始 ID 列表（按顺序）
        const rangeIds = [];
        for (let id = start; id <= end; id++) {
            rangeIds.push(id);
        }
        // 3. 模拟移动
        const srcIdx = rangeIds.indexOf(sourceId);
        const tgtIdx = rangeIds.indexOf(targetId);
        if (srcIdx === -1 || tgtIdx === -1)
            return false;
        // 移除源
        rangeIds.splice(srcIdx, 1);
        // 计算插入位置
        let insertIdx = tgtIdx;
        if (position === 'after')
            insertIdx++;
        if (srcIdx < tgtIdx)
            insertIdx--; // 因为移除后索引变化
        // 插入
        rangeIds.splice(insertIdx, 0, sourceId);
        // 4. 检查分组顺序（仅检查区间内）
        let lastGroupRank = -1;
        for (const id of rangeIds) {
            const from = this.flatProps.get(String(id))?.from;
            let rank;
            if (from?.type === 'a')
                rank = 0;
            else if (from?.type === 'h')
                rank = 1;
            else
                rank = 2;
            if (rank < lastGroupRank)
                return false;
            lastGroupRank = rank;
        }
        // 5. 依赖检查（直接用数值比较）
        // 新位置 = insertIdx + start（因为区间从 start 开始）
        const newPos = insertIdx + start;
        const sourceData = this.flatProps.get(String(sourceId));
        if (sourceData) {
            const relyBefore = sourceData.relyBefore || [];
            const relyAfter = sourceData.relyAfter || [];
            for (const p of relyBefore) {
                if (p.id >= newPos)
                    return false;
            }
            for (const p of relyAfter) {
                if (p.id <= newPos)
                    return false;
            }
        }
        return true;
    }
    checkConclusionInPropList() {
        const iter = (arr) => {
            const p = arr[arr.length - 1];
            if (p?.children?.length) {
                return iter(p.children);
            }
            else {
                return p;
            }
        };
        const conc = iter(this.props);
        if (!conc)
            throw FSError.conclusionFail(FSError.noConclusion());
        const d = (conc.from.type === "d") ? conc.from.data.deduction : undefined;
        if (!d)
            throw FSError.conclusionFail(FSError.noConclusion());
        if (conc.ast.getLocalvars().size)
            throw FSError.conclusionFail(FSError.localVarInConclusion());
        // if (conc.ast.hasSbFn()) throw FSError.conclusionFail(FSError.sbInConclusion());
        let id = 1;
        const asserts = [];
        const conditions = [];
        while (true) {
            const p = this.flatProps.get(String(id++));
            if (!p || (p.from.type !== "a" && p.from.type !== "h"))
                break;
            if (p.from.type === "h") {
                conditions.push(p.ast);
            }
            if (p.from.type === "a") {
                asserts.push(p.from.data);
            }
        }
        return { asserts, conditions, conclusion: conc.ast };
    }
    m(name) {
        if ("acdempuv0123456789#<>.".includes(name[0]))
            throw FSError.invalidRuleNameStartsWith(name);
        if (this.rules.get(name))
            throw FSError.nameAlreadyExist(name);
        const { asserts, conditions, conclusion } = this.checkConclusionInPropList();
        const d = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), asserts, conditions, conclusion);
        this.rules.set(name, d);
        this.clear();
        return d;
    }
}
//# sourceMappingURL=core.js.map