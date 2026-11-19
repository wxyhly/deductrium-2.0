import { AST } from "./core/ast.js";
import { HSParser } from "./core/parser.js";
import { NodeType } from "../asttype.js";
export function findTargets(system, tree, name, operation) {
    const result = [];
    const namedStep = (nodes) => {
        for (const node of nodes) {
            if (node.name === name)
                return node;
            const found = node.children && namedStep(node.children);
            if (found)
                return found;
        }
    };
    // An explicitly quoted empty name addresses a legacy nameless macro,
    // never the first proof step whose optional display name is also empty.
    const p = name ? namedStep(system.props) ?? system.getP(name) : undefined;
    if (p)
        result.push({ kind: "step", name, step: p });
    const walk = (nodes) => {
        for (const node of nodes) {
            if (node.children) {
                if (operation === "rename" && node.name === name)
                    result.push({ kind: "folder", name, node });
                walk(node.children);
            }
        }
    };
    walk(tree);
    const rule = system.rules.get(name);
    if (rule?.step || rule?.error)
        result.push({ kind: "macro", name });
    if ((operation === "entr" || operation === "inln") && !rule && !p) {
        // Derived rule names (e.g. ca1) can be inspected/loaded too.
        const ast = new HSParser().parse(name, "dname");
        if (ast && ast.toString() === name && system.getD(ast).step)
            result.push({ kind: "macro", name });
    }
    return result;
}
export function targetList(text) {
    const names = [];
    let start = 0, quoted = false, escaped = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (quoted && char === "\\") {
            escaped = true;
            continue;
        }
        if (char === '"')
            quoted = !quoted;
        if (char === "," && !quoted) {
            names.push(text.slice(start, i).trim());
            start = i + 1;
        }
    }
    names.push(text.slice(start).trim());
    if (names.some(n => !n || /[;\n]/.test(n)))
        throw new Error("Invalid target list");
    return names.map(name => targetAtom(name).name);
}
export function targetAtom(text) {
    const name = text.trim();
    return new AST(NodeType.ATOM_ITEM, name.startsWith('"') ? JSON.parse(name) : name);
}
//# sourceMappingURL=targets.js.map