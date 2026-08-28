import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { AtomSolver } from '../js/hs/core/assert.js';

const p = new HSParser(); const s = new HilbertSystem();
const addRules = data => data.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//")).forEach(e => {
  const name = e.slice(0, e.indexOf(":")).trim();
  let rest = e.slice(e.indexOf(":") + 1).trim();
  let steps = "";
  if (rest.startsWith("ax:")) rest = rest.slice(3);
  else { steps = rest.slice(rest.indexOf(";") + 1); rest = rest.slice(0, rest.indexOf(";")); }
  const ast = p.parse(rest, 'rule');
  const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
  ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
  const rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), assertions, ast.nodes, ast.nodes.pop());
  s.rules.set(name, rule);
  if (steps) {
    s.fromCmd(steps.split(";").filter(e => e).map(e => p.parse(e, "cmd")));
    rule.step = s.props.slice(0);
    s.clear();
  }
});
addRules(`
mp:ax: $1→$2, $1 ⊢ $2;
a1:ax: ⊢$1→$2→$1;
a2:ax: ⊢($1→$2→$3)→($1→$2)→($1→$3);
.i:⊢$→$; a1 $ $; a1 $ $→$; a2 $ $→$ $; mp 3 2; mp 4 1;
`);
const di = s.getD(p.parse('.i', 'dname'));
console.log('.i step len:', di.step?.length);
console.log('.i step:', di.step?.map(x => x.from.type + ':' + x.ast.toString()));
const v = s.getD(p.parse('v:.i', 'dname'));
console.log('v:.i:', v.toString(), 'step:', v.step?.length);
if (v.step) console.log('v:.i step:', v.step.map(x => x.from.type + ':' + x.ast.toString()));

// 手动模拟 genQuantStep 无条件分支
const saved = s.saveContext();
s.loadContext(s.createEmptyContext());
try {
  s.clear();
  const vf = s.v(p.parse('$a', 'item'));
  console.log('after v:', s.props.map(x => x.from.type + ':' + x.ast.toString()));
  const cmds = s.genCmd(di.step);
  console.log('genCmd:', cmds);
  s.fromCmd(cmds.map(c => p.parse(c, 'cmd')));
  console.log('after replay:', s.props.map(x => x.id + ':' + x.from.type + ':' + x.ast.toString()).join(' | '));
} catch (e) {
  console.log('manual error:', e?.type ?? e, JSON.stringify(e?.cause));
}
s.loadContext(saved);
