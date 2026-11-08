import { LangMgr } from "../lang.js";
import { knowledgeBase } from "./kb.js";
import { HSParser } from "../hs/core/parser.js";
import { SyntaxViewer } from "../astrender.js";
import { ModManager } from "./mods.js";
// ==================== 成就列表 ====================
// identifier 二维数组：每行 6 个（GUI 中一行；窄屏自动换列，逻辑不变）
// identifier 与 tile.data.ac 对应；方块成就通过"通过该方块"触发；
// 非方块成就（经济/序数等）由 game.ts 单独调用 finishAchievement
export const achievementRows = [
    ["progL", "aa", "delgate", ".i", "hyp", "mdt"],
    ["firstEat", "firstPay", "neg", ".dne", "exfalso1", "iff"],
    ["vegan40", "andor", "lem", "contra", "pierce", "mcpt"],
    ["1st", "nf", "rp", "a7", "mvt", ".prop"],
    ["mifft", "terr1", ".1st", "elV1", "mnt", "dose1mg"],
    ["peano", "1+1", "2x2", "commu+", "xdistr", "dose1g"],
    ["3<4", "5R6", "dPrime", "prm7", "ex!", "infprm"],
    ["type", "ttrue", "ttsimplFn", "ttactic1", "ttEq", "ttindnat"],
    ["AllTrue", "tt1+1", "ttindeq", "0+x", "1neq2", "tt5R7"],
    ["S1S1", "eqvid", "ttua", "looprfl", "ttpierce", "lemlie"],
    ["ttEven", "ttList", "ttZ", ":=factorial2", "tteven0", "ttWnat"],
    ["ttfnext", "ttNoFnext", "Bool=Bool=Bool", "isequivP", "infhotel", "permMaster"],
    ["ttPathElim", "ttPoint", "ttSetNat", "ttdrawS1", "pi1S1", "hopf1"],
    ["aExt", ".<i", "empty", ".zfc", "UUII", "w2"],
    ["d()", "dSd0", "dX", "dZ", "dQ", "dR"],
    ["a@a", "allZFC", "delAl", "vwo", "w4", "critical"],
];
// 全部成就 identifier 集合（供判定行是否解锁）
const achievementFlat = new Set(achievementRows.flat());
// ==================== 知识库 identifier ====================
// 知识库条目统一 identifier：符号 → "sym:xxx"，机制 → "mec:xxx"
// 也接受裸 identifier（如 "#p"、"→"、"dG"），自动映射到对应前缀
export function kbFullId(id) {
    if (id.startsWith("sym:") || id.startsWith("mec:"))
        return id;
    if (id in knowledgeBase.syms)
        return "sym:" + id;
    if (id in knowledgeBase.mecanism)
        return "mec:" + id;
    return id; // 未知 identifier 原样返回
}
// 知识库条目完整 identifier 列表
export const kbAllIds = [
    ...Object.keys(knowledgeBase.syms).map(k => "sym:" + k),
    ...Object.keys(knowledgeBase.mecanism).map(k => "mec:" + k),
];
// 从 "[zh]标题：正文 [en]Title: body" 解析当前语言的标题与正文：
// 标题 = 第一个"："（或英文":"）前的内容；无冒号则标题为空、整段为正文
export function kbSplitTitle(bilingual) {
    const seg = (lang) => {
        const m = bilingual.match(new RegExp(`\\[${lang}\\]([\\s\\S]*?)(?=\\[(?:zh|en)\\]|$)`));
        return m ? m[1] : "";
    };
    const split = (s) => {
        const m = s.match(/^(.+?)[：:]\s*/);
        return m ? { title: m[1], body: s.slice(m[0].length) } : { title: "", body: s };
    };
    const primary = seg(LangMgr.lang === "zh" ? "zh" : "en");
    const other = seg(LangMgr.lang === "zh" ? "en" : "zh");
    const r = split(primary);
    if (r.title)
        return r;
    const ro = split(other);
    // 标题从另一语言取，正文用当前语言
    if (ro.title)
        return { title: ro.title, body: primary || ro.body };
    return r;
}
// ==================== 进度层（P-layer） ====================
// 功能：
//   1. 4 个存档槽位（各存单独 localStorage key）：保存当前进度/加载槽位
//   2. 导出槽位或当前进度为 .dt 文件；导入 .dt 文件（先导入到当前进度再使用）
//   3. 语言选择（localStorage "lang"：en/zh，无该 key = 跟随系统）
// 语言更改、导入/加载槽位后都需要刷新页面（刷新前保存当前进度防丢数据）。
export class ProgressLayer {
    saveload;
    slotKeys = [];
    refreshTimer = null;
    mode;
    // 查询回调（game.ts 注入，替代 window 全局变量）：
    // isAchievementGot: 成就是否已获得；isInfoGot: 知识库 identifier 是否已解锁
    isAchievementGot;
    isInfoGot;
    constructor(saveload, mode, isAchievementGot, isInfoGot) {
        this.saveload = saveload;
        this.mode = mode;
        this.isAchievementGot = isAchievementGot ?? (() => false);
        this.isInfoGot = isInfoGot ?? (() => false);
        this.slotKeys = [0, 1, 2, 3].map(i => this.saveload.slotKey(i));
        this.init();
    }
    init() {
        new ModManager(this.saveload);
        this.renderMode();
        this.renderLanguage();
        this.renderSlots();
        this.renderAchievements();
        this.renderSymbols();
        this.renderKnowledge();
        this.bindEvents();
        this.initCollapsibleCards();
    }
    // ===== 卡片折叠/展开 =====
    // 点击 .pg-card 的 .card-header 折叠/展开卡片（带过渡动画，参考推理层面板逻辑；
    // 不需要拖动 resize）。用 max-height 过渡（.pg-card 是 flex 子项，height 会被
    // 父容器 stretch 覆盖，max-height 不受影响）。点击 header 内按钮等不触发。
    initCollapsibleCards() {
        const collapsedHeight = 54; // 折叠后只露出 header
        document.querySelectorAll(".pg-card").forEach(card => {
            const header = card.querySelector(".card-header");
            const toggleHandle = header?.querySelector("h2");
            if (!toggleHandle)
                return;
            let isCollapsed = false;
            const toggle = () => {
                card.classList.add("smooth-height");
                if (isCollapsed) {
                    // 展开：max-height 恢复到内容高度（大值），过渡后清除
                    card.style.maxHeight = "1000px";
                    card.classList.remove("pg-card-collapsed");
                    isCollapsed = false;
                }
                else {
                    // 收起：先设内容高度上限，下一帧再折叠（触发过渡；无动画环境也应用最终值）
                    card.style.maxHeight = "1000px";
                    setTimeout(() => {
                        card.style.maxHeight = collapsedHeight + "px";
                        isCollapsed = true;
                        card.classList.add("pg-card-collapsed");
                    }, 10);
                }
                // 过渡结束后清理（transitionend + setTimeout 兜底，兼容无动画环境）
                const done = () => {
                    if (!isCollapsed)
                        card.style.maxHeight = "";
                    card.classList.remove("smooth-height");
                };
                card.addEventListener("transitionend", done, { once: true });
                setTimeout(done, 350);
            };
            toggleHandle.addEventListener("click", (e) => {
                const target = e.target;
                // 点击 header 内按钮/下拉/操作区不触发展开/收起
                if (target.closest(".btn-sm, .dropdown-trigger, .actions, .dropdown-menu, button, input, select"))
                    return;
                toggle();
            });
        });
    }
    renderMode() {
        const el = document.getElementById("pg-mode");
        if (!el)
            return;
        el.textContent = this.mode === "creative" ? LangMgr.text.modeCreative : LangMgr.text.modeSurvival;
    }
    // ===== 语言 =====
    renderLanguage() {
        const select = document.getElementById("pg-lang");
        if (!select)
            return;
        const lang = localStorage.getItem("lang");
        select.value = lang && ["zh", "en"].includes(lang) ? lang : "auto";
    }
    bindEvents() {
        const select = document.getElementById("pg-lang");
        if (select) {
            select.addEventListener("change", () => {
                const v = select.value;
                const prev = localStorage.getItem("lang");
                if (v === "auto") {
                    if (prev)
                        localStorage.removeItem("lang");
                }
                else {
                    localStorage.setItem("lang", v);
                }
                if (prev !== (v === "auto" ? null : v))
                    this.scheduleRefresh();
            });
        }
        // 导出当前进度
        const exportBtn = document.getElementById("pg-export");
        exportBtn?.addEventListener("click", () => this.exportCurrent());
        // 导入文件（用户打开文件对话框选文件，不太会误碰，无需 confirm）
        const importBtn = document.getElementById("pg-import");
        const fileInput = document.getElementById("pg-import-file");
        importBtn?.addEventListener("click", () => fileInput?.click());
        fileInput?.addEventListener("change", () => {
            const file = fileInput.files?.[0];
            if (!file)
                return;
            const reader = new FileReader();
            reader.onload = () => {
                const text = String(reader.result || "");
                const ok = this.saveload.loadFromString(text);
                if (ok) {
                    this.scheduleRefresh();
                }
                else {
                    alert(LangMgr.text.importFailed);
                }
                fileInput.value = "";
            };
            reader.readAsText(file);
        });
        // 重置进度
        const resetBtn = document.getElementById("pg-reset");
        resetBtn?.addEventListener("click", () => {
            if (!confirm(LangMgr.text.resetConfirm))
                return;
            // 先取消排定的延时保存：否则旧的 notifySave timer 可能在刷新生效前
            // 触发 save()，把未重置的当前进度写回 localStorage，导致重置失败
            this.saveload.cancelPendingSave();
            localStorage.removeItem(this.saveloadKey());
            this.scheduleRefresh();
        });
    }
    // ===== 槽位 =====
    renderSlots() {
        const container = document.getElementById("pg-slots");
        if (!container)
            return;
        container.innerHTML = "";
        this.slotKeys.forEach((key, i) => {
            const meta = this.saveload.keyMeta(key);
            const card = document.createElement("div");
            card.className = "pg-slot" + (meta ? "" : " empty");
            const title = document.createElement("div");
            title.className = "pg-slot-title";
            title.textContent = `#${i + 1}`;
            const info = document.createElement("div");
            info.className = "pg-slot-info";
            if (meta) {
                const d = new Date(meta.timestamp);
                const modeTxt = meta.mode === "creative" ? LangMgr.text.modeCreative : LangMgr.text.modeSurvival;
                const time = d.toLocaleString();
                const size = this.fmtSize(meta.size);
                // 模式 · 时间 · 大小（压缩后）
                info.textContent = LangMgr.text.slotInfo
                    .replace("{mode}", modeTxt).replace("{time}", time).replace("{size}", size);
            }
            else {
                info.textContent = LangMgr.text.slotEmpty;
            }
            const actions = document.createElement("div");
            actions.className = "pg-slot-actions";
            const btnSave = document.createElement("button");
            btnSave.className = "btn-sm";
            btnSave.textContent = LangMgr.text.saveShort;
            btnSave.addEventListener("click", () => {
                if (meta && !confirm(LangMgr.text.overwriteSlotConfirm))
                    return;
                this.saveload.save(); // 先更新主存档
                this.saveload.saveToKey(key); // 再拷贝到槽位
                this.renderSlots();
            });
            const btnLoad = document.createElement("button");
            btnLoad.className = "btn-sm";
            btnLoad.textContent = LangMgr.text.loadShort;
            btnLoad.disabled = !meta;
            btnLoad.addEventListener("click", () => {
                const data = this.saveload.readKey(key);
                if (!data)
                    return;
                // 槽位可能来自另一模式：确认时明确指出将覆盖哪个模式的进度
                const slotMeta = this.saveload.keyMeta(key);
                const slotMode = slotMeta?.mode ?? this.mode;
                if (!confirm(LangMgr.formalize.loadSlotConfirm(slotMode, this.mode)))
                    return;
                if (this.saveload.loadFromString(data))
                    this.scheduleRefresh();
                else
                    alert(LangMgr.text.importFailed);
            });
            const btnExport = document.createElement("button");
            btnExport.className = "btn-sm";
            btnExport.textContent = LangMgr.text.exportShort;
            btnExport.disabled = !meta;
            btnExport.addEventListener("click", () => this.exportSlot(key, i));
            const btnDelete = document.createElement("button");
            btnDelete.className = "btn-sm pg-slot-delete";
            btnDelete.textContent = LangMgr.text.delete;
            btnDelete.disabled = !meta;
            btnDelete.addEventListener("click", () => {
                if (!confirm(LangMgr.text.deleteSlotConfirm))
                    return;
                localStorage.removeItem(key);
                this.renderSlots();
            });
            // 空槽位只显示保存按钮；非空才显示加载/导出/删除
            if (meta) {
                actions.append(btnSave, btnLoad, btnExport, btnDelete);
            }
            else {
                actions.append(btnSave);
            }
            card.append(title, info, actions);
            container.appendChild(card);
        });
    }
    // ===== 成就 =====
    // 渲染成就列表（每行6个）：行内任一成就已获得 → 整行显示（已获得项加 achieved）；
    // 否则整行 locked（显示问号）。响应式换列由 CSS 处理（6列/3列/2列），逻辑不变。
    renderAchievements() {
        const container = document.getElementById("pg-achievements");
        if (!container)
            return;
        container.innerHTML = "";
        achievementRows.forEach(row => {
            const rowEl = document.createElement("div");
            rowEl.className = "achievement";
            // 行是否解锁：任一 identifier 已获得
            const anyGot = row.some(id => this.isAchievementGot(id));
            if (!anyGot)
                rowEl.classList.add("locked");
            row.forEach(id => {
                const cell = document.createElement("div");
                cell.className = "pg-ach-cell";
                cell.setAttribute("data-ach", id);
                cell.textContent = LangMgr.achName(id);
                if (this.isAchievementGot(id))
                    cell.classList.add("achieved");
                rowEl.appendChild(cell);
            });
            container.appendChild(rowEl);
        });
    }
    // 重新渲染成就区（获得新成就后由 game.ts 调用，保持 GUI 同步）
    refreshAchievements() {
        this.renderAchievements();
    }
    // ===== 符号面板 =====
    // ===== 符号子面板 =====
    // 只渲染已解锁的符号（未解锁不显示占位）。每个符号一个小按钮，横向 flex-wrap 排多行。
    // 点击符号弹出不占排版的气泡（tooltip），显示"输入方式：xxx"与解释。
    renderSymbols() {
        const container = document.getElementById("pg-symbols");
        if (!container)
            return;
        container.innerHTML = "";
        let any = false;
        for (const [sym, entry] of Object.entries(knowledgeBase.syms)) {
            const id = kbFullId(sym);
            if (!this.isInfoGot(id))
                continue; // 只渲染已解锁
            any = true;
            const btn = document.createElement("button");
            btn.className = "pg-sym-btn";
            btn.setAttribute("data-sym", sym);
            const symSpan = document.createElement("span");
            symSpan.className = "pg-sym-glyph";
            symSpan.textContent = sym;
            const asciiSpan = document.createElement("span");
            asciiSpan.className = "pg-sym-ascii";
            asciiSpan.textContent = entry.ascii;
            btn.append(symSpan, asciiSpan);
            btn.addEventListener("click", () => this.showSymBubble(btn, sym, entry));
            container.appendChild(btn);
        }
        // 空态（一个符号都没解锁）
        if (!any) {
            const empty = document.createElement("div");
            empty.className = "pg-kb-empty";
            empty.textContent = this.mode === "creative" ? LangMgr.text.kbEmptyCreative : LangMgr.text.kbEmpty;
            container.appendChild(empty);
        }
    }
    // 符号气泡：绝对定位在按钮旁，不占排版；点击其它处自动关闭
    showSymBubble(btn, sym, entry) {
        // 若已存在该气泡则关闭
        const bubble = document.getElementById("pg-sym-bubble");
        if (bubble && bubble.dataset.sym === sym) {
            bubble.remove();
            return;
        }
        // 移除旧气泡
        document.getElementById("pg-sym-bubble")?.remove();
        const el = document.createElement("div");
        el.className = "pg-sym-bubble";
        el.id = "pg-sym-bubble";
        el.setAttribute("data-sym", sym);
        const name = LangMgr.trBilingual(entry.name);
        el.innerHTML = `
            <div class="pg-sym-bubble-head">${sym} <span class="pg-sym-bubble-ascii">${LangMgr.text.inputWay}：${entry.ascii}</span></div>
            <div class="pg-sym-bubble-desc">${name}</div>
        `;
        document.body.appendChild(el);
        // 定位到按钮下方
        const rect = btn.getBoundingClientRect();
        el.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - el.offsetWidth - 8)) + "px";
        el.style.top = (rect.bottom + 6) + "px";
        // 点击别处关闭
        const close = (e) => {
            if (!el.contains(e.target) && !btn.contains(e.target)) {
                el.remove();
                document.removeEventListener("mousedown", close);
            }
        };
        setTimeout(() => document.addEventListener("mousedown", close), 0);
    }
    // 重绘符号面板（解锁新符号后调用）
    refreshSymbols() {
        this.renderSymbols();
    }
    // ===== 知识库（笔记库） =====
    // 只显示已解锁的笔记：未解锁的不占位（不断丰富的笔记库）。
    // 响应式网格布局（类似成就：3/2/1列）。标题取字符串"标题："前缀（不渲染 identifier）。
    renderKnowledge() {
        const container = document.getElementById("pg-knowledge");
        if (!container)
            return;
        container.innerHTML = "";
        for (const [id, text] of Object.entries(knowledgeBase.mecanism)) {
            const fullId = kbFullId(id);
            if (!this.isInfoGot(fullId))
                continue; // 未解锁不显示
            const { title, body: bodyText } = kbSplitTitle(text);
            const note = document.createElement("div");
            note.className = "pg-kb-note";
            const head = document.createElement("div");
            head.className = "pg-kb-note-head";
            head.textContent = title || id; // 标题为空时兜底显示 identifier
            const body = document.createElement("div");
            body.className = "pg-kb-note-body";
            // 用 textContent 设置：bodyText 里的 < > 是推理语法（如 [dname]<:mp[/dname]），
            // 若走 innerHTML 会被当作 HTML 标签解析吞掉；语法高亮标记由 enhanceKbHtml 处理
            body.textContent = bodyText;
            note.append(head, body);
            container.appendChild(note);
            this.enhanceKbHtml(body);
        }
        // 空提示（一条都没解锁时）
        if (!container.children.length) {
            const empty = document.createElement("div");
            empty.className = "pg-kb-empty";
            empty.textContent = this.mode === "creative"
                ? LangMgr.text.kbEmptyCreative
                : LangMgr.text.kbEmpty;
            container.appendChild(empty);
        }
    }
    // 重绘知识库（解锁新笔记后调用）
    refreshKnowledge() {
        this.renderKnowledge();
    }
    // 将知识库面板中的 [wff][/wff] [rule][/rule] [cmds][/cmds] [dname][/dname]
    // [item][/item] 标记内容替换为语法高亮 span（SyntaxViewer 渲染）
    enhanceKbHtml(panel) {
        const patterns = [
            [/\[wff\]([\s\S]*?)\[\/wff\]/g, "wff"],
            [/\[rule\]([\s\S]*?)\[\/rule\]/g, "rule"],
            [/\[cmds\]([\s\S]*?)\[\/cmds\]/g, "cmd"],
            [/\[dname\]([\s\S]*?)\[\/dname\]/g, "dname"],
            [/\[item\]([\s\S]*?)\[\/item\]/g, "item"],
        ];
        // 递归处理文本节点，避免破坏已有 HTML
        const walk = (node) => {
            for (const child of Array.from(node.childNodes)) {
                if (child.nodeType === Node.TEXT_NODE) {
                    const text = child.textContent ?? "";
                    let html = "";
                    let last = 0;
                    let changed = false;
                    for (const [re, mode] of patterns) {
                        re.lastIndex = 0;
                        const m = re.exec(text);
                        if (!m)
                            continue;
                        changed = true;
                        // 注意：内容经 encodeURIComponent 转义后放入 data 属性，
                        // 浏览器不会把其中的 < > 当标签解析；渲染时 decodeURIComponent 还原
                        html = text.slice(0, m.index)
                            + `<span data-kb-highlight="${mode}" data-kb-code="${encodeURIComponent(m[1])}"></span>`
                            + text.slice(re.lastIndex);
                        break;
                    }
                    if (changed) {
                        const span = document.createElement("span");
                        span.innerHTML = html;
                        node.replaceChild(span, child);
                        // 继续遍历新节点（处理后续标记）
                        walk(span);
                        return;
                    }
                }
                else if (child.nodeType === Node.ELEMENT_NODE) {
                    walk(child);
                }
            }
        };
        walk(panel);
        // 对每个 data-kb-highlight 元素用 SyntaxViewer 渲染高亮
        panel.querySelectorAll("span[data-kb-highlight]").forEach(el => {
            const mode = el.getAttribute("data-kb-highlight");
            const code = decodeURIComponent(el.getAttribute("data-kb-code") ?? "");
            el.removeAttribute("data-kb-highlight");
            el.removeAttribute("data-kb-code");
            new SyntaxViewer(el, new HSParser, code, mode);
        });
    }
    // ===== 导出 =====
    exportSlot(key, i) {
        const data = this.saveload.readKey(key);
        if (!data) {
            alert(LangMgr.text.exportFailed);
            return;
        }
        this.download(data, `deductrium_slot${i + 1}.dt`);
    }
    exportCurrent() {
        const raw = this.saveload.readKey(this.saveloadKey());
        if (!raw) {
            alert(LangMgr.text.exportFailed);
            return;
        }
        this.download(raw, `deductrium_${new Date().toISOString()}.dt`);
    }
    download(text, filename) {
        const blob = new Blob([text], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
    saveloadKey() {
        return this.saveload.saveKey ?? `deductrium2_${this.mode}`;
    }
    fmtSize(n) {
        if (n < 1024)
            return n + "B";
        if (n < 1024 * 1024)
            return (n / 1024).toFixed(1) + "KB";
        return (n / 1024 / 1024).toFixed(2) + "MB";
    }
    scheduleRefresh() {
        if (this.refreshTimer !== null)
            return;
        this.refreshTimer = window.setTimeout(() => {
            window.location.reload();
        }, 200);
    }
}
//# sourceMappingURL=main.js.map