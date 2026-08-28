// 精确定位：断言检查内部逐步追踪
// 关键问题：规则2 (nf c b D2 ∧ D1⊆D2 ⇒ nf #sb(a,b,c,D1) b D2) 是否因缺少 continue 而失败？
import { AtomSolver, NFAssertion, Assertion } from '../js/hs/core/assert.js';
import { HSParser } from '../js/hs/core/parser.js';

const parser = new HSParser();
const nf = (name, vs, qs = []) => ({ type: "nf", name, vs: new Set(vs), qs: new Set(qs) });

// 追踪规则2的内部步骤：premises=[nf($,$b),nf($b,$a)]，a = NFAssertion(#sb($,$a,$b),{$a},{})
const premises = [nf("$", ["$b"]), nf("$b", ["$a"])];
const a = new NFAssertion(parser.parse("#sb($,$a,$b)", 'wff'), new Set(["$a"]), new Set());
const [body, src, dst, qsNodes] = a.ast.nodes;
console.log('body:', body.toString(), 'src:', src.toString(), 'dst:', dst.toString(), 'qsNodes:', qsNodes.toString());

// 规则1：nf a B D2 ∧ nf c B D2 ⇒ nf #sb(a,b,c,D1) B D2
const subres = new NFAssertion(body, a.vs, a.qs).reduce();
new NFAssertion(dst, a.vs, a.qs).reduce(subres);
console.log('规则1 subres atoms:', subres.atoms.map(x => `${x.name} vs=${[...x.vs]}`).join(' | '));
console.log('规则1 check passed:', Assertion.check(premises, subres).passed, '（期望 false：$ 中 $a 自由出现，未证）');

// 规则2：nf c b D2 ∧ D1 ⊆ D2 ⇒ nf #sb(a,b,c,D1) b D2
console.log('\na.vs.has(src.name):', a.vs.has(src.name), '（期望 true）');
const inner = new NFAssertion(dst, new Set([src.name]), a.qs).reduce();
console.log('规则2 内层 check（nf($b,{$a}) 从 premises）:', Assertion.check(premises, inner).passed, '（期望 true）');
console.log('规则2 内层 AtomSolver.check:', AtomSolver.check(premises, inner.atoms).passed);

// 模拟规则2成功后的控制流：
// 成功 → reducedA 压回 res.asts → 但随后落入 undetermined = true; break;
const reducedA = a.clone();
reducedA.vs.delete(src.name);
console.log('\n规则2 成功后 reducedA.vs:', [...reducedA.vs], '（应为空=恒真）');
console.log('但代码继续执行到 undetermined = true; break → 返回 {passed:false} ← 这就是bug');

// 验证：如果手动跳过 reducedA（空 vs 恒真），最终应通过
const res2 = { asts: [a], atoms: [] };
// 模拟修正后的流程：规则2成功 → continue → 处理 reducedA（空vs）→ 第一规则检查通过 → 继续 → 结束
const fakeRes = { asts: [reducedA], atoms: [] };
console.log('\n修正后（reducedA 空vs 单独检查）:', Assertion.check(premises, fakeRes).passed, '（期望 true）');
