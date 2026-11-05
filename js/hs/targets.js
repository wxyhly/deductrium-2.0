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
    const p = namedStep(system.props) ?? system.getP(name);
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
    const names = text.split(",").map(s => s.trim());
    if (names.some(n => !n || /[;\n]/.test(n)))
        throw new Error("Invalid target list");
    return names;
}
export function targetAtom(text) {
    const name = text.trim();
    return new AST(NodeType.ATOM_ITEM, name.startsWith('"') ? JSON.parse(name) : name);
}
//# sourceMappingURL=targets.js.map