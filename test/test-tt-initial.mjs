// 类型层初始系统测试：注册创造模式全量系统 + 定义/断言/计算规则验证
import { Core } from '../js/tt/core.js';
import { TypeParser } from '../js/tt/parser.js';
import { initCreativeRules, initTypeSystem } from '../js/tt/initial.js';
import { astToString } from '../js/tt/kast.js';

const core = new Core();
const parser = new TypeParser();
const p = (s) => parser.parse(s);
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("[ok] " + msg); } else { fail++; console.log("[NO] " + msg); } };

// ===== 系统注册 =====
console.log("===== 初始系统注册 =====");
const rules = initCreativeRules();
console.log("  规则总数:", rules.length);
core.registerSystemRules(rules);
ok(core.checker.hasConstantType("True"), "True 已注册");
ok(core.checker.hasConstantType("nat"), "nat 已注册");
ok(core.checker.hasConstantType("ind_nat"), "ind_nat 已注册");
ok(core.checker.hasConstantType("refl"), "refl 已注册");
ok(core.checker.hasConstantType("pair"), "pair 已注册");
ok(core.kernel.hasComputeRules("ind_nat"), "ind_nat 计算规则已注册");
ok(core.kernel.hasComputeRules("ind_eq"), "ind_eq 计算规则已注册");
ok(core.kernel.hasComputeRules("@ind_nat"), "@ind_nat 计算规则已注册");
ok(core.kernel.hasDefinition("add"), "add 定义已注册");
ok(core.kernel.hasDefinition("isProp"), "isProp 定义已注册");

// ===== 类型推断 =====
console.log("===== 类型推断 =====");
const infer = (s) => { try { return astToString(core.infer(p(s))); } catch (e) { return "ERR:" + e.message; } };
ok(infer("true") === "True", "infer(true) = True（实际 " + infer("true") + "）");
ok(infer("0") === "nat", "infer(0) = nat（实际 " + infer("0") + "）");
ok(infer("succ") === "nat→nat", "infer(succ) = nat→nat（实际 " + infer("succ") + "）");
ok(infer("add") === "Πx:nat.Πn:nat.nat", "infer(add) = Πx:nat.Πn:nat.nat（nat→nat→nat，实际 " + infer("add") + "）");
ok(infer("add 2 3") === "nat", "infer(add 2 3) = nat（实际 " + infer("add 2 3") + "）");
ok(infer("refl 3") === "eq 3 3", "infer(refl 3) = eq 3 3（实际 " + infer("refl 3") + "）");
ok(infer("pair (λx:nat. nat) 3 4") === "Σz:nat.nat", "infer(pair ...) = Σz:nat.nat（实际 " + infer("pair (λx:nat. nat) 3 4") + "）");
ok(infer("pr0 nat (λx:nat. nat) (pair (λx:nat. nat) 3 4)") === "nat", "infer(pr0 ...) = nat（实际 " + infer("pr0 nat (λx:nat. nat) (pair (λx:nat. nat) 3 4)") + "）");
ok(infer("inl nat Bool 3") === "Sum nat Bool", "infer(inl nat Bool 3) = Sum nat Bool（实际 " + infer("inl nat Bool 3") + "）");
ok(infer("cons nat 1 (nil nat)") === "List nat", "infer(cons nat 1 (nil nat)) = List nat（实际 " + infer("cons nat 1 (nil nat)") + "）");
ok(infer("isProp") === "Πa:𝒰.𝒰", "infer(isProp) = U→U（实际 " + infer("isProp") + "）");
ok(infer("succZ (pos 1)") === "Z", "infer(succZ (pos 1)) = Z（实际 " + infer("succZ (pos 1)") + "）");

