import { FSParser } from "./core/parser.js";
import { highlightHTML, SyntaxEditor } from "../astrender.js";
import { TreeListViewer, makeResizable } from "../listmgr.js";
import { CommandUIManager, defineCommand, ExecutionEngine } from "./gui/cmdmgr.js";
import { AST, NodeType } from "./core/ast.js";
import { Deduction, Proposition } from "./core/deduct.js";
import { HilbertSystem } from "./core/core.js";
import { FSError } from "./core/error.js";
import { AtomSolver } from "./core/assertsolver.js";
export class DeductLayer {
    hilbertSystem = new HilbertSystem;
    ruleList = [];
    ruleListView = new TreeListViewer(this.ruleList, document.getElementById('ruleManager'));
    propListView = new TreeListViewer(this.hilbertSystem.props, document.getElementById('ruleManager'));
    cmdEngine = new ExecutionEngine();
    cmdInput = new SyntaxEditor(document.getElementById('deduct-cmd-input'), new FSParser, "", 'cmds');
    constructor() {
        // 规则表
        this.ruleListView.renderExtra = it => {
            const span = document.createElement('span');
            span.classList.add("extra-rule", "extra-" + (["m<>", "msb", "mcpt", "c", "v"].includes(it.name) || it.name[0] === "a" || it.name === "mp" ? "a" : it.name[0] === "d" ? "d" : "t"));
            return span;
        };
        // 定理表
        this.propListView.renderName = it => it.name || String(it.id);
        this.propListView.allowDrop = (src, dst, pos) => this.hilbertSystem.allowReorder(src, dst, pos);
        this.propListView.onAfterMove = () => this.hilbertSystem.updatePropIdx();
        // 命令栏
        makeResizable(document.getElementById("cmdFooter"), document.getElementById("cmdResizeHandle"), true);
        const executeBtn = document.getElementById('cmd-ok-btn');
        executeBtn.addEventListener('click', () => this.cmdEngine.run(this.cmdInput.getValue()));
        const escBtn = document.getElementById('cmd-esc-btn');
        escBtn.addEventListener('click', () => this.cmdEngine.handleEsc());
        new CommandUIManager(this.cmdEngine, this.cmdInput, document.getElementById('cmd-output'), document.getElementById('cmd-error'), document.getElementById('cmd-prompt'));
    }
    unlockBasicPropCmd() {
        defineCommand('pop', () => null, async () => {
            this.hilbertSystem.pop();
            this.propListView.refresh();
        });
        defineCommand('clear', () => null, async () => {
            this.hilbertSystem.clear();
            this.propListView.refresh();
        });
        defineCommand('d', (args) => {
            if (args.length === 0) {
                this.cmdInput.setParserArgs("dname");
                return {
                    prompt: '请输入规则名:', default: "", parse: e => {
                        let ast;
                        try {
                            ast = new FSParser().parse(e, "dname");
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
            let prompt = '正在进行推理 ' + highlightHTML(FSParser.stringify(args[0], false), "dname") + ' ' + conds + " : " + highlightHTML(deduction.toString(), "rule");
            let defaultValue = "";
            if (condsLength < deduction.conditions.length) {
                mode = "prop";
                prompt += `<br>请输入条件${highlightHTML(deduction.conditions[condsLength].toString(), "wff")}的定理编号，或点选定理`;
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
                    prompt += `<br>请输入替代<span class="ast token-replvar-${type}">${varname}</span>的内容`;
                    defaultValue = varname;
                }
                this.cmdInput.setParserArgs(mode === "prop" ? "ast" : mode);
            }
            return {
                prompt, default: defaultValue, parse: e => {
                    let ast;
                    try {
                        ast = new FSParser().parse(e, mode === "prop" ? "ast" : mode);
                        if (mode === "item")
                            ast.checkITEM();
                        if (mode === "wff")
                            ast.checkWFF();
                        if (mode === "prop" && !this.hilbertSystem.getP(ast.name))
                            throw FSError.matchCond(condsLength + 1, FSError.emptyValue());
                        return { success: true, value: ast };
                    }
                    catch (e) {
                        return { success: false, error: e };
                    }
                }
            };
        }, async (args) => {
            const deduction = this.hilbertSystem.getD(args[0]);
            const conds = args.slice(1, 1 + deduction.conditions.length).map(e => this.hilbertSystem.getP(e.name));
            const replaceValues = Object.fromEntries(args.slice(1 + deduction.conditions.length).map((e, idx) => [deduction.replaceNames[idx][0], e]));
            this.hilbertSystem.addP(Proposition.d(deduction, this.hilbertSystem.getAsserts(), conds, replaceValues));
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
                    prompt: '请输入新规则名:', default: "s" + i, parse: e => {
                        let ast;
                        try {
                            ast = new FSParser().parse(e, "dname");
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
                throw FSError.emptyValue();
            this.ruleList.push(this.hilbertSystem.m(args[0].name));
            this.propListView.refresh();
            this.ruleListView.refresh();
        });
        defineCommand('hyp', (args) => {
            if (args.length === 0) {
                this.cmdInput.setParserArgs("wff");
                return {
                    prompt: '请输入假设:', default: "", parse: e => {
                        let ast;
                        try {
                            ast = new FSParser().parse(e, "wff");
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
                throw FSError.emptyValue();
            this.hilbertSystem.addP(Proposition.hyp(args[0]));
            this.propListView.refresh();
        });
    }
}
function addInitialRules(data, sys, list) {
    data.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//")).map(e => ({
        name: e.match(/^[a-z]+\s+([^\s\:]+)/)?.[1],
        content: e.match(/\:\s*([^\;]\;)*([^\;]+);$/)?.[2],
        type: e.match(/^([a-z]+)\s+/)?.[1]
    })).forEach(e => {
        const ast = new FSParser().parse(e.content, 'rule');
        // 分离assertion和condition
        const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
        ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
        const rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, e.name), assertions, ast.nodes, ast.nodes.pop());
        sys.rules.set(e.name, rule);
        list.push({
            type: "item",
            name: e.name,
            id: 0,
            content: e.content
        });
    });
    return list;
}
//# sourceMappingURL=main.js.map