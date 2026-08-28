// 复现：.\acn<> 反方向推理断言报错
// 步骤：hyp #nf($,$b); >.\acn<> $a $ $b; >.\acn<> $b #sb($,$a,$b) $a; .<> 2 3;
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { AtomSolver, NFAssertion, Assertion } from '../js/hs/core/assert.js';
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
            } catch (e) { console.log(`规则 ${name} 加载失败:`, JSON.stringify(e)); }
            finally { sys.clear(); }
        }
    });
};
addRules(initialCreativeRules);
addRules(initialSurvivalRules);

// 检查 .\acn<> 规则
const acn = sys.rules.get('.\\acn<>');
console.log('.\acn<>:', acn ? acn.toString() : 'NOT FOUND');
console.log('.\acn<> 断言:', acn?.assertions.map(a => JSON.stringify(a)).join(' | '));

// 用户步骤
sys.clear();
try {
    sys.hyp(parser.parse("#nf($,$b)", 'wff'));  // 1
    console.log('step1:', sys.getP("1").ast.toString());
    // 正方向：>.\acn<> $a $ $b
    const p2 = sys.d(sys.getD(parser.parse(">.\acn<>", 'dname')), [], {
        $a: parser.parse("$a", 'item'), $: parser.parse("$", 'wff'), $b: parser.parse("$b", 'item')
    });
    console.log('step2(正方向):', p2.ast.toString());
    // 反方向：>.\acn<> $b #sb($,$a,$b) $a
    const p3 = sys.d(sys.getD(parser.parse(">.\acn<>", 'dname')), [], {
        $a: parser.parse("$b", 'item'), $: parser.parse("#sb($,$a,$b)", 'wff'), $b: parser.parse("$a", 'item')
    });
    console.log('step3(反方向):', p3.ast.toString());
    // .<> 2 3
    const p4 = sys.d(sys.getD(parser.parse(".<>", 'dname')), [p2, p3], {});
    console.log('step4(<>):', p4.ast.toString());
} catch (e) {
    console.log('报错:', JSON.stringify(e, (k, v) => v instanceof Set ? [...v] : v, 2));
}

// 手动检查断言：context=[#nf($,$b)]，检查 #nf(#sb($,$a,$b), $a)
console.log('\n--- 手动断言检查 ---');
const premises = [{ type: "nf", name: "$", vs: new Set(["$b"]), qs: new Set() }];
const constraint = new NFAssertion(parser.parse("#sb($,$a,$b)", 'wff'), new Set(["$a"]), new Set()).reduce();
console.log('constraint atoms:', constraint.atoms.map(a => JSON.stringify(a)));
console.log('constraint asts:', constraint.asts.map(a => a.constructor.name + ' vs=' + JSON.stringify([...a.vs]) + ' ast=' + a.ast.toString()));
const checkRes = Assertion.check(premises, constraint);
console.log('check结果:', JSON.stringify(checkRes, (k, v) => v instanceof Set ? [...v] : v));
