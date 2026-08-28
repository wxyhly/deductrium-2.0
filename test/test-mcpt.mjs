import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { AtomSolver } from '../js/hs/core/assert.js';
import { MCPT } from '../js/hs/core/combine.js';

const parser = new HSParser();
const sys = new HilbertSystem();
// 加载基础规则（测 getD 其它规则不受影响）
sys.rules.set("mp", new Deduction(new Set, new AST(2, "mp"), [], [parser.parse("$1→$2", 'wff'), parser.parse("$1", 'wff')], parser.parse("$2", 'wff')));
sys.rules.set("a1", new Deduction(new Set, new AST(2, "a1"), [], [], parser.parse("$1→$2→$1", 'wff')));

let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log(`[ok] ${name}`); } else { failed++; console.log(`[FAIL] ${name}`); } };

// ===== test 1: MCPT 重言式验证 =====
try {
    new MCPT(parser.parse("$1→$1", 'wff')).check();
    ok(true, "重言式 $1→$1 通过");
} catch (e) { ok(false, "重言式 $1→$1 通过: " + JSON.stringify(e)); }

try {
    new MCPT(parser.parse("($1→$2)→($1→$2)", 'wff')).check();
    ok(true, "重言式 ($1→$2)→($1→$2) 通过");
} catch (e) { ok(false, "重言式 ($1→$2)→($1→$2) 通过: " + JSON.stringify(e)); }

// ===== test 2: 非重言式抛错 =====
try {
    new MCPT(parser.parse("$1", 'wff')).check();
    ok(false, "非重言式 $1 应抛错");
} catch (e) {
    ok(e?.type === "mcptFalse", "非重言式 $1 抛 mcptFalse: " + e?.type);
}

try {
    new MCPT(parser.parse("$1∧$2", 'wff')).check();
    ok(false, "非重言式 $1∧$2 应抛错");
} catch (e) {
    ok(e?.type === "mcptFalse", "非重言式 $1∧$2 抛 mcptFalse");
}

// ===== test 3: 量词视为原子 =====
try {
    new MCPT(parser.parse("A→∀x:A", 'wff')).check();
    ok(false, "A→∀x:A 应抛错（不是命题逻辑重言式）");
} catch (e) {
    ok(e?.type === "mcptFalse", "A→∀x:A 抛 mcptFalse（量词视为原子）");
}
try {
    new MCPT(parser.parse("(∀x:A)→(∀x:A)", 'wff')).check();
    ok(true, "(∀x:A)→(∀x:A) 重言式通过（量词视为原子）");
} catch (e) { ok(false, "(∀x:A)→(∀x:A) 重言式通过: " + JSON.stringify(e)); }

// ===== test 4: 谓词视为原子 =====
try {
    new MCPT(parser.parse("P(a)→P(a)", 'wff')).check();
    ok(true, "P(a)→P(a) 重言式通过（谓词视为原子）");
} catch (e) { ok(false, "P(a)→P(a) 重言式通过: " + JSON.stringify(e)); }

// ===== test 5: 原子过多抛 mcptTooMany =====
try {
    const atoms = Array.from({ length: 21 }, (_, i) => "$" + i);
    new MCPT(parser.parse(atoms.join("∨"), 'wff')).check();
    ok(false, "21个原子应抛 mcptTooMany");
} catch (e) {
    ok(e?.type === "mcptTooMany", "21个原子抛 mcptTooMany: " + e?.type);
}

// ===== test 6: mcpt 命令完整路径（不经过 getD，getD("mcpt") 应 404） =====
try {
    sys.getD(parser.parse("mcpt", 'dname'));
    ok(false, "mcpt 不应注册为规则（getD 应 404）");
} catch (e) {
    ok(e?.type === "dname404", "mcpt 不在 getD 中: " + e?.type);
}

// mcpt 重言式
sys.clear();
const p1 = sys.mcpt(parser.parse("$1→$1", 'wff'));
ok(p1.ast.toString() === "$1→$1", "mcpt 添加重言式命题: " + p1.ast.toString());
ok(p1.from.type === "d" && p1.from.data.deduction.name === "mcpt", "命题标注 mcpt");
ok(p1.from.data.conditions.length === 0, "mcpt 步骤 conditions 为空");
ok(p1.getCmd() === "mcpt $1→$1", "getCmd 省略 d 前缀: " + p1.getCmd());

// mcpt 非重言式抛错
sys.clear();
try {
    sys.mcpt(parser.parse("$1", 'wff'));
    ok(false, "mcpt 非重言式应抛错");
} catch (e) {
    ok(e?.type === "mcptFalse", "mcpt 非重言式抛 mcptFalse: " + e?.type);
}

// mcpt 量词视为原子
sys.clear();
const p3 = sys.mcpt(parser.parse("(∀x:A)→(∀x:A)", 'wff'));
ok(p3.ast.toString() === "∀x:A→∀x:A", "mcpt 量词重言式通过: " + p3.ast.toString());

// genCmd/fromCmd 往返
const cmds = sys.genCmd();
sys.clear();
sys.fromCmd(cmds.map(e => parser.parse(e, 'cmd')));
ok(sys.props.length === 1 && sys.props[0].ast.toString() === "∀x:A→∀x:A", "mcpt genCmd/fromCmd 往返: " + sys.props[0]?.ast);

// getD 其它规则不受影响
const mp = sys.getD(parser.parse("mp", 'dname'));
ok(mp.name.name === "mp", "其它规则 getD 正常");

console.log(`===== ${passed} passed, ${failed} failed =====`);
if (failed > 0) process.exit(1);
