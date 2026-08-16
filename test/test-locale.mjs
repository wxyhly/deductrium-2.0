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
`);

// 录制 s1：d a6 $1=$2 #x; d .t(#,a4) 1 #y
const showErr = (e) => console.log('错误:', JSON.stringify(e, (k, v) => v instanceof Set ? [...v] : v instanceof Map ? [...v] : v));
try {
    console.log('== 2. 应用 a6 ==');
    // a6: #nf($,$x) ⊢ $→∀$x:$，断言自动生成 #nf($1=$2,#x)（#x 不在 $1=$2 中自由出现 → 成立）
    const p1 = sys.d(sys.getD(parser.parse("a6", 'dname')), [], { $: parser.parse("$1=$2", 'wff'), $x: parser.parse("#x", 'item') });
    console.log('p1:', p1.ast.toString());
    console.log('== 3. 组合规则 .t(#,a4) ==');
    const lt = sys.getD(parser.parse(".t(#,a4)", 'dname'));
    console.log('lt:', lt.toString(), 'replaceNames:', JSON.stringify(lt.replaceNames));
    const p2 = sys.d(lt, [p1], { [lt.replaceNames[0][0]]: parser.parse("#y", 'item') });
    console.log('p2:', p2.ast.toString());
    console.log('== 4. 录制 s1 ==');
    sys.m('s1');
    console.log('s1 录制成功');
    const s1 = sys.rules.get('s1');
    console.log('s1:', s1.toString());
    for (const sp of s1.step) {
        if (sp.from.type === 'd') console.log('  step d:', sp.from.data.deduction.toString(), 'rv:', Object.entries(sp.from.data.replaceValues).map(([k,v]) => k+'='+v.toString()).join(', '));
    }
    console.log('== 5. 使用 d s1 #x+#y $2 ==');
    sys.clear();
    // s1: ⊢$1=$2→$1=$2，replaceNames $1,$2
    const use = sys.d(s1, [], { $1: parser.parse("#x+#y", 'item'), $2: parser.parse("#z", 'item') });
    console.log('使用 s1 结果:', use.ast.toString());
    console.log('== 6. 肢解 ==');
    try {
        const nf = sys.expand(use);
        console.log('肢解成功, 新文件夹:', nf.length);
        for (const p of sys.props) {
            if (p.from.type === 'd') console.log('  结果 d:', p.from.data.deduction.toString(), 'ast:', p.ast.toString());
            else console.log('  结果', p.from.type, p.ast.toString());
        }
        const a6ast = sys.props.find(p => p.from.type === 'd' && p.from.data.deduction.toString() === 'a6').ast.toString();
        console.log('a6ast:', a6ast);
    } catch (e) {
        console.log('肢解失败:', JSON.stringify(e, (k, v) => v instanceof Set ? [...v] : v instanceof Map ? [...v] : v));
    }
    console.log('== 7. 表中已有 #x1 时重命名为 #x2 ==');
    sys.clear();
    const use2 = sys.d(s1, [], { $1: parser.parse("#x1+#y", 'item'), $2: parser.parse("#z", 'item') });
    console.log('使用 s1 结果2:', use2.ast.toString());
    try {
        sys.expand(use2);
        for (const p of sys.props) {
            if (p.from.type === 'd') console.log('  结果2 d:', p.from.data.deduction.toString(), 'ast:', p.ast.toString());
            else console.log('  结果2', p.from.type, p.ast.toString());
        }
    } catch (e) {
        console.log('肢解2失败:', JSON.stringify(e, (k, v) => v instanceof Set ? [...v] : v instanceof Map ? [...v] : v));
    }
    console.log('== 8. 无冲突时不重命名 ==');
    sys.clear();
    const use3 = sys.d(s1, [], { $1: parser.parse("a+b", 'item'), $2: parser.parse("c", 'item') });
    console.log('使用 s1 结果3:', use3.ast.toString());
    try {
        sys.expand(use3);
        for (const p of sys.props) {
            if (p.from.type === 'd') console.log('  结果3 d:', p.from.data.deduction.toString(), 'ast:', p.ast.toString());
            else console.log('  结果3', p.from.type, p.ast.toString());
        }
    } catch (e) {
        console.log('肢解3失败:', JSON.stringify(e, (k, v) => v instanceof Set ? [...v] : v instanceof Map ? [...v] : v));
    }
    console.log('== 9. 表中已有 #x 和 #x1，模板 #x 应重命名为 #x2 ==');
    sys.clear();
    // 先用含 #x、#x1 的 wff 建立上下文
    sys.hyp(parser.parse("#x=#x", 'wff'));
    sys.hyp(parser.parse("#x1=#x1", 'wff'));
    const use4 = sys.d(s1, [], { $1: parser.parse("a+b", 'item'), $2: parser.parse("c", 'item') });
    console.log('使用 s1 结果4:', use4.ast.toString());
    try {
        sys.expand(use4);
        for (const p of sys.props) {
            if (p.from.type === 'd') console.log('  结果4 d:', p.from.data.deduction.toString(), 'ast:', p.ast.toString());
            else console.log('  结果4', p.from.type, p.ast.toString());
        }
    } catch (e) {
        console.log('肢解4失败:', JSON.stringify(e, (k, v) => v instanceof Set ? [...v] : v instanceof Map ? [...v] : v));
    }
} catch (e) {
    console.log('整体失败:', JSON.stringify(e, (k, v) => v instanceof Set ? [...v] : v instanceof Map ? [...v] : v));
}
