// 二分：逐个注册，找到让 pred_succZ 失败的注册项
import { Core } from '../js/tt/core.js';
import { TypeParser } from '../js/tt/parser.js';
import { toKAST, fromKAST, astToString } from '../js/tt/kast.js';
import { initCreativeRules } from '../js/tt/initial.js';
import { NodeType } from '../js/tt/ast.js';

const parser = new TypeParser();
const p = (s) => parser.parse(s);

const rules = initCreativeRules();
const idx = rules.findIndex(r => r.text.startsWith("pred_succZ"));
console.log("pred_succZ 在规则列表索引:", idx);

const options = { elaborateMetas: true, allowNamedSchematicMetas: true, allowUnsolvedTermMetas: true, allowGeneratedSchematicMetas: true, generalizeMetas: true };

const registerOne = (core, rr) => {
    const ast = parser.parse(rr.text);
    if (!ast) return;
    if ((rr.kind === "type" || rr.kind === "ctor" || rr.kind === "ind") && ast.type === NodeType.PROP && ast.name === ":" && ast.nodes[0].type === NodeType.ATOM) {
        core.setSystemType(ast.nodes[0].name, ast.nodes[1]);
    } else if (rr.kind === "def") {
        if (ast.type === NodeType.PROP && ast.nodes[0].type === NodeType.ATOM) {
            const name = ast.nodes[0].name;
            if (ast.name === ":=") {
                const rhs = ast.nodes[1];
                if (rhs.type === NodeType.SYM && rhs.name === ":") core.setSystemDefinition(name, rhs.nodes[0], rhs.nodes[1]);
                else core.setSystemDefinition(name, rhs);
            } else if (ast.name === ":") core.setSystemType(name, ast.nodes[1]);
        }
    }
};

for (let i = 0; i < idx; i++) {
    const core = new Core();
    let failed = false;
    try {
        for (let j = 0; j <= i; j++) {
            if (rules[j].text === rules[idx].text) continue;
            registerOne(core, rules[j]);
        }
    } catch (e) { console.log("注册抛错于", rules[i].group, rules[i].kind, rules[i].text.slice(0, 40), ":", e.message); failed = true; }
    if (failed) break;
    const k = toKAST(p("ind_Z (λx:Z. eq Z (predZ (succZ x)) x) rfl (λx:nat. rfl) (ind_nat (λx:nat. eq Z (predZ (succZ (neg x))) (neg x)) rfl (λx:nat. λy:(eq Z (predZ (succZ (neg x))) (neg x)). rfl))"));
    const r = core.checker.trySynthesize(k, [], options);
    if (r.status !== "success") {
        console.log(">> 注册完 [", rules[i].group, rules[i].kind, rules[i].text.slice(0, 50), "] 后 pred_succZ 失败:", JSON.stringify(r));
        break;
    }
}
console.log("done");
