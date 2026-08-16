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
a4:ax: ⊢∀$x:$→#sb($,$x,$A);
a5:ax: ⊢∀$x:($1→$2)→∀$x:$1→∀$x:$2;
a6:ax: #nf($,$x) ⊢ $→∀$x:$;
a7:ax: ⊢$A=$A;
a8:ax: ⊢$A=$B→#sb($,$x,$A)→#sb($,$x,$B);
.i:⊢$→$; a1 $ $; a1 $ $→$; a2 $ $→$ $; mp 3 2; mp 4 1;
.t:$1→$2,$2→$3⊢$1→$3; hyp $1→$2;hyp $2→$3;cond $1;d mp 1 3;d mp 2 4;
.myrule:⊢$1→$1; d .i $1;
`);

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log(`[ok] ${name}`); } else { failed++; console.log(`[FAIL] ${name}`); } };

// ===== 场景1：加载宏 .myrule（step 是 d .i $1）到推理表，然后 expand 加载的命题 =====
const rule = sys.rules.get('.myrule');
const stepBefore = rule.step;
const stepLastBefore = stepBefore[stepBefore.length - 1];
const stepLastAstBefore = stepLastBefore.ast.toString();
const stepLastFromBefore = stepLastBefore.from.type;
console.log('规则 .myrule step 最后一个 prop ast:', stepLastAstBefore, 'type:', stepLastFromBefore);

// 模拟 load：genCmd 生成命令 → fromCmd 重放到当前（空）推理表
sys.clear();
const cmds1 = sys.genCmd(stepBefore).map(e => parser.parse(e, "cmd"));
console.log('load 生成的命令:', sys.genCmd(stepBefore).join('; '));
sys.fromCmd(cmds1);
sys.updatePropIdx();
ok(sys.props.length === stepBefore.length, '重放后 props 数量与 step 一致');
ok(sys.props[0] !== stepBefore[0], '重放对象与原对象不同引用');
ok(sys.props[sys.props.length - 1] !== stepBefore[stepBefore.length - 1], '重放的最后一个 prop 与原 prop 不同引用');

// 对加载的命题 expand（结论步骤）
const loadedLast = sys.props[sys.props.length - 1];
ok(loadedLast.from.type === 'd', '加载的最后一个 prop 是 d 类型');
try {
    sys.expand(loadedLast);
    ok(true, '对加载的命题 expand 成功');
} catch (e) {
    ok(false, `对加载的命题 expand 失败: ${JSON.stringify(e)}`);
}

// 关键验证：原规则 step 不应被修改！
ok(rule.step === stepBefore, '规则 step 数组引用未变');
ok(rule.step[rule.step.length - 1] === stepLastBefore, '规则 step 最后一个 prop 对象引用未变');
ok(rule.step[rule.step.length - 1].ast.toString() === stepLastAstBefore, '规则 step 最后一个 prop 的 ast 未被修改');
ok(rule.step[rule.step.length - 1].from.type === stepLastFromBefore, '规则 step 最后一个 prop 的 from 未被修改');

// ===== 场景2：含 cond 文件夹的规则（.t），重放后跨层级结构正确 =====
const ruleT = sys.rules.get('.t');
const stepTBefore = ruleT.step;
const condIdx = stepTBefore.findIndex(p => p.from.type === "c");
const origChildrenLen = stepTBefore[condIdx]?.children?.length;
const stepTLastBefore = stepTBefore[stepTBefore.length - 1];
const stepTLastAst = stepTLastBefore.ast.toString();

sys.clear();
const cmdsT = sys.genCmd(stepTBefore).map(e => parser.parse(e, "cmd"));
console.log('.t load 生成的命令:', sys.genCmd(stepTBefore).join('; '));
sys.fromCmd(cmdsT);
sys.updatePropIdx();
ok(sys.props.length === stepTBefore.length, '.t 重放后 props 数量与 step 一致');
// 验证 cond 文件夹存在且 children 结构正确
const newCondIdx = sys.props.findIndex(p => p.from.type === "c");
ok(newCondIdx === condIdx, 'cond 文件夹位置一致');
ok(sys.props[newCondIdx].children?.length === origChildrenLen, 'cond 文件夹 children 数量一致');
ok(sys.props[newCondIdx] !== stepTBefore[condIdx], 'cond 文件夹对象不同引用');
ok(sys.props[newCondIdx].children[0] !== stepTBefore[condIdx].children[0], 'cond children 对象不同引用');
// 验证内部 d 步骤的条件引用指向重放后的对象（跨层级 rely 正确）
const newInnerD = sys.props[newCondIdx].children.find(p => p.from.type === "d");
const newConds = newInnerD.from.data.conditions;
const allNew = new Set();
const collect = (ps) => { for (const p of ps) { allNew.add(p); if (p.children) collect(p.children); } };
collect(sys.props);
ok(newConds.every(c => allNew.has(c)), '内部 d 步骤条件引用都在重放树内（跨c/v层级rely正确）');

// 对 .t 的 cond 文件夹 expand（expandFolder 肢解），验证不污染原 step
sys.clear();
sys.fromCmd(cmdsT);
sys.updatePropIdx();
const loadedCond = sys.props[newCondIdx];
try {
    sys.expand(loadedCond);
    ok(true, '.t 加载后 expandFolder 成功');
} catch (e) {
    ok(false, `.t 加载后 expandFolder 失败: ${JSON.stringify(e)}`);
}
ok(ruleT.step === stepTBefore, '.t 规则 step 数组引用未变');
ok(ruleT.step[ruleT.step.length - 1] === stepTLastBefore, '.t 规则 step 最后一个 prop 对象引用未变');
ok(ruleT.step[ruleT.step.length - 1].ast.toString() === stepTLastAst, '.t 规则 step 最后一个 prop ast 未变');

console.log(`===== ${passed} passed, ${failed} failed =====`);
if (failed > 0) process.exit(1);
