import { LangMgr } from "../lang.js";
import { SyntaxEditor, SyntaxViewer } from "../astrender.js";
import { TreeListViewer } from "../listmgr.js";
import { TypeParser, setTokenCategories } from "./parser.js";
import { Core } from "./core.js";
import { initTypeSystem } from "./initial.js";
import { astToString } from "./kast.js";
// prefix 翻译：中文 类型/构造/解构/定义/计算，英文 TYPE/CTOR/IND/DEF/COMPUTE
export function ttPrefixName(prefix) {
    if (prefix === "type")
        return LangMgr.text.ttType;
    if (prefix === "ctor")
        return LangMgr.text.ttCtor;
    if (prefix === "ind")
        return LangMgr.text.ttInd;
    if (prefix === "def")
        return LangMgr.text.ttDef;
    if (prefix === "rule")
        return LangMgr.text.ttRule;
    return prefix;
}
// 系统表：按类型分组构建。每个 group 一个文件夹，文件夹内容 = 该类型的定义
// （组内第一条规则，kind=type 或 def），其余规则作为子节点。
export function buildSysData(rules) {
    const groups = new Map();
    for (const r of rules) {
        if (!groups.has(r.group))
            groups.set(r.group, []);
        groups.get(r.group).push(r);
    }
    const out = [];
    let uuid = 1;
    for (const [group, list] of groups) {
        const head = list[0];
        const children = list.slice(1);
        out.push({
            uuid: uuid++, name: head.kind, prefix: head.kind, content: head.text,
            children: children.length ? children.map(c => ({
                uuid: uuid++, name: c.kind, prefix: c.kind, content: c.text,
            })) : undefined,
        });
    }
    return out;
}
// 初始系统表数据：创造模式全量 HoTT 系统，其余模式最小集
export function initSysData(creative) {
    return buildSysData(initTypeSystem(creative));
}
// 从系统规则收集 token 分类：规则文本形如 `True:𝒰`、`true:True`、`@ind_Bool:Πu:𝒰@...`、`pred := ...`。
// 取 `:` 或 `:=` 前的名称作为该类别定义的原子（名称可数字开头，如 0b/1b/0Z）；无法提取则跳过。
function collectTokenCategories(rules) {
    const cats = { type: new Set(), ctor: new Set(), ind: new Set(), def: new Set() };
    for (const r of rules) {
        const m = /^([@A-Za-z_0-9][A-Za-z0-9_]*)\s*(?=:|:=)/.exec(r.text);
        if (!m)
            continue;
        const name = m[1];
        if (r.kind === 'type')
            cats.type.add(name);
        else if (r.kind === 'ctor')
            cats.ctor.add(name);
        else if (r.kind === 'ind')
            cats.ind.add(name);
        else if (r.kind === 'def')
            cats.def.add(name);
    }
    return cats;
}
export class TTGui {
    sysData = [];
    tableData = [];
    // 类型论核心：系统表注册 + 定理表检查
    core = new Core;
    creative;
    sysView;
    tableView;
    // 活动文件夹（定理表）：新命题默认添加到这里
    activeFolder = null;
    onchange;
    constructor(creative = false) {
        this.creative = creative;
        this.sysData = initSysData(creative);
        this.core.registerSystemRules(initTypeSystem(creative));
        this.applyTokenCategories();
        this.sysView = new TreeListViewer(this.sysData, document.getElementById('ttSysTable'));
        this.tableView = new TreeListViewer(this.tableData, document.getElementById('ttTable'));
        this.initSysView();
        this.initTableView();
        // TreeListViewer 构造时已用默认回调渲染过一次，重新设置回调后需刷新
        this.sysView.refresh();
        this.tableView.refresh();
    }
    // 系统表动态更新后调用：重算 token 分类并重绘（高亮随系统表 refresh）
    applyTokenCategories() {
        setTokenCategories(collectTokenCategories(initTypeSystem(this.creative)));
    }
    // ===== 系统表（只读） =====
    initSysView() {
        // 系统表菜单为空：不允许改名/删除/active
        this.sysView.menuItems = () => [];
        // 内容列显示规则正文（不含方括号）；文件夹显示自身 content（如 True:U）
        // 语法高亮：SyntaxViewer + TypeParser（不加模式参数，parse 只接收文本）
        this.sysView.renderContent = (node, span) => {
            new SyntaxViewer(span, new TypeParser, node.content);
        };
        // name 列显示 prefix 翻译
        this.sysView.renderName = node => ttPrefixName(node.prefix);
        // 额外列留空
        this.sysView.renderExtra = () => document.createTextNode("");
        // 系统表不允许拖动排序
        this.sysView.allowDrop = () => false;
        // 系统表不允许重命名
        this.sysView.onRename = () => false;
        // 系统表无 active 机制：不显示占位行
        this.sysView.showActivePlaceholder = false;
    }
    // ===== 定理表 =====
    initTableView() {
        // 内容列：用户输入内容（点击→编辑）+ 检查结果信息块跟在后面（浅色背景、点击不编辑、可选中复制）
        //  - 类型信息（定义/推断）：": " + SyntaxViewer 高亮的类型
        //  - 错误信息：浅红背景纯文本
        this.tableView.renderContent = (node, span) => {
            if (node.children) {
                span.textContent = node.content;
                return;
            }
            const content = document.createElement('span');
            content.className = 'tt-content-part';
            new SyntaxViewer(content, new TypeParser, node.content);
            span.appendChild(content);
            if (node.ttErr) {
                const info = document.createElement('span');
                info.className = 'tt-info tt-info-err';
                info.textContent = node.ttErr;
                span.appendChild(info);
            }
            else if (node.ttType !== undefined && node.ttType !== "✓") {
                const info = document.createElement('span');
                info.className = 'tt-info tt-info-type';
                info.appendChild(document.createTextNode(": "));
                const typeSpan = document.createElement('span');
                new SyntaxViewer(typeSpan, new TypeParser, node.ttType);
                info.appendChild(typeSpan);
                span.appendChild(info);
            }
        };
        // 额外列：只显示检查是否成功（✓/⚠），详细信息在内容列的信息块里
        this.tableView.renderExtra = node => {
            if (node.children)
                return document.createTextNode("");
            if (node.ttErr) {
                const s = document.createElement('span');
                s.className = 'tt-result tt-result-err';
                s.textContent = '⚠';
                return s;
            }
            if (node.ttType !== undefined) {
                const s = document.createElement('span');
                s.className = 'tt-result tt-result-ok';
                s.textContent = '✓';
                return s;
            }
            return document.createTextNode("");
        };
        // name 列只显示行号：完整树前序遍历编号（折叠的项也占行号）
        this.tableView.renderName = node => {
            let count = 0;
            const find = (list) => {
                for (const item of list) {
                    count++;
                    if (item === node)
                        return count;
                    if (item.children) {
                        const r = find(item.children);
                        if (r)
                            return r;
                    }
                }
                return 0;
            };
            return String(find(this.tableData));
        };
        // 渲染后：给叶子命题的内容列绑定点击→就地编辑内容（SyntaxEditor 语法高亮；文件夹内容列是展开/折叠，不绑定）
        // 类型/错误信息块（.tt-info）不触发编辑，便于选中复制
        this.tableView.onAfterRender = () => {
            const rowsContainer = document.getElementById('ttRows');
            rowsContainer?.querySelectorAll('.item-row:not(.folder-row) .cell-content').forEach(cell => {
                cell.addEventListener('click', (e) => {
                    const t = e.target;
                    if (t.closest('.cell-actions') || t.closest('.toggle-icon') || t.closest('input') || t.closest('.editor-container') || t.closest('.tt-info'))
                        return;
                    const row = cell.closest('.item-row');
                    const id = Number(row?.dataset.uuid);
                    if (!id)
                        return;
                    this.startContentEditById(id);
                });
            });
        };
        // 菜单：只有文件夹能重命名/active/删除；普通命题只有删除（无名字，行号不可改）
        this.tableView.menuItems = node => {
            const arr = [];
            if (node.children) {
                if (node === this.activeFolder) {
                    arr.push({ label: LangMgr.text.clearActiveFolder, action: "clearActiveFolder", icon: '⭐' });
                }
                else {
                    arr.push({ label: LangMgr.text.setActiveFolder, action: "setActiveFolder", icon: '⭐' });
                }
                arr.push({ label: LangMgr.text.rename, action: "rename", icon: '✏️' });
                arr.push({ label: LangMgr.text.delete, action: "delete", icon: '🗑️', danger: true });
            }
            else {
                arr.push({ label: LangMgr.text.delete, action: "delete", icon: '🗑️', danger: true });
            }
            return arr;
        };
        this.tableView.onMenuAction = (node, action) => {
            if (action === "setActiveFolder") {
                this.activeFolder = node;
                // 清除其它文件夹 active 标记
                const clearAll = (list) => {
                    for (const n of list) {
                        delete n.active;
                        if (n.children)
                            clearAll(n.children);
                    }
                };
                clearAll(this.tableData);
                node.active = true;
                this.tableView.refresh();
            }
            else if (action === "clearActiveFolder") {
                this.activeFolder = null;
                delete node.active;
                this.tableView.refresh();
            }
            else if (action === "delete") {
                this.tableView.deleteNode(node.uuid);
                if (this.activeFolder === node)
                    this.activeFolder = null;
                this.tableView.refresh();
                this.onchange?.();
            }
            // rename 由 TreeListViewer 内部处理（menuItemHandler）
        };
        // 重命名校验：命题/文件夹名随意（空不允许）
        this.tableView.onRename = (node, newName) => {
            if (!newName?.trim())
                return false;
            return true;
        };
        // 类型层：显示名在 content（name 列只显示行号），改名改 content
        this.tableView.itemNameOf = node => node.content;
        this.tableView.folderNameOf = node => node.content;
        this.tableView.renameItem = (node, newName) => { node.content = newName; return true; };
        this.tableView.renameFolder = (node, newName) => { node.content = newName; return true; };
        // 拖动排序：全部允许（系统允许）
        this.tableView.allowDrop = () => true;
        this.tableView.onAfterChange = () => this.onchange?.();
        // 活动文件夹折叠时：active 移到 root（TreeListViewer 已清 active 标记，这里同步 activeFolder）
        this.tableView.onFolderActiveCancel = () => {
            this.activeFolder = null;
        };
    }
    // 添加命题到定理表（默认添加到活动文件夹底部），返回新节点
    addItem(content) {
        const node = { uuid: this.tableView.idCounter++, name: "", content };
        if (this.activeFolder) {
            this.activeFolder.children ??= [];
            this.activeFolder.children.push(node);
        }
        else {
            this.tableData.push(node);
        }
        this.tableView.refresh();
        this.onchange?.();
        return node;
    }
    // 定理表条目提交后的类型检查：
    //   x := v / x := v : T → 定义（记录推断类型）
    //   a : T / a == b      → 断言（记录 ✓）
    //   裸表达式           → 推断（记录类型）
    // 失败记录 ttErr（渲染标红）；成功清除旧错误。
    checkAndMark(node) {
        delete node.ttErr;
        delete node.ttType;
        const text = node.content.trim();
        if (!text)
            return;
        try {
            const ast = this.core.parse(text);
            if (!ast)
                throw new Error(LangMgr.text.ttParseError);
            const r = this.core.run(ast);
            if (r.kind === "define" || r.kind === "infer") {
                node.ttType = astToString(r.type);
            }
            else {
                node.ttType = "✓";
            }
        }
        catch (e) {
            node.ttErr = e.message;
        }
    }
    // 递归检查整棵定理表（加载存档后重放检查）
    checkAll(list) {
        for (const n of list) {
            if (n.children)
                this.checkAll(n.children);
            else
                this.checkAndMark(n);
        }
    }
    // "+ 命题"按钮：添加一个空命题行并立即进入就地编辑（语法高亮）
    addNewItem() {
        const node = this.addItem("");
        this.tableView.refresh();
        // 找到该行内容列并开始就地编辑
        this.startContentEditById(node.uuid);
    }
    // 就地编辑内容：用 SyntaxEditor（语法高亮）替换内容列，失焦/Enter 提交，Esc 取消
    // 只替换用户输入部分（.tt-content-part）；类型/错误信息块移到编辑器旁保留，方便对照复制
    startContentEditById(id) {
        const row = document.querySelector(`#ttRows .item-row[data-uuid="${id}"]`);
        if (!row)
            return;
        const cell = row.querySelector('.cell-content');
        if (!cell)
            return;
        const inner = cell.querySelector('.inner');
        if (!inner)
            return;
        // 取出信息块（若有），编辑期间留在内容列尾部
        const info = inner.querySelector('.tt-info');
        if (info)
            inner.removeChild(info);
        // 内容列高亮容器
        cell.classList.add('tt-inline-edit');
        const mount = document.createElement('div');
        mount.style.flex = '1';
        inner.replaceWith(mount);
        if (info)
            cell.appendChild(info);
        // 就地编辑与显示一样用 TypeParser（不加模式参数）
        const editor = new SyntaxEditor(mount, new TypeParser, (this.findNode(id)?.content ?? ""));
        editor.onEnter = () => editor.blur();
        // 失焦提交
        const ta = editor.textarea;
        // textarea 自撑开：先压到 0 再读 scrollHeight = 真实内容高度
        // （height:auto 时 textarea 回到默认 2 行高，内容不满时 scrollHeight=clientHeight 读不到真实高度）
        const autoresize = () => {
            ta.style.height = "0";
            ta.style.height = ta.scrollHeight + "px";
        };
        ta.addEventListener('input', autoresize);
        // 初始高度：构造后立即（同步）撑开到真实高度，避免先 2 行高闪烁
        ta.rows = 1; // 减少默认 2 行的初始高度
        autoresize();
        // 兜底：确保布局完成后高度正确（防某些浏览器首次测量不准）
        requestAnimationFrame(() => { if (ta.isConnected)
            autoresize(); });
        editor.focus();
        const finish = () => {
            const val = editor.getValue().trim();
            const node = this.findNode(id);
            if (node) {
                if (val) {
                    node.content = val;
                    this.checkAndMark(node);
                }
                else {
                    this.tableView.deleteNode(id); // 空内容删除
                }
            }
            editor.destroy();
            this.tableView.refresh();
            this.onchange?.();
        };
        ta.addEventListener('blur', finish);
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                editor.setValue(this.findNode(id)?.content ?? "");
                editor.blur();
            }
        });
    }
    // 按 id 查找定理表节点
    findNode(id) {
        const search = (list) => {
            for (const n of list) {
                if (n.uuid === id)
                    return n;
                if (n.children) {
                    const r = search(n.children);
                    if (r)
                        return r;
                }
            }
            return null;
        };
        return search(this.tableData);
    }
    // 添加文件夹（+ 文件夹按钮）
    addFolder() {
        const folder = { uuid: this.tableView.idCounter++, name: "", content: LangMgr.text.newFolder, children: [] };
        // 新文件夹默认展开
        this.tableView.expandedFolders.add(folder.uuid);
        if (this.activeFolder) {
            this.activeFolder.children ??= [];
            this.activeFolder.children.push(folder);
        }
        else {
            this.tableData.push(folder);
        }
        this.tableView.refresh();
        // 立即改名
        this.tableView.startRename(folder);
        this.onchange?.();
    }
    refresh() {
        // 系统表可能动态更新：先重算 token 分类再重绘（高亮随系统表 refresh）
        this.applyTokenCategories();
        this.tableView.refresh();
        this.sysView.refresh();
    }
    serialize() {
        // 序列化定理表（不含行号、uuid）
        const clean = (list) => list.map(n => ({
            content: n.content,
            children: n.children ? clean(n.children) : undefined,
        }));
        // active 文件夹的扁平序索引（与 deserialize 的 flattenTable 对应）
        let active = -1;
        if (this.activeFolder) {
            active = this.flattenTable(this.tableData).indexOf(this.activeFolder);
        }
        return { table: clean(this.tableData), active };
    }
    // 扁平遍历（用于 serialize/deserialize 的 active 索引映射）
    flattenTable(list) {
        const out = [];
        const iter = (arr) => {
            for (const n of arr) {
                out.push(n);
                if (n.children)
                    iter(n.children);
            }
        };
        iter(list);
        return out;
    }
    deserialize(data) {
        if (!data?.table)
            return;
        // 清空并填充现有数组（TreeListViewer 持有同一引用，重新赋值会断引用）
        this.tableData.length = 0;
        const build = (arr) => arr.map(n => ({
            uuid: this.tableView.idCounter++, name: "", content: n.content,
            children: n.children ? build(n.children) : undefined,
        }));
        this.tableData.push(...build(data.table));
        // 恢复活动文件夹（active = 扁平序索引，-1 无）
        this.activeFolder = null;
        if (typeof data.active === "number" && data.active >= 0) {
            const target = this.flattenTable(this.tableData)[data.active];
            if (target && target.children) {
                this.activeFolder = target;
                target.active = true;
            }
        }
        // 重放类型检查（顺序敏感：前面的定义可被后面的引用）
        this.checkAll(this.tableData);
        this.tableView.refresh();
    }
}
//# sourceMappingURL=gui.js.map