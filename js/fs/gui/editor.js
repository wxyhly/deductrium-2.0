// export class SyntaxHighlighter {
//     // 可自定义 Token 类型到 CSS 类的映射
//     private classMap: Record<string, string> = {
//         keyword: 'token-keyword',
//         operator: 'token-operator',
//         variable: 'token-variable',
//         number: 'token-number',
//         string: 'token-string',
//         comment: 'token-comment',
//         plain: 'token-plain'
//     };
//     /**
//      * 根据 Token 数组生成高亮 HTML 字符串。
//      * 每个 token 被包裹在 <span> 中，包含 data-start、data-end 和对应的 CSS 类。
//      */
//     highlight(tokens: Token[]): string {
//         return tokens
//             .map(tok => {
//                 const cls = this.classMap[tok.type] || 'token-plain';
//                 const escaped = this.escapeHtml(tok.displayText);
//                 return `<span class="${cls}" data-start="${tok.start}" data-end="${tok.end}">${escaped}</span>`;
//             })
//             .join('');
//     }
//     // 转义 HTML 特殊字符
//     private escapeHtml(str: string): string {
//         return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
//     }
// }
// export class SyntaxEditor {
//     private container: HTMLDivElement;
//     private textarea: HTMLTextAreaElement;
//     private pre: HTMLPreElement;
//     private code: HTMLElement;
//     private parser: ASTParser;
//     private highlighter: SyntaxHighlighter;
//     private currentAst: AST | null = null;
//     // 输入替换规则（ASCII 序列 → Unicode），按长度降序保证长串优先
//     private static inputReplacements: [string, string][] = Object.entries(asciiToUnicode)
//         .sort((a, b) => b[0].length - a[0].length);
//     constructor(mount: HTMLElement, initialValue = '') {
//         this.parser = new ASTParser();
//         this.highlighter = new SyntaxHighlighter();
//         // ----- 构建 DOM -----
//         this.container = document.createElement('div');
//         this.container.className = 'editor-container';
//         this.pre = document.createElement('pre');
//         this.pre.className = 'editor-pre';
//         this.pre.setAttribute('aria-hidden', 'true');
//         this.code = document.createElement('code');
//         this.pre.appendChild(this.code);
//         this.textarea = document.createElement('textarea');
//         this.textarea.className = 'editor-textarea';
//         this.textarea.spellcheck = false;
//         this.textarea.autocapitalize = 'off';
//         this.textarea.autocomplete = 'off';
//         this.textarea.autocorrect = 'off';
//         this.textarea.wrap = 'off';
//         this.container.appendChild(this.pre);
//         this.container.appendChild(this.textarea);
//         mount.appendChild(this.container);
//         // ----- 事件绑定 -----
//         this.textarea.addEventListener('input', this.onInput);
//         this.textarea.addEventListener('scroll', this.syncScroll);
//         this.textarea.addEventListener('paste', this.onPaste);
//         this.pre.addEventListener('mouseover', this.onPreMouseOver);
//         this.pre.addEventListener('mouseout', this.onPreMouseOut);
//         // 初始内容
//         if (initialValue) {
//             this.textarea.value = initialValue;   // 传入的应为 Unicode 文本
//             this.render();
//         }
//     }
//     // ========== 公共 API ==========
//     getValue(): string {
//         return this.textarea.value;
//     }
//     setValue(unicodeText: string) {
//         this.textarea.value = unicodeText;
//         this.render();
//     }
//     // ========== 输入处理：自动替换 ASCII 序列为 Unicode ==========
//     private onInput = () => {
//         const ta = this.textarea;
//         let val = ta.value;
//         const cursor = ta.selectionStart;
//         for (const [ascii, unicode] of SyntaxEditor.inputReplacements) {
//             const idx = val.lastIndexOf(ascii, cursor - 1);
//             if (idx !== -1 && idx + ascii.length === cursor) {
//                 val = val.slice(0, idx) + unicode + val.slice(idx + ascii.length);
//                 ta.value = val;
//                 ta.selectionStart = ta.selectionEnd = idx + unicode.length;
//                 break;
//             }
//         }
//         this.render();
//     };
//     private syncScroll = () => {
//         this.pre.scrollTop = this.textarea.scrollTop;
//         this.pre.scrollLeft = this.textarea.scrollLeft;
//     };
//     private onPaste = (e: ClipboardEvent) => {
//         e.preventDefault();
//         const text = e.clipboardData?.getData('text/plain') ?? '';
//         const ta = this.textarea;
//         const start = ta.selectionStart;
//         const end = ta.selectionEnd;
//         ta.value = ta.value.substring(0, start) + text + ta.value.substring(end);
//         ta.selectionStart = ta.selectionEnd = start + text.length;
//         // 粘贴后需再次触发替换（可能会产生新的序列）
//         this.onInput();
//     };
//     // ========== 渲染：利用 parser + highlighter 更新高亮层 ==========
//     private render() {
//         const unicodeText = this.textarea.value;
//         const tokens = this.parser.tokenize(unicodeText);
//         this.currentAst = this.parser.parseFromTokens(tokens);
//         const html = this.highlighter.highlight(tokens);
//         // 确保末尾换行
//         this.code.innerHTML = html + '\n';
//     }
//     // ========== 鼠标悬停：查找 AST 节点并高亮其所有 token ==========
//     private onPreMouseOver = (e: MouseEvent) => {
//         const span = (e.target as HTMLElement).closest('.token') as HTMLElement | null;
//         if (!span || !this.currentAst) return;
//         const start = parseInt(span.dataset.start!, 10);
//         const node = this.findOperatorNode(this.currentAst, start);
//         if (node) this.highlightASTNode(node);
//     };
//     private onPreMouseOut = () => {
//         this.clearASTHighlight();
//     };
//     /** 在 AST 中查找包含 offset 的最内层操作符节点 */
//     private findOperatorNode(ast: AST, offset: number): AST | null {
//         // 优先递归子节点
//         if (ast.nodes) {
//             for (const child of ast.nodes) {
//                 const found = this.findOperatorNode(child, offset);
//                 if (found) return found;
//             }
//         }
//         // 如果当前节点是操作符且范围包含 offset
//         if (ast.type === 'sym' && offset >= ast.start && offset < ast.end) {
//             return ast;
//         }
//         return null;
//     }
//     private highlightASTNode(node: AST) {
//         this.clearASTHighlight();
//         this.code.querySelectorAll('.token').forEach((el: HTMLElement) => {
//             const s = parseInt(el.dataset.start!, 10);
//             const e = parseInt(el.dataset.end!, 10);
//             if (s < node.end && e > node.start) {
//                 el.classList.add('ast-highlight');
//             }
//         });
//     }
//     private clearASTHighlight() {
//         this.code.querySelectorAll('.ast-highlight').forEach(el => el.classList.remove('ast-highlight'));
//     }
// }
//# sourceMappingURL=editor.js.map