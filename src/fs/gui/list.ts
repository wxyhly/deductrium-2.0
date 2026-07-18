import { SyntaxViewer } from "../../astrender.js";
import { FlatTreeManager, ListNode } from "../../listmgr.js";
import { F } from "../core/bool3.js";
import { FSParser } from "../core/parser.js";

export class TheoremManager extends FlatTreeManager {
    constructor(container: HTMLElement, initialData: ListNode[]) {
        [
            {
                id: 'f1',
                name: '几何',
                type: 'folder',
                children: [
                    { id: 't1', name: '勾股定理', type: 'item', content: 'a² + b² = c²', category: '几何' },
                    { id: 't2', name: '毕达哥拉斯', type: 'item', content: '直角三角形中...', category: '几何' }
                ]
            },
            {
                id: 'f2',
                name: '分析',
                type: 'folder',
                children: [
                    { id: 't3', name: '牛顿-莱布尼茨', type: 'item', content: '∫ₐᵇ f(x) dx = F(b)-F(a)', category: '微积分' },
                    { id: 't4', name: '泰勒定理', type: 'item', content: 'f(x) = Σ ...', category: '数学分析' }
                ]
            },
            { id: 't5', name: '欧拉公式', type: 'item', content: 'e^(ix) = cos x + i sin x', category: '复分析' },
            { id: 't6', name: '费马小定理', type: 'item', content: 'a^(p-1) ≡ 1 (mod p)', category: '数论' },
        ];

        super({
            container,
            data: initialData,
            renderName: (item) => item.name,
            renderContent: (item) => {
                const span = document.createElement('span');
                span.className="inner";
                new SyntaxViewer(span,new FSParser,item.content||"",F)
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
        const initialData: ListNode[] = [
            {
                id: 'pf1',
                name: '推导组1',
                type: 'folder',
                children: [
                    { id: 'p1', name: 'p1', type: 'item', content: 'A → B', inference: '假设' },
                    { id: 'p2', name: 'p2', type: 'item', content: 'A', inference: '假设' },
                    { id: 'p3', name: 'p3', type: 'item', content: 'B', inference: 'mp p1 p2' },
                ]
            },
            { id: 'p4', name: 'p4', type: 'item', content: 'A ∧ B', inference: '∧引入' },
            { id: 'p5', name: 'p5', type: 'item', content: 'A ∨ B', inference: '∨引入 p4' },
        ];

        super({
            container,
            data: initialData,
            renderName: (item) => item.name,
            renderContent: (item) => {
                const span = document.createElement('span');
                let html = item.content || '';
                html = html
                    .replace(/(\b(?:A|B|C|P|Q|R|S|T)\b)/g,
                        '<span style="color:#0f6b9e;font-weight:500;">$1</span>')
                    .replace(/([→∧∨¬⊢])/g, '<span style="color:#b45309;font-weight:600;">$1</span>');
                span.innerHTML = html;
                return span;
            },
            renderExtra: (item) => {
                const span = document.createElement('span');
                span.style.fontSize = '0.7rem';
                span.style.color = '#475569';
                span.style.background = '#f1f5f9';
                span.style.padding = '0.1rem 0.5rem';
                span.style.borderRadius = '12px';
                span.textContent = item.inference || '';
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
            const name = prompt('输入命题名称 (如 p1)');
            if (!name || name.trim() === '') return;
            const content = prompt('输入公式内容') || '';
            const inference = prompt('输入推理步骤信息 (如 mp p1 p2)') || '';
            this.getDataManager().addNode(parentId, {
                type: 'item',
                name: name.trim(),
                content: content,
                inference: inference
            } as any);
        };
    }
}
