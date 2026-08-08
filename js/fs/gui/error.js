/**
 * 将 FSErrorInfo 渲染为指定语言的字符串。
 * 可扩展：返回 React 节点或 HTML 以实现高亮。
 */
export function renderFSError(info, lang) {
    const zh = lang === "zh";
    const formatCause = (cause) => {
        if (typeof cause === "string")
            return cause;
        if (cause instanceof Error && "info" in cause) {
            return renderFSError(cause.info, lang); // 递归渲染嵌套 FSError
        }
        return String(cause);
    };
    switch (info.type) {
        case "isItemAndWff":
            return zh
                ? `元变量${info.name}不能同时为项和公式`
                : `meta variable ${info.name} cannot be both item and wff`;
        case "isNotVar": {
            const prefix = zh
                ? (info.metaVarName ? `元变量${info.metaVarName}的取值` : "")
                : (info.metaVarName ? `value of the meta variable ${info.metaVarName}: ` : "");
            return `${prefix}${info.ast}${zh ? "不是变量" : " is not a variable"}`;
        }
        case "isNotWFF": {
            const prefix = zh
                ? (info.metaVarName ? `元变量${info.metaVarName}的取值` : "")
                : (info.metaVarName ? `value of the meta variable ${info.metaVarName}: ` : "");
            return `${prefix}${info.ast}${zh ? "不是公式" : " is not a wff"}`;
        }
        case "isNotAssertion":
            return zh ? `${info.ast}不是断言` : `${info.ast} is not an assertion`;
        case "isNotItem": {
            const prefix = zh
                ? (info.metaVarName ? `元变量${info.metaVarName}的取值` : "")
                : (info.metaVarName ? `value of the meta variable ${info.metaVarName}: ` : "");
            return `${prefix}${info.ast}${zh ? "不是项" : " is not an item"}`;
        }
        case "createRule":
            return zh
                ? `创建规则${info.ruleName}时：${formatCause(info.cause)}`
                : `create rule ${info.ruleName} failed: ${formatCause(info.cause)}`;
        case "matchCond":
            return zh
                ? `匹配条件${info.conditionIndex}时：${formatCause(info.cause)}`
                : `match condition ${info.conditionIndex} failed: ${formatCause(info.cause)}`;
        case "assertFail":
            return zh
                ? `第${info.assertionIndex}个断言失败：${formatCause(info.cause)}`
                : `assertion ${info.assertionIndex} failed: ${formatCause(info.cause)}`;
        case "sbFail": {
            const qList = Array.from(info.quantifierSet).map(e => `'${e}'`).join(zh ? "、" : ", ");
            return zh
                ? `非法替换：${info.destination}中的自由变量会被量词${qList}约束。${formatCause(info.cause)}`
                : `forbidden substitution: free variables in ${info.destination} will be captured by quantifiers ${qList}. ${formatCause(info.cause)}`;
        }
        case "assertForeverFail":
            return zh
                ? `当前断言永远不满足或与其它断言矛盾：${formatCause(info.cause)}`
                : `current assertions will never be satisfied or be conflict with other assertions: ${formatCause(info.cause)}`;
        case "assertNeverFail":
            return zh
                ? `当前断言已确定成立，无需添加：${formatCause(info.cause)}`
                : `current assertions will always be satisfied, and will be useless: ${formatCause(info.cause)}`;
        case "emptyValue":
            return zh ? "空表达式" : "empty expression";
        case "noConclusion":
            return zh ? "无有效结论" : "no valid conclusion";
        case "nameAlreadyExist":
            return zh ? `名称“${info.name}”已存在` : `name "${info.name}" already exists`;
        case "invalidRuleNameStartsWith": {
            const list = Array.from(info.invalidChars).map(e => `'${e}'`).join(zh ? "、" : ", ");
            return zh ? `规则名不能以${list}开头` : `rule name can't start with ${list}`;
        }
        case "localVarInConclusion":
            return zh ? "结论中不能出现局部变量" : "local variable can't appear in the conclusion";
        case "sbInHyp":
            return zh ? "假设中不能出现未化简的#sb函数" : "function #sb can't appear in the hypotheses";
        case "distinctFail":
            return zh ? "变量不满足互不相同" : "variables are not mutually distinct";
        case "matchFail": {
            const prefix = zh
                ? (info.metaVarName ? `元变量${info.metaVarName}取值不一致：` : "")
                : (info.metaVarName ? `meta variable ${info.metaVarName} has inconsistent values: ` : "");
            return `${prefix}${info.expected ?? "空"} <=X=> ${info.actual ?? "空"}`;
        }
        case "conclusionFail":
            return zh
                ? `生成结论失败：${formatCause(info.cause)}`
                : `conclusion failed: ${formatCause(info.cause)}`;
        case "deductFail":
            return zh
                ? `执行规则${info.ruleName}失败：${formatCause(info.cause)}`
                : `deduction ${info.ruleName} failed: ${formatCause(info.cause)}`;
        case "inconsistCondNum":
            return zh ? "条件数量不一致" : "inconsistent number of conditions";
        case "hypFail":
            return zh
                ? `创建假设失败：${formatCause(info.cause)}`
                : `add hypothesis failed: ${formatCause(info.cause)}`;
        case "dname404":
            return zh ? `未知规则名：${info.ruleName}` : `unknown rule name: ${info.ruleName}`;
        case "unknownCmd":
            return zh ? `未知命令：${info.command}` : `unknown command: ${info.command}`;
        default:
            const _exhaustive = info;
            return "Unknown error";
    }
}
//# sourceMappingURL=error.js.map