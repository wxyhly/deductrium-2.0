import { AST } from "./ast.js";

export type HSErrorInfo =
    | { type: "isItemAndWff"; name: string }
    | { type: "isNotVar"; ast: AST; metaVarName?: string }
    | { type: "isNotWFF"; ast: AST; metaVarName?: string }
    | { type: "isNotAssertion"; ast: AST }
    | { type: "isNotItem"; ast: AST; metaVarName?: string }
    | { type: "createRule"; ruleName: AST; cause: unknown }
    | { type: "matchCond"; conditionIndex: number; cause: unknown }
    | { type: "futureCondition"; conditionId: number; appendId: number }
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
    | { type: "delFail"; item: { name: string, id: number }, rely: { name: string, id: number }[]; cause: unknown }
    | { type: "invalidPropName" }
    | { type: "capturePFail", scope: { name: string, id: number, ast: { name: string } }, cond: { name: string, id: number }, cause: unknown }
    | { type: "atomicStep"; ruleName: AST }
    | { type: "expandFail"; cause: unknown }
    | { type: "genStepFail"; ruleName: string; cause: unknown; steps?: string }
    // 组合/元规则内部错误（原 INTERNAL_MESSAGES key，统一为结构化类型）
    | { type: "combineCyclic" }
    | { type: "combineInconsist" }
    | { type: "combineNoFn" }
    | { type: "combineArgCount" }
    | { type: "combineIrreducible" }
    | { type: "combineEx" }
    | { type: "combineConclusionMismatch" }
    | { type: "liftCompositeVar" }
    | { type: "liftConclusionVar" }
    | { type: "conclusionMismatch" }
    | { type: "notInList" }
    | { type: "unmappedStepProp" }
    | { type: "noSelfLift" }
    | { type: "errRuleUsed"; rule: string; cause: unknown }
    | { type: "replayConclusionMismatch" }
    | { type: "badMetaRule" }
    | { type: "uNeedCond"; ruleName: string }
    | { type: "nestedCVFolder" }
    | { type: "mcptInCVFolder" }
    | { type: "mcptFalse"; atoms: AST[]; hyp: number }
    | { type: "mcptTooMany"; count: number; max: number }
    | { type: "msbtBadTemplate" }
    | { type: "msbtNoMatch" }
    | { type: "msbtBadIndex" }
    | { type: "msbtRuleWithCond" }
    | { type: "mcntNoMatch" }
    | { type: "mcntBadIndex" }
    | { type: "mcntAssertFail"; cause: unknown };

export function isHSErrorInfo(value: unknown): value is HSErrorInfo {
    return typeof value === "object" && value !== null && "type" in value;
}

