import { HSParser } from "./core/parser.js";
import { highlightHTML, SyntaxEditor, SyntaxViewer } from "../astrender.js";
import { TreeListViewer, ListNode, makeResizable } from "../listmgr.js";
import { CommandUIManager, defineCommand, ExecutionEngine, getCommand } from "./gui/cmdmgr.js";
import { AST } from "./core/ast.js";
import { Deduction, Proposition } from "./core/deduction.js";
import { HilbertSystem } from "./core/core.js";
import { HSError, HSErrorInfo } from "./core/error.js";
import { AtomSolver } from "./core/assert.js";
import { NodeType } from "../asttype.js";
import { LangMgr } from "../lang.js";
import { Serde } from "./serde.js";
export class HSLayer {
    private hilbertSystem = new HilbertSystem;
    private ruleList: ListNode[] = [];
    private ruleListView = new TreeListViewer(this.ruleList, document.getElementById('ruleList')!);
    private propListView = new TreeListViewer(this.hilbertSystem.props, document.getElementById('propList')!);
    private cmdEngine = new ExecutionEngine();
    private cmdInput = new SyntaxEditor(document.getElementById('hs-cmd-input')!, new HSParser, "", 'cmds');
    private cmdUIMgr: CommandUIManager;
    private serde = new Serde(this, this.hilbertSystem, this.ruleList, this.propListView, this.ruleListView);
    onchange?: () => void;
    saveContext() {

    }
    loadContext() {

    }
    constructor() {

        // 规则表
        this.ruleListView.renderExtra = it => {
            const span = document.createElement('span');
            span.classList.add("extra-rule", "extra-" + (["m<>", "m=", "mcpt", "c", "v"].includes(it.name) || it.name[0] === "a" || it.name === "mp" ? "a" : it.name[0] === "d" ? "d" : "t"));
            return span;
        }
        this.ruleListView.renderContent = (it, span) => {
            if (it.children) { span.innerText = "📂 " + it.name; return; }
            new SyntaxViewer(span, new HSParser, this.hilbertSystem.rules.get(it.name)!.toString() || "", 'rule')
        };
        this.ruleListView.onRename = (r, name) => {
            if (!name?.trim()) return false;
            if (this.cmdEngine.isExecuting()) { this.cmdEngine.reportError(HSError.cmdIsRunning()); return false; }
            try { this.hilbertSystem.renameD(r.name, name) } catch (e) { this.cmdEngine.reportError(e as any); return false; };
            return true;
        };
        this.ruleListView.menuItems = r => {
            const arr: any[] = [
                { label: LangMgr.text.rename, action: "rename", icon: '✏️' },
            ];
            if (this.hilbertSystem.rules.get(r.name)?.step) {
                arr.push({ label: LangMgr.text.loadMacro, action: "load", icon: '📋' },);
                arr.push({ label: LangMgr.text.delete, action: "delete", icon: '🗑️', danger: true });
            }
            return arr;
        };
        this.ruleListView.onMenuAction = (r, action) => {
            if (this.cmdEngine.isExecuting()) { this.cmdEngine.reportError(HSError.cmdIsRunning()); return; }
            if (action === "delete") {
                if (this.ruleListView.deleteNode(r.uuid)) {
                    this.hilbertSystem.rules.delete(r.name);
                    this.ruleListView.refresh();
                }
            } else if (action === "load") {
                if (this.hilbertSystem.props.length) { this.cmdEngine.reportError(HSError.pListIsntEmpty()); return; }
                this.hilbertSystem.props.length = 0;
                this.hilbertSystem.props.push(...this.hilbertSystem.rules.get(r.name)!.step!);
                this.hilbertSystem.updatePropIdx();
                this.propListView.refresh();
            }
        }

        this.ruleListView.onAfterRender = this.propListView.onAfterRender = () => this.onchange?.();

        // 定理表
        this.propListView.renderName = it => it.name || String(it.id);
        this.propListView.wideToggleFolderRange = it => it.from.type === "f";
        this.propListView.allowDrop = (src, dst, pos) => !this.cmdEngine.isExecuting() && this.hilbertSystem.allowReorder(src, dst, pos);
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
                if (it.id < (scope as any)?.id) try { layers = this.hilbertSystem.captureScope(scope, it); } catch (e) { if (it.from.type !== "v") span.parentElement?.parentElement?.classList.add("invalid"); }
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
            let val = "";
            if (item.from.type === "h" || item.from.type === "a") val = "hyp";
            if (item.from.type === "c") val = "cond";
            if (item.from.type === "f") val = "dir";
            if (item.from.type === "v") val = "var";
            if (item.from.type === "d") {
                const data = item.from.data;
                val = `${data.deduction} ${data.conditions.map(p => p.name || p.id).join(" ")}`;
            }
            new SyntaxViewer(span, new HSParser, val, "cmd");
            return span;
        };
        this.propListView.onRename = (p, name) => {
            if (name === "") return true;
            if (!name?.trim()) return false;
            if (this.cmdEngine.isExecuting()) { this.cmdEngine.reportError(HSError.cmdIsRunning()); return false; }
            try { this.hilbertSystem.checkPname(name); } catch (e) { this.cmdEngine.reportError(e as HSErrorInfo); return false; }
            return true;
        };
        this.propListView.menuItems = p => {
            const arr: any[] = [
                { label: LangMgr.text.copyCode, action: "copy", icon: '📋' },
                { label: LangMgr.text.rename, action: "rename", icon: '✏️' },
            ];
            if (!p.relyAfter?.length) arr.push({ label: LangMgr.text.delete, action: "delete", icon: '🗑️', danger: true });
            return arr;
        };
        this.propListView.onMenuAction = (p, action) => {
            if (this.cmdEngine.isExecuting()) { this.cmdEngine.reportError(HSError.cmdIsRunning()); return; }
            if (action === "delete") {
                try {
                    this.hilbertSystem.delP(p);
                    this.propListView.refresh();
                } catch (e) {
                    this.cmdEngine.reportError(e as HSErrorInfo);
                    return false;
                }
            } else if (action === "copy") {
                this.cmdInput.setValue(p.getCmd());
            }
        }
        this.propListView.onFolderActiveCancel = () => {
            this.hilbertSystem.clearActiveDir();
        }

