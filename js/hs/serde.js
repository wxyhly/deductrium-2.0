import { HSParser } from "./core/parser.js";
export class Serde {
    hsLayer;
    hs;
    ruleList;
    pv;
    rv;
    builtinInstances = new Map();
    builtinsCaptured = false;
    constructor(hsLayer, hs, ruleList, pv, rv) {
        this.hsLayer = hsLayer;
        this.hs = hs;
        this.ruleList = ruleList;
        this.pv = pv;
        this.rv = rv;
    }
    captureBuiltins() {
        this.builtinInstances = new Map(this.hs.rules);
        this.builtinsCaptured = true;
    }
    serialize() {
        return {
            r: this.serializeRulelist(),
            re: Array.from(this.rv.expandedFolders),
            ri: this.rv.idCounter,
            s: this.serializeSheets(),
            rsr: Array.from(this.hs.renamedSysRule.entries()),
            ...(this.builtinsCaptured ? {
                rbi: [...this.builtinInstances]
                    .filter(([, instance]) => this.hs.rules.get(instance.name.name) === instance)
                    .map(([original, instance]) => [original, instance.name.name]),
            } : {}),
        };
    }
    deserialize(data, builtinRules) {
        this.hs.renamedSysRule = new Map(data.rsr ?? []);
        if (builtinRules !== undefined) {
            // New builtin nodes must not reuse UUIDs from the loaded save.
            this.rv.idCounter = data.ri || 1;
            for (const m of data.r.matchAll(/^\((\d+)\)/gm)) {
                this.rv.idCounter = Math.max(this.rv.idCounter, Number(m[1]) + 1);
            }
        }
        this.deserializeRulelist(data.r, builtinRules, data.rbi);
        this.deserializeSheets(data.s);
        this.rv.idCounter = builtinRules === undefined ? data.ri || 1 : Math.max(this.rv.idCounter, data.ri || 1);
        if (data.re)
            this.rv.expandedFolders = new Set(data.re);
        this.hsLayer.refresh();
    }
    // ===== 推理表sheet序列化（各sheet独立props，rules共用不入存档） =====
    // 只存name与pe（展开的文件夹逻辑id）；sheet身份由数组顺序(index)决定
    serializeSheets() {
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
    deserializeSheets(s) {
        const gui = this.hsLayer.getSheetGui();
        gui.sheets.length = 0;
        const saved = this.hs.saveContext();
        for (const d of s.sheets) {
            this.hs.loadContext(this.hs.createEmptyContext());
            try {
                this.hs.fromCmd((d.cmds || "").split(";").filter(e => e.trim()).map(e => new HSParser().parse(e, "cmd")));
            }
            catch (e) {
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
    serializeRulelist() {
        // 输出与 addRules 相同的字符串格式，每行前加 (uuid) 前缀（括号不会出现在规则名中，无歧义）
        const lines = [];
        const iter = (list) => {
            for (const n of list) {
                if (n.children) {
                    // 文件夹
                    lines.push(`(${n.uuid}){${n.name}`);
                    iter(n.children);
                    lines.push(`}`);
                }
                else {
                    const d = this.hs.rules.get(n.name);
                    let v = "";
                    if (d?.error) {
                        // 错误规则：保留原始cmd（不存为ax，否则下次加载丢失错误信息）
                        v = n.name + ":" + d?.toString() + ";" + (d.error.cmds || "");
                    }
                    else if (d?.step) {
                        // 步骤无需写hyp：genCmd过滤hyp，加载时addRules自动补
                        v = n.name + ":" + d?.toString() + ";" + this.hs.genCmd(d.step).filter(e => !e.startsWith("hyp ")).join(";");
                    }
                    else if (d) {
                        // a/d 开头的公理：只存名称占位（内容以 init 为准，减小存档体积、便于作者更新规则）
                        if (/^[ad]/.test(n.name) && !d.step?.length)
                            v = n.name + ":ax:.";
                        else
                            v = n.name + ":ax:" + d?.toString();
                    }
                    lines.push(`(${n.uuid})${v}`);
                }
            }
        };
        iter(this.ruleList);
        return lines.join("\n");
    }
    deserializeRulelist(data, builtinRules, rbi) {
        // 与addRules相同格式：逐行解析 (uuid)前缀 + 文件夹大括号 + 规则；uuid写入ListNode
        // 直接复用hsLayer.addRules（它已支持(uuid)前缀、文件夹嵌套、自动补hyp）
        this.ruleList.length = 0;
        this.hs.rules.clear();
        this.builtinInstances.clear();
        this.builtinsCaptured = false;
        if (builtinRules === undefined) {
            this.hsLayer.addRules(data);
            return;
        }
        // Load current builtins first so even early user macros can depend on
        // updated rules. Never replay builtin bodies from an older save.
        const aliases = this.hs.renamedSysRule;
        this.hs.renamedSysRule = new Map();
        this.hsLayer.addRules(builtinRules, { refresh: false });
        this.captureBuiltins();
        const recorded = rbi === undefined ? undefined : new Map(rbi);
        const savedHeaders = new Map();
        for (const raw of data.split("\n")) {
            const line = raw.trim().replace(/^\(\d+\)\s*/, "");
            if (!line || /^[{}]/.test(line) || line.startsWith("//"))
                continue;
            const colon = line.indexOf(":");
            if (colon < 0)
                continue;
            const rest = line.slice(colon + 1).trim();
            savedHeaders.set(line.slice(0, colon).trim(), rest.startsWith("ax:") ? rest.slice(3).trim() : rest.split(";", 1)[0].trim());
        }
        const occupied = new Set([...savedHeaders.keys(), ...this.hs.rules.keys(),
            ...aliases.values(), ...(recorded?.values() ?? [])]);
        for (const [original, builtin] of this.builtinInstances) {
            let name = recorded?.get(original) ?? aliases.get(original) ?? original;
            const header = savedHeaders.get(name);
            // rbi is authoritative, including []: an unrecorded saved name is
            // a user rule even when its schema matches a deleted builtin.
            // Legacy saves fall back to schema comparison for aliases only;
            // a genuine builtin schema upgrade remains ambiguous there.
            const userRule = header !== undefined && (recorded !== undefined
                ? !recorded.has(original)
                : name !== original && !sameRuleSchema(header, builtin.toString()));
            if (userRule) {
                if (savedHeaders.has(original)) {
                    const base = name === original ? "qBuiltin" : name;
                    let suffix = 1;
                    while (occupied.has(base + suffix))
                        suffix++;
                    name = base + suffix;
                    occupied.add(name);
                }
                else {
                    name = original;
                }
            }
            if (name === original)
                aliases.delete(original);
            else {
                this.hs.renameD(original, name);
                aliases.set(original, name);
            }
        }
        this.hs.renamedSysRule = aliases;
        const builtins = new Set(this.hs.rules.keys());
        const defaults = this.ruleList.splice(0);
        const renameNodes = (nodes) => nodes.forEach(n => {
            if (n.children)
                renameNodes(n.children);
            else
                n.name = aliases.get(n.name) ?? n.name;
        });
        renameNodes(defaults);
        this.hsLayer.addRules(data, { keepRules: builtins, refresh: false });
        mergeBuiltinFolders(this.ruleList, defaults, builtinRules);
        const assignIds = (nodes) => nodes.forEach(n => {
            if (!n.uuid)
                n.uuid = this.rv.idCounter++;
            if (n.children)
                assignIds(n.children);
        });
        assignIds(this.ruleList);
    }
}
function sameRuleSchema(saved, current) {
    const normalize = (header) => {
        const ast = new HSParser().parse(header, "rule");
        if (!ast || ast.end !== header.length)
            return undefined;
        const variables = new Map();
        const visit = (node) => {
            if (node.isReplvar()) {
                if (!variables.has(node.name))
                    variables.set(node.name, "$" + variables.size);
                node.name = variables.get(node.name);
            }
            node.nodes.forEach(visit);
        };
        visit(ast);
        return ast;
    };
    try {
        const a = normalize(saved), b = normalize(current);
        return !!a && !!b && a.equal(b);
    }
    catch {
        return false;
    }
}
// Merge missing defaults into the saved tree rather than replacing folders:
// users may have added macros, moved rules, or renamed the builtin folders.
function mergeBuiltinFolders(saved, defaults, source) {
    const names = (nodes) => nodes.flatMap(n => n.children ? names(n.children) : [n.name]);
    const present = new Set(names(saved));
    const translations = source.split("\n").filter(l => l.trim().startsWith("{")).map(l => Array.from(l.matchAll(/\[[a-zA-Z]+\]([^\[]*)/g), m => m[1].trim()));
    const sameName = (a, b) => a === b || translations.some(t => t.includes(a) && t.includes(b));
    const merge = (target, templates) => {
        for (const node of templates) {
            if (!node.children) {
                if (!present.has(node.name)) {
                    target.push(node);
                    present.add(node.name);
                }
                continue;
            }
            const expected = new Set(names(node.children));
            const folders = target.filter(n => n.children);
            let folder = folders.find(n => sameName(n.name, node.name));
            if (!folder) {
                // Rule membership also identifies user-renamed builtin folders.
                let best = 0;
                for (const candidate of folders) {
                    const overlap = names(candidate.children).filter(n => expected.has(n)).length;
                    if (overlap > best) {
                        folder = candidate;
                        best = overlap;
                    }
                }
            }
            if (!folder) {
                if (![...expected].some(n => !present.has(n)))
                    continue;
                folder = { ...node, children: [] };
                target.push(folder);
            }
            merge(folder.children, node.children);
        }
    };
    merge(saved, defaults);
}
//# sourceMappingURL=serde.js.map