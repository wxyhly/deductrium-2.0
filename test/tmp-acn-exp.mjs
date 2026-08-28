// 断言系统聚焦实验：
// 1) nf($b,{$a}) 能否从自身证明？
// 2) nf(#sb($,$a,$b),{$a}) 从 [nf($,$b)] 能否证明？
// 3) nf(#sb($,$a,$b),{$a}) 从 [nf($,$b), nf($b,$a)] 能否证明？
import { AtomSolver, NFAssertion, Assertion } from '../js/hs/core/assert.js';
import { HSParser } from '../js/hs/core/parser.js';

const parser = new HSParser();

const nf = (name, vs, qs = []) => ({ type: "nf", name, vs: new Set(vs), qs: new Set(qs) });
const dump = (label, res) => {
    console.log(label, '→', JSON.stringify(res, (k, v) => v instanceof Set ? [...v] : v));
};

// 实验1：nf($b,{$a}) 从自身
dump('1a. [nf($b,{$a})] ⊢ nf($b,{$a})', AtomSolver.check([nf("$b", ["$a"])], [nf("$b", ["$a"])]));
// 实验1b：空前提 ⊢ nf($b,{$a})
dump('1b. [] ⊢ nf($b,{$a})', AtomSolver.check([], [nf("$b", ["$a"])]));
// 实验1c：空前提 ⊢ nf($b,{$b}) （同一变量，应恒真？）
dump('1c. [] ⊢ nf($b,{$b})', AtomSolver.check([], [nf("$b", ["$b"])]));

// 实验2：从 [nf($,$b)] 证明 nf(#sb($,$a,$b), {$a})
{
    const premises = [nf("$", ["$b"])];
    const constraint = new NFAssertion(parser.parse("#sb($,$a,$b)", 'wff'), new Set(["$a"]), new Set()).reduce();
    dump('2. [nf($,$b)] ⊢ nf(#sb($,$a,$b),{$a})', Assertion.check(premises, constraint));
}

// 实验3：从 [nf($,$b), nf($b,$a)] 证明 nf(#sb($,$a,$b), {$a})
{
    const premises = [nf("$", ["$b"]), nf("$b", ["$a"])];
    const constraint = new NFAssertion(parser.parse("#sb($,$a,$b)", 'wff'), new Set(["$a"]), new Set()).reduce();
    dump('3. [nf($,$b),nf($b,$a)] ⊢ nf(#sb($,$a,$b),{$a})', Assertion.check(premises, constraint));
}

// 实验4：单独 nf 原子检查（底层 solver）
dump('4a. [nf($,$b)] ⊢ nf($,{$a})', AtomSolver.check([nf("$", ["$b"])], [nf("$", ["$a"])]));
dump('4b. [nf($,$b)] ⊢ nf($b,{$a})', AtomSolver.check([nf("$", ["$b"])], [nf("$b", ["$a"])]));
dump('4c. [nf($,$b)] ⊢ nf($b,{$b})', AtomSolver.check([nf("$", ["$b"])], [nf("$b", ["$b"])]));
dump('4d. [] ⊢ nf($b,{$b})', AtomSolver.check([], [nf("$b", ["$b"])]));
dump('4e. [] ⊢ nf($b,{$a})', AtomSolver.check([], [nf("$b", ["$a"])]));
