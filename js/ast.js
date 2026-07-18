import { NodeType } from "./fs/core/ast.js";
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
        if (tok.parentAST && ((tok.text === "{" && (tok.parentAST.type === NodeType.CLASS || tok.parentAST.type === NodeType.RPL || tok.parentAST.type === NodeType.SEP)) || (tok.text === "(" && tok.parentAST.name === "\\p") || ["\\a", "\\e", "\\e!", "\\l", "\\p", "\\w", "\\s"].includes(tok.text))) {
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
    escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
}
export class SyntaxEditor {
    container;
    textarea;
    pre;
    code;
    parser;
    highlighter;
    parserArgs;
    constructor(mount, parser, initialValue, ...parserArgs) {
        this.parser = parser;
        this.parserArgs = parserArgs;
        this.highlighter = new SyntaxHighlighter();
        // ----- 构建 DOM -----
        this.container = document.createElement('div');
        this.container.className = 'editor-container';
        this.pre = document.createElement('pre');
        this.pre.className = 'editor-pre';
        this.pre.setAttribute('aria-hidden', 'true');
        this.code = document.createElement('code');
        this.pre.appendChild(this.code);
        this.textarea = document.createElement('textarea');
        this.textarea.className = 'editor-textarea';
        this.textarea.spellcheck = false;
        this.textarea.autocapitalize = 'off';
        this.textarea.autocomplete = 'off';
        this.textarea.autocorrect = false;
        this.textarea.wrap = 'off';
        this.container.appendChild(this.pre);
        this.container.appendChild(this.textarea);
        mount.appendChild(this.container);
        // ----- 事件绑定 -----
        this.textarea.addEventListener('input', this.onInput);
        this.textarea.addEventListener('scroll', this.syncScroll);
        this.textarea.addEventListener('paste', this.onPaste);
        this.textarea.addEventListener('mousemove', this.onTextareaMouseMove);
        this.textarea.addEventListener('mouseleave', this.onTextareaMouseLeave);
        // 初始内容
        this.setValue(initialValue);
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
        // 粘贴后需再次触发替换（可能会产生新的序列）
        this.onInput();
    };
    normalizeText(raw) {
        let result = raw;
        // 为避免无限循环或重叠替换，按长度降序遍历替换规则，且只替换一次（或循环替换直到无变化）
        // 简单实现：执行多遍直到稳定，因为替换后可能产生新的匹配序列
        let changed = true;
        while (changed) {
            changed = false;
            for (const [unicode, ascii] of this.parser.inputReplacements) {
                // 注意：replaceAll 可能产生新的序列，比如 \A 替换后不会产生新序列，所以一遍即可
                const newResult = result.split(ascii).join(unicode);
                if (newResult !== result) {
                    result = newResult;
                    changed = true;
                }
            }
        }
        return result;
    }
    getValue() {
        return this.textarea.value;
    }
    setValue(unicodeText) {
        this.textarea.value = this.normalizeText(unicodeText);
        this.render();
    }
    onInput = () => {
        const ta = this.textarea;
        let val = ta.value;
        const cursor = ta.selectionStart;
        for (const [unicode, ascii] of this.parser.inputReplacements) { // 或 static 引用
            const start = cursor - ascii.length;
            if (start >= 0 && val.startsWith(ascii, start)) {
                val = val.slice(0, start) + unicode + val.slice(start + ascii.length);
                ta.value = val;
                ta.selectionStart = ta.selectionEnd = start + unicode.length;
                break;
            }
        }
        this.render();
    };
    render() {
        const unicodeText = this.textarea.value;
        try {
            this.parser.parse(unicodeText, ...this.parserArgs);
        }
        catch { }
        const html = this.highlighter.highlight(this.parser.getTokens());
        this.code.innerHTML = html + '\n';
    }
    // 实现方法
    onTextareaMouseMove = (e) => {
        // 临时穿透 textarea，获取下方 pre 中的元素
        this.textarea.style.pointerEvents = 'none';
        const target = document.elementFromPoint(e.clientX, e.clientY);
        this.textarea.style.pointerEvents = ''; // 立即恢复
        const span = target?.closest?.('span');
        window["s"] = span;
        if (!span) {
            this.clearHighlight();
            return;
        }
        const parentStart = span.dataset.parentStart;
        const parentEnd = span.dataset.parentEnd;
        const bound = this.highlighter.dummytokens[Number(span.dataset.start)]?.map(e => e.start);
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
            const allTokens = this.code.querySelectorAll('span');
            allTokens.forEach(el => {
                const s = Number(el.dataset.start);
                if (bound.includes(s)) {
                    el.classList.add('ast-highlight');
                }
            });
        }
    };
    onTextareaMouseLeave = () => {
        this.clearHighlight();
    };
    /** 高亮所有与 [start, end) 有交集的 token */
    highlightRange(start, end) {
        const allTokens = this.code.querySelectorAll('span');
        allTokens.forEach(el => {
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
    clearHighlight() {
        this.code.querySelectorAll('.ast-highlight').forEach(el => el.classList.remove('ast-highlight'));
    }
}
//# sourceMappingURL=ast.js.map