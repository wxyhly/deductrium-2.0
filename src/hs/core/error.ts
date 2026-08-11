import { AST } from "./ast.js";

export type HSErrorInfo =
    | { type: "isItemAndWff"; name: string }
    | { type: "isNotVar"; ast: AST; metaVarName?: string }
    | { type: "isNotWFF"; ast: AST; metaVarName?: string }
    | { type: "isNotAssertion"; ast: AST }
    | { type: "isNotItem"; ast: AST; metaVarName?: string }
    | { type: "createRule"; ruleName: AST; cause: unknown }
    | { type: "matchCond"; conditionIndex: number; cause: unknown }
    | { type: "assertFail"; assertionIndex: number; cause: unknown }
    | { type: "sbFail"; destination: AST; quantifierSet: Set<string>; cause: unknown }
    | { type: "assertForeverFail"; ast: AST }
    | { type: "assertNeverFail"; ast: AST }
    | { type: "emptyValue" }
    | { type: "noConclusion" }
    | { type: "nameAlreadyExist"; name: string }
    | { type: "invalidRuleNameStartsWith"; invalidChars: string }
    | { type: "localVarInConclusion" }
    | { type: "sbInHyp" }
    | { type: "distinctFail" }
    | { type: "matchFail"; expected: AST | null; actual: AST | null; metaVarName?: string }
    | { type: "conclusionFail"; cause: unknown }
    | { type: "deductFail"; ruleName: string; cause: unknown }
    | { type: "inconsistCondNum" }
    | { type: "hypFail"; cause: unknown }
    | { type: "dname404"; ruleName: string }
    | { type: "pname404"; propName: string }
    | { type: "unknownCmd"; command: string }
    | { type: "argNotEnough"; command: string }
    | { type: "cmdIsRunning" }
    | { type: "pListIsntEmpty" }
    | { type: "invalidPropDir" }
    | { type: "delFail"; rely: { name: string, id: number }[]; cause: unknown }
    | { type: "invalidPropName" }
    | { type: "capturePFail", scope: { name: string, id: number, ast: { name: string } }, cond: { name: string, id: number }, cause: unknown };

export function isHSErrorInfo(value: unknown): value is HSErrorInfo {
    return typeof value === "object" && value !== null && "type" in value;
}

export const HSError = {
    isItemAndWff(name: string): HSErrorInfo { return { type: "isItemAndWff", name }; },
    isNotVar(ast: AST, metaVarName?: string): HSErrorInfo { return { type: "isNotVar", ast, metaVarName }; },
    isNotWFF(ast: AST, metaVarName?: string): HSErrorInfo { return { type: "isNotWFF", ast, metaVarName }; },
    isNotAssertion(ast: AST): HSErrorInfo { return { type: "isNotAssertion", ast }; },
    isNotItem(ast: AST, metaVarName?: string): HSErrorInfo { return { type: "isNotItem", ast, metaVarName }; },
    createRule(ruleName: AST, cause: unknown): HSErrorInfo { return { type: "createRule", ruleName, cause }; },
    matchCond(conditionIndex: number, cause: unknown): HSErrorInfo { return { type: "matchCond", conditionIndex, cause }; },
    assertFail(assertionIndex: number, cause: unknown): HSErrorInfo { return { type: "assertFail", assertionIndex, cause }; },
    sbFail(destination: AST, quantifierSet: Set<string>, cause: unknown): HSErrorInfo { return { type: "sbFail", destination, quantifierSet, cause }; },
    assertForeverFail(ast: AST): HSErrorInfo { return { type: "assertForeverFail", ast }; },
    assertNeverFail(ast: AST): HSErrorInfo { return { type: "assertNeverFail", ast }; },
    emptyValue(): HSErrorInfo { return { type: "emptyValue" }; },
    noConclusion(): HSErrorInfo { return { type: "noConclusion" }; },
    cmdIsRunning(): HSErrorInfo { return { type: "cmdIsRunning" }; },
    pListIsntEmpty(): HSErrorInfo { return { type: "pListIsntEmpty" }; },
    invalidPropName(): HSErrorInfo { return { type: "invalidPropName" }; },
    nameAlreadyExist(name: string): HSErrorInfo { return { type: "nameAlreadyExist", name }; },
    invalidRuleNameStartsWith(invalidChars: string): HSErrorInfo { return { type: "invalidRuleNameStartsWith", invalidChars }; },
    localVarInConclusion(): HSErrorInfo { return { type: "localVarInConclusion" }; },
    sbInHyp(): HSErrorInfo { return { type: "sbInHyp" }; },
    distinctFail(): HSErrorInfo { return { type: "distinctFail" }; },
    matchFail(expected: AST | null, actual: AST | null, metaVarName?: string): HSErrorInfo { return { type: "matchFail", expected, actual, metaVarName }; },
    conclusionFail(cause: unknown): HSErrorInfo { return { type: "conclusionFail", cause }; },
    deductFail(ruleName: string, cause: unknown): HSErrorInfo { return { type: "deductFail", ruleName, cause }; },
    inconsistCondNum(): HSErrorInfo { return { type: "inconsistCondNum" }; },
    hypFail(cause: unknown): HSErrorInfo { return { type: "hypFail", cause }; },
    dname404(ruleName: string): HSErrorInfo { return { type: "dname404", ruleName }; },
    pname404(propName: string): HSErrorInfo { return { type: "pname404", propName }; },
    unknownCmd(command: string): HSErrorInfo { return { type: "unknownCmd", command }; },
    argNotEnough(command: string): HSErrorInfo { return { type: "argNotEnough", command }; },
    delFail(rely: { name: string, id: number }[], cause: unknown): HSErrorInfo { return { type: "delFail", rely, cause }; },
    invalidPropDir(): HSErrorInfo { return { type: "invalidPropDir" } },
    capturePFail(scope: { name: string, id: number, ast: { name: string } }, cond: { name: string, id: number }, cause: unknown): HSErrorInfo { return { type: "capturePFail", scope, cond, cause }; }
};
