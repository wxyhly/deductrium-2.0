type NodeType = 'folder' | 'item';

interface BaseNode {
    id: string;
    name: string;
    type: NodeType;
}

interface FolderListNode extends BaseNode {
    type: 'folder';
    children: ListNode[];
}

interface ItemListNode extends BaseNode {
    type: 'item';
    [key: string]: any;
}

export type ListNode = FolderListNode | ItemListNode;

function isFolder(node: ListNode): node is FolderListNode {
    return node.type === 'folder';
}
function isItem(node: ListNode): node is ItemListNode {
    return node.type === 'item';
}

// ================================================================
//  2. 数据管理器
// ================================================================

export class DataManager {
    private root: FolderListNode;
    private idCounter: number = 1000;
    public onDataChange: (() => void) | null = null;

    constructor(initialData?: ListNode[]) {
        this.root = {
            id: 'root',
            name: '全部',
            type: 'folder',
            children: initialData || []
        };
        this.assignIds(this.root);
    }

    private assignIds(node: ListNode): void {
        if (!node.id) {
            node.id = 'n' + (this.idCounter++);
        }
        if (isFolder(node)) {
            for (const child of node.children) {
                this.assignIds(child);
            }
        }
    }

    getRoot(): FolderListNode { return this.root; }

    findNode(id: string): ListNode | null {
        const search = (node: ListNode): ListNode | null => {
            if (node.id === id) return node;
            if (isFolder(node)) {
                for (const child of node.children) {
                    const found = search(child);
                    if (found) return found;
                }
            }
            return null;
        };
        return search(this.root);
    }

    findParentAndIndex(id: string): { parent: FolderListNode; index: number } | null {
        const search = (node: ListNode): { parent: FolderListNode; index: number } | null => {
            if (isFolder(node)) {
                for (let i = 0; i < node.children.length; i++) {
                    const child = node.children[i];
                    if (child.id === id) {
                        return { parent: node, index: i };
                    }
                    if (isFolder(child)) {
                        const res = search(child);
                        if (res) return res;
                    }
                }
            }
            return null;
        };
        return search(this.root);
    }

    addNode(parentId: string, node: Omit<ListNode, 'id'>): ListNode {
        const parent = this.findNode(parentId);
        if (!parent || !isFolder(parent)) throw new Error('父节点必须是文件夹');
        const newNode: ListNode = { ...node, id: 'n' + (this.idCounter++) } as ListNode;
        parent.children.push(newNode);
        this.notify();
        return newNode;
    }

    deleteNode(id: string): boolean {
        if (id === 'root') return false;
        const info = this.findParentAndIndex(id);
        if (!info) return false;
        info.parent.children.splice(info.index, 1);
        this.notify();
        return true;
    }

    renameNode(id: string, newName: string): boolean {
        const node = this.findNode(id);
        if (!node) return false;
        node.name = newName;
        this.notify();
        return true;
    }

    moveNode(sourceId: string, targetId: string, position: 'inside' | 'before' | 'after'): boolean {
        if (sourceId === targetId || sourceId === 'root') return false;
        const srcInfo = this.findParentAndIndex(sourceId);
        if (!srcInfo) return false;
        const srcParent = srcInfo.parent;
        const srcIdx = srcInfo.index;
        const srcNode = srcParent.children[srcIdx];

        if (isFolder(srcNode)) {
            const isDescendant = (folder: FolderListNode, id: string): boolean => {
                for (const child of folder.children) {
                    if (child.id === id) return true;
                    if (isFolder(child) && isDescendant(child, id)) return true;
                }
                return false;
            };
            if (isFolder(srcNode) && isDescendant(srcNode, targetId)) return false;
        }

        const targetNode = this.findNode(targetId);
        if (!targetNode) return false;

        let targetParent: FolderListNode | null = null;
        let insertIdx: number = -1;

        if (position === 'inside') {
            if (!isFolder(targetNode)) return false;
            targetParent = targetNode;
            insertIdx = targetParent.children.length;
        } else {
            const tInfo = this.findParentAndIndex(targetId);
            if (!tInfo) return false;
            targetParent = tInfo.parent;
            insertIdx = tInfo.index;
            if (position === 'after') insertIdx++;
        }
        if (!targetParent) return false;

        if (srcParent === targetParent) {
            if (insertIdx > srcIdx) insertIdx--;
        }

        srcParent.children.splice(srcIdx, 1);
        targetParent.children.splice(insertIdx, 0, srcNode);
        this.notify();
        return true;
    }

    flattenTree(): Array<{ node: ListNode; depth: number }> {
        const result: Array<{ node: ListNode; depth: number }> = [];
        const traverse = (node: ListNode, depth: number) => {
            result.push({ node, depth });
            if (isFolder(node)) {
                for (const child of node.children) {
                    traverse(child, depth + 1);
                }
            }
        };
        for (const child of this.root.children) {
            traverse(child, 0);
        }
        return result;
    }

    private notify(): void {
        if (this.onDataChange) this.onDataChange();
    }

    exportData(): ListNode[] {
        return this.root.children;
    }
}

// ================================================================
//  3. 通用扁平列表管理器
// ================================================================

