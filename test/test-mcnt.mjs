// mcnt 换名元定理测试
// 命令格式：mcnt 目标(wff或推理步骤) 替换规则{..}
// 替换规则元素：单变量=位置索引(1-based)；{索引,变量}/{变量,索引} pair；. 或 {} 占位符
// wff 目标结果 wrap<>（原↔换名后）；步骤目标结果直接是换名后表达式
// 嵌套量词（内外都有替换）走两遍替换（临时fresh变量），否则单遍
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { AtomSolver } from '../js/hs/core/assert.js';
import { MCNT } from '../js/hs/core/combine.js';
import { LangMgr } from '../js/lang.js';
import { initialCreativeRules, initialSurvivalRules } from '../js/hs/core/initial.js';

const parser = new HSParser();
const sys = new HilbertSystem();
const addRules = (data) => {
    data.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//") && !e.trim().startsWith("{") && !e.trim().startsWith("}")).forEach(e => {
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
            try {
                for (const n of rule.assertions) sys.fromCmd([parser.parse("hyp " + AtomSolver.print(n), "cmd")]);
                for (const n of rule.conditions) sys.fromCmd([parser.parse("hyp " + n, "cmd")]);
                sys.fromCmd(steps.split(";").filter(e => e).map(e => parser.parse(e, "cmd")));
                rule.step = sys.props.slice(0);
            } catch (e) {
                console.log(`规则 ${name} 加载失败:`, JSON.stringify(e));
            } finally {
                sys.clear();
            }
        }
    });
};
addRules(initialCreativeRules);
addRules(initialSurvivalRules);

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log(`[ok] ${name}`); } else { failed++; console.log(`[FAIL] ${name}`); } };

// ===== test 1: getsubIndices 解析 =====
try {
    const g = MCNT.getsubIndices;
    ok(JSON.stringify([...g(parser.parse("{x,.,y}", 'item'))]) === '[[1,"x"],[3,"y"]]', `{x,.,y} → {1:x,3:y}`);
    ok(JSON.stringify([...g(parser.parse("{{3,x},{y,-1}}", 'item'))]) === '[[3,"x"],[-1,"y"]]', `{{3,x},{y,-1}} → {3:x,-1:y}`);
    ok(JSON.stringify([...g(parser.parse("{z}", 'item'))]) === '[[1,"z"]]', `{z} → {1:z}`);
    ok(g(parser.parse("{}", 'item')) === undefined, `{} → undefined`);
    ok(JSON.stringify([...g(parser.parse("{{1,z}}", 'item'))]) === '[[1,"z"]]', `{{1,z}} → {1:z}`);
    ok(JSON.stringify([...g(parser.parse("{{z,1}}", 'item'))]) === '[[1,"z"]]', `{{z,1}} → {1:z}（顺序无关）`);
    let threw = false;
    try { g(parser.parse("{1}", 'item')); } catch (e) { threw = e?.type === "mcntBadIndex"; }
    ok(threw, `{1} 单个数字报 mcntBadIndex`);
} catch (e) { ok(false, `test1 异常: ${JSON.stringify(e)}`); }

// ===== test 2: wff 目标基本换名 =====
sys.clear();
try {
    const r = sys.mcnt([parser.parse("\\ax:x=y", 'wff'), parser.parse("{z}", 'item')]);
    ok(r.ast.toString() === "∀x:x=y↔∀z:z=y", `mcnt \\ax:x=y {z} → ∀x:x=y↔∀z:z=y`);
} catch (e) { ok(false, `test2 异常: ${JSON.stringify(e)}`); }

// ===== test 3: pair 形式 =====
sys.clear();
try {
    const r = sys.mcnt([parser.parse("\\ax:x=y", 'wff'), parser.parse("{{1,z}}", 'item')]);
    ok(r.ast.toString() === "∀x:x=y↔∀z:z=y", `{{1,z}} 与 {z} 等价`);
} catch (e) { ok(false, `test3a 异常: ${JSON.stringify(e)}`); }
sys.clear();
try {
    const r = sys.mcnt([parser.parse("\\ax:x=y", 'wff'), parser.parse("{{z,1}}", 'item')]);
    ok(r.ast.toString() === "∀x:x=y↔∀z:z=y", `{{z,1}} 顺序无关`);
} catch (e) { ok(false, `test3b 异常: ${JSON.stringify(e)}`); }

