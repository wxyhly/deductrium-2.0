import { LangMgr } from "./lang.js";
function isFolder(node) {
    return !!node.children;
}
export const ROOT_ID = -1;
export class TreeListViewer {
    container;
    rowsContainer;
    openMenuId = null;
    dragState = null;
    mouseDrag = null;
    idCounter = 1;
    expandedFolders = new Set();
    // 长按拖拽相关
    longPressTimer = null;
    touchStartX = 0;
    touchStartY = 0;
    isDraggingTouch = false;
    longPressDelay = 300;
    allowDrop = () => true;
    onAfterChange = () => { };
    onAfterRender = () => { };
    onRename = () => true;
    onMenuAction = () => { };
    // 点击整行回调（d命令选择命题/规则时用）；参数为对应的逻辑对象
    onRowClick = () => { };
    wideToggleFolderRange = () => true;
    renderName = i => i.name;
    // renderFolderNameCell: (item: T, nameCell: HTMLDivElement, isExpanded: boolean) => void = i => { };
    renderContent = i => { };
    // renderFolderContent: (item: T, dom: HTMLSpanElement) => void = i => { };
    renderExtra = i => document.createTextNode(i.name);
    folderMenuItems = [];
    menuItems = () => [];
    initialHeight = '30vh';
    onFolderActiveCancel = () => { };
    data;
    // 是否显示"默认在...中操作"占位行（推理表用 true；只读列表如类型层系统表设 false）
    showActivePlaceholder = true;
    static PLACEHOLDER_ID = -2;
    constructor(data, container, initialHeight) {
        this.container = container;
        this.rowsContainer = this.container.querySelector('.rows-container');
        if (initialHeight)
            this.initialHeight = initialHeight;
        this.container.style.height = this.initialHeight;
        this.createResizeHandle();
        document.addEventListener('click', this.globalClickHandler);
        this.data = data;
        this.expandAll();
        this.renderList();
        this.bindRowEvents();
    }
    createResizeHandle() {
        const existing = this.container.querySelector('.resize-handle');
        if (existing)
            existing.remove();
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        this.container.appendChild(handle);
        makeResizable(this.container, handle, false);
    }
    expandAll() {
        const collect = (node) => {
            if (isFolder(node)) {
                this.expandedFolders.add(node.uuid);
                for (const child of node.children)
                    collect(child);
            }
        };
        for (const child of this.data) {
            collect(child);
        }
    }
    refresh() { this.renderList(); }
    // 重新绑定数据源（用于切换推理表sheet时）
    setData(data) {
        this.data = data;
        this.refresh();
    }
    renderList() {
        if (this.mouseDrag)
            this.mouseCancelHandler();
        const flat = this.flattenVisible();
        this.rowsContainer.innerHTML = '';
        if (flat.length === 0) {
            this.onAfterRender?.();
            return;
        }
        const fragment = document.createDocumentFragment();
        for (const { node, depth } of flat) {
            const row = this.buildRow(node, depth);
            fragment.appendChild(row);
        }
        const placeholder = this.buildPlaceholderRow();
        fragment.appendChild(placeholder);
        this.rowsContainer.appendChild(fragment);
        this.bindRowEvents();
        this.onAfterRender?.();
    }
    buildPlaceholderRow() {
        const row = document.createElement('div');
        row.className = 'item-row drop-placeholder';
        row.dataset.uuid = String(TreeListViewer.PLACEHOLDER_ID);
        row.style.setProperty('--depth', '0');
        for (let i = 0; i < 4; i++) {
            const cell = document.createElement('div');
            cell.style.display = 'none';
            row.appendChild(cell);
        }
        return row;
    }
    flattenVisible() {
        const result = [];
        let hasActiveFolder = false;
        let hasFolder = false;
        (this.findActiveAndParents() || []).forEach(e => { if (!e.uuid)
            e.uuid = this.idCounter++; this.expandedFolders.add(e.uuid); });
        const traverse = (node, depth) => {
            result.push({ node, depth });
            if (!node.uuid)
                node.uuid = this.idCounter++;
            if (isFolder(node)) {
                hasFolder = true;
                if (this.expandedFolders.has(node.uuid)) {
                    for (const child of node.children) {
                        traverse(child, depth + 1);
                    }
                    if (node.active) {
                        hasActiveFolder = true;
                        result.push({ node: { uuid: 0, name: "", parentId: node.uuid }, depth: depth + 1 });
                    }
                }
            }
        };
        for (const child of this.data) {
            traverse(child, 0);
        }
        if (this.showActivePlaceholder && hasFolder && !hasActiveFolder) {
            result.push({ node: { uuid: 0, name: "", parentId: ROOT_ID }, depth: 0 });
        }
        return result;
    }
    buildRow(node, depth) {
        const isPlaceholder = node.uuid === 0 && node.name === "";
        const isFolderNode = isFolder(node);
        const id = node.uuid;
        const row = document.createElement('div');
        row.className = `item-row ${isFolderNode ? 'folder-row' : ''}`;
        row.dataset.uuid = String(id);
        row.style.setProperty('--depth', String(depth));
        row.draggable = false;
        // ---- 名称列 ----
        const nameCell = document.createElement('div');
        nameCell.className = 'cell-name';
        nameCell.dataset.uuid = isPlaceholder ? "" : String(id);
        nameCell.draggable = false;
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
            const parent = this.findNode(node?.parentId);
            const parentName = parent ? `'${parent.name || this.renderName(parent)}'` : LangMgr.text.rootList;
            contentCell.innerText = LangMgr.formalize.activePlaceholder(parentName);
            return row;
        }
        const contentNode = document.createElement("span");
        contentNode.classList.add("inner");
        contentCell.appendChild(contentNode);
        if (isFolderNode) {
            contentCell.dataset.isFolder = 'true';
            if (node.active)
                row.classList.add("active");
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
    buildMenuHTML(node) {
        const id = node.uuid;
        let html = ``;
        const menus = this.menuItems(node);
        for (const mi of menus) {
            const danger = mi.danger ? 'danger' : '';
            const icon = mi.icon || '•';
            html += `<button class="menu-item ${danger}" data-action="${mi.action}" data-uuid="${id}"><span class="icon">${icon}</span> ${mi.label}</button>`;
        }
        return html;
    }
    bindRowEvents() {
        // 展开/折叠
        this.rowsContainer.querySelectorAll('.folder-row .cell-name,.folder-row .wide-folder-bar,.folder-row .short-folder-bar .toggle-icon').forEach(el => {
            el.removeEventListener('click', this.toggleHandler);
            el.addEventListener('click', this.toggleHandler);
        });
        // 菜单触发
        this.rowsContainer.querySelectorAll('.dropdown-trigger').forEach(btn => {
            btn.removeEventListener('click', this.menuTriggerHandler);
            btn.addEventListener('click', this.menuTriggerHandler);
        });
        // 菜单项
        this.rowsContainer.querySelectorAll('.menu-item').forEach(item => {
            item.removeEventListener('click', this.menuItemHandler);
            item.addEventListener('click', this.menuItemHandler);
        });
        // 拖拽（鼠标 + 触摸）
        this.rowsContainer.querySelectorAll('.item-row').forEach(row => {
            if (row.dataset.uuid === String(TreeListViewer.PLACEHOLDER_ID))
                return;
            // 点击整行（供外部回调，如d命令选择命题/规则）
            row.removeEventListener('click', this.rowClickHandler);
            row.addEventListener('click', this.rowClickHandler);
            // Mouse dragging leaves wheel scrolling to the browser.
            row.removeEventListener('pointerdown', this.mouseDownHandler);
            row.addEventListener('pointerdown', this.mouseDownHandler);
            // 触摸拖拽（长按触发）
            row.removeEventListener('touchstart', this.touchStartHandler);
            row.removeEventListener('touchmove', this.touchMoveHandler);
            row.removeEventListener('touchend', this.touchEndHandler);
            row.addEventListener('touchstart', this.touchStartHandler, { passive: false });
            row.addEventListener('touchmove', this.touchMoveHandler, { passive: false });
            row.addEventListener('touchend', this.touchEndHandler);
        });
    }
    findNode(id) {
        const search = (nodes) => {
            for (const node of nodes) {
                if (node.uuid === id)
                    return node;
                if (isFolder(node)) {
                    const found = search(node.children);
                    if (found)
                        return found;
                }
            }
            return null;
        };
        return search(this.data);
    }
    findActiveAndParents() {
        const search = (nodes) => {
            for (const node of nodes) {
                if (isFolder(node)) {
                    if (node.active)
                        return [node];
                    const res = search(node.children);
                    if (res) {
                        res.push(node);
                        return res;
                    }
                }
            }
            return null;
        };
        return search(this.data);
    }
    findParentAndIndex(id) {
        const search = (nodes) => {
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (node.uuid === id) {
                    return { parent: nodes, index: i };
                }
                if (isFolder(node)) {
                    const res = search(node.children);
                    if (res)
                        return res;
                }
            }
            return null;
        };
        return search(this.data);
    }
    deleteNode(id) {
        const info = this.findParentAndIndex(id);
        if (!info)
            return false;
        info.parent.splice(info.index, 1);
        return true;
    }
    moveNode(sourceId, targetId, position) {
        if (sourceId === targetId || sourceId === ROOT_ID)
            return false;
        const srcInfo = this.findParentAndIndex(sourceId);
        if (!srcInfo)
            return false;
        const srcParent = srcInfo.parent;
        const srcIdx = srcInfo.index;
        const srcNode = srcParent[srcIdx];
        if (isFolder(srcNode)) {
            const isDescendant = (folder, id) => {
                for (const child of folder.children) {
                    if (child.uuid === id)
                        return true;
                    if (isFolder(child) && isDescendant(child, id))
                        return true;
                }
                return false;
            };
            if (isFolder(srcNode) && isDescendant(srcNode, targetId))
                return false;
        }
        const targetNode = this.findNode(targetId);
        if (!targetNode)
            return false;
        let targetParent = null;
        let insertIdx = -1;
        if (position === 'inside') {
            if (!isFolder(targetNode))
                return false;
            targetParent = targetNode.children;
            insertIdx = targetParent.length;
        }
        else {
            const tInfo = this.findParentAndIndex(targetId);
            if (!tInfo)
                return false;
            targetParent = tInfo.parent;
            insertIdx = tInfo.index;
            if (position === 'after')
                insertIdx++;
        }
        if (!targetParent)
            return false;
        if (srcParent === targetParent) {
            if (insertIdx > srcIdx)
                insertIdx--;
        }
        srcParent.splice(srcIdx, 1);
        targetParent.splice(insertIdx, 0, srcNode);
        return true;
    }
    // ---- 折叠切换 ----
    toggleHandler = (e) => {
        const target = e.currentTarget;
        let id = Number(target.dataset.uuid);
        if (!id) {
            const row = target.closest('.item-row');
            if (row)
                id = Number(row.dataset.uuid);
        }
        if (!id)
            return;
        const node = this.findNode(id);
        if (!node || !isFolder(node))
            return;
        if (this.expandedFolders.has(id)) {
            let changed = false;
            const clearActive = (folder) => {
                if (folder.active) {
                    changed = true;
                    folder.active = false;
                }
                for (const child of folder.children) {
                    if (isFolder(child))
                        clearActive(child);
                }
            };
            clearActive(node);
            this.expandedFolders.delete(id);
            if (changed)
                this.onFolderActiveCancel();
        }
        else {
            this.expandedFolders.add(id);
        }
        this.renderList();
    };
    globalClickHandler = (e) => {
        const target = e.target;
        // 如果点击的是菜单内部或触发器，不关闭
        if (target.closest('.dropdown-menu') || target.closest('.dropdown-trigger')) {
            return;
        }
        this.closeAllMenus();
    };
    // ---- 菜单 ----
    menuTriggerHandler = (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const id = btn.dataset.uuid;
        if (!id)
            return;
        let menu = this.rowsContainer.querySelector(`.dropdown-menu[data-uuid="${id}"]`);
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
            if (top < 0)
                top = 4; // 防止超出顶部
        }
        menu.style.top = top + 'px';
        menu.style.opacity = '1';
        this.openMenuId = id;
    };
    menuItemHandler = (e) => {
        const target = e.currentTarget;
        const action = target.dataset.action;
        const id = Number(target.dataset.uuid);
        if (!id)
            return;
        e.stopPropagation();
        this.closeAllMenus();
        if (action === 'rename') {
            const node = this.findNode(id);
            if (node && isFolder(node))
                this.startRenameFolder(id);
            else
                this.startRenameItem(id);
        }
        else {
            this.onMenuAction(this.findNode(id), action);
        }
    };
    // 点击整行：过滤交互控件（菜单/折叠箭头/输入框）与占位行，回调逻辑对象
    rowClickHandler = (e) => {
        const t = e.target;
        if (t.closest('.cell-actions') || t.closest('.toggle-icon') || t.closest('input'))
            return;
        const row = e.currentTarget;
        const id = Number(row.dataset.uuid);
        if (!id || id === TreeListViewer.PLACEHOLDER_ID)
            return;
        const node = this.findNode(id);
        if (!node)
            return;
        this.onRowClick(node);
    };
    closeAllMenus() {
        document.querySelectorAll('.dropdown-menu.open').forEach(el => el.classList.remove('open'));
        this.openMenuId = null;
    }
    // Keep the browser out of native HTML drag mode so wheel events stay available.
    mouseDownHandler = (e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0 || this.isDraggingTouch)
            return;
        const target = e.target;
        if (target.closest('input, textarea, button, [contenteditable="true"]'))
            return;
        const row = target.closest('.cell-name')?.closest('.item-row');
        if (!row || !this.rowsContainer.contains(row))
            return;
        const uuid = Number(row.dataset.uuid);
        if (!uuid || uuid === TreeListViewer.PLACEHOLDER_ID || !this.findNode(uuid))
            return;
        this.endMouseDrag();
        e.preventDefault();
        this.mouseDrag = { uuid, sourceElement: row, pointerId: e.pointerId,
            startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, started: false,
            userSelect: document.body.style.userSelect };
        document.addEventListener('pointermove', this.mouseMoveHandler);
        document.addEventListener('pointerup', this.mouseUpHandler);
        document.addEventListener('pointercancel', this.mouseCancelHandler);
        document.addEventListener('keydown', this.mouseEscapeHandler, true);
        document.addEventListener('scroll', this.mouseScrollHandler, true);
        document.addEventListener('visibilitychange', this.mouseVisibilityHandler);
        window.addEventListener('blur', this.mouseCancelHandler);
    };
    mouseMoveHandler = (e) => {
        const drag = this.mouseDrag;
        if (!drag || e.pointerId !== drag.pointerId)
            return;
        if (!(e.buttons & 1)) {
            this.mouseCancelHandler();
            return;
        }
        drag.x = e.clientX;
        drag.y = e.clientY;
        if (!drag.started) {
            if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5)
                return;
            drag.started = true;
            this.dragState = { type: 'node', uuid: drag.uuid, sourceElement: drag.sourceElement };
            drag.sourceElement.classList.add('dragging');
            document.body.style.userSelect = 'none';
        }
        this.highlightMouseTarget();
    };
    mouseTarget(x, y) {
        const row = document.elementFromPoint(x, y)?.closest('.item-row');
        if (!row || !this.rowsContainer.contains(row))
            return null;
        const id = Number(row.dataset.uuid);
        if (!id || id === this.mouseDrag?.uuid)
            return null;
        if (id === TreeListViewer.PLACEHOLDER_ID)
            return { row, node: null, position: 'before' };
        const node = this.findNode(id);
        if (!node)
            return null;
        const rect = row.getBoundingClientRect();
        const lowerHalf = y - rect.top > rect.height / 2;
        const position = lowerHalf && isFolder(node) && this.expandedFolders.has(id) ? 'inside'
            : lowerHalf ? 'after' : 'before';
        return { row, node, position };
    }
    highlightMouseTarget = () => {
        this.clearDragHighlights();
        const drag = this.mouseDrag;
        if (!drag?.started)
            return;
        const source = this.findNode(drag.uuid);
        const target = this.mouseTarget(drag.x, drag.y);
        if (!source || !target)
            return;
        const allowed = this.allowDrop(source, target.node, target.position);
        target.row.classList.add(`drop-${target.position}${allowed ? '' : '-disallowed'}`);
    };
    mouseScrollHandler = () => { if (this.mouseDrag?.started)
        this.highlightMouseTarget(); };
    mouseUpHandler = (e) => {
        const drag = this.mouseDrag;
        if (!drag || e.pointerId !== drag.pointerId || e.button !== 0)
            return;
        try {
            if (!drag.started)
                return;
            this.blockDragClick();
            const source = this.findNode(drag.uuid);
            const target = this.mouseTarget(e.clientX, e.clientY);
            if (!source || !target || !this.allowDrop(source, target.node, target.position))
                return;
            let moved = false;
            if (!target.node) {
                const info = this.findParentAndIndex(drag.uuid);
                if (info && info.index !== info.parent.length - 1) {
                    info.parent.push(...info.parent.splice(info.index, 1));
                    moved = true;
                }
            }
            else
                moved = this.moveNode(drag.uuid, target.node.uuid, target.position);
            if (moved) {
                this.onAfterChange();
                this.renderList();
            }
        }
        finally {
            this.endMouseDrag();
        }
    };
    mouseEscapeHandler = (e) => {
        if (e.key !== 'Escape' || !this.mouseDrag)
            return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.mouseCancelHandler();
    };
    mouseVisibilityHandler = () => { if (document.hidden)
        this.mouseCancelHandler(); };
    mouseCancelHandler = () => {
        if (this.mouseDrag?.started)
            this.blockDragClick();
        this.endMouseDrag();
    };
    blockDragClick() {
        document.addEventListener('click', this.suppressDragClick, true);
        document.addEventListener('pointerdown', this.clearDragClick, true);
    }
    clearDragClick = () => {
        document.removeEventListener('click', this.suppressDragClick, true);
        document.removeEventListener('pointerdown', this.clearDragClick, true);
    };
    suppressDragClick = (e) => {
        if (!e.detail)
            return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.clearDragClick();
    };
    endMouseDrag() {
        const drag = this.mouseDrag;
        if (drag) {
            drag.sourceElement.classList.remove('dragging');
            if (drag.started)
                document.body.style.userSelect = drag.userSelect;
            this.dragState = null;
        }
        this.mouseDrag = null;
        this.clearDragHighlights();
        document.removeEventListener('pointermove', this.mouseMoveHandler);
        document.removeEventListener('pointerup', this.mouseUpHandler);
        document.removeEventListener('pointercancel', this.mouseCancelHandler);
        document.removeEventListener('keydown', this.mouseEscapeHandler, true);
        document.removeEventListener('scroll', this.mouseScrollHandler, true);
        document.removeEventListener('visibilitychange', this.mouseVisibilityHandler);
        window.removeEventListener('blur', this.mouseCancelHandler);
    }
    // ---- 触摸拖拽（长按触发） ----
    touchStartHandler = (e) => {
        const target = e.target;
        const cellName = target.closest('.cell-name');
        if (!cellName) {
            return;
        }
        const row = cellName.closest('.item-row');
        if (!row)
            return;
        const id = Number(row.dataset.uuid);
        if (!id || id === TreeListViewer.PLACEHOLDER_ID)
            return;
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
            row._dragData = JSON.stringify({ type: 'node', id });
            if (navigator.vibrate)
                navigator.vibrate(20);
            this.longPressTimer = null;
        }, this.longPressDelay);
    };
    touchMoveHandler = (e) => {
        if (this.isDraggingTouch && this.dragState) {
            e.preventDefault();
            const touch = e.touches[0];
            const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetRow = targetElement?.closest('.item-row');
            if (targetRow && targetRow !== this.dragState.sourceElement) {
                const targetId = Number(targetRow.dataset.uuid);
                if (targetId) {
                    const sourceId = this.dragState.uuid;
                    if (sourceId && sourceId !== targetId) {
                        const sourceNode = this.findNode(sourceId);
                        if (!sourceNode)
                            return;
                        if (targetId === TreeListViewer.PLACEHOLDER_ID) {
                            const allowed = this.allowDrop(sourceNode, null, 'before');
                            this.clearDragHighlights();
                            if (allowed) {
                                targetRow.classList.add('drop-before');
                            }
                            else {
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
                        let position = 'before';
                        if (isExpanded && (y / height) > 0.5) {
                            position = 'inside';
                        }
                        else {
                            position = (y / height) < 0.5 ? 'before' : 'after';
                        }
                        const allowed = this.allowDrop(sourceNode, targetNode, position);
                        this.clearDragHighlights();
                        if (allowed) {
                            if (position === 'inside')
                                targetRow.classList.add('drop-inside');
                            else if (position === 'before')
                                targetRow.classList.add('drop-before');
                            else
                                targetRow.classList.add('drop-after');
                        }
                        else {
                            if (position === 'inside')
                                targetRow.classList.add('drop-inside-disallowed');
                            else if (position === 'before')
                                targetRow.classList.add('drop-before-disallowed');
                            else
                                targetRow.classList.add('drop-after-disallowed');
                        }
                    }
                }
            }
            else {
                this.clearDragHighlights();
            }
        }
        else {
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
    touchEndHandler = (e) => {
        if (this.longPressTimer !== null) {
            window.clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        if (this.isDraggingTouch && this.dragState) {
            e.preventDefault();
            const touch = e.changedTouches[0];
            const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetRow = targetElement?.closest('.item-row');
            if (targetRow) {
                const targetId = Number(targetRow.dataset.uuid);
                const sourceId = this.dragState.uuid;
                if (targetId && sourceId && sourceId !== targetId) {
                    const sourceNode = this.findNode(sourceId);
                    if (sourceNode) {
                        if (targetId === TreeListViewer.PLACEHOLDER_ID) {
                            const allowed = this.allowDrop(sourceNode, null, 'before');
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
                        let position = 'before';
                        if (targetRow.classList.contains('drop-inside') || targetRow.classList.contains('drop-inside-disallowed')) {
                            position = 'inside';
                        }
                        else if (targetRow.classList.contains('drop-before') || targetRow.classList.contains('drop-before-disallowed')) {
                            position = 'before';
                        }
                        else if (targetRow.classList.contains('drop-after') || targetRow.classList.contains('drop-after-disallowed')) {
                            position = 'after';
                        }
                        else {
                            const rect = targetRow.getBoundingClientRect();
                            const y = touch.clientY - rect.top;
                            const height = rect.height;
                            const targetNode = this.findNode(targetId);
                            const isFolderTarget = targetNode && isFolder(targetNode);
                            const isExpanded = isFolderTarget && this.expandedFolders.has(targetId);
                            if (isExpanded && (y / height) > 0.5)
                                position = 'inside';
                            else
                                position = (y / height) < 0.5 ? 'before' : 'after';
                        }
                        const allowed = this.allowDrop(sourceNode, this.findNode(targetId), position);
                        if (allowed) {
                            this.moveNode(sourceId, targetId, position);
                            this.onAfterChange();
                            this.renderList();
                        }
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
    preventScroll = (e) => {
        e.preventDefault();
    };
    clearDropTarget(row) {
        row.classList.remove('drop-before', 'drop-after', 'drop-inside', 'drop-before-disallowed', 'drop-after-disallowed', 'drop-inside-disallowed');
    }
    clearDragHighlights() {
        document.querySelectorAll('.item-row.drop-before, .item-row.drop-after, .item-row.drop-inside, .item-row.drop-before-disallowed, .item-row.drop-after-disallowed, .item-row.drop-inside-disallowed')
            .forEach(el => el.classList.remove('drop-before', 'drop-after', 'drop-inside', 'drop-before-disallowed', 'drop-after-disallowed', 'drop-inside-disallowed'));
    }
    startRename(node) {
        if (isFolder(node))
            this.startRenameFolder(node.uuid);
        else
            this.startRenameItem(node.uuid);
    }
    // 就地编辑内容列（叶子命题编辑 content / 文件夹编辑显示名）：
    // 在内容列内联输入框，失焦/Enter 提交，Esc 取消。提交走 renameItem/renameFolder 钩子
    // （类型层等显示名在 content 的列表用它），否则回退到 renameNode 改 name。
    startContentEdit(id) {
        const node = this.findNode(id);
        if (!node)
            return;
        const row = this.rowsContainer.querySelector(`.item-row[data-uuid="${id}"]`);
        if (!row)
            return;
        const inner = row.querySelector('.cell-content .inner');
        if (!inner)
            return;
        const isFld = isFolder(node);
        const currentName = isFld
            ? (this.folderNameOf ? this.folderNameOf(node) : node.name)
            : (this.itemNameOf ? this.itemNameOf(node) : node.name);
        const input = document.createElement('input');
        input.className = 'name-input folder-name-input';
        input.value = currentName;
        input.dataset.uuid = String(id);
        inner.replaceWith(input);
        input.focus();
        input.select();
        const finish = () => {
            const newName = input.value.trim();
            const renamer = isFld ? this.renameFolder : this.renameItem;
            if (renamer) {
                if (newName && newName !== currentName) {
                    renamer(node, newName);
                    this.onAfterChange();
                }
            }
            else if (newName && newName !== currentName) {
                this.renameNode(id, newName);
                this.onAfterChange();
            }
            this.renderList();
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            }
            else if (e.key === 'Escape') {
                input.value = currentName;
                input.blur();
            }
        });
    }
    // ---- 操作 ----
    // 自定义改名钩子：默认用 node.name；类型层等把显示名放 content 时覆写
    itemNameOf;
    folderNameOf;
    // 自定义改名提交：返回 true 表示已处理（不再改 node.name）；默认走 onRename + renameNode
    renameItem;
    renameFolder;
    startRenameItem(id) {
        const node = this.findNode(id);
        if (!node)
            return;
        const row = this.rowsContainer.querySelector(`.item-row[data-uuid="${id}"]`);
        if (!row)
            return;
        const nameEl = row.querySelector('.cell-name .name-text');
        if (!nameEl)
            return;
        const currentName = this.itemNameOf ? this.itemNameOf(node) : node.name;
        const input = document.createElement('input');
        input.className = 'name-input';
        input.value = currentName;
        input.dataset.uuid = String(id);
        nameEl.replaceWith(input);
        input.focus();
        input.select();
        const finish = () => {
            const newName = input.value.trim();
            if (this.renameItem) {
                if (newName && newName !== currentName) {
                    this.renameItem(node, newName);
                    this.onAfterChange();
                }
            }
            else if (newName !== currentName && this.onRename(node, newName)) {
                this.renameNode(id, newName);
                this.onAfterChange();
            }
            this.renderList();
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            }
            else if (e.key === 'Escape') {
                input.value = currentName;
                input.blur();
            }
        });
    }
    // 文件夹就地改名：在内容列（inner 的位置）内联编辑，名字随意不检查（不是真正的规则）
    startRenameFolder(id) {
        const node = this.findNode(id);
        if (!node || !isFolder(node))
            return;
        const row = this.rowsContainer.querySelector(`.item-row[data-uuid="${id}"]`);
        if (!row)
            return;
        const inner = row.querySelector('.cell-content .inner');
        if (!inner)
            return;
        const currentName = this.folderNameOf ? this.folderNameOf(node) : node.name;
        const input = document.createElement('input');
        input.className = 'name-input folder-name-input';
        input.value = currentName;
        input.dataset.uuid = String(id);
        inner.replaceWith(input);
        input.focus();
        input.select();
        const finish = () => {
            const newName = input.value.trim();
            if (this.renameFolder) {
                // 自定义提交（如类型层文件夹名存 content）
                if (newName && newName !== currentName) {
                    this.renameFolder(node, newName);
                    this.onAfterChange();
                }
            }
            else if (newName && newName !== currentName) {
                // 文件夹名很随意，不校验；空则保留原名
                this.renameNode(id, newName);
                this.onAfterChange();
            }
            this.renderList();
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            }
            else if (e.key === 'Escape') {
                input.value = currentName;
                input.blur();
            }
        });
    }
    renameNode(id, newName) {
        const node = this.findNode(id);
        if (!node)
            return false;
        node.name = newName;
        return true;
    }
    destroy() {
        this.endMouseDrag();
        this.clearDragClick();
        document.removeEventListener('mousemove', this._mouseMove);
        document.removeEventListener('mouseup', this._mouseUp);
        document.removeEventListener('touchmove', this._touchMove);
        document.removeEventListener('touchend', this._touchEnd);
        document.removeEventListener('touchmove', this.preventScroll);
        document.removeEventListener('click', this.globalClickHandler);
    }
    _mouseMove = null;
    _mouseUp = null;
    _touchMove = null;
    _touchEnd = null;
}
export function makeResizable(container, dragHandle, topMode, onResize, defaultHeight = '300px') {
    const toggleHandle = container.querySelector(".card-header h2");
    let isResizing = false;
    let isCollapsed = false;
    let expandedHeight = null;
    const collapsedHeight = 50;
    // ----- 拖拽逻辑 -----
    const startResize = (startY) => {
        isResizing = true;
        dragHandle.classList.add('active');
        container.classList.remove('smooth-height');
        const onMove = (clientY) => {
            if (!isResizing)
                return;
            if (isCollapsed)
                isCollapsed = false;
            const rect = container.getBoundingClientRect();
            let newHeight;
            if (topMode) {
                // 从顶部拖拽：高度 = 视口高度 - 鼠标Y - 底部偏移
                const bottomOffset = window.innerHeight - rect.bottom;
                newHeight = window.innerHeight - clientY - bottomOffset;
            }
            else {
                // 从底部拖拽：高度 = 鼠标Y - 容器顶部 + 当前高度偏移
                newHeight = clientY - rect.top + (container.offsetHeight - rect.height);
            }
            const minHeight = 60;
            if (newHeight < minHeight)
                return;
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
        const mouseMove = (e) => onMove(e.clientY);
        const mouseUp = () => onEnd();
        const touchMove = (e) => {
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
        }
        else {
            // 收起：保存当前高度
            expandedHeight = container.style.height || defaultHeight;
            container.style.height = collapsedHeight + 'px';
            isCollapsed = true;
        }
        // 触发回调，传递当前高度
        const currentHeight = parseInt(container.style.height, 10);
        if (!isNaN(currentHeight))
            onResize?.(currentHeight);
    };
    // 绑定点击展开/折叠事件
    if (toggleHandle) {
        toggleHandle.addEventListener('click', (e) => {
            const target = e.target;
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
//# sourceMappingURL=listmgr.js.map