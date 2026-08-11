import { NodeType } from "../asttype.js";
import { AtomSolver } from "./core/assert.js";
import { AST } from "./core/ast.js";
import { Deduction } from "./core/deduction.js";
import { HSParser } from "./core/parser.js";
export class Serde {
    hsLayer;
    hs;
    ruleList;
    pv;
    rv;
    constructor(hsLayer, hs, ruleList, pv, rv) {
        this.hsLayer = hsLayer;
        this.hs = hs;
        this.ruleList = ruleList;
        this.pv = pv;
        this.rv = rv;
    }
    serialize() {
        return {
            r: this.serializeRulelist(),
            p: this.serializeProplist(),
            pe: Array.from(this.pv.expandedFolders),
            re: Array.from(this.rv.expandedFolders),
            ri: this.rv.idCounter,
        };
    }
    deserialize(data) {
        this.deserializeRulelist(data.r);
        this.deserializeProplist(data.p);
        this.rv.idCounter = data.ri || 1;
        if (data.re)
            this.rv.expandedFolders = new Set(data.re);
        if (data.pe)
            this.pv.expandedFolders = new Set(data.pe);
        this.hsLayer.refresh();
    }
    serializeProplist() {
        // console.log(this.hs.genCmd().join(";"));
        return this.hs.genCmd().join(";");
    }
    deserializeProplist(data) {
        this.hs.clear();
        this.hs.fromCmd(data.split(";").filter(e => e.trim()).map(e => new HSParser().parse(e, "cmd")));
    }
    serializeRulelist() {
        const iter = (list) => {
            const data = [];
            for (const n of list) {
                if (n.children) {
                    data.push({ n: n.name, u: n.uuid, c: iter(n.children) });
                }
                else {
                    const d = this.hs.rules.get(n.name);
                    let v = "";
                    if (d?.step) {
                        v = d?.toString() + ";" + this.hs.genCmd(d.step).filter(e => !e.startsWith("hyp ")).join(";");
                    }
                    else if (d) {
                        v = "ax:" + d?.toString();
                    }
                    data.push({ n: n.name, u: n.uuid, v });
                }
            }
            return data;
        };
        return iter(this.ruleList);
    }
    deserializeRulelist(data) {
        // regist in gui and hs, but ignore steps
        const iter = (data, container = this.ruleList) => {
            for (const d of data) {
                const c = d.c;
                const it = { name: d.n, uuid: d.u };
                if (c) {
                    it.children = [];
                    iter(c, it.children);
                }
                let v = d.v;
                if (v) {
                    let dvalue;
                    if (v.startsWith("ax:")) {
                        dvalue = v.slice(3);
                    }
                    else {
                        dvalue = v.slice(0, v.indexOf(";"));
                    }
                    const ast = new HSParser().parse(dvalue, 'rule');
                    const assertions = ast.nodes.filter(e => e.type === NodeType.ASSERT).map(e => AtomSolver.fromAST(e));
                    ast.nodes = ast.nodes.filter(e => e.type !== NodeType.ASSERT);
                    const rule = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, d.n), assertions, ast.nodes, ast.nodes.pop());
                    this.hs.rules.set(d.n, rule);
                }
                container.push(it);
            }
        };
        iter(data);
        // regist steps in hs
        const iter2 = (data) => {
            for (const d of data) {
                const c = d.c;
                if (c)
                    iter(c);
                let v = d.v;
                if (v) {
                    if (v.startsWith("ax:"))
                        continue;
                    this.hs.clear();
                    try {
                        const rule = this.hs.rules.get(d.n);
                        const cmds = (v.slice(v.indexOf(";") + 1)).split(";");
                        const hyps = [];
                        for (const n of rule.assertions) {
                            hyps.push("hyp " + AtomSolver.print(n));
                        }
                        for (const n of rule.conditions) {
                            hyps.push("hyp " + n);
                        }
                        this.hs.fromCmd(hyps.map(e => new HSParser().parse(e, "cmd")));
                        this.hs.fromCmd(cmds.map(e => new HSParser().parse(e, "cmd")));
                        if (!this.hs.checkConclusionInPropList().conclusion.equal(rule.conclusion)) {
                            console.log(d.n, "nono");
                        }
                        rule.step = this.hs.props.slice(0);
                    }
                    catch (e) {
                        console.log(d.n, "nono");
                    }
                    this.hs.clear();
                }
            }
        };
        iter2(data);
    }
}
//# sourceMappingURL=serde.js.map