export interface ManagerConfig {
    container: HTMLElement;
    data?: ListNode[];
    renderName: (item: ItemListNode) => string;
    renderContent: (item: ItemListNode) => Node; // 返回 DOM Node
    renderExtra: (item: ItemListNode) => Node;  // 返回 DOM Node
    folderMenuItems?: Array<{ label: string; icon?: string; handler: (id: string) => void; danger?: boolean }>;
    itemMenuItems?: Array<{ label: string; icon?: string; handler: (id: string) => void; danger?: boolean }>;
    onRename?: (id: string, newName: string) => void;
    onDelete?: (id: string) => void;
    onMove?: (sourceId: string, targetId: string, position: 'inside' | 'before' | 'after') => boolean;
    onReorder?: (sourceId: string, targetId: string, position: 'before' | 'after') => boolean;
    allowDrag?: boolean;
    allowDrop?: (sourceId: string, targetId: string, position: 'inside' | 'before' | 'after') => boolean;
    initialHeight?: string;
    longPressDelay?: number;
}

export class FlatTreeManager {
    private config: Required<Omit<ManagerConfig, 'container' | 'data'>> & {
        container: HTMLElement;
        data: ListNode[];
    };
    private manager: DataManager;
    private container: HTMLElement;
    private rowsContainer: HTMLElement;
    private badgeEl: HTMLElement;
    private openMenuId: string | null = null;
    private dragState: { type: 'node' | 'item'; id: string; sourceElement: HTMLElement } | null = null;
    private expandedFolders: Set<string> = new Set();
    private addFolderBtn: HTMLElement;
    private addItemBtn: HTMLElement;
    private resizeHandle: HTMLElement | null = null;
    private isResizing: boolean = false;

    // 长按拖拽相关
    private longPressTimer: number | null = null;
    private touchStartX: number = 0;
    private touchStartY: number = 0;
    private isDraggingTouch: boolean = false;
    private longPressDelay: number = 300;

    private static PLACEHOLDER_ID = '__drop_placeholder__';

    constructor(config: ManagerConfig) {
        const def = {
            folderMenuItems: [],
            itemMenuItems: [],
            onRename: () => { },
            onDelete: () => { },
            onMove: () => true,
            onReorder: () => true,
            allowDrag: true,
            allowDrop: () => true,
            data: [],
            initialHeight: '50vh',
            longPressDelay: 300,
        };
        this.config = {
            container: config.container,
            data: config.data || [],
            renderName: config.renderName,
            renderContent: config.renderContent,
            renderExtra: config.renderExtra,
            folderMenuItems: config.folderMenuItems ?? def.folderMenuItems,
            itemMenuItems: config.itemMenuItems ?? def.itemMenuItems,
            onRename: config.onRename ?? def.onRename,
            onDelete: config.onDelete ?? def.onDelete,
            onMove: config.onMove ?? def.onMove,
            onReorder: config.onReorder ?? def.onReorder,
            allowDrag: config.allowDrag ?? def.allowDrag,
            allowDrop: config.allowDrop ?? def.allowDrop,
            initialHeight: config.initialHeight ?? def.initialHeight,
            longPressDelay: config.longPressDelay ?? def.longPressDelay,
        };
        this.longPressDelay = this.config.longPressDelay;
        this.container = config.container;
        this.rowsContainer = this.container.querySelector('.rows-container')!;
        this.badgeEl = this.container.querySelector('.badge')!;
        this.addFolderBtn = this.container.querySelector('.actions .btn-sm:first-child')!;
        this.addItemBtn = this.container.querySelector('.actions .btn-sm:last-child')!;

        this.container.style.height = this.config.initialHeight;
        this.createResizeHandle();

        this.manager = new DataManager(this.config.data);
        this.manager.onDataChange = () => {
            this.renderList();
            this.updateBadge();
        };

        this.expandAll();
        this.renderList();
        this.updateBadge();

        this.bindRowEvents();
        this.bindAddButtons();
    }

    private createResizeHandle(): void {
        const existing = this.container.querySelector('.resize-handle');
        if (existing) existing.remove();

        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        this.container.appendChild(handle);
        this.resizeHandle = handle;
        makeResizable(this.container, handle, false);
    }

    private expandAll(): void {
        const collect = (node: ListNode) => {
            if (isFolder(node)) {
                this.expandedFolders.add(node.id);
                for (const child of node.children) collect(child);
            }
        };
        for (const child of this.manager.getRoot().children) {
            collect(child);
        }
    }

    private renderList(): void {
        const flat = this.flattenVisible();
        this.rowsContainer.innerHTML = '';
        if (flat.length === 0) return;

        const fragment = document.createDocumentFragment();
        for (const { node, depth } of flat) {
            const row = this.buildRow(node, depth);
            fragment.appendChild(row);
        }

        const placeholder = this.buildPlaceholderRow();
        fragment.appendChild(placeholder);

        this.rowsContainer.appendChild(fragment);
        this.bindRowEvents(); // 重新绑定事件
    }

