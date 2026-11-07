import { ListNode, TreeListViewer } from "../listmgr.js";
import { HilbertSystem } from "./core/core.js";
import { Proposition } from "./core/deduction.js";
import { HSParser } from "./core/parser.js";
import { HSLayer } from "./main.js";
import { initialCreativeRules, initialSurvivalRules } from "./core/initial.js";
const staticAxioms = new Map([...initialCreativeRules.split("\n"), ...initialSurvivalRules.split("\n")]
    .map(line => line.trim()).filter(line => /^[^:]+:ax:/.test(line)).map(line => {
        const split = line.indexOf(":ax:");
        return [line.slice(0, split), new HSParser().parse(line.slice(split + 4), "rule")];
    }));
export class Serde {
    hsLayer: HSLayer;
    hs: HilbertSystem;
    ruleList: ListNode[];
    pv: TreeListViewer<Proposition>; rv: TreeListViewer<ListNode>;
    constructor(hsLayer: HSLayer, hs: HilbertSystem, ruleList: ListNode[], pv: TreeListViewer<Proposition>, rv: TreeListViewer<ListNode>) {
        this.hsLayer = hsLayer;
        this.hs = hs;
        this.ruleList = ruleList;
        this.pv = pv;
        this.rv = rv;
    }
    serialize() {
        return {
            r: this.serializeRulelist(),
            re: Array.from(this.rv.expandedFolders),
            ri: this.rv.idCounter,
            s: this.serializeSheets(),
            rsr: Array.from(this.hs.renamedSysRule.entries()),
            mapRules: this.hsLayer.getMapScriptRuleNames?.() ?? [],
        };
    }
    deserialize(data: any) {
        this.hs.renamedSysRule = new Map(data.rsr ?? []);
        this.deserializeRulelist(data.r);
        this.hsLayer.captureMapScriptRules?.(data.mapRules ?? []);
        this.deserializeSheets(data.s);
        this.rv.idCounter = data.ri || 1;
        if (data.re) this.rv.expandedFolders = new Set(data.re);
        this.hsLayer.refresh();
    }

    // ===== 推理表sheet序列化（各sheet独立props，rules共用不入存档） =====
    // 只存name与pe（展开的文件夹逻辑id）；sheet身份由数组顺序(index)决定
    private serializeSheets() {
        const gui = this.hsLayer.getSheetGui();
        gui.saveCurrentSheet(); // 写回ctx并捕获当前展开状态
        return {
            sheets: gui.sheets.map(s => ({
                name: s.name,
                pe: s.pe,
                cmds: this.hs.genCmd(s.ctx.props).join(";"),
            })),
            activeIndex: gui.activeIndex,
        };
    }
    private deserializeSheets(s: { sheets: { name: string; pe?: number[]; cmds: string }[]; activeIndex: number }) {
        const gui = this.hsLayer.getSheetGui();
        gui.sheets.length = 0;
        const saved = this.hs.saveContext();
        for (const d of s.sheets) {
            this.hs.loadContext(this.hs.createEmptyContext());
            try {
                this.hs.fromCmd((d.cmds || "").split(";").filter(e => e.trim()).map(e => new HSParser().parse(e, "cmd")));
            } catch (e) {
                // 单个sheet解析失败则留空，不阻断整个加载
                this.hs.clear();
            }
            gui.sheets.push({ name: d.name, pe: d.pe ?? [], ctx: this.hs.saveContext() });
        }
        this.hs.loadContext(saved);
        gui.activeIndex = Math.min(s.activeIndex ?? 0, gui.sheets.length - 1);
        this.hs.loadContext(gui.sheets[gui.activeIndex].ctx);
        gui.restoreExpanded(gui.sheets[gui.activeIndex].pe);
        gui.render();
        this.pv.setData(this.hs.props);
    }
    serializeRulelist(): string {
        // 输出与 addRules 相同的字符串格式，每行前加 (uuid) 前缀（括号不会出现在规则名中，无歧义）
        const lines: string[] = [];
        const iter = (list: ListNode[]) => {
            for (const n of list) {
                if (n.children) {
                    // 文件夹
                    lines.push(`(${n.uuid}){${n.name}`);
                    iter(n.children);
                    lines.push(`}`);
                } else {
                    const d = this.hs.rules.get(n.name);
                    let v = "";
                    if (d?.error) {
                        // 错误规则：保留原始cmd（不存为ax，否则下次加载丢失错误信息）
                        v = n.name + ":" + d?.toString() + ";" + (d.error.cmds || "");
                    } else if (d?.step) {
                        // 步骤无需写hyp：genCmd过滤hyp，加载时addRules自动补
                        v = n.name + ":" + d?.toString() + ";" + this.hs.genCmd(d.step).filter(e => !e.startsWith("hyp ")).join(";");
                    } else if (d) {
                        // a/d 开头的公理：只存名称占位（内容以 init 为准，减小存档体积、便于作者更新规则）
                        if (!(this.hsLayer.getMapScriptRuleNames?.() ?? []).includes(n.name)
                            && staticAxioms.get(n.name)?.equal(new HSParser().parse(d.toString(), "rule"))) v = n.name + ":ax:.";
                        else v = n.name + ":ax:" + d?.toString();
                    }
                    lines.push(`(${n.uuid})${v}`);
                }
            }
        };
        iter(this.ruleList);
        return lines.join("\n");
    }
    deserializeRulelist(data: string) {
        // 与addRules相同格式：逐行解析 (uuid)前缀 + 文件夹大括号 + 规则；uuid写入ListNode
        // 直接复用hsLayer.addRules（它已支持(uuid)前缀、文件夹嵌套、自动补hyp）
        this.ruleList.length = 0;
        this.hs.rules.clear();
        this.hsLayer.addRules(data);
    }
}
