import { HilbertSystem } from './js/hs/core/core.js';
import { HSParser } from './js/hs/core/parser.js';
import { Deduction } from './js/hs/core/deduction.js';
import { AST } from './js/hs/core/ast.js';
import { NodeType } from './js/asttype.js';
import { AtomSolver } from './js/hs/core/assert.js';

const parser = new HSParser();
const sys = new HilbertSystem();
const addRules = (data) => {
    data.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//")).forEach(e => {
        const name = e.slice(0, e.indexOf(":")).trim();
        let rest = e.slice(e.indexOf(":") + 1).trim();
        let steps = "";
        if (rest.startsWith("ax:")) {
            rest = rest.slice(3);
        } else {
            steps = rest.slice(rest.indexOf(";") + 1);
            rest = rest.slice(0, rest.indexOf(";"));
        }
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
.i:⊢$→$; a1 $ $; a1 $ $→$; a2 $ $→$ $; mp 3 2; mp 4 1;
.t:$1→$2,$2→$3⊢$1→$3; hyp $1→$2;hyp $2→$3;cond $1;d mp 1 3;d mp 2 4;
.ne:⊢¬¬$→$;cond ¬¬$;d <a1 1 ¬¬¬¬$;d <a3 2;d <a3 3;d mp 4 1;
.ni:⊢$→¬¬$;d .ne ¬$;d <a3 1;
.m:⊢¬$1→$1→$2;d a1 ¬$1 ¬$2;d c<a3 1;
`);

const dump = (arr, indent = "") => {
    for (const p of arr) {
        console.log(indent + p.id + ":" + p.ast.toString() + "[" + p.from.type + "]");
        if (p.children) dump(p.children, indent + "  ");
    }
};

// 测试辅助：应用规则并返回结论（构造 props）
const testRule = (name, cmds, expect) => {
    sys.clear();
    sys.fromCmd(cmds.map(e => parser.parse(e, "cmd")));
    const conc = sys.checkConclusionInPropList().conclusion;
    const ok = conc.toString() === expect;
    console.log(`[${ok ? "OK" : "NO"}] ${name} → ${conc.toString()}  (expect ${expect})`);
    if (!ok) dump(sys.props);
    return ok;
};

// ===== .a30: ⊢($0→$1)→(¬$1→¬$0) =====
const a30 = ["cond ($0→$1)", "cond (¬$1)", "d .ne $0", "d .ni $1", "d .t 3 1", "d .t 5 4", "d a3 ¬$0 ¬$1", "d .t 7 6"];
testRule(".a30", a30, "($0→$1)→(¬$1→¬$0)");

// ===== .a31: ⊢(¬$0→$1)→(¬$1→$0) =====
const a31 = ["cond (¬$0→$1)", "cond (¬$1)", "d .ni $1", "d .t 1 3", "d a3 $0 ¬$1", "d .t 5 4"];
testRule(".a31", a31, "(¬$0→$1)→(¬$1→$0)");

// ===== .a32: ⊢($0→¬$1)→($1→¬$0)（依赖 .a30） =====
// 先注册 .a30
sys.rules.set(".a30", new Deduction(new Set, new AST(NodeType.ATOM_DNAME, ".a30"), [], [], parser.parse("($0→$1)→(¬$1→¬$0)", 'wff'), []));
const a32 = ["cond ($0→¬$1)", "d .a30 $0 ¬$1", "d .t 2 1", "d .ni $1", "d .t 4 3"];
testRule(".a32", a32, "($0→¬$1)→($1→¬$0)");

// ===== .mn: ⊢(¬$0→$0)→$0 =====
const mn = ["cond (¬$0→$0)", "d .m $0 ¬$0", "d mp 2 1", "d mp 1 3"];
testRule(".mn", mn, "(¬$0→$0)→$0");

// ===== .m&1: ⊢¬($0→$1)→$0 =====
const m1 = ["d .m $0 $1", "d .ni ($0→$1)", "d .t 1 2", "d a3 $0 ¬($0→$1)", "d .t 4 3"];
testRule(".m&1", m1, "¬($0→$1)→$0");

// ===== .m&2: ⊢¬($0→$1)→¬$1 =====
const m2 = ["d a1 $1 $0", "d .ne $1", "d .ni ($0→$1)", "d .t 2 1", "d .t 3 4", "d a3 ¬$1 ¬($0→$1)", "d mp 6 5"];
testRule(".m&2", m2, "¬($0→$1)→¬$1");

process.exit(0);
