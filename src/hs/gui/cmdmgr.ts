import { AST } from '../core/ast.js';
import { IParser, SyntaxEditor, SyntaxViewer } from "../../astrender.js";
import { HSError, HSErrorInfo } from '../core/error.js';
import { HSParser } from '../core/parser.js';
import { LangMgr } from '../../lang.js';
import { NodeType } from '../../asttype.js';

/** 参数需求 */
export interface ParamRequest {
    default: string;                            // 给用户的默认值
    prompt: string;                            // 给用户的提示
    parse: (input: string) => ParseResult;     // 解析用户输入的字符串为 AST 或报错
}

export type ParseResult =
    | { success: true; value: AST }
    | { success: false; error: HSErrorInfo };

/**
 * 根据已收集到的参数，返回下一个参数的需求；返回 null 表示参数已齐。
 * 前几个参数可能来自文本中的直接输入，后续由交互补全。
 */
export type GetNextParam = (args: AST[], onlyParse: boolean) => ParamRequest | null;

/** 命令定义 */
export interface CommandDefinition {
    name: string;
    getNextParam: GetNextParam;
    execute: (args: AST[]) => Promise<string | void> | string | void;
    onEscape?: () => boolean;
}

const registry = new Map<string, CommandDefinition>();

export function defineCommand(
    name: string,
    getNextParam: GetNextParam,
    execute: CommandDefinition['execute'],
    options: Pick<CommandDefinition, 'onEscape'> = {}
) {
    registry.set(name, { name, getNextParam, execute, ...options });
}

export function getCommand(name: string): CommandDefinition | undefined {
    return registry.get(name);
}

export function getCommandNames(): string[] {
    return [...registry.keys()];
}

export interface CommandFragment {
    text: string;   // 原始文本（用于回退显示）
    ast: AST;       // 解析后的 CMD 节点（name 不为空）
    offset: number;
    error?: string;
}

