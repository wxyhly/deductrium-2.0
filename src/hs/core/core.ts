import { NodeType } from "../../asttype.js";
import { Assertion, AtomicAssertion, AtomSolver, NFAssertion } from "./assert.js";
import { AST, MatchTable } from "./ast.js";
import { combineRules, assertToAST, genConditionStep, genQuantStep, genUnivStep, MCPT, MCNT, MSBT } from "./combine.js";
import { Deduction, DeductionStep, Proposition } from "./deduction.js";
import { HSError, HSErrorInfo, isHSErrorInfo } from "./error.js";
import { HSParser } from "./parser.js";
const RuleNameNotAllowedStartsWith = "acdempuv0123456789#$%<>.";

// props相关的完整状态，用于保存/恢复当前props数据
// 注意：rules是共用的，不属于context
export interface HSContext {
    props: Proposition[];
    activeProp: Proposition | null;
    flatProps: Map<string, Proposition>;
    replvarVars: Set<string>;
    replvars: Map<string, boolean>;
}
export class HilbertSystem {
    rules: Map<string, Deduction> = new Map;
    props: Proposition[] = [];

    // 内部状态缓存
    private activeProp: Proposition | null = null;
    private flatProps: Map<string, Proposition> = new Map;
    private replvarVars = new Set<string>;
    private replvars = new Map;

    // 构造一份空的props上下文（用于新建推理表等）
    createEmptyContext(): HSContext {
        return { props: [], activeProp: null, flatProps: new Map, replvarVars: new Set, replvars: new Map };
    }
    // 保存当前props状态到context
    saveContext(): HSContext {
        return {
            props: this.props,
            activeProp: this.activeProp,
            flatProps: this.flatProps,
            replvarVars: this.replvarVars,
            replvars: this.replvars,
        };
    }
    // 用context覆盖当前状态，实现props数据切换
    loadContext(ctx: HSContext) {
        this.props = ctx.props;
        this.activeProp = ctx.activeProp;
        this.flatProps = ctx.flatProps;
        this.replvarVars = ctx.replvarVars;
        this.replvars = ctx.replvars;
    }

