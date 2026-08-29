import { HSParser } from "./core/parser.js";
import { highlightHTML, SyntaxEditor, SyntaxViewer } from "../astrender.js";
import { TreeListViewer, makeResizable } from "../listmgr.js";
import { CommandUIManager, defineCommand, ExecutionEngine, getCommand } from "./gui/cmdmgr.js";
import { AST } from "./core/ast.js";
import { Deduction } from "./core/deduction.js";
import { HilbertSystem } from "./core/core.js";
import { HSError } from "./core/error.js";
import { AtomSolver } from "./core/assert.js";
import { MSBT, MCNT } from "./core/combine.js";
import { NodeType } from "../asttype.js";
import { LangMgr } from "../lang.js";
import { Serde } from "./serde.js";
import { SheetGui } from "./gui/sheet.js";
import { initialCreativeRules, initialSurvivalRules } from "./core/initial.js";
// a/d 开头的公理规则在存档中只存名称占位（name:ax:.），内容以初始定义为准：
// 这样存档体积小、作者更新 init 规则后玩家无需重置存档。
// 此处预解析 init 文本，构建 名字→完整规则行 的映射供占位符恢复。
const initRuleDefs = new Map();
for (const text of [initialCreativeRules, initialSurvivalRules]) {
    for (const line of text.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("//") || t.startsWith("{") || t.startsWith("}"))
            continue;
        const ci = t.indexOf(":");
        if (ci <= 0)
            continue;
        const name = t.slice(0, ci).trim();
        const rest = t.slice(ci + 1).trim();
        if (/^[ad]/.test(name) && rest.startsWith("ax:"))
            initRuleDefs.set(name, t);
    }
}
export class HSLayer {
    hilbertSystem = new HilbertSystem;
    ruleList = [];
    activeRuleFolder = null;
    ruleListView = new TreeListViewer(this.ruleList, document.getElementById('ruleList'));
    propListView = new TreeListViewer(this.hilbertSystem.props, document.getElementById('propList'));
    cmdEngine = new ExecutionEngine();
    cmdInput = new SyntaxEditor(document.getElementById('hs-cmd-input'), new HSParser, "", 'cmds');
    cmdUIMgr;
    serde = new Serde(this, this.hilbertSystem, this.ruleList, this.propListView, this.ruleListView);
    sheetGui = new SheetGui(this.hilbertSystem);
    onchange;
    getSheetGui() { return this.sheetGui; }
    // [p]门判定：任意sheet满足（无断言/假设 + 某步骤wrap后ast等于目标）
    // 步骤在 c/v 文件夹内时，ast 需包上相应条件/量词（captureScope 得层级再 wrap）
    checkPropGate(ast) {
        const gui = this.sheetGui;
        gui.saveCurrentSheet(); // 激活sheet ctx 最新
        const saved = this.hilbertSystem.saveContext();
        try {
            for (const sheet of gui.sheets) {
                this.hilbertSystem.loadContext(sheet.ctx);
                // 1. 无 hyp 命令（断言 a / 假设 h 都不能有）
                const hasHyp = (list) => list.some(p => p.from.type === "a" || p.from.type === "h" || (p.children ? hasHyp(p.children) : false));
                if (hasHyp(sheet.ctx.props))
                    continue;
                // 2. 存在某步骤（d）wrap 后 ast 与目标 equal
                const iter = (list) => {
                    for (const p of list) {
                        if (p.from.type === "d") {
                            try {
                                const wrapped = this.hilbertSystem.ref_addCaptureScopeToAST(p.ast, this.hilbertSystem.captureScope(null, p, []));
                                if (wrapped.equal(ast))
                                    return true;
                            }
                            catch { /* 层级捕获失败（如v作用域缺断言）跳过 */ }
                        }
                        if (p.children && iter(p.children))
                            return true;
                    }
                    return false;
                };
                if (iter(sheet.ctx.props))
                    return true;
            }
            return false;
        }
        finally {
            this.hilbertSystem.loadContext(saved);
        }
    }
    // [d]门判定：规则表中（忽略文件夹结构，全部规则）存在文本等价规则
    checkRuleGate(ast) {
        for (const rule of this.hilbertSystem.rules.values()) {
            if (rule.error)
                continue;
            try {
                const ruleAst = new HSParser().parse(rule.toString(), "rule");
                if (ruleAst && ruleAst.equal(ast))
                    return true;
            }
            catch { }
        }
        return false;
    }
    constructor() {
        // 规则表
        this.ruleListView.renderExtra = it => {
            const span = document.createElement('span');
            span.classList.add("extra-rule", "extra-" + (["m<>", "m=", "mcpt", "c", "v"].includes(it.name) || it.name[0] === "a" || it.name === "mp" ? "a" : it.name[0] === "d" ? "d" : "t"));
            return span;
        };
        this.ruleListView.renderContent = (it, span) => {
            if (this.hilbertSystem.rules.get(it.name)?.error) {
                span.parentElement?.parentElement?.classList.add("invalid");
            }
            if (it.children) {
                span.innerText = "📂 " + it.name;
                return;
            }
            new SyntaxViewer(span, new HSParser, this.hilbertSystem.rules.get(it.name).toString() || "", 'rule');
        };
        this.ruleListView.renderName = it => it.children ? "" : it.name;
        this.ruleListView.onRename = (r, name) => {
            if (r.children)
                return true;
            if (!name?.trim())
                return false;
            if (this.cmdEngine.isExecuting()) {
                this.cmdEngine.reportError(HSError.cmdIsRunning);
                return false;
            }
            try {
                this.hilbertSystem.renameD(r.name, name);
            }
            catch (e) {
                this.cmdEngine.reportError(e);
                return false;
            }
            ;
            // 推理表各sheet里引用该规则的步骤也要同步改名（renameD只改了规则表的step）
            this.sheetGui.saveCurrentSheet(); // 保证当前sheet ctx最新
            for (const sheet of this.sheetGui.sheets) {
                this.hilbertSystem.renameDnameInProps(sheet.ctx.props, r.name, name);
            }
            this.propListView.refresh();
            return true;
        };
        this.ruleListView.menuItems = r => {
            const arr = [
                { label: LangMgr.text.rename, action: "rename", icon: '✏️' },
            ];
            if (r.children) {
                if (r === this.activeRuleFolder) {
                    arr.push({ label: LangMgr.text.clearActiveFolder, action: "clearActiveFolder", icon: '⭐' });
                }
                else {
                    arr.push({ label: LangMgr.text.setActiveFolder, action: "setActiveFolder", icon: '⭐' });
                }
                arr.push({ label: LangMgr.text.delete, action: "delete", icon: '🗑️', danger: true });
                return arr;
            }
            const rule = this.hilbertSystem.rules.get(r.name);
            if (rule?.error) {
                arr.push({ label: LangMgr.text.errorRule, action: "errorInfo", icon: '⚠️' });
                arr.push({ label: LangMgr.text.delete, action: "delete", icon: '🗑️', danger: true });
            }
            else if (rule?.step) {
                arr.push({ label: LangMgr.text.loadMacro, action: "load", icon: '📥' });
                arr.push({ label: LangMgr.text.copyCode, action: "copy", icon: '📋' });
                arr.push({ label: LangMgr.text.delete, action: "delete", icon: '🗑️', danger: true });
            }
            return arr;
        };
        this.ruleListView.onMenuAction = (r, action) => {
            if (this.cmdEngine.isExecuting()) {
                this.cmdEngine.reportError(HSError.cmdIsRunning);
                return;
            }
            if (action === "setActiveFolder" || action === "clearActiveFolder") {
                // 清除所有文件夹的 active 标记，再设置/取消目标
                const clearAll = (list) => {
                    for (const n of list) {
                        if (n.children) {
                            delete n.active;
                            clearAll(n.children);
                        }
                    }
                };
                clearAll(this.ruleList);
                if (action === "setActiveFolder") {
                    r.active = true;
                    this.activeRuleFolder = r;
                }
                else {
                    this.activeRuleFolder = null;
                }
                this.ruleListView.refresh();
                return;
            }
            if (action === "errorInfo") {
                const rule = this.hilbertSystem.rules.get(r.name);
                if (!rule?.error)
                    return;
                // 先显示错误原因（reportError 会重置输入框），再把原始cmd填入供修改
                // cause 直接透传（unknown），渲染交给 LangMgr（HSErrorInfo 递归翻译、字符串原样、其他 String()）
                this.cmdEngine.reportError(HSError.expandFail(HSError.errRuleUsed(r.name, rule.error.cause)));
                this.cmdInput.setValue(rule.error.cmds || "");
            }
            else if (action === "delete") {
                if (this.ruleListView.deleteNode(r.uuid)) {
                    if (r === this.activeRuleFolder)
                        this.activeRuleFolder = null;
                    this.hilbertSystem.rules.delete(r.name);
                    this.ruleListView.refresh();
                }
            }
            else if (action === "load") {
                if (this.hilbertSystem.props.length) {
                    this.sheetGui.addSheet();
                    // 把名称设为当前规则名，方便用户识别
                    this.sheetGui.sheets[this.sheetGui.activeIndex].name = r.name;
                    this.sheetGui.render();
                }
                // 重放规则step的cmd生成全新props：不直接共享step的Proposition引用
                // （后续在推理表中expand会修改命题对象，若与规则step共享会导致规则自身被污染）；
                // fromCmd会重新走addP/d()创建对象，跨c/v层级的依赖也由cd命令正确重建
                const step = this.hilbertSystem.rules.get(r.name).step;
                const cmds = this.hilbertSystem.genCmd(step).map(e => new HSParser().parse(e, "cmd"));
                this.hilbertSystem.fromCmd(cmds);
                this.hilbertSystem.updatePropIdx();
                this.propListView.refresh();
            }
            else if (action === "copy") {
                this.cmdInput.setValue(this.hilbertSystem.genCmd(this.hilbertSystem.rules.get(r.name).step).join(";"));
            }
        };
        document.getElementById("ruleAddFolder").addEventListener("click", () => {
            // 新文件夹添加到活动文件夹末尾（无活动则为根目录末尾），并立即激活就地改名
            const folder = { name: LangMgr.text.newFolder, uuid: 0, children: [] };
            if (this.activeRuleFolder)
                this.activeRuleFolder.children.push(folder);
            else
                this.ruleList.push(folder);
            this.ruleListView.refresh();
            this.ruleListView.startRename(folder);
        });
        this.ruleListView.onAfterRender = this.propListView.onAfterRender = () => this.onchange?.();
        // 推理表行高亮（逻辑在 SheetGui，这里只需在每次渲染后应用）
        const origPropAfterRender = this.propListView.onAfterRender;
        this.propListView.onAfterRender = () => { origPropAfterRender?.(); this.sheetGui.applyRowHighlight(); };
        // 定理表
        this.propListView.renderName = it => it.name || String(it.id);
        this.propListView.wideToggleFolderRange = it => it.from.type === "f";
        this.propListView.allowDrop = (src, dst, pos) => {
            if (this.cmdEngine.isExecuting())
                return false;
            // dst为null表示拖到列表末尾的占位符：等价于移动到src所在父级的末尾
            if (!dst) {
                const parent = src.parent;
                const siblings = parent?.children ?? this.hilbertSystem.props;
                const last = siblings.length ? siblings[siblings.length - 1] : null;
                if (!last || last === src)
                    return true;
                return this.hilbertSystem.allowReorder(src.id, last.id, "after");
            }
            return this.hilbertSystem.allowReorder(src.id, dst.id, pos);
        };
        this.propListView.onAfterChange = () => this.hilbertSystem.updatePropIdx();
        this.propListView.renderContent = (it, span) => {
            if (it.from.type === "f") {
                span.innerText = "📂";
                return;
            }
            const scope = this.hilbertSystem.getActiveProp();
            let mainAST = it.from.type === "v" ? new AST(NodeType.QUANT, "\\a", it.ast, new AST(NodeType.ATOM_WFF, "?")) : it.ast;
            let mainText = mainAST.toString();
            // 层级显示
            if (it.from.type !== "a") {
                let layers = [];
                let outters = [];
                // ouuter用于高亮bounded vars，层级为root(null)
                try {
                    outters = this.hilbertSystem.captureScope(null, it);
                }
                catch (e) {
                    span.parentElement?.parentElement?.classList.add("invalid");
                }
                // layers为相对activy的层级添加前缀用
                try {
                    layers = this.hilbertSystem.captureScope(scope, it);
                }
                catch (e) {
                    if (it.from.type !== "v")
                        span.parentElement?.parentElement?.classList.add("invalid");
                }
                if (it.from.type === "v")
                    layers.shift();
                const ast = this.hilbertSystem.ref_addCaptureScopeToAST(mainAST, layers);
                const dummyVars = outters.filter(p => p.from.type === "v").map(e => [e.ast.name, document.getElementById('propRows').querySelector(`div[data-uuid='${e.uuid}'] .inner>span.token-atom-var`)]);
                const mainspan = document.createElement("span");
                const mainView = new SyntaxViewer(span, new HSParser, null, 'wff', this.hilbertSystem.getReplvarsInfo());
                mainView.setOutterDummyVars(dummyVars);
                const astText = ast.toString();
                mainView.setCode(astText);
                span.appendChild(mainspan);
                // 如果ast wrap了层级
                if (ast !== mainAST) {
                    const preSpan = document.createElement("span");
                    preSpan.className = "pre-span";
                    const postSpan = document.createElement("span");
                    postSpan.className = "post-span";
                    // 计算里面的ast stringify后的范围，将前后添加到pre/post span中
                    const mainStart = astText.lastIndexOf(mainText);
                    const mainStop = mainStart + mainText.length;
                    span.querySelectorAll("span[data-start]").forEach((e) => {
                        const pos = parseInt(e.dataset.start);
                        if (pos < mainStart) {
                            e.remove();
                            preSpan?.appendChild(e);
                        }
                        if (pos >= mainStop) {
                            e.remove();
                            postSpan?.appendChild(e);
                        }
                    });
                    if (preSpan.hasChildNodes())
                        span.prepend(preSpan);
                    if (postSpan.hasChildNodes())
                        span.appendChild(postSpan);
                }
            }
            else {
                new SyntaxViewer(span, new HSParser, mainAST.toString(), 'wff', this.hilbertSystem.getReplvarsInfo());
            }
        };
        this.propListView.renderExtra = item => {
            const span = document.createElement('span');
            let val = "";
            if (item.from.type === "h" || item.from.type === "a")
                val = "hyp";
            if (item.from.type === "c")
                val = "cond";
            if (item.from.type === "f")
                val = "dir";
            if (item.from.type === "v")
                val = "var";
            if (item.from.type === "d") {
                const data = item.from.data;
                val = `${data.deduction} ${data.conditions.map(p => p.name || p.id).join(" ")}`;
            }
            new SyntaxViewer(span, new HSParser, val, "cmd");
            return span;
        };
        this.propListView.onRename = (p, name) => {
            if (name === "")
                return true;
            if (!name?.trim())
                return false;
            if (this.cmdEngine.isExecuting()) {
                this.cmdEngine.reportError(HSError.cmdIsRunning);
                return false;
            }
            try {
                this.hilbertSystem.checkPname(name);
            }
            catch (e) {
                this.cmdEngine.reportError(e);
                return false;
            }
            return true;
        };
        this.propListView.menuItems = p => {
            const arr = [
                { label: LangMgr.text.copyCode, action: "copy", icon: '📋' },
                { label: LangMgr.text.rename, action: "rename", icon: '✏️' },
            ];
            if (p.from.type === "d") {
                try {
                    const dname = p.from.data.deduction;
                    // mcpt 是特殊元规则（不在 getD 中），所有 mcpt 步骤都可肢解（步骤 lazy 生成）
                    const isMcpt = dname.type === NodeType.ATOM_DNAME && dname.name === "mcpt";
                    const isMsbt = this.hilbertSystem.isMsbtDname(dname);
                    const isMcnt = dname.type === NodeType.ATOM_DNAME && dname.name === "mcnt";
                    if (isMcpt || isMsbt || isMcnt || this.hilbertSystem.getD(dname).step?.length) {
                        arr.push({ label: LangMgr.text.expand, action: "expand", icon: '🔧' });
                    }
                }
                catch { }
            }
            else if (p.from.type === "f" || p.from.type === "c" || p.from.type === "v") {
                if (p.children?.length) {
                    arr.push({ label: LangMgr.text.expand, action: "expand", icon: '🔧' });
                }
                // 文件夹可设为活跃（cd）或取消活跃（cd 0），与规则表菜单一致
                if (p.active) {
                    arr.push({ label: LangMgr.text.clearActiveFolder, action: "clearActiveFolder", icon: '⭐' });
                }
                else {
                    arr.push({ label: LangMgr.text.setActiveFolder, action: "setActiveFolder", icon: '⭐' });
                }
            }
            if (!p.relyAfter?.length)
                arr.push({ label: LangMgr.text.delete, action: "delete", icon: '🗑️', danger: true });
            return arr;
        };
        this.propListView.onMenuAction = (p, action) => {
            if (this.cmdEngine.isExecuting()) {
                this.cmdEngine.reportError(HSError.cmdIsRunning);
                return;
            }
            if (action === "delete") {
                try {
                    this.hilbertSystem.delP(p);
                    this.propListView.refresh();
                }
                catch (e) {
                    this.cmdEngine.reportError(e);
                    return false;
                }
            }
            else if (action === "expand") {
                try {
                    const newFolders = this.hilbertSystem.expand(p) || [];
                    // 肢解新建的文件夹默认展开，避免全部收起
                    for (const f of newFolders) {
                        if (!f.uuid)
                            f.uuid = this.propListView.idCounter++;
                        this.propListView.expandedFolders.add(f.uuid);
                    }
                    this.propListView.refresh();
                }
                catch (e) {
                    this.cmdEngine.reportError(e);
                    return false;
                }
            }
            else if (action === "setActiveFolder") {
                try {
                    this.hilbertSystem.cd(p);
                    this.propListView.refresh();
                }
                catch (e) {
                    this.cmdEngine.reportError(e);
                    return false;
                }
            }
            else if (action === "clearActiveFolder") {
                this.hilbertSystem.clearActiveDir();
                this.propListView.refresh();
            }
            else if (action === "copy") {
                this.cmdInput.setValue(p.getCmd());
            }
        };
        this.propListView.onFolderActiveCancel = () => {
            this.hilbertSystem.clearActiveDir();
        };
        // 规则表文件夹收起时若取消活动文件夹，同步清 activeRuleFolder（否则菜单状态不更新）
        this.ruleListView.onFolderActiveCancel = () => {
            this.activeRuleFolder = null;
        };
        // 命令栏
        makeResizable(document.getElementById("cmdFooter"), document.getElementById("cmdResizeHandle"), true);
        const executeBtn = document.getElementById('cmd-ok-btn');
        executeBtn.addEventListener('click', () => this.cmdEngine.run(this.cmdInput.getValue()));
        const escBtn = document.getElementById('cmd-esc-btn');
        escBtn.addEventListener('click', () => this.cmdEngine.handleEsc());
        this.cmdUIMgr = new CommandUIManager(this.cmdEngine, this.cmdInput, document.getElementById('cmd-error'), document.getElementById('cmd-prompt'), 
        // 命令结束/取消时清除列表行的点击回调（d命令选择模式专用）
        // 空闲时（命令状态为空）点规则表行 = 直接执行 d 规则名，等待用户输入参数
        () => {
            this.propListView.onRowClick = () => { };
            this.ruleListView.onRowClick = r => { if (!r.children)
                this.cmdEngine.run(r.name); };
        });
        // 推理表sheet：SheetGui内部处理全部sheet操作，HSLayer只注入刷新/变更/守卫/展开状态回调
        this.sheetGui.guard = () => {
            if (this.cmdEngine.isExecuting()) {
                this.cmdEngine.reportError(HSError.cmdIsRunning);
                return false;
            }
            return true;
        };
        this.sheetGui.onRefresh = () => this.propListView.setData(this.hilbertSystem.props);
        this.sheetGui.onChange = () => this.onchange?.();
        // 展开状态：expandedFolders按uuid存储，持久化用逻辑id（uuid为listview内部生成，不入存档）
        this.sheetGui.captureExpanded = () => {
            const uuidToId = new Map();
            const iter = (arr) => {
                for (const p of arr) {
                    uuidToId.set(p.uuid, p.id);
                    if (p.children)
                        iter(p.children);
                }
            };
            iter(this.hilbertSystem.props);
            return Array.from(this.propListView.expandedFolders)
                .map(u => uuidToId.get(u))
                .filter((x) => x !== undefined);
        };
        this.sheetGui.restoreExpanded = (ids) => {
            const idToUuid = new Map();
            const iter = (arr) => {
                for (const p of arr) {
                    if (!p.uuid)
                        p.uuid = this.propListView.idCounter++;
                    idToUuid.set(p.id, p.uuid);
                    if (p.children)
                        iter(p.children);
                }
            };
            iter(this.hilbertSystem.props);
            this.propListView.expandedFolders = new Set(ids.map(id => idToUuid.get(id)).filter((x) => x !== undefined));
        };
        this.sheetGui.render();
    }
    executeCmd(cmd) {
        this.cmdEngine.run(cmd);
    }
    unlockBasicPropCmd() {
        defineCommand('b', () => null, async () => {
            this.hilbertSystem.b();
            this.propListView.refresh();
        });
        defineCommand('clear', () => null, async () => {
            this.hilbertSystem.clear();
            this.propListView.refresh();
        });
        defineCommand('d', (args) => {
            if (args.length === 0) {
                this.cmdInput.setParserArgs("dname");
                SyntaxViewer.onClickAst = null;
                // 点击规则表行 = 把规则名作为参数继续（相当于输入 d <规则名>，立即进入下一步）
                this.propListView.onRowClick = () => { };
                this.ruleListView.onRowClick = r => { if (!r.children)
                    this.cmdEngine.run(r.name); };
                return {
                    prompt: LangMgr.text.plsEnterRuleName, default: "", parse: e => {
                        let ast;
                        try {
                            ast = new HSParser().parse(e, "dname");
                            // msbt 是元规则（不注册为规则实体），跳过 getD 校验；
                            // 但规则模板的结论须为 xx↔xx/xx=xx，第一时间检查
                            if (this.isMsbtDname(ast))
                                this.checkMsbtRuleTemplate(ast);
                            else
                                this.hilbertSystem.getD(ast);
                            return { success: true, value: ast };
                        }
                        catch (e) {
                            return { success: false, error: e };
                        }
                    }
                };
            }
            // msbt：替换元定理（msbt>/msbt<），走独立参数流程
            if (this.isMsbtDname(args[0])) {
                return this.msbtGetNextParam(args);
            }
            const deduction = this.hilbertSystem.getD(args[0]);
            // 加1是加上了规则名
            if (args.length >= 1 + deduction.conditions.length + deduction.replaceNames.length) {
                return null;
            }
            let mode = "ast";
            const conds = args.map(e => e.name).slice(1, 1 + deduction.conditions.length);
            const condsLength = conds.length;
            while (conds.length < deduction.conditions.length)
                conds.push("?");
            conds.join(" ");
            let prompt = LangMgr.text.deducing + highlightHTML(HSParser.stringify(args[0], false), "dname") + ' ' + conds + " : " + highlightHTML(deduction.toString(), "rule");
            let defaultValue = "";
            if (condsLength < deduction.conditions.length) {
                mode = "prop";
                prompt += `<br>${LangMgr.formalize.plsEnterCond(highlightHTML(deduction.conditions[condsLength].toString(), "wff"))}`;
                // 点击定理表整行 = 用该命题的逻辑id作为参数继续（不再依赖onClickAst/data-id）
                SyntaxViewer.onClickAst = null;
                this.propListView.onRowClick = p => { if (p.from.type !== "f")
                    this.cmdEngine.run(String(p.id)); };
                this.ruleListView.onRowClick = () => { };
            }
            else {
                for (let i = 1 + condsLength; i < args.length; i++) {
                    const [varname, isItem] = deduction.replaceNames[i - 1 - condsLength];
                    const type = isItem ? "item" : "wff";
                    prompt += `<br><span class="ast token-replvar-${type}">${varname}</span> : ` + highlightHTML(args[i].toString(), type);
                }
                const currentReplaceIdx = args.length - 1 - condsLength;
                if (currentReplaceIdx >= 0 && currentReplaceIdx < deduction.replaceNames.length) {
                    const [varname, isItem] = deduction.replaceNames[currentReplaceIdx];
                    const type = isItem ? "item" : "wff";
                    mode = type;
                    prompt += `<br>${LangMgr.formalize.plsEnterSubst(`<span class="ast token-replvar-${type}">${varname}</span>`)}`;
                    defaultValue = varname;
                    SyntaxViewer.onClickAst = this.cmdUIMgr.insertText;
                }
                // 替换值输入模式：清除列表行点击回调（仅保留提示里AST点击插入）
                this.propListView.onRowClick = () => { };
                this.ruleListView.onRowClick = () => { };
                this.cmdInput.setParserArgs(mode === "prop" ? "ast" : mode);
            }
            return {
                prompt, default: defaultValue, parse: e => {
                    let ast;
                    try {
                        ast = new HSParser().parse(e, mode === "prop" ? "ast" : mode);
                        if (mode === "item")
                            ast.checkITEM();
                        if (mode === "wff")
                            ast.checkWFF();
                        if (mode === "prop" && !this.hilbertSystem.getP(ast.name))
                            throw HSError.matchCond(condsLength + 1, HSError.pname404(ast.name));
                        return { success: true, value: ast };
                    }
                    catch (e) {
                        return { success: false, error: e };
                    }
                }
            };
        }, async (args) => {
            // 参数齐了执行时也清一下行点击回调（正常情况下clearState已清，这里兜底）
            this.propListView.onRowClick = () => { };
            this.ruleListView.onRowClick = () => { };
            // msbt：替换元定理特殊处理（不进 getD）
            if (this.isMsbtDname(args[0])) {
                this.msbtExec(args);
                this.propListView.refresh();
                return;
            }
            const deduction = this.hilbertSystem.getD(args[0]);
            const conds = args.slice(1, 1 + deduction.conditions.length).map((e, idx) => {
                const p = this.hilbertSystem.getP(e.name);
                if (!p)
                    throw HSError.matchCond(idx + 1, HSError.pname404(e.name));
                return p;
            });
            const replaceValues = Object.fromEntries(args.slice(1 + deduction.conditions.length).map((e, idx) => [deduction.replaceNames[idx][0], e]));
            this.hilbertSystem.d(deduction, conds, replaceValues);
            this.propListView.refresh();
        });
        defineCommand('del', (args) => {
            if (args.length === 0) {
                this.cmdInput.setParserArgs("item");
                return {
                    prompt: LangMgr.text.plsEnterProp, default: "", parse: e => {
                        let ast;
                        try {
                            ast = new HSParser().parse(e, "wff");
                            return { success: true, value: ast };
                        }
                        catch (e) {
                            return { success: false, error: e };
                        }
                    }
                };
            }
            return null;
        }, async (args) => {
            if (!args[0])
                throw HSError.emptyValue;
            const n = args[0].name;
            const p = this.hilbertSystem.getP(n);
            if (!p)
                throw HSError.pname404(n);
            this.hilbertSystem.delP(p);
            this.propListView.refresh();
        });
        defineCommand('name', (args) => {
            if (args.length === 0 || args.length === 1) {
                this.cmdInput.setParserArgs("item");
                return {
                    prompt: args.length ? LangMgr.text.plsEnterNewProp : LangMgr.text.plsEnterProp, default: "", parse: e => {
                        let ast;
                        try {
                            ast = new HSParser().parse(e, "wff");
                            return { success: true, value: ast };
                        }
                        catch (e) {
                            return { success: false, error: e };
                        }
                    }
                };
            }
            return null;
        }, async (args) => {
            if (!args[0])
                throw HSError.emptyValue;
            const n = args[0].name;
            const p = this.hilbertSystem.getP(n);
            if (!p)
                throw HSError.pname404(n);
            if (args[1].name === "." || args[1].name === "/" || args[1].name === "\\" || args[1].name === "0") {
                p.name = "";
            }
            else {
                this.hilbertSystem.checkPname(args[1].name);
                p.name = args[1].name;
            }
            this.propListView.refresh();
        });
    }
    unlockBasicRuleCmd() {
        defineCommand('m', (args) => {
            if (args.length === 0) {
                this.hilbertSystem.checkConclusionInPropList();
                this.cmdInput.setParserArgs("dname");
                let i = 1;
                while (true) {
                    if (!this.hilbertSystem.rules.get("s" + i))
                        break;
                    i++;
                }
                return {
                    prompt: LangMgr.text.plsEnterNewRule, default: "s" + i, parse: e => {
                        let ast;
                        try {
                            ast = new HSParser().parse(e, "dname");
                            return { success: true, value: ast };
                        }
                        catch (e) {
                            return { success: false, error: e };
                        }
                    }
                };
            }
            return null;
        }, async (args) => {
            if (!args[0])
                throw HSError.emptyValue;
            this.hilbertSystem.m(args[0].name);
            // 新规则添加到活动文件夹末尾（无活动则为根目录末尾）
            const node = { name: args[0].name, uuid: 0 };
            if (this.activeRuleFolder)
                this.activeRuleFolder.children.push(node);
            else
                this.ruleList.push(node);
            this.propListView.refresh();
            this.ruleListView.refresh();
        });
        defineCommand('hyp', (args) => {
            if (args.length === 0) {
                this.cmdInput.setParserArgs("wff");
                return {
                    prompt: LangMgr.text.plsEnterHyp, default: "", parse: e => {
                        let ast;
                        try {
                            ast = new HSParser().parse(e, "wff");
                            return { success: true, value: ast };
                        }
                        catch (e) {
                            return { success: false, error: e };
                        }
                    }
                };
            }
            return null;
        }, async (args) => {
            if (!args[0])
                throw HSError.emptyValue;
            this.hilbertSystem.hyp(args[0]);
            this.propListView.refresh();
        });
        // mcpt：命题逻辑自动推理（特殊元规则，独立命令，不走 d 命令交互）
        defineCommand('mcpt', (args) => {
            if (args.length === 0) {
                this.cmdInput.setParserArgs("wff");
                return {
                    prompt: LangMgr.text.plsEnterHyp, default: "", parse: e => {
                        let ast;
                        try {
                            ast = new HSParser().parse(e, "wff");
                            return { success: true, value: ast };
                        }
                        catch (e) {
                            return { success: false, error: e };
                        }
                    }
                };
            }
            return null;
        }, async (args) => {
            if (!args[0])
                throw HSError.emptyValue;
            this.hilbertSystem.mcpt(args[0]);
            this.propListView.refresh();
        });
        // mcnt：量词换名元定理（特殊元规则，独立命令，不走 d 命令交互）
        defineCommand('mcnt', (args) => {
            // 完整参数：mcnt 目标(wff或推理步骤) 换名规则{..}
            if (args.length >= 2)
                return null;
            const need = args.length; // 下一个要填的参数（0=目标，1=换名规则）
            let prompt;
            let mode;
            if (need === 0) {
                prompt = LangMgr.text.plsEnterMsbtTarget;
                mode = "wff";
            }
            else {
                prompt = LangMgr.text.plsEnterMcntRule;
                mode = "item";
            }
            this.cmdInput.setParserArgs(mode);
            // 目标参数：同时支持点击高亮ast插入 与 点击推理行选择步骤（与msbt一致）
            if (need === 0) {
                SyntaxViewer.onClickAst = this.cmdUIMgr.insertText;
                this.propListView.onRowClick = p => { if (p.from.type !== "f" && p.from.type !== "v" && p.from.type !== "a")
                    this.cmdEngine.run(String(p.id)); };
                this.ruleListView.onRowClick = () => { };
            }
            else {
                SyntaxViewer.onClickAst = null;
                this.propListView.onRowClick = () => { };
                this.ruleListView.onRowClick = () => { };
            }
            return {
                prompt, default: "", parse: e => {
                    let ast;
                    try {
                        if (mode === "item") {
                            ast = new HSParser().parse(e, "item");
                            MCNT.getsubIndices(ast); // 预校验换名规则格式
                        }
                        else {
                            ast = new HSParser().parse(e, "wff");
                            // 原子：可能是推理步骤引用（如 1/a），查表命中则当步骤；否则必须是合法wff
                            if (ast.isAtom()) {
                                if (!this.hilbertSystem.getP(ast.name))
                                    ast.checkWFF();
                            }
                            else {
                                ast.checkWFF();
                            }
                        }
                        return { success: true, value: ast };
                    }
                    catch (e) {
                        return { success: false, error: e };
                    }
                }
            };
        }, async (args) => {
            // 参数齐了执行时也清一下行点击回调（正常情况下clearState已清，这里兜底，与msbt一致）
            this.propListView.onRowClick = () => { };
            this.ruleListView.onRowClick = () => { };
            SyntaxViewer.onClickAst = null;
            if (!args[0])
                throw HSError.emptyValue;
            this.hilbertSystem.mcnt(args);
            this.propListView.refresh();
        });
    }
    unlockMetaBlock(type) {
        this.unlockCommonMetaBlockCmd();
        defineCommand(type === "c" ? "cond" : type === "v" ? 'var' : "dir", (args) => {
            if (args.length === 0) {
                this.cmdInput.setParserArgs(type === "c" ? "wff" : "item");
                return {
                    prompt: type === "f" ? LangMgr.text.plsEnterFolderName : type === "v" ? LangMgr.text.plsEnterVar : LangMgr.text.plsEnterHyp, default: "", parse: e => {
                        let ast;
                        try {
                            ast = new HSParser().parse(e, type === "c" ? "wff" : "item");
                            return { success: true, value: ast };
                        }
                        catch (e) {
                            return { success: false, error: e };
                        }
                    }
                };
            }
            return null;
        }, async (args) => {
            if (!args[0])
                throw HSError.emptyValue;
            this.hilbertSystem[type](args[0]);
            this.propListView.refresh();
        });
    }
    unlockCommonMetaBlockCmd() {
        if (getCommand('cd'))
            return;
        defineCommand('cd', (args) => {
            if (args.length === 0) {
                this.cmdInput.setParserArgs("item");
                return {
                    prompt: LangMgr.text.plsEnterProp, default: "", parse: e => {
                        let ast;
                        try {
                            ast = new HSParser().parse(e, "item");
                            return { success: true, value: ast };
                        }
                        catch (e) {
                            return { success: false, error: e };
                        }
                    }
                };
            }
            return null;
        }, async (args) => {
            if (!args[0])
                throw HSError.emptyValue;
            const n = args[0].name;
            if (n === "/" || n === "0" || n === "\\") {
                this.hilbertSystem.clearActiveDir();
                this.propListView.refresh();
                return;
            }
            const p = this.hilbertSystem.getP(n);
            if (!p)
                throw HSError.pname404(n);
            this.hilbertSystem.cd(p);
            this.propListView.refresh();
        });
        defineCommand('pop', () => null, async () => {
            this.hilbertSystem.pop();
            this.propListView.refresh();
        });
    }
    // 解析文件夹名：{ 后跟 [语言]名称 序列（如 {[zh]中文[en]English），按当前语言选择；
    // 找不到当前语言则回退第一个；无语言标记则整段作名
    resolveFolderName(raw) {
        const s = raw.replace(/^\{/, "").trim();
        const segs = [];
        const re = /\[([a-zA-Z]+)\]([^\[]*)/g;
        let m;
        while ((m = re.exec(s))) {
            segs.push([m[1], m[2].trim()]);
        }
        if (!segs.length)
            return s || "folder";
        const hit = segs.find(([lang]) => lang === LangMgr.lang);
        return (hit ? hit[1] : segs[0][1]) || "folder";
    }
    // ===== msbt 替换元定理（元规则，不注册为规则实体） =====
    // dname 为 msbt>/msbt<（裸，或复合 (规则名)/(mcpt)）时为真
    isMsbtDname(ast) {
        if (ast.type === NodeType.ATOM_DNAME)
            return ast.name === "msbt>" || ast.name === "msbt<";
        if (ast.type === NodeType.NODE_DNAME && ast.nodes[0]) {
            const n = ast.nodes[0].name;
            return n === "msbt>" || n === "msbt<";
        }
        return false;
    }
    // 检查 msbt 规则模板：复合dname msbt>(规则名) 时，规则结论必须为 xx↔xx/xx=xx（第一时间报错）
    checkMsbtRuleTemplate(dname) {
        const isNode = dname.type === NodeType.NODE_DNAME;
        const inner = isNode ? dname.nodes[1] : null;
        if (!isNode || !inner || inner.name === "mcpt")
            return; // 裸 msbt< / mcpt 模板无需在此检查
        const rule = this.hilbertSystem.getD(inner);
        if (rule.conditions.length)
            throw HSError.msbtRuleWithCond;
        const c = rule.conclusion;
        if (!(c.type === NodeType.LOGIC && c.name === "<>") && !(c.type === NodeType.PRED && c.name === "="))
            throw HSError.msbtBadTemplate;
    }
    // 检查 msbt 模板是否为 xx↔xx/xx=xx
    checkMsbtPatternShape(ast) {
        if (!(ast.type === NodeType.LOGIC && ast.name === "<>") && !(ast.type === NodeType.PRED && ast.name === "="))
            throw HSError.msbtBadTemplate;
    }
    // msbt 命令参数提示：三种格式（规则/推理步骤模板，mcpt额外多一个模板wff），按序提示
    msbtGetNextParam(args) {
        const dname = args[0];
        const isNode = dname.type === NodeType.NODE_DNAME;
        // 复合dname：nodes[0]=msbt>名，nodes[1]=内层（规则名/mcpt）
        const innerName = isNode ? dname.nodes[1]?.name : null;
        const mcptMode = isNode && innerName === "mcpt";
        const stepMode = !isNode;
        // 完整参数数：规则模式 dname+2；mcpt/步骤模式 dname+3
        const total = (mcptMode || stepMode) ? 4 : 3;
        if (args.length >= total)
            return null;
        const need = args.length - 1; // 下一个要填的参数（0-based，不含dname）
        let prompt;
        let mode;
        // 提示前缀：像d规则那样显示 dname + 已输入参数，未输入的位置用"?"占位
        const paramCount = total - 1;
        const argStrs = [];
        for (let i = 0; i < paramCount; i++) {
            const arg = args[i + 1];
            argStrs.push(arg ? highlightHTML(arg.toString(), "wff") : "?");
        }
        const prefix = LangMgr.text.deducing + highlightHTML(HSParser.stringify(args[0], false), "dname") + ' ' + argStrs.join(' ') + ' ';
        if (mcptMode || stepMode) {
            if (need === 0) {
                prompt = mcptMode ? LangMgr.text.plsEnterMsbtTemplate : LangMgr.text.plsEnterMsbtStep;
                mode = mcptMode ? "wff" : "item";
            }
            else if (need === 1) {
                prompt = LangMgr.text.plsEnterMsbtTarget;
                mode = "wff";
            }
            else {
                prompt = LangMgr.text.plsEnterMsbtIndex;
                mode = "ast";
            }
        }
        else {
            if (need === 0) {
                prompt = LangMgr.text.plsEnterMsbtTarget;
                mode = "wff";
            }
            else {
                prompt = LangMgr.text.plsEnterMsbtIndex;
                mode = "ast";
            }
        }
        this.cmdInput.setParserArgs(mode);
        // 目标参数：同时支持点击高亮ast插入 与 点击推理行选择步骤（合并d命令两种交互）
        const isTargetParam = (mcptMode || stepMode) ? need === 1 : need === 0;
        // 模板步骤参数（步骤模式 need===0）：只支持点击行选择步骤
        const isTplStepParam = stepMode && need === 0;
        if (isTargetParam) {
            SyntaxViewer.onClickAst = this.cmdUIMgr.insertText;
            this.propListView.onRowClick = p => { if (p.from.type !== "f" && p.from.type !== "v" && p.from.type !== "a")
                this.cmdEngine.run(String(p.id)); };
            this.ruleListView.onRowClick = () => { };
        }
        else if (isTplStepParam) {
            SyntaxViewer.onClickAst = null;
            this.propListView.onRowClick = p => { if (p.from.type !== "f" && p.from.type !== "v" && p.from.type !== "a")
                this.cmdEngine.run(String(p.id)); };
            this.ruleListView.onRowClick = () => { };
        }
        else {
            SyntaxViewer.onClickAst = null;
            this.propListView.onRowClick = () => { };
            this.ruleListView.onRowClick = () => { };
        }
        return {
            prompt: prefix + prompt, default: "", parse: e => {
                let ast;
                try {
                    ast = new HSParser().parse(e, mode);
                    if (mode === "wff") {
                        // 原子：可能是推理步骤引用（如 1/a），查表命中则当步骤；否则必须是合法wff
                        if (ast.isAtom()) {
                            if (!this.hilbertSystem.getP(ast.name))
                                ast.checkWFF();
                        }
                        else {
                            ast.checkWFF();
                        }
                        // mcpt 模板参数：第一时间检查模板形状 xx↔xx/xx=xx
                        if (mcptMode && need === 0)
                            this.checkMsbtPatternShape(ast);
                    }
                    if (mode === "item" && !this.hilbertSystem.getP(ast.name))
                        throw HSError.pname404(ast.name);
                    // 步骤模板参数：第一时间检查步骤ast形状 xx↔xx/xx=xx
                    if (stepMode && need === 0) {
                        const tp = this.hilbertSystem.getP(ast.name);
                        if (tp)
                            this.checkMsbtPatternShape(tp.ast);
                    }
                    if (mode === "ast")
                        MSBT.getsubIndices(ast); // 预校验索引格式
                    return { success: true, value: ast };
                }
                catch (e) {
                    return { success: false, error: e };
                }
            }
        };
    }
    // 执行 msbt：委托给 core 的 msbt（与 fromCmd 共用同一逻辑，保证加载/重放一致）
    msbtExec(args) {
        this.hilbertSystem.msbt(args);
    }
    addRules(data) {
        const context = this.hilbertSystem.saveContext();
        this.hilbertSystem.loadContext(this.hilbertSystem.createEmptyContext());
        // a/d 公理占位符恢复：存档行 (uuid)name:ax:. → 替换为 init 定义行（保留 uuid 与文件夹位置）
        const expanded = [];
        for (const raw of data.split("\n")) {
            const t = raw.trim();
            const um = t.match(/^\((\d+)\)(.*)$/);
            const content = (um ? um[2] : t).trim();
            const ci = content.indexOf(":");
            const name = ci > 0 ? content.slice(0, ci).trim() : "";
            const rest = ci > 0 ? content.slice(ci + 1).trim() : "";
            if (rest === "ax:." && initRuleDefs.has(name)) {
                expanded.push(um ? `(${um[1]})${initRuleDefs.get(name)}` : initRuleDefs.get(name));
            }
            else {
                expanded.push(raw);
            }
        }
        data = expanded.join("\n");
        const lines = data.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//"));
        // 文件夹栈：栈顶为当前容器（ListNode[]）；根为 this.ruleList
        const stack = [this.ruleList];
        // 逐条解析：单条规则出错只标记该规则（占位规则 error），不中断整体加载
        for (const raw of lines) {
            const trimmed = raw.trim();
            // 行首可选 (uuid) 前缀（存档格式用；规则名不含括号所以无歧义）
            let uuid = 0;
            let content = trimmed;
            const um = trimmed.match(/^\((\d+)\)(.*)$/);
            if (um) {
                uuid = parseInt(um[1], 10);
                content = um[2].trim();
            }
            // 文件夹开始：{ 后跟文件夹名（支持 [zh]...[en]... 语言选择）
            if (content.startsWith("{")) {
                const folder = { name: this.resolveFolderName(content), uuid, children: [] };
                stack[stack.length - 1].push(folder);
                stack.push(folder.children);
                continue;
            }
            // 文件夹结束
            if (content.startsWith("}")) {
                if (stack.length > 1)
                    stack.pop();
                continue;
            }
            const name = content.slice(0, content.indexOf(":")).trim();
            const container = stack[stack.length - 1];
            try {
                let rest = content.slice(content.indexOf(":") + 1).trim();
                let ax = false;
                let steps = "";
                if (rest.startsWith("ax:")) {
                    ax = true;
                    rest = rest.slice(3);
                }
                else {
                    steps = rest.slice(rest.indexOf(";") + 1);
                    rest = rest.slice(0, rest.indexOf(";"));
                }
                const ast = new HSParser().parse(rest, 'rule');
                // 分离assertion和condition
                const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
                ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
                const rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), assertions, ast.nodes, ast.nodes.pop());
                this.hilbertSystem.rules.set(name, rule);
                container.push({ name, uuid });
                if (!ax) {
                    // 步骤重放失败只标记 error（保留原始cmd供调试），不中断
                    try {
                        // 自动补 hyp：从断言和条件推导（与serde存档逻辑一致，step中无需写hyp）
                        const hyps = [];
                        for (const n of rule.assertions)
                            hyps.push(new HSParser().parse("hyp " + AtomSolver.print(n), "cmd"));
                        for (const n of rule.conditions)
                            hyps.push(new HSParser().parse("hyp " + n, "cmd"));
                        this.hilbertSystem.fromCmd(hyps);
                        this.hilbertSystem.fromCmd(steps.split(";").filter(e => e).map(e => new HSParser().parse(e, "cmd")));
                        if (!this.hilbertSystem.checkConclusionInPropList().conclusion.equal(rule.conclusion)) {
                            rule.error = { cause: HSError.replayConclusionMismatch, cmds: steps };
                        }
                        else {
                            rule.step = this.hilbertSystem.props.slice(0);
                        }
                    }
                    catch (e) {
                        rule.error = { cause: e, cmds: steps };
                    }
                    finally {
                        this.hilbertSystem.clear();
                    }
                }
            }
            catch (e) {
                // 规则头解析失败：注册占位规则，仅保留 error 供调试
                const errRule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), [], [], new AST(NodeType.ATOM_WFF, "?"));
                errRule.error = { cause: e, cmds: raw };
                this.hilbertSystem.rules.set(name, errRule);
                container.push({ name, uuid });
            }
        }
        this.hilbertSystem.loadContext(context);
        this.ruleListView.refresh();
    }
    refresh() {
        this.propListView.refresh();
        this.ruleListView.refresh();
    }
    serialize() { return this.serde.serialize(); }
    deserialize(data) { return this.serde.deserialize(data); }
}
//# sourceMappingURL=main.js.map