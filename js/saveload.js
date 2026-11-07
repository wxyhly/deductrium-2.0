const CURRENT_VERSION = 0;
class LZStringCompressor {
    compress(json) {
        return LZString.compressToUTF16(json);
    }
    decompress(compressed) {
        const raw = LZString.decompressFromUTF16(compressed);
        if (raw === null)
            throw new Error('解压失败');
        return raw;
    }
}
export class SaveLoad {
    mode;
    compressor;
    deserialize;
    serialize;
    /** Pure preflight: reject/migrate world data before storage or game mutation. */
    beforeLoad;
    lastLoadError = null;
    blockedWrite = false;
    applyingLoad = false;
    get saveMode() { return this.mode; }
    get saveKey() { return this.storageKey; }
    get writesBlocked() { return this.blockedWrite; }
    slotKey(index) {
        if (!Number.isInteger(index) || index < 0 || index > 3)
            throw new Error('Invalid save slot');
        // ':' is not allowed in world IDs, so slots cannot alias a world's main key.
        return this.mode.startsWith('world-')
            ? `${this.storageKey}:slot${index}` : `deductrium2_slot${index}`;
    }
    static getSavedLang() {
        const savedLang = localStorage.getItem("lang");
        if (savedLang === "zh" || savedLang === "en")
            return savedLang;
        return undefined;
    }
    constructor(mode, serialize, deserialize) {
        this.mode = mode;
        this.compressor = new LZStringCompressor;
        this.serialize = serialize;
        this.deserialize = deserialize;
    }
    stateChangeTimer = false;
    timeOut = 2000;
    notifySave() {
        if (this.blockedWrite || this.applyingLoad)
            return;
        if (this.stateChangeTimer === false) {
            this.stateChangeTimer = setTimeout(() => {
                this.stateChangeTimer = false;
                if (!this.blockedWrite)
                    this.save();
            }, this.timeOut);
        }
    }
    // 取消待执行的延时保存（重置/加载槽位/导入前调用，防止旧进度在刷新间隙被写回）
    cancelPendingSave() {
        if (this.stateChangeTimer !== false) {
            clearTimeout(this.stateChangeTimer);
            this.stateChangeTimer = false;
        }
    }
    get storageKey() {
        return `deductrium2_${this.mode}`;
    }
    // ---------- 保存 ----------
    save() {
        if (this.applyingLoad)
            throw new Error('Cannot save during a load transaction');
        if (this.blockedWrite)
            throw this.lastLoadError ?? new Error("Save is blocked until world recovery");
        // 1. 序列化（抽取数据）
        const rawData = this.serialize();
        // 2. 打包元数据
        const pkg = {
            version: CURRENT_VERSION,
            mode: this.mode,
            timestamp: Date.now(),
            data: rawData,
        };
        // 3. 压缩
        const json = JSON.stringify(pkg);
        const compressed = this.compressor.compress(json);
        // 4. 存储
        localStorage.setItem(this.storageKey, compressed);
        console.log(`[Save] 模式 ${this.mode} 存档已保存 (大小: ${json.length} -> ${compressed.length})`);
    }
    // ---------- 加载 ----------
    load() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw)
                return false;
            this.applyPrepared(this.prepare(raw, true));
            console.log(`[Load] 模式 ${this.mode} 加载成功`);
            return true;
        }
        catch (e) {
            this.recordLoadError(e);
            if (this.beforeLoad || this.mode.startsWith('world-'))
                this.blockedWrite = true;
            console.error('[Load] 加载失败:', e);
            return false;
        }
    }
    recordLoadError(error) {
        this.lastLoadError = error instanceof Error ? error : new Error(String(error));
    }
    // Everything here is detached from the live game and storage.
    prepare(compressed, allowRedirect) {
        const pkg = JSON.parse(this.compressor.decompress(compressed));
        if (!pkg || typeof pkg.mode !== 'string' || !pkg.mode)
            throw new Error('Invalid save package');
        if (pkg.mode !== this.mode) {
            if (!allowRedirect || this.beforeLoad || this.mode.startsWith('world-') || pkg.mode.startsWith('world-')) {
                throw new Error(`Save mode mismatch: ${pkg.mode} / ${this.mode}`);
            }
            return { mode: pkg.mode, data: undefined };
        }
        return { mode: pkg.mode, data: this.beforeLoad ? this.beforeLoad(pkg.data) : pkg.data };
    }
    applyPrepared(prepared, compressed) {
        if (this.applyingLoad)
            throw new Error('Load transaction already in progress');
        if (prepared.mode !== this.mode) {
            // Preserve legacy creative/survival navigation, including current unsaved progress.
            if (compressed !== undefined)
                this.save();
            this.redirectToMode(prepared.mode);
            this.cancelPendingSave();
            this.lastLoadError = null;
            return;
        }
        const previous = structuredClone(this.serialize());
        this.applyingLoad = true;
        try {
            this.deserialize(prepared.data);
            // Storage.setItem is atomic: failed quota/security checks retain the original raw save.
            if (compressed !== undefined)
                localStorage.setItem(this.storageKey, compressed);
        }
        catch (error) {
            try {
                this.deserialize(previous);
            }
            catch (rollbackError) {
                this.blockedWrite = true;
                throw new AggregateError([error, rollbackError], 'Load failed and live state could not be restored');
            }
            throw error;
        }
        finally {
            this.applyingLoad = false;
        }
        this.cancelPendingSave();
        this.blockedWrite = false;
        this.lastLoadError = null;
    }
    // 跳转到存档对应的模式 URL：creative → ?creative；survival → 去掉 query 参数
    redirectToMode(mode) {
        if (mode === "creative") {
            if (window.location.search !== "?creative") {
                window.location.href = window.location.pathname + "?creative" + window.location.hash;
            }
        }
        else if (window.location.search) {
            window.location.href = window.location.pathname + window.location.hash;
        }
    }
    // ---------- 导出（给用户下载） ----------
    exportSave() {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw)
            throw new Error('没有存档可导出');
        return raw; // 返回压缩后的字符串，用户可保存为 .save 文件
    }
    // ---------- 导入（用户上传文件） ----------
    importSave(compressedData) {
        return this.importPrepared(compressedData, false);
    }
    // ---------- 进度槽位（单独 key 保存压缩存档） ----------
    // 序列化当前状态并压缩保存到指定 key（槽位）
    saveToKey(key) {
        if (this.applyingLoad)
            throw new Error('Cannot save during a load transaction');
        if (this.blockedWrite)
            throw this.lastLoadError ?? new Error("Save is blocked until world recovery");
        const rawData = this.serialize();
        const pkg = {
            version: CURRENT_VERSION,
            mode: this.mode,
            timestamp: Date.now(),
            data: rawData,
        };
        const json = JSON.stringify(pkg);
        const compressed = this.compressor.compress(json);
        localStorage.setItem(key, compressed);
        return compressed;
    }
    // 从指定 key 读取槽位数据；无则返回 null
    readKey(key) {
        return localStorage.getItem(key);
    }
    // 槽位元数据（用于显示时间戳/模式/大小）；无则 null
    keyMeta(key) {
        const raw = localStorage.getItem(key);
        if (!raw)
            return null;
        try {
            const pkg = JSON.parse(this.compressor.decompress(raw));
            return { timestamp: pkg.timestamp, mode: pkg.mode, size: raw.length };
        }
        catch {
            return null;
        }
    }
    // 从压缩字符串加载（槽位/导入共用）：模式不符时跳转到对应模式 URL（与 load 一致）
    loadFromString(compressed) {
        return this.importPrepared(compressed, true);
    }
    importPrepared(compressed, allowRedirect) {
        try {
            this.applyPrepared(this.prepare(compressed, allowRedirect), compressed);
            return true;
        }
        catch (e) {
            this.recordLoadError(e);
            console.error('加载失败:', e);
            return false;
        }
    }
}
//# sourceMappingURL=saveload.js.map