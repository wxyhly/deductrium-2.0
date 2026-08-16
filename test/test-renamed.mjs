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
.t:$1→$2,$2→$3⊢$1→$3; hyp $1→$2;hyp $2→$3;cond $1;d mp 1 3;d mp 2 4;
`);

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log(`[ok] ${name}`); } else { failed++; console.log(`[FAIL] ${name}`); } };

// ===== test 1: 重命名 .i -> xid，renamedSysRule 记录 =====
sys.renameD(".i", "xid");
ok(sys.rules.has("xid") && !sys.rules.has(".i"), "规则 .i 已改名 xid");
ok(sys.renamedSysRule.get(".i") === "xid", "renamedSysRule 记录 .i -> xid");
ok(sys.getSysRuleName(".i") === "xid", "getSysRuleName(.i) = xid");
ok(sys.getSysRuleName("mp") === "mp", "getSysRuleName(mp) = mp（未重命名）");

// ===== test 2: 依赖 .i 的其它规则 step 中引用被更新 =====
// 此时 .i 已不存在（改名 xid），新规则不能再引用 .i
let threw2 = false;
try {
    addRules(`
.ni:⊢$→¬¬$; d .i $;
`);
} catch (e) { threw2 = true; }
ok(threw2, "重命名后新规则不能再引用 .i（dname404 抛错）");
// 规则头 .ni 会先注册成功，但步骤重放失败无 step：验证规则存在但无有效step
const niRule = sys.rules.get(".ni");
ok(!!niRule && !niRule.step?.length, "重命名后 .ni 引用 .i 无法重放步骤（规则无step）");

// ===== test 3: 组合引用更新（构造引用 c:xid 的规则，验证改名后引用同步更新） =====
const mkRule = (name, ruleStr) => {
    const ast = parser.parse(ruleStr, 'rule');
    const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
    ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
    const rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), assertions, ast.nodes, ast.nodes.pop());
    sys.rules.set(name, rule);
    return rule;
};
// 手动构造 step：一个 d 步骤，其规则名是 c:xid（NODE_DNAME 嵌套引用 xid）
mkRule(".y", "⊢$1→$1");
const yRule = sys.rules.get(".y");
const stepDname = new AST(NodeType.NODE_DNAME, "c", new AST(NodeType.ATOM_DNAME, "xid"));
// 用 Prop 构造一个假的 d 步骤（条件/替换值用假对象即可，renameD 只检查 rule 名 AST）
const fakeCond = { ast: new AST(NodeType.ATOM_WFF, "$1"), from: { type: "h" }, id: 1, children: undefined, parent: null, name: "" };
yRule.step = [{
    ast: new AST(NodeType.ATOM_WFF, "$1→$1"),
    from: { type: "d", data: { deduction: stepDname, conditions: [fakeCond], replaceValues: {} } },
    id: 1, children: undefined, parent: null, name: "",
}];
const dnameStr = yRule.step[0].from.data.deduction.toString();
ok(dnameStr.includes("cxid"), `规则 .y 步骤引用 c:xid（实际 ${dnameStr}）`);

// 再次改名 xid -> yid，验证 .y 的 step 引用同步更新
sys.renameD("xid", "yid");
ok(sys.rules.has(".y"), ".y 仍存在");
const yRule2 = sys.rules.get(".y");
const yStepD2 = yRule2.step[0].from.data.deduction.toString();
ok(yStepD2.includes("cyid"), `重命名后 .y 步骤引用更新为 c:yid（实际 ${yStepD2}）`);

// ===== test 4: 规则自身 name 更新 + 多次改名链 key 保持 .i =====
ok(yRule2.name.toString() === ".y", "规则自身 name 未受影响（不是被改名的规则）");
ok(sys.rules.get("yid").name.toString() === "yid", "被改名规则 name 更新为 yid");
ok(sys.renamedSysRule.get(".i") === "yid", "多次改名后 renamedSysRule key 保持 .i -> yid");
ok(sys.getSysRuleName(".i") === "yid", "getSysRuleName(.i) = yid（多次改名）");

// ===== test 5: 推理表sheet中引用该规则的步骤也被更新 =====
// 构造一个无条件规则 r5a（⊢A→A），并让其 step 可重放（d a1 A A）
const mkRule5 = mkRule("r5a", "⊢A→A");
mkRule5.step = [{
    ast: new AST(NodeType.ATOM_WFF, "A→A→A"),
    from: { type: "d", data: { deduction: new AST(NodeType.ATOM_DNAME, "a1"), conditions: [], replaceValues: { $1: parser.parse("A", 'item'), $2: parser.parse("A", 'item') } } },
    id: 1, children: undefined, parent: null, name: "",
}];
// 在推理表中应用 r5a，产生引用 r5a 的 d 步骤
sys.clear();
sys.d(sys.rules.get("r5a"), [], {});
const sheetProps = sys.props.slice(); // 模拟一个 sheet 的 ctx.props（独立数组）
ok(sheetProps[0].from.data.deduction.toString() === "r5a", "sheet 中 d 步骤引用 r5a");
// 重命名 r5a -> r5x（同时更新规则表step与sheet props，模拟 main.ts onRename 的完整逻辑）
sys.renameD("r5a", "r5x");
sys.renameDnameInProps(sheetProps, "r5a", "r5x");
ok(sheetProps[0].from.data.deduction.toString() === "r5x", `重命名后 sheet 中 d 步骤引用更新为 r5x（实际 ${sheetProps[0].from.data.deduction.toString()}）`);
ok(sys.rules.has("r5x") && !sys.rules.has("r5a"), "规则 r5a 已改名 r5x");
// 二次改名 r5x -> r5z，验证 sheet 引用再更新
sys.renameD("r5x", "r5z");
sys.renameDnameInProps(sheetProps, "r5x", "r5z");
ok(sheetProps[0].from.data.deduction.toString() === "r5z", `二次改名后 sheet 引用更新为 r5z（实际 ${sheetProps[0].from.data.deduction.toString()}）`);
ok(sys.rules.has("r5z") && !sys.rules.has("r5x"), "规则 r5x 已改名 r5z");

// ===== test 6: 非法操作 =====
let threw = false;
try { sys.renameD("mp", "a1"); } catch (e) { threw = true; }
ok(threw, "改名冲突（a1 已存在）抛错");
threw = false;
try { sys.renameD("mp", "1foo"); } catch (e) { threw = true; }
ok(threw, "非法规则名（数字开头）抛错");
threw = false;
try { sys.renameD("nonexist", "foo"); } catch (e) { threw = true; }
ok(threw, "不存在的规则抛错");

console.log(`===== ${passed} passed, ${failed} failed =====`);
if (failed > 0) process.exit(1);
