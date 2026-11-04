import { NodeType } from "../../../asttype.js";
import { AST, MatchTable } from "../ast.js";
import type { HilbertSystem } from "../core.js";
import { Deduction, Proposition } from "../deduction.js";
import { HSParser } from "../parser.js";

const parse = (text: string, type: "item" | "wff" | "dname") => {
    const ast = new HSParser().parse(text, type);
    if (!ast) throw new Error(`Invalid numeric proof expression: ${text}`);
    return ast;
};

/** All generated arithmetic results are kernel-checked proofs, never axioms. */
export function generateNumberProof(system: HilbertSystem, name: string): Deduction | undefined {
    const member = /^\.(0|[1-9][0-9]*)@N$/.exec(name);
    const operation = /^\.(0|[1-9][0-9]*)([+*])(0|[1-9][0-9]*)$/.exec(name);
    if ((!member && !operation) || !system.rules.has("apn1")) return undefined;
    // Unary Peano proofs are intentionally bounded. BigInt parsing remains exact.
    const a = BigInt(member ? member[1] : operation![1]);
    const b = operation ? BigInt(operation[3]) : 0n;
    if (a > 1000n || b > 1000n || (operation?.[2] === "*" && a * b > 1000n) || (operation?.[2] === "+" && a + b > 1000n)) {
        throw new Error("Numeric proof exceeds the 1000-successor budget");
    }
    const saved = system.saveContext();
    system.loadContext(system.createEmptyContext());
    const apply = (ruleName: string, conditions: Proposition[] = [], values: string[] = []) => {
        const rule = system.getD(parse(ruleName, "dname"));
        if (values.length !== rule.replaceNames.length) throw new Error(`Numeric proof parameters: ${ruleName}`);
        const replacements: MatchTable = {};
        rule.replaceNames.forEach(([key, item], i) => replacements[key] = parse(values[i], item ? "item" : "wff"));
        return system.d(rule, conditions, replacements);
    };
    // Substitute a proved equality into a concrete predicate, avoiding all
    // occurrence-index heuristics and capturing no user variables.
    const rewrite = (equality: Proposition, fact: Proposition, predicate: string) => {
        const rule = system.getD(parse("a8", "dname"));
        const [left, right] = equality.ast.nodes;
        const values = [left, right, parse(predicate, "wff"), parse("#n", "item")];
        const replacements = Object.fromEntries(rule.replaceNames.map(([key], i) => [key, values[i]]));
        return apply("mp", [apply("mp", [system.d(rule, [], replacements), equality]), fact]);
    };
    const record = (ruleName: string, conclusion: Proposition) => {
        const checked = system.checkConclusionInPropList();
        if (checked.asserts.length || checked.conditions.length || !checked.conclusion.equal(conclusion.ast)) {
            throw new Error(`Numeric proof failed to close: ${ruleName}`);
        }
        const deduction = new Deduction(new Set, new AST(NodeType.ATOM_DNAME, ruleName), [], [], conclusion.ast.clone(), system.props.slice());
        system.rules.set(ruleName, deduction);
        system.loadContext(system.createEmptyContext());
        return deduction;
    };
    const nat = (n: bigint) => n === 0n ? apply("apn1") : apply(`.${n}@N`);
    const ensureNats = (upto: bigint) => {
        for (let n = 1n; n <= upto; n++) {
            if (system.rules.has(`.${n}@N`)) continue;
            const previous = nat(n - 1n);
            const successor = apply("mp", [apply("<a4", [apply("apn2")], [String(n - 1n)]), previous]);
            const equal = apply(".=s", [apply(`d${n}`)]);
            record(`.${n}@N`, rewrite(equal, successor, "#n∈ℕ"));
        }
    };
    const ensureAdd = (left: bigint, right: bigint) => {
        ensureNats(left + right);
        for (let n = 0n; n <= right; n++) {
            const key = `.${left}+${n}`;
            if (system.rules.has(key)) continue;
            if (!n) {
                record(key, apply("<d+1", [nat(left)]));
                continue;
            }
            const previous = apply(`.${left}+${n - 1n}`);
            const recurrence = apply("<<d+2", [nat(left), nat(n - 1n)]);
            const numeral = apply(".=s", [apply(`d${n}`)]);
            const lhs = rewrite(numeral, recurrence, `${left}+#n=S(${left}+${n - 1n})`);
            const rhs = rewrite(previous, lhs, `${left}+${n}=S(#n)`);
            const result = apply(".=s", [apply(`d${left + n}`)]);
            record(key, rewrite(result, rhs, `${left}+${n}=#n`));
        }
    };
    try {
        if (member) {
            ensureNats(a);
            if (!a) record(name, apply("apn1"));
        } else if (operation![2] === "+") {
            ensureAdd(a, b);
        } else {
            ensureNats(a * b > a ? a * b : a);
            for (let n = 0n; n <= b; n++) {
                const key = `.${a}*${n}`;
                if (system.rules.has(key)) continue;
                if (!n) { record(key, apply("<d*1", [nat(a)])); continue; }
                ensureAdd(a * (n - 1n), a);
                const previous = apply(`.${a}*${n - 1n}`);
                const recurrence = apply("<<d*2", [nat(a), nat(n - 1n)]);
                const numeral = apply(".=s", [apply(`d${n}`)]);
                const lhs = rewrite(numeral, recurrence, `${a}*#n=${a}*${n - 1n}+${a}`);
                const rhs = rewrite(previous, lhs, `${a}*${n}=#n+${a}`);
                record(key, rewrite(apply(`.${a * (n - 1n)}+${a}`), rhs, `${a}*${n}=#n`));
            }
        }
        return system.rules.get(name);
    } finally {
        system.loadContext(saved);
    }
}
