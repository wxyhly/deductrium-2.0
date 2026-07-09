export class SyntaxHighlighter {
    highlight(tokens) {
        return tokens.map(tok => {
            const cls = 'token-' + tok.type;
            const escaped = this.escapeHtml(tok.displayText);
            return `<span class="${cls}" data-start="${tok.start}" data-end="${tok.end}">${escaped}</span>`;
        }).join('');
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
    currentAst = null;
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
        this.pre.addEventListener('mouseover', this.onPreMouseOver);
        this.pre.addEventListener('mouseout', this.onPreMouseOut);
        // 初始内容
        this.setValue(initialValue);
    }
    onPreMouseOut = () => {
        this.clearASTHighlight();
    };
    clearASTHighlight() {
        this.code.querySelectorAll('.ast-highlight').forEach(el => el.classList.remove('ast-highlight'));
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
            this.currentAst = this.parser.parse(unicodeText, ...this.parserArgs);
        }
        catch {
            this.currentAst = null;
        }
        const html = this.highlighter.highlight(this.parser.getTokens());
        this.code.innerHTML = html + '\n';
    }
    // 悬停高亮：遍历 currentAst 找到包含 offset 的最内层节点
    onPreMouseOver = (e) => {
        const span = e.target.closest('.token');
        if (!span || !this.currentAst)
            return;
        const start = parseInt(span.dataset.start, 10);
        const node = this.findNode(this.currentAst, start);
        if (node)
            this.highlightASTNode(node);
    };
    findNode(root, offset) {
        // 递归搜索，优先返回子节点
        for (const child of root.nodes) {
            const found = this.findNode(child, offset);
            if (found)
                return found;
        }
        if (offset >= root.start && offset < root.end)
            return root;
        return null;
    }
    highlightASTNode(node) {
        this.clearASTHighlight();
        if (typeof node.start === "number" && typeof node.end === "number")
            this.code.querySelectorAll('.token').forEach((elem) => {
                const el = elem;
                const s = parseInt(el.dataset.start, 10);
                const e = parseInt(el.dataset.end, 10);
                if (s < node.end && e > node.start) {
                    el.classList.add('ast-highlight');
                }
            });
    }
}
//# sourceMappingURL=ast.js.map