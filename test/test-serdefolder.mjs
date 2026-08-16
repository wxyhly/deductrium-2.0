import { HSParser } from '../js/hs/core/parser.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { AtomSolver } from '../js/hs/core/assert.js';

// 模拟 serde 的 serializeRulelist / deserializeRulelist（不依赖 DOM 的 HSLayer）
const rulesMap = new Map();
const parser = new HSParser();

// 构造规则列表：根 [mp(ax), folder1[.t(宏), a1(ax)], a2(ax)]
const ruleList = [
    { name: "mp", uuid: 1 },
    { name: "folder1", uuid: 2, children: [
        { name: ".t", uuid: 3 },
        { name: "a1", uuid: 4 },
    ]},
    { name: "a2", uuid: 5 },
];

// 注册规则（简化：.t 有 step，其它 ax）
const mkRule = (name, ax) => {
    let rule;
    if (name === ".t") {
        const ast = parser.parse("$1→$2,$2→$3⊢$1→$3", 'rule');
        const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
        ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
        rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), assertions, ast.nodes, ast.nodes.pop());
        // 假 step
        rule.step = [];
    } else {
        const ast = parser.parse(ax ? "⊢$1→$2→$1" : "$1→$2,$1⊢$2", 'rule');
        const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
        ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
        rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), assertions, ast.nodes, ast.nodes.pop());
    }
    rulesMap.set(name, rule);
};
mkRule("mp", false);
mkRule("a1", true);
mkRule("a2", true);
mkRule(".t", false);

// serialize（模拟）
const serializeRulelist = (list) => {
    const iter = (list) => {
        const data = [];
        for (const n of list) {
            if (n.children) {
                data.push({ n: n.name, u: n.uuid, c: iter(n.children) });
            } else {
                const d = rulesMap.get(n.name);
                let v = "";
                if (d?.step) v = d.toString() + ";cond X;d mp 1 2";
                else if (d) v = "ax:" + d.toString();
                data.push({ n: n.name, u: n.uuid, v });
            }
        }
        return data;
    };
    return iter(list);
};

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("[ok] " + msg); } else { fail++; console.log("[NO] " + msg); } };

// 序列化
const serialized = serializeRulelist(ruleList);
console.log("serialized:", JSON.stringify(serialized));

// 反序列化（复刻修好的 deserializeRulelist 结构）
const newRuleList = [];
const deserializeRulelist = (data) => {
    const iter = (data, container) => {
        for (const d of data) {
            const c = d.c;
            const it = { name: d.n, uuid: d.u };
            if (c) { it.children = []; iter(c, it.children); }
            container.push(it);
        }
    };
    iter(data, newRuleList);
    // iter2：只设 step，递归自身
    const iter2 = (data) => {
        for (const d of data) {
            const c = d.c;
            if (c) iter2(c);
        }
    };
    iter2(data);
};
deserializeRulelist(serialized);

console.log("deserialized:", JSON.stringify(newRuleList));
ok(newRuleList.length === 3, "顶层3个节点（不重复）");
ok(newRuleList[1].children?.length === 2, "folder1 内有2个子项");
ok(!newRuleList.some(n => n.name === ".t"), "顶层没有 .t 重复项");
ok(!newRuleList.some(n => n.name === "a1"), "顶层没有 a1 重复项");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
