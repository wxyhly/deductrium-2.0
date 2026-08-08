import { FSParser } from "../core/parser.js";
import { SyntaxEditor, SyntaxViewer } from "../../astrender.js";
import { PropManager, RuleManager } from "./list.js";
import { makeResizable } from "../../listmgr.js";
import { defineCommand, ExecutionEngine } from "./cmdmgr.js";
import { AST, NodeType } from "../core/ast.js";
import { Deduction, Proposition } from "../core/deduct.js";
import { HibertSystem } from "../core/core.js";
import { initialRules } from "../core/initial.js";
import { FSError } from "../core/error.js";
import { AtomSolver } from "../core/assertsolver.js";
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
export function loadFSGui() {
    const hibertSystem = new HibertSystem;
    const rules = addInitialRules(initialRules, hibertSystem, []);
    const ruleManager = new RuleManager(document.getElementById('ruleManager'), rules);
    const propManager = new PropManager(document.getElementById('propManager'), hibertSystem.props);
    const cmdInput = new SyntaxEditor(document.getElementById('deduct-cmd-input'), new FSParser, "", 'cmds');
    const cmdEngine = new ExecutionEngine();
    propManager.onAfterMove = () => { hibertSystem.updatePropIdx(); propManager.refresh(); };
    propManager.allowDrop = (sourceId, targetId, position) => hibertSystem.allowReorder(sourceId, targetId, position);
    cmdInput.onEnter = () => cmdEngine.run(cmdInput.getValue());
    cmdInput.onEsc = () => cmdEngine.handleEsc();
    document.addEventListener('keydown', e => e.key === "Escape" && cmdInput.disabled ? cmdEngine.handleEsc() : "");
    makeResizable(document.getElementById("cmdFooter"), document.getElementById("cmdResizeHandle"), true);
    const outputDiv = document.getElementById('cmd-output');
    const errorDiv = document.getElementById('cmd-error');
    const promptDiv = document.getElementById('cmd-prompt');
    const executeBtn = document.getElementById('cmd-ok-btn');
    const escBtn = document.getElementById('cmd-esc-btn');
    SyntaxViewer.onClickAst = (text, e, parser, parserArgs) => {
        cmdInput.executeInsertText(text);
    };
    // 注入 UI 回调
    cmdEngine.ui = {
        setClearState() {
            errorDiv.style.display = 'none';
            promptDiv.style.display = 'none';
            cmdInput.disabled = false;
            cmdInput.setParserArgs("cmds");
        },
        showPrompt(text, defaultValue) {
            promptDiv.style.display = '';
            promptDiv.innerHTML = text;
            promptDiv.querySelectorAll("span[data-ast-type]").forEach(e => {
                const type = e.getAttribute("data-ast-type");
                const ast = e.innerText;
                e.classList.add("ast");
                new SyntaxViewer(e, new FSParser, ast, type);
            });
            if (cmdInput.getValue().trim() === "")
                cmdInput.setValue(defaultValue);
            cmdInput.focus();
            cmdInput.setSelectionRange(0, cmdInput.getValue().length);
        },
        showError(msg) {
            errorDiv.innerText = msg;
            errorDiv.style.display = '';
            cmdInput.disabled = true;
        },
        clearError() {
            errorDiv.style.display = 'none';
            cmdInput.disabled = false;
        },
        setInputText(text) {
            cmdInput.setValue(text);
        },
        appendOutput(text) {
            outputDiv.innerText += text + '\n';
        }
    };
    const escapeHtmlMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    function highlight(str, type) {
        return `<span data-ast-type="${type}">${str.replace(/[&<>"']/g, ch => escapeHtmlMap[ch])}</span>`;
    }
    // 执行按钮
    executeBtn.addEventListener('click', () => cmdEngine.run(cmdInput.getValue()));
    // 参数输入框
    escBtn.addEventListener('click', (e) => {
        cmdEngine.handleEsc();
    });
    defineCommand('pop', () => null, async () => {
        hibertSystem.pop();
        propManager.refresh();
    });
    defineCommand('clear', () => null, async () => {
        hibertSystem.clear();
        propManager.refresh();
    });
    defineCommand('m', (args) => {
        if (args.length === 0) {
            hibertSystem.checkConclusionInPropList();
            cmdInput.setParserArgs("dname");
            let i = 1;
            while (true) {
                if (!hibertSystem.rules.get("s" + i))
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
        ruleManager.addRule(hibertSystem.m(args[0].name));
        propManager.refresh();
    });
    defineCommand('hyp', (args) => {
        if (args.length === 0) {
            cmdInput.setParserArgs("wff");
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
        hibertSystem.addP(Proposition.hyp(args[0]));
        propManager.refresh();
    });
    defineCommand('d', (args) => {
        if (args.length === 0) {
            cmdInput.setParserArgs("dname");
            return {
                prompt: '请输入规则名:', default: "", parse: e => {
                    let ast;
                    try {
                        ast = new FSParser().parse(e, "dname");
                        hibertSystem.getD(ast);
                        return { success: true, value: ast };
                    }
                    catch (e) {
                        return { success: false, error: e };
                    }
                }
            };
        }
        const deduction = hibertSystem.getD(args[0]);
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
        let prompt = '正在进行推理 ' + highlight(FSParser.stringify(args[0], false), "dname") + ' ' + conds + " : " + highlight(deduction.toString(), "rule");
        let defaultValue = "";
        if (condsLength < deduction.conditions.length) {
            mode = "prop";
            prompt += `<br>请输入条件${highlight(deduction.conditions[condsLength].toString(), "wff")}的定理编号，或点选定理`;
        }
        else {
            for (let i = 1 + condsLength; i < args.length; i++) {
                const [varname, isItem] = deduction.replaceNames[i - 1 - condsLength];
                const type = isItem ? "item" : "wff";
                prompt += `<br><span class="ast token-replvar-${type}">${varname}</span> : ` + highlight(args[i].toString(), type);
            }
            const currentReplaceIdx = args.length - 1 - condsLength;
            if (currentReplaceIdx >= 0 && currentReplaceIdx < deduction.replaceNames.length) {
                const [varname, isItem] = deduction.replaceNames[currentReplaceIdx];
                const type = isItem ? "item" : "wff";
                mode = type;
                prompt += `<br>请输入替代<span class="ast token-replvar-${type}">${varname}</span>的内容`;
                defaultValue = varname;
            }
            cmdInput.setParserArgs(mode === "prop" ? "ast" : mode);
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
                    if (mode === "prop" && !hibertSystem.getP(ast.name))
                        throw FSError.matchCond(condsLength + 1, FSError.emptyValue());
                    return { success: true, value: ast };
                }
                catch (e) {
                    return { success: false, error: e };
                }
            }
        };
    }, async (args) => {
        const deduction = hibertSystem.getD(args[0]);
        const conds = args.slice(1, 1 + deduction.conditions.length).map(e => hibertSystem.getP(e.name));
        const replaceValues = Object.fromEntries(args.slice(1 + deduction.conditions.length).map((e, idx) => [deduction.replaceNames[idx][0], e]));
        hibertSystem.addP(Proposition.d(deduction, hibertSystem.getAsserts(), conds, replaceValues));
        propManager.refresh();
    });
}
//# sourceMappingURL=load.js.map