// ===== 计算规则 / 定义相等 =====
console.log("===== 计算规则 =====");
const eq = (a, b) => { try { core.assertEq(p(a), p(b)); return true; } catch (e) { console.log("   eq失败 " + a + " == " + b + ": " + e.message); return false; } };
ok(eq("succ 2", "3"), "succ 2 == 3");
ok(eq("pred 2", "1"), "pred 2 == 1");
ok(eq("add 2 3", "5"), "add 2 3 == 5（ind_nat 计算）");
ok(eq("mul 3 4", "12"), "mul 3 4 == 12");
ok(eq("pow 2 10", "1024"), "pow 2 10 == 1024");
ok(eq("double 2", "4"), "double 2 == 4");
ok(eq("add 0 5", "5"), "add 0 5 == 5");
ok(eq("pr0 nat (λx:nat. nat) (pair (λx:nat. nat) 3 4)", "3"), "pr0 (pair ...) == 3");
ok(eq("prd1 nat (λx:nat. nat) (pair (λx:nat. nat) 3 4)", "4"), "prd1 (pair ...) == 4");
ok(eq("ind_Bool (λx:Bool. Bool) 1b 0b 0b", "1b"), "ind_Bool 0b 计算（c0=1b）");
ok(eq("ind_Bool (λx:Bool. Bool) 1b 0b 1b", "0b"), "ind_Bool 1b 计算（c1=0b）");
ok(eq("ind_List nat (λx:List nat. nat) 0 (λx:nat. λxs:List nat. λh:nat. succ h) (cons nat 1 (cons nat 2 (nil nat)))", "2"), "ind_List 计算");
ok(eq("succZ (pos 2)", "pos 3"), "succZ (pos 2) == pos 3");
ok(eq("succZ (neg 0)", "0Z"), "succZ (neg 0) == 0Z（neg 0 = -1）");
ok(eq("succZ (neg 1)", "neg 0"), "succZ (neg 1) == neg 0");
ok(eq("negZ (neg 2)", "pos 2"), "negZ (neg 2) == pos 2");
ok(eq("addZ (pos 2) (neg 0)", "pos 1"), "addZ (pos 2) (neg 0) == pos 1（2 + (-1) = 1）");
ok(eq("addZ (pos 2) (neg 1)", "pos 0"), "addZ (pos 2) (neg 1) == pos 0（2 + (-2) = 0）");
ok(eq("lowerU nat (liftU nat 3)", "3"), "lowerU (liftU 3) == 3");
ok(eq("ap nat nat 3 3 (λx:nat. succ x) (refl 3)", "refl (succ 3)"), "ap (refl) == refl (f x)");
ok(eq("trans nat 3 3 (λx:nat. nat) (refl 3) 7", "7"), "trans (refl) v == v");
ok(eq("inveq nat 3 3 (refl 3)", "refl 3"), "inveq (refl) == refl");
ok(eq("compeq nat 3 3 3 (refl 3) (refl 3)", "refl 3"), "compeq (refl) q == q");
ok(!eq("succ 2", "4"), "succ 2 != 4");

// ===== 用户定义 =====
console.log("===== 用户定义 =====");
const def = (s) => { try { return astToString(core.define(s.split(":=")[0].trim(), p(s.slice(s.indexOf(":=") + 2).trim()))); } catch (e) { return "ERR:" + e.message; } };
ok(def("twice := λx:nat. add x x") === "Πx:nat.nat", "twice := λx:nat. add x x : nat→nat（实际 " + def("twice := λx:nat. add x x") + "）");
ok(eq("twice 5", "10"), "twice 5 == 10");
ok(def("odd := λx:nat. ind_Bool (λy:Bool. nat) 1 0") === "Πx:nat.Πx:Bool.nat", "odd : nat→Bool→nat（实际 " + def("odd := λx:nat. ind_Bool (λy:Bool. nat) 1 0") + "）");

// ===== 命令入口（run） =====
console.log("===== 命令入口 =====");
const run = (s) => { try { const r = core.run(p(s)); return r.kind + (r.kind === "define" || r.kind === "infer" ? ":" + astToString(r.type) : ""); } catch (e) { return "ERR:" + e.message; } };
ok(run("x := true") === "define:True", "x := true -> define:True（实际 " + run("x := true") + "）");
ok(run("y := true : True") === "define:True", "y := true : True -> define:True（实际 " + run("y := true : True") + "）");
ok(run("succ 0 : nat") === "type-assert", "succ 0 : nat 断言通过（实际 " + run("succ 0 : nat") + "）");
ok(run("add 2 3 == 5") === "eq-assert", "add 2 3 == 5 断言通过（实际 " + run("add 2 3 == 5") + "）");
ok(run("add 2 3") === "infer:nat", "add 2 3 推断 -> infer:nat（实际 " + run("add 2 3") + "）");
// run 吞掉异常（返回 ERR: 前缀），断言失败用例改查返回串
const err = (s) => run(s).startsWith("ERR:");
ok(err("true : nat"), "true : nat 应失败（实际 " + run("true : nat") + "）");
ok(err("add 2 3 == 6"), "add 2 3 == 6 应失败（实际 " + run("add 2 3 == 6") + "）");
ok(err("nope 0"), "未知常量 nope 应失败（实际 " + run("nope 0") + "）");

