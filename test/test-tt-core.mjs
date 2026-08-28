// 类型层核心逻辑测试：移植自 deductrium-hott-optimised 的 NBE 内核 + 双向检查器。
// 覆盖：定义（xx:=xxx / xx:=xxx:T）、类型断言（xxx:T）、定义相等（xxx==xxx / ≡）、
//       直接类型推断、infer 元变量（?x 与 _）。
// 运行：node test/test-tt-core.mjs
import { Core } from '../js/tt/core.js';
import { TypeParser } from '../js/tt/parser.js';
import { astToString } from '../js/tt/kast.js';

const core = new Core();
const parser = new TypeParser();
const p = (s) => parser.parse(s);
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("[ok] " + msg); } else { fail++; console.log("[NO] " + msg); } };
const show = (msg) => console.log("    " + msg);
// 捕获错误的辅助
const assertFail = (fn, msg) => {
    try { fn(); fail++; console.log("[NO] " + msg + " （未抛出错误）"); }
    catch (e) { pass++; console.log("[ok] " + msg + " （抛错: " + String(e.message ?? e).slice(0, 60) + "）"); }
};

// ============ 系统表 ============
console.log("===== 系统表（True/true/False/nat/0/succ） =====");
ok(core.sysTypes.has("True") && core.sysTypes.has("nat"), "系统类型 True/nat 已注册");
ok(core.sysTypes.has("true") && core.sysTypes.has("0") && core.sysTypes.has("succ"), "系统构造子 true/0/succ 已注册");

// ============ 定义 ============
console.log("===== 定义 xx:=xxx / xx:=xxx:T =====");
let r = core.run(p("x := true"));
ok(r.kind === "define" && astToString(r.type) === "True", "x := true -> x : True（实际 " + astToString(r.type) + "）");

r = core.run(p("y := true : True"));
ok(r.kind === "define" && astToString(r.type) === "True", "y := true : True -> y : True");

r = core.run(p("id := \\l x:nat. x"));
ok(r.kind === "define" && astToString(r.type) === "Πx:nat.nat", "id := \\l x:nat. x -> id : Πx:nat.nat（实际 " + astToString(r.type) + "）");

r = core.run(p("add2 := \\l x:nat. succ (succ x)"));
ok(r.kind === "define" && astToString(r.type) === "Πx:nat.nat", "add2 := \\l x:nat. succ (succ x) -> Πx:nat.nat");

// 定义引用前一个定义
r = core.run(p("add4 := \\l x:nat. add2 (add2 x)"));
ok(r.kind === "define" && astToString(r.type) === "Πx:nat.nat", "add4 := \\l x:nat. add2 (add2 x) -> Πx:nat.nat");

// 定义的类型可通过断言语义验证
core.assertType(p("x"), p("True"));
core.assertType(p("id"), p("nat→nat"));

console.log("===== 定义相等断言 xx==xx（≡） =====");
core.assertEq(p("true"), p("true"));
core.assertEq(p("succ 0"), p("1"));
core.assertEq(p("(\\l x:nat. x) 0"), p("0"));
core.assertEq(p("id 0"), p("0"));
core.assertEq(p("add2 1"), p("3"));
core.assertEq(p("add4 1"), p("5"));
ok(true, "5 条定义相等断言全部通过");

console.log("===== 类型断言 xxx:T =====");
core.assertType(p("true"), p("True"));
core.assertType(p("0"), p("nat"));
core.assertType(p("succ 0"), p("nat"));
core.assertType(p("(\\l x:nat. x) 0"), p("nat"));
core.assertType(p("\\l x:nat. x"), p("nat→nat"));
core.assertType(p("\\l x:nat. x"), p("Πx:nat.nat"));
ok(true, "6 条类型断言全部通过");

console.log("===== 负面测试（应抛错） =====");
assertFail(() => core.assertType(p("true"), p("nat")), "true : nat 应失败");
assertFail(() => core.assertType(p("0"), p("True")), "0 : True 应失败");
assertFail(() => core.assertEq(p("0"), p("true")), "0 == true 应失败");
assertFail(() => core.run(p("nope := unknownConst")), "unknownConst 未定义应失败");
assertFail(() => core.assertEq(p("succ 0"), p("0")), "succ 0 == 0 应失败");

console.log("===== 直接类型推断 =====");
const inferStr = (s) => { try { return astToString(core.infer(p(s))); } catch (e) { return "ERR:" + e.message; } };
ok(inferStr("true") === "True", "infer(true) = True（实际 " + inferStr("true") + "）");
ok(inferStr("0") === "nat", "infer(0) = nat");
ok(inferStr("succ") === "nat→nat", "infer(succ) = nat→nat（实际 " + inferStr("succ") + "）");
ok(inferStr("succ 0") === "nat", "infer(succ 0) = nat");
ok(inferStr("(\\l x:nat. x) 0") === "nat", "infer((\\l x:nat. x) 0) = nat");
ok(inferStr("\\l x:nat. x") === "Πx:nat.nat", "infer(\\l x:nat. x) = Πx:nat.nat（实际 " + inferStr("\\l x:nat. x") + "）");
ok(inferStr("id 0") === "nat", "infer(id 0) = nat");
ok(inferStr("\\U 0") === "𝒰1", "infer(\\U 0) = 𝒰1（实际 " + inferStr("\\U 0") + "）");

console.log("===== 归约（whnf/normalize） =====");
ok(astToString(core.whnf(p("(\\l x:nat. x) 0"))) === "0", "whnf((\\l x:nat. x) 0) = 0");
ok(astToString(core.normalize(p("succ 0"))) === "1", "normalize(succ 0) = 1");
ok(astToString(core.normalize(p("add4 1"))) === "5", "normalize(add4 1) = 5（实际 " + astToString(core.normalize(p("add4 1"))) + "）");

console.log("===== infer 元变量（?x 命名元变量 / _ 洞） =====");
// 类型元变量：x2 := true : ?T  →  ?T 被求解为 True
r = core.run(p("x2 := true : ?T"));
ok(r.kind === "define" && astToString(r.type) === "True", "x2 := true : ?T -> x2 : True（元变量 ?T 求解成功）");

// 项元变量：succ ?n == 1 → ?n := 0
core.assertEq(p("succ ?n"), p("1"));
ok(true, "succ ?n == 1 通过（?n 被求解为 0）");

// λ 体内元变量：(\l x:nat. ?m) 0 == 0 → ?m := 0
core.assertEq(p("(\\l x:nat. ?m) 0"), p("0"));
ok(true, "(\\l x:nat. ?m) 0 == 0 通过（?m 被求解为 0）");

// 裸表达式中的洞：succ _ 应能推断（_ 为洞，求值后消失）
r = core.run(p("sx := succ _"));
show("sx := succ _ 的推断类型: " + astToString(r.type));
ok(astToString(r.type) === "nat", "sx := succ _ -> sx : nat");

// 带元变量的定义与使用
r = core.run(p("app := \\l f:nat→nat. \\l z:nat. f z"));
ok(r.kind === "define", "app := \\l f:nat→nat. \\l z:nat. f z 定义成功");
core.assertEq(p("app (\\l x:nat. succ x) 0"), p("1"));
ok(true, "app (\\l x:nat. succ x) 0 == 1 通过（高阶函数 + β 归约）");

console.log("===== 文本命令入口 exec =====");
show(core.exec("k := true"));
show(core.exec("id2 := \\l x:nat. x"));
show(core.exec("id2 3"));
show(core.exec("succ 0"));
show(core.exec("true : True"));
show(core.exec("succ 0 == 1"));

console.log(`\n===== 结果: ${pass} 通过, ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
