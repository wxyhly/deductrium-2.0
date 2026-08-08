// types.ts
import { NodeType } from '../core/ast.js'; // 你已有的 AST 类型
import { FSParser } from '../core/parser.js';
const registry = new Map();
export function defineCommand(name, getNextParam, execute) {
    registry.set(name, { name, getNextParam, execute });
}
export function getCommand(name) {
    return registry.get(name);
}
/**
 * 从完整输入中拆分出命令片段
 * 规则：按换行分隔，然后每个行内再按分号分隔
 */
export function splitCommands(input) {
    const lines = input.split('\n');
    const fragments = [];
    for (const line of lines) {
        // 分号分隔，保留非空片段
        const parts = line.split(';');
        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed)
                fragments.push(trimmed);
        }
    }
    return fragments;
}
export class ExecutionEngine {
    state = 'IDLE';
    fragments = []; // 本次执行的所有命令
    currentIndex = 0; // 下一条待执行命令的索引
    currentDef = null;
    currentArgs = []; // PARAM_INPUT 中已收集的参数
    // 保存各种恢复用的文本
    savedCommandText = ''; // 当前交互命令的原始文本
    // UI 回调接口（由外部注入）
    ui = null;
    /** 从 IDLE 触发执行 */
    run(inputText) {
        const fragments = this.parseAll(inputText);
        if (!fragments)
            return; // 解析错误，已在 parseAll 里处理
        this.fragments = fragments;
        this.currentIndex = 0;
        this.advance();
    }
    /** 处理用户输入的参数（PARAM_INPUT 状态下回车） */
    submitParam(input) {
        if (this.state !== 'PARAM_INPUT' || !this.currentDef)
            return;
        const req = this.currentDef.getNextParam(this.currentArgs);
        if (!req) {
            this.executeCurrent(); // 参数居然齐了，直接执行
            return;
        }
        const parsed = req.parse(input);
        if (!parsed.success) {
            this.ui.showError(parsed.error);
            return;
        }
        this.currentArgs.push(parsed.value);
        const nextReq = this.currentDef.getNextParam(this.currentArgs);
        if (!nextReq) {
            this.executeCurrent(); // 参数齐了
        }
        else {
            this.ui.showPrompt(nextReq.prompt);
        }
    }
    /** 处理 Esc 键 */
    handleEsc() {
        if (this.state === 'PARAM_INPUT') {
            if (this.currentArgs.length > 0) {
                // 回退一步
                this.currentArgs.pop();
                const req = this.currentDef.getNextParam(this.currentArgs);
                this.ui.showPrompt(req.prompt);
            }
            else {
                // 取消整个交互，回到 IDLE，恢复该命令原始文本
                this.state = 'IDLE';
                this.ui.setState('IDLE');
                this.ui.setInputText(this.savedCommandText);
            }
        }
        else if (this.state === 'ERROR') {
            // 从错误恢复，显示未执行命令的原始文本
            this.state = 'IDLE';
            this.ui.setState('IDLE');
            const restTexts = this.fragments
                .slice(this.currentIndex)
                .map(f => f.text)
                .join('\n');
            this.ui.setInputText(restTexts);
        }
    }
    // ---------------------- 内部方法 ----------------------
    parseAll(input) {
        const rawList = splitCommands(input);
        const fragments = [];
        for (const text of rawList) {
            const ast = new FSParser().parse(text, "cmd"); // 你的解析器，返回 CMD 类型的 AST
            if (!ast || ast.type !== NodeType.CMD || !ast.name) {
                this.ui.showError(`无效命令: ${text}`);
                return null;
            }
            fragments.push({ text, ast });
        }
        return fragments;
    }
    advance() {
        if (this.currentIndex >= this.fragments.length) {
            // 全部完成
            this.state = 'IDLE';
            this.ui.setState('IDLE');
            this.ui.clearInput();
            return;
        }
        const frag = this.fragments[this.currentIndex];
        const def = getCommand(frag.ast.name); // 从注册表查定义
        if (!def) {
            this.reportError(`未知命令: ${frag.ast.name}`, false);
            return;
        }
        const initialArgs = frag.ast.nodes; // 文本中已提供的 AST 参数
        const isLast = this.currentIndex === this.fragments.length - 1;
        // 检查参数是否已经足够
        const enough = this.isArgsEnough(def, initialArgs);
        if (enough) {
            // 参数齐全，直接执行
            this.executeCommand(def, initialArgs, () => {
                this.currentIndex++;
                this.advance();
            });
        }
        else if (isLast) {
            // 最后一条命令，进入交互补全
            this.state = 'PARAM_INPUT';
            this.ui.setState('PARAM_INPUT');
            this.currentDef = def;
            this.currentArgs = [...initialArgs];
            this.savedCommandText = frag.text;
            const req = def.getNextParam(this.currentArgs);
            this.ui.showPrompt(req.prompt);
        }
        else {
            // 非最后一条命令参数不足 → 错误
            this.reportError(`命令 ${def.name} 参数不足`, true);
        }
    }
    isArgsEnough(def, args) {
        return def.getNextParam(args) === null;
    }
    executeCommand(def, args, onSuccess) {
        try {
            const result = def.execute(args);
            if (result instanceof Promise) {
                result.then(res => {
                    if (res)
                        this.ui.appendOutput(res);
                    onSuccess();
                }, err => this.reportError(err.message || String(err), false));
            }
            else {
                if (result)
                    this.ui.appendOutput(result);
                onSuccess();
            }
        }
        catch (e) {
            this.reportError(e.message, false);
        }
    }
    executeCurrent() {
        // 当前交互命令参数齐了，执行
        if (!this.currentDef)
            return;
        this.executeCommand(this.currentDef, this.currentArgs, () => {
            // 成功后清空并回到 IDLE
            this.state = 'IDLE';
            this.ui.setState('IDLE');
            this.ui.clearInput();
            this.currentDef = null;
        });
    }
    reportError(msg, keepRestCommands) {
        this.state = 'ERROR';
        this.ui.setState('ERROR');
        this.ui.showError(msg + ' (按 Esc 继续)');
        // 保存恢复时需要的文本：通常是当前及之后未执行的命令
        this.savedCommandText = this.fragments
            .slice(this.currentIndex)
            .map(f => f.text)
            .join('\n');
    }
}
//# sourceMappingURL=cmd.js.map