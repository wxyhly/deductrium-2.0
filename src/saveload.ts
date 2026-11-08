const CURRENT_VERSION = 0;

interface SavePackage {
    version: number;
    mode: string;
    timestamp: number;
    data: any;            // 序列化后的具体数据
}
declare const LZString: {
    compressToUTF16(input: string): string;
    decompressFromUTF16(input: string): string | null;
}
interface ICompressor {
    compress(json: string): string;
    decompress(compressed: string): string;
}
class LZStringCompressor implements ICompressor {
    compress(json: string): string {
        return LZString.compressToUTF16(json);
    }
    decompress(compressed: string): string {
        const raw = LZString.decompressFromUTF16(compressed);
        if (raw === null) throw new Error('解压失败');
        return raw;
    }
}

export class SaveLoad {
    private mode: string;
    private compressor: ICompressor;
    deserialize: (data: any) => void;
    serialize: () => any;
    /** Pure preflight: reject/migrate world data before storage or game mutation. */
    beforeLoad?: (data: any) => any;
    /** Normal-mode preflight still runs after the legacy creative/survival navigation. */
    allowNormalModeRedirect = false;
    lastLoadError: Error | null = null;
    private blockedWrite = false;
    private applyingLoad = false;
    get saveMode(): string { return this.mode; }
    get saveKey(): string { return this.storageKey; }
    get writesBlocked(): boolean { return this.blockedWrite; }
    public slotKey(index: number): string {
        if (!Number.isInteger(index) || index < 0 || index > 3) throw new Error('Invalid save slot');
        // ':' is not allowed in world IDs, so slots cannot alias a world's main key.
        return this.mode.startsWith('world-')
            ? `${this.storageKey}:slot${index}` : `deductrium2_slot${index}`;
    }

    static getSavedLang(){
        const savedLang = localStorage.getItem("lang");
        if (savedLang === "zh" || savedLang === "en") return savedLang;
        return undefined;
    }

    constructor(mode: string, serialize: () => any, deserialize: (data: any) => void) {
        this.mode = mode;
        this.compressor = new LZStringCompressor;
        this.serialize = serialize;
        this.deserialize = deserialize;
    }
    private stateChangeTimer: number | boolean = false;
    private timeOut = 2000;
    notifySave() {
        if (this.blockedWrite || this.applyingLoad) return;
        if (this.stateChangeTimer === false) {
            this.stateChangeTimer = setTimeout(() => {
                this.stateChangeTimer = false;
                if (!this.blockedWrite) this.save();
            }, this.timeOut);
        }
    }
    // 取消待执行的延时保存（重置/加载槽位/导入前调用，防止旧进度在刷新间隙被写回）
    public cancelPendingSave(): void {
        if (this.stateChangeTimer !== false) {
            clearTimeout(this.stateChangeTimer as number);
            this.stateChangeTimer = false;
        }
    }
    private get storageKey(): string {
        return `deductrium2_${this.mode}`;
    }

