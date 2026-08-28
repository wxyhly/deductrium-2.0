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
            } catch (e) { console.log(`规则 ${name} 加载失败:`, JSON.stringify(e)); }
            finally { sys.clear(); }
        }
    });
};
addRules(initialCreativeRules);
addRules(initialSurvivalRules);

// 探索1：v<a4(<a6) 组合（用户例子）
try {
    const c = sys.getD(parser.parse("v<a4(<a6)", 'dname'));
    console.log('v<a4(<a6):', c.toString());
    console.log('  断言:', c.assertions.map(e => JSON.stringify(e)).join(' | '));
    console.log('  nameMap:', JSON.stringify(Object.fromEntries(Object.entries(c.nameMap || {}).map(([k, v]) => [k, v.toString()]))));
    console.log('  step 数:', c.step?.length);
    if (c.step) {
        for (const sp of c.step) console.log('    step:', sp.getCmd());
    }
} catch (e) { console.log('v<a4(<a6) 失败:', JSON.stringify(e, null, 2)); }

// 探索2：v:t(<a6,<a6) 组合
try {
    const c = sys.getD(parser.parse("v.t(<a6,<a6)", 'dname'));
    console.log('\nv.t(<a6,<a6):', c.toString());
    console.log('  断言:', c.assertions.map(e => JSON.stringify(e)).join(' | '));
    console.log('  nameMap:', JSON.stringify(Object.fromEntries(Object.entries(c.nameMap || {}).map(([k, v]) => [k, v.toString()]))));
    console.log('  step 数:', c.step?.length);
    if (c.step) {
        for (const sp of c.step) console.log('    step:', sp.getCmd());
    }
} catch (e) { console.log('v.t(<a6,<a6) 失败:', JSON.stringify(e, null, 2)); }

// 探索3：v:mp(<a6,<a6) 组合
try {
    const c = sys.getD(parser.parse("v:mp(<a6,<a6)", 'dname'));
    console.log('\nv:mp(<a6,<a6):', c.toString());
} catch (e) { console.log('v:mp(<a6,<a6) 失败:', JSON.stringify(e, null, 2)); }