// ===== test 4: 负索引（从右往左）=====
sys.clear();
try {
    const r = sys.mcnt([parser.parse("\\ax:\\ay:x=y", 'wff'), parser.parse("{{-1,z}}", 'item')]);
    ok(r.ast.toString() === "∀x:∀y:x=y↔∀x:∀z:x=z", `{{-1,z}} 换内层 y→z`);
} catch (e) { ok(false, `test4 异常: ${JSON.stringify(e)}`); }
sys.clear();
try {
    const r = sys.mcnt([parser.parse("\\ax:\\ay:x=y", 'wff'), parser.parse("{{-2,z}}", 'item')]);
    ok(r.ast.toString() === "∀x:∀y:x=y↔∀z:∀y:z=y", `{{-2,z}} 换外层 x→z`);
} catch (e) { ok(false, `test4b 异常: ${JSON.stringify(e)}`); }

// ===== test 5: 嵌套 swap（两遍替换）=====
sys.clear();
try {
    const r = sys.mcnt([parser.parse("\\ax:\\ay:x=y", 'wff'), parser.parse("{y,x}", 'item')]);
    ok(r.ast.toString() === "∀x:∀y:x=y↔∀y:∀x:y=x", `swap {y,x} → ∀y:∀x:y=x`);
} catch (e) { ok(false, `test5 异常: ${JSON.stringify(e)}`); }

// ===== test 6: 嵌套非swap（多变量）=====
sys.clear();
try {
    const r = sys.mcnt([parser.parse("\\ax:\\ay:x=y", 'wff'), parser.parse("{y,z}", 'item')]);
    ok(r.ast.toString() === "∀x:∀y:x=y↔∀y:∀z:y=z", `{y,z} → ∀y:∀z:y=z`);
} catch (e) { ok(false, `test6 异常: ${JSON.stringify(e)}`); }

// ===== test 7: 同名过滤（无操作）=====
sys.clear();
try {
    const r = sys.mcnt([parser.parse("\\ax:x=y", 'wff'), parser.parse("{x}", 'item')]);
    ok(r.ast.toString() === "∀x:x=y↔∀x:x=y", `{x} 同名 → 原↔原（无操作）`);
} catch (e) { ok(false, `test7 异常: ${JSON.stringify(e)}`); }

// ===== test 8: 捕获失败（y 在 body 中自由出现）=====
sys.clear();
try {
    sys.mcnt([parser.parse("\\ax:x=y", 'wff'), parser.parse("{y}", 'item')]);
    ok(false, "x→y 捕获自由 y 应报错");
} catch (e) {
    ok(e?.type === "mcntAssertFail", `x→y 捕获报 mcntAssertFail，实际 ${e?.type}`);
}

// ===== test 9: 步骤目标（不wrap）=====
sys.clear();
try {
    sys.hyp(parser.parse("\\ax:x=y", 'wff'));
    const r = sys.mcnt([parser.parse("1", 'item'), parser.parse("{z}", 'item')]);
    ok(r.ast.toString() === "∀z:z=y", `步骤目标 mcnt 1 {z} → ∀z:z=y（不wrap）`);
    const cmds = sys.genCmd();
    ok(cmds[cmds.length - 1] === "mcnt 1 {z}", `序列化为 "mcnt 1 {z}"，实际 "${cmds[cmds.length - 1]}"`);
} catch (e) { ok(false, `test9 异常: ${JSON.stringify(e)}`); }

// ===== test 10: 往返（wff 目标）=====
sys.clear();
try {
    sys.mcnt([parser.parse("\\ax:x=y", 'wff'), parser.parse("{z}", 'item')]);
    const cmds = sys.genCmd();
    const asts = cmds.map(c => parser.parse(c, "cmd"));
    sys.clear();
    sys.fromCmd(asts);
    sys.updatePropIdx();
    ok(sys.props.length === 1 && sys.props[0].ast.toString() === "∀x:x=y↔∀z:z=y", "wff 目标往返正确");
} catch (e) { ok(false, `test10 异常: ${JSON.stringify(e)}`); }

