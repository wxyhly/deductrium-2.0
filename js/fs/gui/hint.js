export class FSError {
    static lang;
    static unknownCmd(name) {
        return this.lang === "zh" ? "未知命令：" + name : "unknown command: " + name;
    }
}
//# sourceMappingURL=hint.js.map