// ===== scheme 多态（隐式参数） =====
console.log("===== scheme 多态 =====");
// rflx := refl ?x —— 推断类型 eq ?a ?x ?x 含未解元变量 → 注册为多态 scheme
const rflxRun = run("rflx := refl ?x");
ok(rflxRun.startsWith("define:"), "rflx := refl ?x 定义成功（实际 " + rflxRun + "）");
// 同一 scheme 常量在不同类型处复用：每次实例化新元变量并由期望类型反解
ok(run("rflx : eq 3 3") === "type-assert", "rflx : eq 3 3 通过（实际 " + run("rflx : eq 3 3") + "）");
ok(run("rflx : eq 0b 0b") === "type-assert", "rflx : eq 0b 0b 通过（可复用多态）（实际 " + run("rflx : eq 0b 0b") + "）");
ok(run("rflx : eq (succ 2) (succ 2)") === "type-assert", "rflx : eq (succ 2) (succ 2) 通过（实际 " + run("rflx : eq (succ 2) (succ 2)") + "）");
// 推断类型保留元变量形式
const rflxType = infer("rflx");
ok(/^eq \?[a-z] \?[a-z]$/.test(rflxType), "infer(rflx) = eq ?a ?x（实际 " + rflxType + "）");
// 定义引用 scheme 常量：嵌套 scheme
const rflx2Run = run("rflx2 := rflx");
ok(rflx2Run.startsWith("define:"), "rflx2 := rflx 定义成功（嵌套 scheme）（实际 " + rflx2Run + "）");
ok(run("rflx2 : eq 5 5") === "type-assert", "rflx2 : eq 5 5 通过（实际 " + run("rflx2 : eq 5 5") + "）");
// 显式类型：带类型断言的定义（类型元变量由期望类型求解）
ok(run("e3 := refl 1 : eq 1 1") === "define:eq 1 1", "e3 := refl 1 : eq 1 1 通过（实际 " + run("e3 := refl 1 : eq 1 1") + "）");
ok(run("e3 : eq 1 1") === "type-assert", "e3 : eq 1 1 通过（实际 " + run("e3 : eq 1 1") + "）");
// 泛化健全性：元变量不出现在推断类型中 → 无法泛化，拒绝定义
ok(err("t := pair ?a ?C ?x ?y"), "t := pair ?a ?C ?x ?y 应失败（?x ?y 不在类型中无法泛化）（实际 " + run("t := pair ?a ?C ?x ?y") + "）");
// 回归：原定义/断言/计算不受影响
ok(run("twice := λx:nat. add x x") === "define:Πx:nat.nat", "回归：twice 定义仍正常（实际 " + run("twice := λx:nat. add x x") + "）");
ok(run("twice 5 == 10") === "eq-assert", "回归：twice 5 == 10 仍正常（实际 " + run("twice 5 == 10") + "）");

