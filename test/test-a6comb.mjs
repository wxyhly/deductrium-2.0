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
        if (rest.startsWith("ax:")) rest = rest.slice(3);
        const ast = parser.parse(rest, 'rule');
        const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
        ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
        const rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), assertions, ast.nodes, ast.nodes.pop());
        sys.rules.set(name, rule);
    });
};
addRules(`
mp:ax: $1→$2, $1 ⊢ $2;
a1:ax: ⊢$1→$2→$1;
a6:ax: #nf($,$x) ⊢ $→∀$x:$;
`);

const getD = (s) => sys.getD(parser.parse(s, 'dname'));

console.log("===== <a6(a1) =====");
try {
    const d = getD("<a6(a1)");
    console.log("  rule:", d.toString());
    console.log("  assertions:", d.assertions.map(a => JSON.stringify(a)).join(" | "));
    console.log("  assertion count:", d.assertions.length);
    console.log("  step count:", d.step?.length);
} catch (e) {
    console.log("  ERROR:", e?.cause?.message || e?.cause || JSON.stringify(e));
}

console.log("\n===== a6(a1) =====");
try {
    const d = getD("a6(a1)");
    console.log("  rule:", d.toString());
    console.log("  assertions:", d.assertions.map(a => JSON.stringify(a)).join(" | "));
} catch (e) {
    console.log("  ERROR:", e?.cause?.message || e?.cause || JSON.stringify(e));
}

console.log("\n===== mp(a6,#) 断言去重 =====");
try {
    const d = getD("mp(a6,#)");
    console.log("  rule:", d.toString());
    console.log("  assertions:", d.assertions.map(a => JSON.stringify(a)).join(" | "));
} catch (e) {
    console.log("  ERROR:", e?.cause?.message || e?.cause || JSON.stringify(e));
}
