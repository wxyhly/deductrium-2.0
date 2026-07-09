export interface Token {
    type: string;
    text: string;          // 内部 ASCII 表示（解析用）
    displayText: string;   // 显示用的 Unicode 文本
    start: number;         // 在原始 Unicode 文本中的起始索引
    end: number;           // 结束索引（不含）
}

export interface IASTNode {
    type: any;
    name: string;
    nodes: IASTNode[];
    start?: number;
    end?: number;
}
export interface IParser {
    /** 返回带位置信息的 Token 流（含空格），在parser后调用，可获得更多信息 */
    getTokens(): Token[];

    /**
     * 语法分析：返回带 span 的 AST（IASTNode）
     * 不同语言可增加自定义参数（但编辑器只调用无参版或通过传配置）
     */
    parse(unicodeText: string, ...args: any[]): IASTNode;

    /** 输入自动替换规则：ASCII 序列 → Unicode 显示符号，按长度降序 */
    inputReplacements: [string, string][];
}

export class SyntaxHighlighter {

    highlight(tokens: Token[]): string {
        return tokens.map(tok => {
            const cls = 'token-' + tok.type;
            const escaped = this.escapeHtml(tok.displayText);
            return `<span class="${cls}" data-start="${tok.start}" data-end="${tok.end}">${escaped}</span>`;
        }).join('');
    }

    private escapeHtml(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
}

export class SyntaxEditor {
    private container: HTMLDivElement;
    private textarea: HTMLTextAreaElement;
    private pre: HTMLPreElement;
    private code: HTMLElement;

    private parser: IParser;
    private highlighter: SyntaxHighlighter;
    private currentAst: IASTNode | null = null;
    private parserArgs: any[];

    constructor(mount: HTMLElement, parser: IParser, initialValue: string, ...parserArgs: any[]) {
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
    private onPreMouseOut = () => {
        this.clearASTHighlight();
    };
    private clearASTHighlight() {
        this.code.querySelectorAll('.ast-highlight').forEach(el => el.classList.remove('ast-highlight'));
    }
    private syncScroll = () => {
        this.pre.scrollTop = this.textarea.scrollTop;
        this.pre.scrollLeft = this.textarea.scrollLeft;
    };

    private onPaste = (e: ClipboardEvent) => {
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
    private normalizeText(raw: string): string {
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
    getValue(): string {
        return this.textarea.value;
    }
    setValue(unicodeText: string) {
        this.textarea.value = this.normalizeText(unicodeText);
        this.render();
    }

    private onInput = () => {
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

    private render() {
        const unicodeText = this.textarea.value;
        try { this.currentAst = this.parser.parse(unicodeText, ...this.parserArgs); } catch { this.currentAst = null; }
        const html = this.highlighter.highlight(this.parser.getTokens());
        this.code.innerHTML = html + '\n';
    }

    // 悬停高亮：遍历 currentAst 找到包含 offset 的最内层节点
    private onPreMouseOver = (e: MouseEvent) => {
        const span = (e.target as HTMLElement).closest('.token') as HTMLElement | null;
        if (!span || !this.currentAst) return;
        const start = parseInt(span.dataset.start!, 10);
        const node = this.findNode(this.currentAst, start);
        if (node) this.highlightASTNode(node);
    };
    private findNode(root: IASTNode, offset: number): IASTNode | null {
        // 递归搜索，优先返回子节点
        for (const child of root.nodes) {
            const found = this.findNode(child, offset);
            if (found) return found;
        }
        if (offset >= root.start! && offset < root.end!) return root;
        return null;
    }
    private highlightASTNode(node: IASTNode) {
        this.clearASTHighlight();
        if (typeof node.start === "number" && typeof node.end === "number")
            this.code.querySelectorAll('.token').forEach((elem: Element) => {
                const el = elem as HTMLElement;
                const s = parseInt(el.dataset.start!, 10);
                const e = parseInt(el.dataset.end!, 10);
                if (s < node.end! && e > node.start!) {
                    el.classList.add('ast-highlight');
                }
            });
    }
}