import { NodeType } from "./asttype.js";
const escapeHtmlMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
};
export function highlightHTML(str, type) {
    return `<span data-ast-type="${type}">${str.replace(/[&<>"']/g, ch => escapeHtmlMap[ch])}</span>`;
}
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
    outterDummyVars = [];
    highlight(tokens) {
        const quantStack = [];
        let layerDepth = 0;
        this.dummytokens.length = 0;
        return tokens.map((tok, tidx) => {
            const boundedTokens = this.highLightQuants(quantStack, tokens, tok, tidx);
            let attrs = '';
            if (boundedTokens) {
                this.dummytokens[tok.start] = boundedTokens;
            }
            else if (tok.type.includes("replvar") || tok.type.includes('free')) {
                const outerIdx = this.outterDummyVars.findIndex(([name, _]) => name === tok.text);
                if (outerIdx !== -1) {
                    if (!tok.type.includes("replvar"))
                        tok.type = 'atom-var';
                    attrs += ` data-outer-idx="${outerIdx}"`;
                }
            }
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
            attrs += ` data-start="${tok.start}" data-end="${tok.end}"`;
            if (tok.parentAST && typeof tok.parentAST.start === 'number' && typeof tok.parentAST.end === 'number') {
                attrs += ` data-parent-start="${tok.parentAST.start}" data-parent-end="${tok.parentAST.end}"`;
            }
            return `<span class="${cls}" ${attrs}>${escaped}</span>`;
        }).join('');
    }
    /**
     * DOM 版高亮：直接创建 span 元素（textContent 自动转义），避免 innerHTML 字符串解析。
     * 系统表渲染卡顿的主因是 innerHTML 重建 + 浏览器重新解析 HTML；
     * 这里一次构建 DocumentFragment，render() 用 replaceChildren 挂载，量级快很多。
     * token 分类/悬停高亮（dummytokens/outterDummyVars/quantStack）与字符串版完全一致。
     */
    highlightDOM(tokens) {
        const fragment = document.createDocumentFragment();
        const quantStack = [];
        let layerDepth = 0;
        this.dummytokens.length = 0;
        for (let tidx = 0; tidx < tokens.length; tidx++) {
            const tok = tokens[tidx];
            const boundedTokens = this.highLightQuants(quantStack, tokens, tok, tidx);
            const span = document.createElement('span');
            if (boundedTokens) {
                this.dummytokens[tok.start] = boundedTokens;
            }
            else if (tok.type.includes("replvar") || tok.type.includes('free')) {
                const outerIdx = this.outterDummyVars.findIndex(([name, _]) => name === tok.text);
                if (outerIdx !== -1) {
                    if (!tok.type.includes("replvar"))
                        tok.type = 'atom-var';
                    span.dataset.outerIdx = String(outerIdx);
                }
            }
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
            span.className = cls;
            span.textContent = tok.displayText; // textContent 自动转义，无需 escapeHtml
            span.dataset.start = String(tok.start);
            span.dataset.end = String(tok.end);
            if (tok.parentAST && typeof tok.parentAST.start === 'number' && typeof tok.parentAST.end === 'number') {
                span.dataset.parentStart = String(tok.parentAST.start);
                span.dataset.parentEnd = String(tok.parentAST.end);
            }
            fragment.appendChild(span);
        }
        return fragment;
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
    highlightedOuter = null;
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
        else {
            const outerIdx = span.dataset.outerIdx;
            if (outerIdx !== undefined) {
                const outerEl = this.highlighter.outterDummyVars[parseInt(outerIdx)]?.[1];
                if (outerEl) {
                    // 清除之前的外部高亮
                    if (this.highlightedOuter && this.highlightedOuter !== outerEl) {
                        this.highlightedOuter.classList.remove('ast-highlight');
                    }
                    outerEl.classList.add('ast-highlight');
                    this.highlightedOuter = outerEl;
                }
            }
            else {
                // 如果当前 span 没有外部变量，清除之前的外部高亮
                if (this.highlightedOuter) {
                    this.highlightedOuter.classList.remove('ast-highlight');
                    this.highlightedOuter = null;
                }
            }
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
    setOutterDummyVars(outterDummyVars) {
        this.highlighter.outterDummyVars = outterDummyVars;
    }
    /** 设置/更新显示的代码（会进行 ASCII→Unicode 替换） */
    setCode(rawCode) {
        this.render(this.replaceText(rawCode));
    }
    /** 获取当前显示的代码（纯文本） */
    getCode() {
        return this.codeElement.textContent || '';
    }
    /** 销毁组件（子类可覆盖以清理额外资源） */
    destroy() {
        // 默认不做额外清理，子类负责移除自己的 DOM
    }
    // 解析缓存：同一文本只解析一次（setCode 里 replaceText 与 render 各会触发 parse，
    // 系统表每行因此双解析——大表卡顿主因；按文本缓存后同文本直接复用 tokens）
    lastParseText = null;
    lastParseTokens = null;
    parseTokens(unicodeText) {
        if (this.lastParseText === unicodeText && this.lastParseTokens) {
            return this.lastParseTokens;
        }
        try {
            this.parser.parse(unicodeText, ...this.parserArgs);
        }
        catch { }
        this.lastParseTokens = this.parser.getTokens();
        this.lastParseText = unicodeText;
        return this.lastParseTokens;
    }
    /** 渲染方法：解析并更新 code 元素的 DOM（直接构建 span，不走 innerHTML） */
    render(unicodeText) {
        if (!unicodeText?.trim()) {
            this.codeElement.replaceChildren();
            return;
        }
        const tokens = this.parseTokens(unicodeText);
        const fragment = this.highlighter.highlightDOM(tokens);
        this.codeElement.replaceChildren(fragment);
    }
    replaceText(str) {
        const tokens = this.parseTokens(str);
        let result = "";
        let buffer = "";
        const allowed = this.parser.allowReplaceTokenType;
        for (const tok of tokens) {
            if (!allowed || allowed(tok.type)) {
                // 可替换 token：将原始文本加入缓冲区
                buffer += str.substring(tok.start, tok.end);
            }
            else {
                // 遇到不可替换 token，先处理缓冲区
                if (buffer.length > 0) {
                    result += applyInputReplacements(buffer, this.parser.inputReplacements);
                    buffer = "";
                }
                // 直接追加不可替换 token 的原始文本
                result += str.substring(tok.start, tok.end);
            }
        }
        // 处理末尾缓冲区
        if (buffer.length > 0) {
            result += applyInputReplacements(buffer, this.parser.inputReplacements);
        }
        return result;
    }
}
// ========== 只读视图 ==========
export class SyntaxViewer extends BaseSyntaxViewer {
    static onClickAst = null;
    constructor(dom, parser, initialCode, ...parserArgs) {
        // 调用基类构造函数
        super(parser, dom, ...parserArgs);
        // 绑定鼠标事件
        dom.addEventListener('mousemove', this.onMouseMove);
        dom.addEventListener('mouseleave', this.onMouseLeave);
        dom.addEventListener('click', this.onClick);
        // 初始内容
        if (initialCode)
            this.setCode(initialCode);
    }
    /**
       * 将容器内所有带 data-ast-type 属性的 <span> 初始化为可交互的语法高亮片段
       */
    static enhance(container, parser) {
        container.querySelectorAll("span[data-ast-type]:not(.ast-enhanced)").forEach(el => {
            const type = el.getAttribute("data-ast-type");
            const ast = el.innerText;
            el.classList.add("ast", "ast-enhanced");
            new SyntaxViewer(el, parser, ast, type);
        });
    }
    onMouseMove = (e) => {
        const target = e.target;
        const span = target?.closest?.('span');
        this.highlightManager.handleSpan(span);
    };
    onMouseLeave = () => {
        this.highlightManager.clearHighlight();
    };
    onClick = (e) => {
        const target = e.target;
        const span = target?.closest?.('span');
        if (!span || !SyntaxViewer.onClickAst)
            return;
        // 点击不在公式渲染区内（如行内空白/外层包装元素）→ 不拦截，交给行点击回调（如选择推理步骤）
        if (!this.codeElement.contains(span))
            return;
        const parentStart = span.dataset.parentStart;
        const parentEnd = span.dataset.parentEnd;
        let text;
        if (parentStart !== undefined && parentEnd !== undefined) {
            const fullText = this.codeElement.textContent || '';
            text = fullText.substring(parseInt(parentStart), parseInt(parentEnd));
        }
        else {
            text = span.innerText; // 或 span.textContent
        }
        SyntaxViewer.onClickAst(text, e, this.parser, this.parserArgs);
        // 已按 AST 片段处理（如插入输入框），阻止冒泡，避免外层行点击回调再次触发覆盖行为
        e.stopPropagation();
    };
    // 覆写 destroy 以移除 DOM 和事件
    destroy() {
        this.codeElement.removeEventListener('mousemove', this.onMouseMove);
        this.codeElement.removeEventListener('mouseleave', this.onMouseLeave);
        this.codeElement.removeEventListener('click', this.onClick);
    }
}
// ========== 可编辑视图 ==========
export class SyntaxEditor extends BaseSyntaxViewer {
    container;
    pre;
    textarea;
    triggerReplaceChars;
    onEnter;
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
        this.triggerReplaceChars = new Set(parser.inputReplacements.map(e => e[0][e[0].length - 1]));
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
        this.textarea.addEventListener('keydown', this.onKeyDown);
        // 初始内容
        this.setValue(initialValue);
    }
    /** 获取 textarea 中的值（Unicode 文本） */
    getValue() {
        return this.replaceText(this.textarea.value);
    }
    focus() {
        this.textarea.focus();
    }
    isFocused() {
        return document.activeElement === this.textarea;
    }
    setSelectionRange(start, end) {
        this.textarea.selectionStart = start;
        this.textarea.selectionEnd = end;
    }
    executeInsertText(text) {
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const value = this.textarea.value;
        if (document.execCommand) {
            this.textarea.focus();
            this.textarea.setSelectionRange(start, end);
            document.execCommand('insertText', false, text);
            this.textarea.setSelectionRange(start, start + text.length);
        }
        else {
            this.textarea.value = value.substring(0, start) + text + value.substring(end);
        }
    }
    blur() {
        this.textarea.blur();
    }
    _disabled = false;
    get disabled() {
        return this._disabled;
    }
    set disabled(v) {
        this._disabled = v;
        this.textarea.disabled = v;
        v ? this.container.classList.add("disabled") : this.container.classList.remove("disabled");
    }
    setParserArgs(...args) { this.parserArgs = args; }
    /** 设置 textarea 的值并重新渲染 */
    setValue(unicodeText) {
        this.textarea.value = this.replaceText(unicodeText);
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
        const lastChar = val[cursor - 1] || '';
        if (this.triggerReplaceChars?.has(lastChar)) {
            const replaced = this.replaceText(val);
            if (replaced !== val) {
                const prefixOld = val.substring(0, cursor);
                const prefixNew = this.replaceText(prefixOld);
                // 直接赋值最可靠（execCommand 在非用户手势/某些环境会静默失败）
                ta.value = replaced;
                ta.selectionStart = ta.selectionEnd = Math.min(prefixNew.length, replaced.length);
            }
        }
        this.render(ta.value);
    };
    onKeyDown = (e) => {
        if (e.key !== 'Enter')
            return;
        // const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        // if (isTouchDevice) { return; }
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            document.execCommand('insertText', false, '\n');
        }
        else {
            e.preventDefault();
            this.onEnter?.();
        }
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