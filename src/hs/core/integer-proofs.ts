import { NodeType } from "../../asttype.js";
import { AST, MatchTable } from "./ast.js";
import type { HilbertSystem } from "./core.js";
import { Deduction, Proposition } from "./deduction.js";
import { HSParser } from "./parser.js";

/** Generate legacy integer membership and arithmetic proofs, never bare axioms. */
export function generateIntegerProof(system: HilbertSystem, name: string): Deduction | undefined {
    if (name !== name.trim()) return undefined;
    const member = /^\.([+-]?)(0|[1-9][0-9]*)@Z$/.exec(name);
    const operation = /^\.([+-]?)(0|[1-9][0-9]*)([+*-])([+-]?)(0|[1-9][0-9]*)$/.exec(name);
    if (!member && !operation) return undefined;
    // Unsigned +/* names retain the natural-number dispatch of the old system.
    if (operation && operation[3] !== "-" && !operation[1] && !operation[4]) return undefined;
    // Missing bridges do not silently turn their conclusions into axioms.
    const bridge = system.rules.get(".@Z");
    if (!bridge?.step?.length || bridge.error || !system.rules.has("dZ")) return undefined;
    if (operation && [".Zr", ".Xi", ".Pr1", ".Pr2"].some(key => {
        const rule = system.rules.get(key);
        return !rule?.step?.length || !!rule.error;
    })) return undefined;
    const sign1 = member ? member[1] || "+" : operation![1] || "+";
    const magnitude = BigInt(member ? member[2] : operation![2]);
    const sign2 = operation?.[4] || "+", magnitude2 = BigInt(operation?.[5] || "0");
    const a = sign1 === "-" ? 0n : magnitude, b = sign1 === "-" ? magnitude : 0n;
    const c = sign2 === "-" ? 0n : magnitude2, d = sign2 === "-" ? magnitude2 : 0n;
    const op = operation?.[3];
    const positive = op === "*" ? a * c + b * d : op === "-" ? a + d : a + c;
    const negative = op === "*" ? a * d + b * c : op === "-" ? b + c : b + d;
    if ([magnitude, magnitude2, positive, negative].some(n => n > 1000n)) {
        throw new Error("Integer proof exceeds the 1000-successor budget");
    }
    const saved = system.saveContext();
    const parser = new HSParser();
    const parse = (text: string, type: "dname" | "item" | "wff") => {
        const ast = parser.parse(text, type);
        if (!ast || ast.end !== text.length) throw new Error(`Invalid integer proof expression: ${text}`);
        return ast;
    };
    const apply = (ruleName: string, conditions: Proposition[] = [], values: string[] = []) => {
        const rule = system.getD(parse(ruleName, "dname"));
        if (rule.error) throw new Error(`Integer proof dependency failed: ${ruleName}`);
        if (values.length !== rule.replaceNames.length) throw new Error(`Integer proof parameters: ${ruleName}`);
        const replacements: MatchTable = {};
        rule.replaceNames.forEach(([key, item], i) => replacements[key] = parse(values[i], item ? "item" : "wff"));
        return system.d(rule, conditions, replacements);
    };
    // Only closed terms are rewritten here. All occurrences are selected by AST
    // equality; a8 checks the resulting substitution, without occurrence indices.
    const rewrite = (equality: Proposition, fact: Proposition, path?: number[]): Proposition => {
        const [left] = equality.ast.nodes;
        const predicate = fact.ast.clone();
        const variable = parse("#integer", "item");
        let changed = false;
        const replace = (ast: AST) => {
            if (ast.equal(left)) { ast.copyFrom(variable); changed = true; }
            else ast.nodes.forEach(replace);
        };
        replace(path ? path.reduce((ast, index) => ast.nodes[index], predicate) : predicate);
        if (!changed) return fact;
        // Keep the generated equality template in the same orientation for
        // signed left operands, reversing the result back after rewriting.
        const symmetric = /^[+-]/.test(predicate.toString());
        if (symmetric) { predicate.nodes.reverse(); fact = apply(".=s", [fact]); }
        const rule = system.getD(parse("<a8", "dname"));
        const replacements: MatchTable = {};
        rule.replaceNames.forEach(([key], i) => replacements[key] = i === 0 ? predicate : variable);
        const result = apply("mp", [system.d(rule, [equality], replacements), fact]);
        return symmetric ? apply(".=s", [result]) : result;
    };
    const natural = (n: bigint) => n === 0n ? apply("apn1") : apply(`.${n}@N`);
    try {
        system.loadContext(system.createEmptyContext());
        const literal1 = `${sign1}${magnitude}`, literal2 = `${sign2}${magnitude2}`;
        let conclusion: Proposition;
        let expected: AST;
        if (member) {
            const pairMember = apply(".@Z", [natural(a), natural(b)]);
            conclusion = rewrite(apply(".=s", [apply(`dZ${literal1}`)]), pairMember);
            expected = parse(`${literal1}∈ℤ`, "wff");
        } else {
            const pair1 = `(${a},${b})`, pair2 = `(${c},${d})`;
            const domain1 = apply(".Xi", [natural(a), natural(b)]);
            const domain2 = apply(".Xi", [natural(c), natural(d)]);
            conclusion = apply("mp", [apply("mp", [apply(`dZ${op}`, [], [pair1, pair2]), domain1]), domain2]);
            for (const [x, y] of [[a, b], [c, d]]) {
                conclusion = rewrite(apply(".Pr1", [], [String(x), String(y)]), conclusion);
                conclusion = rewrite(apply(".Pr2", [], [String(x), String(y)]), conclusion);
            }
            conclusion = rewrite(apply(".=s", [apply(`dZ${literal1}`)]), conclusion, [0, 0]);
            conclusion = rewrite(apply(".=s", [apply(`dZ${literal2}`)]), conclusion, [0, 1]);
            if (op === "*") {
                for (const [x, y] of [[a, c], [b, d], [a, d], [b, c]]) {
                    conclusion = rewrite(apply(`.${x}*${y}`), conclusion);
                }
                conclusion = rewrite(apply(`.${a * c}+${b * d}`), conclusion);
                conclusion = rewrite(apply(`.${a * d}+${b * c}`), conclusion);
            } else {
                conclusion = rewrite(apply(`.${a}+${op === "-" ? d : c}`), conclusion);
                conclusion = rewrite(apply(`.${b}+${op === "-" ? c : d}`), conclusion);
            }
            const result = positive - negative;
            const rp = result >= 0n ? result : 0n, rn = result < 0n ? -result : 0n;
            if (positive && negative) {
                const shift = positive < negative ? positive : negative;
                let reduction = apply(".Zr", [natural(rp), natural(rn), natural(shift)]);
                reduction = rewrite(apply(`.${rp}+${shift}`), reduction);
                reduction = rewrite(apply(`.${rn}+${shift}`), reduction);
                conclusion = rewrite(apply(".=s", [reduction]), conclusion);
            }
            const resultLiteral = result >= 0n ? `+${result}` : String(result);
            conclusion = rewrite(apply(".=s", [apply(`dZ${resultLiteral}`)]), conclusion);
            expected = parse(`${literal1}${op}${literal2}=${resultLiteral}`, "wff");
        }
        const checked = system.checkConclusionInPropList();
        if (checked.asserts.length || checked.conditions.length || !checked.conclusion.equal(expected)
            || !conclusion.ast.equal(expected)) throw new Error(`Integer proof failed to close: ${name}`);
        const deduction = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, name), [], [],
            expected, system.props.slice());
        system.rules.set(name, deduction);
        return deduction;
    } finally {
        system.loadContext(saved);
    }
}
