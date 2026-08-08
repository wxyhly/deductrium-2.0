import { LangMgr } from "./lang.js";

export interface ListNode {
    uuid: number;
    name: string;
    [key: string]: any;
}
interface FolderListNode extends ListNode {
    children: ListNode[];
    active?: boolean;
}

function isFolder(node: ListNode): node is FolderListNode {
    return !!node.children;
}

export const ROOT_ID = -1;

export class TreeListViewer<T extends ListNode> {
    private container: HTMLElement;
    private rowsContainer: HTMLElement;
    private badgeEl: HTMLElement;
    private openMenuId: string | null = null;
    private dragState: { type: 'node' | 'item'; uuid: number; sourceElement: HTMLElement } | null = null;
    private expandedFolders: Set<number> = new Set();

    // 长按拖拽相关
    private longPressTimer: number | null = null;
    private touchStartX: number = 0;
    private touchStartY: number = 0;
    private isDraggingTouch: boolean = false;
    private longPressDelay: number = 300;

    public allowDrop: (sourceId: number, targetId: number, position: 'inside' | 'before' | 'after') => boolean = () => true;
    public onAfterChange: () => void = () => { };
    public onRename: (item: T, newName: string | null) => boolean = () => true;
    public onDelete: (item: T) => boolean = () => true;
    wideToggleFolderRange: (item: T) => boolean = () => true;
    renderName: (item: T) => string = i => i.name;
    // renderFolderNameCell: (item: T, nameCell: HTMLDivElement, isExpanded: boolean) => void = i => { };
    renderContent: (item: T, dom: HTMLSpanElement) => void = i => { };
    // renderFolderContent: (item: T, dom: HTMLSpanElement) => void = i => { };
    renderExtra: (item: T) => Node = i => document.createTextNode(i.name);
    folderMenuItems: Array<{ label: string; icon?: string; handler: (id: number) => void; danger?: boolean }> = [];
    itemMenuItems: Array<{ label: string; icon?: string; handler: (id: number) => void; danger?: boolean }> = [];
    initialHeight = '30vh';
    onFolderActiveCancel: () => void = () => { };
    public data: T[];

    private static PLACEHOLDER_ID = -2;
    private idCounter = 1;

    constructor(data: T[], container: HTMLElement, initialHeight?: string) {
        this.container = container;
        this.rowsContainer = this.container.querySelector('.rows-container')!;
        this.badgeEl = this.container.querySelector('.badge')!;
        if (initialHeight) this.initialHeight = initialHeight;
        this.container.style.height = this.initialHeight;
        this.createResizeHandle();
        document.addEventListener('click', this.globalClickHandler);
        this.data = data;
        this.expandAll();
        this.renderList();
        this.bindRowEvents();
    }

    private createResizeHandle(): void {
        const existing = this.container.querySelector('.resize-handle');
        if (existing) existing.remove();

        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        this.container.appendChild(handle);
        makeResizable(this.container, handle, false);
    }