// ===== test 11: 往返（步骤目标）=====
sys.clear();
try {
    sys.hyp(parser.parse("\\ax:x=y", 'wff'));
    sys.mcnt([parser.parse("1", 'item'), parser.parse("{{1,z}}", 'item')]);
    const cmds = sys.genCmd();
    const asts = cmds.map(c => parser.parse(c, "cmd"));
    sys.clear();
    sys.fromCmd(asts);
    sys.updatePropIdx();
    ok(sys.props.length === 2, `步骤目标往返 props 数 2，实际 ${sys.props.length}`);
    ok(sys.props[1].ast.toString() === "∀z:z=y", "步骤目标往返结果正确");
    ok(sys.props[1].from.type === "d", "往返后 mcnt 是 d 类型");
} catch (e) { ok(false, `test11 异常: ${JSON.stringify(e)}`); }

// ===== test 12: expand 报 atomicStep（暂不生成步骤）=====
sys.clear();
try {
    const r = sys.mcnt([parser.parse("\\ax:x=y", 'wff'), parser.parse("{z}", 'item')]);
    sys.expand(r);
    ok(false, "mcnt expand 应报 atomicStep");
} catch (e) {
    ok(e?.type === "expandFail" || e?.type === "atomicStep", `mcnt expand 报错（expandFail/atomicStep），实际 ${e?.type}`);
}

// ===== test 13: 宏规则步骤包含 mcnt（replayStepProp）=====
sys.clear();
try {
    // 规则 .mycnt: ∀x:x=y ⊢ ∀z:z=y，步骤 = d mcnt ...
    const rest = "∀x:x=y⊢∀z:z=y";
    const ast = parser.parse(rest, 'rule');
    const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
    ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
    const rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, ".mycnt"), assertions, ast.nodes, ast.nodes.pop());
    sys.rules.set(".mycnt", rule);
    // 先手动执行 mcnt 步骤目标来得到正确的步骤命令
    sys.hyp(parser.parse("∀x:x=y", 'wff'));  // 1
    sys.mcnt([parser.parse("1", 'item'), parser.parse("{z}", 'item')]);  // 2
    // 用 genCmd 生成规则步骤
    const cmds = sys.genCmd();
    console.log('  .mycnt 步骤命令:', cmds.join('; '));
    sys.clear();
    sys.fromCmd(cmds.map(c => parser.parse(c, "cmd")));
    rule.step = sys.props.slice(0);
    // 应用 .mycnt
    sys.clear();
    sys.hyp(parser.parse("∀x:x=y", 'wff'));
    const p = sys.d(rule, [sys.getP("1")], {});
    ok(p.ast.toString() === "∀z:z=y", `宏规则 .mycnt 应用得 ∀z:z=y`);
    // expand 宏规则（重放 mcnt 步骤）
    sys.expand(p);
    ok(sys.props[sys.props.length - 1].ast.toString() === "∀z:z=y", `宏规则 expand 重放 mcnt 步骤成功`);
} catch (e) { ok(false, `test13 异常: ${JSON.stringify(e)}`); }

// ===== test 14: 占位符混合 =====
sys.clear();
try {
    const r = sys.mcnt([parser.parse("\\ax:\\ay:\\az:(x=y∧y=z)", 'wff'), parser.parse("{.,v,{}}", 'item')]);
    ok(r.ast.toString() === "∀x:∀y:∀z:(x=y∧y=z)↔∀x:∀v:∀z:(x=v∧v=z)", `{. ,v,{}} 只换第2个量词，实际 ${r.ast}`);
} catch (e) { ok(false, `test14 异常: ${JSON.stringify(e)}`); }

// ===== test 15: LangMgr 翻译 =====
{
    const zh = LangMgr.renderHSError({ type: "mcntNoMatch" });
    ok(zh.includes("量词"), "mcntNoMatch 中文翻译");
    LangMgr.lang = "en";
    const en = LangMgr.renderHSError({ type: "mcntBadIndex" });
    ok(en.includes("rename rule"), `mcntBadIndex 英文翻译，实际 "${en}"`);
}

console.log(`===== ${passed} passed, ${failed} failed =====`);
process.exit(failed ? 1 : 0);
