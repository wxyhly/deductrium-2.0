// 文件：render-fs-error.ts
import { AssertionCheckResult, AtomSolver } from "./hs/core/assert.js";
import { HSErrorInfo } from "./hs/core/error.js";

export class LangMgr {
    static lang = navigator.languages.join(",").includes("zh") ? "zh" : "en";
    static text: Record<string, string> = {};
    constructor(lang?: string) {
        if (lang) LangMgr.lang = lang;
        LangMgr.text = Object.fromEntries(Object.entries(LangMgr._text).map(e => [e[0], e[1][LangMgr.lang]]));
        LangMgr.applyStaticI18n();
    }
    // 把静态 HTML 中所有 [data-i18n] 文案按当前语言替换
    // （推理层/进度层/命令栏等静态结构统一在此处理，避免各处各自替换）
    static applyStaticI18n() {
        document.querySelectorAll("[data-i18n]").forEach(el => {
            const key = el.getAttribute("data-i18n")!;
            const text = LangMgr.text[key];
            if (text) el.textContent = text;
        });
    }
    private static _text: Record<string, Record<string, string>> = {
        deducing: { zh: "正在进行推理 ", en: "Deducing " },
        plsEnterRuleName: { zh: "请输入规则名：", en: "Please enter rule name: " },
        plsEnterNewRule: { zh: '请输入新规则名：', en: "Please enter new rule name: " },
        plsEnterNewProp: { zh: '请输入新步骤名：', en: "Please enter new step name: " },
        plsEnterHyp: { zh: '请输入假设：', en: "Please enter hypothesis: " },
        plsEnterVar: { zh: '请输入变量：', en: "Please enter variable: " },
        plsEnterFolderName: { zh: '请输入文件夹名称：', en: "Please enter folder name: " },
        plsEnterProp: { zh: '请输入或点选推理步骤：', en: "Please enter or click deduction step: " },
        rootList: { zh: '根列表', en: " root list " },
        // 推理层静态标题
        ruleList: { zh: '规则表', en: "Rules" },
        propList: { zh: '推理表', en: "Deduction Table" },
        cmdBar: { zh: '命令栏', en: "Command" },
        addFolder: { zh: '+ 文件夹', en: "+ Folder" },
        // 菜单
        rename: { zh: '重命名', en: "Rename" },
        delete: { zh: '删除', en: "Delete" },
        copyCode: { zh: '复制代码', en: "Copy Code" },
        loadMacro: { zh: '加载宏', en: "Load Macro" },
        expand: { zh: '肢解', en: "Expand" },
        errorRule: { zh: '错误规则', en: "Broken Rule" },
        setActiveFolder: { zh: '设为活动文件夹', en: "Set Active Folder" },
        clearActiveFolder: { zh: '取消活动', en: "Clear Active" },
        newFolder: { zh: '文件夹', en: "Folder" },
        // 进度层
        progressLayer: { zh: '进度', en: "Progress" },
        layerD: { zh: '推理层', en: "Deduction" },
        layerP: { zh: '进度层', en: "Progress" },
        pgStats: { zh: '统计', en: "Stats" },
        statDeductrium: { zh: '拥有推理素', en: "Deductrium Owned" },
        statConsumed: { zh: '累计消耗推理素', en: "Total Deductrium Consumed" },
        statParcours: { zh: '总方块步数', en: "Total Block Steps" },
        saveMgmt: { zh: '存档管理', en: "Save Management" },
        currentProgress: { zh: '当前进度', en: "Current Progress" },
        gameMode: { zh: '游戏模式', en: "Game Mode" },
        currentGameMode: { zh: '当前游戏模式：', en: "Current game mode: " },
        modeSurvival: { zh: '生存', en: "Survival" },
        modeCreative: { zh: '创造', en: "Creative" },
        modeShareHint: { zh: '不同模式之间不共享游戏进度；一个存档文件只保存一份进度，不含槽位信息。', en: "Progress is not shared between game modes; a save file holds only one progress and does not include slots." },
        exportFile: { zh: '导出文件', en: "Export File" },
        importFile: { zh: '导入文件', en: "Import File" },
        resetProgress: { zh: '重置进度', en: "Reset Progress" },
        resetConfirm: { zh: '确定重置当前进度吗？注：该操作不会清空槽位中的存档。', en: "Reset current progress? Hint: This will not clear saves in slots." },
        saveSlots: { zh: '槽位', en: "Slots" },
        slotEmpty: { zh: '空', en: "Empty" },
        saveShort: { zh: '保存', en: "Save" },
        loadShort: { zh: '加载', en: "Load" },
        exportShort: { zh: '导出', en: "Export" },
        importConfirm: { zh: '导入会覆盖当前进度，确定继续吗？', en: "Import will overwrite the current progress. Continue?" },
        importFailed: { zh: '导入失败：文件格式或模式不匹配', en: "Import failed: bad file format or mode mismatch" },
        exportFailed: { zh: '没有可导出的存档', en: "No save to export" },
        loadSlotConfirm: { zh: '该操作将覆盖目前进度，是否继续？', en: "This will overwrite the current progress. Continue?" },
        deleteSlotConfirm: { zh: '确定删除该槽位吗？', en: "Delete this slot?" },
        overwriteSlotConfirm: { zh: '该操作将覆盖该槽位的存档，是否继续？', en: "This will overwrite the save in this slot. Continue?" },
        slotInfo: { zh: '{mode} · {time} · {size}', en: "{mode} · {time} · {size}" },
        language: { zh: '语言', en: "Language" },
        langAuto: { zh: '跟随系统', en: "System" },
        contact: { zh: '若遇Bug或其它任何问题：', en: "Found a bug or any issue?" },
        contactAuthor: { zh: '欢迎联系游戏作者', en: "Contact the author" },
        contactQQ: { zh: '游戏QQ交流群', en: "Game QQ group" },
        // 几何层 tile 渲染
        delGate: { zh: '(此门已拆除)', en: '(Destructed gate)' },
        dstrPrefix: { zh: '拆除门', en: 'Destruct Gate ' },
        neverLocked: { zh: '你永远别想拿到这个奖励！', en: "You'll never get this reward!" },
        neverReward: { zh: '你拿到了本该\n永远拿不到的奖励\n如果你没有作弊\n则是游戏bug，请联系作者', en: 'You obtained the reward that\nshould never be obtainable.\nIf you didn\'t cheat,\nthis is a game bug — please contact the author' },
        unlockPrefix: { zh: '解锁', en: 'Unlock ' },
        unlockedPrefix: { zh: '已解锁', en: 'Unlocked ' },
        // 推理表sheet
        newSheet: { zh: '新建推理表', en: "New Sheet" },
        defaultSheetName: { zh: '表', en: "Sheet" },
        deleteSheet: { zh: '删除推理表', en: "Delete Sheet" },
        confirmDeleteSheet: { zh: '确定删除该推理表吗？', en: "Delete this sheet?" },
    };
    static formalize: Record<string, (...args: any[]) => string> = {
        plsEnterCond: cond => this.lang === "zh" ? `请输入条件${cond}的命题编号，或点选命题` : `Please enter the proposition number for condition ${cond}, or click the proposition`,
        plsEnterSubst: sub => this.lang === "zh" ? `请输入替代${sub}的内容` : "",
        activePlaceholder: layer => this.lang === "zh" ? `默认在${layer}中操作` : `Default position in ${layer} for operation`,
        getD: (n, got) => this.lang === "zh" ? `${got ? "已获取" : "获取"}${n}推理素` : `${got ? "Obtained" : "Obtain"} ${n} of deductrium`,
        payD: n => this.lang === "zh" ? `通过此门需消耗推理素${n}` : `To pass this gate you need ${n} of deductrium`,
        // 过门扣费警告（旧版逻辑：余额不足消耗量2倍时确认；无拆门技能时额外提示重复扣钱）
        payDWarning: (needed, has, hasDg) => this.lang === "zh"
            ? `进入此门将消耗${needed}推理素，您只有${has}推理素，确认要继续吗？${hasDg ? "" : "注意，退出后重新进入门会重复扣钱！"}`
            : `Entering this gate will consume ${needed} of deductrium, you only have ${has} of deductrium, confirm to continue? ${hasDg ? "" : "Note: exiting and re-entering the gate will consume deductrium again!"}`,
        // 槽位加载确认：slotMode=槽位存档模式，curMode=当前模式（相同则覆盖当前；不同则跳转后覆盖目标模式）
        loadSlotConfirm: (slotMode, curMode) => this.lang === "zh"
            ? `将覆盖${slotMode}模式的进度${slotMode !== curMode ? `并跳转到${slotMode}模式（当前${curMode}模式的进度不受影响）` : ""}，是否继续？`
            : `This will overwrite the ${slotMode} mode progress${slotMode !== curMode ? ` and switch to ${slotMode} mode (current ${curMode} mode progress is not affected)` : ""}. Continue?`
    }
    static renderAssertionFailReason(res: AssertionCheckResult["counterexample"]) {
        const zh = this.lang === "zh";
        if (res?.equalityClasses) {
            const eqs = res.equalityClasses.map(e => e.join("=")).filter(e => e.includes("="));
            return zh ? (eqs.length ? eqs.join("、") + "时" : "") + "断言" + AtomSolver.print(res.failedConclusion) + "失败" : (eqs.length ? "When " + eqs.join(", ") + ", " : "") + "assertion " + AtomSolver.print(res.failedConclusion) + " failed";
        }
        return zh ? "无法保证断言均有效" : "Can't guarantee assertion is always valid";
    }
    static renderHSError(info: HSErrorInfo): string {
        const zh = this.lang === "zh";
        const formatCause = (cause: unknown): string => {
            if (typeof cause === "string") return cause;
            if ((cause as any).passed === false || (cause as any).equalityClasses) {
                return this.renderAssertionFailReason(((cause as any).counterexample || cause) as AssertionCheckResult["counterexample"]);
            }
            if ((cause as any).type) {
                return this.renderHSError(cause as HSErrorInfo);
            }
            if (cause instanceof Error && "info" in cause) {
                return this.renderHSError((cause as any).info);
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
                return zh ? `无法删除'${info.item.name || info.item.id}'：该项被${info.rely.map(p => `'${p.name || p.id}'`).join("、")}依赖` + (info.cause ? "，删除后导致" + formatCause(info.cause) : "") : `cannot delete '${info.item.name || info.item.id}' due to dependencies on ${info.rely.map(p => `'${p.name || p.id}'`).join(", ")}` + (info.cause ? ": " + formatCause(info.cause) : "");
            case "atomicStep":
                return zh ? `规则${info.ruleName}是原子规则，无法展开` : `rule ${info.ruleName} is atomic, cannot expand`;
            case "expandFail":
                return zh ? `展开失败：${formatCause(info.cause)}` : `expand failed: ${formatCause(info.cause)}`;
            case "genStepFail": {
                const prefix = info.ruleName
                    ? zh ? `生成规则 ${info.ruleName} 的步骤失败：` : `failed to generate step of rule ${info.ruleName}: `
                    : "";
                const steps = info.steps
                    ? zh ? `；已生成步骤：\n${info.steps}` : `; generated steps:\n${info.steps}`
                    : "";
                return prefix + formatCause(info.cause) + steps;
            }
            case "badMetaRule":
                return zh ? "错误的元规则" : "bad meta rule";
            case "combineCyclic":
                return zh ? "无法解算变量约束，可能存在循环替换" : "cannot solve variable constraints, possible cyclic replacement";
            case "combineInconsist":
                return zh ? "无法解算变量约束，可能存在不一致替换" : "cannot solve variable constraints, inconsistent replacement";
            case "combineNoFn":
                return zh ? "组合规则缺少函数名" : "combination rule missing function name";
            case "combineArgCount":
                return zh ? "组合规则参数多于函数规则的条件数" : "combination rule has more arguments than the function rule's conditions";
            case "combineIrreducible":
                return zh ? "断言中含无法化简的表达式(如#sb)，无法生成组合规则" : "assertion contains an irreducible expression (e.g. #sb), cannot generate combination rule";
            case "combineEx":
                return zh ? "断言化简出ex，无法生成组合规则" : "assertion reduces to ex, cannot generate combination rule";
            case "combineConclusionMismatch":
                return zh ? "组合规则的结论与推导结果不一致" : "combination rule conclusion mismatches the derivation result";
            case "liftCompositeVar":
                return zh ? "组合提升暂不支持变量被替换为复合表达式的步骤" : "combined lift does not support steps whose variables are replaced by composite expressions";
            case "liftConclusionVar":
                return zh ? "组合提升暂不支持含结论独有变量的步骤" : "combined lift does not support steps with conclusion-only variables";
            case "conclusionMismatch":
                return zh ? "结论与推导结果不一致" : "conclusion mismatches the derivation result";
            case "notInList":
                return zh ? "命题不在列表中" : "proposition not in the list";
            case "unmappedStepProp":
                return zh ? "步骤引用了无法映射的命题" : "step references an unmappable proposition";
            case "noSelfLift":
                return zh ? "文件夹自身被引用但未生成.i提升" : "folder is referenced by itself but no .i lift was generated";
            case "errRuleUsed":
                return zh
                    ? `规则 ${info.rule} 加载出错：${formatCause(info.cause)}`
                    : `rule ${info.rule} failed to load: ${formatCause(info.cause)}`;
            case "replayConclusionMismatch":
                return zh ? "推理步骤重放后与规则结论不一致" : "replayed steps do not match the rule conclusion";
            default:
                return zh ? `未知错误：${JSON.stringify(info)}` : `unknown error: ${JSON.stringify(info)}`;
        }
    }
}

// ===== 几何层（hy）旧代码依赖的翻译接口 =====
// 暂不接入语言翻译逻辑：TRC/TRC1 原样返回文本，langMgr 为同名占位对象。
// 后续接入翻译时再替换为真实实现。
export const TRC = (text: string): string => text;
export const TRC1 = (text: string): string => text;
export const langMgr = { trc: TRC, trc1: TRC1 };
