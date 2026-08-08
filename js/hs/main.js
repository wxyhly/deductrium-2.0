import { HSParser } from "./core/parser.js";
import { highlightHTML, SyntaxEditor, SyntaxViewer } from "../astrender.js";
import { TreeListViewer, makeResizable } from "../listmgr.js";
import { CommandUIManager, defineCommand, ExecutionEngine, getCommand } from "./gui/cmdmgr.js";
import { AST } from "./core/ast.js";
import { Deduction } from "./core/deduction.js";
import { HilbertSystem } from "./core/core.js";
import { HSError } from "./core/error.js";
import { AtomSolver } from "./core/assert.js";
import { NodeType } from "../asttype.js";
import { LangMgr } from "../lang.js";
export class DeductLayer {
    hilbertSystem = new HilbertSystem;
    ruleList = [];
    ruleListView = new TreeListViewer(this.ruleList, document.getElementById('ruleList'));
    propListView = new TreeListViewer(this.hilbertSystem.props, document.getElementById('propList'));
    cmdEngine = new ExecutionEngine();
    cmdInput = new SyntaxEditor(document.getElementById('hs-cmd-input'), new HSParser, "", 'cmds');
    cmdUIMgr;
    constructor() {
        // 规则表
        this.ruleListView.renderExtra = it => {
            const span = document.createElement('span');
            span.classList.add("extra-rule", "extra-" + (["m<>", "msb", "mcpt", "c", "v"].includes(it.name) || it.name[0] === "a" || it.name === "mp" ? "a" : it.name[0] === "d" ? "d" : "t"));
            return span;
        };
        this.ruleListView.renderContent = (it, span) => {
            if (it.children) {
                span.innerText = "📂 " + it.name;
                return;
            }
            new SyntaxViewer(span, new HSParser, this.hilbertSystem.rules.get(it.name).toString() || "", 'rule');
        };
        this.ruleListView.onRename = (r, name) => {
            if (!name?.trim())
                return false;
            if (this.cmdEngine.isExecuting()) {
                this.cmdEngine.reportError(HSError.cmdIsRunning());
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
            return true;
        };
        // 定理表
        this.propListView.renderName = it => it.name || String(it.id);
        this.propListView.wideToggleFolderRange = it => it.from.type === "f";
        this.propListView.allowDrop = (src, dst, pos) => !this.cmdEngine.isExecuting() && this.hilbertSystem.allowReorder(src, dst, pos);
        this.propListView.onAfterChange = () => this.hilbertSystem.updatePropIdx();
        this.propListView.renderContent = (it, span) => {
            if (it.from.type === "f") {
                span.innerText = "📂";
                return;
            }
            // let text = HSParser.stringify(it.ast, false);
            const scope = this.hilbertSystem.getActiveProp();
            // if (it.from.type === "v") text = "∀" + text + ":";
            let mainAST = it.from.type === "v" ? new AST(NodeType.QUANT, "\\a", it.ast, new AST(NodeType.ATOM_WFF, "?")) : it.ast;
            let mainText = mainAST.toString();
            // 层级显示
            if (it.from.type !== "a") {
                let layers = [];
                let outters = [];
                try {
                    outters = this.hilbertSystem.captureScope(null, it);
                }
                catch (e) {
                    span.parentElement?.parentElement?.classList.add("invalid");
                }
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
                // for (const l of layers) {
                //     // prefix = (l.from.type === "v" ? `∀${l.ast}:` + (prefix[0] === "∀" ? "" : "(") : l.from.type === "c" ? l.ast + "→" : "") + prefix;
                // }
                const dummyVars = outters.filter(p => p.from.type === "v").map(e => [e.ast.name, document.querySelector(`div[data-uuid='${e.ast.uuid}'] span`)]);
                const mainspan = document.createElement("span");
                const mainView = new SyntaxViewer(span, new HSParser, null, 'wff', this.hilbertSystem.getReplvarsInfo());
                mainView.setOutterDummyVars(dummyVars);
                const astText = ast.toString();
                mainView.setCode(astText);
                span.appendChild(mainspan);
                if (ast !== mainAST) {
                    const preSpan = document.createElement("span");
                    preSpan.className = "pre-span";
                    const postSpan = document.createElement("span");
                    postSpan.className = "post-span";
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
                this.cmdEngine.reportError(HSError.cmdIsRunning());
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
        this.propListView.onDelete = p => {
            try {
                return this.hilbertSystem.delP(p);
            }
            catch (e) {
                this.cmdEngine.reportError(e);
                return false;
            }
        };
        this.propListView.onFolderActiveCancel = () => {
            this.hilbertSystem.clearActiveDir();
        };
        // 命令栏
        makeResizable(document.getElementById("cmdFooter"), document.getElementById("cmdResizeHandle"), true);
        const executeBtn = document.getElementById('cmd-ok-btn');
        executeBtn.addEventListener('click', () => this.cmdEngine.run(this.cmdInput.getValue()));
        const escBtn = document.getElementById('cmd-esc-btn');
        escBtn.addEventListener('click', () => this.cmdEngine.handleEsc());
        this.cmdUIMgr = new CommandUIManager(this.cmdEngine, this.cmdInput, document.getElementById('cmd-error'), document.getElementById('cmd-prompt'));
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
                return {
                    prompt: LangMgr.text.plsEnterRuleName, default: "", parse: e => {
                        let ast;
                        try {
                            ast = new HSParser().parse(e, "dname");
                            this.hilbertSystem.getD(ast);
                            return { success: true, value: ast };
                        }
                        catch (e) {
                            return { success: false, error: e };
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
            while (conds.length < deduction.conditions.length)
                conds.push("?");
            conds.join(" ");
            let prompt = LangMgr.text.deducing + highlightHTML(HSParser.stringify(args[0], false), "dname") + ' ' + conds + " : " + highlightHTML(deduction.toString(), "rule");
            let defaultValue = "";
            if (condsLength < deduction.conditions.length) {
                mode = "prop";
                prompt += `<br>${LangMgr.formalize.plsEnterCond(highlightHTML(deduction.conditions[condsLength].toString(), "wff"))}`;
                SyntaxViewer.onClickAst = (t, e) => this.cmdEngine.run(e.target.closest("[data-id]")?.getAttribute("data-id") || "");
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
                throw HSError.emptyValue();
            this.hilbertSystem.m(args[0].name);
            this.ruleList.push({ name: args[0].name, uuid: 0 });
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
                throw HSError.emptyValue();
            this.hilbertSystem.hyp(args[0]);
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
                throw HSError.emptyValue();
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
                throw HSError.emptyValue();
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
    addRules(data) {
        data.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//")).map(e => ({
            name: e.match(/^[a-z]+\s+([^\s\:]+)/)?.[1],
            content: e.match(/\:\s*([^\;]\;)*([^\;]+);$/)?.[2],
            type: e.match(/^([a-z]+)\s+/)?.[1]
        })).forEach(e => {
            const ast = new HSParser().parse(e.content, 'rule');
            // 分离assertion和condition
            const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
            ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
            const rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, e.name), assertions, ast.nodes, ast.nodes.pop());
            this.hilbertSystem.rules.set(e.name, rule);
            this.ruleList.push({
                type: "item",
                name: e.name,
                uuid: 0,
                content: e.content
            });
        });
        this.ruleListView.refresh();
    }
}
//# sourceMappingURL=main.js.map