export const HSError: {
    isItemAndWff(name: string): HSErrorInfo;
    isNotVar(ast: AST, metaVarName?: string): HSErrorInfo;
    isNotWFF(ast: AST, metaVarName?: string): HSErrorInfo;
    isNotAssertion(ast: AST): HSErrorInfo;
    isNotItem(ast: AST, metaVarName?: string): HSErrorInfo;
    createRule(ruleName: AST, cause: unknown): HSErrorInfo;
    matchCond(conditionIndex: number, cause: unknown): HSErrorInfo;
    futureCondition(conditionId: number, appendId: number): HSErrorInfo;
    assertFail(assertionIndex: number, cause: unknown): HSErrorInfo;
    sbFail(destination: AST, quantifierSet: Set<string>, cause: unknown): HSErrorInfo;
    assertForeverFail(ast: AST): HSErrorInfo;
    assertNeverFail(ast: AST): HSErrorInfo;
    emptyValue: HSErrorInfo;
    noConclusion: HSErrorInfo;
    cmdIsRunning: HSErrorInfo;
    pListIsntEmpty: HSErrorInfo;
    invalidPropName: HSErrorInfo;
    nameAlreadyExist(name: string): HSErrorInfo;
    invalidRuleNameStartsWith(invalidChars: string): HSErrorInfo;
    localVarInConclusion: HSErrorInfo;
    sbInHyp: HSErrorInfo;
    distinctFail: HSErrorInfo;
    matchFail(expected: AST | null, actual: AST | null, metaVarName?: string): HSErrorInfo;
    conclusionFail(cause: unknown): HSErrorInfo;
    deductFail(ruleName: string, cause: unknown): HSErrorInfo;
    inconsistCondNum: HSErrorInfo;
    hypFail(cause: unknown): HSErrorInfo;
    dname404(ruleName: string): HSErrorInfo;
    pname404(propName: string): HSErrorInfo;
    unknownCmd(command: string): HSErrorInfo;
    argNotEnough(command: string): HSErrorInfo;
    delFail(item: { name: string, id: number }, rely: { name: string, id: number }[], cause: unknown): HSErrorInfo;
    invalidPropDir: HSErrorInfo;
    capturePFail(scope: { name: string, id: number, ast: { name: string } }, cond: { name: string, id: number }, cause: unknown): HSErrorInfo;
    atomicStep(ruleName: AST): HSErrorInfo;
    expandFail(cause: unknown): HSErrorInfo;
    genStepFail(ruleName: string, cause: unknown, steps?: string): HSErrorInfo;
    combineCyclic: HSErrorInfo;
    combineInconsist: HSErrorInfo;
    combineNoFn: HSErrorInfo;
    combineArgCount: HSErrorInfo;
    combineIrreducible: HSErrorInfo;
    combineEx: HSErrorInfo;
    combineConclusionMismatch: HSErrorInfo;
    liftCompositeVar: HSErrorInfo;
    liftConclusionVar: HSErrorInfo;
    conclusionMismatch: HSErrorInfo;
    notInList: HSErrorInfo;
    unmappedStepProp: HSErrorInfo;
    noSelfLift: HSErrorInfo;
    errRuleUsed(rule: string, cause: unknown): HSErrorInfo;
    replayConclusionMismatch: HSErrorInfo;
    badMetaRule: HSErrorInfo;
    uNeedCond(ruleName: string): HSErrorInfo;
    nestedCVFolder: HSErrorInfo;
    mcptInCVFolder: HSErrorInfo;
    mcptFalse(atoms: AST[], hyp: number): HSErrorInfo;
    mcptTooMany(count: number, max: number): HSErrorInfo;
    msbtBadTemplate: HSErrorInfo;
    msbtNoMatch: HSErrorInfo;
    msbtBadIndex: HSErrorInfo;
    msbtRuleWithCond: HSErrorInfo;
    mcntNoMatch: HSErrorInfo;
    mcntBadIndex: HSErrorInfo;
    mcntAssertFail(cause: unknown): HSErrorInfo;
} = {
    isItemAndWff(name: string): HSErrorInfo { return { type: "isItemAndWff", name }; },
    isNotVar(ast: AST, metaVarName?: string): HSErrorInfo { return { type: "isNotVar", ast, metaVarName }; },
    isNotWFF(ast: AST, metaVarName?: string): HSErrorInfo { return { type: "isNotWFF", ast, metaVarName }; },
    isNotAssertion(ast: AST): HSErrorInfo { return { type: "isNotAssertion", ast }; },
    isNotItem(ast: AST, metaVarName?: string): HSErrorInfo { return { type: "isNotItem", ast, metaVarName }; },
    createRule(ruleName: AST, cause: unknown): HSErrorInfo { return { type: "createRule", ruleName, cause }; },
    matchCond(conditionIndex: number, cause: unknown): HSErrorInfo { return { type: "matchCond", conditionIndex, cause }; },
    futureCondition(conditionId: number, appendId: number): HSErrorInfo { return { type: "futureCondition", conditionId, appendId }; },
    assertFail(assertionIndex: number, cause: unknown): HSErrorInfo { return { type: "assertFail", assertionIndex, cause }; },
    sbFail(destination: AST, quantifierSet: Set<string>, cause: unknown): HSErrorInfo { return { type: "sbFail", destination, quantifierSet, cause }; },
    assertForeverFail(ast: AST): HSErrorInfo { return { type: "assertForeverFail", ast }; },
    assertNeverFail(ast: AST): HSErrorInfo { return { type: "assertNeverFail", ast }; },
    // 无参错误：直接常量对象（不再用工厂函数）
    emptyValue: { type: "emptyValue" },
    noConclusion: { type: "noConclusion" },
    cmdIsRunning: { type: "cmdIsRunning" },
    pListIsntEmpty: { type: "pListIsntEmpty" },
    invalidPropName: { type: "invalidPropName" },
    nameAlreadyExist(name: string): HSErrorInfo { return { type: "nameAlreadyExist", name }; },
    invalidRuleNameStartsWith(invalidChars: string): HSErrorInfo { return { type: "invalidRuleNameStartsWith", invalidChars }; },
    localVarInConclusion: { type: "localVarInConclusion" },
    sbInHyp: { type: "sbInHyp" },
    distinctFail: { type: "distinctFail" },
    matchFail(expected: AST | null, actual: AST | null, metaVarName?: string): HSErrorInfo { return { type: "matchFail", expected, actual, metaVarName }; },
    conclusionFail(cause: unknown): HSErrorInfo { return { type: "conclusionFail", cause }; },
    deductFail(ruleName: string, cause: unknown): HSErrorInfo { return { type: "deductFail", ruleName, cause }; },
    inconsistCondNum: { type: "inconsistCondNum" },
    hypFail(cause: unknown): HSErrorInfo { return { type: "hypFail", cause }; },
    dname404(ruleName: string): HSErrorInfo { return { type: "dname404", ruleName }; },
    pname404(propName: string): HSErrorInfo { return { type: "pname404", propName }; },
    unknownCmd(command: string): HSErrorInfo { return { type: "unknownCmd", command }; },
    argNotEnough(command: string): HSErrorInfo { return { type: "argNotEnough", command }; },
    delFail(item: { name: string, id: number }, rely: { name: string, id: number }[], cause: unknown): HSErrorInfo { return { type: "delFail", item, rely, cause }; },
    invalidPropDir: { type: "invalidPropDir" },
    capturePFail(scope: { name: string, id: number, ast: { name: string } }, cond: { name: string, id: number }, cause: unknown): HSErrorInfo { return { type: "capturePFail", scope, cond, cause }; },
    atomicStep(ruleName: AST): HSErrorInfo { return { type: "atomicStep", ruleName }; },
    expandFail(cause: unknown): HSErrorInfo { return { type: "expandFail", cause }; },
    // 组合/元规则内部错误（原 INTERNAL_MESSAGES key）
    combineCyclic: { type: "combineCyclic" },
    combineInconsist: { type: "combineInconsist" },
    combineNoFn: { type: "combineNoFn" },
    combineArgCount: { type: "combineArgCount" },
    combineIrreducible: { type: "combineIrreducible" },
    combineEx: { type: "combineEx" },
    combineConclusionMismatch: { type: "combineConclusionMismatch" },
    liftCompositeVar: { type: "liftCompositeVar" },
    liftConclusionVar: { type: "liftConclusionVar" },
    conclusionMismatch: { type: "conclusionMismatch" },
    notInList: { type: "notInList" },
    unmappedStepProp: { type: "unmappedStepProp" },
    noSelfLift: { type: "noSelfLift" },
    errRuleUsed(rule: string, cause: unknown): HSErrorInfo { return { type: "errRuleUsed", rule, cause }; },
    replayConclusionMismatch: { type: "replayConclusionMismatch" },
    badMetaRule: { type: "badMetaRule" },
    uNeedCond(ruleName: string): HSErrorInfo { return { type: "uNeedCond", ruleName }; },
    nestedCVFolder: { type: "nestedCVFolder" },
    mcptInCVFolder: { type: "mcptInCVFolder" },
    mcptFalse(atoms: AST[], hyp: number): HSErrorInfo { return { type: "mcptFalse", atoms, hyp }; },
    mcptTooMany(count: number, max: number): HSErrorInfo { return { type: "mcptTooMany", count, max }; },
    msbtBadTemplate: { type: "msbtBadTemplate" },
    msbtNoMatch: { type: "msbtNoMatch" },
    msbtBadIndex: { type: "msbtBadIndex" },
    msbtRuleWithCond: { type: "msbtRuleWithCond" },
    mcntNoMatch: { type: "mcntNoMatch" },
    mcntBadIndex: { type: "mcntBadIndex" },
    mcntAssertFail(cause: unknown): HSErrorInfo { return { type: "mcntAssertFail", cause }; },
    // 规则 step 生成失败：ruleName 为空表示局部异常（由 getD 补全规则名）
    genStepFail(ruleName: string, cause: unknown, steps?: string): HSErrorInfo { return { type: "genStepFail", ruleName, cause, steps }; }
};
