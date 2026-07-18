import { NodeType } from "./fs/core/ast.js";
// ========== 工具函数 ==========
export function applyInputReplacements(text, replacements) {
    let result = text;
    for (const [ascii, unicode] of replacements) {
        result = result.replaceAll(ascii, unicode);
    }
    return result;
}
// ========== 语法高亮器 ==========
const LAYER_STYLE_MAX_DEPTH = 5;
export class SyntaxHighlighter {
    dummytokens = [];
    highlight(tokens) {
        const quantStack = [];
        let layerDepth = 0;
        this.dummytokens.length = 0;
        return tokens.map((tok, tidx) => {
            const boundedTokens = this.highLightQuants(quantStack, tokens, tok, tidx);
            let cls = 'token-' + tok.type;
            if (tok.type === "layer") {
                if ("([{".includes(tok.text)) {
                    layerDepth++;
                    cls += "-" + (layerDepth % LAYER_STYLE_MAX_DEPTH);
                }
                else if (")}]".includes(tok.text)) {
                    cls += "-" + (layerDepth % LAYER_STYLE_MAX_DEPTH);
                    layerDepth--;
                }
            }
            const escaped = this.escapeHtml(tok.displayText);
            let attrs = `class="${cls}" data-start="${tok.start}" data-end="${tok.end}"`;
            if (tok.parentAST && typeof tok.parentAST.start === 'number' && typeof tok.parentAST.end === 'number') {
                attrs += ` data-parent-start="${tok.parentAST.start}" data-parent-end="${tok.parentAST.end}"`;
            }
            if (boundedTokens) {
                this.dummytokens[tok.start] = boundedTokens;
            }
            return `<span ${attrs}>${escaped}</span>`;
        }).join('');
    }
    highLightQuants(quantStack, tokens, tok, tidx) {
        while (quantStack.length > 0 && tok.start >= quantStack[quantStack.length - 1].end) {
            quantStack.pop();
        }
        if (tok.parentAST && ((tok.text === "{" && (tok.parentAST.type === NodeType.CLASS || tok.parentAST.type === NodeType.RPL || tok.parentAST.type === NodeType.SEP)) || (tok.text === "(" && tok.parentAST.name === "\\p") || ["\\a", "\\e", "\\e!", "\\a@", "\\e@", "\\e!@", "\\l", "\\p", "\\w", "\\s"].includes(tok.text))) {
            const quant = tok.parentAST;
            if (quant) {
                const varAST = quant.nodes[tok.parentAST.type === NodeType.RPL ? 1 : 0]; // 变量 AST
                let varToken;
                for (let j = tidx + 1; j < tokens.length; j++) {
                    if (tokens[j].start === varAST.start && tokens[j].end === varAST.end) {
                        varToken = tokens[j];
                        break;
                    }
                }
                if (varToken) {
                    const body = quant.nodes[tok.parentAST.type === NodeType.RPL ? 0 : tok.parentAST.type === NodeType.CLASS || tok.parentAST.type === NodeType.QUANT ? 1 : 2];
                    varToken.dummyTokens = [];
                    quantStack.push({
                        start: body.start, end: body.end,
                        varName: varToken.text, varToken: varToken,
                        dummyvars: varToken.dummyTokens
                    });
                }
            }
        }
        if (tok.type.includes('atom') || tok.type.includes('var')) {
            const skip = (tok.type.includes("replvar") || tok.type.includes("fn") || tok.type.includes("wff") || tok.type.includes("pred") || tok.type.includes("locvar"));
            if (tok.dummyTokens) {
                if (!skip)
                    tok.type = "atom-var";
                return tok.dummyTokens;
            }
            for (let k = quantStack.length - 1; k >= 0; k--) {
                const scope = quantStack[k];
                if (scope.varName === tok.text && scope.start <= tok.start) {
                    scope.dummyvars.push(tok);
                    if (!skip)
                        tok.type = "atom-var";
                    return [scope.varToken];
                }
            }
        }
        return undefined;
    }
    escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
// ========== 高亮管理器 ==========
export class HighlightManager {
    codeElement;
    highlighter;
    constructor(codeElement, highlighter) {
        this.codeElement = codeElement;
        this.highlighter = highlighter;
    }
    handleSpan(span) {
        if (!span) {
            this.clearHighlight();
            return;
        }
        const startAttr = span.dataset.start;
        const bound = startAttr
            ? this.highlighter.dummytokens[parseInt(startAttr)]?.map(t => t.start)
            : undefined;
        const parentStart = span.dataset.parentStart;
        const parentEnd = span.dataset.parentEnd;
        // 原始逻辑：先处理表达式范围或自身，再叠加量词绑定
        if (!bound && parentStart !== undefined && parentEnd !== undefined) {
            this.highlightRange(parseInt(parentStart), parseInt(parentEnd));
        }
        else if (span.dataset.start !== undefined && span.dataset.end !== undefined) {
            this.highlightRange(parseInt(span.dataset.start), parseInt(span.dataset.end));
        }
        else {
            this.clearHighlight();
        }
        if (bound) {
            const allSpans = this.codeElement.querySelectorAll('span');
            allSpans.forEach(el => {
                const s = Number(el.dataset.start);
                if (bound.includes(s)) {
                    el.classList.add('ast-highlight');
                }
            });
        }
    }
    clearHighlight() {
        this.codeElement.querySelectorAll('.ast-highlight').forEach(el => el.classList.remove('ast-highlight'));
    }
    highlightRange(start, end) {
        const allSpans = this.codeElement.querySelectorAll('span');
        allSpans.forEach(el => {
            const s = parseInt(el.dataset.start);
            const e = parseInt(el.dataset.end);
            if (s < end && e > start) {
                el.classList.add('ast-highlight');
            }
            else {
                el.classList.remove('ast-highlight');
            }
        });
    }
}
// ========== 基础视图（抽象类，不创建 DOM） ==========
export class BaseSyntaxViewer {
    parser;
    highlighter;
    highlightManager;
    parserArgs;
    // 子类需提供 code 容器元素给 HighlightManager
    codeElement;
    constructor(parser, codeElement, ...parserArgs) {
        this.parser = parser;
        this.codeElement = codeElement;
        this.parserArgs = parserArgs;
        this.highlighter = new SyntaxHighlighter();
        this.highlightManager = new HighlightManager(codeElement, this.highlighter);
    }
    /** 设置/更新显示的代码（会进行 ASCII→Unicode 替换） */
    setCode(rawCode) {
        const unicodeText = applyInputReplacements(rawCode, this.parser.inputReplacements);
        this.render(unicodeText);
    }
    /** 获取当前显示的代码（纯文本） */
    getCode() {
        return this.codeElement.textContent || '';
    }
    /** 销毁组件（子类可覆盖以清理额外资源） */
    destroy() {
        // 默认不做额外清理，子类负责移除自己的 DOM
    }
    /** 渲染方法：解析并更新 code 元素的 innerHTML */
    render(unicodeText) {
        try {
            this.parser.parse(unicodeText, ...this.parserArgs);
        }
        catch { }
        const tokens = this.parser.getTokens();
        const html = this.highlighter.highlight(tokens);
        this.codeElement.innerHTML = html + '\n';
    }
}
// ========== 只读视图 ==========
export class SyntaxViewer extends BaseSyntaxViewer {
    constructor(dom, parser, initialCode, ...parserArgs) {
        // 调用基类构造函数
        super(parser, dom, ...parserArgs);
        // 绑定鼠标事件
        dom.addEventListener('mousemove', this.onMouseMove);
        dom.addEventListener('mouseleave', this.onMouseLeave);
        // 初始内容
        this.setCode(initialCode);
    }
    onMouseMove = (e) => {
        const target = e.target;
        const span = target?.closest?.('span');
        this.highlightManager.handleSpan(span);
    };
    onMouseLeave = () => {
        this.highlightManager.clearHighlight();
    };
    // 覆写 destroy 以移除 DOM 和事件
    destroy() {
        this.codeElement.removeEventListener('mousemove', this.onMouseMove);
        this.codeElement.removeEventListener('mouseleave', this.onMouseLeave);
    }
}
// ========== 可编辑视图 ==========
export class SyntaxEditor extends BaseSyntaxViewer {
    container;
    pre;
    textarea;
    constructor(mount, parser, initialValue, ...parserArgs) {
        // 创建 DOM 结构
        const container = document.createElement('div');
        container.className = 'editor-container';
        const pre = document.createElement('pre');
        pre.className = 'editor-pre';
        pre.setAttribute('aria-hidden', 'true');
        const code = document.createElement('code');
        pre.appendChild(code);
        container.appendChild(pre);
        // 调用基类构造函数
        super(parser, code, ...parserArgs);
        this.container = container;
        this.pre = pre;
        // 创建透明 textarea
        this.textarea = document.createElement('textarea');
        this.textarea.className = 'editor-textarea';
        this.textarea.spellcheck = false;
        this.textarea.autocapitalize = 'off';
        this.textarea.autocomplete = 'off';
        this.textarea.autocorrect = false;
        this.textarea.wrap = 'off';
        container.appendChild(this.textarea);
        mount.appendChild(container);
        // 绑定事件
        this.textarea.addEventListener('input', this.onInput);
        this.textarea.addEventListener('scroll', this.syncScroll);
        this.textarea.addEventListener('paste', this.onPaste);
        this.textarea.addEventListener('mousemove', this.onTextareaMouseMove);
        this.textarea.addEventListener('mouseleave', this.onTextareaMouseLeave);
        // 初始内容
        this.setValue(initialValue);
    }
    /** 获取 textarea 中的值（Unicode 文本） */
    getValue() {
        return this.textarea.value;
    }
    /** 设置 textarea 的值并重新渲染 */
    setValue(unicodeText) {
        this.textarea.value = applyInputReplacements(unicodeText, this.parser.inputReplacements);
        this.render(this.textarea.value);
    }
    /** 覆盖基类的 setCode，保持与 setValue 一致 */
    setCode(rawCode) {
        this.setValue(rawCode);
    }
    syncScroll = () => {
        this.pre.scrollTop = this.textarea.scrollTop;
        this.pre.scrollLeft = this.textarea.scrollLeft;
    };
    onPaste = (e) => {
        e.preventDefault();
        const text = e.clipboardData?.getData('text/plain') ?? '';
        const ta = this.textarea;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        ta.value = ta.value.substring(0, start) + text + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + text.length;
        this.onInput();
    };
    onInput = () => {
        const ta = this.textarea;
        let val = ta.value;
        const cursor = ta.selectionStart;
        for (const [ascii, unicode] of this.parser.inputReplacements) {
            const start = cursor - ascii.length;
            if (start >= 0 && val.startsWith(ascii, start)) {
                val = val.slice(0, start) + unicode + val.slice(start + ascii.length);
                ta.value = val;
                ta.selectionStart = ta.selectionEnd = start + unicode.length;
                break;
            }
        }
        this.render(ta.value);
    };
    onTextareaMouseMove = (e) => {
        this.textarea.style.pointerEvents = 'none';
        const target = document.elementFromPoint(e.clientX, e.clientY);
        this.textarea.style.pointerEvents = '';
        const span = target?.closest?.('span');
        this.highlightManager.handleSpan(span);
    };
    onTextareaMouseLeave = () => {
        this.highlightManager.clearHighlight();
    };
    // 覆写 destroy 清理事件和 DOM
    destroy() {
        this.textarea.removeEventListener('input', this.onInput);
        this.textarea.removeEventListener('scroll', this.syncScroll);
        this.textarea.removeEventListener('paste', this.onPaste);
        this.textarea.removeEventListener('mousemove', this.onTextareaMouseMove);
        this.textarea.removeEventListener('mouseleave', this.onTextareaMouseLeave);
        this.container.remove();
    }
}
//# sourceMappingURL=astrender.js.map