    // ---------- 保存 ----------
    public save(): void {
        if (this.applyingLoad) throw new Error('Cannot save during a load transaction');
        if (this.blockedWrite) throw this.lastLoadError ?? new Error("Save is blocked until world recovery");
        // 1. 序列化（抽取数据）
        const rawData = this.serialize();

        // 2. 打包元数据
        const pkg: SavePackage = {
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
    public load(): boolean {
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) return false;
            this.applyPrepared(this.prepare(raw, true));
            console.log(`[Load] 模式 ${this.mode} 加载成功`);
            return true;
        } catch (e) {
            this.recordLoadError(e);
            if (this.beforeLoad || this.mode.startsWith('world-')) this.blockedWrite = true;
            console.error('[Load] 加载失败:', e);
            return false;
        }
    }
    private recordLoadError(error: unknown): void {
        this.lastLoadError = error instanceof Error ? error : new Error(String(error));
    }
    // Everything here is detached from the live game and storage.
    private prepare(compressed: string, allowRedirect: boolean): { mode: string; data: any } {
        const pkg = JSON.parse(this.compressor.decompress(compressed)) as SavePackage;
        if (!pkg || typeof pkg.mode !== 'string' || !pkg.mode) throw new Error('Invalid save package');
        if (pkg.mode !== this.mode) {
            const normalRedirect = this.allowNormalModeRedirect
                && ['creative', 'survival'].includes(this.mode) && ['creative', 'survival'].includes(pkg.mode);
            if (!allowRedirect || this.beforeLoad && !normalRedirect || this.mode.startsWith('world-') || pkg.mode.startsWith('world-')) {
                throw new Error(`Save mode mismatch: ${pkg.mode} / ${this.mode}`);
            }
            return {mode:pkg.mode, data:undefined};
        }
        return {mode:pkg.mode, data:this.beforeLoad ? this.beforeLoad(pkg.data) : pkg.data};
    }
    private applyPrepared(prepared: { mode: string; data: any }, compressed?: string): void {
        if (this.applyingLoad) throw new Error('Load transaction already in progress');
        if (prepared.mode !== this.mode) {
            // Preserve legacy creative/survival navigation, including current unsaved progress.
            if (compressed !== undefined) this.save();
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
            if (compressed !== undefined) localStorage.setItem(this.storageKey, compressed);
        } catch (error) {
            try { this.deserialize(previous); }
            catch (rollbackError) {
                this.blockedWrite = true;
                throw new AggregateError([error, rollbackError], 'Load failed and live state could not be restored');
            }
            throw error;
        } finally {
            this.applyingLoad = false;
        }
        this.cancelPendingSave();
        this.blockedWrite = false;
        this.lastLoadError = null;
    }
    // 跳转到存档对应的模式 URL：creative → ?creative；survival → 去掉 query 参数
    private redirectToMode(mode: string) {
        if (mode === "creative") {
            if (window.location.search !== "?creative") {
                window.location.href = window.location.pathname + "?creative" + window.location.hash;
            }
        } else if (window.location.search) {
            window.location.href = window.location.pathname + window.location.hash;
        }
    }

    // ---------- 导出（给用户下载） ----------
    public exportSave(): string {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw) throw new Error('没有存档可导出');
        return raw; // 返回压缩后的字符串，用户可保存为 .save 文件
    }

    // ---------- 导入（用户上传文件） ----------
    public importSave(compressedData: string): boolean {
        return this.importPrepared(compressedData, false);
    }

    // ---------- 进度槽位（单独 key 保存压缩存档） ----------
    // 序列化当前状态并压缩保存到指定 key（槽位）
    public saveToKey(key: string): string {
        if (this.applyingLoad) throw new Error('Cannot save during a load transaction');
        if (this.blockedWrite) throw this.lastLoadError ?? new Error("Save is blocked until world recovery");
        const rawData = this.serialize();
        const pkg: SavePackage = {
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
    public readKey(key: string): string | null {
        return localStorage.getItem(key);
    }
    // 槽位元数据（用于显示时间戳/模式/大小）；无则 null
    public keyMeta(key: string): { timestamp: number; mode: string; size: number } | null {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        try {
            const pkg = JSON.parse(this.compressor.decompress(raw)) as SavePackage;
            return { timestamp: pkg.timestamp, mode: pkg.mode, size: raw.length };
        } catch { return null; }
    }
    // 从压缩字符串加载（槽位/导入共用）：模式不符时跳转到对应模式 URL（与 load 一致）
    public loadFromString(compressed: string): boolean {
        return this.importPrepared(compressed, true);
    }
    private importPrepared(compressed: string, allowRedirect: boolean): boolean {
        try {
            this.applyPrepared(this.prepare(compressed, allowRedirect), compressed);
            return true;
        } catch (e) {
            this.recordLoadError(e);
            console.error('加载失败:', e);
            return false;
        }
    }
}