    private expandAll(): void {
        const collect = (node: ListNode) => {
            if (isFolder(node)) {
                this.expandedFolders.add(node.uuid);
                for (const child of node.children) collect(child);
            }
        };
        for (const child of this.data) {
            collect(child);
        }
    }
    public refresh() { this.renderList(); }
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
        this.bindRowEvents();
        this.updateBadge();
    }

    private buildPlaceholderRow(): HTMLElement {
        const row = document.createElement('div');
        row.className = 'item-row drop-placeholder';
        row.dataset.uuid = String(TreeListViewer.PLACEHOLDER_ID);
        row.dataset.type = 'placeholder';
        row.style.setProperty('--depth', '0');
        for (let i = 0; i < 4; i++) {
            const cell = document.createElement('div');
            cell.style.display = 'none';
            row.appendChild(cell);
        }
        return row;
    }

    private flattenVisible(): Array<{ node: T; depth: number }> {
        const result: Array<{ node: T; depth: number }> = [];
        let hasActiveFolder = false;
        let hasFolder = false;
        (this.findActiveAndParents() || []).forEach(e => { if (!e.uuid) e.uuid = this.idCounter++; this.expandedFolders.add(e.uuid); });
        const traverse = (node: T, depth: number) => {
            result.push({ node, depth });
            if (!node.uuid) node.uuid = this.idCounter++;
            if (isFolder(node)) {
                hasFolder = true;
                if (this.expandedFolders.has(node.uuid)) {
                    for (const child of node.children) {
                        traverse(child as T, depth + 1);
                    }
                    if (node.active) {
                        hasActiveFolder = true;
                        result.push({ node: { uuid: 0, name: "", parentId: node.uuid } as any, depth: depth + 1 });
                    }
                }
            }
        };
        for (const child of this.data) {
            traverse(child, 0);
        }
        if (hasFolder && !hasActiveFolder) {
            result.push({ node: { uuid: 0, name: "", parentId: ROOT_ID } as any, depth: 0 });
        }
        return result;
    }

    private buildRow(node: T, depth: number): HTMLElement {
        const isPlaceholder = node.uuid === 0 && node.name === "";
        const isFolderNode = isFolder(node);
        const id = node.uuid;
        const row = document.createElement('div');
        row.className = `item-row ${isFolderNode ? 'folder-row' : ''}`;
        row.dataset.uuid = String(id);
        row.dataset.type = node.type;
        row.style.setProperty('--depth', String(depth));
        row.draggable = true;

        // ---- 名称列 ----
        const nameCell = document.createElement('div');
        nameCell.className = 'cell-name';
        nameCell.dataset.uuid = isPlaceholder ? "" : String(id);
        nameCell.draggable = !isPlaceholder;

        const nameText = document.createElement('span');
        nameText.className = 'name-text';
        nameText.textContent = isPlaceholder ? "" : this.renderName(node);
        nameCell.appendChild(nameText);
        
        const indent = document.createElement('span');
        indent.className = 'row-indent';
        nameCell.appendChild(indent);

        row.appendChild(nameCell);

        // ---- 内容列 ----
        const contentCell = document.createElement('div');
        contentCell.className = `cell-content ${isFolderNode ? this.wideToggleFolderRange(node) ? 'wide-folder-bar' : 'short-folder-bar' : ''}`;
        contentCell.dataset.uuid = String(id);
        row.appendChild(contentCell);
        if (isPlaceholder) {
            row.classList.add("activePlaceholder");
            const parent = this.findNode((node as any)?.parentId);
            const parentName = parent ? `'${this.renderName(parent)}'` : LangMgr.text.rootList;
            contentCell.innerText = LangMgr.formalize.activePlaceholder(parentName);
            return row;
        }
        const contentNode = document.createElement("span");
        contentNode.classList.add("inner");
        contentCell.appendChild(contentNode);

        if (isFolderNode) {
            contentCell.dataset.isFolder = 'true';
            if (node.active) row.classList.add("active");
            const isExpanded = this.expandedFolders.has(id);
            const toggle = document.createElement('span');
            toggle.className = `toggle-icon ${isExpanded ? 'expanded' : ''}`;
            toggle.dataset.uuid = String(id);
            toggle.textContent = '▶';
            contentCell.prepend(toggle);
        }
        this.renderContent(node, contentNode);

        // ---- 额外列 ----
        const extraCell = document.createElement('div');
        extraCell.className = 'cell-extra';
        extraCell.dataset.uuid = String(id);

        const extraContainer = document.createElement('span');
        extraContainer.className = 'extra-text';
        extraContainer.appendChild(this.renderExtra(node));
        extraCell.appendChild(extraContainer);
        row.appendChild(extraCell);

        // ---- 操作列 ----
        const actionsCell = document.createElement('div');
        actionsCell.className = 'cell-actions';
        actionsCell.dataset.uuid = String(id);

        const trigger = document.createElement('button');
        trigger.className = 'dropdown-trigger';
        trigger.dataset.uuid = String(id);
        trigger.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`;
        actionsCell.appendChild(trigger);

        const menu = document.createElement('div');
        menu.className = 'dropdown-menu';
        menu.dataset.uuid = String(id);
        menu.innerHTML = this.buildMenuHTML(node);
        actionsCell.appendChild(menu);

        row.appendChild(actionsCell);

        return row;
    }

    private buildMenuHTML(node: T): string {
        const id = node.uuid;
        let html = '';
        if (isFolder(node)) {
            // html += `<button class="menu-item" data-action="add-subfolder" data-uuid="${id}"><span class="icon">📁</span> 新建子文件夹</button>`;
            html += `<button class="menu-item" data-action="rename-folder" data-uuid="${id}"><span class="icon">✏️</span> 重命名</button>`;
            for (const mi of this.folderMenuItems || []) {
                const danger = mi.danger ? 'danger' : '';
                const icon = mi.icon || '•';
                html += `<button class="menu-item ${danger}" data-action="custom-folder" data-custom-index="${this.folderMenuItems?.indexOf(mi)}" data-uuid="${id}"><span class="icon">${icon}</span> ${mi.label}</button>`;
            }
            html += `<div class="menu-divider"></div>`;
            html += `<button class="menu-item danger" data-action="delete-folder" data-uuid="${id}"><span class="icon">🗑️</span> 删除</button>`;
        } else {
            html += `<button class="menu-item" data-action="rename" data-uuid="${id}"><span class="icon">✏️</span> 重命名</button>`;
            for (const mi of this.itemMenuItems || []) {
                const danger = mi.danger ? 'danger' : '';
                const icon = mi.icon || '•';
                html += `<button class="menu-item ${danger}" data-action="custom-item" data-custom-index="${this.itemMenuItems?.indexOf(mi)}" data-uuid="${id}"><span class="icon">${icon}</span> ${mi.label}</button>`;
            }
            html += `<div class="menu-divider"></div>`;
            html += `<button class="menu-item danger" data-action="delete" data-uuid="${id}"><span class="icon">🗑️</span> 删除</button>`;
        }
        return html;
    }

    private bindRowEvents(): void {
        // 展开/折叠
        this.rowsContainer.querySelectorAll('.folder-row .cell-name,.folder-row .wide-folder-bar,.folder-row .short-folder-bar .toggle-icon').forEach(el => {
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
        this.rowsContainer.querySelectorAll('.item-row').forEach(row => {
            if ((row as HTMLElement).dataset.uuid === String(TreeListViewer.PLACEHOLDER_ID)) return;
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

    private findNode(id: number): T | null {
        const search = (nodes: T[]): T | null => {
            for (const node of nodes) {
                if (node.uuid === id) return node;
                if (isFolder(node)) {
                    const found = search(node.children as T[]);
                    if (found) return found;
                }
            }
            return null;
        };
        return search(this.data);
    }
    findActiveAndParents(): T[] | null {
        const search = (nodes: T[]): T[] | null => {
            for (const node of nodes) {
                if (isFolder(node)) {
                    if (node.active) return [node];
                    const res = search(node.children as T[]);
                    if (res) { res.push(node); return res; }
                }
            }
            return null;
        };
        return search(this.data);
    }
    findParentAndIndex(id: number): { parent: T[]; index: number } | null {
        const search = (nodes: T[]): { parent: T[]; index: number } | null => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (node.uuid === id) {
                    return { parent: nodes, index: i };
                }
                if (isFolder(node)) {
                    const res = search(node.children as T[]);
                    if (res) return res;
                }
            }
            return null;
        };
        return search(this.data);
    }
    moveNode(sourceId: number, targetId: number, position: 'inside' | 'before' | 'after'): boolean {
        if (sourceId === targetId || sourceId === ROOT_ID) return false;
        const srcInfo = this.findParentAndIndex(sourceId);
        if (!srcInfo) return false;
        const srcParent = srcInfo.parent;
        const srcIdx = srcInfo.index;
        const srcNode = srcParent[srcIdx];

        if (isFolder(srcNode)) {
            const isDescendant = (folder: FolderListNode, id: number): boolean => {
                for (const child of folder.children) {
                    if (child.uuid === id) return true;
                    if (isFolder(child) && isDescendant(child, id)) return true;
                }
                return false;
            };
            if (isFolder(srcNode) && isDescendant(srcNode, targetId)) return false;
        }

        const targetNode = this.findNode(targetId);
        if (!targetNode) return false;

        let targetParent: ListNode[] | null = null;
        let insertIdx: number = -1;

        if (position === 'inside') {
            if (!isFolder(targetNode)) return false;
            targetParent = targetNode.children;
            insertIdx = targetParent.length;
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

        srcParent.splice(srcIdx, 1);
        targetParent.splice(insertIdx, 0, srcNode);
        return true;
    }
    // ---- 折叠切换 ----
    private toggleHandler = (e: Event) => {
        const target = e.currentTarget as HTMLElement;
        let id = Number(target.dataset.uuid);
        if (!id) {
            const row = target.closest('.item-row') as HTMLElement;
            if (row) id = Number(row.dataset.uuid);
        }
        if (!id) return;
        const node = this.findNode(id);
        if (!node || !isFolder(node)) return;

        if (this.expandedFolders.has(id)) {
            let changed = false;
            const clearActive = (folder: FolderListNode) => {
                if (folder.active) { changed = true; folder.active = false; }
                for (const child of folder.children) {
                    if (isFolder(child)) clearActive(child);
                }
            };
            clearActive(node);
            this.expandedFolders.delete(id);
            if (changed) this.onFolderActiveCancel();
        } else {
            this.expandedFolders.add(id);
        }
        this.renderList();
    };
    private globalClickHandler = (e: Event) => {
        const target = e.target as HTMLElement;
        // 如果点击的是菜单内部或触发器，不关闭
        if (target.closest('.dropdown-menu') || target.closest('.dropdown-trigger')) {
            return;
        }
        this.closeAllMenus();
    };
    // ---- 菜单 ----
    private menuTriggerHandler = (e: Event) => {
        e.stopPropagation();
        const btn = e.currentTarget as HTMLElement;
        const id = btn.dataset.uuid;
        if (!id) return;

        // 从 body 中查找已存在的菜单，若没有则从原位置移动
        let menu = this.rowsContainer.querySelector(`.dropdown-menu[data-uuid="${id}"]`) as HTMLElement;

        // 切换菜单开关
        if (this.openMenuId === id) {
            this.closeAllMenus();
            return;
        }
        this.closeAllMenus();

        // 计算菜单位置
        const rect = btn.getBoundingClientRect();
        const menuWidth = 140; // 与 CSS min-width 一致
        let top = rect.bottom + 4;

        // 先临时显示菜单以测量实际高度
        menu.style.position = 'fixed';
        menu.style.top = top + 'px';
        menu.style.width = menuWidth + 'px';
        menu.style.right = '8px';
        menu.style.opacity = '0'; // 透明，避免闪烁
        menu.classList.add('open');

        // 获取实际高度
        const actualHeight = menu.offsetHeight;
        // 如果超出底部，则向上展开
        if (top + actualHeight > window.innerHeight) {
            top = rect.top - actualHeight - 4;
            if (top < 0) top = 4; // 防止超出顶部
        }

        menu.style.top = top + 'px';

        menu.style.opacity = '1';

        this.openMenuId = id;
    };

    private menuItemHandler = (e: Event) => {
        const target = e.currentTarget as HTMLElement;
        const action = target.dataset.action;
        const id = Number(target.dataset.uuid);
        if (!id) return;
        e.stopPropagation();
        this.closeAllMenus();

        if (action === 'rename') {
            this.startRenameItem(id);
        } else if (action === 'rename-folder') {
            this.startRenameFolder(id);
        } else if (action === 'custom-item') {
            const idx = parseInt(target.dataset.customIndex || '-1', 10);
            const menu = this.itemMenuItems[idx];
            if (menu) menu.handler(id);
        } else if (action === 'delete') {
            this.onDelete(this.findNode(id)!);
            this.refresh();
        } else if (action === 'custom-folder') {
            const idx = parseInt(target.dataset.customIndex || '-1', 10);
            const menu = this.folderMenuItems[idx];
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
        const id = Number(row.dataset.uuid);
        if (!id || id === TreeListViewer.PLACEHOLDER_ID) {
            e.preventDefault();
            return;
        }
        this.dragState = {
            type: 'node',
            uuid: id,
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
        const targetId = Number(targetRow.dataset.uuid);
        if (!targetId) return;
        const sourceId = this.dragState?.uuid;
        if (!sourceId || sourceId === targetId) {
            this.clearDropTarget(targetRow);
            return;
        }

        // 占位符
        if (targetId === TreeListViewer.PLACEHOLDER_ID) {
            const allowed = this.allowDrop(sourceId, targetId, 'before');
            this.clearDropTarget(targetRow);
            if (allowed) {
                targetRow.classList.add('drop-before');
                e.dataTransfer!.dropEffect = 'move';
            } else {
                targetRow.classList.add('drop-before-disallowed');
                e.dataTransfer!.dropEffect = 'none';
            }
            return;
        }

        const rect = targetRow.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const height = rect.height;

        const targetNode = this.findNode(targetId);
        const isFolderTarget = targetNode && isFolder(targetNode);
        const isExpanded = isFolderTarget && this.expandedFolders.has(targetId);

        let position: 'inside' | 'before' | 'after' = 'before';
        if (isExpanded && (y / height) > 0.5) {
            position = 'inside';
        } else {
            position = (y / height) < 0.5 ? 'before' : 'after';
        }

        const allowed = this.allowDrop(sourceId, targetId, position);
        this.clearDropTarget(targetRow);

        if (allowed) {
            e.dataTransfer!.dropEffect = 'move';
            if (position === 'inside') targetRow.classList.add('drop-inside');
            else if (position === 'before') targetRow.classList.add('drop-before');
            else targetRow.classList.add('drop-after');
        } else {
            e.dataTransfer!.dropEffect = 'none';
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

        const targetId = Number(targetRow.dataset.uuid);
        if (!targetId) return;
        const sourceId = this.dragState?.uuid;
        if (!sourceId || sourceId === targetId) {
            this.dragEndHandler(e);
            return;
        }

        // 占位符
        if (targetId === TreeListViewer.PLACEHOLDER_ID) {
            const allowed = this.allowDrop(sourceId, targetId, 'before');
            if (!allowed) {
                this.dragEndHandler(e);
                return;
            }
            const srcInfo = this.findParentAndIndex(sourceId);
            if (srcInfo) {
                const parent = srcInfo.parent;
                const idx = srcInfo.index;
                const node = parent[idx];
                parent.splice(idx, 1);
                parent.push(node);
                this.onAfterChange();
                this.renderList();
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
            const targetNode = this.findNode(targetId);
            const isFolderTarget = targetNode && isFolder(targetNode);
            const isExpanded = isFolderTarget && this.expandedFolders.has(targetId);
            if (isExpanded && (y / height) > 0.5) position = 'inside';
            else position = (y / height) < 0.5 ? 'before' : 'after';
        }

        const allowed = this.allowDrop(sourceId, targetId, position);
        if (!allowed) {
            this.dragEndHandler(e);
            return;
        }
        let success = this.allowDrop(sourceId, targetId, position);
        if (success) {
            this.moveNode(sourceId, targetId, position);
            this.onAfterChange();
            this.renderList();
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
        const id = Number(row.dataset.uuid);
        if (!id || id === TreeListViewer.PLACEHOLDER_ID) return;

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
                uuid: id,
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
                const targetId = Number(targetRow.dataset.uuid);
                if (targetId) {
                    const sourceId = this.dragState.uuid;
                    if (sourceId && sourceId !== targetId) {
                        if (targetId === TreeListViewer.PLACEHOLDER_ID) {
                            const allowed = this.allowDrop(sourceId, targetId, 'before');
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
                        const targetNode = this.findNode(targetId);
                        const isFolderTarget = targetNode && isFolder(targetNode);
                        const isExpanded = isFolderTarget && this.expandedFolders.has(targetId);
                        let position: 'inside' | 'before' | 'after' = 'before';
                        if (isExpanded && (y / height) > 0.5) {
                            position = 'inside';
                        } else {
                            position = (y / height) < 0.5 ? 'before' : 'after';
                        }
                        const allowed = this.allowDrop(sourceId, targetId, position);
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
                const targetId = Number(targetRow.dataset.uuid);
                const sourceId = this.dragState.uuid;
                if (targetId && sourceId && sourceId !== targetId) {
                    if (targetId === TreeListViewer.PLACEHOLDER_ID) {
                        const allowed = this.allowDrop(sourceId, targetId, 'before');
                        if (allowed) {
                            const srcInfo = this.findParentAndIndex(sourceId);
                            if (srcInfo) {
                                const parent = srcInfo.parent;
                                const idx = srcInfo.index;
                                const node = parent[idx];
                                parent.splice(idx, 1);
                                parent.push(node);
                                this.onAfterChange();
                                this.renderList();
                            }
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
                        const targetNode = this.findNode(targetId);
                        const isFolderTarget = targetNode && isFolder(targetNode);
                        const isExpanded = isFolderTarget && this.expandedFolders.has(targetId);
                        if (isExpanded && (y / height) > 0.5) position = 'inside';
                        else position = (y / height) < 0.5 ? 'before' : 'after';
                    }

                    const allowed = this.allowDrop(sourceId, targetId, position);
                    if (allowed) {
                        this.moveNode(sourceId, targetId, position);
                        this.onAfterChange();
                        this.renderList();
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
    private startRenameItem(id: number): void {
        const node = this.findNode(id);
        if (!node || isFolder(node)) return;
        const row = this.rowsContainer.querySelector(`.item-row[data-uuid="${id}"]`);
        if (!row) return;
        const nameEl = row.querySelector('.cell-name .name-text') as HTMLElement;
        if (!nameEl) return;
        const currentName = node.name;
        const input = document.createElement('input');
        input.className = 'name-input';
        input.value = currentName;
        input.dataset.uuid = String(id);
        nameEl.replaceWith(input);
        input.focus();
        input.select();

        const finish = () => {
            const newName = input.value.trim();
            if (newName !== currentName && this.onRename(node, newName)) {
                this.renameNode(id, newName);
                this.onAfterChange();
            }
            this.renderList();
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { input.blur(); } else if (e.key === 'Escape') {
                input.value = currentName;
                input.blur();
            }
        });
    }
    private startRenameFolder(id: number): void {
        const node = this.findNode(id);
        if (!node || !isFolder(node)) return;
        this.onRename(node, null);
    }

    renameNode(id: number, newName: string): boolean {
        const node = this.findNode(id);
        if (!node) return false;
        node.name = newName;
        return true;
    }

    private updateBadge(): void {
        const count = this.data.length;
        this.badgeEl.textContent = count.toString();
    }

    public destroy(): void {
        document.removeEventListener('mousemove', this._mouseMove);
        document.removeEventListener('mouseup', this._mouseUp);
        document.removeEventListener('touchmove', this._touchMove);
        document.removeEventListener('touchend', this._touchEnd);
        document.removeEventListener('touchmove', this.preventScroll);
        document.removeEventListener('click', this.globalClickHandler);
    }

    private _mouseMove: any = null;
    private _mouseUp: any = null;
    private _touchMove: any = null;
    private _touchEnd: any = null;
}

export function makeResizable(
    container: HTMLElement,
    dragHandle: HTMLElement,
    topMode: boolean,
    onResize?: (newHeight: number) => void,
    defaultHeight: string = '300px'
): void {
    const toggleHandle = container.querySelector(".card-header h2");
    let isResizing = false;
    let isCollapsed = false;
    let expandedHeight: string | null = null;
    const collapsedHeight = 50;

    // ----- 拖拽逻辑 -----
    const startResize = (startY: number) => {
        isResizing = true;
        dragHandle.classList.add('active');
        container.classList.remove('smooth-height');

        const onMove = (clientY: number) => {
            if (!isResizing) return;
            if (isCollapsed) isCollapsed = false;
            const rect = container.getBoundingClientRect();
            let newHeight: number;
            if (topMode) {
                // 从顶部拖拽：高度 = 视口高度 - 鼠标Y - 底部偏移
                const bottomOffset = window.innerHeight - rect.bottom;
                newHeight = window.innerHeight - clientY - bottomOffset;
            } else {
                // 从底部拖拽：高度 = 鼠标Y - 容器顶部 + 当前高度偏移
                newHeight = clientY - rect.top + (container.offsetHeight - rect.height);
            }
            const minHeight = 60;
            if (newHeight < minHeight) return;
            container.style.height = newHeight + 'px';
            // 更新存储的展开高度（因为正在拖拽，保存当前高度）
            expandedHeight = newHeight + 'px';
            onResize?.(newHeight);
        };

        const onEnd = () => {
            isResizing = false;
            dragHandle.classList.remove('active');
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

    // 绑定拖拽事件
    dragHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startResize(e.clientY);
    });
    dragHandle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        startResize(touch.clientY);
    }, { passive: false });

    // ----- 展开/折叠逻辑 -----
    const toggleCollapse = () => {
        container.classList.add('smooth-height');
        if (isCollapsed) {
            // 展开
            const targetHeight = expandedHeight || defaultHeight;
            container.style.height = targetHeight;
            isCollapsed = false;
        } else {
            // 收起：保存当前高度
            expandedHeight = container.style.height || defaultHeight;
            container.style.height = collapsedHeight + 'px';
            isCollapsed = true;
        }
        // 触发回调，传递当前高度
        const currentHeight = parseInt(container.style.height, 10);
        if (!isNaN(currentHeight)) onResize?.(currentHeight);
    };

    // 绑定点击展开/折叠事件
    if (toggleHandle) {
        toggleHandle.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            // 如果点击的是按钮、下拉菜单触发器或操作区域，不触发展开/收起
            if (target.closest('.btn-sm, .dropdown-trigger, .actions, .dropdown-menu')) {
                return;
            }
            toggleCollapse();
        });
    }
    const onTransitionEnd = () => {
        container.classList.remove('smooth-height');
        container.removeEventListener('transitionend', onTransitionEnd);
    };
    container.addEventListener('transitionend', onTransitionEnd);
}