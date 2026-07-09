export class SyntaxHighlighter {
    classMap = {
        keyword: 'token-keyword',
        operator: 'token-operator',
        variable: 'token-variable',
        number: 'token-number',
        space: 'token-space',
        plain: 'token-plain'
    };
    highlight(tokens) {
        return tokens.map(tok => {
            const cls = this.classMap[tok.type] || 'token-plain';
            const escaped = this.escapeHtml(tok.displayText);
            return `<span class="${cls}" data-start="${tok.start}" data-end="${tok.end}">${escaped}</span>`;
        }).join('');
    }
    escapeHtml(s) { }
}
export class SyntaxEditor {
    container;
    textarea;
    pre;
    code;
    parser;
    highlighter;
    currentAst = null;
    constructor(mount, parser, initialValue = '') {
        this.parser = parser;
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
        if (initialValue) {
            this.textarea.value = initialValue; // 传入的应为 Unicode 文本
            this.render();
        }
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
    getValue() {
        return this.textarea.value;
    }
    setValue(unicodeText) {
        this.textarea.value = unicodeText;
        this.render();
    }
    onInput = () => {
        const ta = this.textarea;
        let val = ta.value;
        const cursor = ta.selectionStart;
        for (const [ascii, unicode] of this.parser.inputReplacements) {
            const idx = val.lastIndexOf(ascii, cursor - 1);
            if (idx !== -1 && idx + ascii.length === cursor) {
                val = val.slice(0, idx) + unicode + val.slice(idx + ascii.length);
                ta.value = val;
                ta.selectionStart = ta.selectionEnd = idx + unicode.length;
                break;
            }
        }
        this.render();
    };
    render() {
        const unicodeText = this.textarea.value;
        const tokens = this.parser.tokenize(unicodeText);
        // 可选：调用 parser.parse 获取 AST 用于悬停
        try {
            this.currentAst = this.parser.parse(unicodeText);
        }
        catch {
            this.currentAst = null;
        }
        const html = this.highlighter.highlight(tokens);
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
//# sourceMappingURL=commonast.js.map