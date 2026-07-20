import { SyntaxViewer } from "../../astrender.js";
import { FlatTreeManager, ListNode } from "../../listmgr.js";
import { Proposition } from "../core/deduct.js";
import { FSParser } from "../core/parser.js";

export class TheoremManager extends FlatTreeManager {
    constructor(container: HTMLElement, initialData: ListNode[]) {
        super({
            container,
            data: initialData,
            renderName: (item) => item.name,
            renderContent: (item) => {
                const span = document.createElement('span');
                span.className = "inner";
                new SyntaxViewer(span, new FSParser, item.content || "", 'rule')
                return span;
            },
            renderExtra: (item) => {
                const colors: Record<string, string> = {
                    't': '#dbeafe',
                    'd': '#d1fae5',
                    'a': '#fef3c7',
                };
                const bg = colors[item.category] || '#f1f5f9';
                const label = item.category || '未分类';
                const span = document.createElement('span');
                span.style.display = 'inline-block';
                span.style.width = '12px';
                span.style.height = '12px';
                span.style.borderRadius = '50%';
                span.style.background = bg;
                span.style.border = '1px solid #d1d9e6';
                span.title = label;
                return span;
            },
            itemMenuItems: [
                { label: '复制', icon: '📋', handler: (id) => { alert('复制功能示例'); } },
            ],
            folderMenuItems: [
                { label: '导出', icon: '📤', handler: (id) => { alert('导出示例'); } },
            ],
            onRename: (id, newName) => console.log('[定理] 重命名', id, newName),
            onDelete: (id) => console.log('[定理] 删除', id),
            allowDrag: true,
        });

        this.onAddItem = (parentId) => {
            const name = prompt('输入定理名称 (如 mp, axiom3)');
            if (!name || name.trim() === '') return;
            const content = prompt('输入公式 (如 x, y, z |- x)') || '';
            const category = prompt('输入分类 (如 命题逻辑)') || '未分类';
            this.getDataManager().addNode(parentId, {
                type: 'item',
                name: name.trim(),
                content: content,
                category: category
            } as any);
        };
    }
}

export class PropositionManager extends FlatTreeManager {
    constructor(container: HTMLElement) {
        super({
            container,
            data: [],
            renderName: (item) => item.name,
            renderContent: (item) => {
                const span = document.createElement('span');
                span.className = "inner";
                new SyntaxViewer(span, new FSParser, item.text || "", 'wff');
                return span;
            },
            renderExtra: (item) => {
                const span = document.createElement('span');
                span.textContent = item.from || '';
                return span;
            },
            itemMenuItems: [
                { label: '查看依赖', icon: '🔗', handler: (id) => { alert('依赖检查示例'); } },
            ],
            folderMenuItems: [
                { label: '折叠全部', icon: '📂', handler: (id) => { /* 示例 */ } },
            ],
            onRename: (id, newName) => console.log('[命题] 重命名', id, newName),
            onDelete: (id) => console.log('[命题] 删除', id),
            allowDrag: true,
        });

        this.onAddItem = (parentId) => {
            const content = prompt('输入假设内容') || '';
            const ast = new FSParser().parse(content, 'wff');
            this.getDataManager().addNode(parentId, {
                type: 'item',
                proposition: Proposition.hyp(ast)
            } as any);
        };
    }
}
