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
.i:⊢$→$; a1 $ $; a1 $ $→$; a2 $ $→$ $; mp 3 2; mp 4 1;
.t:$1→$2,$2→$3⊢$1→$3; hyp $1→$2;hyp $2→$3;cond $1;d mp 1 3;d mp 2 4;
`);
const ct = sys.getD(parser.parse("c:.t", 'dname'));
console.log('c.t step len:', ct.step?.length);
ct.step?.forEach((p, i) => { console.log(i, p.from.type, p.ast.toString(), 'children:', p.children?.length || 0); });
const vt = sys.getD(parser.parse("v:.t", 'dname'));
console.log('v.t step len:', vt.step?.length);
vt.step?.forEach((p, i) => { console.log(i, p.from.type, p.ast.toString(), 'children:', p.children?.length || 0); });
