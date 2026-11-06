import { initialCreativeRules,initialSurvivalRules } from "./hs/core/initial.js";
import { HSLayer } from "./hs/main.js";
import { TTLayer } from "./tt/main.js";
import { AST } from "./hs/core/ast.js";
import { HSParser } from "./hs/core/parser.js";
import { HyLayer } from "./hy/gui.js";
import { blockMap, nameMap, TileBlock, TileBlockType } from "./hy/maploader.js";
import { LangMgr } from "./lang.js";
import { ProgressLayer, kbFullId } from "./pg/main.js";
import { SaveLoad } from "./saveload.js";
import { calcMaxReachOrd, cmp, printOrd } from "./hy/ordinal.js";
import { getMapPalette } from "./hy/palette.js";
const gameModeURL = window.location.search.substring(1);
const gameMode = gameModeURL === "creative" ? gameModeURL : "survival";
// 旧地图的 dstr 是展示文字；目标必须按稳定 ID 查找，不能解析本地化文案。
const legacyDestructionTargets: Record<string, string> = {
    "del<>": "port-iff", delK: "K", delL: "L", "del-pn": ".pn",
    delAl: "Aleph", delAlw: "AlephW", "del-W": "W", "del-ttAleph": "ttpAleph",
    mnt: "port-rp", mcvt: "V", omega: "w",
};
const ordinalRewardTargets: Record<string, number[]> = {
    "w^2": [1, 2, 2], "w^3": [1, 2, 2, 2], "ww2": [1, 2, 3, 2, 3],
    "w4234": [1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 2, 1, 2, 2, 1, 2, 2, 1, 2, 2, 1, 2, 2],
};

class Game {

    gotRewards = new Set<string>;
    destructedGates = new Set<string>;
    gotAchievements = new Set<string>;
    // 知识库解锁：tile.data.info 或同名 reward 解锁的 identifier 集合（创造模式全部解锁）
    unlockedInfos = new Set<string>;
    // 经济/进度数据（仅生存模式；单位 µg）
    deductrium = 0;          // 拥有推理素
    deductriumConsumed = 0;  // 累计消耗推理素
    tilesParcour = 0;        // 总方块步数
    maxOrd: number[] = [];
    nextOrd: number[] = [1];
    ordBase = 15;