        // 命令栏
        makeResizable(document.getElementById("cmdFooter")!, document.getElementById("cmdResizeHandle")!, true);
        const executeBtn = document.getElementById('cmd-ok-btn')!;
        executeBtn.addEventListener('click', () => this.cmdEngine.run(this.cmdInput.getValue()));
        const escBtn = document.getElementById('cmd-esc-btn')!;
        escBtn.addEventListener('click', () => this.cmdEngine.handleEsc());
        this.cmdUIMgr = new CommandUIManager(
            this.cmdEngine, this.cmdInput,
            document.getElementById('cmd-error')! as HTMLDivElement,
            document.getElementById('cmd-prompt')! as HTMLDivElement
        );
    }
    executeCmd(cmd: string) {
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
        defineCommand('d', (args: AST[]) => {
            if (args.length === 0) {
                this.cmdInput.setParserArgs("dname");
                SyntaxViewer.onClickAst = null;

                return {
                    prompt: LangMgr.text.plsEnterRuleName, default: "", parse: e => {
                        let ast: AST;
                        try {
                            ast = new HSParser().parse(e, "dname");
                            this.hilbertSystem.getD(ast);
                            return { success: true, value: ast };
                        } catch (e) {
                            return { success: false, error: e as HSErrorInfo };
                        }
                    }
                };
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
                SyntaxViewer.onClickAst = (t, e) => this.cmdEngine.run((e.target as HTMLElement).closest("[data-id]")?.getAttribute("data-id") || "");
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
            const deduction = this.hilbertSystem.getD(args[0]);
            const conds = args.slice(1, 1 + deduction.conditions.length).map((e, idx) => {
                const p = this.hilbertSystem.getP(e.name);
                if (!p) throw HSError.matchCond(idx + 1, HSError.pname404(e.name));
                return p;
            });
            const replaceValues = Object.fromEntries(args.slice(1 + deduction.conditions.length).map(
                (e, idx) => [deduction.replaceNames[idx][0], e])
            );
            this.hilbertSystem.d(deduction, conds, replaceValues);
            this.propListView.refresh();
        });
        defineCommand('del', (args: AST[]) => {
            if (args.length === 0) {
                this.cmdInput.setParserArgs("item");
                return {
                    prompt: LangMgr.text.plsEnterProp, default: "", parse: e => {
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
            if (!args[0]) throw HSError.emptyValue();
            const n = args[0].name;
            const p = this.hilbertSystem.getP(n);
            if (!p) throw HSError.pname404(n);
            this.hilbertSystem.delP(p);
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
            if (!args[0]) throw HSError.emptyValue();
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
    unlockBasicRuleCmd() {
        defineCommand('m', (args: AST[]) => {
            if (args.length === 0) {
                this.hilbertSystem.checkConclusionInPropList();
                this.cmdInput.setParserArgs("dname");
                let i = 1;
                while (true) { if (!this.hilbertSystem.rules.get("s" + i)) break; i++; }
                return {
                    prompt: LangMgr.text.plsEnterNewRule, default: "s" + i, parse: e => {
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
            if (!args[0]) throw HSError.emptyValue();
            this.hilbertSystem.m(args[0].name);
            this.ruleList.push({ name: args[0].name, uuid: 0 });
            this.propListView.refresh();
            this.ruleListView.refresh();
        });
        defineCommand('hyp', (args: AST[]) => {
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
            if (!args[0]) throw HSError.emptyValue();
            this.hilbertSystem.hyp(args[0]);
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
            if (!args[0]) throw HSError.emptyValue();
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
            if (!args[0]) throw HSError.emptyValue();
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
    addRules(data: string) {
        data.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//")).map(e => {
            const name = e.slice(0, e.indexOf(":")).trim();
            let rest = e.slice(e.indexOf(":") + 1).trim();
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
            this.hilbertSystem.rules.set(name, rule);
            this.ruleList.push({
                name: name,
                uuid: 0,
            });
            if (!ax) {
                
                this.hilbertSystem.fromCmd(steps.split(";").filter(e => e).map(e => new HSParser().parse(e, "cmd")));
                rule.step = this.hilbertSystem.props.slice(0);
            }
        });
        this.ruleListView.refresh();
    }
    refresh() {
        this.propListView.refresh();
        this.ruleListView.refresh();
    }
    serialize() { return this.serde.serialize() }
    deserialize(data: any) { return this.serde.deserialize(data) }
}


