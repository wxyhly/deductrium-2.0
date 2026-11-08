import { HSParser } from "./core/parser.js";
import { highlightHTML, SyntaxEditor, SyntaxViewer } from "../astrender.js";
import { TreeListViewer, ListNode, makeResizable } from "../listmgr.js";
import { CommandUIManager, defineCommand, ExecutionEngine, getCommand, clearCommands, getCommandNames, ParamRequest } from "./gui/cmdmgr.js";
import { CommandCompletion, CompletionEntry } from "./gui/completion.js";
import { createRulePreview } from "./gui/rule-preview.js";
import { AST, MatchTable } from "./core/ast.js";
import { Deduction, Proposition } from "./core/deduction.js";
import { HilbertSystem } from "./core/core.js";
import { HSError, HSErrorInfo } from "./core/error.js";
import { AtomSolver } from "./core/assert.js";
import { MSBT, MCPT, MCNT } from "./core/combine.js";
import { NodeType } from "../asttype.js";
import { LangMgr } from "../lang.js";
import { Serde } from "./serde.js";
import { SheetGui } from "./gui/sheet.js";
import { initialCreativeRules, initialSurvivalRules } from "./core/initial.js";
import { SurvivalAccess } from "./access.js";
import { getSurvivalRules } from "./rewards.js";
import { checkDeletion, deleteSelection, planDeletion, DeletionPlan } from "./editing.js";
import { EditingTarget, findTargets, targetAtom, targetList } from "./targets.js";
import { ProofNavigator } from "./proof-navigation.js";
import { MapAxiomPolicy } from "./map-policy.js";
import { permitsProvenance, ruleProvenance, stepProvenance, ProofProvenance } from "./provenance.js";
import { PROOF_TAGS } from "./proof-tags.js";
import { rerecordRule } from "./rerecord.js";

function appendProofTags(host: HTMLElement, value: ProofProvenance) {
    const labels = document.createElement('span');
    labels.className = 'proof-tags';
    labels.dataset.provenanceValid = String(value.valid);
    labels.dataset.proofSources = value.sources.map(source => source.id).join(' ');
    labels.title = value.valid ? value.sources.map(source => `${source.id} [${source.tag}]`).join('\n')
        : value.error ?? (LangMgr.lang === 'zh' ? '无法确认证明来源' : 'Proof sources could not be verified');
    for (const tag of value.valid ? value.tags : ['unknown']) {
        const badge = document.createElement('span');
        badge.className = 'proof-tag';
        badge.dataset.proofTag = tag;
        const label = PROOF_TAGS.find(label => label.id === tag);
        badge.textContent = label ? (LangMgr.lang === 'zh' ? label.zh : label.en)
            : LangMgr.lang === 'zh' ? '来源未确认' : 'Unverified sources';
        badge.title = labels.title;
        labels.appendChild(badge);
    }
    if (labels.hasChildNodes()) host.appendChild(labels);
}

// a/d 开头的公理规则在存档中只存名称占位（name:ax:.），内容以初始定义为准：
// 这样存档体积小、作者更新 init 规则后玩家无需重置存档。
// 此处预解析 init 文本，构建 名字→完整规则行 的映射供占位符恢复。
const initRuleDefs = new Map<string, string>();
for (const text of [initialCreativeRules, initialSurvivalRules]) {
    for (const line of text.split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("//") || t.startsWith("{") || t.startsWith("}")) continue;
        const ci = t.indexOf(":");
        if (ci <= 0) continue;
        const name = t.slice(0, ci).trim();
        const rest = t.slice(ci + 1).trim();
        if (rest.startsWith("ax:")) initRuleDefs.set(name, t);
    }
}

export class HSLayer {
    private hilbertSystem = new HilbertSystem;
    private ruleList: ListNode[] = [];
    private activeRuleFolder: ListNode | null = null;
    private ruleListView = new TreeListViewer(this.ruleList, document.getElementById('ruleList')!);
    private propListView = new TreeListViewer(this.hilbertSystem.props, document.getElementById('propList')!);
    private cmdEngine = new ExecutionEngine();
    private cmdInput = new SyntaxEditor(document.getElementById('hs-cmd-input')!, new HSParser, "", 'cmds');
    private cmdUIMgr: CommandUIManager;
    private serde = new Serde(this, this.hilbertSystem, this.ruleList, this.propListView, this.ruleListView);
    private sheetGui = new SheetGui(this.hilbertSystem);
    private navigator = new ProofNavigator(this.hilbertSystem, () => this.refreshInspection());
    private inspectionExpanded: Set<number> | null = null;
    private inspectionRuleExpanded: Set<number> | null = null;
    onchange?: () => void;
    private survivalAccess: SurvivalAccess | null = null;
    private mapPolicy?: MapAxiomPolicy;
    private mapDisabledAxioms = new Set<string>();
    private mapScriptRules = new Map<string, Deduction>();
    getMapScriptSystem() { return this.hilbertSystem; }
    getMapScriptRuleNames(): string[] {
        return [...(this.mapScriptRules ?? [])].filter(([, rule]) => this.hilbertSystem.rules.get(rule.name.name) === rule).map(([, rule]) => rule.name.name);
    }
    captureMapScriptRules(names: Iterable<string>) {
        this.mapScriptRules = new Map();
        for (const name of names) {
            const rule = this.hilbertSystem.rules.get(name);
            if (rule) this.mapScriptRules.set(name, rule);
        }
    }
    createMapScriptSnapshot(): HSLayer {
        this.sheetGui.saveCurrentSheet();
        const view = Object.create(HSLayer.prototype) as HSLayer;
        view.hilbertSystem = new HilbertSystem();
        view.hilbertSystem.rules = new Map(this.hilbertSystem.rules);
        view.hilbertSystem.renamedSysRule = new Map(this.hilbertSystem.renamedSysRule);
        view.sheetGui = { sheets: this.sheetGui.sheets, saveCurrentSheet() {} } as SheetGui;
        view.ruleList = [];
        view.ruleListView = { refresh() {} } as unknown as TreeListViewer<ListNode>;
        view.mapScriptRules = new Map(this.mapScriptRules ?? []);
        return view;
    }
    replayMapScriptSheets() {
        const core = this.hilbertSystem;
        const saved = core.saveContext();
        try {
            this.sheetGui.sheets = this.sheetGui.sheets.map(sheet => {
                const commands = core.genCmd(sheet.ctx.props);
                core.loadContext(core.createEmptyContext());
                try { core.fromCmd(commands.map(text => new HSParser().parse(text, 'cmd'))); }
                catch { core.clear(); }
                return { ...sheet, ctx: core.saveContext() };
            });
        } finally { core.loadContext(saved); }
    }
    isMapScriptRuleAllowed(rule: Deduction): boolean { return !rule.error && (!this.mapPolicy || this.mapPolicy.allowsRule(rule)); }
    replaceMapScriptRules(rules: ReadonlyMap<string, Deduction>) {
        const owned = new Set((this.mapScriptRules ?? new Map()).values());
        for (const [name, rule] of rules) {
            const previous = this.hilbertSystem.rules.get(name);
            if (previous && !owned.has(previous) && previous !== rule) throw new Error("地图规则名称已被占用：" + name);
        }
        const removed = new Set<string>();
        for (const [name, rule] of this.hilbertSystem.rules) {
            if (owned.has(rule)) { this.hilbertSystem.rules.delete(name); removed.add(name); }
        }
        const clean = (list: ListNode[]) => {
            for (let i = list.length - 1; i >= 0; i--) {
                const node = list[i];
                if (node.children) clean(node.children);
                else if (removed.has(node.name) && !rules.has(node.name)) list.splice(i, 1);
            }
        };
        clean(this.ruleList);
        const listed = new Set<string>();
        const collect = (list: ListNode[]) => {
            for (const node of list) {
                if (node.children) collect(node.children);
                else listed.add(node.name);
            }
        };
        collect(this.ruleList);
        this.mapScriptRules = new Map(rules);
        for (const [name, rule] of rules) {
            this.hilbertSystem.rules.set(name, rule);
            if (!listed.has(name)) this.ruleList.push({ name, uuid: 0 });
        }
        this.ruleListView.refresh();
    }
    hasMapAxiom(name: string): boolean {
        return (this.getMapScriptRuleNames().includes(name) && !this.hilbertSystem.rules.get(name)?.step)
            || [...initialCreativeRules.split("\n"), ...initialSurvivalRules.split("\n")]
            .some(line => line.trimStart().startsWith(name + ":ax:"));
    }
    setMapDisabledAxioms(names: Iterable<string>) {
        this.mapDisabledAxioms = new Set(names);
        this.mapPolicy = this.mapDisabledAxioms.size ? new MapAxiomPolicy(this.hilbertSystem, this.mapDisabledAxioms) : undefined;
    }
    private lastGateAST: AST | null = null;
    private lastGateViewer?: SyntaxViewer;
    getSheetGui() { return this.sheetGui; }

    rememberGate(ast: AST) {
        if (this.survivalAccess && !this.survivalAccess.rewards.has("copygateD")) return;
        this.lastGateAST = ast;
        this.refreshRewardUI();
    }

