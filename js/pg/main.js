import { LangMgr } from "../lang.js";
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
    constructor(saveload, mode) {
        this.saveload = saveload;
        this.mode = mode;
        this.slotKeys = [0, 1, 2, 3].map(i => `deductrium2_slot${i}`);
        this.init();
    }
    init() {
        this.renderMode();
        this.renderLanguage();
        this.renderSlots();
        this.bindEvents();
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
                this.saveload.save(); // 刷新前保存当前进度，防丢数据
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
                this.saveload.save(); // 刷新前保存当前进度
                this.saveload.loadFromString(data);
                this.scheduleRefresh();
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
        return `deductrium2_${this.mode}`;
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