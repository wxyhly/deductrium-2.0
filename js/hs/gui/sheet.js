import { HSParser } from "../core/parser.js";
import { LangMgr } from "../../lang.js";
// sheet页签UI：负责tab栏渲染与全部sheet操作逻辑（切换/新建/删除/重命名/保存）
// 数据操作直接作用于注入的hilbertSystem；需要刷新列表UI时才通知HSLayer回调
export class SheetGui {
    sheets = [];
    activeIndex = 0;
    container = null;
    longPressDelay = 500;
    hs;
    // 拖拽排序状态（鼠标HTML5拖放 + 触摸长按拖拽共用）
    dragIndex = null;
    dragEl = null;
    touchDrag = false;
    suppressClick = false;
    longPressTimer = null;
    touchStartX = 0;
    touchStartY = 0;
    // 拖拽中最后已知的触点位置（touchcancel可能不带坐标时回退用）
    lastTouchX = 0;
    lastTouchY = 0;
    // 双击改名检测：手机端dblclick不可靠，统一用两次click间隔（<300ms）判定
    lastClickIndex = -1;
    lastClickTime = 0;
    // HSLayer注入的回调
    onRefresh = () => { }; // 切换/增删后刷新props列表UI
    onChange = () => { }; // 数据变更通知（自动保存）
    // 展开状态捕获/恢复（id与uuid的互转依赖propListView与Proposition，由HSLayer实现）
    captureExpanded = () => [];
    restoreExpanded = () => { };
    // 操作守卫：命令执行中禁止切换/新建/删除；返回false则中断（守卫内部已上报错误）
    guard = () => true;
    constructor(hs) {
        this.hs = hs;
        this.container = document.getElementById('propSheetTabs');
        this.sheets = [{ name: LangMgr.text.defaultSheetName + " 1", ctx: hs.saveContext(), pe: [] }];
        this.initRowHighlight();
        this.bindEvents();
    }
    // ---- 推理表行高亮（纯显示层，不改逻辑；不依赖 propListView，只操作 propRows DOM） ----
    // 无 relyAfter 的步骤标淡黄；悬停某步骤时其 relyBefore 行标红、relyAfter 行标蓝。
    // props 是嵌套树（文件夹 children），必须递归查找。
    findProp(uuid, list = this.hs.props) {
        for (const p of list) {
            if (p.uuid === uuid)
                return p;
            if (p.children) {
                const found = this.findProp(uuid, p.children);
                if (found)
                    return found;
            }
        }
        return undefined;
    }
    // 渲染完成后调用：为无 relyAfter 的行加淡黄 class（TreeListViewer 渲染后再执行）
    applyRowHighlight() {
        const rows = document.getElementById('propRows');
        if (!rows)
            return;
        for (const row of Array.from(rows.querySelectorAll('.item-row'))) {
            const uuid = Number(row.dataset.uuid);
            if (!uuid)
                continue;
            const p = this.findProp(uuid);
            if (p && p.from.type !== "f" && p.from.type !== "c" && p.from.type !== "v" && !p.relyAfter?.length) {
                row.classList.add('row-no-relyafter');
            }
        }
    }
    // 悬停依赖高亮：鼠标移到某步骤时其 relyBefore 行标红、relyAfter 行标蓝，移开清除
    initRowHighlight() {
        const propRowsBox = document.getElementById('propRows');
        if (!propRowsBox)
            return;
        let hoverUuid = 0;
        const clearDepHighlight = () => {
            propRowsBox.querySelectorAll('.row-dep-before, .row-dep-after').forEach(el => el.classList.remove('row-dep-before', 'row-dep-after'));
        };
        propRowsBox.addEventListener('mouseover', (e) => {
            const row = e.target.closest('.item-row');
            if (!row)
                return;
            const uuid = Number(row.dataset.uuid);
            if (!uuid || uuid === hoverUuid)
                return;
            hoverUuid = uuid;
            clearDepHighlight();
            const p = this.findProp(uuid);
            if (!p)
                return;
            const mark = (dep, cls) => {
                if (!dep)
                    return;
                for (const d of dep) {
                    if (d.uuid) {
                        const r = propRowsBox.querySelector(`.item-row[data-uuid="${d.uuid}"]`);
                        r?.classList.add(cls);
                    }
                }
            };
            mark(p.relyBefore, 'row-dep-before');
            mark(p.relyAfter, 'row-dep-after');
        });
        propRowsBox.addEventListener('mouseout', (e) => {
            const to = e.relatedTarget;
            if (to && propRowsBox.contains(to))
                return;
            hoverUuid = 0;
            clearDepHighlight();
        });
    }
    // 新建一张空表（仅构造数据，不切换）；默认名重复则序号加一，保证不重名
    newSheet() {
        const base = LangMgr.text.defaultSheetName;
        const used = new Set(this.sheets.map(s => s.name));
        let n = 1;
        while (used.has(base + " " + n))
            n++;
        return { name: base + " " + n, ctx: this.hs.createEmptyContext(), pe: [] };
    }
    // 把当前激活sheet的最新状态写回context与pe
    saveCurrentSheet() {
        const s = this.sheets[this.activeIndex];
        if (!s)
            return;
        s.ctx = this.hs.saveContext();
        s.pe = this.captureExpanded();
    }
    switchSheet(index) {
        if (index === this.activeIndex)
            return;
        const target = this.sheets[index];
        if (!target)
            return;
        if (!this.guard())
            return;
        this.saveCurrentSheet();
        this.activeIndex = index;
        this.hs.loadContext(target.ctx);
        this.restoreExpanded(target.pe);
        this.afterChange();
    }
    addSheet() {
        if (!this.guard())
            return;
        this.saveCurrentSheet();
        const sheet = this.newSheet();
        this.sheets.push(sheet);
        this.activeIndex = this.sheets.length - 1;
        this.hs.loadContext(sheet.ctx);
        this.restoreExpanded([]);
        this.afterChange();
    }
    removeSheet(index) {
        if (!this.guard())
            return;
        this.saveCurrentSheet(); // 确保被删sheet的ctx最新（若删的是激活表）
        const target = this.sheets[index];
        if (!target)
            return;
        // 空表（无props）直接删，不弹确认
        if (target.ctx.props.length !== 0 && !confirm(LangMgr.text.confirmDeleteSheet))
            return;
        // 只剩一张表：删除当前表并新建空白表（等效于清空）
        if (this.sheets.length <= 1) {
            this.sheets = [{ name: LangMgr.text.defaultSheetName + " 1", ctx: this.hs.createEmptyContext(), pe: [] }];
            this.activeIndex = 0;
            this.hs.loadContext(this.sheets[0].ctx);
            this.restoreExpanded([]);
            this.afterChange();
            return;
        }
        const wasActive = index === this.activeIndex;
        this.sheets.splice(index, 1);
        if (wasActive) {
            this.activeIndex = Math.min(index, this.sheets.length - 1);
            const next = this.sheets[this.activeIndex];
            this.hs.loadContext(next.ctx);
            this.restoreExpanded(next.pe);
        }
        this.afterChange();
    }
    renameSheet(index, name) {
        const s = this.sheets[index];
        if (!s)
            return;
        s.name = name.trim() || s.name;
        this.render();
        this.onChange?.();
    }
    afterChange() {
        this.render();
        this.onRefresh?.();
        this.onChange?.();
    }
    render() {
        const container = this.container;
        if (!container)
            return;
        container.innerHTML = "";
        const frag = document.createDocumentFragment();
        this.sheets.forEach((s, i) => {
            const tab = document.createElement('div');
            tab.className = 'sheet-tab' + (i === this.activeIndex ? ' active' : '');
            tab.dataset.sheetIndex = String(i);
            tab.title = s.name;
            tab.draggable = true;
            const name = document.createElement('span');
            name.className = 'sheet-tab-name';
            name.textContent = s.name;
            const close = document.createElement('button');
            close.className = 'sheet-tab-close';
            close.textContent = '×';
            close.title = LangMgr.text.deleteSheet;
            tab.append(name, close);
            frag.appendChild(tab);
        });
        const add = document.createElement('button');
        add.className = 'sheet-tab-add';
        add.textContent = '+';
        add.title = LangMgr.text.newSheet;
        frag.appendChild(add);
        container.appendChild(frag);
    }
    bindEvents() {
        const container = this.container;
        if (!container)
            return;
        // 切换/新建/删除 + 双击改名（不依赖dblclick：手机端不可靠，统一用两次click间隔判定）
        container.addEventListener('click', e => {
            const t = e.target;
            const close = t.closest('.sheet-tab-close');
            if (close) {
                this.removeSheet(Number(close.parentElement?.dataset.sheetIndex));
                return;
            }
            if (t.closest('.sheet-tab-add')) {
                this.addSheet();
                return;
            }
            const tab = t.closest('.sheet-tab');
            if (!tab)
                return;
            const index = Number(tab.dataset.sheetIndex);
            const now = Date.now();
            if (this.lastClickIndex === index && now - this.lastClickTime < 300) {
                // 双击同一页签 → 改名
                this.lastClickIndex = -1;
                this.startRename(index, tab);
                return;
            }
            this.lastClickIndex = index;
            this.lastClickTime = now;
            this.switchSheet(index);
        });
        // 拖拽排序 + 拖到"+"上复制（鼠标：HTML5拖放）
        container.addEventListener('dragstart', e => {
            const t = e.target;
            if (t.closest('.sheet-tab-close')) {
                e.preventDefault();
                return;
            }
            const tab = t.closest('.sheet-tab');
            if (!tab) {
                e.preventDefault();
                return;
            }
            const from = Number(tab.dataset.sheetIndex);
            if (isNaN(from)) {
                e.preventDefault();
                return;
            }
            this.dragIndex = from;
            this.dragEl = tab;
            tab.classList.add('dragging');
            // 真机(iOS等)长按draggable元素会激活原生HTML5拖放、吞掉触摸事件流→touchend不触发→换位/复制失效。
            // touchstart里已禁用draggable，正常不会走到这里（只有桌面鼠标会）
            e.dataTransfer.effectAllowed = 'copyMove';
            e.dataTransfer.setData('text/plain', String(from));
        });
        container.addEventListener('dragover', e => {
            if (this.dragIndex === null)
                return;
            e.preventDefault();
            const t = e.target;
            const add = t.closest('.sheet-tab-add');
            if (add) {
                this.clearDropMarks();
                add.classList.add('drop-copy');
                e.dataTransfer.dropEffect = 'copy';
                return;
            }
            const tab = t.closest('.sheet-tab');
            if (!tab) {
                this.clearDropMarks();
                return;
            }
            const to = Number(tab.dataset.sheetIndex);
            if (to === this.dragIndex) {
                this.clearDropMarks();
                return;
            }
            const rect = tab.getBoundingClientRect();
            const before = e.clientX < rect.left + rect.width / 2;
            this.clearDropMarks();
            tab.classList.add(before ? 'drop-left' : 'drop-right');
            e.dataTransfer.dropEffect = 'move';
        });
        container.addEventListener('drop', e => {
            e.preventDefault();
            const from = this.dragIndex;
            if (from === null)
                return;
            const t = e.target;
            const add = t.closest('.sheet-tab-add');
            if (add) {
                this.finishDrag();
                this.duplicateSheet(from);
                return;
            }
            const tab = t.closest('.sheet-tab');
            if (tab) {
                const to = Number(tab.dataset.sheetIndex);
                const before = tab.classList.contains('drop-left');
                this.finishDrag();
                if (to !== from)
                    this.reorderSheets(from, to, before);
                return;
            }
            this.finishDrag();
        });
        container.addEventListener('dragend', () => this.finishDrag());
        // 触摸拖拽：长按进入拖拽（原长按改名改为双击改名）；移动超过阈值取消长按以便滚动页签栏
        container.addEventListener('touchstart', e => {
            // 每次触点落下先复位抑制标记：若上次拖拽后浏览器没合成click（touchend已preventDefault），
            // 不能让残留的suppressClick吞掉本次正常点击
            this.suppressClick = false;
            const t = e.target;
            if (t.closest('.sheet-tab-close') || t.closest('.sheet-tab-add'))
                return;
            const tab = t.closest('.sheet-tab');
            if (!tab)
                return;
            // 关键：立即禁用原生draggable，阻止iOS长按启动原生HTML5拖放（它会吞掉touchend，
            // 导致performDrop/换位/复制永远不执行，只剩dragend+finishDrag）。桌面鼠标无touchstart，draggable保持true。
            tab.draggable = false;
            const touch = e.touches[0];
            this.touchStartX = touch.clientX;
            this.touchStartY = touch.clientY;
            if (this.longPressTimer !== null) {
                window.clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            const index = Number(tab.dataset.sheetIndex);
            this.longPressTimer = window.setTimeout(() => {
                this.longPressTimer = null;
                this.touchDrag = true;
                this.dragIndex = index;
                this.dragEl = tab;
                tab.classList.add('dragging');
                // 进入拖拽后清掉单击记录：防止“先单击A、再拖拽B”后的合成click被误判为双击改名
                this.lastClickIndex = -1;
                if (navigator.vibrate)
                    navigator.vibrate(20);
                document.addEventListener('touchmove', this.preventScroll, { passive: false });
            }, this.longPressDelay);
        }, { passive: true });
        container.addEventListener('touchmove', e => {
            if (this.touchDrag) {
                e.preventDefault();
                const touch = e.touches[0];
                this.lastTouchX = touch.clientX;
                this.lastTouchY = touch.clientY;
                const el = document.elementFromPoint(touch.clientX, touch.clientY);
                const add = el?.closest('.sheet-tab-add');
                if (add) {
                    this.clearDropMarks();
                    add.classList.add('drop-copy');
                    return;
                }
                const tab = el?.closest('.sheet-tab');
                if (!tab || tab === this.dragEl) {
                    this.clearDropMarks();
                    return;
                }
                const to = Number(tab.dataset.sheetIndex);
                if (to === this.dragIndex) {
                    this.clearDropMarks();
                    return;
                }
                const rect = tab.getBoundingClientRect();
                const before = touch.clientX < rect.left + rect.width / 2;
                this.clearDropMarks();
                tab.classList.add(before ? 'drop-left' : 'drop-right');
            }
            else if (this.longPressTimer !== null) {
                const touch = e.touches[0];
                const dx = touch.clientX - this.touchStartX;
                const dy = touch.clientY - this.touchStartY;
                if (dx * dx + dy * dy > 100) {
                    window.clearTimeout(this.longPressTimer);
                    this.longPressTimer = null;
                }
            }
        }, { passive: false });
        container.addEventListener('touchend', e => {
            if (this.longPressTimer !== null) {
                window.clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            if (!this.touchDrag)
                return;
            e.preventDefault();
            this.suppressClick = true;
            const t = e.changedTouches[0];
            this.performDrop(t ? t.clientX : this.lastTouchX, t ? t.clientY : this.lastTouchY);
        });
        container.addEventListener('touchcancel', e => {
            // 真机上浏览器可能因手势识别/系统手势发touchcancel而非touchend，
            // 此时也要执行drop（换位/复制），不能只finishDrag
            if (!this.touchDrag) {
                this.finishDrag();
                return;
            }
            const t = e.changedTouches[0];
            this.performDrop(t ? t.clientX : this.lastTouchX, t ? t.clientY : this.lastTouchY);
        });
        // 触摸拖拽结束后抑制随之而来的click，防止误切换；下一轮宏任务即复位
        container.addEventListener('click', e => {
            if (this.suppressClick) {
                e.preventDefault();
                e.stopPropagation();
                this.suppressClick = false;
                window.setTimeout(() => { this.suppressClick = false; }, 0);
            }
        }, true);
        // 阻止长按弹出浏览器原生菜单
        container.addEventListener('contextmenu', e => {
            const t = e.target;
            if (t.closest('.sheet-tab') || t.closest('.sheet-tab-add'))
                e.preventDefault();
        });
    }
    // ===== 拖拽排序 / 复制 =====
    // 把from位置的表移到to位置（before=插到目标前，否则目标后）
    reorderSheets(from, to, before) {
        if (from === to)
            return;
        if (!this.guard())
            return;
        this.saveCurrentSheet();
        const active = this.sheets[this.activeIndex];
        const [moved] = this.sheets.splice(from, 1);
        const target = from < to ? (before ? to - 1 : to) : (before ? to : to + 1);
        this.sheets.splice(target, 0, moved);
        // activeIndex按对象身份修正：重排前后指向同一张表
        if (active)
            this.activeIndex = this.sheets.indexOf(active);
        this.render();
        this.onChange?.();
    }
    // 复制表：拖动到"+"上触发；props经命令序列化→重放实现深拷贝，与原表无共享引用（rules全局共用）
    duplicateSheet(index) {
        if (!this.guard())
            return;
        this.saveCurrentSheet(); // 保证源表ctx最新（源表可能是激活表）
        const src = this.sheets[index];
        if (!src)
            return;
        const sheet = this.newSheet();
        const used = new Set(this.sheets.map(s => s.name));
        let n = 2;
        while (used.has(`${src.name} (${n})`))
            n++;
        sheet.name = `${src.name} (${n})`;
        sheet.ctx = this.cloneContext(src.ctx);
        sheet.pe = [...src.pe];
        this.sheets.push(sheet);
        this.activeIndex = this.sheets.length - 1;
        this.hs.loadContext(sheet.ctx);
        this.restoreExpanded(sheet.pe);
        this.afterChange();
    }
    // 深拷贝props上下文（与存档恢复同路径，见serde.deserializeSheets）
    cloneContext(ctx) {
        const saved = this.hs.saveContext();
        this.hs.loadContext(this.hs.createEmptyContext());
        try {
            this.hs.fromCmd(this.hs.genCmd(ctx.props).map(c => new HSParser().parse(c, "cmd")));
        }
        catch (e) {
            // 源props是合法状态，正常不会失败；失败则退回空表
            this.hs.clear();
        }
        const cloned = this.hs.saveContext();
        this.hs.loadContext(saved);
        return cloned;
    }
    // 依据触点坐标执行放置（touchend/touchcancel共用）：拖到+上复制、拖到页签上换位
    performDrop(x, y) {
        const from = this.dragIndex;
        if (from === null) {
            this.finishDrag();
            return;
        }
        const el = document.elementFromPoint(x, y);
        const add = el?.closest('.sheet-tab-add');
        if (add) {
            this.finishDrag();
            this.duplicateSheet(from);
            return;
        }
        const tab = el?.closest('.sheet-tab');
        if (tab) {
            const to = Number(tab.dataset.sheetIndex);
            const before = tab.classList.contains('drop-left');
            this.finishDrag();
            if (to !== from)
                this.reorderSheets(from, to, before);
            return;
        }
        this.finishDrag();
    }
    finishDrag() {
        // 必须清掉长按定时器：若浏览器在定时器触发前就touchcancel（判定为滚动等），
        // 残留的定时器会在触摸结束后才触发 → dragEl卡在dragging、preventScroll常驻document → 页签栏卡死
        if (this.longPressTimer !== null) {
            window.clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        this.lastClickIndex = -1;
        document.removeEventListener('touchmove', this.preventScroll);
        if (this.dragEl) {
            this.dragEl.classList.remove('dragging');
            this.dragEl.draggable = true;
            this.dragEl = null;
        }
        this.dragIndex = null;
        this.touchDrag = false;
        this.clearDropMarks();
    }
    clearDropMarks() {
        this.container?.querySelectorAll('.sheet-tab.drop-left, .sheet-tab.drop-right, .sheet-tab-add.drop-copy')
            .forEach(el => el.classList.remove('drop-left', 'drop-right', 'drop-copy'));
    }
    preventScroll = (e) => { e.preventDefault(); };
    startRename(index, tab) {
        const nameEl = tab.querySelector('.sheet-tab-name');
        if (!nameEl)
            return;
        const orig = nameEl.textContent || "";
        const input = document.createElement('input');
        input.className = 'sheet-tab-input';
        input.value = orig;
        tab.replaceChild(input, nameEl);
        input.focus();
        input.select();
        const done = () => this.renameSheet(index, input.value);
        input.addEventListener('blur', done);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter')
                input.blur();
            if (e.key === 'Escape') {
                input.value = orig;
                input.blur();
            }
        });
    }
}
//# sourceMappingURL=sheet.js.map