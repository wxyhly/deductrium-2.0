import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { AtomSolver } from '../js/hs/core/assert.js';

const parser = new HSParser();
const sys = new HilbertSystem();
const addRules = (data) => {
    data.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//")).forEach(e => {
        const name = e.slice(0, e.indexOf(":")).trim();
        let rest = e.slice(e.indexOf(":") + 1).trim();
        let steps = "";
        if (rest.startsWith("ax:")) { rest = rest.slice(3); }
        else { steps = rest.slice(rest.indexOf(";") + 1); rest = rest.slice(0, rest.indexOf(";")); }
        const ast = parser.parse(rest, 'rule');
        const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
        ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
        const rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), assertions, ast.nodes, ast.nodes.pop());
        sys.rules.set(name, rule);
        if (steps) {
            // 自动补 hyp（与 addRules 新逻辑一致）
            const hyps = [];
            for (const n of rule.assertions) hyps.push("hyp " + AtomSolver.print(n));
            for (const n of rule.conditions) hyps.push("hyp " + n);
            sys.fromCmd(hyps.map(e => parser.parse(e, "cmd")));
            sys.fromCmd(steps.split(";").filter(e => e).map(e => parser.parse(e, "cmd")));
            rule.step = sys.props.slice(0);
            sys.clear();
        }
    });
};
addRules(`
mp:ax: $1→$2, $1 ⊢ $2;
a1:ax: ⊢$1→$2→$1;
a2:ax: ⊢($1→$2→$3)→($1→$2)→($1→$3);
a3:ax: ⊢(¬$1→¬$2)→($2→$1);
.i:⊢$→$; a1 $ $; a1 $ $→$; a2 $ $→$ $; mp 3 2; mp 4 1;
.t:$1→$2,$2→$3⊢$1→$3; cond $1;d mp 1 3;d mp 2 4;
`);

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log(`[ok] ${name}`); } else { failed++; console.log(`[FAIL] ${name}`); } };

// ===== test 1: 模拟 serializeRulelist 输出字符串格式（与 addRules 相同 + uuid 前缀） =====
// 构建一个 ruleList（含文件夹）
const ruleList = [
    { name: "mp", uuid: 1 },
    { name: "a1", uuid: 2 },
    { name: "公理组", uuid: 3, children: [
        { name: "a2", uuid: 4 },
        { name: "a3", uuid: 5 },
    ]},
    { name: ".i", uuid: 6 },
    { name: ".t", uuid: 7 },
];
// 模拟 serializeRulelist
const serializeRulelist = (list) => {
    const lines = [];
    const iter = (arr) => {
        for (const n of arr) {
            if (n.children) {
                lines.push(`(${n.uuid}){${n.name}`);
                iter(n.children);
                lines.push(`}`);
            } else {
                const d = sys.rules.get(n.name);
                let v = "";
                if (d?.error) v = n.name + ":" + d?.toString() + ";" + (d.error.cmds || "");
                else if (d?.step) v = n.name + ":" + d?.toString() + ";" + sys.genCmd(d.step).filter(e => !e.startsWith("hyp ")).join(";");
                else if (d) v = n.name + ":ax:" + d?.toString();
                lines.push(`(${n.uuid})${v}`);
            }
        }
    };
    iter(list);
    return lines.join("\n");
};
const serialized = serializeRulelist(ruleList);
console.log("=== 序列化结果 ===");
console.log(serialized);

// 验证格式：uuid前缀 + 文件夹大括号 + 步骤无hyp
ok(serialized.startsWith("(1)mp:ax:"), "规则行带 uuid 前缀 (1)mp:ax:");
ok(serialized.includes("(3){公理组"), "文件夹行带 uuid 前缀 (3){公理组");
ok(serialized.includes("}"), "文件夹结束 }");
ok(serialized.includes("(6).i:⊢$→$;a1 $ $"), ".i 步骤不含 hyp（非关键字规则名省略 d 前缀）");
ok(serialized.includes("(7).t:$1→$2,$2→$3⊢$1→$3;cond $1"), ".t 步骤不含 hyp（条件自动推导）");