    private buildPlaceholderRow(): HTMLElement {
        const row = document.createElement('div');
        row.className = 'item-row drop-placeholder';
        row.dataset.id = FlatTreeManager.PLACEHOLDER_ID;
        row.dataset.type = 'placeholder';
        row.style.setProperty('--depth', '0');
        for (let i = 0; i < 4; i++) {
            const cell = document.createElement('div');
            cell.style.display = 'none';
            row.appendChild(cell);
        }
        return row;
    }

    private flattenVisible(): Array<{ node: ListNode; depth: number }> {
        const result: Array<{ node: ListNode; depth: number }> = [];
        const traverse = (node: ListNode, depth: number) => {
            result.push({ node, depth });
            if (isFolder(node) && this.expandedFolders.has(node.id)) {
                for (const child of node.children) {
                    traverse(child, depth + 1);
                }
            }
        };
        for (const child of this.manager.getRoot().children) {
            traverse(child, 0);
        }
        return result;
    }

    private buildRow(node: ListNode, depth: number): HTMLElement {
        const isFolderNode = isFolder(node);
        const id = node.id;
        const name = node.name;

        const row = document.createElement('div');
        row.className = `item-row ${isFolderNode ? 'folder-row' : ''}`;
        row.dataset.id = id;
        row.dataset.type = node.type;
        row.style.setProperty('--depth', String(depth));
        if (this.config.allowDrag) {
            row.draggable = true;
        }

        // ---- 名称列 ----
        const nameCell = document.createElement('div');
        nameCell.className = 'cell-name';
        nameCell.dataset.id = id;
        if (this.config.allowDrag) {
            nameCell.draggable = true;
        }

        const indent = document.createElement('span');
        indent.className = 'row-indent';
        nameCell.appendChild(indent);

        if (isFolderNode) {
            const isExpanded = this.expandedFolders.has(id);
            const toggle = document.createElement('span');
            toggle.className = `toggle-icon ${isExpanded ? 'expanded' : ''}`;
            toggle.dataset.id = id;
            toggle.textContent = '▶';
            nameCell.appendChild(toggle);

            const folderIcon = document.createElement('span');
            folderIcon.className = 'folder-icon';
            folderIcon.dataset.id = id;
            folderIcon.textContent = '📁';
            nameCell.appendChild(folderIcon);

            const nameText = document.createElement('span');
            nameText.className = 'name-text';
            nameText.style.display = 'none';
            nameCell.appendChild(nameText);
        } else {
            const nameText = document.createElement('span');
            nameText.className = 'name-text';
            nameText.textContent = this.config.renderName(node);
            nameCell.appendChild(nameText);
        }

        row.appendChild(nameCell);

        // ---- 内容列 ----
        const contentCell = document.createElement('div');
        contentCell.className = `cell-content ${isFolderNode ? 'folder-content' : ''}`;
        contentCell.dataset.id = id;
        if (isFolderNode) {
            contentCell.dataset.isFolder = 'true';
        }
        if (isFolderNode) {
            const inner = document.createElement('span');
            inner.className = 'inner';
            inner.style.fontWeight = '500';
            inner.style.color = '#1e293b';
            inner.textContent = name;
            contentCell.appendChild(inner);
        } else {
            const contentNode = this.config.renderContent(node);
            if (contentNode instanceof DocumentFragment) {
                contentCell.appendChild(contentNode);
            } else {
                contentCell.appendChild(contentNode);
            }
        }
        row.appendChild(contentCell);

        // ---- 额外列 ----
        const extraCell = document.createElement('div');
        extraCell.className = 'cell-extra';
        extraCell.dataset.id = id;

        const extraContainer = document.createElement('span');
        extraContainer.className = 'extra-text';
        if (isFolderNode) {
            extraContainer.textContent = `📂 ${node.children.length}`;
        } else {
            const extraNode = this.config.renderExtra(node);
            if (extraNode instanceof DocumentFragment) {
                extraContainer.appendChild(extraNode);
            } else {
                extraContainer.appendChild(extraNode);
            }
        }
        extraCell.appendChild(extraContainer);
        row.appendChild(extraCell);

        // ---- 操作列 ----
        const actionsCell = document.createElement('div');
        actionsCell.className = 'cell-actions';
        actionsCell.dataset.id = id;

        const trigger = document.createElement('button');
        trigger.className = 'dropdown-trigger';
        trigger.dataset.id = id;
        trigger.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`;
        actionsCell.appendChild(trigger);

        const menu = document.createElement('div');
        menu.className = 'dropdown-menu';
        menu.dataset.id = id;
        menu.innerHTML = this.buildMenuHTML(node);
        actionsCell.appendChild(menu);

        row.appendChild(actionsCell);

        return row;
    }

    private buildMenuHTML(node: ListNode): string {
        const id = node.id;
        let html = '';
        if (isFolder(node)) {
            html += `<button class="menu-item" data-action="add-subfolder" data-id="${id}"><span class="icon">📁</span> 新建子文件夹</button>`;
            html += `<button class="menu-item" data-action="rename-folder" data-id="${id}"><span class="icon">✏️</span> 重命名</button>`;
            for (const mi of this.config.folderMenuItems) {
                const danger = mi.danger ? 'danger' : '';
                const icon = mi.icon || '•';
                html += `<button class="menu-item ${danger}" data-action="custom-folder" data-custom-index="${this.config.folderMenuItems.indexOf(mi)}" data-id="${id}"><span class="icon">${icon}</span> ${mi.label}</button>`;
            }
            html += `<div class="menu-divider"></div>`;
            html += `<button class="menu-item danger" data-action="delete-folder" data-id="${id}"><span class="icon">🗑️</span> 删除</button>`;
        } else {
            html += `<button class="menu-item" data-action="rename" data-id="${id}"><span class="icon">✏️</span> 重命名</button>`;
            for (const mi of this.config.itemMenuItems) {
                const danger = mi.danger ? 'danger' : '';
                const icon = mi.icon || '•';
                html += `<button class="menu-item ${danger}" data-action="custom-item" data-custom-index="${this.config.itemMenuItems.indexOf(mi)}" data-id="${id}"><span class="icon">${icon}</span> ${mi.label}</button>`;
            }
            html += `<div class="menu-divider"></div>`;
            html += `<button class="menu-item danger" data-action="delete" data-id="${id}"><span class="icon">🗑️</span> 删除</button>`;
        }
        return html;
    }

    // ---- 事件绑定（修复死机问题） ----
    private bindRowEvents(): void {
        // 展开/折叠
        this.rowsContainer.querySelectorAll('.item-row.folder-row').forEach(el => {
            el.removeEventListener('click', this.toggleHandler as any);
            el.addEventListener('click', this.toggleHandler as any);
        });

        // 菜单触发
        this.rowsContainer.querySelectorAll('.dropdown-trigger').forEach(btn => {
            btn.removeEventListener('click', this.menuTriggerHandler as any);
            btn.addEventListener('click', this.menuTriggerHandler as any);
        });

        // 菜单项
        this.rowsContainer.querySelectorAll('.menu-item').forEach(item => {
            item.removeEventListener('click', this.menuItemHandler as any);
            item.addEventListener('click', this.menuItemHandler as any);
        });

        // 拖拽（鼠标 + 触摸）
        if (this.config.allowDrag) {
            this.rowsContainer.querySelectorAll('.item-row').forEach(row => {
                if ((row as HTMLElement).dataset.id === FlatTreeManager.PLACEHOLDER_ID) return;
                // 鼠标拖拽
                row.removeEventListener('dragstart', this.dragStartHandler as any);
                row.removeEventListener('dragend', this.dragEndHandler as any);
                row.removeEventListener('dragover', this.dragOverHandler as any);
                row.removeEventListener('dragleave', this.dragLeaveHandler as any);
                row.removeEventListener('drop', this.dropHandler as any);
                row.addEventListener('dragstart', this.dragStartHandler as any);
                row.addEventListener('dragend', this.dragEndHandler as any);
                row.addEventListener('dragover', this.dragOverHandler as any);
                row.addEventListener('dragleave', this.dragLeaveHandler as any);
                row.addEventListener('drop', this.dropHandler as any);

                // 触摸拖拽（长按触发）
                row.removeEventListener('touchstart', this.touchStartHandler as any);
                row.removeEventListener('touchmove', this.touchMoveHandler as any);
                row.removeEventListener('touchend', this.touchEndHandler as any);
                row.addEventListener('touchstart', this.touchStartHandler as any, { passive: false });
                row.addEventListener('touchmove', this.touchMoveHandler as any, { passive: false });
                row.addEventListener('touchend', this.touchEndHandler as any);
            });
        }
    }

    // ---- 折叠切换 ----
    private toggleHandler = (e: Event) => {
        const target = e.currentTarget as HTMLElement;
        let id = target.dataset.id;
        if (!id) {
            const row = target.closest('.item-row') as HTMLElement;
            if (row) id = row.dataset.id;
        }
        if (!id) return;
        const node = this.manager.findNode(id);
        if (!node || !isFolder(node)) return;

        if (this.expandedFolders.has(id)) {
            this.expandedFolders.delete(id);
        } else {
            this.expandedFolders.add(id);
        }
        this.renderList();
    };

    // ---- 菜单 ----
    private menuTriggerHandler = (e: Event) => {
        e.stopPropagation();
        const btn = e.currentTarget as HTMLElement;
        const id = btn.dataset.id;
        if (!id) return;
        const menu = btn.parentElement?.querySelector('.dropdown-menu') as HTMLElement;
        if (!menu) return;
        if (this.openMenuId === id) {
            this.closeAllMenus();
            return;
        }
        this.closeAllMenus();
        menu.classList.add('open');
        this.openMenuId = id;
    };

    private menuItemHandler = (e: Event) => {
        const target = e.currentTarget as HTMLElement;
        const action = target.dataset.action;
        const id = target.dataset.id;
        if (!id) return;
        e.stopPropagation();
        this.closeAllMenus();

        if (action === 'rename') {
            this.startRenameItem(id);
        } else if (action === 'delete') {
            this.deleteItem(id);
        } else if (action === 'custom-item') {
            const idx = parseInt(target.dataset.customIndex || '-1', 10);
            const menu = this.config.itemMenuItems[idx];
            if (menu) menu.handler(id);
        } else if (action === 'rename-folder') {
            this.startRenameFolder(id);
        } else if (action === 'delete-folder') {
            this.deleteFolder(id);
        } else if (action === 'add-subfolder') {
            this.addSubfolder(id);
        } else if (action === 'custom-folder') {
            const idx = parseInt(target.dataset.customIndex || '-1', 10);
            const menu = this.config.folderMenuItems[idx];
            if (menu) menu.handler(id);
        }
    };

    private closeAllMenus(): void {
        document.querySelectorAll('.dropdown-menu.open').forEach(el => el.classList.remove('open'));
        this.openMenuId = null;
    }

    // ---- 鼠标拖拽（修复死机：减少DOM操作，避免重复查询） ----
    private dragStartHandler = (e: DragEvent) => {
        const target = e.target as HTMLElement;
        const cellName = target.closest('.cell-name');
        if (!cellName) {
            e.preventDefault();
            return;
        }
        const row = cellName.closest('.item-row') as HTMLElement;
        if (!row) {
            e.preventDefault();
            return;
        }
        const id = row.dataset.id;
        if (!id || id === FlatTreeManager.PLACEHOLDER_ID) {
            e.preventDefault();
            return;
        }
        this.dragState = {
            type: 'node',
            id: id,
            sourceElement: row
        };
        e.dataTransfer!.setData('text/plain', JSON.stringify({ type: 'node', id }));
        e.dataTransfer!.effectAllowed = 'move';
        row.classList.add('dragging');
    };

    private dragEndHandler = (e: DragEvent) => {
        this.clearDragHighlights();
        if (this.dragState) {
            const src = this.dragState.sourceElement;
            if (src) src.classList.remove('dragging');
            this.dragState = null;
        }
    };

    private dragOverHandler = (e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';

        const targetRow = (e.target as HTMLElement).closest('.item-row') as HTMLElement;
        if (!targetRow) return;
        const targetId = targetRow.dataset.id;
        if (!targetId) return;
        const sourceId = this.dragState?.id;
        if (!sourceId || sourceId === targetId) {
            this.clearDropTarget(targetRow);
            return;
        }

        // 占位符
        if (targetId === FlatTreeManager.PLACEHOLDER_ID) {
            const allowed = this.config.allowDrop(sourceId, targetId, 'before');
            this.clearDropTarget(targetRow);
            if (allowed) {
                targetRow.classList.add('drop-before');
            } else {
                targetRow.classList.add('drop-before-disallowed');
            }
            return;
        }

        const rect = targetRow.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height;

        const targetNode = this.manager.findNode(targetId);
        const isFolderTarget = targetNode && isFolder(targetNode);
        const isExpanded = isFolderTarget && this.expandedFolders.has(targetId);

        let position: 'inside' | 'before' | 'after' = 'before';
        if (isExpanded && (y / height) > 0.5) {
            position = 'inside';
        } else {
            position = (y / height) < 0.5 ? 'before' : 'after';
        }

        const allowed = this.config.allowDrop(sourceId, targetId, position);
        this.clearDropTarget(targetRow);

        if (allowed) {
            if (position === 'inside') targetRow.classList.add('drop-inside');
            else if (position === 'before') targetRow.classList.add('drop-before');
            else targetRow.classList.add('drop-after');
        } else {
            if (position === 'inside') targetRow.classList.add('drop-inside-disallowed');
            else if (position === 'before') targetRow.classList.add('drop-before-disallowed');
            else targetRow.classList.add('drop-after-disallowed');
        }
    };

    private dragLeaveHandler = (e: DragEvent) => {
        const targetRow = (e.target as HTMLElement).closest('.item-row') as HTMLElement;
        if (targetRow) {
            this.clearDropTarget(targetRow);
        }
    };

    private dropHandler = (e: DragEvent) => {
        e.preventDefault();
        const targetRow = (e.target as HTMLElement).closest('.item-row') as HTMLElement;
        if (!targetRow) return;

        const targetId = targetRow.dataset.id;
        if (!targetId) return;
        const sourceId = this.dragState?.id;
        if (!sourceId || sourceId === targetId) {
            this.dragEndHandler(e);
            return;
        }

        // 占位符
        if (targetId === FlatTreeManager.PLACEHOLDER_ID) {
            const allowed = this.config.allowDrop(sourceId, targetId, 'before');
            if (!allowed) {
                alert('不允许放置到此位置');
                this.dragEndHandler(e);
                return;
            }
            const srcInfo = this.manager.findParentAndIndex(sourceId);
            if (srcInfo) {
                const parent = srcInfo.parent;
                const idx = srcInfo.index;
                const node = parent.children[idx];
                parent.children.splice(idx, 1);
                parent.children.push(node);
                this.manager.onDataChange?.();
            }
            this.dragEndHandler(e);
            return;
        }

        let position: 'inside' | 'before' | 'after' = 'before';
        if (targetRow.classList.contains('drop-inside') || targetRow.classList.contains('drop-inside-disallowed')) {
            position = 'inside';
        } else if (targetRow.classList.contains('drop-before') || targetRow.classList.contains('drop-before-disallowed')) {
            position = 'before';
        } else if (targetRow.classList.contains('drop-after') || targetRow.classList.contains('drop-after-disallowed')) {
            position = 'after';
        } else {
            const rect = targetRow.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const height = rect.height;
            const targetNode = this.manager.findNode(targetId);
            const isFolderTarget = targetNode && isFolder(targetNode);
            const isExpanded = isFolderTarget && this.expandedFolders.has(targetId);
            if (isExpanded && (y / height) > 0.5) position = 'inside';
            else position = (y / height) < 0.5 ? 'before' : 'after';
        }

        const allowed = this.config.allowDrop(sourceId, targetId, position);
        if (!allowed) {
            alert('不允许放置到此位置');
            this.dragEndHandler(e);
            return;
        }

        let success = false;
        if (position === 'inside') {
            success = this.config.onMove(sourceId, targetId, 'inside');
        } else {
            const srcInfo = this.manager.findParentAndIndex(sourceId);
            const tgtInfo = this.manager.findParentAndIndex(targetId);
            if (srcInfo && tgtInfo && srcInfo.parent === tgtInfo.parent) {
                success = this.config.onReorder(sourceId, targetId, position);
            } else {
                success = this.config.onMove(sourceId, targetId, position);
            }
        }

        if (success) {
            this.manager.moveNode(sourceId, targetId, position);
        } else {
            alert('移动操作被禁止或失败');
        }

        this.dragEndHandler(e);
    };

    // ---- 触摸拖拽（长按触发） ----
    private touchStartHandler = (e: TouchEvent) => {
        const target = e.target as HTMLElement;
        const cellName = target.closest('.cell-name');
        if (!cellName) {
            return;
        }
        const row = cellName.closest('.item-row') as HTMLElement;
        if (!row) return;
        const id = row.dataset.id;
        if (!id || id === FlatTreeManager.PLACEHOLDER_ID) return;

        const touch = e.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        this.isDraggingTouch = false;

        if (this.longPressTimer !== null) {
            window.clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        this.longPressTimer = window.setTimeout(() => {
            this.isDraggingTouch = true;
            document.addEventListener('touchmove', this.preventScroll, { passive: false });

            this.dragState = {
                type: 'node',
                id: id,
                sourceElement: row
            };
            row.classList.add('dragging');
            (row as any)._dragData = JSON.stringify({ type: 'node', id });

            if (navigator.vibrate) navigator.vibrate(20);
            this.longPressTimer = null;
        }, this.longPressDelay);
    };

    private touchMoveHandler = (e: TouchEvent) => {
        if (this.isDraggingTouch && this.dragState) {
            e.preventDefault();
            const touch = e.touches[0];
            const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetRow = targetElement?.closest('.item-row') as HTMLElement;
            if (targetRow && targetRow !== this.dragState.sourceElement) {
                const targetId = targetRow.dataset.id;
                if (targetId) {
                    const sourceId = this.dragState.id;
                    if (sourceId && sourceId !== targetId) {
                        if (targetId === FlatTreeManager.PLACEHOLDER_ID) {
                            const allowed = this.config.allowDrop(sourceId, targetId, 'before');
                            this.clearDragHighlights();
                            if (allowed) {
                                targetRow.classList.add('drop-before');
                            } else {
                                targetRow.classList.add('drop-before-disallowed');
                            }
                            return;
                        }
                        const rect = targetRow.getBoundingClientRect();
                        const y = touch.clientY - rect.top;
                        const height = rect.height;
                        const targetNode = this.manager.findNode(targetId);
                        const isFolderTarget = targetNode && isFolder(targetNode);
                        const isExpanded = isFolderTarget && this.expandedFolders.has(targetId);
                        let position: 'inside' | 'before' | 'after' = 'before';
                        if (isExpanded && (y / height) > 0.5) {
                            position = 'inside';
                        } else {
                            position = (y / height) < 0.5 ? 'before' : 'after';
                        }
                        const allowed = this.config.allowDrop(sourceId, targetId, position);
                        this.clearDragHighlights();
                        if (allowed) {
                            if (position === 'inside') targetRow.classList.add('drop-inside');
                            else if (position === 'before') targetRow.classList.add('drop-before');
                            else targetRow.classList.add('drop-after');
                        } else {
                            if (position === 'inside') targetRow.classList.add('drop-inside-disallowed');
                            else if (position === 'before') targetRow.classList.add('drop-before-disallowed');
                            else targetRow.classList.add('drop-after-disallowed');
                        }
                    }
                }
            } else {
                this.clearDragHighlights();
            }
        } else {
            if (this.longPressTimer !== null) {
                const touch = e.touches[0];
                const dx = touch.clientX - this.touchStartX;
                const dy = touch.clientY - this.touchStartY;
                if (Math.sqrt(dx * dx + dy * dy) > 10) {
                    window.clearTimeout(this.longPressTimer);
                    this.longPressTimer = null;
                }
            }
        }
    };

    private touchEndHandler = (e: TouchEvent) => {
        if (this.longPressTimer !== null) {
            window.clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }

        if (this.isDraggingTouch && this.dragState) {
            e.preventDefault();
            const touch = e.changedTouches[0];
            const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetRow = targetElement?.closest('.item-row') as HTMLElement;
            if (targetRow) {
                const targetId = targetRow.dataset.id;
                const sourceId = this.dragState.id;
                if (targetId && sourceId && sourceId !== targetId) {
                    if (targetId === FlatTreeManager.PLACEHOLDER_ID) {
                        const allowed = this.config.allowDrop(sourceId, targetId, 'before');
                        if (allowed) {
                            const srcInfo = this.manager.findParentAndIndex(sourceId);
                            if (srcInfo) {
                                const parent = srcInfo.parent;
                                const idx = srcInfo.index;
                                const node = parent.children[idx];
                                parent.children.splice(idx, 1);
                                parent.children.push(node);
                                this.manager.onDataChange?.();
                            }
                        } else {
                            alert('不允许放置到此位置');
                        }
                        this.clearDragHighlights();
                        if (this.dragState.sourceElement) {
                            this.dragState.sourceElement.classList.remove('dragging');
                        }
                        this.dragState = null;
                        this.isDraggingTouch = false;
                        document.removeEventListener('touchmove', this.preventScroll);
                        return;
                    }

                    let position: 'inside' | 'before' | 'after' = 'before';
                    if (targetRow.classList.contains('drop-inside') || targetRow.classList.contains('drop-inside-disallowed')) {
                        position = 'inside';
                    } else if (targetRow.classList.contains('drop-before') || targetRow.classList.contains('drop-before-disallowed')) {
                        position = 'before';
                    } else if (targetRow.classList.contains('drop-after') || targetRow.classList.contains('drop-after-disallowed')) {
                        position = 'after';
                    } else {
                        const rect = targetRow.getBoundingClientRect();
                        const y = touch.clientY - rect.top;
                        const height = rect.height;
                        const targetNode = this.manager.findNode(targetId);
                        const isFolderTarget = targetNode && isFolder(targetNode);
                        const isExpanded = isFolderTarget && this.expandedFolders.has(targetId);
                        if (isExpanded && (y / height) > 0.5) position = 'inside';
                        else position = (y / height) < 0.5 ? 'before' : 'after';
                    }

                    const allowed = this.config.allowDrop(sourceId, targetId, position);
                    if (allowed) {
                        let success = false;
                        if (position === 'inside') {
                            success = this.config.onMove(sourceId, targetId, 'inside');
                        } else {
                            const srcInfo = this.manager.findParentAndIndex(sourceId);
                            const tgtInfo = this.manager.findParentAndIndex(targetId);
                            if (srcInfo && tgtInfo && srcInfo.parent === tgtInfo.parent) {
                                success = this.config.onReorder(sourceId, targetId, position);
                            } else {
                                success = this.config.onMove(sourceId, targetId, position);
                            }
                        }
                        if (success) {
                            this.manager.moveNode(sourceId, targetId, position);
                        } else {
                            alert('移动操作被禁止或失败');
                        }
                    } else {
                        alert('不允许放置到此位置');
                    }
                }
            }

            this.clearDragHighlights();
            if (this.dragState.sourceElement) {
                this.dragState.sourceElement.classList.remove('dragging');
            }
            this.dragState = null;
            this.isDraggingTouch = false;
            document.removeEventListener('touchmove', this.preventScroll);
        }
    };

    private preventScroll = (e: TouchEvent) => {
        e.preventDefault();
    };

    private clearDropTarget(row: HTMLElement): void {
        row.classList.remove(
            'drop-before', 'drop-after', 'drop-inside',
            'drop-before-disallowed', 'drop-after-disallowed', 'drop-inside-disallowed'
        );
    }

    private clearDragHighlights(): void {
        document.querySelectorAll('.item-row.drop-before, .item-row.drop-after, .item-row.drop-inside, .item-row.drop-before-disallowed, .item-row.drop-after-disallowed, .item-row.drop-inside-disallowed')
            .forEach(el => el.classList.remove(
                'drop-before', 'drop-after', 'drop-inside',
                'drop-before-disallowed', 'drop-after-disallowed', 'drop-inside-disallowed'
            ));
    }

    // ---- 操作 ----
    private startRenameItem(id: string): void {
        const node = this.manager.findNode(id);
        if (!node || isFolder(node)) return;
        const row = this.rowsContainer.querySelector(`.item-row[data-id="${id}"]`);
        if (!row) return;
        const nameEl = row.querySelector('.cell-name .name-text') as HTMLElement;
        if (!nameEl) return;
        const currentName = node.name;
        const input = document.createElement('input');
        input.className = 'name-input';
        input.value = currentName;
        input.dataset.id = id;
        nameEl.replaceWith(input);
        input.focus();
        input.select();

        const finish = () => {
            const newName = input.value.trim();
            if (newName && newName !== currentName) {
                this.manager.renameNode(id, newName);
                this.config.onRename(id, newName);
            } else {
                this.renderList();
            }
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { input.blur(); } else if (e.key === 'Escape') {
                input.value = currentName;
                input.blur();
            }
        });
    }

    private deleteItem(id: string): void {
        const node = this.manager.findNode(id);
        if (!node || isFolder(node)) return;
        if (!confirm(`确定删除「${node.name}」吗？`)) return;
        this.manager.deleteNode(id);
        this.config.onDelete(id);
    }

    private startRenameFolder(id: string): void {
        const node = this.manager.findNode(id);
        if (!node || !isFolder(node)) return;
        const newName = prompt('重命名文件夹', node.name);
        if (newName && newName.trim() !== '') {
            this.manager.renameNode(id, newName.trim());
            this.config.onRename(id, newName.trim());
        }
    }

    private deleteFolder(id: string): void {
        const node = this.manager.findNode(id);
        if (!node || !isFolder(node)) return;
        if (!confirm(`确定删除文件夹「${node.name}」及其所有内容吗？`)) return;
        this.manager.deleteNode(id);
        this.config.onDelete(id);
    }

    private addSubfolder(id: string): void {
        const parent = this.manager.findNode(id);
        if (!parent || !isFolder(parent)) return;
        const name = prompt('输入子文件夹名称');
        if (name && name.trim() !== '') {
            this.manager.addNode(id, { type: 'folder', name: name.trim(), children: [] });
            this.expandedFolders.add(id);
        }
    }

    private bindAddButtons(): void {
        this.addFolderBtn.addEventListener('click', () => {
            const name = prompt('输入文件夹名称');
            if (name && name.trim() !== '') {
                const newNode = this.manager.addNode('root', { type: 'folder', name: name.trim(), children: [] });
                this.expandedFolders.add(newNode.id);
            }
        });
        this.addItemBtn.addEventListener('click', () => {
            this.onAddItem('root');
        });
    }

    protected onAddItem(parentId: string): void {
        const name = prompt('输入名称');
        if (!name || name.trim() === '') return;
        const content = prompt('输入内容') || '';
        const extra = prompt('输入额外信息') || '';
        this.manager.addNode(parentId, {
            type: 'item',
            name: name.trim(),
            content: content,
            extra: extra
        } as any);
    }

    private updateBadge(): void {
        const count = this.manager.getRoot().children.length;
        this.badgeEl.textContent = count.toString();
    }

    public refresh(): void {
        this.renderList();
        this.updateBadge();
    }

    public getDataManager(): DataManager {
        return this.manager;
    }

    public destroy(): void {
        document.removeEventListener('mousemove', this._mouseMove);
        document.removeEventListener('mouseup', this._mouseUp);
        document.removeEventListener('touchmove', this._touchMove);
        document.removeEventListener('touchend', this._touchEnd);
        document.removeEventListener('touchmove', this.preventScroll);
    }

    private _mouseMove: any = null;
    private _mouseUp: any = null;
    private _touchMove: any = null;
    private _touchEnd: any = null;
}
/**
 * 使容器支持通过手柄拖拽调整高度
 * @param container  要调整高度的元素
 * @param handle     拖拽手柄元素
 * @param minHeight  最小高度（px）
 * @param maxHeight  最大高度（px），可传入动态值如 window.innerHeight * 0.7
 * @param onResize   可选回调，在高度变化时触发
 */
export function makeResizable(
    container: HTMLElement,
    handle: HTMLElement, topMode: boolean,
    // minHeight: number = 60,
    // maxHeight: number = window.innerHeight * 0.7,
    onResize?: (newHeight: number) => void
): void {
    let isResizing = false;

    const startResize = (startY: number) => {
        isResizing = true;
        handle.classList.add('active');

        const onMove = (clientY: number) => {
            if (!isResizing) return;
            const rect = container.getBoundingClientRect();
            const bottomOffset = window.innerHeight - rect.bottom;
            // let newHeight = window.innerHeight - clientY - bottomOffset;
            const newHeight = topMode ? window.innerHeight - clientY - bottomOffset : clientY - rect.top + (container.offsetHeight - rect.height);
            if (newHeight < 60) return;
            container.style.height = newHeight + 'px';
            onResize?.(newHeight);
        };

        const onEnd = () => {
            isResizing = false;
            handle.classList.remove('active');
            document.removeEventListener('mousemove', mouseMove);
            document.removeEventListener('mouseup', mouseUp);
            document.removeEventListener('touchmove', touchMove);
            document.removeEventListener('touchend', touchEnd);
            document.body.style.userSelect = '';
        };

        const mouseMove = (e: MouseEvent) => onMove(e.clientY);
        const mouseUp = () => onEnd();
        const touchMove = (e: TouchEvent) => {
            e.preventDefault();
            onMove(e.touches[0].clientY);
        };
        const touchEnd = () => onEnd();

        document.addEventListener('mousemove', mouseMove);
        document.addEventListener('mouseup', mouseUp);
        document.addEventListener('touchmove', touchMove, { passive: false });
        document.addEventListener('touchend', touchEnd);
        document.body.style.userSelect = 'none';
    };

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startResize(e.clientY);
    });
    handle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        startResize(touch.clientY);
    }, { passive: false });
}