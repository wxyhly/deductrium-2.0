// 探索 .\acn<> 规则行为，设计 mcnt 替换点位步骤生成
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { AtomSolver } from '../js/hs/core/assert.js';
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

const dump = (arr, indent = "") => {
    for (const p of arr) {
        let extra = "";
        if (p.from.type === "d") extra = " conds=" + p.from.data.conditions.map(c => c.id + ":" + c.ast.toString()).join(",") + " rv=" + JSON.stringify(Object.fromEntries(Object.entries(p.from.data.replaceValues).map(([k, v]) => [k, v.toString()])));
        console.log(indent + p.id + ":" + p.ast.toString() + "[" + p.from.type + "]" + extra);
        if (p.children) dump(p.children, indent + "  ");
    }
};

// 1. .\acn<> 规则本身
try {
    const r = sys.getD(parser.parse(".\acn<>", 'dname'));
    console.log('.\acn<>:', r.toString());
    console.log('.\acn<> replaceNames:', r.replaceNames.map(([n, isItem]) => n + (isItem ? '(item)' : '(wff)')).join(','));
    console.log('.\acn<> step:');
    if (r.step) for (const sp of r.step) console.log('  ', sp.getCmd());
} catch (e) { console.log('.\acn<> getD 失败:', JSON.stringify(e, null, 2)); }

// 2. .<>t 规则
try {
    const r = sys.getD(parser.parse(".<>t", 'dname'));
    console.log('\n.<>t:', r.toString());
    console.log('.<>t step:');
    if (r.step) for (const sp of r.step) console.log('  ', sp.getCmd());
} catch (e) { console.log('.<>t getD 失败:', JSON.stringify(e, null, 2)); }

// 3. 应用 .\acn<>：∀x:x=y ⊢ ∀z:#sb(x=y,x,z)
sys.clear();
try {
    sys.hyp(parser.parse("∀x:x=y", 'wff'));
    const r = sys.getD(parser.parse(".\acn<>", 'dname'));
    const p = sys.d(r, [sys.getP("1")], { $a: parser.parse("x", 'item'), $: parser.parse("x=y", 'wff'), $b: parser.parse("z", 'item') });
    console.log('\n应用 .\acn<> x (x=y) z →', p.ast.toString());
} catch (e) { console.log('应用 .\acn<> 失败:', JSON.stringify(e, null, 2)); }

// 4. 应用 >.\acn<>：⊢ ∀x:x=y → ∀z:#sb(x=y,x,z)
sys.clear();
try {
    const r = sys.getD(parser.parse(">.\acn<>", 'dname'));
    console.log('\n>.\acn<>:', r.toString(), '| step:', r.step?.length);
    const p = sys.d(r, [], { $a: parser.parse("x", 'item'), $: parser.parse("x=y", 'wff'), $b: parser.parse("z", 'item') });
    console.log('应用 >.\acn<> x (x=y) z →', p.ast.toString());
} catch (e) { console.log('应用 >.\acn<> 失败:', JSON.stringify(e, null, 2)); }

// 5. 反向：>.\acn<> z #sb(x=y,x,z) x → ∀z:#sb(x=y,x,z) → ∀x:x=y
sys.clear();
try {
    const r = sys.getD(parser.parse(">.\acn<>", 'dname'));
    const p = sys.d(r, [], { $a: parser.parse("z", 'item'), $: parser.parse("#sb(x=y,x,z)", 'wff'), $b: parser.parse("x", 'item') });
    console.log('\n反向应用 >.\acn<> z #sb(x=y,x,z) x →', p.ast.toString());
} catch (e) { console.log('反向应用 >.\acn<> 失败:', JSON.stringify(e, null, 2)); }

// 6. 组合：.<> 得到双向
sys.clear();
try {
    sys.hyp(parser.parse("#nf(x=y,z)", 'wff'));
    const r = sys.getD(parser.parse(">.\acn<>", 'dname'));
    const fwd = sys.d(r, [], { $a: parser.parse("x", 'item'), $: parser.parse("x=y", 'wff'), $b: parser.parse("z", 'item') });
    const rev = sys.d(r, [], { $a: parser.parse("z", 'item'), $: parser.parse("#sb(x=y,x,z)", 'wff'), $b: parser.parse("x", 'item') });
    const iff = sys.d(sys.getD(parser.parse(".<>", 'dname')), [fwd, rev], {});
    console.log('\n.<> 组合:', iff.ast.toString());
    console.log('dump:');
    dump(sys.props);
} catch (e) { console.log('组合失败:', JSON.stringify(e, null, 2)); }
