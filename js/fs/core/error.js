export function isFSErrorInfo(value) {
    return typeof value === "object" && value !== null && "type" in value;
}
/**
 * 错误信息工厂，只返回结构化对象，不抛出。
 */
export const Errors = {
    isItemAndWff(name) { return { type: "isItemAndWff", name }; },
    isNotVar(ast, metaVarName) { return { type: "isNotVar", ast, metaVarName }; },
    isNotWFF(ast, metaVarName) { return { type: "isNotWFF", ast, metaVarName }; },
    isNotAssertion(ast) { return { type: "isNotAssertion", ast }; },
    isNotItem(ast, metaVarName) { return { type: "isNotItem", ast, metaVarName }; },
    createRule(ruleName, cause) { return { type: "createRule", ruleName, cause }; },
    matchCond(conditionIndex, cause) { return { type: "matchCond", conditionIndex, cause }; },
    assertFail(assertionIndex, cause) { return { type: "assertFail", assertionIndex, cause }; },
    sbFail(destination, quantifierSet, cause) { return { type: "sbFail", destination, quantifierSet, cause }; },
    assertForeverFail(cause) { return { type: "assertForeverFail", cause }; },
    assertNeverFail(cause) { return { type: "assertNeverFail", cause }; },
    emptyValue() { return { type: "emptyValue" }; },
    noConclusion() { return { type: "noConclusion" }; },
    nameAlreadyExist(name) { return { type: "nameAlreadyExist", name }; },
    invalidRuleNameStartsWith(invalidChars) { return { type: "invalidRuleNameStartsWith", invalidChars }; },
    localVarInConclusion() { return { type: "localVarInConclusion" }; },
    sbInHyp() { return { type: "sbInHyp" }; },
    distinctFail() { return { type: "distinctFail" }; },
    matchFail(expected, actual, metaVarName) { return { type: "matchFail", expected, actual, metaVarName }; },
    conclusionFail(cause) { return { type: "conclusionFail", cause }; },
    deductFail(ruleName, cause) { return { type: "deductFail", ruleName, cause }; },
    inconsistCondNum() { return { type: "inconsistCondNum" }; },
    hypFail(cause) { return { type: "hypFail", cause }; },
    dname404(ruleName) { return { type: "dname404", ruleName }; },
    unknownCmd(command) { return { type: "unknownCmd", command }; },
};
// import { AST } from "./ast.js";
// export class FSError {
//     static readonly lang: string;
//     static isItemAndWff(name: string) {
//         return this.lang === "zh" ? "元变量" + name + "不能同时为项和公式" : "meta variable " + name + " cannot be both item and wff";
//     }
//     static isNotVar(ast: AST, name?: string) {
//         return this.lang === "zh" ? (name ? "元变量" + name + "的取值" : "") + ast + "不是变量" : (name ? "value of the meta variable " + name + ": " : "") + ast + " is not a variable";
//     }
//     static isNotWFF(ast: AST, name?: string) {
//         return this.lang === "zh" ? (name ? "元变量" + name + "的取值" : "") + ast + "不是公式" : (name ? "value of the meta variable " + name + ": " : "") + ast + " is not a wff";
//     }
//     static isNotAssertion(ast: AST) {
//         return this.lang === "zh" ? ast + "不是断言" : ast + " is not an assertion";
//     }
//     static isNotItem(ast: AST, name?: string) {
//         return this.lang === "zh" ? (name ? "元变量" + name + "的取值" : "") + ast + "不是项" : (name ? "value of the meta variable " + name + ": " : "") + ast + " is not an item";
//     }
//     static createRule(name: AST, msg: any) {
//         return this.lang === "zh" ? "创建规则" + name + "时：" + msg : "create rule " + name + " failed: " + msg;
//     }
//     static matchCond(idx: number, msg: any) {
//         return this.lang === "zh" ? "匹配条件" + idx + "时：" + msg : "match condition " + idx + " failed: " + msg;
//     }
//     static assertFail(idx: number, msg: any) {
//         return this.lang === "zh" ? "第" + idx + "个断言失败：" + msg : "assertion " + idx + " failed: " + msg;
//     }
//     static sbFail(dst: AST, qs: Set<string>, msg: any) {
//         return this.lang === "zh" ? "非法替换：" + dst + "中的自由变量会被量词" + Array.from(qs).map(e => `'${e}'`).join("、") + "约束。" : "forbidden substitution: free variables in " + dst + " will be captured by quantifiers " + Array.from(qs).map(e => `'${e}'`).join(", ") + ".";
//     }
//     static assertForeverFail(msg: any) {
//         return this.lang === "zh" ? "当前断言永远不满足或与其它断言矛盾：" + msg : "current assertions will never be satisfied or be conflict with other assertions: " + msg;
//     }
//     static assertNeverFail(msg: any) {
//         return this.lang === "zh" ? "当前断言已确定成立，无需添加：" + msg : "current assertions will always be satisfied, and will be useless: " + msg;
//     }
//     static emptyValue() {
//         return this.lang === "zh" ? "空表达式" : "empty expression";
//     }
//     static noConclusion() {
//         return this.lang === "zh" ? "无有效结论" : "no valid conclusion";
//     }
//     static nameAlreadyExist(name: string) {
//         return this.lang === "zh" ? "名称“" + name + "”已存在" : "name \"" + name + "\" already exists";
//     }
//     static invalidRuleNameStartsWith(chars: string) {
//         return this.lang === "zh" ? "规则名不能以" + Array.from(chars).map(e => `'${e}'`).join("、") + "开头" : "rule name can't starts with " + (Array.from(chars).map(e => `'${e}'`).join(", "));
//     }
//     static localVarInConclusion() {
//         return this.lang === "zh" ? "结论中不能出现局部变量" : "local variable can't appear in the conclusion";
//     }
//     static sbInHyp() {
//         return this.lang === "zh" ? "假设中不能出现未化简的#sb函数" : "function #sb can't appear in the hypotheses";
//     }
//     static distinctFail() {
//         return this.lang === "zh" ? "变量不满足互不相同" : "variables are not mutually distinct";
//     }
//     static matchFail(a: AST, b: AST, name?: string) {
//         return this.lang === "zh" ? (name ? "元变量" + name + "取值不一致：" : "") + (a ?? "空") + " <=X=> " + (b ?? "空") : (name ? "meta variable " + name + " has inconsistent values: " : "") + (a ?? "Empty") + " <=X=> " + (b ?? "Empty");
//     }
//     static conclusionFail(msg: any) {
//         return this.lang === "zh" ? "生成结论失败：" + msg : "conclusion failed: " + msg;
//     }
//     static deductFail(name: string, msg: any) {
//         return this.lang === "zh" ? "执行规则" + name + "失败：" + msg : "deduction " + name + " failed: " + msg;
//     }
//     static inconsistCondNum() {
//         return this.lang === "zh" ? "条件数量不一致" : "inconsistent number of conditions";
//     }
//     static hypFail(msg: any) {
//         return this.lang === "zh" ? "创建假设失败：" + msg : "add hypothesis failed: " + msg;
//     }
//     static dname404(name: string) {
//         return this.lang === "zh" ? "未知规则名：" + name : "unkown rule name: " + name;
//     }
//     static unknownCmd(name: string) {
//         return this.lang === "zh" ? "未知命令：" + name : "unknown command: " + name;
//     }
// }
//# sourceMappingURL=error.js.map