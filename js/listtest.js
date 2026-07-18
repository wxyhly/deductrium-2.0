//   type NodeType = 'folder' | 'item';
//         interface BaseNode {
//             id: string;
//             name: string;
//             type: NodeType;
//         }
//         interface FolderNode extends BaseNode {
//             type: 'folder';
//             children: TNode[];
//         }
//         interface ItemNode extends BaseNode {
//             type: 'item';
//             [key: string]: any;
//         }
//         type TNode = FolderNode | ItemNode;
//         function isFolder(node: TNode): node is FolderNode {
//             return node.type === 'folder';
//         }
//         function isItem(node: TNode): node is ItemNode {
//             return node.type === 'item';
//         }
//         // ================================================================
//         //  2. 数据管理器
//         // ================================================================
//         class DataManager {
//             private root: FolderNode;
//             private idCounter: number = 1000;
//             public onDataChange: (() => void) | null = null;
//             constructor(initialData?: TNode[]) {
//                 this.root = {
//                     id: 'root',
//                     name: '全部',
//                     type: 'folder',
//                     children: initialData || []
//                 };
//                 this.assignIds(this.root);
//             }
//             private assignIds(node: TNode): void {
//                 if (!node.id) {
//                     node.id = 'n' + (this.idCounter++);
//                 }
//                 if (isFolder(node)) {
//                     for (const child of node.children) {
//                         this.assignIds(child);
//                     }
//                 }
//             }
//             getRoot(): FolderNode { return this.root; }
//             findNode(id: string): TNode | null {
//                 const search = (node: TNode): TNode | null => {
//                     if (node.id === id) return node;
//                     if (isFolder(node)) {
//                         for (const child of node.children) {
//                             const found = search(child);
//                             if (found) return found;
//                         }
//                     }
//                     return null;
//                 };
//                 return search(this.root);
//             }
//             findParentAndIndex(id: string): { parent: FolderNode; index: number } | null {
//                 const search = (node: TNode): { parent: FolderNode; index: number } | null => {
//                     if (isFolder(node)) {
//                         for (let i = 0; i < node.children.length; i++) {
//                             const child = node.children[i];
//                             if (child.id === id) {
//                                 return { parent: node, index: i };
//                             }
//                             if (isFolder(child)) {
//                                 const res = search(child);
//                                 if (res) return res;
//                             }
//                         }
//                     }
//                     return null;
//                 };
//                 return search(this.root);
//             }
//             addNode(parentId: string, node: Omit<TNode, 'id'>): TNode {
//                 const parent = this.findNode(parentId);
//                 if (!parent || !isFolder(parent)) throw new Error('父节点必须是文件夹');
//                 const newNode: TNode = { ...node, id: 'n' + (this.idCounter++) } as TNode;
//                 parent.children.push(newNode);
//                 this.notify();
//                 return newNode;
//             }
//             deleteNode(id: string): boolean {
//                 if (id === 'root') return false;
//                 const info = this.findParentAndIndex(id);
//                 if (!info) return false;
//                 info.parent.children.splice(info.index, 1);
//                 this.notify();
//                 return true;
//             }
//             renameNode(id: string, newName: string): boolean {
//                 const node = this.findNode(id);
//                 if (!node) return false;
//                 node.name = newName;
//                 this.notify();
//                 return true;
//             }
//             moveNode(sourceId: string, targetId: string, position: 'inside' | 'before' | 'after'): boolean {
//                 if (sourceId === targetId || sourceId === 'root') return false;
//                 const srcInfo = this.findParentAndIndex(sourceId);
//                 if (!srcInfo) return false;
//                 const srcParent = srcInfo.parent;
//                 const srcIdx = srcInfo.index;
//                 const srcNode = srcParent.children[srcIdx];
//                 if (isFolder(srcNode)) {
//                     const isDescendant = (folder: FolderNode, id: string): boolean => {
//                         for (const child of folder.children) {
//                             if (child.id === id) return true;
//                             if (isFolder(child) && isDescendant(child, id)) return true;
//                         }
//                         return false;
//                     };
//                     if (isFolder(srcNode) && isDescendant(srcNode, targetId)) return false;
//                 }
//                 const targetNode = this.findNode(targetId);
//                 if (!targetNode) return false;
//                 let targetParent: FolderNode | null = null;
//                 let insertIdx: number = -1;
//                 if (position === 'inside') {
//                     if (!isFolder(targetNode)) return false;
//                     targetParent = targetNode;
//                     insertIdx = targetParent.children.length;
//                 } else {
//                     const tInfo = this.findParentAndIndex(targetId);
//                     if (!tInfo) return false;
//                     targetParent = tInfo.parent;
//                     insertIdx = tInfo.index;
//                     if (position === 'after') insertIdx++;
//                 }
//                 if (!targetParent) return false;
//                 if (srcParent === targetParent) {
//                     if (insertIdx > srcIdx) insertIdx--;
//                 }
//                 srcParent.children.splice(srcIdx, 1);
//                 targetParent.children.splice(insertIdx, 0, srcNode);
//                 this.notify();
//                 return true;
//             }
//             flattenTree(): Array<{ node: TNode; depth: number }> {
//                 const result: Array<{ node: TNode; depth: number }> = [];
//                 const traverse = (node: TNode, depth: number) => {
//                     result.push({ node, depth });
//                     if (isFolder(node)) {
//                         for (const child of node.children) {
//                             traverse(child, depth + 1);
//                         }
//                     }
//                 };
//                 for (const child of this.root.children) {
//                     traverse(child, 0);
//                 }
//                 return result;
//             }
//             private notify(): void {
//                 if (this.onDataChange) this.onDataChange();
//             }
//             exportData(): TNode[] {
//                 return this.root.children;
//             }
//         }
//         // ================================================================
//         //  3. 通用扁平列表管理器
//         // ================================================================
//         interface ManagerConfig {
//             container: HTMLElement;
//             data?: TNode[];
//             nameWidth?: string;
//             contentMinWidth?: string;
//             extraWidth?: string;
//             actionsWidth?: string;
//             renderName: (item: ItemNode) => string; // 返回字符串，用于名称列
//             renderContent: (item: ItemNode) => Node; // 返回 DOM 节点
//             renderExtra: (item: ItemNode) => Node; // 返回 DOM 节点
//             folderMenuItems?: Array<{ label: string; icon?: string; handler: (id: string) => void; danger?: boolean }>;
//             itemMenuItems?: Array<{ label: string; icon?: string; handler: (id: string) => void; danger?: boolean }>;
//             onRename?: (id: string, newName: string) => void;
//             onDelete?: (id: string) => void;
//             onMove?: (sourceId: string, targetId: string, position: 'inside' | 'before' | 'after') => boolean;
//             onReorder?: (sourceId: string, targetId: string, position: 'before' | 'after') => boolean;
//             allowDrag?: boolean;
//         }
//         class FlatTreeManager {
//             private config: Required<Omit<ManagerConfig, 'container' | 'data'>> & {
//                 container: HTMLElement;
//                 data: TNode[];
//             };
//             private manager: DataManager;
//             private container: HTMLElement;
//             private rowsContainer: HTMLElement;
//             private badgeEl: HTMLElement;
//             private openMenuId: string | null = null;
//             private dragState: { type: 'node' | 'item'; id: string; sourceElement: HTMLElement } | null = null;
//             private expandedFolders: Set<string> = new Set();
//             private addFolderBtn: HTMLElement;
//             private addItemBtn: HTMLElement;
//             constructor(config: ManagerConfig) {
//                 const def = {
//                     nameWidth: '120px',
//                     contentMinWidth: '280px',
//                     extraWidth: '100px',
//                     actionsWidth: '40px',
//                     folderMenuItems: [],
//                     itemMenuItems: [],
//                     onRename: () => { },
//                     onDelete: () => { },
//                     onMove: () => true,
//                     onReorder: () => true,
//                     allowDrag: true,
//                     data: [],
//                 };
//                 this.config = {
//                     container: config.container,
//                     data: config.data || [],
//                     nameWidth: config.nameWidth ?? def.nameWidth,
//                     contentMinWidth: config.contentMinWidth ?? def.contentMinWidth,
//                     extraWidth: config.extraWidth ?? def.extraWidth,
//                     actionsWidth: config.actionsWidth ?? def.actionsWidth,
//                     renderName: config.renderName,
//                     renderContent: config.renderContent,
//                     renderExtra: config.renderExtra,
//                     folderMenuItems: config.folderMenuItems ?? def.folderMenuItems,
//                     itemMenuItems: config.itemMenuItems ?? def.itemMenuItems,
//                     onRename: config.onRename ?? def.onRename,
//                     onDelete: config.onDelete ?? def.onDelete,
//                     onMove: config.onMove ?? def.onMove,
//                     onReorder: config.onReorder ?? def.onReorder,
//                     allowDrag: config.allowDrag ?? def.allowDrag,
//                 };
//                 this.container = config.container;
//                 this.rowsContainer = this.container.querySelector('.rows-container')!;
//                 this.badgeEl = this.container.querySelector('.badge')!;
//                 this.addFolderBtn = this.container.querySelector('.actions .btn-sm:first-child')!;
//                 this.addItemBtn = this.container.querySelector('.actions .btn-sm:last-child')!;
//                 this.manager = new DataManager(this.config.data);
//                 this.manager.onDataChange = () => {
//                     this.renderList();
//                     this.updateBadge();
//                 };
//                 this.expandAll();
//                 this.renderList();
//                 this.updateBadge();
//                 this.bindRowEvents();
//                 this.bindAddButtons();
//             }
//             private expandAll(): void {
//                 const collect = (node: TNode) => {
//                     if (isFolder(node)) {
//                         this.expandedFolders.add(node.id);
//                         for (const child of node.children) collect(child);
//                     }
//                 };
//                 for (const child of this.manager.getRoot().children) {
//                     collect(child);
//                 }
//             }
//             private renderList(): void {
//                 const flat = this.flattenVisible();
//                 // 清空容器
//                 this.rowsContainer.innerHTML = '';
//                 if (flat.length === 0) {
//                     this.rowsContainer.innerHTML = `<div class="empty-state">📭 此列表为空</div>`;
//                     return;
//                 }
//                 // 使用文档片段批量添加
//                 const fragment = document.createDocumentFragment();
//                 for (const { node, depth } of flat) {
//                     const row = this.buildRow(node, depth);
//                     fragment.appendChild(row);
//                 }
//                 this.rowsContainer.appendChild(fragment);
//                 this.bindRowEvents();
//             }
//             private flattenVisible(): Array<{ node: TNode; depth: number }> {
//                 const result: Array<{ node: TNode; depth: number }> = [];
//                 const traverse = (node: TNode, depth: number) => {
//                     result.push({ node, depth });
//                     if (isFolder(node) && this.expandedFolders.has(node.id)) {
//                         for (const child of node.children) {
//                             traverse(child, depth + 1);
//                         }
//                     }
//                 };
//                 for (const child of this.manager.getRoot().children) {
//                     traverse(child, 0);
//                 }
//                 return result;
//             }
//             private buildRow(node: TNode, depth: number): HTMLElement {
//                 const isFolderNode = isFolder(node);
//                 const id = node.id;
//                 const name = node.name;
//                 // 创建行容器
//                 const row = document.createElement('div');
//                 row.className = `item-row ${isFolderNode ? 'folder-row' : ''}`;
//                 row.dataset.id = id;
//                 row.dataset.type = node.type;
//                 row.style.setProperty('--depth', String(depth));
//                 if (this.config.allowDrag) {
//                     row.draggable = true;
//                 }
//                 // ---- 名称列 ----
//                 const nameCell = document.createElement('div');
//                 nameCell.className = 'cell-name';
//                 nameCell.dataset.id = id;
//                 if (this.config.allowDrag) {
//                     nameCell.draggable = true;
//                 }
//                 // 缩进占位
//                 const indent = document.createElement('span');
//                 indent.className = 'row-indent';
//                 nameCell.appendChild(indent);
//                 if (isFolderNode) {
//                     const isExpanded = this.expandedFolders.has(id);
//                     const toggle = document.createElement('span');
//                     toggle.className = `toggle-icon ${isExpanded ? 'expanded' : ''}`;
//                     toggle.dataset.id = id;
//                     toggle.textContent = isExpanded ? '▼' : '▶';
//                     nameCell.appendChild(toggle);
//                     const folderIcon = document.createElement('span');
//                     folderIcon.className = 'folder-icon';
//                     folderIcon.dataset.id = id;
//                     folderIcon.textContent = '📁';
//                     nameCell.appendChild(folderIcon);
//                     // 名称文本隐藏（文件夹名称显示在内容列）
//                     const nameText = document.createElement('span');
//                     nameText.className = 'name-text';
//                     nameText.style.display = 'none';
//                     nameCell.appendChild(nameText);
//                 } else {
//                     const nameText = document.createElement('span');
//                     nameText.className = 'name-text';
//                     nameText.textContent = this.config.renderName(node);
//                     nameCell.appendChild(nameText);
//                 }
//                 row.appendChild(nameCell);
//                 // ---- 内容列 ----
//                 const contentCell = document.createElement('div');
//                 contentCell.className = `cell-content ${isFolderNode ? 'folder-content' : ''}`;
//                 contentCell.dataset.id = id;
//                 if (isFolderNode) {
//                     contentCell.dataset.isFolder = 'true';
//                 }
//                 // 内容：如果是文件夹，显示名称；否则使用 renderContent 返回的 DOM
//                 if (isFolderNode) {
//                     const inner = document.createElement('span');
//                     inner.className = 'inner';
//                     inner.style.fontWeight = '500';
//                     inner.style.color = '#1e293b';
//                     inner.textContent = name;
//                     contentCell.appendChild(inner);
//                 } else {
//                     const contentNode = this.config.renderContent(node);
//                     // 如果返回的是文档片段，将其子节点移入
//                     if (contentNode instanceof DocumentFragment) {
//                         contentCell.appendChild(contentNode);
//                     } else {
//                         contentCell.appendChild(contentNode);
//                     }
//                 }
//                 row.appendChild(contentCell);
//                 // ---- 额外列 ----
//                 const extraCell = document.createElement('div');
//                 extraCell.className = 'cell-extra';
//                 extraCell.dataset.id = id;
//                 const extraContainer = document.createElement('span');
//                 extraContainer.className = 'extra-text';
//                 if (isFolderNode) {
//                     extraContainer.textContent = `📂 ${node.children.length}`;
//                 } else {
//                     const extraNode = this.config.renderExtra(node);
//                     if (extraNode instanceof DocumentFragment) {
//                         extraContainer.appendChild(extraNode);
//                     } else {
//                         extraContainer.appendChild(extraNode);
//                     }
//                 }
//                 extraCell.appendChild(extraContainer);
//                 row.appendChild(extraCell);
//                 // ---- 操作列 ----
//                 const actionsCell = document.createElement('div');
//                 actionsCell.className = 'cell-actions';
//                 actionsCell.dataset.id = id;
//                 const trigger = document.createElement('button');
//                 trigger.className = 'dropdown-trigger';
//                 trigger.dataset.id = id;
//                 trigger.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`;
//                 actionsCell.appendChild(trigger);
//                 // 下拉菜单
//                 const menu = document.createElement('div');
//                 menu.className = 'dropdown-menu';
//                 menu.dataset.id = id;
//                 menu.innerHTML = this.buildMenuHTML(node);
//                 actionsCell.appendChild(menu);
//                 row.appendChild(actionsCell);
//                 return row;
//             }
//             private buildMenuHTML(node: TNode): string {
//                 const id = node.id;
//                 let html = '';
//                 if (isFolder(node)) {
//                     html += `<button class="menu-item" data-action="add-subfolder" data-id="${id}"><span class="icon">📁</span> 新建子文件夹</button>`;
//                     html += `<button class="menu-item" data-action="rename-folder" data-id="${id}"><span class="icon">✏️</span> 重命名</button>`;
//                     for (const mi of this.config.folderMenuItems) {
//                         const danger = mi.danger ? 'danger' : '';
//                         const icon = mi.icon || '•';
//                         html += `<button class="menu-item ${danger}" data-action="custom-folder" data-custom-index="${this.config.folderMenuItems.indexOf(mi)}" data-id="${id}"><span class="icon">${icon}</span> ${mi.label}</button>`;
//                     }
//                     html += `<div class="menu-divider"></div>`;
//                     html += `<button class="menu-item danger" data-action="delete-folder" data-id="${id}"><span class="icon">🗑️</span> 删除</button>`;
//                 } else {
//                     html += `<button class="menu-item" data-action="rename" data-id="${id}"><span class="icon">✏️</span> 重命名</button>`;
//                     for (const mi of this.config.itemMenuItems) {
//                         const danger = mi.danger ? 'danger' : '';
//                         const icon = mi.icon || '•';
//                         html += `<button class="menu-item ${danger}" data-action="custom-item" data-custom-index="${this.config.itemMenuItems.indexOf(mi)}" data-id="${id}"><span class="icon">${icon}</span> ${mi.label}</button>`;
//                     }
//                     html += `<div class="menu-divider"></div>`;
//                     html += `<button class="menu-item danger" data-action="delete" data-id="${id}"><span class="icon">🗑️</span> 删除</button>`;
//                 }
//                 return html;
//             }
//             private bindRowEvents(): void {
//                 // 展开/折叠
//                 this.rowsContainer.querySelectorAll('.toggle-icon, .folder-icon, .cell-content.folder-content').forEach(el => {
//                     el.removeEventListener('click', this.toggleHandler as any);
//                     el.addEventListener('click', this.toggleHandler as any);
//                 });
//                 // 菜单触发
//                 this.rowsContainer.querySelectorAll('.dropdown-trigger').forEach(btn => {
//                     btn.removeEventListener('click', this.menuTriggerHandler as any);
//                     btn.addEventListener('click', this.menuTriggerHandler as any);
//                 });
//                 // 菜单项
//                 this.rowsContainer.querySelectorAll('.menu-item').forEach(item => {
//                     item.removeEventListener('click', this.menuItemHandler as any);
//                     item.addEventListener('click', this.menuItemHandler as any);
//                 });
//                 // 拖拽
//                 if (this.config.allowDrag) {
//                     this.rowsContainer.querySelectorAll('.item-row').forEach(row => {
//                         row.removeEventListener('dragstart', this.dragStartHandler as any);
//                         row.removeEventListener('dragend', this.dragEndHandler as any);
//                         row.removeEventListener('dragover', this.dragOverHandler as any);
//                         row.removeEventListener('dragleave', this.dragLeaveHandler as any);
//                         row.removeEventListener('drop', this.dropHandler as any);
//                         row.addEventListener('dragstart', this.dragStartHandler as any);
//                         row.addEventListener('dragend', this.dragEndHandler as any);
//                         row.addEventListener('dragover', this.dragOverHandler as any);
//                         row.addEventListener('dragleave', this.dragLeaveHandler as any);
//                         row.addEventListener('drop', this.dropHandler as any);
//                     });
//                 }
//             }
//             // ---- 折叠切换 ----
//             private toggleHandler = (e: Event) => {
//                 const target = e.currentTarget as HTMLElement;
//                 let id = target.dataset.id;
//                 if (!id) {
//                     const row = target.closest('.item-row') as HTMLElement;
//                     if (row) id = row.dataset.id;
//                 }
//                 if (!id) return;
//                 const node = this.manager.findNode(id);
//                 if (!node || !isFolder(node)) return;
//                 if (this.expandedFolders.has(id)) {
//                     this.expandedFolders.delete(id);
//                 } else {
//                     this.expandedFolders.add(id);
//                 }
//                 this.renderList();
//             };
//             // ---- 菜单 ----
//             private menuTriggerHandler = (e: Event) => {
//                 e.stopPropagation();
//                 const btn = e.currentTarget as HTMLElement;
//                 const id = btn.dataset.id;
//                 if (!id) return;
//                 const menu = btn.parentElement?.querySelector('.dropdown-menu') as HTMLElement;
//                 if (!menu) return;
//                 if (this.openMenuId === id) {
//                     this.closeAllMenus();
//                     return;
//                 }
//                 this.closeAllMenus();
//                 menu.classList.add('open');
//                 this.openMenuId = id;
//             };
//             private menuItemHandler = (e: Event) => {
//                 const target = e.currentTarget as HTMLElement;
//                 const action = target.dataset.action;
//                 const id = target.dataset.id;
//                 if (!id) return;
//                 e.stopPropagation();
//                 this.closeAllMenus();
//                 if (action === 'rename') {
//                     this.startRenameItem(id);
//                 } else if (action === 'delete') {
//                     this.deleteItem(id);
//                 } else if (action === 'custom-item') {
//                     const idx = parseInt(target.dataset.customIndex || '-1', 10);
//                     const menu = this.config.itemMenuItems[idx];
//                     if (menu) menu.handler(id);
//                 } else if (action === 'rename-folder') {
//                     this.startRenameFolder(id);
//                 } else if (action === 'delete-folder') {
//                     this.deleteFolder(id);
//                 } else if (action === 'add-subfolder') {
//                     this.addSubfolder(id);
//                 } else if (action === 'custom-folder') {
//                     const idx = parseInt(target.dataset.customIndex || '-1', 10);
//                     const menu = this.config.folderMenuItems[idx];
//                     if (menu) menu.handler(id);
//                 }
//             };
//             private closeAllMenus(): void {
//                 document.querySelectorAll('.dropdown-menu.open').forEach(el => el.classList.remove('open'));
//                 this.openMenuId = null;
//             }
//             // ---- 拖拽处理 ----
//             private dragStartHandler = (e: DragEvent) => {
//                 const target = e.target as HTMLElement;
//                 const cellName = target.closest('.cell-name');
//                 if (!cellName) {
//                     e.preventDefault();
//                     return;
//                 }
//                 const row = cellName.closest('.item-row') as HTMLElement;
//                 if (!row) {
//                     e.preventDefault();
//                     return;
//                 }
//                 const id = row.dataset.id;
//                 if (!id) {
//                     e.preventDefault();
//                     return;
//                 }
//                 this.dragState = {
//                     type: 'node',
//                     id: id,
//                     sourceElement: row
//                 };
//                 e.dataTransfer!.setData('text/plain', JSON.stringify({ type: 'node', id }));
//                 e.dataTransfer!.effectAllowed = 'move';
//                 row.classList.add('dragging');
//             };
//             private dragEndHandler = (e: DragEvent) => {
//                 this.clearDragHighlights();
//                 if (this.dragState) {
//                     const src = this.dragState.sourceElement;
//                     if (src) src.classList.remove('dragging');
//                     this.dragState = null;
//                 }
//                 document.querySelectorAll('.item-row.drop-before, .item-row.drop-after, .item-row.drop-inside')
//                     .forEach(el => el.classList.remove('drop-before', 'drop-after', 'drop-inside'));
//             };
//             private dragOverHandler = (e: DragEvent) => {
//                 e.preventDefault();
//                 e.dataTransfer!.dropEffect = 'move';
//                 const targetRow = (e.target as HTMLElement).closest('.item-row') as HTMLElement;
//                 if (!targetRow) return;
//                 const targetId = targetRow.dataset.id;
//                 if (!targetId) return;
//                 const sourceId = this.dragState?.id;
//                 if (!sourceId || sourceId === targetId) {
//                     this.clearDropTarget(targetRow);
//                     return;
//                 }
//                 const rect = targetRow.getBoundingClientRect();
//                 const y = e.clientY - rect.top;
//                 const height = rect.height;
//                 const targetNode = this.manager.findNode(targetId);
//                 const isFolderTarget = targetNode && isFolder(targetNode);
//                 const isInside = isFolderTarget && (y / height) > 0.5;
//                 this.clearDropTarget(targetRow);
//                 if (isInside) {
//                     targetRow.classList.add('drop-inside');
//                 } else {
//                     const insertBefore = (y / height) < 0.5;
//                     if (insertBefore) {
//                         targetRow.classList.add('drop-before');
//                     } else {
//                         targetRow.classList.add('drop-after');
//                     }
//                 }
//             };
//             private dragLeaveHandler = (e: DragEvent) => {
//                 const targetRow = (e.target as HTMLElement).closest('.item-row') as HTMLElement;
//                 if (targetRow) {
//                     this.clearDropTarget(targetRow);
//                 }
//             };
//             private dropHandler = (e: DragEvent) => {
//                 e.preventDefault();
//                 const targetRow = (e.target as HTMLElement).closest('.item-row') as HTMLElement;
//                 if (!targetRow) return;
//                 const targetId = targetRow.dataset.id;
//                 if (!targetId) return;
//                 const sourceId = this.dragState?.id;
//                 if (!sourceId || sourceId === targetId) {
//                     this.dragEndHandler(e);
//                     return;
//                 }
//                 let position: 'inside' | 'before' | 'after' = 'before';
//                 if (targetRow.classList.contains('drop-inside')) {
//                     position = 'inside';
//                 } else if (targetRow.classList.contains('drop-before')) {
//                     position = 'before';
//                 } else if (targetRow.classList.contains('drop-after')) {
//                     position = 'after';
//                 } else {
//                     const rect = targetRow.getBoundingClientRect();
//                     const y = e.clientY - rect.top;
//                     const height = rect.height;
//                     const targetNode = this.manager.findNode(targetId);
//                     const isFolderTarget = targetNode && isFolder(targetNode);
//                     if (isFolderTarget && (y / height) > 0.5) {
//                         position = 'inside';
//                     } else {
//                         position = (y / height) < 0.5 ? 'before' : 'after';
//                     }
//                 }
//                 let allowed = true;
//                 if (position === 'inside') {
//                     allowed = this.config.onMove(sourceId, targetId, 'inside');
//                 } else {
//                     const srcInfo = this.manager.findParentAndIndex(sourceId);
//                     const tgtInfo = this.manager.findParentAndIndex(targetId);
//                     if (srcInfo && tgtInfo && srcInfo.parent === tgtInfo.parent) {
//                         allowed = this.config.onReorder(sourceId, targetId, position);
//                     } else {
//                         allowed = this.config.onMove(sourceId, targetId, position);
//                     }
//                 }
//                 if (allowed) {
//                     this.manager.moveNode(sourceId, targetId, position);
//                 } else {
//                     alert('操作被禁止');
//                 }
//                 this.dragEndHandler(e);
//             };
//             private clearDropTarget(row: HTMLElement): void {
//                 row.classList.remove('drop-before', 'drop-after', 'drop-inside');
//             }
//             private clearDragHighlights(): void {
//                 document.querySelectorAll('.item-row.drop-before, .item-row.drop-after, .item-row.drop-inside')
//                     .forEach(el => el.classList.remove('drop-before', 'drop-after', 'drop-inside'));
//             }
//             // ---- 操作 ----
//             private startRenameItem(id: string): void {
//                 const node = this.manager.findNode(id);
//                 if (!node || isFolder(node)) return;
//                 const row = this.rowsContainer.querySelector(`.item-row[data-id="${id}"]`);
//                 if (!row) return;
//                 const nameEl = row.querySelector('.cell-name .name-text') as HTMLElement;
//                 if (!nameEl) return;
//                 const currentName = node.name;
//                 const input = document.createElement('input');
//                 input.className = 'name-input';
//                 input.value = currentName;
//                 input.dataset.id = id;
//                 nameEl.replaceWith(input);
//                 input.focus();
//                 input.select();
//                 const finish = () => {
//                     const newName = input.value.trim();
//                     if (newName && newName !== currentName) {
//                         this.manager.renameNode(id, newName);
//                         this.config.onRename(id, newName);
//                     } else {
//                         this.renderList();
//                     }
//                 };
//                 input.addEventListener('blur', finish);
//                 input.addEventListener('keydown', (e) => {
//                     if (e.key === 'Enter') { input.blur(); } else if (e.key === 'Escape') { input.value = currentName;
//                         input.blur(); }
//                 });
//             }
//             private deleteItem(id: string): void {
//                 const node = this.manager.findNode(id);
//                 if (!node || isFolder(node)) return;
//                 if (!confirm(`确定删除「${node.name}」吗？`)) return;
//                 this.manager.deleteNode(id);
//                 this.config.onDelete(id);
//             }
//             private startRenameFolder(id: string): void {
//                 const node = this.manager.findNode(id);
//                 if (!node || !isFolder(node)) return;
//                 const newName = prompt('重命名文件夹', node.name);
//                 if (newName && newName.trim() !== '') {
//                     this.manager.renameNode(id, newName.trim());
//                     this.config.onRename(id, newName.trim());
//                 }
//             }
//             private deleteFolder(id: string): void {
//                 const node = this.manager.findNode(id);
//                 if (!node || !isFolder(node)) return;
//                 if (!confirm(`确定删除文件夹「${node.name}」及其所有内容吗？`)) return;
//                 this.manager.deleteNode(id);
//                 this.config.onDelete(id);
//             }
//             private addSubfolder(id: string): void {
//                 const parent = this.manager.findNode(id);
//                 if (!parent || !isFolder(parent)) return;
//                 const name = prompt('输入子文件夹名称');
//                 if (name && name.trim() !== '') {
//                     this.manager.addNode(id, { type: 'folder', name: name.trim(), children: [] });
//                     this.expandedFolders.add(id);
//                 }
//             }
//             private bindAddButtons(): void {
//                 this.addFolderBtn.addEventListener('click', () => {
//                     const name = prompt('输入文件夹名称');
//                     if (name && name.trim() !== '') {
//                         const newNode = this.manager.addNode('root', { type: 'folder', name: name.trim(), children: [] });
//                         this.expandedFolders.add(newNode.id);
//                     }
//                 });
//                 this.addItemBtn.addEventListener('click', () => {
//                     this.onAddItem('root');
//                 });
//             }
//             protected onAddItem(parentId: string): void {
//                 const name = prompt('输入名称');
//                 if (!name || name.trim() === '') return;
//                 const content = prompt('输入内容') || '';
//                 const extra = prompt('输入额外信息') || '';
//                 this.manager.addNode(parentId, {
//                     type: 'item',
//                     name: name.trim(),
//                     content: content,
//                     extra: extra
//                 } as any);
//             }
//             private updateBadge(): void {
//                 const count = this.manager.getRoot().children.length;
//                 this.badgeEl.textContent = count.toString();
//             }
//             public refresh(): void {
//                 this.renderList();
//                 this.updateBadge();
//             }
//             public getDataManager(): DataManager {
//                 return this.manager;
//             }
//         }
//         // ================================================================
//         //  4. 定理表与命题表
//         // ================================================================
//         class TheoremManager extends FlatTreeManager {
//             constructor(container: HTMLElement) {
//                 const initialData: TNode[] = [
//                     {
//                         id: 'f1',
//                         name: '几何',
//                         type: 'folder',
//                         children: [
//                             { id: 't1', name: '勾股定理', type: 'item', content: 'a² + b² = c²', category: '几何' },
//                             { id: 't2', name: '毕达哥拉斯', type: 'item', content: '直角三角形中...', category: '几何' }
//                         ]
//                     },
//                     {
//                         id: 'f2',
//                         name: '分析',
//                         type: 'folder',
//                         children: [
//                             { id: 't3', name: '牛顿-莱布尼茨', type: 'item', content: '∫ₐᵇ f(x) dx = F(b)-F(a)', category: '微积分' },
//                             { id: 't4', name: '泰勒定理', type: 'item', content: 'f(x) = Σ ...', category: '数学分析' }
//                         ]
//                     },
//                     { id: 't5', name: '欧拉公式', type: 'item', content: 'e^(ix) = cos x + i sin x', category: '复分析' },
//                     { id: 't6', name: '费马小定理', type: 'item', content: 'a^(p-1) ≡ 1 (mod p)', category: '数论' },
//                 ];
//                 super({
//                     container,
//                     data: initialData,
//                     nameWidth: '120px',
//                     contentMinWidth: '350px',
//                     extraWidth: '80px',
//                     actionsWidth: '40px',
//                     renderName: (item) => item.name,
//                     renderContent: (item) => {
//                         const span = document.createElement('span');
//                         let html = item.content || '';
//                         html = html
//                             .replace(/(\b(?:sin|cos|tan|log|ln|exp|sqrt|lim|sum|int|pi|e|i)\b)/gi,
//                                 '<span style="color:#7c3aed;font-weight:500;">$1</span>')
//                             .replace(/(\b(?:a|b|c|x|y|z|u|v|f|F|g|h|n|p|k|m|t)\b)(?=\s*[=+\-*/^])/g,
//                                 '<span style="color:#0f6b9e;font-weight:450;">$1</span>')
//                             .replace(/(\d+)/g, '<span style="color:#b45309;">$1</span>')
//                             .replace(/([=+\-*/^(){}[\]])/g, '<span style="color:#6b7280;">$1</span>')
//                             .replace(/\n/g, '<br>');
//                         span.innerHTML = html;
//                         return span;
//                     },
//                     renderExtra: (item) => {
//                         const colors: Record<string, string> = {
//                             '几何': '#dbeafe',
//                             '微积分': '#d1fae5',
//                             '复分析': '#fef3c7',
//                             '数论': '#fce4ec',
//                             '线性代数': '#e0e7ff',
//                             '数学分析': '#f3e8ff',
//                         };
//                         const bg = colors[item.category] || '#f1f5f9';
//                         const label = item.category || '未分类';
//                         const span = document.createElement('span');
//                         span.style.display = 'inline-block';
//                         span.style.width = '12px';
//                         span.style.height = '12px';
//                         span.style.borderRadius = '50%';
//                         span.style.background = bg;
//                         span.style.border = '1px solid #d1d9e6';
//                         span.title = label;
//                         return span;
//                     },
//                     itemMenuItems: [
//                         { label: '复制', icon: '📋', handler: (id) => { alert('复制功能示例'); } },
//                     ],
//                     folderMenuItems: [
//                         { label: '导出', icon: '📤', handler: (id) => { alert('导出示例'); } },
//                     ],
//                     onRename: (id, newName) => console.log('[定理] 重命名', id, newName),
//                     onDelete: (id) => console.log('[定理] 删除', id),
//                     allowDrag: true,
//                 });
//                 this.onAddItem = (parentId) => {
//                     const name = prompt('输入定理名称 (如 mp, axiom3)');
//                     if (!name || name.trim() === '') return;
//                     const content = prompt('输入公式 (如 x, y, z |- x)') || '';
//                     const category = prompt('输入分类 (如 命题逻辑)') || '未分类';
//                     this.getDataManager().addNode(parentId, {
//                         type: 'item',
//                         name: name.trim(),
//                         content: content,
//                         category: category
//                     } as any);
//                 };
//             }
//         }
//         class PropositionManager extends FlatTreeManager {
//             constructor(container: HTMLElement) {
//                 const initialData: TNode[] = [
//                     {
//                         id: 'pf1',
//                         name: '推导组1',
//                         type: 'folder',
//                         children: [
//                             { id: 'p1', name: 'p1', type: 'item', content: 'A → B', inference: '假设' },
//                             { id: 'p2', name: 'p2', type: 'item', content: 'A', inference: '假设' },
//                             { id: 'p3', name: 'p3', type: 'item', content: 'B', inference: 'mp p1 p2' },
//                         ]
//                     },
//                     { id: 'p4', name: 'p4', type: 'item', content: 'A ∧ B', inference: '∧引入' },
//                     { id: 'p5', name: 'p5', type: 'item', content: 'A ∨ B', inference: '∨引入 p4' },
//                 ];
//                 super({
//                     container,
//                     data: initialData,
//                     nameWidth: '80px',
//                     contentMinWidth: '300px',
//                     extraWidth: '140px',
//                     actionsWidth: '40px',
//                     renderName: (item) => item.name,
//                     renderContent: (item) => {
//                         const span = document.createElement('span');
//                         let html = item.content || '';
//                         html = html
//                             .replace(/(\b(?:A|B|C|P|Q|R|S|T)\b)/g,
//                                 '<span style="color:#0f6b9e;font-weight:500;">$1</span>')
//                             .replace(/([→∧∨¬⊢])/g, '<span style="color:#b45309;font-weight:600;">$1</span>');
//                         span.innerHTML = html;
//                         return span;
//                     },
//                     renderExtra: (item) => {
//                         const span = document.createElement('span');
//                         span.style.fontSize = '0.7rem';
//                         span.style.color = '#475569';
//                         span.style.background = '#f1f5f9';
//                         span.style.padding = '0.1rem 0.5rem';
//                         span.style.borderRadius = '12px';
//                         span.textContent = item.inference || '';
//                         return span;
//                     },
//                     itemMenuItems: [
//                         { label: '查看依赖', icon: '🔗', handler: (id) => { alert('依赖检查示例'); } },
//                     ],
//                     folderMenuItems: [
//                         { label: '折叠全部', icon: '📂', handler: (id) => { /* 示例 */ } },
//                     ],
//                     onRename: (id, newName) => console.log('[命题] 重命名', id, newName),
//                     onDelete: (id) => console.log('[命题] 删除', id),
//                     allowDrag: true,
//                 });
//                 this.onAddItem = (parentId) => {
//                     const name = prompt('输入命题名称 (如 p1)');
//                     if (!name || name.trim() === '') return;
//                     const content = prompt('输入公式内容') || '';
//                     const inference = prompt('输入推理步骤信息 (如 mp p1 p2)') || '';
//                     this.getDataManager().addNode(parentId, {
//                         type: 'item',
//                         name: name.trim(),
//                         content: content,
//                         inference: inference
//                     } as any);
//                 };
//             }
//         }
//         // ================================================================
//         //  5. 启动
//         // ================================================================
//         document.addEventListener('DOMContentLoaded', () => {
//             const theoremManager = new TheoremManager(document.getElementById('theoremManager')!);
//             const propManager = new PropositionManager(document.getElementById('propositionManager')!);
//             (window as any).__theoremManager = theoremManager;
//             (window as any).__propManager = propManager;
//             console.log('✅ 已启动，renderContent / renderExtra 返回 DOM 对象');
//         });
//# sourceMappingURL=listtest.js.map