    // Formula previews use the same rule transformations without constructing proofs.
    getD(dname: AST, withProof = true, previewWork?: (work: number) => void): Deduction {
        if (dname.type === NodeType.ATOM_DNAME) {
            const d = this.rules.get(dname.name);
            if (!d) throw HSError.dname404(dname.name);
            return d;
        }
        if (dname.type === NodeType.NODE_DNAME) {
            try {
                if (dname.name) {
                    const d = this.getD(dname.nodes[0], withProof, previewWork);
                    if (!d) throw HSError.dname404(dname.nodes[0].toString());
                    if (dname.name === "c") {
                        const c = d.getNewReplName("wff");
                        const mapFn = (ast: AST) => {
                            ast = ast.clone();
                            return new AST(NodeType.LOGIC, ">", c.clone(), ast);
                        }
                        const conds = d.conditions.map(mapFn);
                        const conclusion = mapFn(d.conclusion);
                        // 生成 step（c:mp 写死、公理两步、有假设通用），失败则无 step
                        const step = withProof ? genConditionStep(this, d, c) : undefined;
                        return new Deduction(d.dependence, dname, d.assertions, conds, conclusion, step);
                    }
                    if (dname.name === "v") {
                        const c = d.getNewReplName("var");
                        const mapFn = (ast: AST) => {
                            ast = ast.clone();
                            return new AST(NodeType.QUANT, "\\a", c.clone(), ast);
                        }
                        const conds = d.conditions.map(mapFn);
                        const conclusion = mapFn(d.conclusion);
                        // 生成 step（v:mp 写死、公理无 step、有假设通用），失败则无 step
                        const step = withProof ? genQuantStep(this, d, c) : undefined;
                        return new Deduction(d.dependence, dname, d.assertions, conds, conclusion, step);
                    }
                    if (dname.name === "u") {
                        // u:xx 只给结论加全称量词，条件保持原样但要求其中的 replvar 不自由出现新变量
                        // （无条件规则与 v 无区别，禁止使用）
                        if (!d.conditions.length) throw HSError.uNeedCond(dname.toString());
                        const c = d.getNewReplName("var");
                        const mapFn = (ast: AST) => {
                            ast = ast.clone();
                            return new AST(NodeType.QUANT, "\\a", c.clone(), ast);
                        }
                        // 新增断言：每个条件中每个 replvar 不自由出现 c（去重）
                        const assertions = d.assertions.slice();
                        const added = new Set<string>();
                        // 新增 nf 断言：每个条件中不自由出现v
                        let asssertRes = { asts: [] as Assertion[], atoms: [] as AtomicAssertion[] };
                        for (const cc of d.conditions) {
                            new NFAssertion(cc, new Set([c.name]), new Set()).reduce(asssertRes);
                        }
                        Assertion.check([], asssertRes);
                        for (const atom of asssertRes.atoms) {
                            const hash = AtomSolver.print(atom)!;
                            if (!added.has(hash)) {
                                assertions.push(atom);
                                added.add(hash);
                            }
                        }
                        const conds = d.conditions.map(cc => cc.clone());
                        const conclusion = mapFn(d.conclusion);
                        // 生成 step（<a6 加量词 + v:d），失败则无 step
                        const step = withProof ? genUnivStep(this, assertions, d, c) : undefined;
                        return new Deduction(d.dependence, dname, assertions, conds, conclusion, step);
                    }
                    if (dname.name === "<") {
                        if (d.conclusion.type !== NodeType.LOGIC || d.conclusion.name !== ">") throw HSError.createRule(dname, HSError.badMetaRule);
                        const [A, B] = d.conclusion.nodes;
                        // 保持原 replNames 不变（不做 fresh 重命名）：<d: 条件+原A，结论=原B
                        const conds = d.conditions.map(c => c.clone());
                        conds.push(A.clone());
                        if (!withProof) return new Deduction(d.dependence, dname, d.assertions, conds, B.clone());
                        // step：hyp 各条件 → hyp A → d <d>（rv 默认自身）→ mp
                        const saved = this.saveContext();
                        this.loadContext(this.createEmptyContext());
                        try {
                            this.clear();
                            // 断言直接复制（hyp原子断言）
                            for (const a of d.assertions) {
                                try { this.hyp(assertToAST(a)); } catch (e) { if ((e as HSErrorInfo)?.type === "assertNeverFail") continue; throw e; }
                            }
                            // 条件hyp（原名）
                            const condHyps = d.conditions.map(cc => this.hyp(cc.clone()));
                            // A的假设（原名）
                            const aHyp = this.hyp(A.clone());
                            // rvD：replaceNames 全部映射到自身（默认值，保证不变）
                            const rvD: MatchTable = {};
                            for (const [name, isItem] of d.replaceNames) {
                                rvD[name] = new AST(isItem ? NodeType.ATOM_ITEM : NodeType.ATOM_WFF, name);
                            }
                            const dRes = this.d(d, condHyps, rvD);
                            // mp: (A>B) A -> B
                            const finalP = this.d(this.getD(new AST(NodeType.ATOM_DNAME, "mp")), [dRes, aHyp], {});
                            if (!finalP.ast.equal(B)) throw HSError.conclusionMismatch;
                            const steps = this.props.slice(0);
                            this.loadContext(saved);
                            return new Deduction(d.dependence, dname, d.assertions, conds, B.clone(), steps);
                        } catch (e) {
                            this.loadContext(saved);
                            throw e;
                        }
                    }
                    if (dname.name === ">") {
                        if (!d.conditions.length) throw HSError.createRule(dname, HSError.badMetaRule);
                        const conds = d.conditions.map(c => c.clone());
                        const c = conds.pop()!;
                        const conc = new AST(NodeType.LOGIC, ">", c, d.conclusion.clone());
                        // 生成step（演绎元定理）：最后条件变cond，其余步骤放进cond层级，失败则无step
                        const step = withProof ? this.genDeductStep(d, c) : undefined;
                        return new Deduction(d.dependence, dname, d.assertions, conds, conc, step);
                    }
                    if (dname.name === "e") {
                        if (d.conditions.length > 1) throw HSError.createRule(dname, HSError.badMetaRule);
                        const c = d.getNewReplName("var");
                        const mapFn = (ast: AST) => {
                            ast = ast.clone();
                            return new AST(NodeType.QUANT, "\\e", c.clone(), ast);
                        }
                        return new Deduction(d.dependence, dname, d.assertions, d.conditions.map(mapFn), mapFn(d.conclusion));
                    }
                    return d;
                } else {
                    // 组合规则: 第一个是函数名(本身也是规则)，后面是参数（都是规则，或#）。
                    // 如args是[r1,r2,#,r3]表示组合规则r1(r2,#,r3)：把r2和r3的结论去匹配r1的第一个、第三个条件，
                    // 这样把r2的所有条件、r1的第二个条件（#）、r3的所有条件放一起，就能复合，推出r1的结论。
                    // 具体求解逻辑在 combine.ts 的 combineRules。
                    return combineRules(this, dname, withProof, previewWork);
                }
            } catch (e) {
                // 具体规则生成函数只抛局部异常（如 genStepFail 不带规则名前缀）；
                // 这里补全规则名，嵌套出完整的异常信息。
                if (isHSErrorInfo(e) && e.type === "genStepFail" && !e.ruleName) {
                    throw HSError.genStepFail(dname.toString(), e.cause, e.steps);
                }
                throw e;
            }
        }
        throw "can't reach";
    }
    // 如果有“.”开头的系统规则被用户重命名了，则存进来，key是原系统名称，value是用户名称。注意用户可能多次更名，key永远存最原始的名称，比如.i被用户改名了，肢解某些东西才能正确产生
    renamedSysRule = new Map<string, string>;
    // 递归替换规则名AST中所有末端节点（ATOM_DNAME）为oldName的节点为newName
    private renameDnameRef(ast: AST, oldName: string, newName: string) {
        if (ast.type === NodeType.ATOM_DNAME) {
            if (ast.name === oldName) ast.name = newName;
            return;
        }
        if (ast.type === NodeType.NODE_DNAME) {
            for (const n of ast.nodes) this.renameDnameRef(n, oldName, newName);
        }
    }
    // 遍历任意props数组（推理表sheet的props等），替换其中d步骤的规则名引用
    // （renameD只改规则表的step；推理表各sheet的props由UI层在重命名后调用此方法）
    renameDnameInProps(props: Proposition[], oldName: string, newName: string) {
        const iter = (arr: Proposition[]) => {
            for (const p of arr) {
                if (p.from.type === "d") {
                    this.renameDnameRef(p.from.data.deduction, oldName, newName);
                }
                if (p.children) iter(p.children);
            }
        };
        iter(props);
    }
    // 系统规则的实际名称：若被用户重命名过则返回新名，否则返回原名
    getSysRuleName(name: string): string {
        return this.renamedSysRule.get(name) ?? name;
    }
    renameD(oldName: string, newName: string) {
        if (newName === oldName) return;
        if (RuleNameNotAllowedStartsWith.includes(newName[0])) throw HSError.invalidRuleNameStartsWith(RuleNameNotAllowedStartsWith);
        if (this.rules.get(newName)) throw HSError.nameAlreadyExist(newName);
        const D = this.rules.get(oldName);
        if (!D) throw HSError.dname404(oldName);
        // a/d 开头的公理（无 step）不允许改名（存档中它们只存名称占位，内容以 init 为准）
        if (/^[ad]/.test(oldName) && !D.step?.length && !D.error) {
            throw HSError.axiomRenameForbidden(oldName);
        }

        // 记录系统规则重命名：key永远是最原始的系统名（如.i），value是最新的用户名。
        // 若oldName本身就是被改过名的系统规则（即renamedSysRule的某个value），则更新该value为newName；
        // 否则若oldName以"."开头（原始系统名），新增记录。
        let sysKey: string | null = null;
        for (const [k, v] of this.renamedSysRule) {
            if (v === oldName) { sysKey = k; break; }
        }
        if (sysKey !== null) {
            this.renamedSysRule.set(sysKey, newName);
        } else if (oldName.startsWith(".")) {
            this.renamedSysRule.set(oldName, newName);
        }

        // 遍历整个rules中的step，如果步骤d中的规则名AST里面的某个末端的节点有这个要改名的规则名，把它也改掉。
        for (const rule of this.rules.values()) {
            if (!rule.step) continue;
            this.renameDnameInProps(rule.step, oldName, newName);
        }

        // 更新规则自身名字AST
        D.name = new AST(NodeType.ATOM_DNAME, newName);

        this.rules.delete(oldName);
        this.rules.set(newName, D);
    }
    updatePropIdx() {
        let idx = 1;
        this.flatProps.clear();
        this.activeProp = null;
        const iter = (arr: Proposition[], parent: Proposition | null) => {
            for (const p of arr) {
                this.flatProps.set(String(idx), p);
                p.id = idx++;
                p.parent = parent;
                if (p.active && p.children) this.activeProp = p;
                p.relyBefore = []; p.relyAfter = [];
                if (p.from.type === "d") {
                    for (const c of (p.from.data.conditions)) {
                        c.relyAfter!.push(p);
                        p.relyBefore.push(c);
                    }
                }
                if (p.name) this.flatProps.set(p.name, p);
                if (p.children) {
                    iter(p.children, p);
                }
            }
        }
        iter(this.props, null);
        const total = idx;
        // support for . and -1 refering to recent steps
        for (const p of this.flatProps.values()) {
            const num = p.id - total;
            this.flatProps.set(String(num), p);
            if (num > -6) this.flatProps.set('.'.repeat(-num), p);
        }
    }
    getP(pname: string): Proposition | undefined {
        return this.flatProps.get(pname);
    }
    getReplvarsInfo() {
        return { item: this.replvars, var: this.replvarVars };
    }
    // 当前断言（MSBT 等元规则需要检查变量自由出现等约束时使用）
    getAsserts() {
        let pos = this.props.findIndex(e => e.from.type !== "a");
        pos = pos === -1 ? this.props.length : pos;
        const asserts = this.props.slice(0, pos).map((e) => ((e.from as { type: "a", data: AtomicAssertion }).data));
        return asserts;
    }
    private addP(prop: Proposition) {
        // 收集所有asserts
        let pos = this.props.findIndex(e => e.from.type !== "a");
        pos = pos === -1 ? this.props.length : pos;
        const asserts = this.props.slice(0, pos).map((e) => ((e.from as { type: "a", data: AtomicAssertion }).data));
        // 根据assets化简#sb函数
        if (prop.ast.hasSbFn()) {
            prop.ast = prop.ast.clone();
            Assertion.reduceSbFn(asserts, prop.ast);
        }
        // 检查元变量一致性，在其它可能throw error之后、正式添加Prop前调用
        const checkReplvars = () => {
            if (prop.from.type === "f") return;
            const fallBackRepl = new Map(this.replvars);
            const fallBackVar = new Set(this.replvarVars);
            try {
                prop.ast.getReplvars(this.replvars);
                prop.ast.getReplvarVars(this.replvarVars);
            } catch (e) {
                this.replvars = fallBackRepl;
                this.replvarVars = fallBackVar;
                throw e;
            }
        }
        // assert/hyp依次在最前
        if (prop.from.type === "a") {
            // 检查现在添加的断言是否有用
            if (AtomSolver.check(asserts, [prop.from.data]).passed) throw HSError.assertNeverFail(prop.ast);
            asserts.push(prop.from.data);
            if (!AtomSolver.isSatisfiable(asserts)) throw HSError.assertForeverFail(prop.ast);
            checkReplvars();
            // 检查是否有可化简的#sb函数
            const iter = (arr: Proposition[]) => {
                for (const p of arr) {
                    if (p.from.type !== "a" && p.ast.hasSbFn()) {
                        Assertion.reduceSbFn(asserts, p.ast);
                    }
                    if (p.children) iter(p.children);
                }
            }
            iter(this.props);
            // 添加新断言
            this.props.splice(pos, 0, prop);
        } else if (prop.from.type === "h") {
            // 假设中不能有#sb()
            if (prop.ast.hasSbFn()) throw HSError.hypFail(HSError.sbInHyp);
            checkReplvars();
            // 添加新假设
            let pos = this.props.findIndex(e => e.from.type !== "h" && e.from.type !== "a");
            pos = pos === -1 ? this.props.length : pos;
            this.props.splice(pos, 0, prop);
        } else {
            checkReplvars();
            // 不是假设的命题，放到active节点内部的最后
            this.getActiveList().push(prop);
            // 如果添加的是文件夹，则把它设为active
            if (prop.children) {
                if (prop.from.type === "v" && prop.ast.isReplvar()) this.replvarVars.add(prop.ast.name);
                if (this.activeProp) this.activeProp.active = false;
                prop.active = true;
            }
        }
        this.updatePropIdx();
        return prop;
    }
    getActiveList() {
        return this.activeProp?.children || this.props;
    }
    private checkConditionsBeforeAppend(conditions: Proposition[]) {
        const lastId = (p: Proposition): number => p.children?.length
            ? lastId(p.children[p.children.length - 1])
            : p.id;
        const activeList = this.getActiveList();
        const appendId = activeList.length
            ? lastId(activeList[activeList.length - 1])
            : (this.activeProp?.id ?? 0);
        for (let i = 0; i < conditions.length; i++) {
            if (conditions[i].id > appendId) {
                throw HSError.matchCond(i + 1, HSError.futureCondition(conditions[i].id, appendId));
            }
        }
    }
    private updateReplvars() {
        this.replvarVars.clear(); this.replvars.clear();
        let id = 1; let p: Proposition | undefined;
        while (p = this.flatProps.get(String(id++))) {
            if (p.from.type === "f") continue;
            p.ast.getReplvars(this.replvars);
            p.ast.getReplvarVars(this.replvarVars);
        }
    }
    hyp(ast: AST) { return this.addP(Proposition.hyp(ast)); }
    b() {
        const list = this.getActiveList();
        const p = list.pop();
        if (!p) {
            if (this.activeProp === null) return;
            this.pop();
        }
        if (p?.children?.length) {
            list.push(p);
            this.cd(p);
            return;
        }
        if (p?.relyAfter?.length) {
            list.push(p);
            throw HSError.delFail(p, p.relyAfter, null);
        }
        this.updatePropIdx();
        this.updateReplvars();
    }
    // 肢解：d步骤展开宏规则step；c/v/f文件夹把内容提升并包裹。
    // 返回新建的文件夹列表（供UI保持展开状态）
    expand(p: Proposition): Proposition[] {
        if (p.from.type === "f" || p.from.type === "c" || p.from.type === "v") {
            return this.expandFolder(p);
        }
        if (p.from.type !== "d") return [];
        const data = p.from.data;
        const dname = data.deduction;
        // 只要getD能解析出带step的规则即可展开（原子宏、组合、<包装等）；
        // mcpt 的步骤在执行肢解时才 lazy 生成（MCPT.check(true) 生成命令序列）
        const isMcpt = dname.type === NodeType.ATOM_DNAME && dname.name === "mcpt";
        const isMsbt = this.isMsbtDname(dname);
        const isMcnt = dname.type === NodeType.ATOM_DNAME && dname.name === "mcnt";
        let rule: Deduction | null = null;
        let steps: Proposition[];
        if (isMcpt) {
            steps = this.genMcptSteps(data.replaceValues["$"]);
        } else if (isMcnt) {
            // mcnt 换名元定理：步骤 lazy 生成（MCNT.generateStep 生成命令序列）
            const targetIsStep = !data.replaceValues["$t"];
            const targetAst = targetIsStep
                ? data.conditions[data.conditions.length - 1].ast.clone()
                : data.replaceValues["$t"]!.clone();
            const sheetAsserts = this.getAsserts();
            const generator = new MCNT(targetAst, targetIsStep ? data.conditions[data.conditions.length - 1].id : undefined, MCNT.getsubIndices(data.replaceValues["$i"]!) ?? new Map<number, string>(), sheetAsserts);
            const saved = this.saveContext();
            try {
                this.loadContext(this.createEmptyContext());
                // 预置当前表断言：生成 context 里 d() 的断言检查依赖这些断言
                let assertCount = 0;
                for (const a of sheetAsserts) {
                    try { this.hyp(assertToAST(a)); assertCount++; } catch (e) { if ((e as HSErrorInfo)?.type === "assertNeverFail") continue; throw e; }
                }
                const commands = generator.generateStep(assertCount);
                this.fromCmd(commands.map(command => new HSParser().parse(command, "cmd")));
                steps = this.props.slice(0);
            } finally {
                this.loadContext(saved);
            }
            rule = new Deduction(new Set, dname, [], data.conditions.map(c => c.ast.clone()), p.ast.clone(), steps);
        } else if (isMsbt) {
            const isNode = dname.type === NodeType.NODE_DNAME;
            const inner = isNode ? dname.nodes[1] as AST : null;
            const right = (isNode ? (dname.nodes[0] as AST).name : dname.name) === "msbt>";
            const isMcptTemplate = inner?.name === "mcpt";
            let pattern: AST;
            let exactMatch: boolean;
            let templateProp: Proposition | undefined;
            let templateRule: Deduction | undefined;
            if (isMcptTemplate) {
                pattern = data.replaceValues["$p"]!.clone();
                exactMatch = false;
            } else if (inner) {
                templateRule = this.getD(inner);
                pattern = templateRule.conclusion.clone();
                exactMatch = false;
            } else {
                templateProp = data.conditions[0];
                pattern = templateProp.ast.clone();
                exactMatch = true;
            }
            // wff 目标保存在 $t；步骤目标则作为最后一个条件保存。
            // 注意：裸 msbt 的步骤模板本身也占一个 conditions，不能用 conditions.length 判断。
            const targetIsStep = !data.replaceValues["$t"];
            const targetAst = targetIsStep
                ? data.conditions[data.conditions.length - 1].ast.clone()
                : data.replaceValues["$t"]!.clone();
            const sheetAsserts = this.getAsserts();
            const generator = new MSBT(this, pattern, exactMatch, targetAst, false, right, sheetAsserts, MSBT.getsubIndices(data.replaceValues["$i"]!));
            const saved = this.saveContext();
            try {
                this.loadContext(this.createEmptyContext());
                // 预置当前表断言：生成 context 里 d() 的 captureScope 量词捕获检查
                // （如 .<>r\a 的 a6 检查需要 #nf 断言）依赖这些断言，与规则录制时的上下文一致。
                // 生成的步骤前部会出现 a 类型断言步骤，重放时与普通 d 规则一致直接忽略。
                let assertCount = 0;
                for (const a of sheetAsserts) {
                    try { this.hyp(assertToAST(a)); assertCount++; } catch (e) { if ((e as HSErrorInfo)?.type === "assertNeverFail") continue; throw e; }
                }
                const commands = generator.generateStep(templateRule, templateProp, isMcptTemplate, targetIsStep, assertCount);
                this.fromCmd(commands.map(command => new HSParser().parse(command, "cmd")));
                steps = this.props.slice(0);
            } finally {
                this.loadContext(saved);
            }
            rule = new Deduction(new Set, dname, [], data.conditions.map(c => c.ast.clone()), p.ast.clone(), steps);
        } else {
            try { rule = this.getD(dname); } catch (e) { throw HSError.expandFail(e); }
            if (!rule.step?.length) throw HSError.atomicStep(dname);
            steps = rule.step;
        }

        // p所在的列表与位置
        const list = p.parent ? p.parent.children! : this.props;
        const idx = list.indexOf(p);
        if (idx < 0) throw HSError.expandFail(HSError.notInList);

        // 从实际条件重新匹配规则条件模板，恢复宏规则元变量的绑定
        // （d()保存的replaceValues只含结论独有的元变量，条件中的元变量由匹配确定）；
        // mcpt 无条件且 wff 已实例化（replaceValues 里的 $ 不能再当模板替换键，否则会把
        // 步骤里的字面 $ 误替换成整个 wff），因此 rv 置空）
        const rv: MatchTable = isMcpt ? {} : Object.assign({}, data.replaceValues);
        try {
            const assertions = this.getAsserts();
            for (let i = 0; i < (rule?.conditions.length ?? 0); i++) {
                const cond = data.conditions[i];
                this.ref_addCaptureScopeToAST(cond.ast, this.captureScope(p.parent, cond, assertions)).match(rule!.conditions[i], rv);
            }
        } catch (e) { throw HSError.expandFail(e); }

        // 展平为前序遍历（与delP重建时flatProps的顺序一致），逐条重放
        const flat: Proposition[] = [];
        const iterFlat = (arr: Proposition[]) => {
            for (const sp of arr) {
                flat.push(sp);
                if (sp.children) iterFlat(sp.children);
            }
        };
        iterFlat(steps);
        // 结论步骤 = 宏步骤树中最后一个prop（前序遍历，即宏规则结论），将复用为p本身
        let lastStepProp = flat[flat.length - 1];

        // 移除p及其后的props（暂时），展开步骤会addP到p所在位置
        const rest = list.splice(idx);
        const savedActive = this.activeProp;
        if (p.parent) this.cd(p.parent); else this.clearActiveDir();
        // step旧对象 -> 当前上下文新对象的映射
        const oldNew = new Map<Proposition, Proposition>();
        const newFolders: Proposition[] = [];
        // ---- 局部变量（#开头）冲突重命名 ----
        // 若规则步骤的replaceValues含#局部变量，且展开前推理表中已有同名局部变量，
        // 则把步骤中的该局部变量重命名（后面加数字/数字+1直到fresh），避免展开时冲突。
        const localRename = new Map<string, string>();
        const freshLocal = (name: string): string => {
            // 尝试后面加数字；若已以数字结尾则数字+1，直到与表中局部变量及已分配新名不冲突
            const m = name.match(/^(.*?)(\d*)$/);
            const base = m?.[1] ?? name;
            let num = m?.[2] ?? "";
            let cand = num === "" ? base + "1" : base + (parseInt(num, 10) + 1);
            while (tableLocals.has(cand)) {
                const m2 = cand.match(/^(.*?)(\d*)$/);
                const b2 = m2?.[1] ?? cand;
                const n2 = m2?.[2] ?? "";
                cand = n2 === "" ? b2 + "1" : b2 + (parseInt(n2, 10) + 1);
            }
            return cand;
        };
        // 收集推理表中已存在的局部变量（其实只用管p自身以及它的依赖）
        // 步骤里的同名局部变量必须避开，否则展开后冲突）
        const tableLocals = p.ast.getLocalvars();
        p.relyBefore?.forEach(e => e.ast.getLocalvars(tableLocals));
        // 扫描规则所有步骤的replaceValues中的局部变量
        const locals = new Set<string>();
        for (const sp of flat) {
            if (sp.from.type === "d") {
                for (const val of Object.values(sp.from.data.replaceValues)) {
                    val.getLocalvars(locals);
                }
            } else if (sp.from.type === "c" || sp.from.type === "v") {
                sp.ast.getLocalvars(locals);
            }
        }
        for (const lv of locals) {
            if (tableLocals.has(lv) && !localRename.has(lv)) {
                localRename.set(lv, freshLocal(lv));
                tableLocals.add(localRename.get(lv)!);
            }
        }
        try {
            // 开头a/h映射：a直接忽略；h（数量与rule.conditions对应）换成实际条件命题
            let i = 0, hIdx = 0;
            for (; i < flat.length; i++) {
                const sp = flat[i];
                if (sp.from.type === "a") continue;
                if (sp.from.type !== "h" || hIdx >= (rule?.conditions.length ?? 0)) break;
                oldNew.set(sp, data.conditions[hIdx++]);
            }
            // 其余步骤逐条重放（steps严格按a/h/其它的顺序，中间与文件夹内不会有h）
            for (; i < flat.length; i++) {
                const sp = flat[i];
                // 先退出到sp应处的层级（参考delP的while(pop)）：宏根级步骤在p原本所在层级，文件夹子步骤在其重放出的文件夹内
                const desiredParent = sp.parent ? (oldNew.get(sp.parent) ?? p.parent) : p.parent;
                while (this.activeProp && this.activeProp !== desiredParent) this.pop();
                this.replayStepProp(sp, rv, oldNew, sp === lastStepProp ? p : null, newFolders, localRename);
            }
        } catch (e) {
            // 回滚：清掉展开新增的props，恢复原列表
            list.splice(idx);
            list.push(...rest);
            if (this.activeProp !== savedActive) {
                if (savedActive) this.cd(savedActive); else this.clearActiveDir();
            }
            this.updatePropIdx();
            this.updateReplvars();
            throw e;
        }
        // 放回p之后的props（p已被复用为结论步骤，留在展开结果中）
        list.push(...rest.slice(1));
        // 恢复active状态并重新编号
        if (this.activeProp !== savedActive) {
            if (savedActive) this.cd(savedActive); else this.clearActiveDir();
        }
        this.updatePropIdx();
        this.updateReplvars();
        return newFolders;
    }
    // mcpt 肢解：lazy 调用 MCPT.check(true) 生成命令序列（假设推理表为空环境的 string[] 命令），
    // 在全新空环境中执行得到 Proposition 步骤，供 expand() 重放。
    private genMcptSteps(wff: AST | undefined): Proposition[] {
        if (!wff) throw HSError.expandFail(HSError.emptyValue);
        const m = new MCPT(wff.clone());
        // 非重言式抛 mcptFalse；生成 this.steps（string[] 命令）
        const cmdStrs = m.check(true)!;
        const saved = this.saveContext();
        this.loadContext(this.createEmptyContext());
        try {
            this.clear();
            for (const s of cmdStrs) {
                const cmd = new HSParser().parse(s, "cmd");
                this.fromCmd([cmd]);
            }
            // 树尾结论应等于 wff，否则说明生成/执行失败
            const last = this.getLastChildP(null);
            if (!last || !last.ast.equal(wff)) throw HSError.conclusionMismatch;
            return this.props.slice(0);
        } catch (e) {
            throw HSError.expandFail(e);
        } finally {
            this.loadContext(saved);
        }
    }
    // 生成 ">" 规则 step（演绎元定理）：把 d 的最后条件变为 cond 文件夹，
    // d 的其余步骤全部重放进 cond 层级，使结论带上该条件（a,b⊢c → a⊢b→c）。
    // d 有 step → 重放其步骤；d 无 step（原子规则，如 >mp）→ 直接在 cond 内应用 d 本身。
    private genDeductStep(d: Deduction, c: AST): Proposition[] {
        const saved = this.saveContext();
        this.loadContext(this.createEmptyContext());
        try {
            this.clear();
            // 断言直接复制
            for (const a of d.assertions) {
                try { this.hyp(assertToAST(a)); } catch (e) { if ((e as HSErrorInfo)?.type === "assertNeverFail") continue; throw e; }
            }
            // 前 n-1 个条件 hyp（保留）
            const condHyps = d.conditions.slice(0, -1).map(cc => this.hyp(cc.clone()));
            // 最后条件作为 cond 文件夹（addP 后自动进入）
            const cf = this.c(c.clone());
            // rv 默认：replaceNames 映射自身（模板）
            const rv: MatchTable = {};
            for (const [name, isItem] of d.replaceNames) rv[name] = new AST(isItem ? NodeType.ATOM_ITEM : NodeType.ATOM_WFF, name);
            if (!d.step?.length) {
                // 原子规则（如 >mp = $1→$2 ⊢ $1→$2）：cond 内直接用 d（cf 充当最后条件）
                // >mp step = [hyp $1→$2, cond $1, d mp 1 2]
                this.d(d, [...condHyps, cf], rv);
            } else {
                // 展平 d.step 前序，重放（复用 expand 的线性重放）
                const flat: Proposition[] = [];
                const iterFlat = (arr: Proposition[]) => { for (const sp of arr) { flat.push(sp); if (sp.children) iterFlat(sp.children); } };
                iterFlat(d.step);
                const oldNew = new Map<Proposition, Proposition>();
                // 开头 a/h 映射：前 n-1 个 h → 对应 condHyps；最后一个 h → cond 文件夹 cf
                let i = 0, hIdx = 0;
                for (; i < flat.length; i++) {
                    const sp = flat[i];
                    if (sp.from.type === "a") continue;
                    if (sp.from.type !== "h" || hIdx >= d.conditions.length) break;
                    oldNew.set(sp, hIdx < condHyps.length ? condHyps[hIdx] : cf);
                    hIdx++;
                }
                // 其余步骤逐条重放（根级步骤锚定 cf，文件夹子步骤锚定重放出的文件夹）
                for (; i < flat.length; i++) {
                    const sp = flat[i];
                    const desiredParent = sp.parent ? (oldNew.get(sp.parent) ?? cf) : cf;
                    while (this.activeProp && this.activeProp !== desiredParent) this.pop();
                    this.replayStepProp(sp, rv, oldNew);
                }
            }
            // 验证：树尾的完整语义（capture 上 cond 层级）应等于 c → d.conclusion
            const lastP = this.getLastChildP(null);
            if (!lastP) throw HSError.conclusionMismatch;
            const asserts = this.getAsserts();
            const k = this.ref_addCaptureScopeToAST(lastP.ast, this.captureScope(null, lastP, asserts));
            if (!k.equal(new AST(NodeType.LOGIC, ">", c.clone(), d.conclusion.clone()))) throw HSError.conclusionMismatch;
            const steps = this.props.slice(0);
            this.loadContext(saved);
            return steps;
        } catch (e) {
            // 局部异常：只含 cause 和已生成步骤，规则名前缀由 getD 补全
            let cmdsStr = "";
            try { cmdsStr = this.genCmd(this.props).join(";"); } catch { }
            this.loadContext(saved);
            console.log(`[Deductrium] genDeductStep failed:`, e, "\nsteps:", cmdsStr);
            throw HSError.genStepFail("", e, cmdsStr);
        }
    }
    // 肢解文件夹：f直接放出来删文件夹；c/v把子命题包裹后提升到父层级。返回新建文件夹列表
    private expandFolder(p: Proposition): Proposition[] {
        const type = p.from.type;
        const newFolders: Proposition[] = [];
        // f：无逻辑语义，内容直接放出（子对象不变，外部引用仍有效），只删这一层
        if (type === "f") {
            const list = p.parent ? p.parent.children! : this.props;
            const idx = list.indexOf(p);
            if (idx < 0) throw HSError.expandFail(HSError.notInList);
            const children = p.children || [];
            list.splice(idx, 1, ...children);
            p.children = [];
            // 提升出的子文件夹保持展开
            children.forEach(c => { if (c.children) newFolders.push(c); });
            this.updatePropIdx();
            this.updateReplvars();
            return newFolders;
        }
        // c / v：整表重建（delP式）。把p的内容提升并包裹（每个子命题前面多上条件/量词），
        // 后续引用通过map自动映射，且所有ast都被重算。
        const type2 = type as "c" | "v";
        const children = p.children || [];
        // 若内部还有 c/v 文件夹：直接拒绝肢解（嵌套wrap会导致内部d步骤capture外部步骤被加条件/量词，推理失败）
        const hasNestedCV = children.some(c => c.children && (c.from.type === "c" || c.from.type === "v"));
        if (hasNestedCV) throw HSError.expandFail(HSError.nestedCVFolder);
        // 若内部（含嵌套层级）有 mcpt 步骤：拒绝肢解（mcpt 是特殊元规则，c/v 提升时
        // 无法为其生成 c:mcpt/v:mcpt 包装规则，会报"未知规则 mcpt"；提示玩家先肢解 mcpt）
        const hasMcpt = (() => {
            const iter = (arr: Proposition[]): boolean => {
                for (const c of arr) {
                    if (c.from.type === "d" && c.from.data.deduction.type === NodeType.ATOM_DNAME && c.from.data.deduction.name === "mcpt") return true;
                    if (c.children && iter(c.children)) return true;
                }
                return false;
            };
            return iter(children);
        })();
        if (hasMcpt) throw HSError.expandFail(HSError.mcptInCVFolder);
        const ctx = this.saveContext();
        const isInP = (op: Proposition) => { let par: Proposition | null = op; while (par) { if (par === p) return true; par = par.parent; } return false; };
        const before: Proposition[] = [];
        const after: Proposition[] = [];
        for (let id = 1; ; id++) {
            const op = ctx.flatProps.get(String(id));
            if (!op || op === p) break;
            if (!isInP(op)) before.push(op);
        }
        for (let id = p.id + 1; ; id++) {
            const op = ctx.flatProps.get(String(id));
            if (!op) break;
            if (!isInP(op)) after.push(op);
        }
        const savedActive = ctx.activeProp;
        const propsBackup = this.props.slice();
        // 原地清空（保持数组引用不变，视图/存档依赖同一数组）
        this.props.length = 0;
        this.flatProps.clear();
        this.activeProp = null;
        this.replvarVars.clear();
        this.replvars.clear();
        const map = new Map<Proposition, Proposition>();
        const liftMap = new Map<Proposition, Proposition>();
        let lastLifted: Proposition | null = null;
        try {
            const navigateTo = (parent: Proposition | null) => {
                const desired = parent ? map.get(parent) : null;
                while (this.activeProp && this.activeProp !== desired) this.pop();
            };
            // 重放p之前的props
            for (const op of before) {
                navigateTo(op.parent);
                map.set(op, this.replayProp(op, map, new Map(), null, newFolders));
            }
            // 提升p的children（此时active在p.parent层级）
            navigateTo(p.parent);
            const desiredParent = p.parent;
            // 内部d步骤引用folder自身时生成 .i 提升产物（xxx→xxx）：用现成的relyAfter查
            let selfLift: Proposition | null = null;
            const insideRefs = (p.relyAfter || []).filter(r => r.parent === p || isInP(r));
            if (insideRefs.length) {
                // .i 可能被用户重命名，用实际名称
                const iName = this.getSysRuleName(".i");
                selfLift = this.d(this.getD(new AST(NodeType.ATOM_DNAME, iName)), [], { $: p.ast.clone() });
                newFolders.push(selfLift);
            }
            for (const child of children) {
                if (child.from.type === "d") {
                    const lifted = this.liftDStep(child, type2, p.ast, liftMap, map, p, selfLift);
                    liftMap.set(child, lifted);
                    lastLifted = lifted;
                } else if (child.children) {
                    // 嵌套文件夹：不进入，包一层同类型文件夹（condAst为条件/变量）
                    const wrapper = type2 === "c" ? this.c(p.ast.clone()) : this.v(p.ast.clone());
                    wrapper.children!.push(child);
                    child.parent = wrapper;
                    liftMap.set(child, wrapper);
                    lastLifted = wrapper;
                    newFolders.push(wrapper);
                    // addP会自动进入wrapper，退出到外层
                    while (this.activeProp && this.activeProp !== (desiredParent ? map.get(desiredParent) : null)) this.pop();
                } else {
                    liftMap.set(child, child);
                    lastLifted = child;
                }
            }
            // 重放p之后的props（引用映射到提升后的对象）
            if (lastLifted) liftMap.set(p, lastLifted);
            for (const op of after) {
                navigateTo(op.parent);
                map.set(op, this.replayProp(op, map, liftMap, lastLifted, newFolders));
            }
            // 恢复active状态（p被删除，其父级为active；其它按map）
            const newActive = savedActive === p ? (p.parent ? map.get(p.parent) : null) : map.get(savedActive!);
            if (newActive) this.cd(newActive); else this.clearActiveDir();
            p.children = [];
            this.updatePropIdx();
            this.updateReplvars();
            return newFolders;
        } catch (e) {
            // 回滚：恢复原内容（同一数组引用）
            this.props.length = 0;
            this.props.push(...propsBackup);
            this.activeProp = savedActive;
            this.updatePropIdx();
            this.updateReplvars();
            throw e;
        }
    }
    // 重放一个旧prop到当前context（delP式重建用）；liftMap/lastLifted用于映射被提升的文件夹内容
    private replayProp(op: Proposition, map: Map<Proposition, Proposition>, liftMap: Map<Proposition, Proposition> = new Map(), lastLifted: Proposition | null = null, newFolders: Proposition[] = []): Proposition {
        if (op.from.type === "a" || op.from.type === "h") return this.hyp(op.ast);
        if (op.from.type === "c") { const r = this.c(op.ast); newFolders.push(r); return r; }
        if (op.from.type === "v") { const r = this.v(op.ast); newFolders.push(r); return r; }
        if (op.from.type === "f") return this.f(new AST(NodeType.ATOM_ITEM, op.name));
        const data = (op.from as { type: "d", data: DeductionStep }).data;
        const conds = data.conditions.map(c => {
            if (liftMap.has(c)) return liftMap.get(c)!;
            const m = map.get(c);
            if (m) return m;
            return c;
        });
        if (this.isMsbtDname(data.deduction)) {
            return this.replayMsbtStep(data, {}, conds, new Map());
        }
        if (data.deduction.type === NodeType.ATOM_DNAME && data.deduction.name === "mcpt") {
            const wff = data.replaceValues["$"];
            if (!wff) throw HSError.emptyValue;
            return this.mcpt(wff.clone());
        }
        if (data.deduction.type === NodeType.ATOM_DNAME && data.deduction.name === "mcnt") {
            const args: AST[] = [];
            if (data.replaceValues["$t"]) args.push(data.replaceValues["$t"].clone());
            else args.push(new AST(NodeType.ATOM_ITEM, String(conds[conds.length - 1].id)));
            args.push(data.replaceValues["$i"].clone());
            return this.mcnt(args);
        }
        return this.d(this.getD(data.deduction), conds, data.replaceValues);
    }
    // 提升c/v文件夹内的一个d步骤：规则名加c/v前缀；条件在文件夹内则保留(liftMap映射)，
    // 在外面则补<a1/<a6组合；条件引用文件夹自身时用 selfLift（cond .i 的 xxx→xxx）
    private liftDStep(sp: Proposition, type: "c" | "v", condAst: AST, liftMap: Map<Proposition, Proposition>, map: Map<Proposition, Proposition>, folder: Proposition, selfLift: Proposition | null): Proposition {
        const data = (sp.from as { type: "d", data: DeductionStep }).data;
        const dname = data.deduction;
        const conds = data.conditions;
        const rv = data.replaceValues;
        const isInside = (c: Proposition) => {
            // 文件夹自身也算"在这个层级里面"（其提升产物为 .i 结果 xxx→xxx）
            if (c === folder) return true;
            let par = c.parent;
            while (par) { if (par === folder) return true; par = par.parent; }
            return false;
        };
        const insideFlags = conds.map(c => isInside(c));
        const hasOutside = insideFlags.some(f => !f);
        // 新规则名：无外部条件 -> c:r / v:r；有外部条件 -> (c:r)(#...,<a1...)
        let newDname: AST;
        if (!hasOutside) {
            newDname = new AST(NodeType.NODE_DNAME, type, dname);
        } else {
            const args: AST[] = conds.map((_, i) => insideFlags[i]
                ? new AST(NodeType.ATOM_DNAME, "#")
                : new AST(NodeType.NODE_DNAME, "<", new AST(NodeType.ATOM_DNAME, type === "c" ? "a1" : "a6")));
            // 省略后面的参数#
            while (true) {
                const a = args.pop(); if (!a) break;
                if (a?.name === "#" && a.type === NodeType.ATOM_DNAME) continue;
                args.push(a); break;
            }
            newDname = new AST(NodeType.NODE_DNAME, "", new AST(NodeType.NODE_DNAME, type, dname), ...args);
        }
        const newRule = this.getD(newDname);
        const newConds = conds.map((c, i) => {
            if (c === folder) {
                return selfLift!;
            }
            if (insideFlags[i]) return (liftMap.get(c) ?? map.get(c) ?? c);
            return (map.get(c) ?? c);
        });
        // 组合规则内部变量被fresh重命名，原rv键(nameMap的键)映射到组合后的变量名
        const newRv: MatchTable = {};
        const nm = newRule.nameMap;
        for (const [name, val] of Object.entries(rv)) {
            const mapped = nm?.[name];
            if (mapped) {
                if (mapped.type === NodeType.ATOM_WFF || mapped.type === NodeType.ATOM_ITEM || mapped.type === NodeType.ATOM_UKNOWN) {
                    newRv[mapped.name] = val.clone();
                } else {
                    throw HSError.expandFail(HSError.liftCompositeVar);
                }
            } else {
                newRv[name] = val.clone();
            }
        }
        // c/v包装引入的新鲜变量（c:$c→(..) / v:∀$v:(..)）：填条件/变量
        const wrapVar = newRule.conclusion.nodes[0].name;
        if (newRule.replaceNames.some(([n]) => n === wrapVar) && !newRv[wrapVar]) newRv[wrapVar] = condAst.clone();
        // 组合情形：若还有未映射的结论独有变量则报错（罕见）
        if (hasOutside) {
            for (const [name] of newRule.replaceNames) {
                if (!newRv[name]) throw HSError.expandFail(HSError.liftConclusionVar);
            }
        }
        return this.d(newRule, newConds, newRv);
    }
    // 重放宏规则step中的一步；reuse指定时把结果写入该命题对象（结论步骤复用p，使后续依赖自动指向结论）
    private replayStepProp(sp: Proposition, rv: MatchTable, propMap: Map<Proposition, Proposition>, reuse: Proposition | null = null, newFolders: Proposition[] = [], localRename: Map<string, string> = new Map()) {
        let newP: Proposition;
        const ren = (ast: AST) => localRename.size ? ast.renameLocalVars_mut(localRename) : ast;
        if (sp.from.type === "h") {
            newP = this.hyp(ren(sp.ast.clone()).mut_replaceByMatchTable(rv));
        } else if (sp.from.type === "c" || sp.from.type === "v") {
            newP = this[sp.from.type](ren(sp.ast.clone()).mut_replaceByMatchTable(rv));
            newFolders.push(newP);
        } else if (sp.from.type === "f") {
            newP = this.f(new AST(NodeType.ATOM_ITEM, sp.name));
        } else if (sp.from.type === "d") {
            const ddata = sp.from.data;
            const conds = ddata.conditions.map(c => propMap.get(c));
            if (conds.some(c => !c)) throw HSError.expandFail(HSError.unmappedStepProp);
            if (this.isMsbtDname(ddata.deduction)) {
                // msbt 是元规则：不经过 getD，按步骤存储的命令数据重建并执行（含替换索引重算）
                newP = this.replayMsbtStep(ddata, rv, conds as Proposition[], localRename);
            } else if (ddata.deduction.type === NodeType.ATOM_DNAME && ddata.deduction.name === "mcpt") {
                // mcpt 是元规则：不经过 getD，与一般d步骤一样直接对 replaceValues 应用宏绑定 rv
                const rv2: MatchTable = {};
                for (const [name, val] of Object.entries(ddata.replaceValues)) {
                    rv2[name] = ren(val.clone()).mut_replaceByMatchTable(rv);
                }
                newP = this.mcpt(rv2["$"]);
            } else if (ddata.deduction.type === NodeType.ATOM_DNAME && ddata.deduction.name === "mcnt") {
                // mcnt 是元规则：对 $t/$i 应用宏绑定 rv 后重建命令执行
                const rv2: MatchTable = {};
                for (const [name, val] of Object.entries(ddata.replaceValues)) {
                    rv2[name] = ren(val.clone()).mut_replaceByMatchTable(rv);
                }
                const args: AST[] = [];
                if (rv2["$t"]) args.push(rv2["$t"].clone());
                else args.push(new AST(NodeType.ATOM_ITEM, String((conds as Proposition[])[(conds as Proposition[]).length - 1].id)));
                args.push(rv2["$i"].clone());
                newP = this.mcnt(args);
            } else {
                const rv2: MatchTable = {};
                for (const [name, val] of Object.entries(ddata.replaceValues)) {
                    rv2[name] = ren(val.clone()).mut_replaceByMatchTable(rv);
                }
                newP = this.d(this.getD(ddata.deduction), conds as Proposition[], rv2);
            }
        } else throw "can't reach"; // a类型不会出现在step中
        if (reuse) {
            // 把newP的内容转移给reuse（保留reuse的uuid），并在所在列表原位替换newP
            reuse.ast = newP.ast;
            reuse.from = newP.from;
            reuse.name = newP.name;
            reuse.children = newP.children;
            reuse.active = newP.active;
            const npList = newP.parent ? newP.parent.children! : this.props;
            npList[npList.indexOf(newP)] = reuse;
            reuse.parent = newP.parent;
            if (this.activeProp === newP) this.activeProp = reuse;
            newP = reuse;
        }
        propMap.set(sp, newP);
    }
    // 重放 msbt 步骤（规则肢解时）：按步骤存储的命令数据重建 msbt 命令并执行。
    // rv（规则宏绑定）会替换模板/目标/索引里的所有元变量；其中替换索引必须重算：
    // 录制时索引（0=全部等）是在"未替换"的目标上匹配得到的，rv 替换后目标可能产生
    // 录制时没有的新匹配（原本不匹配的元变量被宏填入而匹配），直接沿用会误替换。
    // 重算逻辑见 MSBT.reindexAfterReplace（记录原匹配绝对位置 → 替换后反查新索引）。
    private replayMsbtStep(ddata: DeductionStep, rv: MatchTable, conds: Proposition[], localRename: Map<string, string>): Proposition {
        const ren = (ast: AST) => localRename.size ? ast.renameLocalVars_mut(localRename) : ast;
        const rv2: MatchTable = {};
        for (const [name, val] of Object.entries(ddata.replaceValues)) rv2[name] = ren(val.clone()).mut_replaceByMatchTable(rv);
        const dname = ddata.deduction;
        const isNode = dname.type === NodeType.NODE_DNAME;
        const inner = isNode ? (dname.nodes[1] as AST) : null;
        const right = (isNode ? (dname.nodes[0] as AST).name : dname.name) === "msbt>";
        // ---- 还原格式与模板：格式1(规则名)/格式2(mcpt)模板存于$p、格式3(步骤)模板=conditions[0] ----
        const isMcpt = !!(inner && inner.name === "mcpt");
        const isRuleFmt = !!inner && !isMcpt;
        let template: AST;      // 录制时模板（含规则元变量）
        let newTemplate: AST;   // 替换后模板（执行时实际使用的）
        let exactMatch: boolean;
        if (isMcpt) {
            template = ddata.replaceValues["$p"]!;
            newTemplate = rv2["$p"]!;
            exactMatch = false;
        } else if (isRuleFmt) {
            // 规则结论作模板：不随外规则rv改变（msbt() 内部会重新 getD 取结论）
            template = this.getD(inner).conclusion.clone();
            newTemplate = template.clone();
            exactMatch = false;
        } else {
            template = ddata.conditions[0].ast;
            newTemplate = conds[0].ast;
            exactMatch = true;
        }
        // ---- 目标：wff（存于$t）或推理步骤（conditions最后一个） ----
        const hasT = !!rv2["$t"];
        const originTarget = hasT ? ddata.replaceValues["$t"]! : ddata.conditions[ddata.conditions.length - 1].ast;
        const newTargetAst = hasT ? rv2["$t"]! : conds[conds.length - 1].ast;
        // ---- 替换索引重算 ----
        const newIdx = MSBT.reindexAfterReplace(this, template, newTemplate, right, exactMatch, originTarget, newTargetAst, MSBT.getsubIndices(ddata.replaceValues["$i"]!));
        // ---- 重建命令参数并执行 ----
        const args: AST[] = [dname.clone()];
        if (isMcpt) args.push(rv2["$p"]!.clone());
        if (!isMcpt && !isRuleFmt) args.push(new AST(NodeType.ATOM_ITEM, String(conds[0].id)));
        if (hasT) args.push(rv2["$t"]!.clone());
        else args.push(new AST(NodeType.ATOM_ITEM, String(conds[conds.length - 1].id)));
        args.push(MSBT.toIndexAst(newIdx));
        return this.msbt(args);
    }
    getActiveProp() { return this.activeProp; }
    // 根据captureScope的结果添加ast表达式
    ref_addCaptureScopeToAST(ast: AST, layers: Proposition[]) {
        if (!layers.length) return ast;
        for (const l of layers) {
            if (l.from.type === "c") {
                ast = new AST(NodeType.LOGIC, ">", l.ast, ast);
            } else if (l.from.type === "v") {
                ast = new AST(NodeType.QUANT, "\\a", l.ast, ast);
            } else throw "can't reach";
        }
        return ast;
    }
    // 返回p相对于scope中的表达式需添加的条件，可能抛出异常
    captureScope(scope: Proposition | null, p: Proposition, assertions: AtomicAssertion[] = this.getAsserts()) {
        let layerToAdd: Proposition[] = [];
        let parent = p.children ? p : p.parent;
        let found = false;
        while (!found) {
            let scopeParent = scope;
            while (!found) {
                if (scopeParent === parent) { found = true; break; }
                if (scopeParent === null) break;
                scopeParent = scopeParent.parent;
            }
            if (found || parent === null) {
                while (scope !== scopeParent) {
                    if (scope!.from.type === "v") {
                        const check = Assertion.check(assertions, new NFAssertion(p.ast, new Set([scope!.ast.name]), new Set).reduce());
                        if (!check.passed) {
                            throw HSError.capturePFail(scope!, p, check.counterexample);
                        }
                    }
                    scope = (scope as Proposition).parent;
                }
                found = true; break;
            }
            if (parent.from.type !== "f") layerToAdd.push(parent);
            parent = parent.parent;
        }
        return layerToAdd;
    }
    d(deduction: Deduction, conditions: Proposition[], replaceValues: MatchTable) {
        try {
            // 加载出错的规则不允许使用（"错误规则"菜单可查看原因和原始cmd）
            if (deduction.error) {
                // cause 保留原始异常（unknown），渲染交给 LangMgr（递归翻译双语）
                throw HSError.expandFail(HSError.errRuleUsed(deduction.name.toString(), deduction.error.cause));
            }
            // mcpt：命题逻辑完备性元定理——穷举真值表验证 wff 为重言式，通过则作为结论添加
            // if (deduction.name.type === NodeType.ATOM_DNAME && deduction.name.name === "mcpt") {
            //     const wff = replaceValues["$"];
            //     if (!wff) throw HSError.deductFail("mcpt", HSError.emptyValue);
            //     new MCPT(wff).check(false);
            //     return this.addP(new Proposition(wff.clone(), {
            //         type: "d",
            //         data: { deduction: deduction.name, conditions: [], replaceValues: Object.assign({}, replaceValues) },
            //     }));
            // }
            const assertions = this.getAsserts();
            if (conditions.length !== deduction.conditions.length) throw HSError.inconsistCondNum;
            this.checkConditionsBeforeAppend(conditions);
            for (const [name, isItem] of deduction.replaceNames) {
                if (isItem) replaceValues[name]?.becomeItem();
            }
            const originReplaceValues = Object.assign({}, replaceValues);
            // 按 replaceNames 顺序重建，使 getCmd 的 Object.values 序列化与
            // fromCmd 按 replaceNames 解析的命令参数序一致（如 v.i = [x $]，而非 [$ x]）
            const orderedReplaceValues: MatchTable = {};
            for (const [name] of deduction.replaceNames) {
                if (originReplaceValues[name]) orderedReplaceValues[name] = originReplaceValues[name];
            }
            for (const [name, val] of Object.entries(originReplaceValues)) {
                if (!orderedReplaceValues[name]) orderedReplaceValues[name] = val;
            }
            for (let i = 0; i < conditions.length; i++) {
                const cond = conditions[i];
                if (!cond) throw HSError.matchCond(i, HSError.emptyValue);
                if (cond.from.type !== "h" && cond.from.type !== "d" && cond.from.type !== "c") throw HSError.matchCond(i + 1, HSError.isNotWFF(cond.ast));
                try {
                    // capture closure for c and v and match
                    this.ref_addCaptureScopeToAST(
                        cond.ast, this.captureScope(this.activeProp, cond, assertions)
                    ).match(deduction.conditions[i], replaceValues)
                } catch (e) { throw HSError.matchCond(i + 1, e); }
            }
            for (let i = 0; i < deduction.assertions.length; i++) {
                try {
                    const constraint = Assertion.fromAtomic(deduction.assertions[i]).mut_replaceByMatchTable(replaceValues).reduce();
                    const check = Assertion.check(assertions, constraint);
                    if (!check.passed) {
                        // 无 counterexample 说明断言含无法化简的#sb函数（undetermined），给出明确报错而非 undefined
                        throw check.counterexample ?? HSError.sbUndetermined;
                    }
                } catch (e) {
                    throw HSError.assertFail(i + 1, e);
                }
            }
            try {
                const res = deduction.conclusion.clone().mut_replaceByMatchTable(replaceValues);
                res.checkWFF();
                return this.addP(new Proposition(res, { type: "d", data: { deduction: deduction.name, conditions, replaceValues: orderedReplaceValues } }));
            } catch (e) { throw HSError.conclusionFail(e); }
        } catch (e) { throw HSError.deductFail(deduction.name.toString(), e); }
    }
    checkPname(name: string) {
        if (!name.match(/^[a-z][A-Za-z0-9_]*$/)) throw HSError.invalidPropName;
        if (this.flatProps.get(name)) throw HSError.nameAlreadyExist(name);
    }
    // mcpt：命题逻辑完备性元定理（特殊"元规则"，不注册为规则实体、不经过 getD）。
    // 验证 wff 为重言式后作为结论添加；内部仍用 from.type="d" 表示（deduction 名为 mcpt），
    // 由 mcpt 命令 / fromCmd 特殊处理。
    mcpt(ast: AST) {
        new MCPT(ast).check(false);
        return this.addP(new Proposition(ast.clone(), {
            type: "d",
            data: { deduction: new AST(NodeType.ATOM_DNAME, "mcpt"), conditions: [], replaceValues: { $: ast.clone() } },
        }));
    }
    // ===== msbt 替换元定理（元规则，不注册为规则实体、不经过 getD） =====
    // dname 为 msbt>/msbt<（裸，或复合 (规则名)/(mcpt)）时为真
    isMsbtDname(dname: AST): boolean {
        if (dname.type === NodeType.ATOM_DNAME) return dname.name === "msbt>" || dname.name === "msbt<";
        if (dname.type === NodeType.NODE_DNAME && dname.nodes[0]) {
            const n = dname.nodes[0].name;
            return n === "msbt>" || n === "msbt<";
        }
        return false;
    }
    // 执行 msbt（供 fromCmd / 命令UI调用）：解析模板来源与目标，计算替换结果，加入推理表（暂无step/肢解）。
    // 存储完整命令信息：deduction=复合dname、conditions=步骤引用、replaceValues=wff参数+索引，
    // 使 getCmd/renderExtra 能还原完整命令。
    msbt(args: AST[]) {
        const dname = args[0];
        const isNode = dname.type === NodeType.NODE_DNAME;
        const right = (isNode ? (dname.nodes[0] as AST).name : dname.name) === "msbt>";
        // 复合dname：nodes[1]=内层（规则名/mcpt）；裸 msbt< 无内层
        const inner = isNode ? dname.nodes[1] as AST : null;
        // ---- 解析匹配模板 ----
        let pattern: AST;
        let exactMatch: boolean;
        let targetIdx: number;
        let indexIdx: number;
        let tplProp: Proposition | null = null;   // 步骤模式的模板步骤prop
        let mcptTemplate: AST | null = null;      // mcpt模式的模板wff
        if (inner && inner.name === "mcpt") {
            // 格式2：msbt>(mcpt) 模板wff 目标 索引（模板须为重言式，replvar为通配符）
            const template = args[1];
            new MCPT(template.clone()).check(false);
            pattern = template.clone();
            exactMatch = false;
            mcptTemplate = template.clone();
            targetIdx = 2; indexIdx = 3;
        } else if (inner) {
            // 格式1：msbt>(规则名) 目标 索引（规则结论作模板，不允许带条件）
            const rule = this.getD(inner);
            if (rule.conditions.length) throw HSError.msbtRuleWithCond;
            pattern = rule.conclusion.clone();
            exactMatch = false;
            targetIdx = 1; indexIdx = 2;
        } else {
            // 格式3：裸 msbt>/msbt< 都支持“模板步骤 目标 索引”（精确匹配）。
            // 方向由 dname 决定：> 匹配等价式左侧，< 匹配等价式右侧。
            const tp = this.getP(args[1].name);
            if (!tp) throw HSError.pname404(args[1].name);
            pattern = tp.ast.clone();
            exactMatch = true;
            tplProp = tp;
            targetIdx = 2; indexIdx = 3;
        }
        if (!(pattern.type === NodeType.LOGIC && pattern.name === "<>") && !(pattern.type === NodeType.PRED && pattern.name === "="))
            throw HSError.msbtBadTemplate;
        // ---- 目标：wff 或推理步骤 ----
        const targetArg = args[targetIdx];
        const targetProp = targetArg.isAtom() ? this.getP(targetArg.name) : undefined;
        const isStep = !!targetProp && (targetProp.from.type === "d" || targetProp.from.type === "h");
        const targetAst = isStep ? targetProp!.ast.clone() : targetArg.clone();
        const genIff = !isStep;
        const subIndices = MSBT.getsubIndices(args[indexIdx]);
        // ---- 计算替换 ----
        const msbt = new MSBT(this, pattern, exactMatch, targetAst, genIff, right, this.getAsserts(), subIndices);
        // msbt 的正常执行只计算替换结果；肢解应由后续显式的展开操作触发，
        // 不能在这里因为目标是步骤就提前生成并执行递归证明。
        const result = msbt.check(false);
        // ---- 存储完整命令信息 ----
        const nameParts: AST[] = [new AST(NodeType.ATOM_DNAME, right ? "msbt>" : "msbt<")];
        if (inner) nameParts.push(inner.clone());
        const dname2 = nameParts.length > 1 ? new AST(NodeType.NODE_DNAME, "", ...nameParts) : nameParts[0];
        const conds: Proposition[] = [];
        if (tplProp) conds.push(tplProp);
        if (isStep) conds.push(targetProp!);
        const rv: MatchTable = {};
        if (mcptTemplate) rv["$p"] = mcptTemplate;
        if (!isStep) rv["$t"] = targetArg.clone();
        rv["$i"] = args[indexIdx].clone();
        // Deduction 的条件模板须与运行时 conds 数量一致（d()匹配用）
        const d = new Deduction(new Set, dname2, [], conds.map(c => c.ast.clone()), result);
        return this.d(d, conds, rv);
    }
    c(ast: AST) { return this.addP(Proposition.mkdir("c", ast)); }
    v(ast: AST) { return this.addP(Proposition.mkdir("v", ast)); }
    f(ast: AST) {
        this.checkPname(ast.name);
        return this.addP(Proposition.mkdir("f", ast));
    }
    // ===== mcnt 换名元定理（元规则，不注册为规则实体、不经过 getD） =====
    // 命令格式：mcnt 目标(wff或推理步骤) 替换规则{..}。目标为wff时结果wrap<>（原↔换名后），
    // 为步骤时结果直接是换名后的表达式。存储格式与msbt一致（$t=wff目标、$i=替换规则）。
    mcnt(args: AST[]) {
        const targetArg = args[0];
        const targetProp = targetArg.isAtom() ? this.getP(targetArg.name) : undefined;
        const isStep = !!targetProp && (targetProp.from.type === "d" || targetProp.from.type === "h");
        const targetAst = isStep ? targetProp!.ast.clone() : targetArg.clone();
        const subIndices = MCNT.getsubIndices(args[1]) ?? new Map<number, string>();
        const mc = new MCNT(targetAst, isStep ? targetProp!.id : undefined, subIndices, this.getAsserts());
        const result = mc.check(false);
        // ---- 存储完整命令信息 ----
        const conds: Proposition[] = [];
        if (isStep) conds.push(targetProp!);
        const rv: MatchTable = {};
        if (!isStep) rv["$t"] = targetArg.clone();
        rv["$i"] = args[1].clone();
        const d = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, "mcnt"), [], conds.map(c => c.ast.clone()), result);
        return this.d(d, conds, rv);
    }
    clear() {
        this.props.length = 0;
        this.flatProps.clear();
        this.activeProp = null;
        this.replvarVars.clear();
        this.replvars.clear();
    }
    allowReorder(sourceId: number, targetId: number, position: "before" | "after" | "inside") {
        console.log("src", sourceId, "dst", targetId, "pos", position);

        const src = this.flatProps.get(String(sourceId)); if (!src) return false;

        // 用小数精确标记插入位置，以便直接用不等式比较位置
        const dstId = position === "before" ? targetId - 0.5 : targetId + 0.5;
        const toRight = dstId > sourceId;
        // src可能是块，找到块的最后位置
        const srcEndId = this.getLastChildP(src)?.id || sourceId;

        // 1. 检查assert、hyp是否依次在最前，文件夹里面不允许装a和h，所以不用检查srcEnd
        const srcType = src.from.type;
        if (toRight) {
            const borderType = this.flatProps.get(String(Math.floor(dstId)))!.from.type;
            if (srcType === 'a' && borderType !== 'a') return false;
            if (srcType === 'h' && (borderType !== 'h' && borderType !== "a")) return false;
        } else {
            const borderType = this.flatProps.get(String(Math.ceil(dstId)))!.from.type;
            if (srcType !== 'a' && srcType !== 'h' && (borderType === 'a' || borderType === 'h')) return false;
            if (srcType === 'h' && (borderType === "a")) return false;
        }

        // 2. 检查块中每个元素的移动依赖性是否合法
        for (let sid = sourceId; sid <= srcEndId; sid++) {
            const prop = sid === sourceId ? src : this.flatProps.get(String(sid))!;
            const rely = toRight ? prop.relyAfter : prop.relyBefore;
            if (!rely?.length) continue;
            for (const { id } of rely) {
                // 忽略内部依赖
                if (id >= sourceId && id <= srcEndId) continue;
                // 右移时id小就非法，否则id大就非法
                if ((id > dstId) !== toRight) return false;
            }
        }

        // 3. 检查是否允许跨层级
        const dst = this.flatProps.get(String(targetId))!;
        const srcScope = src.parent;
        const dstScope = position === "inside" ? dst : dst.parent;
        // 同层级直接允许
        if (srcScope === dstScope) return true;

        // 是否允许跨层级核心是作用域的进出控制：解释一下captureScope函数（已实现，勿修改）：
        // 1.外面层级的命题可随便进入假设（.from.type="c"类型）层级，但命题进入变量（.from.type="v"类型）层级时，相当于一阶逻辑添加量词的规则，必须做自由出现断言检查，不通过就会报错。
        // 2.里面的命题拿到外面去，则会wrap上假设条件或量词。
        // 3.跨.from.type="f"的文件夹完全允许也不会wrap，因为这种文件夹单纯是方便用户管理，无逻辑语义
        // 是否能跨层级的判断标准是：
        // 1.如果src有relybefore，相当于是把replybefore的项capture到src所在的scope中，执行相应推理得到src。这种情况下把src移动到dst，其实是把每个replybefore的项capture到dst所在的scope中，再执行相应推理，所以必须要满足每个relybefore在src和dst中加上的wrap都一样（且到dst中不报错），才能允许移动。
        // 2.如果src有relyafter，相当于是把就是看把src放到target所在的层级中时，captureScope函数会不会给它加前缀或报错，只有不报错、也不加wrap（即移动操作不能更改当前命题）才能移动
        // 3.如果移动的是个文件夹（无论类型，c、f、v都可能），则要逐项检查（可忽略内部互相依赖的那些relybefore和relyafter）

        // ---- 跨层级判断AI实现 ----
        // 两次capture出的wrap必须逐层完全一致（captureScope返回的是树中实际的Proposition引用，可直接用identity比较）
        const sameWrap = (a: Proposition[], b: Proposition[]) =>
            a.length === b.length && a.every((x, i) => x === b[i]);

        // 标准3：对块内每个命题逐项检查
        for (let sid = sourceId; sid <= srcEndId; sid++) {
            const prop = sid === sourceId ? src : this.flatProps.get(String(sid))!;
            // 标准1：每个relyBefore项在srcScope与dstScope中加上的wrap必须一致（且到dstScope中不报错）
            for (const dep of prop.relyBefore || []) {
                // 忽略块内部互相依赖
                if (dep.id >= sourceId && dep.id <= srcEndId) continue;
                let wrapSrc: Proposition[];
                let wrapDst: Proposition[];
                try { wrapSrc = this.captureScope(srcScope, dep); } catch { return false; }
                try { wrapDst = this.captureScope(dstScope, dep); } catch { return false; }
                if (!sameWrap(wrapSrc, wrapDst)) return false;
            }
            // 标准2：prop放入dstScope后自身不能改变（capture不报错且不加wrap）
            if (prop.relyAfter?.length) {
                let wrap: Proposition[];
                try { wrap = this.captureScope(dstScope, prop); } catch { return false; }
                if (wrap.length > 0) return false;
            }
        }
        return true;
    }
    getLastChildP(node: Proposition | null): Proposition | null {
        let list = node === null ? this.props : node.children;
        if (!list || list.length === 0) return node;
        const lastChild = list[list.length - 1];
        return this.getLastChildP(lastChild);
    }
    checkConclusionInPropList() {
        const conc = this.getLastChildP(null);
        if (!conc) throw HSError.conclusionFail(HSError.noConclusion);
        if (conc.from.type !== "d" && conc.from.type !== "c") throw HSError.conclusionFail(HSError.noConclusion);
        if (conc.ast.getLocalvars().size) throw HSError.conclusionFail(HSError.localVarInConclusion);
        let id = 1;
        const asserts: AtomicAssertion[] = [];
        const conditions: AST[] = [];
        while (true) {
            const p = this.flatProps.get(String(id++));
            if (!p || (p.from.type !== "a" && p.from.type !== "h")) break;
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
    m(name: string) {
        if (RuleNameNotAllowedStartsWith.includes(name[0])) throw HSError.invalidRuleNameStartsWith(RuleNameNotAllowedStartsWith);
        if (this.rules.get(name)) throw HSError.nameAlreadyExist(name);
        const { asserts, conditions, conclusion } = this.checkConclusionInPropList();
        this.clearActiveDir();
        const steps = this.props.slice(0);
        const d = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), asserts, conditions, conclusion, steps);
        this.rules.set(name, d);
        this.clear();
        return d;
    }
    delP(p: Proposition) {
        let failed = false;
        if (p.from.type === "c" || p.from.type === "v") {
            // todo: 支持打包删除
            if (p.children?.length) throw HSError.delFail(p, p.children, null);
        }
        if (p.from.type !== "a") {
            if (p.relyAfter?.length) throw HSError.delFail(p, p.relyAfter, null);
        } else {
            // check all propositions in the list
            const ctx = this.saveContext();
            this.props = [];
            this.flatProps = new Map;
            this.activeProp = null;
            this.replvarVars = new Set;
            this.replvars = new Map;
            const thisId = p.id;
            let id = 1;
            try {
                while (true) {
                    if (thisId === id) id++;
                    const oldP = ctx.flatProps.get(String(id++));
                    if (!oldP) break;
                    while (this.activeProp) {
                        if ((this.activeProp as Proposition).id + 1 === oldP.parent?.id) break;
                        this.pop();
                    }
                    if (oldP.from.type === "a" || oldP.from.type === "h") {
                        const prop = this.hyp(oldP.ast);
                        if (!prop.ast.equal(oldP.ast)) throw HSError.delFail(p, [oldP], null);
                    }
                    if (oldP.from.type === "c" || oldP.from.type === "v") {
                        const prop = this[oldP.from.type](oldP.ast);
                        if (!prop.ast.equal(oldP.ast)) throw HSError.delFail(p, [oldP], null);
                    }
                    if (oldP.from.type === "d") {
                        const data = oldP.from.data;
                        const nconds = data.conditions.map(c => this.getP(String(c.id - 1))!);
                        const prop = this.d(this.getD(data.deduction), nconds, data.replaceValues);
                        if (!prop.ast.equal(oldP.ast)) throw HSError.delFail(p, [oldP], null);
                    }
                }
            } catch (e) {
                failed = true;
                // 对齐错误的临时prop id, 否则报错时的编号少1
                id = thisId;
                while (true) {
                    const p = this.flatProps.get(String(id++));
                    if (!p) break;
                    p.id++;
                }
                this.loadContext(ctx);
                throw HSError.delFail(p, [ctx.flatProps.get(String(id - 1))!], e);
            }
            this.loadContext(ctx);
        }
        if (failed) return false;
        const iter = (nodes: Proposition[]) => {
            for (const node of nodes) {
                if (node === p) {
                    nodes.splice(nodes.indexOf(node), 1);
                    return true;
                }
                if (node.children?.length && iter(node.children)) return true;
            }
            return false;
        }
        // if not found return false
        if (!iter(this.props)) return false;
        this.updatePropIdx();
        this.updateReplvars();
        return true;

    }
    clearActiveDir() {
        const iter = (p: Proposition[]) => {
            for (const prop of p) {
                if (prop.active) {
                    prop.active = false;
                }
                if (prop.children?.length) iter(prop.children);
            }
        }
        iter(this.props);
        this.activeProp = null;
    }
    cd(p: Proposition) {
        if (!p.children) {
            if (p.parent) this.cd(p.parent); else this.clearActiveDir();
            return;
        }
        this.clearActiveDir();
        p.active = true;
        this.activeProp = p;
    }
    pop() {
        if (this.activeProp === null) return;
        this.activeProp.active = false;
        if (this.activeProp.parent) this.activeProp.parent.active = true;
        this.activeProp = this.activeProp.parent;
    }
    genCmd(props: Proposition[] = this.props) {
        let flatProps = this.flatProps;
        if (props !== this.props) {
            // get flatprops
            let idx = 1;
            flatProps = new Map;
            const iter = (arr: Proposition[]) => {
                for (const p of arr) {
                    flatProps.set(String(idx++), p);
                    if (p.children) iter(p.children);
                }
            }
            iter(props);
        }
        let id = 1;
        const cmds: string[] = [];
        let lastP: Proposition | null = null;
        while (true) {
            const p = flatProps.get(String(id++));
            if (!p) break;
            let parent = p.parent;
            // 第一条或更深都不用管，否则cd到parent
            if (lastP && parent !== lastP && parent !== lastP.parent) {
                cmds.push('cd ' + (parent?.id || "0"));
            }
            cmds.push(p.getCmd());
            if (p.name && p.from.type !== "f") cmds.push(`name ${p.id} ${p.name}`);
            lastP = p;
        }
        return cmds;
    }
    fromCmd(cmds: AST[]) {
        for (const cmd of cmds) {
            if (!cmd) return;
            const name = cmd.name;
            const args = cmd.nodes;
            if (name === "hyp") this.hyp(args[0]);
            if (name === "mcpt") this.mcpt(args[0]);
            if (name === "mcnt") this.mcnt(args);
            if (name === "pop") this.pop();
            if (name === "d") {
                // msbt 是元规则：d 命令下 dname 为 msbt>/msbt< 时走 msbt()，不经过 getD
                if (this.isMsbtDname(args[0])) { this.msbt(args); continue; }
                const rule = this.getD(args[0]);
                const conds = args.slice(1, rule.conditions.length + 1).map(e => this.getP(e.name)!);
                const replaceValues = Object.fromEntries(args.slice(rule.conditions.length + 1).map((e, idx) => [rule.replaceNames[idx][0], e]));
                this.d(rule, conds, replaceValues);
            }
            if (name === "cond" || name === "var" || name === "dir") {
                this[name === "dir" ? "f" : name[0] as "c" | "v"](args[0]);
            }
            if (name === "cd") {
                if (args[0].name === "0") this.clearActiveDir();
                else this.cd(this.getP(args[0].name)!);
            }
            if (name === "m") this.m(args[0].name);
            if (name === "name") {
                // genCmd会把非文件夹命题的name序列化成 "name <id> <名字>"，重放时还原
                const p = this.getP(args[0].name);
                if (!p) throw HSError.pname404(args[0].name);
                if (args[1].name === "." || args[1].name === "/" || args[1].name === "\\" || args[1].name === "0") {
                    p.name = "";
                } else {
                    this.checkPname(args[1].name);
                    p.name = args[1].name;
                }
            }
        }
    }
    // 在宿主当前上下文中重放一组步骤（CombineHost.replaySteps 实现）。
    // 供 genQuantStep 无条件分支把原规则 step 包进 var 文件夹。
    // 用引用映射重放（同 expand/genDeductStep），不能用 genCmd/fromCmd——
    // 命令里的 id 基于原 step 树，重放到新上下文后 id 会错位。
    replaySteps(steps: Proposition[]) {
        const flat: Proposition[] = [];
        const iterFlat = (arr: Proposition[]) => {
            for (const sp of arr) {
                flat.push(sp);
                if (sp.children) iterFlat(sp.children);
            }
        };
        iterFlat(steps);
        const oldNew = new Map<Proposition, Proposition>();
        // a（断言）跳过；无条件规则的 step 无 h；其余逐条重放，锚定 var 文件夹（当前 active）
        for (const sp of flat) {
            if (sp.from.type === "a") continue;
            const desiredParent = sp.parent ? (oldNew.get(sp.parent) ?? this.activeProp) : this.activeProp;
            while (this.activeProp && this.activeProp !== desiredParent) this.pop();
            this.replayStepProp(sp, {}, oldNew);
        }
    }
}
