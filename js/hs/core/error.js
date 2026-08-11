export function isHSErrorInfo(value) {
    return typeof value === "object" && value !== null && "type" in value;
}
export const HSError = {
    isItemAndWff(name) { return { type: "isItemAndWff", name }; },
    isNotVar(ast, metaVarName) { return { type: "isNotVar", ast, metaVarName }; },
    isNotWFF(ast, metaVarName) { return { type: "isNotWFF", ast, metaVarName }; },
    isNotAssertion(ast) { return { type: "isNotAssertion", ast }; },
    isNotItem(ast, metaVarName) { return { type: "isNotItem", ast, metaVarName }; },
    createRule(ruleName, cause) { return { type: "createRule", ruleName, cause }; },
    matchCond(conditionIndex, cause) { return { type: "matchCond", conditionIndex, cause }; },
    assertFail(assertionIndex, cause) { return { type: "assertFail", assertionIndex, cause }; },
    sbFail(destination, quantifierSet, cause) { return { type: "sbFail", destination, quantifierSet, cause }; },
    assertForeverFail(ast) { return { type: "assertForeverFail", ast }; },
    assertNeverFail(ast) { return { type: "assertNeverFail", ast }; },
    emptyValue() { return { type: "emptyValue" }; },
    noConclusion() { return { type: "noConclusion" }; },
    cmdIsRunning() { return { type: "cmdIsRunning" }; },
    pListIsntEmpty() { return { type: "pListIsntEmpty" }; },
    invalidPropName() { return { type: "invalidPropName" }; },
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
    pname404(propName) { return { type: "pname404", propName }; },
    unknownCmd(command) { return { type: "unknownCmd", command }; },
    argNotEnough(command) { return { type: "argNotEnough", command }; },
    delFail(rely, cause) { return { type: "delFail", rely, cause }; },
    invalidPropDir() { return { type: "invalidPropDir" }; },
    capturePFail(scope, cond, cause) { return { type: "capturePFail", scope, cond, cause }; }
};
//# sourceMappingURL=error.js.map