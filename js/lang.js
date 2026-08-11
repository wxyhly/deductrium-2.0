// 文件：render-fs-error.ts
import { AtomSolver } from "./hs/core/assert.js";
export class LangMgr {
    static lang = navigator.languages.join(",").includes("zh") ? "zh" : "en";
    static text = {};
    constructor(lang) {
        if (lang)
            LangMgr.lang = lang;
        LangMgr.text = Object.fromEntries(Object.entries(LangMgr._text).map(e => [e[0], e[1][LangMgr.lang]]));
    }
    static _text = {
        deducing: { zh: "正在进行推理 ", en: "Deducing " },
        plsEnterRuleName: { zh: "请输入规则名：", en: "Please enter rule name: " },
        plsEnterNewRule: { zh: '请输入新规则名：', en: "Please enter new rule name: " },
        plsEnterNewProp: { zh: '请输入新步骤名：', en: "Please enter new step name: " },
        plsEnterHyp: { zh: '请输入假设：', en: "Please enter hypothesis: " },
        plsEnterVar: { zh: '请输入变量：', en: "Please enter variable: " },
        plsEnterFolderName: { zh: '请输入文件夹名称：', en: "Please enter folder name: " },
        plsEnterProp: { zh: '请输入或点选推理步骤：', en: "Please enter or click deduction step: " },
        rootList: { zh: '根列表', en: " root list " },
        // 菜单
        rename: { zh: '重命名', en: "Rename" },
        delete: { zh: '删除', en: "Delete" },
        copyCode: { zh: '复制代码', en: "Copy Code" },
        loadMacro: { zh: '加载宏', en: "Load Macro" },
    };
    static formalize = {
        plsEnterCond: cond => this.lang === "zh" ? `请输入条件${cond}的命题编号，或点选命题` : `Please enter the proposition number for condition ${cond}, or click the proposition`,
        plsEnterSubst: sub => this.lang === "zh" ? `请输入替代${sub}的内容` : "",
        activePlaceholder: layer => this.lang === "zh" ? `默认在${layer}中操作` : `Default position in ${layer} for operation`,
    };
    static renderAssertionFailReason(res) {
        const zh = this.lang === "zh";
        if (res?.equalityClasses) {
            const eqs = res.equalityClasses.map(e => e.join("=")).filter(e => e.includes("="));
            return zh ? (eqs.length ? eqs.join("、") + "时" : "") + "断言" + AtomSolver.print(res.failedConclusion) + "失败" : (eqs.length ? "When " + eqs.join(", ") + ", " : "") + "assertion " + AtomSolver.print(res.failedConclusion) + " failed";
        }
        return zh ? "无法保证断言均有效" : "Can't guarantee assertion is always valid";
    }
    static renderHSError(info) {
        const zh = this.lang === "zh";
        const formatCause = (cause) => {
            if (typeof cause === "string")
                return cause;
            if (cause.passed === false || cause.equalityClasses) {
                return this.renderAssertionFailReason((cause.counterexample || cause));
            }
            if (cause.type) {
                return this.renderHSError(cause);
            }
            if (cause instanceof Error && "info" in cause) {
                return this.renderHSError(cause.info);
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
            case "capturePFail":
                return zh
                    ? `条件命题'${info.cond.name || info.cond.id}'无法通过a6公理添加量词'${info.scope.ast.name}'进入'${info.scope.name || info.scope.id}'中：${formatCause(info.cause)}` : `condition proposition '${info.cond.name || info.cond.id}' cannot be added into '${info.scope.name || info.scope.id}' by axiom a6 with quantifier '${info.scope.ast.name}': ${formatCause(info.cause)}`;
            case "sbFail": {
                const qList = Array.from(info.quantifierSet).map(e => `'${e}'`).join(zh ? "、" : ", ");
                return zh
                    ? `非法替换：${info.destination}中的自由变量会被量词${qList}约束。${formatCause(info.cause)}`
                    : `forbidden substitution: free variables in ${info.destination} will be captured by quantifiers ${qList}. ${formatCause(info.cause)}`;
            }
            case "assertForeverFail":
                return zh
                    ? `当前断言永远不满足或与其它断言矛盾：${info.ast}`
                    : `current assertions will never be satisfied or be conflict with other assertions: ${info.ast}`;
            case "assertNeverFail":
                return zh
                    ? `当前断言已确定成立，无需添加：${info.ast}`
                    : `current assertions will always be satisfied, and will be useless: ${info.ast}`;
            case "emptyValue":
                return zh ? "空表达式" : "empty expression";
            case "cmdIsRunning":
                return zh ? "进行操作前请结束当前命令" : "please finish the current command before executing another";
            case "noConclusion":
                return zh ? "无有效结论" : "no valid conclusion";
            case "nameAlreadyExist":
                return zh ? `名称“${info.name}”已存在` : `name "${info.name}" already exists`;
            case "invalidRuleNameStartsWith": {
                const list = Array.from(info.invalidChars).map(e => `'${e}'`).join(zh ? "、" : ", ");
                return zh ? `规则名不能以${list}开头` : `rule name can't start with ${list}`;
            }
            case "invalidPropName": {
                return zh ? "推理步骤只能以小写字母开头，且只包含字母、下划线或数字" : "name of deduction step can only start with a lowercase letter and contain only letters, underscore or digits";
            }
            case "invalidPropDir": {
                return zh ? "该推理步骤不包含层级" : "this deduction step contains no sub-layer";
            }
            case "localVarInConclusion":
                return zh ? "结论中不能出现局部变量" : "local variable can't appear in the conclusion";
            case "sbInHyp":
                return zh ? "假设中不能出现未化简的#sb函数" : "function #sb can't appear in the hypotheses";
            case "pListIsntEmpty":
                return zh ? "请先清空推理表再操作" : "Step table must be empty before the operation";
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
            case "pname404":
                return zh ? `未知推理步骤：${info.propName}` : `unknown deduction step: ${info.propName}`;
            case "unknownCmd":
                return zh ? `未知命令：${info.command}` : `unknown command: ${info.command}`;
            case "argNotEnough":
                return zh ? `命令${info.command}的参数不足` : `not enough arguments for command ${info.command}`;
            case "delFail":
                return zh ? `无法删除：该项被${info.rely.map(p => `'${p.name || p.id}'`).join("、")}依赖` + (info.cause ? "，删除后导致" + formatCause(info.cause) : "") : `cannot delete due to dependencies on ${info.rely.map(p => `'${p.name || p.id}'`).join(", ")}` + (info.cause ? ": " + formatCause(info.cause) : "");
            default:
                return zh ? `未知错误：${JSON.stringify(info)}` : `unknown error: ${JSON.stringify(info)}`;
        }
    }
}
//# sourceMappingURL=lang.js.map