    langMgr = new LangMgr(SaveLoad.getSavedLang());
    hsLayer = new HSLayer;
    ttLayer = new TTLayer(gameMode === "creative");
    hyLayer = new HyLayer;
    // 同页切换存档时先还原地图初始状态，再重放当前存档，避免继承上个槽位的奖励/拆门。
    private initialMapState = new Map(Array.from(blockMap, ([hash, block]) =>
        [hash, { ...block, data: { ...block.data } }] as const));
    private initialMapNames = new Map(nameMap);
    saveload = new SaveLoad(gameMode, () => {
        // 创造模式目前只有推理层（hs）+ 类型层（tt）；几何层/奖励/成就/经济仅生存模式
        if (gameMode === "creative") return { hs: this.hsLayer.serialize(), tt: this.ttLayer.serialize(), ly: this.getCurrentLayer() };
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
            mo: this.maxOrd.slice(),
            ob: this.ordBase,
        };
    }, (data) => {
        if (data.hs) this.hsLayer.deserialize(data.hs);
        if (data.tt) this.ttLayer.deserialize(data.tt);
        if (gameMode === "survival") {
            if (data.hy) this.hyLayer.deserialize(data.hy);
            else this.hyLayer.world.currentOrd = [];
            this.gotRewards = new Set(data.rw);
            this.destructedGates = new Set(data.dg);
            this.gotAchievements = new Set(data.ac);
            this.unlockedInfos = new Set(data.in);
            this.deductrium = data.D ?? 0;
            this.deductriumConsumed = data.DC ?? 0;
            this.tilesParcour = data.tp ?? 0;
            // 接线前的存档没有 mo/ob，仍可从当前位置和奖励恢复已有进度。
            this.maxOrd = [...(data.mo ?? this.hyLayer.world.currentOrd ?? [])];
            this.ordBase = data.ob ?? 15;
            this.applyGotRewards();
            this.updateStats();
            this.progressLayer.refreshAchievements();
            this.progressLayer.refreshSymbols();
            this.progressLayer.refreshKnowledge();
        }
        this.switchLayer(data.ly);
    })
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
        } else if (gameMode === "survival") {
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

    private getCurrentLayer(): string {
        return document.querySelector('.layer-buttons button.active')?.getAttribute('data-layer') || "D-layer";
    }
    private switchLayer(layer: string) {
        const btn = document.querySelector(`.layer-buttons button[data-layer="${layer}"]`) as HTMLElement | null;
        if (btn) btn.click();
    }
    // 显示/隐藏某个层导航按钮（false=加 hide，true=去掉 hide）
    private showLayerButton(layer: string, show: boolean) {
        document.querySelector(`.layer-buttons button[data-layer="${layer}"]`)?.classList.toggle("hide", !show);
    }
    // ===== 解锁/奖励的处理逻辑（可扩展） =====
    // 推理素增减（旧版 addDeductriums 的经济部分；含提示与成就）
    private addDeductrium(amount: number) {
        this.deductrium += amount;
        this.updateStats();
        // 变化提示（获得 +、消耗 -）
        this.showToast(
            amount >= 0
                ? LangMgr.formalize.gainDeductriumToast(stringifyDeductriumAmout(amount), stringifyDeductriumAmout(this.deductrium))
                : LangMgr.formalize.payDeductriumToast(stringifyDeductriumAmout(-amount), stringifyDeductriumAmout(this.deductrium)),
            amount >= 0 ? "gain" : "pay"
        );
        this.checkEconAchievements();
    }
    // 经济类成就：首次获得/首次消耗/累计获得里程碑（旧版 addDeductriums 中逻辑）
    private checkEconAchievements() {
        if (this.deductrium > 0) this.finishAchievement("firstEat");
        if (this.deductriumConsumed > 0) this.finishAchievement("firstPay");
        const totalObtained = this.deductrium + this.deductriumConsumed;
        if (totalObtained >= 40) this.finishAchievement("vegan40");
        if (totalObtained >= 1e3) this.finishAchievement("dose1mg");
        if (totalObtained >= 1e6) this.finishAchievement("dose1g");
        if (totalObtained >= 50.1e9) this.finishAchievement("critical");
    }
    // ===== 成就系统 =====
    // 完成成就（公开方法：方块成就由 tile.data.ac 自动触发；
    // 非方块成就（如累计推理素、序数等）由外部按条件调用此方法）
    finishAchievement(id: string) {
        if (this.gotAchievements.has(id)) return;
        this.gotAchievements.add(id);
        this.showToast(LangMgr.formalize.achToast(LangMgr.achName(id)), "ach");
        this.progressLayer.refreshAchievements();
        this.saveload.notifySave();
    }
    // 是否已获得某成就（供 pg/main.ts 渲染查询）
    isAchievementGot(id: string): boolean {
        return this.gotAchievements.has(id);
    }
    // ===== 知识库解锁 =====
    // 某知识 identifier 是否已解锁（创造模式全部解锁；生存模式看 unlockedInfos 或同名 reward）
    isInfoUnlocked(id: string): boolean {
        if (gameMode === "creative") return true;
        const full = kbFullId(id);
        // unlockedInfos 存全 id（mec:#p）；gotRewards 存裸名（dG、hyp 等）
        if (this.unlockedInfos.has(full)) return true;
        // 奖励名匹配：裸 id 或（去掉前缀后的）裸名
        if (this.gotRewards.has(id)) return true;
        if (full.startsWith("sym:") || full.startsWith("mec:")) {
            if (this.gotRewards.has(full.slice(4))) return true;
        }
        return false;
    }
    // 解锁知识（通过带 data.info 的方块或获得同名 reward 时调用）
    unlockInfo(id: string) {
        if (gameMode === "creative") return;
        const full = kbFullId(id);
        // 仅接受知识库条目（sym:/mec: 前缀）；未知 identifier 忽略
        if (!full.startsWith("sym:") && !full.startsWith("mec:")) return;
        if (this.unlockedInfos.has(full)) return;
        this.unlockedInfos.add(full);
        this.progressLayer.refreshSymbols();
        this.progressLayer.refreshKnowledge();
        this.saveload.notifySave();
    }
    // 底部居中 toast 提示（成就/推理素变化），自动消失，带进场/退场动画
    private showToast(text: string, kind: "ach" | "gain" | "pay" = "gain") {
        const container = document.getElementById("pg-toast-container");
        if (!container) return;
        const el = document.createElement("div");
        el.className = "pg-toast " + kind;
        el.textContent = text;
        container.appendChild(el);
        // 同一时刻最多保留 3 条
        while (container.children.length > 3) container.removeChild(container.firstChild!);
        setTimeout(() => el.remove(), 3200);
    }
    // 刷新进度层统计面板
    private updateStats() {
        const setText = (id: string, v: string) => {
            const el = document.getElementById(id);
            if (el) el.textContent = v;
        };
        setText("pg-stat-deductrium", stringifyDeductriumAmout(this.deductrium));
        setText("pg-stat-consumed", stringifyDeductriumAmout(this.deductriumConsumed));
        setText("pg-stat-parcours", String(this.tilesParcour));
        setText("pg-stat-max-ord", printOrd(this.maxOrd));
        setText("pg-stat-next-ord", printOrd(this.nextOrd));
        setText("pg-stat-ord-base", String(this.ordBase + 1));
    }
    private updateOrdinalProgress() {
        // 基底由奖励集合算出上限，重复恢复不会再次扣减。
        let base = 15;
        for (let i = 1; i <= 10; i++) if (this.gotRewards.has(`base-${i}`)) base--;
        for (const [reward, cap] of [["base5", 4], ["base4", 3], ["base3", 2], ["base2", 1]] as const) {
            if (this.gotRewards.has(reward)) base = Math.min(base, cap);
        }
        this.ordBase = Math.min(this.ordBase, base);
        for (const [reward, target] of Object.entries(ordinalRewardTargets)) {
            if (this.gotRewards.has(reward) && cmp(target, this.maxOrd) > 0) this.maxOrd = target.slice();
        }
        this.nextOrd = calcMaxReachOrd(this.maxOrd, this.ordBase, this.gotRewards.has("stepw"));
        this.updateStats();
    }
    private restoreOrdinalMap() {
        const ord = this.hyLayer.world.currentOrd ?? [];
        // 沿已存序数的前缀找已有节点，仍由 HWorld 的原生成器展开后续区域。
        for (let i = 1; i <= ord.length; i++) {
            const prefix = ord.slice(0, i);
            const hash = nameMap.get("O" + prefix.join(","));
            if (!hash) break;
            if (i === ord.length || !nameMap.has("O" + ord.slice(0, i + 1).join(","))) {
                this.hyLayer.world.onPassOrd(hash, prefix);
            }
        }
    }
    // 已获得的奖励：按 gotRewards 里的 key（name 或 hash）直查砖块，置 got=true、type→road 并执行解锁效果
    private applyGotRewards() {
        this.hsLayer.configureSurvival(this.gotRewards);
        this.hyLayer.world.navigateDraw = this.gotRewards.has("cmpss");
        this.hyLayer.world.highLightGetD = this.gotRewards.has("highlightd");
        // 清除上一槽位展开的序数砖块，同时恢复初始地图的名称/文本/奖励状态。
        blockMap.clear();
        nameMap.clear();
        for (const [hash, initial] of this.initialMapState) blockMap.set(hash, { ...initial, data: { ...initial.data } });
        for (const [name, hash] of this.initialMapNames) nameMap.set(name, hash);
        this.restoreOrdinalMap();
        for (const layer of ["D-layer", "P-layer"]) this.showLayerButton(layer, false);
        for (const key of this.gotRewards) {
            // key 可能是 name（经 nameMap 转 hash）或 hash 本身
            const hash = nameMap.get(key) ?? key;
            const block = blockMap.get(hash);
            if (!block) continue; // 地图改版后砖块可能不存在
            block.data ??= {};
            block.data.got = true;
            if (block.type === TileBlockType.Reward && !/^JJZ[OI]-[12]$/.test(block.name ?? "")) {
                block.type = TileBlockType.Road;
            }
            this.applyUnlockEffect(block);
        }
        for (const key of this.destructedGates) this.destructGate(key);
        this.updateOrdinalProgress();
        this.hyLayer.needUpdate = true;
    }
    private destructGate(key: string, block = blockMap.get(nameMap.get(key) ?? key)) {
        if (!block || (block.type !== TileBlockType.Gate && block.type !== TileBlockType.Ordinal && !block.data?.del)) return;
        block.data ??= {};
        block.data.del = true;
        block.type = TileBlockType.Road;
        this.destructedGates.add(block.name || key);
    }
    // 单个奖励的独立效果：层按钮、推理层奖励与定点拆门；不发钱、不重置救济站。
    private applyUnlockEffect(block: TileBlock) {
        if (block.name) this.hsLayer.applyReward(block.name);
        if (block.name === "cmpss") this.hyLayer.world.navigateDraw = true;
        if (block.name === "highlightd") this.hyLayer.world.highLightGetD = true;
        if (block.name && (/^base(?:-\d+|[2-5])$/.test(block.name)
            || block.name === "stepw" || Object.hasOwn(ordinalRewardTargets, block.name))) this.updateOrdinalProgress();
        const unl = block.data?.unl;
        if (unl && unl.layer) {
            document.querySelector(`.layer-buttons button[data-layer="${unl.layer}"]`)?.classList.remove("hide");
        }
        const targets = block.data?.dstrTarget ?? legacyDestructionTargets[block.name ?? ""] ?? block.data?.dstr;
        for (const target of Array.isArray(targets) ? targets : [targets]) {
            if (typeof target === "string") this.destructGate(target);
        }
    }
    private resetReliefStation(station: string) {
        for (const name of [`JJZI-${station}`, `JJZ-${station}`]) {
            const hash = nameMap.get(name);
            this.gotRewards.delete(name);
            if (hash) this.gotRewards.delete(hash);
            const block = blockMap.get(hash ?? name);
            if (!block) continue;
            block.data ??= {};
            block.data.got = false;
            block.type = TileBlockType.Reward;
        }
    }
    initLayerGUI() {
        const game = this;
        const hyperGui = this.hyLayer;
        document.querySelectorAll('.layer-buttons button').forEach(btn => {
            (btn as HTMLElement).addEventListener('click', function () {
                this.blur();
                document.querySelectorAll('.layer-buttons button').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('div[data-layer]').forEach(p => p.classList.add('hide'));
                this.classList.add('active');
                document.querySelector(`div[data-layer="${this.dataset.layer}"]`)?.classList?.remove('hide');
                // 切到几何层时画布尺寸才可用，重新测量一次
                if (this.dataset.layer === "G-layer") hyperGui.onresize();
                // 层切换持久化（当前层由 getCurrentLayer 从 DOM 读取，无需另行记录）
                game.saveload.notifySave();
            });
        });
    }
    initHyGUI() {
        // 几何层渲染回调：tile 颜色/文字按 data/type 处理（渲染逻辑集中在 game.ts）
        this.hyLayer.world.onTileColor = (block, highLight) => {
            const palette = getMapPalette();
            if (highLight && block?.data?.getD && !block.data.got && this.gotRewards.has("highlightd")) return palette.highlight;
            return palette.tiles[block?.type ?? 1];
        };
        this.hyLayer.world.onTextColor = block => getMapPalette().text[block.type];
        this.hyLayer.world.onTileText = (block: TileBlock) => {
            const data = block.data ?? {};
            let text = typeof block.text === "string" ? block.text : block.text[LangMgr.lang] ?? Object.values(block.text)[0] ?? "";
            if (data.p || data.d) {
                // 门文本已由地图脚本转为 unicode，直接显示
                text += data.p ? "\n#p" : "\n#d";
            }
            if (data.del) text += "\n" + LangMgr.text.delGate;
            if (data.never) text = data.got ? LangMgr.text.neverReward : LangMgr.text.neverLocked;
            if (data.dstr) text = LangMgr.text.dstrPrefix + data.dstr;
            if (data.getD) text = LangMgr.formalize.getD(stringifyDeductriumAmout(data.getD), data.got);
            if (data.payD && !data.requiresReward) text = LangMgr.formalize.payD(stringifyDeductriumAmout(data.payD));
            if (data.unl) text = (data.got ? LangMgr.text.unlockedPrefix : LangMgr.text.unlockPrefix) + text;
            return text;
        };
        // 获得奖励：记录 data.got=true；type 从 reward 改为 road（非 reward 不动）
        // 游戏中获取推理素（加载存档时直接读存档总量，不重复加钱）
        this.hyLayer.world.onGetReward = (hash, block, isLoading) => {
            block.data ??= {};
            const alreadyGot = this.gotRewards.has(block.name || hash);
            block.data.got = true;
            this.gotRewards.add(block.name || hash);
            this.applyUnlockEffect(block);
            if (block.type === TileBlockType.Reward) block.type = TileBlockType.Road;
            // 入口/内部说明牌每次进入都需触发；读档只恢复显示，不改变本轮标记和终点。
            const relief = block.name?.match(/^JJZ([OI])-([12])$/);
            if (relief) {
                block.type = TileBlockType.Reward;
                if (!isLoading && relief[1] === "O") this.resetReliefStation(relief[2]);
            }
            // 成就：方块带 data.ac 则通过即完成（奖励/路/门都算）
            if (!isLoading && block.data.ac) this.finishAchievement(block.data.ac);
            // 知识库：方块带 data.info 解锁该 identifier；奖励名匹配也解锁
            if (!isLoading && block.data.info) this.unlockInfo(block.data.info);
            if (!isLoading && block.name) this.unlockInfo(block.name);
            if (!isLoading && !alreadyGot && block.data.getD !== undefined) {
                this.addDeductrium(block.data.getD);
            }
        };
        // 闸门通过判定：payD 扣费（移植旧版逻辑）+ dG 拆门技能
        this.hyLayer.world.onPassGate = (name, tile, hash) => {
            const automaticExit = Object.values(typeof tile.text === "string" ? { text: tile.text } : tile.text)
                .some(text => text.endsWith("#imm"));
            const gateTest = (): boolean => {
                const data = tile.data ?? {};
                if (tile.type === TileBlockType.Ordinal) {
                    if (!/^O[1-9]\d*(?:,[1-9]\d*)*$/.test(tile.name ?? "")) return true;
                    const ord = tile.name!.slice(1).split(",").map(Number);
                    this.hyLayer.world.onPassOrd(hash, ord);
                    if (cmp(ord, this.maxOrd) > 0) {
                        if (cmp(ord, this.nextOrd) > 0) return false;
                        this.maxOrd = ord;
                        this.updateOrdinalProgress();
                        if (cmp(ord, [1, 2, 3]) >= 0) this.finishAchievement("w2");
                        if (cmp(ord, [1, 2, 3, 4, 5]) >= 0) this.finishAchievement("w4");
                    }
                    this.hyLayer.world.currentOrd = ord;
                    return true;
                }
                if (tile.name === "preord") return this.tilesParcour >= 256;
                if (tile.name === "I1I2I3") return ["I1", "I2", "I3"].every(key => this.gotRewards.has(key));
                if (automaticExit) {
                    // 复用公开存档接口中的规则名；旧版同样检查 a 开头、x 结尾的错误公理。
                    return !this.hsLayer.serialize().r.split("\n").some(line => /^(?:\([^)]*\))?a[^:]*x:/.test(line));
                }
                const relief = tile.name?.match(/^JJZP-([12])$/);
                if (relief) return this.gotRewards.has(`JJZI-${relief[1]}`)
                    || (!this.gotRewards.has("dG") && this.deductrium < 4);
                const required = data.requiresReward ?? (tile.name === "mct2mdt" ? "mct" : undefined);
                if (required && !this.gotRewards.has(required)) return false;
                if (data.payD !== undefined) {
                    const needed = data.payD;
                    // 余额不足不能过门
                    if (this.deductrium < needed) return false;
                    // 消耗占余额比例过大：提示警告确认（旧版：不足 needed*2 时 confirm）
                    if (this.deductrium < needed * 2) {
                        if (!confirm(LangMgr.formalize.payDWarning(
                            stringifyDeductriumAmout(needed),
                            stringifyDeductriumAmout(this.deductrium),
                            this.gotRewards.has("dG")
                        ))) return false;
                    }
                    this.deductriumConsumed += needed;
                    this.addDeductrium(-needed);
                    return true;
                }
                // [p]门：任意sheet满足（无断言/假设 + 某步骤wrap后ast等于门文本）
                if (data.p) {
                    const ast = parseGateAst(tile, "wff");
                    if (ast) this.hsLayer.rememberGate(ast);
                    return ast ? this.hsLayer.checkPropGate(ast) : false;
                }
                // [d]门：规则表中存在文本等价规则
                if (data.d) {
                    const ast = parseGateAst(tile, "rule");
                    if (ast) this.hsLayer.rememberGate(ast);
                    return ast ? this.hsLayer.checkRuleGate(ast) : false;
                }
                return false;
            };
            if (!gateTest()) return false;
            // 成就：通过门（data.ac）即完成
            if (tile.data?.ac) this.finishAchievement(tile.data.ac);
            // 知识库：门带 data.info 解锁
            if (tile.data?.info) this.unlockInfo(tile.data.info);
            // dG（拆门技能）：能通过的门拆除，变为 road（旧版 delgate 逻辑）
            if (this.gotRewards.has("dG") && tile.type !== TileBlockType.Ordinal && !automaticExit) {
                this.destructGate(name || hash, tile);
            }
            return true;
        };
        // 换格：累计方块步数 + 检查到达方块成就（旧版 parcours 逻辑）
        this.hyLayer.world.onStepToAnotherTile = (hash) => {
            this.tilesParcour++;
            this.updateStats();
            // 方块成就/知识库：踩上路/奖励/门（通过后换格）都算"通过该方块"
            const block = this.hyLayer.world.getBlock(hash);
            if (block?.data?.ac) this.finishAchievement(block.data.ac);
            if (block?.data?.info) this.unlockInfo(block.data.info);
            this.hyLayer.onchange?.(); // 保留存档通知
        };
    }
}
// 暴露游戏实例：外部代码（如非方块成就触发、调试）可通过 window.game.finishAchievement(id) 完成成就
(window as any).game = new Game;