export function splitCommands(input: string): Omit<CommandFragment, 'ast'>[] {
    const result: Omit<CommandFragment, 'ast'>[] = [];
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


// type EngineState = 'IDLE' | 'PARAM_INPUT' | 'ERROR';
export interface HighlightContext {
    /** 引擎当前状态 */
    // state: EngineState;
    /** 当前正在交互的命令名（仅在 PARAM_INPUT 时存在） */
    command?: string;
    /** 已收集的参数列表（PARAM_INPUT 时） */
    args?: AST[];
    /** 下一个参数的需求（null 表示参数已齐） */
    nextParam?: ParamRequest | null;
    /** 当次错误信息（ERROR 状态时） */
    errorMessage?: string;
}
export class ExecutionEngine {
    onIdleEscape?: () => boolean;
    beforeCommand?: (name: string) => void;
    transformInput?: (input: string) => string;
    // private state: EngineState = 'IDLE';
    private fragments: CommandFragment[] = [];  // 本次执行的所有命令
    // private currentIndex = 0;                   // 下一条待执行命令的索引
    private currentDef: CommandDefinition | null = null;
    private currentArgs: AST[] = [];            // PARAM_INPUT 中已收集的参数
    private currentArgTexts: string[] = [];
    // 保存各种恢复用的文本
    private savedCommandText: string = '';      // 当前交互命令的原始文本
    private hasError = false;

    // 辅助方法：从命令片段中提取各参数的原始文本
    private extractArgTexts(frag: CommandFragment, args: AST[]): string[] {
        return args.map(node => {
            return frag.text.substring(node.start!, node.end!);
        });
    }
    // UI 回调接口（由外部注入）
    ui: {
        setClearState: () => void;
        showPrompt: (text: string, defaultValue: string) => void;
        showError: (msg: HSErrorInfo) => void;
        clearError: () => void;
        setInputText: (text: string) => void;
    } = null!;

    isExecuting() {
        return !!this.currentDef;
    }

    getCompletionContext(): { command: string; argumentCount: number } | undefined {
        return this.currentDef ? { command: this.currentDef.name, argumentCount: this.currentArgs.length } : undefined;
    }

    run(input: string) {
        try {
            this.runInput(input);
        } catch (e) {
            this.reportError(e as HSErrorInfo);
        }
    }

    private runInput(input: string) {
        if (!input.trim()) return;
        if (!this.currentDef) {
            this.fragments = this.parseAll(this.transformInput?.(input) ?? input);
            this.advance();
            return;
        }
        const req = this.currentDef.getNextParam(this.currentArgs, true);

        const parsed = req!.parse(input);
        if (parsed.success === false) {
            this.reportError(parsed.error);
            return;
        }
        this.currentArgs.push(parsed.value);
        this.currentArgTexts.push(input);

        const nextReq = this.currentDef.getNextParam(this.currentArgs, false);
        if (!nextReq) {
            this.executeCurrent();
        } else {
            this.ui.setInputText("");
            this.ui.showPrompt(nextReq.prompt, nextReq.default);
        }
    }

    handleEsc() {
        try {
            if (!this.currentDef) {
                this.onIdleEscape?.();
            } else if (this.currentDef.onEscape) {
                if (this.currentDef.onEscape()) {
                    const req = this.currentDef.getNextParam(this.currentArgs, false);
                    if (req) this.ui.showPrompt(req.prompt, req.default);
                } else {
                    const text = this.savedCommandText;
                    this.clearState();
                    this.ui.setInputText(text);
                }
                if (this.hasError) {
                    this.hasError = false;
                    this.ui.clearError();
                }
                return;
            }
            if (this.currentDef) {
                let rewind = !this.hasError;
                if (this.hasError) {
                    try {
                        // A parse error leaves a usable request; a rejected collected
                        // argument may make even this request lookup throw.
                        rewind = !this.currentDef.getNextParam(this.currentArgs, true);
                    } catch {
                        rewind = true;
                    }
                }
                if (rewind) {
                    if (this.hasError) {
                        this.hasError = false;
                        this.ui.clearError();
                    }
                    this.rewindParameter();
                }
            }
            if (this.hasError) {
                this.hasError = false;
                this.ui.clearError();
            }
        } catch (e) {
            this.reportError(e as HSErrorInfo);
        }
    }

    private rewindParameter() {
        while (this.currentArgs.length) {
            this.currentArgs.pop();
            const lastText = this.currentArgTexts.pop() ?? '';
            let req: ParamRequest | null;
            try {
                req = this.currentDef!.getNextParam(this.currentArgs, false);
            } catch (e) {
                // Earlier targets can also become stale. Keep the command and
                // rewind to the nearest request that can actually be edited.
                if (this.currentArgs.length) continue;
                throw e;
            }
            if (!req) continue;
            this.ui.showPrompt(req.prompt, "");
            this.ui.setInputText(lastText);
            return;
        }
        const text = this.savedCommandText;
        this.clearState();
        this.ui.setInputText(text);
    }

    // ---------------------- 内部方法 ----------------------
    private parseAll(input: string): CommandFragment[] {
        const fragments = splitCommands(input) as CommandFragment[];
        for (const f of fragments) {
            try {
                f.ast = new HSParser().parse(f.text, "cmd");
            } catch (e) {
                f.error = e as string;
            }
        }
        this.savedCommandText = input;
        return fragments;
    }
    private shiftFragments(): CommandFragment | undefined {
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
    private clearState() {
        this.currentArgTexts = [];
        this.currentArgs = [];
        this.currentDef = null;
        this.savedCommandText = '';
        this.ui.setInputText("");
        this.ui.setClearState();
        this.hasError = false;
    }
    private advance() {
        let frag = this.fragments[0];
        while (frag && !frag.text.trim()) { this.shiftFragments(); frag = this.fragments[0]; }
        if (!this.fragments.length) {
            this.clearState(); return;
        }
        if (!frag.ast || frag.ast.type !== NodeType.CMD || !frag.ast.name || frag.error) {
            this.reportError(HSError.unknownCmd(frag.error || frag.text));
            return null;
        }
        const def = getCommand(frag.ast.name);  // 从注册表查定义
        if (!def) {
            this.reportError(HSError.unknownCmd(frag.ast.name));
            return;
        }

        const initialArgs = frag.ast.nodes;        // 文本中已提供的 AST 参数
        const isLast = this.fragments.length === 1;

        // 检查参数是否已经足够
        try {
            this.beforeCommand?.(def.name);
            const enough = this.isArgsEnough(def, initialArgs);
            if (enough) {
                // 参数齐全，直接执行
                this.executeCommand(def, initialArgs, () => {
                    this.shiftFragments();
                    this.advance();
                });
            } else if (isLast) {
                // 最后一条命令，进入交互补全
                this.currentDef = def;
                this.currentArgs = [...initialArgs];
                this.savedCommandText = frag.text;
                this.currentArgTexts = this.extractArgTexts(frag, initialArgs);
                const req = def.getNextParam(this.currentArgs, false)!;
                this.ui.setInputText("");
                this.ui.showPrompt(req.prompt, req.default);
            } else {
                // 非最后一条命令参数不足 → 错误
                this.ui.setClearState();
                throw HSError.argNotEnough(frag.ast.name === "d" && initialArgs[0] ? initialArgs[0].toString() : frag.ast.name);
            }
        } catch (e: any) {
            this.reportError(e);
        }
    }

    private isArgsEnough(def: CommandDefinition, args: AST[]): boolean {
        return def.getNextParam(args, false) === null;
    }

    private executeCommand(
        def: CommandDefinition,
        args: AST[],
        onSuccess: () => void
    ) {
        try {
            const result = def.execute(args);
            if (result instanceof Promise) {
                result.then(res => onSuccess(),
                    err => this.reportError(err)
                );
            } else {
                onSuccess();
            }
        } catch (e: any) {
            this.reportError(e);
        }
    }

    private executeCurrent() {
        // 当前交互命令参数齐了，执行
        if (!this.currentDef) return;
        this.executeCommand(this.currentDef, this.currentArgs, () => {
            // 成功后清空并回到 IDLE
            this.clearState();
        });
    }

    reportError(msg: HSErrorInfo) {
        if (!this.currentDef) this.ui.setInputText(this.savedCommandText);
        this.hasError = true;
        this.ui.showError(msg);
    }
}


export class CommandUIManager {
    private errorDiv: HTMLDivElement;
    private promptDiv: HTMLDivElement;
    private cmdInput: SyntaxEditor;
    private engine: ExecutionEngine;
    private onClearState?: () => void;
    private ownerDocument: Document;
    private previousOnEnter: SyntaxEditor['onEnter'];
    private previousAstClick: typeof SyntaxViewer.onClickAst;
    private onEnter = () => this.engine.run(this.cmdInput.getValue());
    private onDocumentKeyDown = (e: KeyboardEvent) => {
        if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
        if (!this.errorDiv.isConnected || !this.promptDiv.isConnected) return;
        const target = e.target as Element | null;
        if (!this.cmdInput.isFocused()) {
            // Disabled textareas may deliver Escape to the document/body. Do
            // not take that Escape from another editor or an unrelated dialog.
            if (target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')) return;
            const dialog = target?.closest?.('dialog,[role="dialog"]');
            if (dialog && !dialog.contains(this.promptDiv)) return;
            if (!this.errorDiv.parentElement?.getClientRects().length) return;
        }
        if (this.cmdInput.disabled || this.cmdInput.isFocused()) {
            e.preventDefault();
            this.engine.handleEsc();
        } else {
            this.cmdInput.focus();
            this.cmdInput.setSelectionRange(0, this.cmdInput.getValue().length);
        }
    };

    constructor(
        engine: ExecutionEngine,
        cmdInput: SyntaxEditor,
        errorDiv: HTMLDivElement,
        promptDiv: HTMLDivElement,
        onClearState?: () => void
    ) {
        this.engine = engine;
        this.cmdInput = cmdInput;
        this.errorDiv = errorDiv;
        this.promptDiv = promptDiv;
        this.onClearState = onClearState;
        this.ownerDocument = errorDiv.ownerDocument;
        this.previousOnEnter = cmdInput.onEnter;
        this.previousAstClick = SyntaxViewer.onClickAst;

        // 将自身作为 engine 的 ui 回调对象
        engine.ui = {
            setClearState: () => this.setClearState(),
            showPrompt: (text, defaultValue) => this.showPrompt(text, defaultValue),
            showError: (msg) => this.showError(msg),
            clearError: () => this.clearError(),
            setInputText: (text) => this.setInputText(text),
        };
        this.cmdInput.onEnter = this.onEnter;
        this.ownerDocument.addEventListener('keydown', this.onDocumentKeyDown);
        SyntaxViewer.onClickAst = this.insertText;
    }

    destroy() {
        this.ownerDocument.removeEventListener('keydown', this.onDocumentKeyDown);
        if (this.cmdInput.onEnter === this.onEnter) this.cmdInput.onEnter = this.previousOnEnter;
        if (SyntaxViewer.onClickAst === this.insertText) SyntaxViewer.onClickAst = this.previousAstClick;
    }

    private setClearState() {
        this.errorDiv.style.display = 'none';
        this.promptDiv.style.display = 'none';
        this.cmdInput.disabled = false;
        this.cmdInput.setParserArgs("cmds");
        SyntaxViewer.onClickAst = this.insertText;
        // 命令结束/取消后焦点回到命令框（d 命令等执行完也要能继续输入）
        this.cmdInput.focus();
        // 命令结束/取消时通知外部清理（如列表行的点击回调）
        this.onClearState?.();
    }
    insertText = (text: string, e: MouseEvent, parser: IParser) => {
        if (parser instanceof HSParser) this.cmdInput.executeInsertText(text);
    };
    private showPrompt(text: string, defaultValue: string) {
        this.promptDiv.style.display = '';
        this.promptDiv.innerHTML = text;
        SyntaxViewer.enhance(this.promptDiv, new HSParser());
        if (this.cmdInput.getValue().trim() === "") {
            this.cmdInput.setValue(defaultValue);
        }
        this.cmdInput.focus();
        this.cmdInput.setSelectionRange(0, this.cmdInput.getValue().length);
    }

    private showError(msg: HSErrorInfo) {
        this.errorDiv.innerText = LangMgr.renderHSError(msg);
        this.errorDiv.style.display = '';
        this.cmdInput.disabled = true;
    }

    private clearError() {
        this.errorDiv.style.display = 'none';
        this.cmdInput.disabled = false;
        this.cmdInput.focus();
    }

    private setInputText(text: string) {
        this.cmdInput.setValue(text);
    }
}
