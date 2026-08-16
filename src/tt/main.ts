import { TTGui } from "./gui.js";
import { LangMgr } from "../lang.js";

// ==================== 类型层（T-layer） ====================
// 与推理层并列的第三层：系统表（规则）+ 定理表（命题）。
// 执行逻辑与推理层完全不同（此处仅 GUI，逻辑后续接入）。
export class TTLayer {
    private gui: TTGui;
    onchange?: () => void;

    constructor() {
        this.gui = new TTGui();
        this.gui.onchange = () => this.onchange?.();
        this.initButtons();
    }

    // 定理表卡片头部按钮：+ 文件夹 / + 命题
    private initButtons() {
        document.getElementById("ttAddFolder")?.addEventListener("click", () => {
            this.gui.addFolder();
        });
        document.getElementById("ttAddItem")?.addEventListener("click", () => {
            this.gui.addNewItem();
        });
    }

    refresh() {
        this.gui.refresh();
    }
    serialize() {
        return this.gui.serialize();
    }
    deserialize(data: any) {
        this.gui.deserialize(data);
    }
    getGui() { return this.gui; }
}
