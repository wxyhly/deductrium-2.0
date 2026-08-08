import { NodeType } from '../core/ast.js';
// import { FSError } from '../core/error.js';
import { FSParser } from '../core/parser.js';
const registry = new Map();
export function defineCommand(name, getNextParam, execute) {
    registry.set(name, { name, getNextParam, execute });
}
export function getCommand(name) {
    return registry.get(name);
}
export function splitCommands(input) {
    const result = [];
    let start = 0;
    for (let i = 0; i <= input.length; i++) {
        // 到达末尾或遇到分隔符时切出一个片段
        if (i === input.length || input[i] === '\n' || input[i] === ';') {
            result.push({
                text: input.slice(start, i),
                offset: start,
            });
            start = i + 1; // 下一段从分隔符之后开始
        }
    }
    return result;
}
export class ExecutionEngine {
    // private state: EngineState = 'IDLE';
    fragments = []; // 本次执行的所有命令
    // private currentIndex = 0;                   // 下一条待执行命令的索引
    currentDef = null;
    currentArgs = []; // PARAM_INPUT 中已收集的参数
    currentArgTexts = [];
    // 保存各种恢复用的文本
    savedCommandText = ''; // 当前交互命令的原始文本
    hasError = false;
    // 辅助方法：从命令片段中提取各参数的原始文本
    extractArgTexts(frag, args) {
        return args.map(node => {
            return frag.text.substring(node.start, node.end);
        });
    }
    // getState(): EngineState {
    //     return this.state;
    // }
    // UI 回调接口（由外部注入）
    ui = null;
    run(input) {
        if (!this.currentDef) {
            this.fragments = this.parseAll(input);
            this.advance();
            return;
        }
        const req = this.currentDef.getNextParam(this.currentArgs, true);
        const parsed = req.parse(input);
        if (parsed.success === false) {
            this.reportError(parsed.error);
            return;
        }
        this.currentArgs.push(parsed.value);
        this.currentArgTexts.push(input);
        const nextReq = this.currentDef.getNextParam(this.currentArgs, false);
        if (!nextReq) {
            this.executeCurrent();
        }
        else {
            this.ui.setInputText("");
            this.ui.showPrompt(nextReq.prompt, nextReq.default);
        }
    }
    handleEsc() {
        if (this.currentDef && (!this.hasError || !this.currentDef.getNextParam(this.currentArgs, true))) {
            if (this.currentArgs.length > 0) {
                // 回退一步：弹出最后一个 AST 和对应的文本
                this.currentArgs.pop();
                const lastText = this.currentArgTexts.pop() ?? '';
                // 显示上一步的提示（期间可能改变高亮方式）
                const req = this.currentDef.getNextParam(this.currentArgs, false);
                this.ui.showPrompt(req.prompt, "");
                // 将上一个参数的文本回填到输入框（改了高亮再显示）
                this.ui.setInputText(lastText);
            }
            else {
                // 完全取消，恢复原始命令文本
                const text = this.savedCommandText;
                this.clearState();
                this.ui.setInputText(text);
            }
        }
        if (this.hasError) {
            this.hasError = false;
            this.ui.clearError();
        }
    }
    // ---------------------- 内部方法 ----------------------
    parseAll(input) {
        const fragments = splitCommands(input);
        for (const f of fragments) {
            try {
                f.ast = new FSParser().parse(f.text, "cmd");
            }
            catch (e) {
                f.error = e;
            }
        }
        this.savedCommandText = input;
        return fragments;
    }
    shiftFragments() {
        const removed = this.fragments.shift();
        if (removed && this.fragments.length > 0) {
            this.savedCommandText = this.savedCommandText.slice(this.fragments[0].offset);
            // 新的起始偏移量 = 原第二个片段的 offset（即被移除部分的总长度）
            const delta = this.fragments[0].offset;
            for (const frag of this.fragments) {
                frag.offset -= delta;
            }
        }
        return removed;
    }
    /** 清除所有状态，一般用于执行完所有命令后 */
    clearState() {
        this.currentArgTexts = [];
        this.currentArgs = [];
        this.currentDef = null;
        this.savedCommandText = '';
        this.ui.setInputText("");
        this.ui.setClearState();
        this.hasError = false;
    }
    advance() {
        let frag = this.fragments[0];
        while (frag && !frag.text.trim()) {
            this.shiftFragments();
            frag = this.fragments[0];
        }
        if (!this.fragments.length) {
            this.clearState();
            return;
        }
        if (!frag.ast || frag.ast.type !== NodeType.CMD || !frag.ast.name || frag.error) {
            this.reportError(FSError.unknownCmd(frag.error || frag.text));
            return null;
        }
        const def = getCommand(frag.ast.name); // 从注册表查定义
        if (!def) {
            this.reportError(FSError.unknownCmd(frag.ast.name));
            return;
        }
        const initialArgs = frag.ast.nodes; // 文本中已提供的 AST 参数
        const isLast = this.fragments.length === 1;
        // 检查参数是否已经足够
        try {
            const enough = this.isArgsEnough(def, initialArgs);
            if (enough) {
                // 参数齐全，直接执行
                this.executeCommand(def, initialArgs, () => {
                    this.shiftFragments();
                    this.advance();
                });
            }
            else if (isLast) {
                // 最后一条命令，进入交互补全
                this.currentDef = def;
                this.currentArgs = [...initialArgs];
                this.savedCommandText = frag.text;
                this.currentArgTexts = this.extractArgTexts(frag, initialArgs);
                const req = def.getNextParam(this.currentArgs, false);
                this.ui.setInputText("");
                this.ui.showPrompt(req.prompt, req.default);
            }
            else {
                // 非最后一条命令参数不足 → 错误
                this.ui.setClearState();
                this.reportError(`命令 ${def.name} 参数不足`);
            }
        }
        catch (e) {
            this.reportError(e);
        }
    }
    isArgsEnough(def, args) {
        return def.getNextParam(args, false) === null;
    }
    executeCommand(def, args, onSuccess) {
        try {
            const result = def.execute(args);
            if (result instanceof Promise) {
                result.then(res => {
                    if (res)
                        this.ui.appendOutput(res);
                    onSuccess();
                }, err => this.reportError(err.message || String(err)));
            }
            else {
                if (result)
                    this.ui.appendOutput(result);
                onSuccess();
            }
        }
        catch (e) {
            this.reportError(e);
        }
    }
    executeCurrent() {
        // 当前交互命令参数齐了，执行
        if (!this.currentDef)
            return;
        this.executeCommand(this.currentDef, this.currentArgs, () => {
            // 成功后清空并回到 IDLE
            this.clearState();
        });
    }
    reportError(msg) {
        if (!this.currentDef)
            this.ui.setInputText(this.savedCommandText);
        this.hasError = true;
        this.ui.showError(msg);
    }
}
import { SyntaxViewer } from "../../astrender.js";
export class CommandUIManager {
    outputDiv;
    errorDiv;
    promptDiv;
    cmdInput;
    engine;
    constructor(engine, cmdInput, outputDiv, errorDiv, promptDiv) {
        this.engine = engine;
        this.cmdInput = cmdInput;
        this.outputDiv = outputDiv;
        this.errorDiv = errorDiv;
        this.promptDiv = promptDiv;
        // 将自身作为 engine 的 ui 回调对象
        engine.ui = {
            setClearState: () => this.setClearState(),
            showPrompt: (text, defaultValue) => this.showPrompt(text, defaultValue),
            showError: (msg) => this.showError(msg),
            clearError: () => this.clearError(),
            setInputText: (text) => this.setInputText(text),
            appendOutput: (text) => this.appendOutput(text),
        };
        this.cmdInput.onEnter = () => this.engine.run(this.cmdInput.getValue());
        document.addEventListener('keydown', e => {
            if (e.key === "Escape")
                return;
            if (this.cmdInput.disabled || this.cmdInput.isFocused()) {
                this.engine.handleEsc();
            }
            else {
                this.cmdInput.focus();
                this.cmdInput.setSelectionRange(0, this.cmdInput.getValue().length);
            }
        });
    }
    setClearState() {
        this.errorDiv.style.display = 'none';
        this.promptDiv.style.display = 'none';
        this.cmdInput.disabled = false;
        this.cmdInput.setParserArgs("cmds");
    }
    showPrompt(text, defaultValue) {
        this.promptDiv.style.display = '';
        this.promptDiv.innerHTML = text;
        SyntaxViewer.enhance(this.promptDiv, new FSParser());
        if (this.cmdInput.getValue().trim() === "") {
            this.cmdInput.setValue(defaultValue);
        }
        this.cmdInput.focus();
        this.cmdInput.setSelectionRange(0, this.cmdInput.getValue().length);
    }
    showError(msg) {
        this.errorDiv.innerText = msg;
        this.errorDiv.style.display = '';
        this.cmdInput.disabled = true;
    }
    clearError() {
        this.errorDiv.style.display = 'none';
        this.cmdInput.disabled = false;
    }
    setInputText(text) {
        this.cmdInput.setValue(text);
    }
    appendOutput(text) {
        this.outputDiv.innerText += text + '\n';
    }
}
//# sourceMappingURL=cmdmgr.js.map