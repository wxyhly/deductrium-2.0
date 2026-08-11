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
    constructor(mode, serialize, deserialize) {
        this.mode = mode;
        this.compressor = new LZStringCompressor;
        this.serialize = serialize;
        this.deserialize = deserialize;
    }
    stateChangeTimer = false;
    timeOut = 2000;
    notifySave() {
        if (this.stateChangeTimer === false) {
            this.stateChangeTimer = setTimeout(() => {
                this.save();
                this.stateChangeTimer = false;
            }, this.timeOut);
        }
    }
    get storageKey() {
        return `deductrium2_${this.mode}`;
    }
    // ---------- 保存 ----------
    save() {
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
        const raw = localStorage.getItem(this.storageKey);
        if (!raw)
            return false;
        try {
            // 1. 解压
            const decompressed = this.compressor.decompress(raw);
            const pkg = JSON.parse(decompressed);
            // 2. ★ 模式校验（拒绝跨模式加载）
            if (pkg.mode !== this.mode) {
                console.warn(`拒绝加载：存档模式(${pkg.mode}) 不等于 当前模式(${this.mode})`);
                return false;
            }
            // 3. ★ 版本迁移（如果旧版本，在这里修正数据结构）
            let dataToLoad = pkg.data;
            // 4. 反序列化注入逻辑层（内部自动触发全局同步）
            this.deserialize(dataToLoad);
            console.log(`[Load] 模式 ${this.mode} 加载成功`);
            return true;
        }
        catch (e) {
            console.error('[Load] 加载失败:', e);
            return false;
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
        try {
            // 先做元数据校验（不解压无法知道模式，这里必须解压）
            const decompressed = this.compressor.decompress(compressedData);
            const pkg = JSON.parse(decompressed);
            if (pkg.mode !== this.mode) {
                console.error('导入失败：模式不匹配');
                return false;
            }
            // 校验通过，存入 localStorage 并加载
            localStorage.setItem(this.storageKey, compressedData);
            return this.load();
        }
        catch (e) {
            console.error('导入失败:', e);
            return false;
        }
    }
}
//# sourceMappingURL=saveload.js.map