// ===== test 2: 模拟 deserializeRulelist（addRules 解析字符串，含 uuid 恢复） =====
const sys2 = new HilbertSystem();
const ruleList2 = [];
// 复制 addRules 逻辑（含 uuid 解析 + 文件夹 + 自动补 hyp）
const addRules2 = (data, list) => {
    const stack = [list];
    for (const raw of data.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//"))) {
        const trimmed = raw.trim();
        let uuid = 0;
        let content = trimmed;
        const um = trimmed.match(/^\((\d+)\)(.*)$/);
        if (um) { uuid = parseInt(um[1], 10); content = um[2].trim(); }
        if (content.startsWith("{")) {
            const folder = { name: content.replace(/^\{/, "").trim(), uuid, children: [] };
            stack[stack.length - 1].push(folder);
            stack.push(folder.children);
            continue;
        }
        if (content.startsWith("}")) {
            if (stack.length > 1) stack.pop();
            continue;
        }
        const name = content.slice(0, content.indexOf(":")).trim();
        let rest = content.slice(content.indexOf(":") + 1).trim();
        let ax = false;
        let steps = "";
        if (rest.startsWith("ax:")) { ax = true; rest = rest.slice(3); }
        else { steps = rest.slice(rest.indexOf(";") + 1); rest = rest.slice(0, rest.indexOf(";")); }
        const ast = parser.parse(rest, 'rule');
        const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
        ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
        const rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), assertions, ast.nodes, ast.nodes.pop());
        sys2.rules.set(name, rule);
        stack[stack.length - 1].push({ name, uuid });
        if (!ax) {
            const hyps = [];
            for (const n of rule.assertions) hyps.push("hyp " + AtomSolver.print(n));
            for (const n of rule.conditions) hyps.push("hyp " + n);
            sys2.fromCmd(hyps.map(e => parser.parse(e, "cmd")));
            sys2.fromCmd(steps.split(";").filter(e => e).map(e => parser.parse(e, "cmd")));
            rule.step = sys2.props.slice(0);
            sys2.clear();
        }
    }
};
addRules2(serialized, ruleList2);
console.log("=== 反序列化结果 ===");
const dumpList = (arr, indent = "") => { for (const n of arr) { if (n.children) { console.log(`${indent}[folder] ${n.name} uuid=${n.uuid}`); dumpList(n.children, indent + "  "); } else console.log(`${indent}${n.name} uuid=${n.uuid}`); } };
dumpList(ruleList2);

// 验证 uuid 恢复
ok(ruleList2[0].uuid === 1, "mp uuid 恢复为 1");
ok(ruleList2[1].uuid === 2, "a1 uuid 恢复为 2");
const folder = ruleList2[2];
ok(folder.children?.length === 2, "公理组文件夹有2个children");
ok(folder.uuid === 3, "公理组 uuid 恢复为 3");
ok(folder.children[0].uuid === 4 && folder.children[1].uuid === 5, "a2/a3 uuid 恢复");
ok(ruleList2[3].uuid === 6 && ruleList2[4].uuid === 7, ".i/.t uuid 恢复");

// 验证规则 step 重建
const tRule = sys2.rules.get('.t');
ok(tRule.step?.length > 0, ".t 步骤重建成功");
console.log(".t 步骤:", tRule.step.map(p => p.from.type + ":" + p.ast.toString() + (p.children ? "(children:" + p.children.length + ")" : "")).join(" | "));
// .t 的 step 最后是 cond 文件夹，内部两个 mp 步骤得到 $3
const tCond = tRule.step[tRule.step.length - 1];
ok(tCond.from.type === "c", ".t step 最后是 cond 文件夹");
ok(tCond.children?.length === 2, ".t cond 内有2个mp步骤");
ok(tCond.children[tCond.children.length - 1].ast.toString() === "$3", ".t cond 内最后是 $3（自动补hyp后重放正确）");

console.log(`===== ${passed} passed, ${failed} failed =====`);
if (failed > 0) process.exit(1);
