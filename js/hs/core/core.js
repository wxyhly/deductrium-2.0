import { NodeType } from "../../asttype.js";
import { Assertion, AtomSolver, NFAssertion } from "./assert.js";
import { AST } from "./ast.js";
import { Deduction, Proposition } from "./deduction.js";
import { HSError } from "./error.js";
const RuleNameNotAllowedStartsWith = "acdempuv0123456789#$%<>.";
export class HilbertSystem {
    rules = new Map;
    props = [];
    // 内部状态缓存
    activeProp = null;
    flatProps = new Map;
    replvarVars = new Set;
    replvars = new Map;
    getD(dname) {
        if (dname.type === NodeType.ATOM_DNAME) {
            const d = this.rules.get(dname.name);
            if (!d)
                throw HSError.dname404(dname.name);
            return d;
        }
        if (dname.type === NodeType.NODE_DNAME) {
            if (dname.name) {
                const d = this.getD(dname.nodes[0]);
                if (!d)
                    throw HSError.dname404(dname.nodes[0].toString());
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
                        throw HSError.createRule(dname, "错误的元规则");
                    const [c, conc] = d.conclusion.nodes;
                    const conds = d.conditions.map(c => c.clone());
                    conds.push(c.clone());
                    return new Deduction(d.dependence, dname, d.assertions, conds, conc.clone());
                }
                if (dname.name === ">") {
                    if (!d.conditions.length)
                        throw HSError.createRule(dname, "错误的元规则");
                    const conds = d.conditions.map(c => c.clone());
                    const c = conds.pop();
                    const conc = new AST(NodeType.LOGIC, ">", c, d.conclusion.clone());
                    return new Deduction(d.dependence, dname, d.assertions, conds, conc);
                }
                if (dname.name === "e") {
                    if (d.conditions.length > 1)
                        throw HSError.createRule(dname, "错误的元规则");
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
    renameD(oldName, newName) {
        if (newName === oldName)
            return;
        if (RuleNameNotAllowedStartsWith.includes(newName[0]))
            throw HSError.invalidRuleNameStartsWith(RuleNameNotAllowedStartsWith);
        if (this.rules.get(newName))
            throw HSError.nameAlreadyExist(newName);
        const D = this.rules.get(oldName);
        if (!D)
            throw HSError.dname404(oldName);
        // todo: 检查约束、处理约束
        this.rules.delete(oldName);
        this.rules.set(newName, D);
    }
    updatePropIdx() {
        let idx = 1;
        this.flatProps.clear();
        this.activeProp = null;
        const iter = (arr, parent) => {
            for (const p of arr) {
                this.flatProps.set(String(idx), p);
                p.id = idx++;
                p.parent = parent;
                if (p.active && p.children)
                    this.activeProp = p;
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
                if (p.children) {
                    iter(p.children, p);
                }
            }
        };
        iter(this.props, null);
        const total = idx;
        // support for . and -1 refering to recent steps
        for (const p of this.flatProps.values()) {
            const num = p.id - total;
            this.flatProps.set(String(num), p);
            if (num > -6)
                this.flatProps.set('.'.repeat(-num), p);
        }
    }
    getP(pname) {
        return this.flatProps.get(pname);
    }
    getReplvarsInfo() {
        return { item: this.replvars, var: this.replvarVars };
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
        // 检查元变量一致性，在其它可能throw error之后、正式添加Prop前调用
        const checkReplvars = () => {
            if (prop.from.type === "f")
                return;
            const fallBackRepl = new Map(this.replvars);
            const fallBackVar = new Set(this.replvarVars);
            try {
                prop.ast.getReplvars(this.replvars);
                prop.ast.getReplvarVars(this.replvarVars);
            }
            catch (e) {
                this.replvars = fallBackRepl;
                this.replvarVars = fallBackVar;
                throw e;
            }
        };
        // assert/hyp依次在最前
        if (prop.from.type === "a") {
            // 检查现在添加的断言是否有用
            if (AtomSolver.check(asserts, [prop.from.data]).passed)
                throw HSError.assertNeverFail(prop.ast);
            asserts.push(prop.from.data);
            if (!AtomSolver.isSatisfiable(asserts))
                throw HSError.assertForeverFail(prop.ast);
            checkReplvars();
            // 检查是否有可化简的#sb函数
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
            // 添加新断言
            this.props.splice(pos, 0, prop);
        }
        else if (prop.from.type === "h") {
            // 假设中不能有#sb()
            if (prop.ast.hasSbFn())
                throw HSError.hypFail(HSError.sbInHyp());
            checkReplvars();
            // 添加新假设
            let pos = this.props.findIndex(e => e.from.type !== "h" && e.from.type !== "a");
            pos = pos === -1 ? this.props.length : pos;
            this.props.splice(pos, 0, prop);
        }
        else {
            checkReplvars();
            // 不是假设的命题，放到active节点内部的最后
            this.getActiveList().push(prop);
            // 如果添加的是文件夹，则把它设为active
            if (prop.children) {
                if (prop.from.type === "v" && prop.ast.isReplvar())
                    this.replvarVars.add(prop.ast.name);
                if (this.activeProp)
                    this.activeProp.active = false;
                prop.active = true;
            }
        }
        this.updatePropIdx();
        return prop;
    }
    getActiveList() {
        return this.activeProp?.children || this.props;
    }
    updateReplvars() {
        this.replvarVars.clear();
        this.replvars.clear();
        let id = 1;
        let p;
        while (p = this.flatProps.get(String(id++))) {
            if (p.from.type === "f")
                continue;
            p.ast.getReplvars(this.replvars);
            p.ast.getReplvarVars(this.replvarVars);
        }
    }
    hyp(ast) { return this.addP(Proposition.hyp(ast)); }
    b() {
        const list = this.getActiveList();
        const p = list.pop();
        if (!p) {
            if (this.activeProp === null)
                return;
            this.pop();
        }
        if (p?.relyAfter?.length) {
            list.push(p);
            throw HSError.delFail(p.relyAfter, null);
        }
        if (p?.children?.length) {
            list.push(p);
            this.cd(p);
            return;
        }
        this.updatePropIdx();
        this.updateReplvars();
    }
    getActiveProp() { return this.activeProp; }
    // 根据captureScope的结果添加ast表达式
    ref_addCaptureScopeToAST(ast, layers) {
        if (!layers.length)
            return ast;
        for (const l of layers) {
            if (l.from.type === "c") {
                ast = new AST(NodeType.LOGIC, ">", l.ast, ast);
            }
            else if (l.from.type === "v") {
                ast = new AST(NodeType.QUANT, "\\a", l.ast, ast);
            }
            else
                throw "can't reach";
        }
        return ast;
    }
    // 返回p相对于scope中的表达式需添加的条件，可能抛出异常
    captureScope(scope, p, assertions = this.getAsserts()) {
        let layerToAdd = [];
        let parent = p.children ? p : p.parent;
        let found = false;
        while (!found) {
            let scopeParent = scope;
            while (!found) {
                if (scopeParent === parent) {
                    found = true;
                    break;
                }
                if (scopeParent === null)
                    break;
                scopeParent = scopeParent.parent;
            }
            if (found || parent === null) {
                while (scope !== scopeParent) {
                    if (scope.from.type === "v") {
                        const check = Assertion.check(assertions, new NFAssertion(p.ast, new Set([scope.ast.name]), new Set).reduce());
                        if (!check.passed) {
                            throw HSError.capturePFail(scope, p, check.counterexample);
                        }
                    }
                    scope = scope.parent;
                }
                found = true;
                break;
            }
            if (parent.from.type !== "f")
                layerToAdd.push(parent);
            parent = parent.parent;
        }
        return layerToAdd;
    }
    d(deduction, conditions, replaceValues) {
        try {
            const assertions = this.getAsserts();
            if (conditions.length !== deduction.conditions.length)
                throw HSError.inconsistCondNum();
            for (const [name, isItem] of deduction.replaceNames) {
                if (isItem)
                    replaceValues[name]?.becomeItem();
            }
            const originReplaceValues = Object.assign({}, replaceValues);
            for (let i = 0; i < conditions.length; i++) {
                const cond = conditions[i];
                if (cond.from.type !== "h" && cond.from.type !== "d" && cond.from.type !== "c")
                    throw HSError.matchCond(i + 1, HSError.isNotWFF(cond.ast));
                try {
                    // capture closure for c and v and match
                    this.ref_addCaptureScopeToAST(cond.ast, this.captureScope(this.activeProp, cond, assertions)).match(deduction.conditions[i], replaceValues);
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
                return this.addP(new Proposition(res, { type: "d", data: { deduction: deduction.name, conditions, replaceValues: originReplaceValues } }));
            }
            catch (e) {
                throw HSError.conclusionFail(e);
            }
        }
        catch (e) {
            throw HSError.deductFail(deduction.name.toString(), e);
        }
    }
    checkPname(name) {
        if (!name.match(/^[a-z][A-Za-z0-9_]*$/))
            throw HSError.invalidPropName();
        if (this.flatProps.get(name))
            throw HSError.nameAlreadyExist(name);
    }
    c(ast) { return this.addP(Proposition.mkdir("c", ast)); }
    v(ast) { return this.addP(Proposition.mkdir("v", ast)); }
    f(ast) {
        this.checkPname(ast.name);
        return this.addP(Proposition.mkdir("f", ast));
    }
    clear() {
        this.props.length = 0;
        this.flatProps.clear();
        this.activeProp = null;
        this.replvarVars.clear();
        this.replvars.clear();
    }
    allowReorder(sourceId, targetId, position) {
        console.log("src", sourceId, "dst", targetId, "pos", position);
        const src = this.flatProps.get(String(sourceId));
        if (!src)
            return false;
        // 用小数精确标记插入位置，以便直接用不等式比较位置
        const dstId = position === "before" ? targetId - 0.5 : targetId + 0.5;
        const toRight = dstId > sourceId;
        // src可能是块，找到块的最后位置
        const srcEndId = this.getLastChildP(src)?.id || sourceId;
        // 1. 检查assert、hyp是否依次在最前，文件夹里面不允许装a和h，所以不用检查srcEnd
        const srcType = src.from.type;
        if (toRight) {
            const borderType = this.flatProps.get(String(Math.floor(dstId))).from.type;
            if (srcType === 'a' && borderType !== 'a')
                return false;
            if (srcType === 'h' && (borderType !== 'h' && borderType !== "a"))
                return false;
        }
        else {
            const borderType = this.flatProps.get(String(Math.ceil(dstId))).from.type;
            if (srcType !== 'a' && srcType !== 'h' && (borderType === 'a' || borderType === 'h'))
                return false;
            if (srcType === 'h' && (borderType === "a"))
                return false;
        }
        // 2. 检查块中每个元素的移动依赖性是否合法
        for (let sid = sourceId; sid <= srcEndId; sid++) {
            const prop = sid === sourceId ? src : this.flatProps.get(String(sid));
            const rely = toRight ? prop.relyAfter : prop.relyBefore;
            if (!rely?.length)
                continue;
            for (const { id } of rely) {
                // 忽略内部依赖
                if (id >= sourceId && id <= srcEndId)
                    continue;
                // 右移时id小就非法，否则id大就非法
                if ((id > dstId) !== toRight)
                    return false;
            }
        }
        // 3. 检查是否允许跨层级
        const dst = this.flatProps.get(String(targetId));
        const srcScope = src.parent;
        const dstScope = position === "inside" ? dst : dst.parent;
        // 同层级直接允许
        if (srcScope === dstScope)
            return true;
        return false;
    }
    getLastChildP(node) {
        let list = node === null ? this.props : node.children;
        if (!list || list.length === 0)
            return node;
        const lastChild = list[list.length - 1];
        return this.getLastChildP(lastChild);
    }
    checkConclusionInPropList() {
        const conc = this.getLastChildP(null);
        if (!conc)
            throw HSError.conclusionFail(HSError.noConclusion());
        if (conc.from.type !== "d" && conc.from.type !== "c")
            throw HSError.conclusionFail(HSError.noConclusion());
        if (conc.ast.getLocalvars().size)
            throw HSError.conclusionFail(HSError.localVarInConclusion());
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
        const k = this.ref_addCaptureScopeToAST(conc.ast, this.captureScope(null, conc, asserts));
        return { asserts, conditions, conclusion: k.clone() };
    }
    m(name) {
        if (RuleNameNotAllowedStartsWith.includes(name[0]))
            throw HSError.invalidRuleNameStartsWith(RuleNameNotAllowedStartsWith);
        if (this.rules.get(name))
            throw HSError.nameAlreadyExist(name);
        const { asserts, conditions, conclusion } = this.checkConclusionInPropList();
        this.clearActiveDir();
        const steps = this.props.slice(0);
        const d = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), asserts, conditions, conclusion, steps);
        this.rules.set(name, d);
        this.clear();
        return d;
    }
    delP(p) {
        let failed = false;
        if (p.from.type === "c" || p.from.type === "v") {
            // todo: 支持打包删除
            if (p.children?.length)
                throw HSError.delFail(p.children, null);
        }
        if (p.from.type !== "a") {
            if (p.relyAfter?.length)
                throw HSError.delFail(p.relyAfter, null);
        }
        else {
            // check all propositions in the list
            const currentProps = this.props;
            const currentActive = this.activeProp;
            const flatProps = this.flatProps;
            const vars = this.replvarVars;
            const repls = this.replvars;
            this.props = [];
            this.flatProps = new Map;
            this.activeProp = null;
            this.replvarVars = new Set;
            this.replvars = new Map;
            const thisId = p.id;
            let id = 1;
            try {
                while (true) {
                    if (thisId === id)
                        id++;
                    const oldP = flatProps.get(String(id++));
                    if (!oldP)
                        break;
                    while (this.activeProp) {
                        if (this.activeProp.id + 1 === oldP.parent?.id)
                            break;
                        this.pop();
                    }
                    if (oldP.from.type === "a" || oldP.from.type === "h") {
                        const prop = this.hyp(oldP.ast);
                        if (!prop.ast.equal(oldP.ast))
                            throw HSError.delFail([oldP], null);
                    }
                    if (oldP.from.type === "c" || oldP.from.type === "v") {
                        const prop = this[oldP.from.type](oldP.ast);
                        if (!prop.ast.equal(oldP.ast))
                            throw HSError.delFail([oldP], null);
                    }
                    if (oldP.from.type === "d") {
                        const data = oldP.from.data;
                        const nconds = data.conditions.map(c => this.getP(String(c.id - 1)));
                        const prop = this.d(this.getD(data.deduction), nconds, data.replaceValues);
                        if (!prop.ast.equal(oldP.ast))
                            throw HSError.delFail([oldP], null);
                    }
                }
            }
            catch (e) {
                failed = true;
                // 对齐错误的临时prop id, 否则报错时的编号少1
                id = thisId;
                while (true) {
                    const p = this.flatProps.get(String(id++));
                    if (!p)
                        break;
                    p.id++;
                }
                this.props = currentProps;
                this.flatProps = flatProps;
                this.activeProp = currentActive;
                this.replvarVars = vars;
                this.replvars = repls;
                throw HSError.delFail([flatProps.get(String(id - 1))], e);
            }
            this.props = currentProps;
            this.flatProps = flatProps;
            this.activeProp = currentActive;
            this.replvarVars = vars;
            this.replvars = repls;
        }
        if (failed)
            return false;
        const iter = (nodes) => {
            for (const node of nodes) {
                if (node === p) {
                    nodes.splice(nodes.indexOf(node), 1);
                    return true;
                }
                if (node.children?.length && iter(node.children))
                    return true;
            }
            return false;
        };
        // if not found return false
        if (!iter(this.props))
            return false;
        this.updatePropIdx();
        this.updateReplvars();
        return true;
    }
    clearActiveDir() {
        const iter = (p) => {
            for (const prop of p) {
                if (prop.active) {
                    prop.active = false;
                }
                if (prop.children?.length)
                    iter(prop.children);
            }
        };
        iter(this.props);
        this.activeProp = null;
    }
    cd(p) {
        if (!p.children && p.parent) {
            this.cd(p.parent);
            return;
        }
        this.clearActiveDir();
        p.active = true;
        this.activeProp = p;
    }
    pop() {
        if (this.activeProp === null)
            return;
        this.activeProp.active = false;
        if (this.activeProp.parent)
            this.activeProp.parent.active = true;
        this.activeProp = this.activeProp.parent;
    }
    genCmd(props = this.props) {
        let flatProps = this.flatProps;
        if (props !== this.props) {
            // get flatprops
            let idx = 1;
            flatProps = new Map;
            const iter = (arr) => {
                for (const p of arr) {
                    flatProps.set(String(idx++), p);
                    if (p.children)
                        iter(p.children);
                }
            };
            iter(props);
        }
        let id = 1;
        const cmds = [];
        let lastP = null;
        while (true) {
            const p = flatProps.get(String(id++));
            if (!p)
                break;
            let parent = p.parent;
            // 第一条或更深都不用管，否则cd到parent
            if (lastP && parent !== lastP && parent !== lastP.parent) {
                cmds.push('cd ' + (parent?.id || "0"));
            }
            cmds.push(p.getCmd());
            if (p.name && p.from.type !== "f")
                cmds.push(`name ${p.id} ${p.name}`);
            lastP = p;
        }
        return cmds;
    }
    fromCmd(cmds) {
        for (const cmd of cmds) {
            const name = cmd.name;
            const args = cmd.nodes;
            if (name === "hyp")
                this.hyp(args[0]);
            if (name === "d") {
                const rule = this.getD(args[0]);
                const conds = args.slice(1, rule.conditions.length + 1).map(e => this.getP(e.name));
                const replaceValues = Object.fromEntries(args.slice(rule.conditions.length + 1).map((e, idx) => [rule.replaceNames[idx][0], e]));
                this.d(rule, conds, replaceValues);
            }
            if (name === "cond" || name === "var" || name === "dir") {
                this[name === "dir" ? "f" : name[0]](args[0]);
            }
            if (name === "cd") {
                if (args[0].name === "0")
                    this.clearActiveDir();
                this.cd(this.getP(args[0].name));
            }
            if (name === "m")
                this.m(args[0].name);
        }
    }
}
//# sourceMappingURL=core.js.map