    private refreshRewardUI() {
        if (typeof document === "undefined") return;
        const rewards = this.survivalAccess?.rewards;
        const layer = document.querySelector('div[data-layer="D-layer"]');
        layer?.classList.toggle("hs-plain-items", !!rewards && !rewards.has("italic-item"));
        layer?.classList.toggle("hs-literal-assertions", !!rewards && !rewards.has("omit-fn"));
        document.getElementById("ruleAddFolder")?.classList.toggle("hide", !!rewards && !rewards.has("mkdir"));
        const gateRow = document.getElementById("hs-last-gate");
        const gateContent = document.getElementById("hs-last-gate-content");
        if (gateRow && gateContent) {
            gateRow.classList.toggle("hide", !this.lastGateAST || !!rewards && !rewards.has("copygateD"));
            this.lastGateViewer?.destroy();
            this.lastGateViewer = undefined;
            gateContent.replaceChildren();
            if (this.lastGateAST && (!rewards || rewards.has("copygateD"))) {
                this.lastGateViewer = new SyntaxViewer(gateContent, new HSParser(), this.lastGateAST.toString(),
                    this.lastGateAST.type === NodeType.RULE ? "rule" : "wff");
            }
        }
    }

    // [p]门判定：任意sheet满足（无断言/假设 + 某步骤wrap后ast等于目标）
    // 步骤在 c/v 文件夹内时，ast 需包上相应条件/量词（captureScope 得层级再 wrap）
    checkPropGate(ast: AST, allowedTags?: readonly string[]): boolean {
        const gui = this.sheetGui;
        gui.saveCurrentSheet(); // 激活sheet ctx 最新
        const saved = this.hilbertSystem.saveContext();
        try {
            for (const sheet of gui.sheets) {
                this.hilbertSystem.loadContext(sheet.ctx);
                // 1. 无 hyp 命令（断言 a / 假设 h 都不能有）
                const hasHyp = (list: Proposition[]): boolean => list.some(
                    p => p.from.type === "a" || p.from.type === "h" || (p.children ? hasHyp(p.children) : false)
                );
                if (hasHyp(sheet.ctx.props)) continue;
                // 2. 存在某步骤（d）wrap 后 ast 与目标 equal
                const iter = (list: Proposition[]): boolean => {
                    for (const p of list) {
                        if (p.from.type === "d") {
                            try {
                                const wrapped = this.hilbertSystem.ref_addCaptureScopeToAST(
                                    p.ast, this.hilbertSystem.captureScope(null, p, [])
                                );
                                if (wrapped.equal(ast) && (!this.mapPolicy || this.mapPolicy.allowsStep(p))
                                    && (allowedTags === undefined || permitsProvenance(stepProvenance(this.hilbertSystem, p), allowedTags))) return true;
                            } catch { /* 层级捕获失败（如v作用域缺断言）跳过 */ }
                        }
                        if (p.children && iter(p.children)) return true;
                    }
                    return false;
                };
                if (iter(sheet.ctx.props)) return true;
            }
            return false;
        } finally {
            this.hilbertSystem.loadContext(saved);
        }
    }
    // [d]门判定：规则表中（忽略文件夹结构，全部规则）存在文本等价规则
    checkRuleGate(ast: AST, allowedTags?: readonly string[]): boolean {
        for (const rule of this.hilbertSystem.rules.values()) {
            if (rule.error) continue;
            if (this.mapPolicy && !this.mapPolicy.allowsRule(rule)) continue;
            try {
                const ruleAst = new HSParser().parse(rule.toString(), "rule");
                if (ruleAst && ruleAst.equal(ast)
                    && (allowedTags === undefined || permitsProvenance(ruleProvenance(this.hilbertSystem, rule), allowedTags))) return true;
            } catch { }
        }
        return false;
    }
    constructor() {
        this.ruleListView.allowDrop = () => !this.cmdEngine.isExecuting() && !this.navigator.active;

        // 规则表
        this.ruleListView.renderExtra = it => {
            const result = document.createElement('span');
            result.className = 'proof-rule-meta';
            const span = document.createElement('span');
            span.classList.add("extra-rule", "extra-" + (["m<>", "m=", "mcpt", "c", "v"].includes(it.name) || it.name[0] === "a" || it.name === "mp" ? "a" : it.name[0] === "d" ? "d" : "t"));
            result.appendChild(span);
            const rule = this.hilbertSystem.rules.get(it.name);
            if (!it.children && rule) appendProofTags(result, ruleProvenance(this.hilbertSystem, rule));
            return result;
        }
        this.ruleListView.renderContent = (it, span) => {
            if (this.hilbertSystem.rules.get(it.name)?.error) {
                span.parentElement?.parentElement?.classList.add("invalid");
            }
            if (it.children) { span.innerText = "📂 " + it.name; return; }
            new SyntaxViewer(span, new HSParser, this.hilbertSystem.rules.get(it.name)!.toString() || "", 'rule')
        };
        this.ruleListView.renderName = it => it.children ? "" : it.name;
        this.ruleListView.onRename = (r, name) => {
            if (this.navigator.active) return false;
            if (r.children) return true;
            if (this.survivalAccess && !this.survivalAccess.rewards.has("renameD")) {
                this.cmdEngine.reportError(HSError.lockedFeature("renameD"));
                return false;
            }
            if (!name?.trim()) return false;
            if (this.cmdEngine.isExecuting() || this.navigator.active) { this.cmdEngine.reportError(HSError.cmdIsRunning); return false; }
            try { this.hilbertSystem.renameD(r.name, name) } catch (e) { this.cmdEngine.reportError(e as any); return false; };
            // 推理表各sheet里引用该规则的步骤也要同步改名（renameD只改了规则表的step）
            this.sheetGui.saveCurrentSheet(); // 保证当前sheet ctx最新
            for (const sheet of this.sheetGui.sheets) {
                this.hilbertSystem.renameDnameInProps(sheet.ctx.props, r.name, name);
            }
            this.propListView.refresh();
            this.refreshRerecord();
            return true;
        };
        this.ruleListView.menuItems = r => {
            const arr: any[] = [];
            if (r.children || !this.survivalAccess || this.survivalAccess.rewards.has("renameD")) {
                arr.push({ label: LangMgr.text.rename, action: "rename", icon: '✏️' });
            }
            if (r.children) {
                if (r === this.activeRuleFolder) {
                    arr.push({ label: LangMgr.text.clearActiveFolder, action: "clearActiveFolder", icon: '⭐' },);
                } else {
                    arr.push({ label: LangMgr.text.setActiveFolder, action: "setActiveFolder", icon: '⭐' },);
                }
                arr.push({ label: LangMgr.text.delete, action: "delete", icon: '🗑️', danger: true });
                return arr;
            }
            const rule = this.hilbertSystem.rules.get(r.name);
            if (rule && (rule.error || (rule.step && !ruleProvenance(this.hilbertSystem, rule).valid)) && getCommand("m")) {
                arr.push({ label: LangMgr.text.rerecordRule, action: "rerecord", icon: '🔴' });
            }
            if (rule?.error) {
                arr.push({ label: LangMgr.text.errorRule, action: "errorInfo", icon: '⚠️' },);
                arr.push({ label: LangMgr.text.delete, action: "delete", icon: '🗑️', danger: true });
            } else if (rule?.step) {
                arr.push({ label: LangMgr.text.loadMacro, action: "load", icon: '📥' },);
                arr.push({ label: LangMgr.text.inspectProof, action: "inspect", icon: '🔎' });
                arr.push({ label: LangMgr.text.copyCode, action: "copy", icon: '📋' },);
                arr.push({ label: LangMgr.text.delete, action: "delete", icon: '🗑️', danger: true });
            }
            return arr;
        };
        this.ruleListView.onMenuAction = (r, action) => {
            if (this.cmdEngine.isExecuting() || this.navigator.active) { this.cmdEngine.reportError(HSError.cmdIsRunning); return; }
            if (action === "setActiveFolder" || action === "clearActiveFolder") {
                // 清除所有文件夹的 active 标记，再设置/取消目标
                const clearAll = (list: ListNode[]) => {
                    for (const n of list) {
                        if (n.children) { delete n.active; clearAll(n.children); }
                    }
                };
                clearAll(this.ruleList);
                if (action === "setActiveFolder") {
                    r.active = true;
                    this.activeRuleFolder = r;
                } else {
                    this.activeRuleFolder = null;
                }
                this.ruleListView.refresh();
                return;
            }
            if (action === "rerecord") {
                try { this.startRerecord(r.name); }
                catch (e) { this.cmdEngine.reportError(e as HSErrorInfo); }
            } else if (action === "errorInfo") {
                const rule = this.hilbertSystem.rules.get(r.name);
                if (!rule?.error) return;
                // 先显示错误原因（reportError 会重置输入框），再把原始cmd填入供修改
                // cause 直接透传（unknown），渲染交给 LangMgr（HSErrorInfo 递归翻译、字符串原样、其他 String()）
                this.cmdEngine.reportError(HSError.expandFail(HSError.errRuleUsed(r.name, rule.error.cause)));
                this.cmdInput.setValue(rule.error.cmds || "");
            } else if (action === "delete") {
                if (r.children) {
                    const names: string[] = [];
                    const collect = (nodes: ListNode[]) => { for (const n of nodes) { if (n.children) collect(n.children); else names.push(n.name); } };
                    collect(r.children);
                    if (names.length) this.cmdEngine.run("del " + names.join(","));
                    else { this.ruleListView.deleteNode(r.uuid); if (r === this.activeRuleFolder) this.activeRuleFolder = null; this.ruleListView.refresh(); }
                } else this.cmdEngine.run("del " + r.name);
            } else if (action === "load") {
                this.cmdEngine.run("inln " + r.name);
            } else if (action === "inspect") {
                this.cmdEngine.run("entr " + r.name);
            } else if (action === "copy") {
                this.cmdInput.setValue(this.hilbertSystem.genCmd(this.hilbertSystem.rules.get(r.name)!.step!).join(";"));
            }
        }
        document.getElementById("ruleAddFolder")!.addEventListener("click", () => {
            if (this.navigator.active) { this.cmdEngine.reportError(HSError.cmdIsRunning); return; }
            if (this.survivalAccess && !this.survivalAccess.rewards.has("mkdir")) {
                this.cmdEngine.reportError(HSError.lockedFeature("mkdir"));
                return;
            }
            // 新文件夹添加到活动文件夹末尾（无活动则为根目录末尾），并立即激活就地改名
            const folder: ListNode = { name: LangMgr.text.newFolder, uuid: 0, children: [] };
            if (this.activeRuleFolder) this.activeRuleFolder.children!.push(folder);
            else this.ruleList.push(folder);
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
            if (this.cmdEngine.isExecuting() || this.navigator.active) return false;
            const scope = !dst ? src.parent : pos === "inside" ? dst : dst.parent;
            try {
                this.survivalAccess?.checkMove(src, scope, this.hilbertSystem);
                if (this.mapPolicy && !this.mapPolicy.allowsStep(src)) return false;
            }
            catch { return false; }
            // dst为null表示拖到列表末尾的占位符：等价于移动到src所在父级的末尾
            if (!dst) {
                const parent = src.parent;
                const siblings = parent?.children ?? this.hilbertSystem.props;
                const last = siblings.length ? siblings[siblings.length - 1] : null;
                if (!last || last === src) return true;
                return this.hilbertSystem.allowReorder(src.id, last.id, "after");
            }
            return this.hilbertSystem.allowReorder(src.id, dst.id, pos);
        };
        this.propListView.onAfterChange = () => this.hilbertSystem.updatePropIdx();
        this.propListView.renderContent = (it, span) => {
            if (it.from.type === "f") { span.innerText = "📂"; return; }
            const scope = this.hilbertSystem.getActiveProp();
            let mainAST = it.from.type === "v" ? new AST(NodeType.QUANT, "\\a", it.ast, new AST(NodeType.ATOM_WFF, "?")) : it.ast;
            let mainText = mainAST.toString();
            // 层级显示
            if (it.from.type !== "a") {
                let layers: Proposition[] = [];
                let outters: Proposition[] = [];
                // ouuter用于高亮bounded vars，层级为root(null)
                try { outters = this.hilbertSystem.captureScope(null, it); } catch (e) { span.parentElement?.parentElement?.classList.add("invalid"); }
                // layers为相对activy的层级添加前缀用
                try { layers = this.hilbertSystem.captureScope(scope, it); } catch (e) { if (it.from.type !== "v") span.parentElement?.parentElement?.classList.add("invalid"); }
                if (it.from.type === "v") layers.shift();
                const ast = this.hilbertSystem.ref_addCaptureScopeToAST(mainAST, layers);
                const dummyVars = outters.filter(p => p.from.type === "v").map(
                    e => [e.ast.name, document.getElementById('propRows')!.querySelector(`div[data-uuid='${e.uuid}'] .inner>span.token-atom-var`)!] as [string, HTMLElement]
                );
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
                        const pos = parseInt((e as HTMLSpanElement).dataset.start!);
                        if (pos < mainStart) {
                            e.remove();
                            preSpan?.appendChild(e);
                        }
                        if (pos >= mainStop) {
                            e.remove();
                            postSpan?.appendChild(e);
                        }
                    })
                    if (preSpan.hasChildNodes()) span.prepend(preSpan);
                    if (postSpan.hasChildNodes()) span.appendChild(postSpan);
                }
            } else {
                new SyntaxViewer(span, new HSParser, mainAST.toString(), 'wff', this.hilbertSystem.getReplvarsInfo());
            }

        }
        this.propListView.renderExtra = item => {
            const span = document.createElement('span');
            span.className = 'proof-step-meta';
            const command = document.createElement('span');
            command.className = 'proof-step-command';
            let val = "";
            if (item.from.type === "h" || item.from.type === "a") val = "hyp";
            if (item.from.type === "c") val = "cond";
            if (item.from.type === "f") val = "dir";
            if (item.from.type === "v") val = "var";
            if (item.from.type === "d") {
                const data = item.from.data;
                val = `${data.deduction} ${data.conditions.map(p => p.name || p.id).join(" ")}`;
            }
            new SyntaxViewer(command, new HSParser, val, "cmd");
            span.appendChild(command);
            if (item.from.type === 'd') appendProofTags(span, stepProvenance(this.hilbertSystem, item));
            return span;
        };
        this.propListView.onRename = (p, name) => {
            if (this.navigator.active) return false;
            if (name === "") return true;
            if (!name?.trim()) return false;
            if (this.cmdEngine.isExecuting() || this.navigator.active) { this.cmdEngine.reportError(HSError.cmdIsRunning); return false; }
            try { this.hilbertSystem.checkPname(name); } catch (e) { this.cmdEngine.reportError(e as HSErrorInfo); return false; }
            return true;
        };
        this.propListView.menuItems = p => {
            const arr: any[] = [
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
                        arr.push({ label: LangMgr.text.inspectProof, action: "inspect", icon: '🔎' });
                    }
                } catch { }
            } else if (p.from.type === "f" || p.from.type === "c" || p.from.type === "v") {
                if (p.children?.length) {
                    arr.push({ label: LangMgr.text.expand, action: "expand", icon: '🔧' });
                }
                // 文件夹可设为活跃（cd）或取消活跃（cd 0），与规则表菜单一致
                if (p.active) {
                    arr.push({ label: LangMgr.text.clearActiveFolder, action: "clearActiveFolder", icon: '⭐' });
                } else {
                    arr.push({ label: LangMgr.text.setActiveFolder, action: "setActiveFolder", icon: '⭐' });
                }
            }
            if (!p.relyAfter?.length) arr.push({ label: LangMgr.text.delete, action: "delete", icon: '🗑️', danger: true });
            return arr;
        };
        this.propListView.onMenuAction = (p, action) => {
            if (this.cmdEngine.isExecuting() || this.navigator.active) { this.cmdEngine.reportError(HSError.cmdIsRunning); return; }
            if (action === "delete") {
                this.cmdEngine.run("del " + p.id);
            } else if (action === "expand") {
                this.cmdEngine.run("inln " + p.id);
            } else if (action === "inspect") {
                this.cmdEngine.run("entr " + p.id);
            } else if (action === "setActiveFolder") {
                try {
                    this.hilbertSystem.cd(p);
                    this.propListView.refresh();
                } catch (e) {
                    this.cmdEngine.reportError(e as HSErrorInfo);
                    return false;
                }
            } else if (action === "clearActiveFolder") {
                this.hilbertSystem.clearActiveDir();
                this.propListView.refresh();
            } else if (action === "copy") {
                this.cmdInput.setValue(p.getCmd());
            }
        }
        this.propListView.onFolderActiveCancel = () => {
            this.hilbertSystem.clearActiveDir();
        }
        // 规则表文件夹收起时若取消活动文件夹，同步清 activeRuleFolder（否则菜单状态不更新）
        this.ruleListView.onFolderActiveCancel = () => {
            if (this.navigator.active) {
                if (this.activeRuleFolder) this.activeRuleFolder.active = true;
                if (this.inspectionRuleExpanded) this.ruleListView.expandedFolders = new Set(this.inspectionRuleExpanded);
                return;
            }
            this.activeRuleFolder = null;
        }

        // 命令栏
        makeResizable(document.getElementById("cmdFooter")!, document.getElementById("cmdResizeHandle")!, true);
        const executeBtn = document.getElementById('cmd-ok-btn')!;
        let completion: CommandCompletion;
        executeBtn.addEventListener('click', () => { completion.hide(); this.cmdEngine.run(this.cmdInput.getValue()); });
        const escBtn = document.getElementById('cmd-esc-btn')!;
        escBtn.addEventListener('click', () => { completion.hide(); this.cmdEngine.handleEsc(); });
        this.cmdUIMgr = new CommandUIManager(
            this.cmdEngine, this.cmdInput,
            document.getElementById('cmd-error')! as HTMLDivElement,
            document.getElementById('cmd-prompt')! as HTMLDivElement,
            // 命令结束/取消时清除列表行的点击回调（d命令选择模式专用）
            // 空闲时（命令状态为空）点规则表行 = 直接执行 d 规则名，等待用户输入参数
            () => {
                completion?.hide();
                this.propListView.onRowClick = () => { };
                this.ruleListView.onRowClick = r => { if (!r.children) this.cmdEngine.run((this.navigator.active ? "entr " : "") + r.name); };
                if (this.navigator.active) {
                    this.propListView.onRowClick = p => this.cmdEngine.run("entr " + p.id);
                    this.cmdEngine.ui.showPrompt(LangMgr.text.editInspect, "entr ");
                }
            }
        );
        completion = new CommandCompletion(this.cmdInput, document.getElementById('hs-cmd-input')!, () => {
            const targets: CompletionEntry[] = [];
            const folders: CompletionEntry[] = [];
            const steps = (props: Proposition[]) => {
                for (const prop of props) {
                    const entry: Omit<CompletionEntry, "name"> = { hint: prop.ast.toString(),
                        hintType: prop.ast.type === NodeType.ASSERT ? "assert" : prop.from.type === "v" ? "item" : prop.from.type === "f" ? "name" : "wff",
                        expandable: prop.from.type === "d", inlinable: ["d", "f", "c", "v"].includes(prop.from.type) };
                    targets.push({ name: String(prop.id), ...entry });
                    if (prop.name) targets.push({ name: prop.name, ...entry });
                    if (prop.children) steps(prop.children);
                }
            };
            steps(this.hilbertSystem.props);
            const rules = [...this.hilbertSystem.rules].map(([name, rule]) => {
                const entry: CompletionEntry = { name, kind: "D", hint: rule.toString(), hintType: "rule", expandable: !!rule.step?.length && !rule.error,
                    derived: rule.error ? undefined : { conditions: rule.conditions.length, implication: rule.conclusion.type === NodeType.LOGIC && rule.conclusion.name === ">" } };
                if (rule.step || rule.error) targets.push(entry);
                return entry;
            });
            const visit = (nodes: ListNode[]) => {
                for (const node of nodes) if (node.children) {
                    folders.push({ name: node.name });
                    visit(node.children);
                }
            };
            visit(this.ruleList);
            return { commands: getCommandNames(), rules, targets, folders, previewRule: createRulePreview(this.hilbertSystem),
                pending: this.cmdEngine.getCompletionContext(), inspecting: this.navigator.active };
        });

        // 推理表sheet：SheetGui内部处理全部sheet操作，HSLayer只注入刷新/变更/守卫/展开状态回调
        this.sheetGui.guard = () => {
            if (this.cmdEngine.isExecuting() || this.navigator.active) { this.cmdEngine.reportError(HSError.cmdIsRunning); return false; }
            return true;
        };
        this.sheetGui.contextForSave = () => this.navigator.rootContext;
        this.cmdEngine.onIdleEscape = () => {
            if (!this.navigator.active) return false;
            this.navigator.back();
            if (!this.navigator.active) this.cmdEngine.ui.setClearState();
            else this.cmdEngine.ui.showPrompt(LangMgr.text.editInspect, "entr ");
            this.cmdInput.setValue(this.navigator.active ? "entr " : "");
            return true;
        };
        this.cmdEngine.transformInput = input => this.navigator.active && !/\s|;/.test(input.trim()) && input.trim() !== "entr" ? "entr " + input.trim() : input;
        this.cmdEngine.beforeCommand = name => {
            if (this.navigator.active && name !== "entr") throw HSError.cmdIsRunning;
        };
        this.sheetGui.onRefresh = () => {
            this.propListView.setData(this.hilbertSystem.props);
            this.refreshRerecord();
        };
        this.sheetGui.onChange = () => this.onchange?.();
        // 展开状态：expandedFolders按uuid存储，持久化用逻辑id（uuid为listview内部生成，不入存档）
        this.sheetGui.captureExpanded = () => {
            const uuidToId = new Map<number, number>();
            const iter = (arr: Proposition[]) => {
                for (const p of arr) {
                    uuidToId.set(p.uuid, p.id);
                    if (p.children) iter(p.children);
                }
            };
            iter(this.hilbertSystem.props);
            return Array.from(this.propListView.expandedFolders)
                .map(u => uuidToId.get(u))
                .filter((x): x is number => x !== undefined);
        };
        this.sheetGui.restoreExpanded = (ids: number[]) => {
            const idToUuid = new Map<number, number>();
            const iter = (arr: Proposition[]) => {
                for (const p of arr) {
                    if (!p.uuid) p.uuid = this.propListView.idCounter++;
                    idToUuid.set(p.id, p.uuid);
                    if (p.children) iter(p.children);
                }
            };
            iter(this.hilbertSystem.props);
            this.propListView.expandedFolders = new Set(
                ids.map(id => idToUuid.get(id)).filter((x): x is number => x !== undefined)
            );
        };
        this.sheetGui.render();
        this.refreshRewardUI();
        this.refreshRerecord();
    }
    private rerecordViewer?: SyntaxViewer;
    private startRerecord(name: string) {
        if (!getCommand("m")) throw HSError.lockedFeature("macro");
        const rule = this.hilbertSystem.rules.get(name);
        if (!rule || (!rule.error && (!rule.step || ruleProvenance(this.hilbertSystem, rule).valid))) throw HSError.atomicStep(new AST(NodeType.ATOM_DNAME, name));
        // Parse the original header before opening a draft, so malformed headers leave every sheet intact.
        const check = new HilbertSystem();
        for (const assertion of rule.assertions) check.hyp(new HSParser().parse(AtomSolver.print(assertion)!, "assert"));
        for (const condition of rule.conditions) check.hyp(condition.clone());
        rule.conclusion.checkWFF();
        const commands = check.genCmd().map(text => new HSParser().parse(text, "cmd"));
        this.survivalAccess?.checkReplay(commands, this.hilbertSystem);
        const existing = this.sheetGui.sheets.findIndex(sheet => sheet.rerecord?.name === name && sheet.rerecord.schema === rule.toString());
        if (existing >= 0) { this.sheetGui.switchSheet(existing); this.refreshRerecord(); return; }
        this.sheetGui.addSheet(false);
        const sheet = this.sheetGui.sheets[this.sheetGui.activeIndex];
        sheet.name = LangMgr.text.rerecordTitle + name;
        sheet.rerecord = { name, schema: rule.toString() };
        this.hilbertSystem.loadContext(check.saveContext());
        this.sheetGui.saveCurrentSheet();
        this.sheetGui.render();
        this.propListView.setData(this.hilbertSystem.props);
        this.refreshRerecord();
        this.cmdInput.setValue("");
        this.onchange?.();
    }
    private refreshRerecord() {
        if (typeof document === "undefined") return;
        const host = document.getElementById("rule-rerecord");
        if (!host) return;
        this.rerecordViewer?.destroy();
        this.rerecordViewer = undefined;
        host.replaceChildren();
        const sheet = this.sheetGui.sheets[this.sheetGui.activeIndex];
        const target = sheet?.rerecord;
        host.hidden = !target || this.navigator.active;
        if (!target || this.navigator.active) return;
        const title = document.createElement("strong");
        title.textContent = LangMgr.text.rerecordTitle + target.name;
        const goal = document.createElement("div");
        goal.className = "rerecord-goal";
        this.rerecordViewer = new SyntaxViewer(goal, new HSParser(), target.schema, "rule");
        const help = document.createElement("div");
        help.className = "rerecord-help";
        const rule = this.hilbertSystem.rules.get(target.name);
        const stale = !rule || rule.toString() !== target.schema;
        help.textContent = LangMgr.text[stale ? "rerecordStale" : "rerecordHelp"];
        const actions = document.createElement("div");
        actions.className = "rerecord-actions";
        const finish = document.createElement("button");
        finish.className = "btn-sm primary";
        finish.dataset.action = "rerecord-finish";
        finish.textContent = LangMgr.text.rerecordFinish;
        finish.disabled = stale || !getCommand("m");
        finish.addEventListener("click", () => {
            if (this.cmdEngine.isExecuting() || this.navigator.active) { this.cmdEngine.reportError(HSError.cmdIsRunning); return; }
            this.cmdEngine.run("m " + target.name);
        });
        const cancel = document.createElement("button");
        cancel.className = "btn-sm";
        cancel.dataset.action = "rerecord-cancel";
        cancel.textContent = LangMgr.text.rerecordCancel;
        cancel.addEventListener("click", () => {
            if (this.cmdEngine.isExecuting() || this.navigator.active) { this.cmdEngine.reportError(HSError.cmdIsRunning); return; }
            delete sheet.rerecord;
            sheet.name = target.name;
            this.sheetGui.render();
            this.refreshRerecord();
            this.onchange?.();
        });
        actions.append(finish, cancel);
        host.append(title, goal, help, actions);
    }
    private finishRerecord() {
        const sheet = this.sheetGui.sheets[this.sheetGui.activeIndex];
        const target = sheet.rerecord;
        if (!target) throw HSError.emptyValue;
        const original = this.hilbertSystem.rules.get(target.name);
        if (!original || original.toString() !== target.schema) throw LangMgr.text.rerecordStale;
        const commands = this.hilbertSystem.genCmd().map(text => new HSParser().parse(text, "cmd"));
        this.survivalAccess?.checkReplay(commands, this.hilbertSystem);
        if (this.mapPolicy) {
            const last = this.hilbertSystem.getLastChildP(null);
            if (!last || !this.mapPolicy.allowsStep(last)) throw new Error("此推导依赖已禁用的公理");
        }
        const replacement = rerecordRule(this.hilbertSystem, original);
        if (this.mapScriptRules.get(target.name) === original) this.mapScriptRules.set(target.name, replacement);
        this.retryFailedRules();
        delete sheet.rerecord;
        sheet.name = target.name;
        this.sheetGui.saveCurrentSheet();
        this.sheetGui.render();
        this.propListView.refresh();
        this.ruleListView.refresh();
        this.refreshRerecord();
        this.onchange?.();
    }
    retryFailedRules() {
        const view = Object.create(HSLayer.prototype) as HSLayer;
        view.hilbertSystem = new HilbertSystem();
        view.hilbertSystem.rules = new Map(this.hilbertSystem.rules);
        view.hilbertSystem.renamedSysRule = new Map(this.hilbertSystem.renamedSysRule);
        view.ruleList = [];
        view.ruleListView = { refresh() {} } as unknown as TreeListViewer<ListNode>;
        const pending = new Set([...this.hilbertSystem.rules].filter(([, rule]) => rule.error).map(([name]) => name));
        for (;;) {
            let changed = false;
            for (const name of pending) {
                const original = this.hilbertSystem.rules.get(name)!;
                try {
                    view.addRules(`${name}:${original.toString()};${original.error!.cmds}`);
                    const rule = view.hilbertSystem.rules.get(name)!;
                    if (rule.error) continue;
                    this.hilbertSystem.rules.set(name, rule);
                    if (this.mapScriptRules?.get(name) === original) this.mapScriptRules.set(name, rule);
                    pending.delete(name);
                    changed = true;
                } catch { /* Keep unrelated broken rules and their original error information. */ }
            }
            if (!changed) break;
        }
    }
    executeCmd(cmd: string) {
        this.cmdEngine.run(cmd);
    }
    private checkInteractiveRule(ast: AST) {
        this.mapPolicy?.checkName(ast);
        this.survivalAccess?.checkRuleName(ast, this.hilbertSystem);
        const rule = this.isMsbtDname(ast) ? undefined : this.hilbertSystem.getD(ast);
        this.survivalAccess?.checkScope(this.hilbertSystem.saveContext().activeProp, rule);
    }
    private checkInteractiveSpecial() {
        if (this.mapDisabledAxioms?.size) throw new Error("公理受限时，请使用逐步推导代替自动元规则");
        this.survivalAccess?.checkScope(this.hilbertSystem.saveContext().activeProp);
    }
    configureSurvival(rewards: Iterable<string>) {
        this.survivalAccess = new SurvivalAccess();
        this.lastGateAST = null;
        clearCommands();
        this.unlockBasicPropCmd();
        for (const reward of rewards) this.applyReward(reward);
        this.refreshRewardUI();
        this.refreshRerecord();
    }
    applyReward(reward: string) {
        // Creative mode already exposes the full library and command set.
        if (!this.survivalAccess) return;
        this.survivalAccess.rewards.add(reward);
        const commands: Record<string, ("m" | "hyp" | "mcpt" | "mcnt")[]> = {
            macro: ["m"], hyp: ["hyp"], mcpt: ["mcpt"], mnt: ["mcnt"],
        };
        for (const command of commands[reward] ?? []) this.unlockBasicRuleCmd(command);
        if (reward === "mct" || reward === "mdt" || reward === "mcpt") this.unlockMetaBlock("c");
        if (reward === "1st" || reward === "mcvt" || reward === "mvt" || reward === "met") this.unlockMetaBlock("v");
        if (reward === "mkdir") this.unlockMetaBlock("f");
        const rules = getSurvivalRules(this.survivalAccess.rewards, this.hilbertSystem.rules, this.hilbertSystem.renamedSysRule);
        if (rules) this.addRules(rules);
        this.refreshRewardUI();
    }
    private refreshInspection() {
        if (this.navigator.active && !this.inspectionExpanded) {
            this.inspectionExpanded = new Set(this.propListView.expandedFolders);
            this.inspectionRuleExpanded = new Set(this.ruleListView.expandedFolders);
        }
        if (!this.navigator.active && this.inspectionExpanded) {
            this.propListView.expandedFolders = this.inspectionExpanded;
            this.inspectionExpanded = null;
            this.ruleListView.expandedFolders = this.inspectionRuleExpanded!;
            this.inspectionRuleExpanded = null;
            this.ruleListView.refresh();
        }
        this.propListView.setData(this.hilbertSystem.props);
        this.propListView.onRowClick = this.navigator.active ? p => this.cmdEngine.run("entr " + p.id) : () => { };
        this.ruleListView.onRowClick = r => { if (!r.children) this.cmdEngine.run((this.navigator.active ? "entr " : "") + r.name); };
        this.refreshRerecord();
    }
    private editingChoices = new WeakMap<AST, EditingTarget>();
    private editingConfirmations = new WeakMap<AST, { plan: DeletionPlan; contexts: import("./core/core.js").HSContext[] }>();
    private editRequest(prompt: string, parse: (text: string) => AST = targetAtom): ParamRequest {
        this.cmdInput.setParserArgs("name");
        return { prompt, default: "", parse: text => {
            try {
                if (!text.trim()) throw HSError.emptyValue;
                return { success: true, value: parse(text.trim()) };
            } catch (e) { return { success: false, error: typeof e === "string" || e instanceof Error ? HSError.unknownCmd(String(e)) : e as HSErrorInfo }; }
        } };
    }
    private editSelection(args: AST[], operation: "del" | "rename" | "inln" | "entr", choiceStart: number): { targets: EditingTarget[]; next?: ParamRequest; end: number } {
        const names = operation === "del" ? targetList(args[0].name) : [args[0].name];
        if (operation !== "del" && /,/.test(names[0]) && !/\(/.test(names[0])) throw LangMgr.text.editSingle;
        const targets: EditingTarget[] = [];
        let index = choiceStart;
        for (const name of names) {
            const candidates = findTargets(this.hilbertSystem, this.ruleList, name, operation);
            if (!candidates.length) throw HSError.pname404(name);
            if (candidates.length === 1) { targets.push(candidates[0]); continue; }
            const selected = args[index++];
            if (selected) {
                const target = this.editingChoices.get(selected);
                if (!target || !candidates.some(c => c.kind === target.kind && (c.kind !== "folder" || c.node === (target as { node: ListNode }).node) && (c.kind !== "step" || c.step === (target as { step: Proposition }).step))) throw LangMgr.text.editAnswer;
                targets.push(target);
            } else {
                const labels = candidates.map((c, i) => `${i + 1}: ${LangMgr.text[c.kind === "step" ? "editStep" : c.kind === "macro" ? "editMacro" : "editFolder"]}${c.kind === "step" ? ` ${c.step.id}` : c.kind === "folder" ? ` #${c.node.uuid}` : ""}`).join("; ");
                const displayName = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                return { targets, end: index, next: this.editRequest(`${displayName}: ${LangMgr.text.editChoice}${labels}`, text => {
                    const number = Number(text);
                    if (!Number.isInteger(number) || number < 1 || number > candidates.length) throw LangMgr.text.editAnswer;
                    const atom = targetAtom(text); this.editingChoices.set(atom, candidates[number - 1]); return atom;
                }) };
            }
        }
        return { targets, end: index };
    }
    private editingContexts() {
        this.sheetGui.saveCurrentSheet();
        return this.sheetGui.sheets.map(s => s.ctx);
    }
    private finishDeletion(plan: DeletionPlan, contexts: import("./core/core.js").HSContext[]) {
        deleteSelection(this.hilbertSystem, plan, contexts);
        const prune = (nodes: ListNode[]) => {
            for (let i = nodes.length - 1; i >= 0; i--) {
                if (nodes[i].children) prune(nodes[i].children!);
                else if (plan.macros.has(nodes[i].name)) nodes.splice(i, 1);
            }
        };
        prune(this.ruleList);
        this.propListView.setData(this.hilbertSystem.props);
        this.ruleListView.refresh();
    }
    private inlineTarget(target: EditingTarget) {
        if (target.kind === "step") {
            if (this.mapPolicy && !this.mapPolicy.allowsStep(target.step)) throw new Error("此推导依赖已禁用的公理");
            this.survivalAccess?.checkExpand(target.step, this.hilbertSystem);
            const folders = this.hilbertSystem.expand(target.step) || [];
            for (const f of folders) { if (!f.uuid) f.uuid = this.propListView.idCounter++; this.propListView.expandedFolders.add(f.uuid); }
        } else {
            const rule = this.hilbertSystem.getD(new HSParser().parse(target.name, "dname"));
            if (this.mapPolicy && !this.mapPolicy.allowsRule(rule)) throw new Error("此规则依赖已禁用的公理");
            if (!rule.step || rule.error) throw HSError.atomicStep(rule.name);
            const commands = this.hilbertSystem.genCmd(rule.step).map(c => new HSParser().parse(c, "cmd"));
            this.survivalAccess?.checkReplay(commands, this.hilbertSystem);
            // Validate in isolation before opening a new sheet or mutating the current proof.
            const check = new HilbertSystem(); check.rules = new Map(this.hilbertSystem.rules);
            check.fromCmd(commands);
            if (this.hilbertSystem.props.length) {
                this.sheetGui.addSheet(false);
                this.sheetGui.sheets[this.sheetGui.activeIndex].name = target.name;
                this.sheetGui.render();
            }
            this.hilbertSystem.loadContext(check.saveContext());
        }
        this.propListView.setData(this.hilbertSystem.props);
    }
    private renameTarget(target: EditingTarget, name: string) {
        if (!name.trim() || /[;\n,]/.test(name)) throw HSError.invalidPropName;
        if (target.kind === "step") {
            if (target.step.name !== name) this.hilbertSystem.checkPname(name);
            target.step.name = name;
        } else if (target.kind === "folder") {
            target.node.name = name;
        } else {
            if (this.survivalAccess && !this.survivalAccess.rewards.has("renameD")) throw HSError.lockedFeature("renameD");
            const old = target.name;
            const contexts = this.editingContexts();
            this.hilbertSystem.renameD(old, name);
            for (const ctx of contexts) this.hilbertSystem.renameDnameInProps(ctx.props, old, name);
            const rename = (nodes: ListNode[]) => { for (const node of nodes) { if (node.children) rename(node.children); else if (node.name === old) node.name = name; } };
            rename(this.ruleList);
        }
        this.hilbertSystem.updatePropIdx();
        this.propListView.refresh(); this.ruleListView.refresh();
        this.refreshRerecord();
    }
    private unlockEditingCommands() {
        defineCommand("del", args => {
            if (!args.length) return this.editRequest(LangMgr.text.editTargets);
            const selected = this.editSelection(args, "del", 1);
            if (selected.next) return selected.next;
            if (args.length > selected.end + 1) throw LangMgr.text.editAnswer;
            if (args.length === selected.end + 1) {
                if (!this.editingConfirmations.has(args[selected.end])) throw LangMgr.text.editAnswer;
                return null;
            }
            const contexts = this.editingContexts();
            const plan = planDeletion(this.hilbertSystem, selected.targets.flatMap(t => t.kind === "step" ? [t.step] : []), selected.targets.flatMap(t => t.kind === "macro" ? [t.name] : []));
            checkDeletion(this.hilbertSystem, plan, contexts);
            const prompt = LangMgr.text.editConfirm.replace("{steps}", String(plan.steps.size)).replace("{macros}", String(plan.macros.size));
            return this.editRequest(prompt, text => {
                if (!/^[yn]$/i.test(text)) throw LangMgr.text.editAnswer;
                const answer = targetAtom(text.toLowerCase()); this.editingConfirmations.set(answer, { plan, contexts }); return answer;
            });
        }, args => {
            const answer = args[args.length - 1];
            const confirmation = this.editingConfirmations.get(answer);
            if (!confirmation) throw LangMgr.text.editAnswer;
            if (answer.name === "y") this.finishDeletion(confirmation.plan, confirmation.contexts);
        });
        for (const operation of ["inln", "entr", "rename"] as const) defineCommand(operation, args => {
            if (!args.length) return this.editRequest(LangMgr.text.editTarget);
            if (operation === "rename" && args.length === 1) return this.editRequest(LangMgr.text.plsEnterNewProp);
            const selected = this.editSelection(args, operation, operation === "rename" ? 2 : 1);
            if (selected.next) return selected.next;
            if (args.length !== selected.end) throw LangMgr.text.editSingle;
            return null;
        }, args => {
            const target = this.editSelection(args, operation, operation === "rename" ? 2 : 1).targets[0];
            if (operation === "inln") this.inlineTarget(target);
            else if (operation === "rename") this.renameTarget(target, args[1].name);
            else {
                this.sheetGui.saveCurrentSheet();
                if (target.kind === "step") this.navigator.enterStep(target.step);
                else this.navigator.enterRule(new HSParser().parse(target.name, "dname"));
            }
        });
    }
    unlockBasicPropCmd() {
        this.unlockEditingCommands();
        defineCommand('b', () => null, async () => {
            this.hilbertSystem.b();
            this.propListView.refresh();
        });
        defineCommand('clear', () => null, async () => {
            this.hilbertSystem.clear();
            this.propListView.refresh();
        });
        defineCommand('d', (args: AST[]) => {
            if (args.length === 0) {
                this.cmdInput.setParserArgs("dname");
                SyntaxViewer.onClickAst = null;
                // 点击规则表行 = 把规则名作为参数继续（相当于输入 d <规则名>，立即进入下一步）
                this.propListView.onRowClick = () => { };
                this.ruleListView.onRowClick = r => { if (!r.children) this.cmdEngine.run(r.name); };

                return {
                    prompt: LangMgr.text.plsEnterRuleName, default: "", parse: e => {
                        let ast: AST;
                        try {
                            ast = new HSParser().parse(e, "dname");
                            this.checkInteractiveRule(ast);
                            // msbt 是元规则（不注册为规则实体），跳过 getD 校验；
                            // 但规则模板的结论须为 xx↔xx/xx=xx，第一时间检查
                            if (this.isMsbtDname(ast)) this.checkMsbtRuleTemplate(ast);
                            else this.hilbertSystem.getD(ast);
                            return { success: true, value: ast };
                        } catch (e) {
                            return { success: false, error: e as HSErrorInfo };
                        }
                    }
                };
            }
            // msbt：替换元定理（msbt>/msbt<），走独立参数流程
            this.checkInteractiveRule(args[0]);
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
            while (conds.length < deduction.conditions.length) conds.push("?");
            conds.join(" ");
            let prompt = LangMgr.text.deducing + highlightHTML(HSParser.stringify(args[0], false), "dname") + ' ' + conds + " : " + highlightHTML(deduction.toString(), "rule");
            let defaultValue = "";
            if (condsLength < deduction.conditions.length) {
                mode = "prop";
                prompt += `<br>${LangMgr.formalize.plsEnterCond(highlightHTML(deduction.conditions[condsLength].toString(), "wff"))}`;
                // 点击定理表整行 = 用该命题的逻辑id作为参数继续（不再依赖onClickAst/data-id）
                SyntaxViewer.onClickAst = null;
                this.propListView.onRowClick = p => { if (p.from.type !== "f") this.cmdEngine.run(String(p.id)); };
                this.ruleListView.onRowClick = () => { };
            } else {
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
                    let ast: AST;
                    try {
                        ast = new HSParser().parse(e, mode === "prop" ? "ast" : mode as any);
                        if (mode === "item") ast.checkITEM();
                        if (mode === "wff") ast.checkWFF();
                        if (mode === "prop" && !this.hilbertSystem.getP(ast.name)) throw HSError.matchCond(condsLength + 1, HSError.pname404(ast.name))
                        return { success: true, value: ast };
                    } catch (e) {
                        return { success: false, error: e as HSErrorInfo };
                    }
                }
            };
        }, async (args) => {
            // 参数齐了执行时也清一下行点击回调（正常情况下clearState已清，这里兜底）
            this.checkInteractiveRule(args[0]);
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
                if (!p) throw HSError.matchCond(idx + 1, HSError.pname404(e.name));
                return p;
            });
            for (const condition of conds) {
                if (this.mapPolicy && !this.mapPolicy.allowsStep(condition)) throw new Error("此条件依赖已禁用的公理");
            }
            const replaceValues = Object.fromEntries(args.slice(1 + deduction.conditions.length).map(
                (e, idx) => [deduction.replaceNames[idx][0], e])
            );
            this.hilbertSystem.d(deduction, conds, replaceValues);
            this.propListView.refresh();
        });
        defineCommand('name', (args: AST[]) => {
            if (args.length === 0 || args.length === 1) {
                this.cmdInput.setParserArgs("item");
                return {
                    prompt: args.length ? LangMgr.text.plsEnterNewProp : LangMgr.text.plsEnterProp, default: "", parse: e => {
                        let ast: AST;
                        try {
                            ast = new HSParser().parse(e, "wff");
                            return { success: true, value: ast };
                        } catch (e) {
                            return { success: false, error: e as HSErrorInfo }
                        }
                    }
                };
            }
            return null;
        }, async (args) => {
            if (!args[0]) throw HSError.emptyValue;
            const n = args[0].name;
            const p = this.hilbertSystem.getP(n);
            if (!p) throw HSError.pname404(n);
            if (args[1].name === "." || args[1].name === "/" || args[1].name === "\\" || args[1].name === "0") {
                p.name = "";
            } else {
                this.hilbertSystem.checkPname(args[1].name);
                p.name = args[1].name;
            }
            this.propListView.refresh();
        });
    }
    unlockBasicRuleCmd(command?: "m" | "hyp" | "mcpt" | "mcnt") {
        if (!command || command === "m") defineCommand('m', (args: AST[]) => {
            if (args.length === 0) {
                this.hilbertSystem.checkConclusionInPropList();
                this.cmdInput.setParserArgs("dname");
                let i = 1;
                while (true) { if (!this.hilbertSystem.rules.get("s" + i)) break; i++; }
                return {
                    prompt: LangMgr.text.plsEnterNewRule, default: this.sheetGui.sheets[this.sheetGui.activeIndex].rerecord?.name ?? "s" + i, parse: e => {
                        let ast: AST;
                        try {
                            ast = new HSParser().parse(e, "dname");
                            return { success: true, value: ast };
                        } catch (e) {
                            return { success: false, error: e as HSErrorInfo }
                        }
                    }
                };
            }
            return null;
        }, async (args) => {
            if (!args[0]) throw HSError.emptyValue;
            if (this.sheetGui.sheets[this.sheetGui.activeIndex].rerecord?.name === args[0].name) {
                this.finishRerecord();
                return;
            }
            this.hilbertSystem.m(args[0].name);
            // 新规则添加到活动文件夹末尾（无活动则为根目录末尾）
            const node = { name: args[0].name, uuid: 0 };
            if (this.activeRuleFolder) this.activeRuleFolder.children!.push(node);
            else this.ruleList.push(node);
            this.propListView.refresh();
            this.ruleListView.refresh();
        });
        if (!command || command === "m") this.refreshRerecord();
        if (!command || command === "hyp") defineCommand('hyp', (args: AST[]) => {
            if (args.length === 0) {
                this.cmdInput.setParserArgs("wff");
                return {
                    prompt: LangMgr.text.plsEnterHyp, default: "", parse: e => {
                        let ast: AST;
                        try {
                            ast = new HSParser().parse(e, "wff");
                            return { success: true, value: ast };
                        } catch (e) {
                            return { success: false, error: e as HSErrorInfo }
                        }
                    }
                };
            }
            return null;
        }, async (args) => {
            if (!args[0]) throw HSError.emptyValue;
            this.hilbertSystem.hyp(args[0]);
            this.propListView.refresh();
        });
        // mcpt：命题逻辑自动推理（特殊元规则，独立命令，不走 d 命令交互）
        if (!command || command === "mcpt") defineCommand('mcpt', (args: AST[]) => {
            this.checkInteractiveSpecial();
            if (args.length === 0) {
                this.cmdInput.setParserArgs("wff");
                return {
                    prompt: LangMgr.text.plsEnterHyp, default: "", parse: e => {
                        let ast: AST;
                        try {
                            ast = new HSParser().parse(e, "wff");
                            return { success: true, value: ast };
                        } catch (e) {
                            return { success: false, error: e as HSErrorInfo }
                        }
                    }
                };
            }
            return null;
        }, async (args) => {
            if (!args[0]) throw HSError.emptyValue;
            this.checkInteractiveSpecial();
            this.hilbertSystem.mcpt(args[0]);
            this.propListView.refresh();
        });
        // mcnt：量词换名元定理（特殊元规则，独立命令，不走 d 命令交互）
        if (!command || command === "mcnt") defineCommand('mcnt', (args: AST[]) => {
            this.checkInteractiveSpecial();
            // 完整参数：mcnt 目标(wff或推理步骤) 换名规则{..}
            if (args.length >= 2) return null;
            const need = args.length; // 下一个要填的参数（0=目标，1=换名规则）
            let prompt: string;
            let mode: string;
            if (need === 0) {
                prompt = LangMgr.text.plsEnterMsbtTarget;
                mode = "wff";
            } else {
                prompt = LangMgr.text.plsEnterMcntRule;
                mode = "item";
            }
            this.cmdInput.setParserArgs(mode);
            // 目标参数：同时支持点击高亮ast插入 与 点击推理行选择步骤（与msbt一致）
            if (need === 0) {
                SyntaxViewer.onClickAst = this.cmdUIMgr.insertText;
                this.propListView.onRowClick = p => { if (p.from.type !== "f" && p.from.type !== "v" && p.from.type !== "a") this.cmdEngine.run(String(p.id)); };
                this.ruleListView.onRowClick = () => { };
            } else {
                SyntaxViewer.onClickAst = null;
                this.propListView.onRowClick = () => { };
                this.ruleListView.onRowClick = () => { };
            }
            return {
                prompt, default: "", parse: e => {
                    let ast: AST;
                    try {
                        if (mode === "item") {
                            ast = new HSParser().parse(e, "item");
                            MCNT.getsubIndices(ast); // 预校验换名规则格式
                        } else {
                            ast = new HSParser().parse(e, "wff");
                            // 原子：可能是推理步骤引用（如 1/a），查表命中则当步骤；否则必须是合法wff
                            if (ast.isAtom()) {
                                if (!this.hilbertSystem.getP(ast.name)) ast.checkWFF();
                            } else {
                                ast.checkWFF();
                            }
                        }
                        return { success: true, value: ast };
                    } catch (e) {
                        return { success: false, error: e as HSErrorInfo };
                    }
                }
            };
        }, async (args) => {
            // 参数齐了执行时也清一下行点击回调（正常情况下clearState已清，这里兜底，与msbt一致）
            this.propListView.onRowClick = () => { };
            this.ruleListView.onRowClick = () => { };
            SyntaxViewer.onClickAst = null;
            if (!args[0]) throw HSError.emptyValue;
            this.checkInteractiveSpecial();
            this.hilbertSystem.mcnt(args);
            this.propListView.refresh();
        });
    }
    unlockMetaBlock(type: "c" | "v" | "f") {
        this.unlockCommonMetaBlockCmd();
        defineCommand(type === "c" ? "cond" : type === "v" ? 'var' : "dir", (args: AST[]) => {
            if (args.length === 0) {
                this.cmdInput.setParserArgs(type === "c" ? "wff" : "item");
                return {
                    prompt: type === "f" ? LangMgr.text.plsEnterFolderName : type === "v" ? LangMgr.text.plsEnterVar : LangMgr.text.plsEnterHyp, default: "", parse: e => {
                        let ast: AST;
                        try {
                            ast = new HSParser().parse(e, type === "c" ? "wff" : "item");
                            return { success: true, value: ast };
                        } catch (e) {
                            return { success: false, error: e as HSErrorInfo }
                        }
                    }
                };
            }
            return null;
        }, async (args) => {
            if (!args[0]) throw HSError.emptyValue;
            this.hilbertSystem[type](args[0]);
            this.propListView.refresh();
        });
    }
    private unlockCommonMetaBlockCmd() {
        if (getCommand('cd')) return;
        defineCommand('cd', (args: AST[]) => {
            if (args.length === 0) {
                this.cmdInput.setParserArgs("item");
                return {
                    prompt: LangMgr.text.plsEnterProp, default: "", parse: e => {
                        let ast: AST;
                        try {
                            ast = new HSParser().parse(e, "item");
                            return { success: true, value: ast };
                        } catch (e) {
                            return { success: false, error: e as HSErrorInfo }
                        }
                    }
                };
            }
            return null;
        }, async (args) => {
            if (!args[0]) throw HSError.emptyValue;
            const n = args[0].name;
            if (n === "/" || n === "0" || n === "\\") {
                this.hilbertSystem.clearActiveDir();
                this.propListView.refresh(); return;
            }
            const p = this.hilbertSystem.getP(n);
            if (!p) throw HSError.pname404(n);
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
    private resolveFolderName(raw: string): string {
        const s = raw.replace(/^\{/, "").trim();
        const segs: [string, string][] = [];
        const re = /\[([a-zA-Z]+)\]([^\[]*)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(s))) {
            segs.push([m[1], m[2].trim()]);
        }
        if (!segs.length) return s || "folder";
        const hit = segs.find(([lang]) => lang === LangMgr.lang);
        return (hit ? hit[1] : segs[0][1]) || "folder";
    }
    // ===== msbt 替换元定理（元规则，不注册为规则实体） =====
    // dname 为 msbt>/msbt<（裸，或复合 (规则名)/(mcpt)）时为真
    private isMsbtDname(ast: AST): boolean {
        if (ast.type === NodeType.ATOM_DNAME) return ast.name === "msbt>" || ast.name === "msbt<";
        if (ast.type === NodeType.NODE_DNAME && ast.nodes[0]) {
            const n = ast.nodes[0].name;
            return n === "msbt>" || n === "msbt<";
        }
        return false;
    }
    // 检查 msbt 规则模板：复合dname msbt>(规则名) 时，规则结论必须为 xx↔xx/xx=xx（第一时间报错）
    private checkMsbtRuleTemplate(dname: AST) {
        const isNode = dname.type === NodeType.NODE_DNAME;
        const inner = isNode ? dname.nodes[1] as AST : null;
        if (!isNode || !inner || inner.name === "mcpt") return; // 裸 msbt< / mcpt 模板无需在此检查
        const rule = this.hilbertSystem.getD(inner);
        if (rule.conditions.length) throw HSError.msbtRuleWithCond;
        const c = rule.conclusion;
        if (!(c.type === NodeType.LOGIC && c.name === "<>") && !(c.type === NodeType.PRED && c.name === "="))
            throw HSError.msbtBadTemplate;
    }
    // 检查 msbt 模板是否为 xx↔xx/xx=xx
    private checkMsbtPatternShape(ast: AST) {
        if (!(ast.type === NodeType.LOGIC && ast.name === "<>") && !(ast.type === NodeType.PRED && ast.name === "="))
            throw HSError.msbtBadTemplate;
    }
    // msbt 命令参数提示：三种格式（规则/推理步骤模板，mcpt额外多一个模板wff），按序提示
    private msbtGetNextParam(args: AST[]): ParamRequest | null {
        const dname = args[0];
        const isNode = dname.type === NodeType.NODE_DNAME;
        // 复合dname：nodes[0]=msbt>名，nodes[1]=内层（规则名/mcpt）
        const innerName = isNode ? (dname.nodes[1] as AST)?.name : null;
        const mcptMode = isNode && innerName === "mcpt";
        const stepMode = !isNode;
        // 完整参数数：规则模式 dname+2；mcpt/步骤模式 dname+3
        const total = (mcptMode || stepMode) ? 4 : 3;
        if (args.length >= total) return null;
        const need = args.length - 1; // 下一个要填的参数（0-based，不含dname）
        let prompt: string;
        let mode: string;
        // 提示前缀：像d规则那样显示 dname + 已输入参数，未输入的位置用"?"占位
        const paramCount = total - 1;
        const argStrs: string[] = [];
        for (let i = 0; i < paramCount; i++) {
            const arg = args[i + 1];
            argStrs.push(arg ? highlightHTML(arg.toString(), "wff") : "?");
        }
        const prefix = LangMgr.text.deducing + highlightHTML(HSParser.stringify(args[0], false), "dname") + ' ' + argStrs.join(' ') + ' ';
        if (mcptMode || stepMode) {
            if (need === 0) {
                prompt = mcptMode ? LangMgr.text.plsEnterMsbtTemplate : LangMgr.text.plsEnterMsbtStep;
                mode = mcptMode ? "wff" : "item";
            } else if (need === 1) {
                prompt = LangMgr.text.plsEnterMsbtTarget;
                mode = "wff";
            } else {
                prompt = LangMgr.text.plsEnterMsbtIndex;
                mode = "ast";
            }
        } else {
            if (need === 0) {
                prompt = LangMgr.text.plsEnterMsbtTarget;
                mode = "wff";
            } else {
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
            this.propListView.onRowClick = p => { if (p.from.type !== "f" && p.from.type !== "v" && p.from.type !== "a") this.cmdEngine.run(String(p.id)); };
            this.ruleListView.onRowClick = () => { };
        } else if (isTplStepParam) {
            SyntaxViewer.onClickAst = null;
            this.propListView.onRowClick = p => { if (p.from.type !== "f" && p.from.type !== "v" && p.from.type !== "a") this.cmdEngine.run(String(p.id)); };
            this.ruleListView.onRowClick = () => { };
        } else {
            SyntaxViewer.onClickAst = null;
            this.propListView.onRowClick = () => { };
            this.ruleListView.onRowClick = () => { };
        }
        return {
            prompt: prefix + prompt, default: "", parse: e => {
                let ast: AST;
                try {
                    ast = new HSParser().parse(e, mode as any);
                    if (mode === "wff") {
                        // 原子：可能是推理步骤引用（如 1/a），查表命中则当步骤；否则必须是合法wff
                        if (ast.isAtom()) {
                            if (!this.hilbertSystem.getP(ast.name)) ast.checkWFF();
                        } else {
                            ast.checkWFF();
                        }
                        // mcpt 模板参数：第一时间检查模板形状 xx↔xx/xx=xx
                        if (mcptMode && need === 0) this.checkMsbtPatternShape(ast);
                    }
                    if (mode === "item" && !this.hilbertSystem.getP(ast.name)) throw HSError.pname404(ast.name);
                    // 步骤模板参数：第一时间检查步骤ast形状 xx↔xx/xx=xx
                    if (stepMode && need === 0) {
                        const tp = this.hilbertSystem.getP(ast.name);
                        if (tp) this.checkMsbtPatternShape(tp.ast);
                    }
                    if (mode === "ast") MSBT.getsubIndices(ast); // 预校验索引格式
                    return { success: true, value: ast };
                } catch (e) {
                    return { success: false, error: e as HSErrorInfo };
                }
            }
        };
    }
    // 执行 msbt：委托给 core 的 msbt（与 fromCmd 共用同一逻辑，保证加载/重放一致）
    private msbtExec(args: AST[]) {
        this.hilbertSystem.msbt(args);
    }
    addRules(data: string) {
        const context = this.hilbertSystem.saveContext();
        this.hilbertSystem.loadContext(this.hilbertSystem.createEmptyContext());
        // a/d 公理占位符恢复：存档行 (uuid)name:ax:. → 替换为 init 定义行（保留 uuid 与文件夹位置）
        const expanded: string[] = [];
        for (const raw of data.split("\n")) {
            const t = raw.trim();
            const um = t.match(/^\((\d+)\)(.*)$/);
            const content = (um ? um[2] : t).trim();
            const ci = content.indexOf(":");
            const name = ci > 0 ? content.slice(0, ci).trim() : "";
            const rest = ci > 0 ? content.slice(ci + 1).trim() : "";
            if (rest === "ax:." && initRuleDefs.has(name)) {
                expanded.push(um ? `(${um[1]})${initRuleDefs.get(name)}` : initRuleDefs.get(name)!);
            } else {
                expanded.push(raw);
            }
        }
        data = expanded.join("\n");
        const lines = data.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//"));
        // 文件夹栈：栈顶为当前容器（ListNode[]）；根为 this.ruleList
        const stack: ListNode[][] = [this.ruleList];
        // 逐条解析：单条规则出错只标记该规则（占位规则 error），不中断整体加载
        for (const raw of lines) {
            const trimmed = raw.trim();
            // 行首可选 (uuid) 前缀（存档格式用；规则名不含括号所以无歧义）
            let uuid = 0;
            let content = trimmed;
            const um = trimmed.match(/^\((\d+)\)(.*)$/);
            if (um) { uuid = parseInt(um[1], 10); content = um[2].trim(); }
            // 文件夹开始：{ 后跟文件夹名（支持 [zh]...[en]... 语言选择）
            if (content.startsWith("{")) {
                const folder: ListNode = { name: this.resolveFolderName(content), uuid, children: [] };
                stack[stack.length - 1].push(folder);
                stack.push(folder.children!);
                continue;
            }
            // 文件夹结束
            if (content.startsWith("}")) {
                if (stack.length > 1) stack.pop();
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
                } else {
                    steps = rest.slice(rest.indexOf(";") + 1);
                    rest = rest.slice(0, rest.indexOf(";"));
                }
                const ast = new HSParser().parse(rest, 'rule');
                // 分离assertion和condition
                const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
                ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
                const rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), assertions, ast.nodes, ast.nodes.pop()!);
                container.push({ name, uuid });
                if (!ax) {
                    // Mask any same-name preloaded rule until this proof is checked.
                    const pending = new Deduction(new Set, rule.name, [], [], new AST(NodeType.ATOM_WFF, "?"));
                    pending.error = { cause: HSError.dname404(name), cmds: steps };
                    this.hilbertSystem.rules.set(name, pending);
                    // 步骤重放失败只标记 error（保留原始cmd供调试），不中断
                    try {
                        // 自动补 hyp：从断言和条件推导（与serde存档逻辑一致，step中无需写hyp）
                        const hyps: AST[] = [];
                        for (const n of rule.assertions) hyps.push(new HSParser().parse("hyp " + AtomSolver.print(n), "cmd"));
                        for (const n of rule.conditions) hyps.push(new HSParser().parse("hyp " + n, "cmd"));
                        this.hilbertSystem.fromCmd(hyps);
                        this.hilbertSystem.fromCmd(steps.split(";").filter(e => e).map(e => new HSParser().parse(e, "cmd")));
                        const proof = this.hilbertSystem.checkConclusionInPropList();
                        if (!proof.conclusion.equal(rule.conclusion)
                            || proof.conditions.length !== rule.conditions.length
                            || proof.conditions.some((condition, index) => !condition.equal(rule.conditions[index]))
                            || proof.asserts.length !== rule.assertions.length
                            || proof.asserts.some((assertion, index) => AtomSolver.print(assertion) !== AtomSolver.print(rule.assertions[index]))) {
                            rule.error = { cause: HSError.replayConclusionMismatch, cmds: steps };
                        } else {
                            rule.step = this.hilbertSystem.props.slice(0);
                        }
                    } catch (e) {
                        rule.error = { cause: e, cmds: steps };
                    } finally {
                        this.hilbertSystem.clear();
                    }
                }
                this.hilbertSystem.rules.set(name, rule);
            } catch (e) {
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
        this.refreshRerecord();
    }
    serialize() { return this.serde.serialize() }
    deserialize(data: any) { this.navigator.close(); return this.serde.deserialize(data) }
    captureCommandDraft(): string | undefined {
        if (this.cmdEngine.isExecuting()) throw new Error(LangMgr.text.languageFinishCommand);
        return this.navigator.active ? undefined : this.cmdInput.getValue();
    }
    restoreCommandDraft(text: string) { this.cmdInput.setValue(text); }
}
