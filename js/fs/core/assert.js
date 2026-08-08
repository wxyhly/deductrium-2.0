import { AtomSolver } from "./assertsolver.js";
export function test() {
    function parse(str) {
        const k = str.trim().split(" ");
        return {
            type: k[0], name: k[1],
            vs: k[0] === "nf" ? new Set(k[2]?.split(",")) : k[0] === 'dt' || k[0] === 'ex' ? new Set(k[1]?.split(",")) : undefined,
            qs: k[0] === "nf" ? new Set(k[3]?.split(",")) : new Set(k[2]?.split(","))
        };
    }
    function p(cond, conc, expect) {
        const v = AtomSolver.check(cond.split("&").map(parse), conc.split("&").map(parse));
        console.log(v.passed === expect ? "[ok] " : "[no] ", cond, (!AtomSolver.isSatisfiable(cond.split("&").map(parse)) ? "[x]" : "") + "=>" + (!AtomSolver.isSatisfiable(conc.split("&").map(parse)) ? "[x]" : ""), conc, " : ", v.passed, v.counterexample); // true
    }
    p("ex $a #b", "ex $a $b", true);
    p("ex $a $b", "ex $a $b", true);
    p("nf a b", "ex $a $b", false);
    p("nf a $a & of $a $b ", "ex $a $b", true);
    p("of $a $b", "ex $a $b", true);
    p("nf e $b & of $a", "nf a a", false);
    p("nf e $a & of $a", "nf a a", true);
    p("nf e f", "nf a $b", false);
    p("nf e e", "nf a $b", true);
    p("nf e e", "nf #a $b", true);
    p("nf e #k", "nf #a $b", true);
    p("nf a b", "nf a b c", true);
    p("nf $a $b", "nf $a $b $c", true);
    p("nf $a $b", "nf $a $c", false);
    p("nf $a $b $b", "nf $a $b", false);
    p("nf $a $b,$c", "nf $a $d $a", true);
    p("nf $a $d $a", "nf $a $b,$c", false);
    p("nf $a $b & nf $a $c", "nf $a $b,$c", true);
    p("nf $a $b,$c", "nf $a $b & nf $a $c", true);
    p("of $a $b,$c", "nf $a $b", false);
    p("of $a", "nf $a $b", true);
    p("dt $1,$2", "nf $1 $2", true);
    p("nf a b", "nf $1 $1 $2 & dt $1,$2", false);
    p("nf a b", "nf $1 $1 $2 & dt $1,$3", false);
    p("nf $1 $1 $2 & dt $1,$2", "nf a b", true);
    p("nf $1 $1 $2 & dt $1,$2", "nf a a", true);
    p("nf $1 $1 $2 & dt $1,$3", "nf a b", true);
    p("dt c d", "nf a b", true);
    p("nf $1 $1 $2", "nf a b", true);
    p("nf $1 $1 $2", "nf a a", false);
    p("of $a", "nf a a", false);
    p("of a", "nf a a", true);
    p("dt $1,$2", "nf $1 $1", false);
    p("nf $1 $2", "dt $1,$2", true);
    p("nf $1 $3", "dt $1,$2", false);
    p("nf $1 $3", "dt $1,#2", true);
    p("nf $1 $2", "nf $2 $1", true);
    p("nf $1 $2 & nf $1 $3 $2", "nf $3 $1", true);
    p("dt $1,$2 & dt $3,$4 & nf $2 $3 $4", "nf $3 $1 $4", false);
    p("nf $f $1,$2,$3,$4,$5,$6,$7,$8 & nf $a $b & nf $a $c", "nf $f $3 $9", true);
}
//# sourceMappingURL=assert.js.map