// ===== 全量移植定义验证 =====
console.log("===== 全量移植定义 =====");
const t2 = (s) => { try { return astToString(core.infer(p(s))); } catch (e) { return "ERR:" + e.message; } };
// nat 扩展
ok(t2("factorial") === "Πn:nat.nat", "factorial : nat→nat（实际 " + t2("factorial") + "）");
ok(eq("factorial 4", "24"), "factorial 4 == 24");
// False/not
ok(t2("not") === "Πa:𝒰?a.𝒰?a", "not : Πa:U.a→False（实际 " + t2("not") + "）");
// Z 定理
ok(t2("pred_succZ") === "Πm:Z.eq predZ succZ m m", "pred_succZ（实际 " + t2("pred_succZ") + "）");
ok(t2("succ_predZ") === "Πm:Z.eq succZ predZ m m", "succ_predZ（实际 " + t2("succ_predZ") + "）");
ok(t2("negZ") === "Πm:Z.Z", "negZ : Z→Z（实际 " + t2("negZ") + "）");
ok(t2("mulZ") === "Πx:Z.Πm:Z.Z", "mulZ : Z→Z→Z（实际 " + t2("mulZ") + "）");
ok(eq("mulZ (pos 3) (neg 0)", "negZ (pos 3)"), "mulZ (pos 3) (neg 0) == negZ (pos 3)");
// Even
ok(eq("ind_Even (λx:nat. λe:Even x. nat) 0 (λx:nat. λe:Even x. λh:nat. succ h) 4 (evenss 2 (evenss 0 even0))", "2"), "ind_Even 计算");
// Aleph / NW（宇宙层级多态：族返回 U 时层级上浮）
ok(t2("Aleph") === "Πn:nat.𝒰", "Aleph（实际 " + t2("Aleph") + "）");
ok(t2("NW") === "𝒰", "NW : U（实际 " + t2("NW") + "）");
// Ord
ok(t2("natO") === "Πn:nat.Ord", "natO : Ord（实际 " + t2("natO") + "）");
ok(t2("omega") === "Ord", "omega : Ord（实际 " + t2("omega") + "）");
ok(t2("leqO") === "Πx:Ord.Ord→𝒰", "leqO（实际 " + t2("leqO") + "）");
ok(t2("addO") === "Πx:Ord.Ord→Ord", "addO（实际 " + t2("addO") + "）");
// eqv / ua / LEM / fnext
ok(t2("eqv") === "Πa:𝒰.Πb:𝒰.𝒰", "eqv : U→U→U（实际 " + t2("eqv") + "）");
ok(t2("eqvrefl") === "Πa:𝒰.Σz:a→a.Σ_:Σg:a→a.Πx:a.eq x g z x.Σh:a→a.Πx:a.eq x z h x", "eqvrefl（实际 " + t2("eqvrefl") + "）");
ok(t2("id2eqv") === "Πa:𝒰?a.Πb:𝒰?a.eq a b→eqv a b", "id2eqv（实际 " + t2("id2eqv") + "）");
ok(t2("ua") === "Πa:𝒰?a.Πb:𝒰?a.eqv a b→eq a b", "ua（实际 " + t2("ua") + "）");
ok(t2("LEM") === "Πa:𝒰?a.Sum Trunc a not Trunc a", "LEM（实际 " + t2("LEM") + "）");
ok(t2("fnext") === "Πa:𝒰?a.ΠC:a→𝒰?b.Πf:Πx:a.C x.Πg:Πx:a.C x.(Πx:a.eq f x g x)→eq f g", "fnext : 函数外延性（实际 " + t2("fnext") + "）");
ok(t2("happly") === "Πa:𝒰?a.ΠC:a→𝒰?b.Πf:Πx:a.C x.Πg:Πx:a.C x.eq f g→(Πx:a.eq f x g x)", "happly（实际 " + t2("happly") + "）");
// S1
ok(t2("loop") === "eq base base", "loop : eq base base（实际 " + t2("loop") + "）");
ok(t2("loop_pow") === "Πm:Z.eq base base", "loop_pow : Z→(base=base)（实际 " + t2("loop_pow") + "）");
ok(t2("code_S1") === "S1→𝒰", "code_S1 : S1→U（实际 " + t2("code_S1") + "）");
ok(t2("rec_S1") === "Πa:𝒰.Πcb:a.Πcl:eq cb cb.Πm:S1.a", "rec_S1（实际 " + t2("rec_S1") + "）");
ok(eq("rec_S1 nat 3 (refl 3) base", "3"), "rec_S1 nat 3 (refl 3) base == 3");
ok(eq("loop_pow (pos 0)", "loop"), "loop_pow (pos 0) == loop");
ok(eq("code_S1 base", "Z"), "code_S1 base == Z");
// S2 / I / Sus / Pushout / Trunc
ok(t2("surf") === "eq refl base2 refl base2", "surf（实际 " + t2("surf") + "）");
ok(t2("segI") === "eq 0I 1I", "segI : eq 0I 1I（实际 " + t2("segI") + "）");
ok(t2("merid") === "Πa:𝒰?a.Πx:a.eq North a South a", "merid（实际 " + t2("merid") + "）");
ok(t2("Join") === "Πa:𝒰.Πb:𝒰.𝒰", "Join : U→U→U（实际 " + t2("Join") + "）");
ok(t2("Wedge") === "Πa:𝒰.Πb:𝒰.Πxa:a.Πxb:b.𝒰", "Wedge（实际 " + t2("Wedge") + "）");
ok(t2("S3") === "𝒰", "S3 : U（实际 " + t2("S3") + "）");
ok(t2("ctorTrunc") === "Πa:𝒰?a.a→Trunc a", "ctorTrunc（实际 " + t2("ctorTrunc") + "）");
// 宇宙层级：族的层级上浮（ind_nat C 返回 U 时 u := @1）
ok(run("lvl_test := ind_nat (λx:nat. U) nat (λx:nat. λx:U. x→Bool)") === "define:Πn:nat.𝒰", "ind_nat 族返回 U（层级上浮）（实际 " + run("lvl_test := ind_nat (λx:nat. U) nat (λx:nat. λx:U. x→Bool)") + "）");

console.log(`\n===== 结果: ${pass} 通过, ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
