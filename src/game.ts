import { initialRules } from "./hs/core/initial.js";
import { HSLayer } from "./hs/main.js";
import { AST } from "./hs/core/ast.js";
import { HSParser } from "./hs/core/parser.js";
import { HyLayer } from "./hy/gui.js";
import { blockMap, nameMap, TileBlock, TileBlockType } from "./hy/maploader.js";
import { LangMgr } from "./lang.js";
import { ProgressLayer } from "./pg/main.js";
import { SaveLoad } from "./saveload.js";
const gameModeURL = window.location.search.substring(1);
const gameMode = gameModeURL === "creative" ? gameModeURL : "survival";

class Game {

    gotRewards = new Set<string>;
    destructedGates = new Set<string>;
    gotAchievements = new Set<string>;
    // 经济/进度数据（仅生存模式；单位 µg）
    deductrium = 0;          // 拥有推理素
    deductriumConsumed = 0;  // 累计消耗推理素
    tilesParcour = 0;        // 总方块步数

    langMgr = new LangMgr(SaveLoad.getSavedLang());
    hsLayer = new HSLayer;
    hyLayer = new HyLayer;
    saveload = new SaveLoad(gameMode, () => {
        // 创造模式目前只有推理层（hs）；几何层/奖励/成就/经济仅生存模式
        if (gameMode === "creative") return { hs: this.hsLayer.serialize(), ly: this.getCurrentLayer() };
        return {
            hs: this.hsLayer.serialize(),
            hy: this.hyLayer.serialize(),
            ly: this.getCurrentLayer(),
            rw: Array.from(this.gotRewards),
            dg: Array.from(this.destructedGates),
            ac: Array.from(this.gotAchievements),
            D: this.deductrium,
            DC: this.deductriumConsumed,
            tp: this.tilesParcour,
        };
    }, (data) => {
        if (data.hs) this.hsLayer.deserialize(data.hs);
        if (gameMode === "survival") {
            if (data.hy) this.hyLayer.deserialize(data.hy);
            this.gotRewards = new Set(data.rw);
            this.destructedGates = new Set(data.dg);
            this.gotAchievements = new Set(data.ac);
            // 直接恢复总量（加载时不再对 getD 奖励重复加钱）
            this.deductrium = data.D ?? 0;
            this.deductriumConsumed = data.DC ?? 0;
            this.tilesParcour = data.tp ?? 0;
        }
        this.switchLayer(data.ly);
    })
    progressLayer = new ProgressLayer(this.saveload, gameMode);
    constructor() {
        this.initHyGUI();
        this.initLayerGUI();
        const firstLoad = !this.saveload.load();
        if (gameMode === "creative") {
            this.showLayerButton("D-layer", true);
            this.showLayerButton("P-layer", true);
            if (firstLoad) {
                this.hsLayer.addRules(initialRules);
                this.switchLayer("P-layer");
            }
            this.hsLayer.unlockBasicPropCmd();
            this.hsLayer.unlockBasicRuleCmd();
            this.hsLayer.unlockMetaBlock("c");
            this.hsLayer.unlockMetaBlock("v");
            this.hsLayer.unlockMetaBlock("f");
        } else if (gameMode === "survival") {
            this.showLayerButton("G-layer", true);
            if (firstLoad) this.switchLayer("G-layer");
            this.hsLayer.unlockBasicPropCmd();
            // 加载后：恢复已获得奖励的 got 标记，并执行对应的解锁效果（层按钮显示等）
            this.applyGotRewards();
        }
        // 恢复/初始化后刷新统计面板
        this.updateStats();
        // 脚本就绪，隐藏加载动画
        document.getElementById("loading")?.classList.add("hide");

        this.hsLayer.onchange = () => this.saveload.notifySave();
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
    // 推理素增减（旧版 addDeductriums 的经济部分；成就/提示暂不接入）
    private addDeductrium(amount: number) {
        this.deductrium += amount;
        this.updateStats();
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
    }
    // 已获得的奖励：按 gotRewards 里的 key（name 或 hash）直查砖块，置 got=true 并执行解锁效果
    private applyGotRewards() {
        for (const key of this.gotRewards) {
            // key 可能是 name（经 nameMap 转 hash）或 hash 本身
            const hash = nameMap.get(key) ?? key;
            const block = blockMap.get(hash);
            if (!block) continue; // 地图改版后砖块可能不存在
            block.data ??= {};
            block.data.got = true;
            this.applyUnlockEffect(block);
        }
    }
    // 单个砖块的解锁效果：目前是 unl:{layer:xxx} → 显示该层导航按钮（后续可扩展其它效果）
    private applyUnlockEffect(block: TileBlock) {
        const unl = block.data?.unl;
        if (unl && unl.layer) {
            document.querySelector(`.layer-buttons button[data-layer="${unl.layer}"]`)?.classList.remove("hide");
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
        const defaultTileColor = ["rgb(255,255,255)", "rgb(220,220,220)", "rgb(250,160,20)", "rgb(200,255,20)", "rgb(180,255,240)"];
        const defaultTextColor = ["rgb(0,80,0)", "rgb(60,60,255)", "rgb(33,38,255)", "rgb(255,0,0)", "rgb(30,20,100)"];
        this.hyLayer.world.onTileColor = (block, highLight) => {
            if (highLight && block?.data?.getD) return "rgb(255,255,0)";
            return defaultTileColor[block?.type ?? 1];
        };
        this.hyLayer.world.onTextColor = block => defaultTextColor[block.type];
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
            if (data.payD) text = LangMgr.formalize.payD(stringifyDeductriumAmout(data.payD));
            if (data.unl) text = (data.got ? LangMgr.text.unlockedPrefix : LangMgr.text.unlockPrefix) + text;
            return text;
        };
        // 获得奖励：记录 data.got=true；type 从 reward 改为 road（非 reward 不动）
        // 游戏中获取推理素（加载存档时直接读存档总量，不重复加钱）
        this.hyLayer.world.onGetReward = (hash, block, isLoading) => {
            block.data ??= {};
            block.data.got = true;
            this.gotRewards.add(block.name || hash);
            this.applyUnlockEffect(block);
            if (block.type === TileBlockType.Reward) block.type = TileBlockType.Road;
            if (!isLoading && block.data.getD !== undefined) {
                this.addDeductrium(block.data.getD);
            }
        };
        // 闸门通过判定：payD 扣费（移植旧版逻辑）+ dG 拆门技能
        this.hyLayer.world.onPassGate = (name, tile, hash) => {
            const gateTest = (): boolean => {
                const data = tile.data ?? {};
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
                    return ast ? this.hsLayer.checkPropGate(ast) : false;
                }
                // [d]门：规则表中存在文本等价规则
                if (data.d) {
                    const ast = parseGateAst(tile, "rule");
                    return ast ? this.hsLayer.checkRuleGate(ast) : false;
                }
                return false;
            };
            if (!gateTest()) return false;
            // dG（拆门技能）：能通过的门拆除，变为 road（旧版 delgate 逻辑）
            if (this.gotRewards.has("dG") && tile.type !== TileBlockType.Ordinal) {
                tile.data ??= {};
                tile.data.del = true;
                tile.type = TileBlockType.Road;
                this.destructedGates.add(name || hash);
            }
            return true;
        };
        // 换格：累计方块步数（旧版 parcours 逻辑）
        this.hyLayer.world.onStepToAnotherTile = () => {
            this.tilesParcour++;
            this.updateStats();
            this.hyLayer.onchange?.(); // 保留存档通知
        };
    }
}
new Game;

// ===== 门文本解析辅助 =====
// 门文本 → AST：门文本已是 unicode（地图脚本转换），直接 parse；失败返回 null
function parseGateAst(block: TileBlock, mode: "wff" | "rule"): AST | null {
    const text = typeof block.text === "string" ? block.text : "";
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