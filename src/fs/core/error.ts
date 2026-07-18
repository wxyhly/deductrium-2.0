import { AST } from "./ast";

export class FSError {
    static readonly lang: string;
    static isItemAndWff(name: string) {
        return this.lang === "zh" ? "元变量" + name + "不能同时为项和公式" : "meta variable " + name + " cannot be both item and wff";
    }
    static isNotVar(ast: AST, name?: string) {
        return this.lang === "zh" ? (name ? "元变量" + name + "的取值" : "") + ast.toString() + "不是变量" : (name ? "value of the meta variable " + name + ": " : "") + ast.toString() + " is not a variable";
    }
    static isNotWFF(ast: AST, name?: string) {
        return this.lang === "zh" ? (name ? "元变量" + name + "的取值" : "") + ast.toString() + "不是公式" : (name ? "value of the meta variable " + name + ": " : "") + ast.toString() + " is not a wff";
    }
    static isNotItem(ast: AST, name?: string) {
        return this.lang === "zh" ? (name ? "元变量" + name + "的取值" : "") + ast.toString() + "不是项" : (name ? "value of the meta variable " + name + ": " : "") + ast.toString() + " is not an item";
    }
    static createRule(name: string, msg: any) {
        return this.lang === "zh" ? "创建规则" + name + "时：" + msg : "create rule " + name + " failed: " + msg;
    }
    static matchCond(idx: number, msg: any) {
        return this.lang === "zh" ? "匹配条件" + idx + "时：" + msg : "match condition " + idx + " failed: " + msg;
    }
    static assertFail(idx: number, msg: any) {
        return this.lang === "zh" ? "第" + idx + "个断言失败：" + msg : "assertion " + idx + " failed: " + msg;
    }
    static matchFail(a: AST, b: AST, name?: string) {
        return this.lang === "zh" ? (name ? "元变量" + name + "取值不一致：" : "") + a.toString() + " <=X=> " + b.toString() : (name ? "meta variable " + name + " has inconsistent values: " : "") + a.toString() + " <=X=> " + b.toString();
    }
    static conclusionFail(msg: any) {
        return this.lang === "zh" ? "生成结论失败：" + msg : "conclusion failed: " + msg;
    }
    static deductFail(name: string, msg: any) {
        return this.lang === "zh" ? "执行规则" + name + "失败：" + msg : "deduction " + name + " failed: " + msg;
    }
    static inconsistCondNum() {
        return this.lang === "zh" ? "条件数量不一致" : "inconsistent number of conditions";
    }
}