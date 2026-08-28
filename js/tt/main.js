import { TTGui } from "./gui.js";
// ==================== 类型层（T-layer） ====================
// 与推理层并列的第三层：系统表（类型定义）+ 定理表（用户定义/断言/推断）。
// creative=true 时加载全量 HoTT 初始系统；否则最小系统（True/False/nat）。
export class TTLayer {
    gui;
    onchange;
    constructor(creative = false) {
        this.gui = new TTGui(creative);
        this.gui.onchange = () => this.onchange?.();
        this.initButtons();
    }
    // 定理表卡片头部按钮：+ 文件夹 / + 命题
    initButtons() {
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
    deserialize(data) {
        this.gui.deserialize(data);
    }
    getGui() { return this.gui; }
    getCore() { return this.gui.core; }
}
//# sourceMappingURL=main.js.map