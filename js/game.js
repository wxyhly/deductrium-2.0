import { initialCreativeRules, initialSurvivalRules } from "./hs/core/initial.js";
import { HSLayer } from "./hs/main.js";
import { TTLayer } from "./tt/main.js";
import { HSParser } from "./hs/core/parser.js";
import { HyLayer } from "./hy/gui.js";
import { blockMap, nameMap, TileBlockType } from "./hy/maploader.js";
import { LangMgr } from "./lang.js";
import { ProgressLayer, kbFullId } from "./pg/main.js";
import { SaveLoad } from "./saveload.js";
const gameModeURL = window.location.search.substring(1);
const gameMode = gameModeURL === "creative" ? gameModeURL : "survival";
class Game {
    gotRewards = new Set;
    destructedGates = new Set;
    gotAchievements = new Set;
    // 知识库解锁：tile.data.info 或同名 reward 解锁的 identifier 集合（创造模式全部解锁）
    unlockedInfos = new Set;
    // 经济/进度数据（仅生存模式；单位 µg）
    deductrium = 0; // 拥有推理素
    deductriumConsumed = 0; // 累计消耗推理素
    tilesParcour = 0; // 总方块步数
    langMgr = new LangMgr(SaveLoad.getSavedLang());
    hsLayer = new HSLayer;
    ttLayer = new TTLayer(gameMode === "creative");
    hyLayer = new HyLayer;
    saveload = new SaveLoad(gameMode, () => {
        // 创造模式目前只有推理层（hs）+ 类型层（tt）；几何层/奖励/成就/经济仅生存模式
        if (gameMode === "creative")
            return { hs: this.hsLayer.serialize(), tt: this.ttLayer.serialize(), ly: this.getCurrentLayer() };
        return {
            hs: this.hsLayer.serialize(),
            tt: this.ttLayer.serialize(),
            hy: this.hyLayer.serialize(),
            ly: this.getCurrentLayer(),
            rw: Array.from(this.gotRewards),
            dg: Array.from(this.destructedGates),
            ac: Array.from(this.gotAchievements),
            in: Array.from(this.unlockedInfos),
            D: this.deductrium,
            DC: this.deductriumConsumed,
            tp: this.tilesParcour,
        };
    }, (data) => {
        if (data.hs)
            this.hsLayer.deserialize(data.hs);
        if (data.tt)
            this.ttLayer.deserialize(data.tt);
        if (gameMode === "survival") {
            if (data.hy)
                this.hyLayer.deserialize(data.hy);
            this.gotRewards = new Set(data.rw);
            this.destructedGates = new Set(data.dg);
            this.gotAchievements = new Set(data.ac);
            this.unlockedInfos = new Set(data.in);
            this.deductrium = data.D ?? 0;
            this.deductriumConsumed = data.DC ?? 0;
            this.tilesParcour = data.tp ?? 0;
        }
        this.switchLayer(data.ly);
    });
    progressLayer = new ProgressLayer(this.saveload, gameMode, (id) => this.isAchievementGot(id), (id) => this.isInfoUnlocked(id));
    constructor() {
        this.initHyGUI();
        this.initLayerGUI();
        const firstLoad = !this.saveload.load();
        if (gameMode === "creative") {
            this.showLayerButton("T-layer", true);
            this.showLayerButton("D-layer", true);
            this.showLayerButton("P-layer", true);
            if (firstLoad) {
                this.hsLayer.addRules(initialCreativeRules);
                this.switchLayer("P-layer");
            }
            this.hsLayer.unlockBasicPropCmd();
            this.hsLayer.unlockBasicRuleCmd();
            this.hsLayer.unlockMetaBlock("c");
            this.hsLayer.unlockMetaBlock("v");
            this.hsLayer.unlockMetaBlock("f");
        }
        else if (gameMode === "survival") {
            this.showLayerButton("G-layer", true);
            if (firstLoad) {
                this.hsLayer.addRules(initialSurvivalRules);
                this.switchLayer("G-layer");
            }
            this.hsLayer.unlockBasicPropCmd();
            // 加载后：恢复已获得奖励的 got 标记，并执行对应的解锁效果（层按钮显示等）
            this.applyGotRewards();
        }
        // 恢复/初始化后刷新统计面板
        this.updateStats();
        // 加载完成后重绘成就区/符号面板/知识库（ProgressLayer 构造时存档尚未恢复）
        this.progressLayer.refreshAchievements();
        this.progressLayer.refreshSymbols();
        this.progressLayer.refreshKnowledge();
        // 脚本就绪，隐藏加载动画
        document.getElementById("loading")?.classList.add("hide");
        this.hsLayer.onchange = () => this.saveload.notifySave();
        this.ttLayer.onchange = () => this.saveload.notifySave();
        this.hyLayer.onchange = () => this.saveload.notifySave();
    }
    getCurrentLayer() {
        return document.querySelector('.layer-buttons button.active')?.getAttribute('data-layer') || "D-layer";
    }
    switchLayer(layer) {
        const btn = document.querySelector(`.layer-buttons button[data-layer="${layer}"]`);
        if (btn)
            btn.click();
    }
    // 显示/隐藏某个层导航按钮（false=加 hide，true=去掉 hide）
    showLayerButton(layer, show) {
        document.querySelector(`.layer-buttons button[data-layer="${layer}"]`)?.classList.toggle("hide", !show);
    }
    // ===== 解锁/奖励的处理逻辑（可扩展） =====
    // 推理素增减（旧版 addDeductriums 的经济部分；含提示与成就）
    addDeductrium(amount) {
        this.deductrium += amount;
        this.updateStats();
        // 变化提示（获得 +、消耗 -）
        this.showToast(amount >= 0
            ? LangMgr.formalize.gainDeductriumToast(stringifyDeductriumAmout(amount), stringifyDeductriumAmout(this.deductrium))
            : LangMgr.formalize.payDeductriumToast(stringifyDeductriumAmout(-amount), stringifyDeductriumAmout(this.deductrium)), amount >= 0 ? "gain" : "pay");
        this.checkEconAchievements();
    }
    // 经济类成就：首次获得/首次消耗/累计获得里程碑（旧版 addDeductriums 中逻辑）
    checkEconAchievements() {
        if (this.deductrium > 0)
            this.finishAchievement("firstEat");
        if (this.deductriumConsumed > 0)
            this.finishAchievement("firstPay");
        const totalObtained = this.deductrium + this.deductriumConsumed;
        if (totalObtained >= 40)
            this.finishAchievement("vegan40");
        if (totalObtained >= 1e3)
            this.finishAchievement("dose1mg");
        if (totalObtained >= 1e6)
            this.finishAchievement("dose1g");
        if (totalObtained >= 50.1e9)
            this.finishAchievement("critical");
    }
    // ===== 成就系统 =====
    // 完成成就（公开方法：方块成就由 tile.data.ac 自动触发；
    // 非方块成就（如累计推理素、序数等）由外部按条件调用此方法）
    finishAchievement(id) {
        if (this.gotAchievements.has(id))
            return;
        this.gotAchievements.add(id);
        this.showToast(LangMgr.formalize.achToast(LangMgr.achName(id)), "ach");
        this.progressLayer.refreshAchievements();
        this.saveload.notifySave();
    }
    // 是否已获得某成就（供 pg/main.ts 渲染查询）
    isAchievementGot(id) {
        return this.gotAchievements.has(id);
    }
    // ===== 知识库解锁 =====
    // 某知识 identifier 是否已解锁（创造模式全部解锁；生存模式看 unlockedInfos 或同名 reward）
    isInfoUnlocked(id) {
        if (gameMode === "creative")
            return true;
        const full = kbFullId(id);
        // unlockedInfos 存全 id（mec:#p）；gotRewards 存裸名（dG、hyp 等）
        if (this.unlockedInfos.has(full))
            return true;
        // 奖励名匹配：裸 id 或（去掉前缀后的）裸名
        if (this.gotRewards.has(id))
            return true;
        if (full.startsWith("sym:") || full.startsWith("mec:")) {
            if (this.gotRewards.has(full.slice(4)))
                return true;
        }
        return false;
    }
    // 解锁知识（通过带 data.info 的方块或获得同名 reward 时调用）
    unlockInfo(id) {
        if (gameMode === "creative")
            return;
        const full = kbFullId(id);
        // 仅接受知识库条目（sym:/mec: 前缀）；未知 identifier 忽略
        if (!full.startsWith("sym:") && !full.startsWith("mec:"))
            return;
        if (this.unlockedInfos.has(full))
            return;
        this.unlockedInfos.add(full);
        this.progressLayer.refreshSymbols();
        this.progressLayer.refreshKnowledge();
        this.saveload.notifySave();
    }
    // 底部居中 toast 提示（成就/推理素变化），自动消失，带进场/退场动画
    showToast(text, kind = "gain") {
        const container = document.getElementById("pg-toast-container");
        if (!container)
            return;
        const el = document.createElement("div");
        el.className = "pg-toast " + kind;
        el.textContent = text;
        container.appendChild(el);
        // 同一时刻最多保留 3 条
        while (container.children.length > 3)
            container.removeChild(container.firstChild);
        setTimeout(() => el.remove(), 3200);
    }
    // 刷新进度层统计面板
    updateStats() {
        const setText = (id, v) => {
            const el = document.getElementById(id);
            if (el)
                el.textContent = v;
        };
        setText("pg-stat-deductrium", stringifyDeductriumAmout(this.deductrium));
        setText("pg-stat-consumed", stringifyDeductriumAmout(this.deductriumConsumed));
        setText("pg-stat-parcours", String(this.tilesParcour));
    }
    // 已获得的奖励：按 gotRewards 里的 key（name 或 hash）直查砖块，置 got=true、type→road 并执行解锁效果
    applyGotRewards() {
        for (const key of this.gotRewards) {
            // key 可能是 name（经 nameMap 转 hash）或 hash 本身
            const hash = nameMap.get(key) ?? key;
            const block = blockMap.get(hash);
            if (!block)
                continue; // 地图改版后砖块可能不存在
            block.data ??= {};
            block.data.got = true;
            if (block.type === TileBlockType.Reward)
                block.type = TileBlockType.Road;
            this.applyUnlockEffect(block);
        }
    }
    // 单个砖块的解锁效果：目前是 unl:{layer:xxx} → 显示该层导航按钮（后续可扩展其它效果）
    applyUnlockEffect(block) {
        const unl = block.data?.unl;
        if (unl && unl.layer) {
            document.querySelector(`.layer-buttons button[data-layer="${unl.layer}"]`)?.classList.remove("hide");
        }
    }
    initLayerGUI() {
        const game = this;
        const hyperGui = this.hyLayer;
        document.querySelectorAll('.layer-buttons button').forEach(btn => {
            btn.addEventListener('click', function () {
                this.blur();
                document.querySelectorAll('.layer-buttons button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('div[data-layer]').forEach(p => p.classList.add('hide'));
                this.classList.add('active');
                document.querySelector(`div[data-layer="${this.dataset.layer}"]`)?.classList?.remove('hide');
                // 切到几何层时画布尺寸才可用，重新测量一次
                if (this.dataset.layer === "G-layer")
                    hyperGui.onresize();
                // 层切换持久化（当前层由 getCurrentLayer 从 DOM 读取，无需另行记录）
                game.saveload.notifySave();
            });
        });
    }
    initHyGUI() {
        // 几何层渲染回调：tile 颜色/文字按 data/type 处理（渲染逻辑集中在 game.ts）
        const defaultTileColor = ["rgb(255,255,255)", "rgb(220,220,220)", "rgb(250,160,20)", "rgb(200,255,20)", "rgb(180,255,240)"];
        const defaultTextColor = ["rgb(0,80,0)", "rgb(60,60,255)", "rgb(33,38,255)", "rgb(255,0,0)", "rgb(30,20,100)"];
        this.hyLayer.world.onTileColor = (block, highLight) => {
            if (highLight && block?.data?.getD)
                return "rgb(255,255,0)";
            return defaultTileColor[block?.type ?? 1];
        };
        this.hyLayer.world.onTextColor = block => defaultTextColor[block.type];
        this.hyLayer.world.onTileText = (block) => {
            const data = block.data ?? {};
            let text = typeof block.text === "string" ? block.text : block.text[LangMgr.lang] ?? Object.values(block.text)[0] ?? "";
            if (data.p || data.d) {
                // 门文本已由地图脚本转为 unicode，直接显示
                text += data.p ? "\n#p" : "\n#d";
            }
            if (data.del)
                text += "\n" + LangMgr.text.delGate;
            if (data.never)
                text = data.got ? LangMgr.text.neverReward : LangMgr.text.neverLocked;
            if (data.dstr)
                text = LangMgr.text.dstrPrefix + data.dstr;
            if (data.getD)
                text = LangMgr.formalize.getD(stringifyDeductriumAmout(data.getD), data.got);
            if (data.payD)
                text = LangMgr.formalize.payD(stringifyDeductriumAmout(data.payD));
            if (data.unl)
                text = (data.got ? LangMgr.text.unlockedPrefix : LangMgr.text.unlockPrefix) + text;
            return text;
        };
        // 获得奖励：记录 data.got=true；type 从 reward 改为 road（非 reward 不动）
        // 游戏中获取推理素（加载存档时直接读存档总量，不重复加钱）
        this.hyLayer.world.onGetReward = (hash, block, isLoading) => {
            block.data ??= {};
            block.data.got = true;
            this.gotRewards.add(block.name || hash);
            this.applyUnlockEffect(block);
            if (block.type === TileBlockType.Reward)
                block.type = TileBlockType.Road;
            // 成就：方块带 data.ac 则通过即完成（奖励/路/门都算）
            if (!isLoading && block.data.ac)
                this.finishAchievement(block.data.ac);
            // 知识库：方块带 data.info 解锁该 identifier；奖励名匹配也解锁
            if (!isLoading && block.data.info)
                this.unlockInfo(block.data.info);
            if (block.name)
                this.unlockInfo(block.name);
            if (!isLoading && block.data.getD !== undefined) {
                this.addDeductrium(block.data.getD);
            }
        };
        // 闸门通过判定：payD 扣费（移植旧版逻辑）+ dG 拆门技能
        this.hyLayer.world.onPassGate = (name, tile, hash) => {
            const gateTest = () => {
                const data = tile.data ?? {};
                if (data.payD !== undefined) {
                    const needed = data.payD;
                    // 余额不足不能过门
                    if (this.deductrium < needed)
                        return false;
                    // 消耗占余额比例过大：提示警告确认（旧版：不足 needed*2 时 confirm）
                    if (this.deductrium < needed * 2) {
                        if (!confirm(LangMgr.formalize.payDWarning(stringifyDeductriumAmout(needed), stringifyDeductriumAmout(this.deductrium), this.gotRewards.has("dG"))))
                            return false;
                    }
                    this.deductriumConsumed += needed;
                    this.addDeductrium(-needed);
                    return true;
                }
                // [p]门：任意sheet满足（无断言/假设 + 某步骤wrap后ast等于门文本）
                if (data.p) {
                    const ast = parseGateAst(tile, "wff");
                    return ast ? this.hsLayer.checkPropGate(ast) : false;
                }
                // [d]门：规则表中存在文本等价规则
                if (data.d) {
                    const ast = parseGateAst(tile, "rule");
                    return ast ? this.hsLayer.checkRuleGate(ast) : false;
                }
                return false;
            };
            if (!gateTest())
                return false;
            // 成就：通过门（data.ac）即完成
            if (tile.data?.ac)
                this.finishAchievement(tile.data.ac);
            // 知识库：门带 data.info 解锁
            if (tile.data?.info)
                this.unlockInfo(tile.data.info);
            // dG（拆门技能）：能通过的门拆除，变为 road（旧版 delgate 逻辑）
            if (this.gotRewards.has("dG") && tile.type !== TileBlockType.Ordinal) {
                tile.data ??= {};
                tile.data.del = true;
                tile.type = TileBlockType.Road;
                this.destructedGates.add(name || hash);
            }
            return true;
        };
        // 换格：累计方块步数 + 检查到达方块成就（旧版 parcours 逻辑）
        this.hyLayer.world.onStepToAnotherTile = (hash) => {
            this.tilesParcour++;
            this.updateStats();
            // 方块成就/知识库：踩上路/奖励/门（通过后换格）都算"通过该方块"
            const block = this.hyLayer.world.getBlock(hash);
            if (block?.data?.ac)
                this.finishAchievement(block.data.ac);
            if (block?.data?.info)
                this.unlockInfo(block.data.info);
            this.hyLayer.onchange?.(); // 保留存档通知
        };
    }
}
// 暴露游戏实例：外部代码（如非方块成就触发、调试）可通过 window.game.finishAchievement(id) 完成成就
window.game = new Game;
// ===== 门文本解析辅助 =====
// 门文本 → AST：门文本已是 unicode（地图脚本转换），直接 parse；失败返回 null
function parseGateAst(block, mode) {
    const text = (typeof block.text === "string" ? block.text : "").replaceAll("\n", "");
    if (!text.trim?.())
        return null;
    const parser = new HSParser();
    try {
        return parser.parse(text, mode);
    }
    catch {
        return null;
    }
}
function parseDeductriumAmout(str) {
    let coeff;
    if (str.endsWith("µg"))
        coeff = 1;
    else if (str.endsWith("mg"))
        coeff = 1e3;
    else if (str.endsWith("kg"))
        coeff = 1e9;
    else if (str.endsWith("g"))
        coeff = 1e6;
    else if (str.endsWith("T"))
        coeff = 1e12;
    return Number(str.replaceAll(/[a-zA-Zµ]+/g, "")) * coeff;
}
function stringifyDeductriumAmout(n) {
    const absn = Math.abs(n);
    if (absn >= 1e12) {
        return n / 1e12 + "T";
    }
    if (absn >= 1e9) {
        return n / 1e9 + "kg";
    }
    if (absn >= 1e6) {
        return n / 1e6 + "g";
    }
    if (absn >= 1e3) {
        return n / 1e3 + "mg";
    }
    return n + "µg";
}
// axiom a2: |-($1→$2→$3)→($1→$2)→($1→$3);
// axiom a3: |-(¬$1→¬$2)→($2→$1);
// axiom a4: |-∀$x:$0→#sb($0,$x,$A);
// axiom a5: |-∀$x:($0→$1)→∀$x:$0→∀$x:$1;
// axiom a6: |-$0→∀$x:$0;
// axiom a7: |-$A=$A;
// axiom a8: |-$A=$B→#sb($0,$x,$A)→#sb($0,$x,$B);
// axiom d<>1: |-($0<>$1)>~(($0>$1)>~($1>$0));
// axiom d<>2: |-~(($0>$1)>~($1>$0))>($0<>$1);
// axiom d|: |-$0\\/$1<>(~$0>$1);
// axiom d&: |-$0/\\$1<>~($0>~$1);
// axiom d\\e: |-\\e$x:$1<>~\\a$x:~$1;
// axiom apn1: |-\\ax:~s(x)=0;
// axiom apn2: |-\\ax:\\ay:(s(x)=s(y)>x=y);
// axiom apn3: |-#sb($0,$x,0)>\\a$n:(#sb($0,$x,$n)>#sb($0,$x,s($n)))>\\a$n:#sb($0,$x,$n);
// axiom aext: |-\\ax:\\ay:(\\az:(z@x<>z@y)>x=y);
// axiom apair: |-\\ax:\\ay:\\ez:(x@z/\\y@z);
// axiom d\\a@: |-\\a@$x:$0<>\\a$x:(\\e$y:$x@$y>$0);
// axiom d\\e@: |-\\e@$x:$0<>\\e$x:(\\e$y:$x@$y/\\$0);
// axiom anbgpair: |-\\a@x:\\a@y:\\e@z:(x@z/\\y@z);
//# sourceMappingURL=game.js.map