// ===== 门文本解析辅助 =====
// 门文本 → AST：门文本已是 unicode（地图脚本转换），直接 parse；失败返回 null
function parseGateAst(block: TileBlock, mode: "wff" | "rule"): AST | null {
    const text = (typeof block.text === "string" ? block.text : "").replaceAll("\n", "");
    if (!text.trim?.()) return null;
    const parser = new HSParser();
    try {
        return parser.parse(text, mode);
    } catch {
        return null;
    }
}

function parseDeductriumAmout(str: string) {
    let coeff: number;
    if (str.endsWith("µg")) coeff = 1;
    else if (str.endsWith("mg")) coeff = 1e3;
    else if (str.endsWith("kg")) coeff = 1e9;
    else if (str.endsWith("g")) coeff = 1e6;
    else if (str.endsWith("T")) coeff = 1e12;
    return Number(str.replaceAll(/[a-zA-Zµ]+/g, "")) * coeff!;
}
function stringifyDeductriumAmout(n: number) {
    const absn = Math.abs(n);
    if (absn >= 1e12) {
        return n / 1e12 + "T";
    } if (absn >= 1e9) {
        return n / 1e9 + "kg";
    } if (absn >= 1e6) {
        return n / 1e6 + "g";
    } if (absn >= 1e3) {
        return n / 1e3 + "mg";
    }
    return n + "µg"
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
