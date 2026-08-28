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
        // msbt 替换元定理
        plsEnterMsbtTemplate: { zh: '请输入匹配模板公式（xx↔xx）：', en: "Enter match template wff (xx↔xx): " },
        plsEnterMsbtStep: { zh: '请输入匹配模板推理步骤：', en: "Enter the template step: " },
        plsEnterMsbtTarget: { zh: '请输入要替换的wff或推理步骤：', en: "Enter the wff or step to replace: " },
        plsEnterMsbtIndex: { zh: '请输入要替换的位置（匹配顺序为从外到内、从左到右，{2,-2}表示替换第2个和倒数第二个，0表示全部替换）：', en: "Enter substitution index (the order of matching is from outside to inside, from left to right, {2,-2} means replace the 2nd and the second last, 0 means replace all): " },
        // mcnt 换名元定理
        plsEnterMcntRule: { zh: '请输入换名规则执行的位置索引（格式：{pos1,pos2...}，其中pos可以是变量、{索引,变量}对、. 占位符）：', en: "Enter rename rule (e.g. {pos1,pos2...}: elements can be a variable, {index,var} pair, . placeholder): " },
        rootList: { zh: '根列表', en: " root list " },
        // 推理层静态标题
        ruleList: { zh: '规则表', en: "Rule Table" },
        propList: { zh: '推理表', en: "Deduction Steps" },
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
        // 类型层
        layerT: { zh: '类型层', en: "Type" },
        sysTable: { zh: '系统定义', en: "System Defs" },
        ttTable: { zh: '定理表', en: "Theorems" },
        ttAddFolder: { zh: '+ 文件夹', en: "+ Folder" },
        ttAddItem: { zh: '+ 命题', en: "+ Item" },
        // 类型层系统表 prefix 翻译（name 列显示方括号内的前缀）
        ttType: { zh: '类型', en: "TYPE" },
        ttCtor: { zh: '构造', en: "CTOR" },
        ttInd: { zh: '解构', en: "IND" },
        ttDef: { zh: '定义', en: "DEF" },
        ttRule: { zh: '计算', en: "COMPUTE" },
        ttParseError: { zh: '无法解析表达式', en: "Cannot parse expression" },
        // 进度层
        progressLayer: { zh: '进度', en: "Progress" },
        layerD: { zh: '推理层', en: "Deduction" },
        layerG: { zh: '几何层', en: "Geometry" },
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
        // 成就
        achievements: { zh: '成就', en: "Achievements" },
        achUnlocked: { zh: '获得成就：', en: "Achievement Unlocked: " },
        achGainDeductrium: { zh: '推理素 +', en: "Deductrium +" },
        achPayDeductrium: { zh: '推理素 -', en: "Deductrium -" },
        achTotal: { zh: '（共', en: " (total " },
        achTotalEnd: { zh: '）', en: ")" },
        // 知识库
        knowledgeBase: { zh: '知识库', en: "Knowledge Base" },
        symbols: { zh: '符号', en: "Symbols" },
        kbNotes: { zh: '笔记', en: "Notes" },
        inputWay: { zh: '输入方式', en: "Input" },
        kbEmpty: { zh: '暂无笔记。在游戏中通过相应方块或获得对应奖励以解锁知识。', en: "No notes yet. Unlock knowledge by passing tiles or obtaining matching rewards in game." },
        kbEmptyCreative: { zh: '（创造模式应显示全部知识，此提示不应出现）', en: "(Creative mode should show all notes; this message should not appear)" },
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
            : `This will overwrite the ${slotMode} mode progress${slotMode !== curMode ? ` and switch to ${slotMode} mode (current ${curMode} mode progress is not affected)` : ""}. Continue?`,
        // 成就 toast：获得成就 / 获得推理素 / 消耗推理素
        achToast: name => this.lang === "zh" ? `获得成就：${name}` : `Achievement Unlocked: ${name}`,
        gainDeductriumToast: (amt, total) => this.lang === "zh" ? `推理素 +${amt}（共${total}）` : `Deductrium +${amt} (total ${total})`,
        payDeductriumToast: (amt, total) => this.lang === "zh" ? `推理素 -${amt}（共${total}）` : `Deductrium -${amt} (total ${total})`,
    }
    // 成就名称字典：identifier → {zh,en}（identifier 与 tile.data.ac 对应）
    static achievements: Record<string, Record<string, string>> = {
        // 行1：入门
        progL: { zh: '解锁了成就', en: "Achievement Unlocked" },
        aa: { zh: '我推出我', en: "I Proved Me" },
        delgate: { zh: '收费站拆除', en: "Crash Toll Gate" },
        ".i": { zh: '你推出你，他推出他（⊢$0>$0）', en: "You Proved you, He Proved Him (⊢$0>$0)" },
        hyp: { zh: 'If I were..', en: "If I were.." },
        mdt: { zh: '会跑的"⊢"（演绎元定理）', en: "Running '⊢' (Deduction Metatheorem)" },
        // 行2：否定入门
        firstEat: { zh: '吃素啦', en: "Gather Deductrium" },
        firstPay: { zh: '第一次消费', en: "First Consume" },
        neg: { zh: '敢于说不', en: "The Courage to Deny" },
        ".dne": { zh: '负负得正', en: "Double Negation Elimination" },
        exfalso1: { zh: '否定爆炸', en: "Explosion Principle (exfalso)" },
        iff: { zh: '我推出你，你推出我（<>）', en: "I Proved You, You Proved Me (<>)" },
        // 行3：命题逻辑
        vegan40: { zh: '素食主义者（累计获40µg推理素）', en: "Deductriumist (Accumulated 40µg of Deductrium)" },
        andor: { zh: '逻辑门（与/或）', en: "Logic Gates (AND/OR)" },
        lem: { zh: '排中律是真的！(p|~p)', en: "LEM is True! (p|~p)" },
        contra: { zh: '没毛病！~( p & ~p )', en: "No Problem! ~( p & ~p )" },
        pierce: { zh: '皮尔士定律((p>q)>p)>p', en: "Peirce's Law ((p>q)>p)>p" },
        mcpt: { zh: '命题逻辑自动推理', en: "Automated Propositional Reasoning" },
        // 行4：一阶逻辑
        "1st": { zh: '一阶逻辑', en: "1st-Order Logic" },
        nf: { zh: '约束与自由', en: "Bound and Free Variables" },
        rp: { zh: '丢掉量词，尽情替换！', en: "Drop Quantifiers, Replace Freely!" },
        a7: { zh: '众生平等', en: "Equality for All" },
        mvt: { zh: '概括一切（概括元定理）', en: "Generalize Everything (Metatheorem)" },
        ".prop": { zh: '命题逻辑大礼包', en: "Propositional Logic Toolkit" },
        // 行5：元定理
        mifft: { zh: '替换一切（互推替换元定理）', en: "Replace Everything (IFF Metatheorem)" },
        terr1: { zh: '割让量词的领土', en: "Quantifier Relinquishment" },
        ".1st": { zh: '一阶逻辑大礼包', en: "1st-Order Logic Toolkit" },
        elV1: { zh: '量词连连消消乐', en: "Quantifier Elimination Challenge" },
        mnt: { zh: '准备改名换姓', en: "Ready for α-Conversion" },
        dose1mg: { zh: '加大剂量（累计获1mg推理素）', en: "Dose Increased (Accumulated 1mg of Deductrium)" },
        // 行6：皮亚诺
        peano: { zh: '皮亚诺公理', en: "Peano Axioms" },
        "1+1": { zh: '1+1=2', en: "1+1=2" },
        "2x2": { zh: '2×2=4', en: "2×2=4" },
        "commu+": { zh: '加法交换律', en: "Commutativity of Addition" },
        xdistr: { zh: '乘法分配率', en: "Distributivity of Multiplication" },
        dose1g: { zh: '致死剂量（累计获1g推理素）', en: "Lethal Dose (Accumulated 1g of Deductrium)" },
        // 行7：数论
        "3<4": { zh: '3小于4', en: "3 is Less Than 4" },
        "5R6": { zh: '5不整除6', en: "5 Does Not Divide 6" },
        dPrime: { zh: '解锁素数', en: "Prime Number Unlocked" },
        prm7: { zh: '7是素数', en: "7 is Prime" },
        "ex!": { zh: '任何数都有阶乘', en: "Factorials for All Numbers" },
        infprm: { zh: '质数有无穷个', en: "Infinitely Many Primes" },
        // 行8：类型论入门
        type: { zh: '类型论', en: "Type Theory" },
        ttrue: { zh: '真理之门', en: "Gate of Truth" },
        ttsimplFn: { zh: '简化依赖函数', en: "Simplify Dependent Functions" },
        ttactic1: { zh: '证明助手上线！', en: "Proof Assistant Hired!" },
        ttEq: { zh: '相等类型', en: "Identity Types" },
        ttindnat: { zh: '自然数的归纳法', en: "Induction on Natural Numbers" },
        // 行9：类型论进阶
        AllTrue: { zh: 'True的值都是true', en: "All Values of True are true" },
        "tt1+1": { zh: '1+1=2类型论版', en: "1+1=2 in Type Theory" },
        ttindeq: { zh: '相等的归纳法', en: "Induction on Equality" },
        "0+x": { zh: '代入方程即可', en: "Substitution Solves It" },
        "1neq2": { zh: '1就是1，2就是2（not (eq 1 2)）', en: "1 is 1, 2 is 2 (not (eq 1 2))" },
        tt5R7: { zh: '数论达人(5不整除7)', en: "Number Theory Master (5 Does Not Divide 7)" },
        // 行10：高阶同伦
        S1S1: { zh: '顺时针一圈逆时针一圈，还是回到原点', en: "CW plus CCW Returns to Origin" },
        eqvid: { zh: '我等价我', en: "I Am Equivalent to Me" },
        ttua: { zh: '泛等公理（ua）', en: "Univalence Axiom (ua)" },
        looprfl: { zh: '圆圈跟圆点不同伦（loop不是rfl）', en: "Circle and Point Are Not Homotopic (loop is not rfl)" },
        ttpierce: { zh: '原来皮尔士跟他们是一伙的', en: "Peirce Is One of Them" },
        lemlie: { zh: '排中律是个谎言！？', en: "LEM Is a Lie!?" },
        // 行11：类型论进阶2
        ttEven: { zh: '又是偶数', en: "Even Again" },
        ttList: { zh: 'cons cons cons nil', en: "cons cons cons nil" },
        ttZ: { zh: '类型论版整数', en: "Integers in Type Theory" },
        ":=factorial2": { zh: '双阶乘！！', en: "Double factorial!!" },
        tteven0: { zh: 'Even 0只有even0', en: "Even 0 has only even0" },
        ttWnat: { zh: 'W自然数', en: "W-nat" },
        // 行12：fnext
        ttfnext: { zh: '外延公理(fnext)', en: "function extensionality axiom (fnext)" },
        ttNoFnext: { zh: '我不要外延公理了', en: "I don't need fnext anymore" },
        "Bool=Bool=Bool": { zh: 'Bool=Bool=Bool', en: "Bool=Bool=Bool" },
        isequivP: { zh: 'isProp(是双射)', en: "isProp (is bijective)" },
        infhotel: { zh: '来了无穷位客人住旅馆', en: "Infinite number of guests arrive at the hotel" },
        permMaster: { zh: '排列大师', en: "Master of permutation" },
        // 行13：路径消消乐
        ttPathElim: { zh: '路径消消乐', en: "Path Elimination" },
        ttPoint: { zh: '零维的点', en: "0D point" },
        ttSetNat: { zh: '无数个点', en: "Infinite 0D points" },
        ttdrawS1: { zh: '徒手画圆(Sus Bool=S1)', en: "Drawing a circle freehand (Sus Bool=S1)" },
        pi1S1: { zh: 'π₁(S¹)=Z', en: "π₁(S¹)=Z" },
        hopf1: { zh: 'Hopf纤维丛', en: "Hopf fibration" },
        // 行14：ZFC
        aExt: { zh: 'ZFC集合论', en: "ZFC Set Theory" },
        ".<i": { zh: '我包含我', en: "I Contain Myself" },
        empty: { zh: '千里之行，始于空集', en: "All things Begin with Empty Set" },
        ".zfc": { zh: 'ZFC简化大礼包', en: "Simplified ZFC Toolkit" },
        UUII: { zh: '交交并并', en: "Intersections and Unions" },
        w2: { zh: 'ω^ω', en: "ω^ω" },
        // 行15：序数/整数
        "d()": { zh: '确定坐标，精确制导', en: "Target coordinates!" },
        dSd0: { zh: '皮亚诺，你被解雇啦！', en: "Peano, you are fired!" },
        dX: { zh: '笛卡尔：积，故我在', en: "Descartes: Product, donc je suis" },
        dZ: { zh: '正正负负(Z)', en: "Positive & Negative (Z)" },
        dQ: { zh: '乘乘除除(Q)', en: "Multiply & Divide (Q)" },
        dR: { zh: '完完备备(R)', en: "Completed! (R)" },
        // 行16：终极
        "a@a": { zh: '我给且只给所有不自己理发的人理发', en: "Russell's Barber Paradox" },
        allZFC: { zh: '集齐所有ZFC公理', en: "Collect All ZFC Axioms" },
        delAl: { zh: '不可数', en: "Uncountable" },
        vwo: { zh: '一切皆可良序', en: "Everything Is Well-Ordered" },
        w4: { zh: 'ω^ω^ω^ω', en: "ω^ω^ω^ω" },
        critical: { zh: '临界质量（累计获50.1kg推理素）', en: "Critical Mass (Accumulated 50.1kg of Deductrium)" },
        // 补充方块成就（与上面共享格子/无格子）：terr2/elV2/elV3/x+x/exfalso2/ttisContr/tteq2027/hopf2/ttS2
        exfalso2: { zh: '否定爆炸', en: "Explosion Principle (exfalso)" },
        terr2: { zh: '割让量词的领土', en: "Quantifier Relinquishment" },
        elV2: { zh: '量词连连消消乐', en: "Quantifier Elimination Challenge" },
        elV3: { zh: '量词连连消消乐', en: "Quantifier Elimination Challenge" },
        "x+x": { zh: '代入方程即可', en: "Substitution Solves It" },
        ttisContr: { zh: '零维的点', en: "0D point" },
        tteq2027: { zh: '无数个点', en: "Infinite 0D points" },
        hopf2: { zh: 'Hopf纤维丛', en: "Hopf fibration" },
        ttS2: { zh: '吹气球(S2)', en: "Blow up a balloon (S2)" },
    };
    // 按 identifier 取成就名（当前语言）；未知 identifier 原样返回
    static achName(id: string): string {
        return LangMgr.achievements[id]?.[LangMgr.lang] ?? id;
    }
    // 解析 "[zh]... [en]..." 双语文本（类似地图文本格式），返回当前语言部分；
    // 无语言标记则原样返回
    static trBilingual(text: string): string {
        const zhMatch = text.match(/\[zh\]([\s\S]*?)(?=\[en\]|$)/);
        const enMatch = text.match(/\[en\]([\s\S]*?)(?=\[zh\]|$)/);
        if (zhMatch || enMatch) {
            return LangMgr.lang === "zh" ? (zhMatch?.[1] ?? enMatch?.[1] ?? text)
                : (enMatch?.[1] ?? zhMatch?.[1] ?? text);
        }
        return text;
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
            case "futureCondition":
                return zh
                    ? `条件命题${info.conditionId}位于当前推理位置${info.appendId}之后，不能使用`
                    : `condition proposition ${info.conditionId} is after the current deduction position ${info.appendId}`;
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
            case "uNeedCond":
                return zh ? `u:元规则（${info.ruleName}）只能用于有条件的规则，无条件规则请使用v:元规则` : `u: meta rule (${info.ruleName}) requires at least one condition, use v: meta rule for conditionless rules`;
            case "mcntNoMatch":
                return zh ? "没有找到可换名的量词" : "no quantifier found to rename";
            case "mcntBadIndex":
                return zh ? "换名规则格式错误：应为{变量,{索引,变量},.}等形式" : "bad rename rule format: expected {var,{idx,var},.} etc.";
            case "mcntAssertFail":
                return zh ? `换名失败：断言不满足（新变量可能会在量词作用域中被捕获）` : `rename failed: assertion unsatisfied (the new variable could be captured by a quantifier scope)`;
            case "nestedCVFolder":
                return zh ? "请先肢解内部的cond与var层级" : "please disassemble the inner cond and var layers first";
            case "mcptInCVFolder":
                return zh ? "请先肢解内部的mcpt步骤" : "please disassemble the inner mcpt step first";
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
            case "mcptFalse": {
                // 列出各原子命题在使整个命题为假的指派下的真值
                const assignments = info.atoms.map((a, i) =>
                    zh
                        ? `${a} = ${(info.hyp >> i) & 1 ? "真" : "假"}`
                        : `${a} = ${(info.hyp >> i) & 1 ? "true" : "false"}`
                );
                return zh
                    ? `命题逻辑验证失败：当${assignments.join("，")}时，命题不为真`
                    : `propositional verification failed: the proposition is false when ${assignments.join(", ")}`;
            }
            case "mcptTooMany":
                return zh
                    ? `命题逻辑验证原子命题过多（${info.count} > ${info.max}），无法穷举真值表`
                    : `too many atomic propositions (${info.count} > ${info.max}) for propositional verification`;
            case "msbtBadTemplate":
                return zh ? "匹配模板必须是等价互推(x↔y)或等式(x=y)" : "match template must be a biconditional (x↔y) or equation (x=y)";
            case "msbtNoMatch":
                return zh ? "没有找到可替换的匹配项" : "no match found to substitute";
            case "msbtBadIndex":
                return zh ? "无效的替换索引" : "invalid substitution index";
            case "msbtRuleWithCond":
                return zh ? "匹配模板规则不允许带条件" : "template rule cannot have conditions";
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
