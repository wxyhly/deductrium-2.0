export class FSError {
    static lang;
    static isItemAndWff(name) {
        return this.lang === "zh" ? "元变量" + name + "不能同时为项和公式" : "meta variable " + name + " cannot be both item and wff";
    }
    static isNotVar(ast, name) {
        return this.lang === "zh" ? (name ? "元变量" + name + "的取值" : "") + ast.toString() + "不是变量" : (name ? "value of the meta variable " + name + ": " : "") + ast.toString() + " is not a variable";
    }
    static isNotWFF(ast, name) {
        return this.lang === "zh" ? (name ? "元变量" + name + "的取值" : "") + ast.toString() + "不是公式" : (name ? "value of the meta variable " + name + ": " : "") + ast.toString() + " is not a wff";
    }
    static isNotItem(ast, name) {
        return this.lang === "zh" ? (name ? "元变量" + name + "的取值" : "") + ast.toString() + "不是项" : (name ? "value of the meta variable " + name + ": " : "") + ast.toString() + " is not an item";
    }
    static createRule(name, msg) {
        return this.lang === "zh" ? "创建规则" + name + "时：" + msg : "create rule " + name + " failed: " + msg;
    }
    static matchCond(idx, msg) {
        return this.lang === "zh" ? "匹配条件" + idx + "时：" + msg : "match condition " + idx + " failed: " + msg;
    }
    static assertFail(idx, msg) {
        return this.lang === "zh" ? "第" + idx + "个断言失败：" + msg : "assertion " + idx + " failed: " + msg;
    }
    static distinctFail() {
        return this.lang === "zh" ? "变量不满足互不相同" : "variables are not mutually distinct";
    }
    static matchFail(a, b, name) {
        return this.lang === "zh" ? (name ? "元变量" + name + "取值不一致：" : "") + a.toString() + " <=X=> " + b.toString() : (name ? "meta variable " + name + " has inconsistent values: " : "") + a.toString() + " <=X=> " + b.toString();
    }
    static conclusionFail(msg) {
        return this.lang === "zh" ? "生成结论失败：" + msg : "conclusion failed: " + msg;
    }
    static deductFail(name, msg) {
        return this.lang === "zh" ? "执行规则" + name + "失败：" + msg : "deduction " + name + " failed: " + msg;
    }
    static inconsistCondNum() {
        return this.lang === "zh" ? "条件数量不一致" : "inconsistent number of conditions";
    }
    static hypFail(msg) {
        return this.lang === "zh" ? "创建假设失败：" + msg : "add hypothesis failed: " + msg;
    }
    static dname404(name) {
        return this.lang === "zh" ? "未知规则名：" + name : "unkown rule name: " + name;
    }
    static unknownCmd(name) {
        return this.lang === "zh" ? "未知命令：" + name : "unknown command: " + name;
    }
}
//# sourceMappingURL=lang.js.map