import { NodeType } from "../asttype.js";
import { AtomSolver } from "./core/assert.js";
import { AST } from "./core/ast.js";
import { MCPT } from "./core/combine.js";
import { Deduction } from "./core/deduction.js";
import { initialCreativeRules, initialSurvivalRules } from "./core/initial.js";
import { HSParser } from "./core/parser.js";

// Reward IDs belong to the map; values are names in initialCreativeRules.
const directRewards: ReadonlyMap<string, readonly string[]> = new Map([
    ["neg", ["a3"]], ["1st", ["a4", "a5", "a6"]],
    ["a7", ["a7"]], ["a8", ["a8"]],
    ["iff", ["d<>1", "d<>2"]], ["andor", ["d/\\", "d\\/"]],
    ["dE", ["d\\e"]], ["dE!", ["d\\e!"]],
    ["aExt", ["aext"]], ["aSep", ["asep"]], ["aPair", ["apair"]],
    ["aUnion", ["aunion"]], ["aPow", ["apow"]], ["aRepl", ["arepl"]],
    ["aInf", ["ainf"]], ["aReg", ["areg"]], ["aChoice", ["achoice"]],
    ["d{}", ["d{}"]], ["d{.}", ["d{.}"]], ["d{..}", ["d{..}"]],
    ["d()", ["dpair"]], ["d()pr", ["dpr"]], ["d<", ["d\\c"]],
    ["dU", ["dunion", "d\\u"]], ["dI", ["d\\i"]], ["dPow", ["dpow"]],
    ["d{@|}", ["dsep"]], ["d{|@}", ["drepl"]],
    ["dsub", ["d\\\\"]], ["dX", ["d\\x"]], ["dw", ["d\\o"]],
    ["peano", ["apn1", "apn2", "apn3", "apn4", "apn5", ...Array.from({ length: 10 }, (_, i) => `d${i + 1}`)]],
    ["add-mul", ["d+1", "d+2", "d*1", "d*2"]],
    ["dSd0", ["d0", "dS", "dN"]], ["d<=", ["d<=", "d>="]], ["ddiv", ["d/|"]],
    ["dRel", ["dRel"]], ["dOrder", ["dOrder", "dWOrder"]], ["dEquiv", ["dEquiv"]],
    ["dPrime", ["dPrime"]], ["dfZ", ["dfZ"]], ["dZ", ["dZ"]],
    ["dZ+", ["dZ+"]], ["dZ*", ["dZ*"]], ["dZ<=", ["dZ<="]],
    ["dZn", ["dZ-2", "dZ-1", "dZ0", "dZ1", "dZ2"]],
]);

// Explicit selections, not every rule in a creative-mode folder. Unported
// theorems have no entry and are never replaced with an axiom.
const toolkits: ReadonlyMap<string, readonly string[]> = new Map([
    [".prop", [
        ".i", ".t", ".cs", ".ne", ".ni", ".m", ".a30", ".a31", ".a32",
        ".mn", ".m1", ".m2", ".>n", ".m&", ".m&1", ".m&2",
        ".<>", ".<>1", ".<>2", ".<>i", ".<>s", ".<>t",
        ".TT<>", ".FF<>", ".TF<>", ".FT<>",
        "./\\", "./\\1", "./\\2", ".\\/1", ".\\/2", ".\\/n",
        ".<>r>", ".<>r~", ".<>r/\\", ".<>r\\/", ".<>r<>",
    ]],
    [".1st", [".<>r\\a", ".=s", ".\\acn", ".\\acn<>"]],
    // Old .zfc added simplified aliases only for axioms already earned.
    // Current builtins already use those forms and have no dot aliases.
    [".zfc", []],
    ["kit+*", [
        ".=Se", ".=Si", ".=S", ".=r+", ".=r*", ".0+", ".S+", ".+@N", ".pred",
        ".+s", ".+a", ".+e", ".+=0", ".0*", ".*@N", ".S*", ".*s", ".*+d",
        ".+*d", ".*a", ".*=0", ".*n=0", ".*e",
    ]],
    // Existing checked bridges used by the dynamic number proof engines.
    ["natop", [".=s"]], ["dZop", [".@Z", ".Zr", ".Xi", ".Pr1", ".Pr2"]],
    [".filter", [".filter"]],
]);

interface Builtin {
    line: string;
    axiom: boolean;
    header: string;
    proof: string;
    dependencies?: ReadonlySet<string> | null;
}

function definitions(text: string): Map<string, Builtin> {
    const result = new Map<string, Builtin>();
    for (const raw of text.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("{") || line.startsWith("}") || line.startsWith("//")) continue;
        const colon = line.indexOf(":");
        if (colon < 1) throw new Error("Invalid builtin rule: " + line);
        const rest = line.slice(colon + 1).trim();
        const axiom = rest.startsWith("ax:");
        const end = rest.indexOf(";");
        result.set(line.slice(0, colon).trim(), {
            line, axiom,
            header: axiom ? rest.slice(3) : rest.slice(0, end),
            proof: axiom ? "" : rest.slice(end + 1),
        });
    }
    return result;
}

const builtins = definitions(initialCreativeRules);
const baseNames = [...definitions(initialSurvivalRules).keys()];
const parser = new HSParser();

// Inspect actual proof commands: Deduction.dependence is empty when builtins
// are loaded. Transformations and folder discharge have implicit support rules.
function proofDependencies(builtin: Builtin): ReadonlySet<string> | null {
    if (builtin.dependencies !== undefined) return builtin.dependencies;
    const deps = new Set<string>();
    const add = (...names: string[]) => names.forEach(name => deps.add(name));
    const dname = (ast: AST): void => {
        if (ast.type === NodeType.ATOM_DNAME) {
            if (ast.name !== "#") add(ast.name);
            return;
        }
        if (ast.type !== NodeType.NODE_DNAME) throw new Error("Unknown builtin deduction name");
        if (ast.name === "c" || ast.name === ">" || ast.name === "<") add("mp", "a1", "a2");
        else if (ast.name === "v") add("a4", "a5");
        else if (ast.name === "u") add("a4", "a5", "a6");
        else if (ast.name !== "") throw new Error("Unsupported builtin transformation: " + ast.name);
        ast.nodes.forEach(dname);
    };
    const command = (text: string, generated = false): void => {
        const cmd = parser.parse(text, "cmd");
        if (cmd.name === "d") dname(cmd.nodes[0]);
        else if (cmd.name === "cond") add("mp", "a1", "a2");
        else if (cmd.name === "var") add("a4", "a5");
        else if (cmd.name === "mcpt" && !generated) {
            const prover = new MCPT(cmd.nodes[0]);
            // This is a trusted builtin, but still bound exponential work before
            // invoking MCPT. Current toolkit formulas have four atoms each.
            if (prover.genAtomWff().atoms.length > 8) throw new Error("Builtin MCPT exceeds reward budget");
            const steps = prover.check(true);
            if (!steps || steps.length > 65536) throw new Error("Builtin MCPT proof too large");
            steps.forEach(step => command(step, true));
        } else if (!["hyp", "cd", "pop", "dir", "name"].includes(cmd.name)) {
            throw new Error("Unsupported builtin proof command: " + cmd.name);
        }
    };
    try {
        builtin.proof.split(";").filter(text => text.trim()).forEach(text => command(text));
        // Fail closed when a proof starts depending on an unported rule or a
        // special execution channel that this analyser does not yet support.
        builtin.dependencies = [...deps].every(name => builtins.has(name)) ? deps : null;
    } catch {
        builtin.dependencies = null;
    }
    return builtin.dependencies;
}

function matchesBuiltin(rule: Deduction, builtin: Builtin): boolean {
    if (rule.error || (!builtin.axiom && !rule.step?.length)) return false;
    const ast = parser.parse(builtin.header, "rule");
    const assertions = ast.nodes.filter(node => node.type === NodeType.ASSERT).map(node => AtomSolver.fromAST(node));
    const nodes = ast.nodes.filter(node => node.type !== NodeType.ASSERT);
    const conclusion = nodes.pop()!;
    return rule.conclusion.equal(conclusion)
        && rule.conditions.length === nodes.length
        && rule.conditions.every((node, i) => node.equal(nodes[i]))
        && rule.assertions.length === assertions.length
        && rule.assertions.every((assertion, i) => AtomSolver.print(assertion) === AtomSolver.print(assertions[i]));
}

function renamedDefinition(name: string, builtin: Builtin, renamed: ReadonlyMap<string, string>): string {
    if (!renamed.size) return builtin.line;
    const renameDname = (ast: AST): boolean => {
        if (ast.type === NodeType.ATOM_DNAME) {
            const alias = ast.name === "#" ? undefined : renamed.get(ast.name);
            if (alias === undefined || alias === ast.name) return false;
            ast.name = alias;
            return true;
        }
        let changed = false;
        if (ast.type === NodeType.NODE_DNAME) {
            for (const child of ast.nodes) if (renameDname(child)) changed = true;
        }
        return changed;
    };
    const colon = builtin.line.indexOf(":");
    const prefix = (renamed.get(name) ?? name) + builtin.line.slice(colon);
    if (builtin.axiom) return prefix;
    const proof = builtin.proof.split(";").map(text => {
        if (!text.trim()) return text;
        const cmd = parser.parse(text, "cmd");
        if (cmd.name !== "d") return text;
        const dname = cmd.nodes[0];
        if (!renameDname(dname)) return text;
        if (dname.start === undefined || dname.end === undefined) throw new Error("Missing builtin deduction range");
        // Rewrite only the deduction AST's source range. Headers, formula/item
        // arguments, proposition IDs and non-deduction commands stay verbatim.
        return text.slice(0, dname.start) + dname.toString() + text.slice(dname.end);
    }).join(";");
    return prefix.slice(0, prefix.indexOf(";") + 1) + proof;
}

/**
 * Return only missing builtin definitions, with dependencies before users.
 * Recompute from the complete reward set so acquisition order does not matter.
 * Existing rules are never changed; conflicting names also block dependants.
 * Only directly earned axiom/definition leaves may enter a toolkit closure.
 * Internal MCPT proof support does not grant the interactive MCPT permission.
 * Alias keys stay canonical across repeated renames; values are current names.
 */
export function getSurvivalRules(
    rewards: ReadonlySet<string>, existing: ReadonlyMap<string, Deduction>,
    renamed: ReadonlyMap<string, string> = new Map(),
): string {
    const earned = new Set(baseNames);
    for (const [reward, names] of directRewards) if (rewards.has(reward)) names.forEach(name => earned.add(name));
    const actualNames = new Map<string, string>();
    const owners = new Map<string, string>();
    const blocked = new Set<string>();
    for (const name of builtins.keys()) {
        const actual = renamed.get(name) ?? name;
        if (actual !== name) {
            try {
                const ast = parser.parse(actual, "dname");
                if (ast.type !== NodeType.ATOM_DNAME || ast.name !== actual || actual === "#") throw new Error("Invalid builtin alias");
            } catch { blocked.add(name); continue; }
        }
        actualNames.set(name, actual);
        const owner = owners.get(actual);
        if (owner !== undefined) { blocked.add(name); blocked.add(owner); }
        else owners.set(actual, name);
    }
    const result = new Map<string, string>();
    for (const [name, builtin] of builtins) {
        if (earned.has(name) && !blocked.has(name) && !existing.has(actualNames.get(name)!)) {
            result.set(name, renamedDefinition(name, builtin, renamed));
        }
    }
    const resolved = new Set<string>();
    const visit = (name: string, visiting: Set<string>, pending: Map<string, string>): boolean => {
        if (resolved.has(name) || pending.has(name)) return true;
        if (blocked.has(name) || visiting.has(name)) return false;
        const builtin = builtins.get(name);
        if (!builtin || (builtin.axiom && !earned.has(name))) return false;
        const previous = existing.get(actualNames.get(name)!);
        if (previous && !matchesBuiltin(previous, builtin)) { blocked.add(name); return false; }
        visiting.add(name);
        const deps = builtin.axiom ? new Set<string>() : proofDependencies(builtin);
        const ok = deps !== null && [...deps].every(dep => visit(dep, visiting, pending));
        visiting.delete(name);
        if (!ok) { blocked.add(name); return false; }
        if (!previous) pending.set(name, renamedDefinition(name, builtin, renamed));
        return true;
    };
    for (const [reward, targets] of toolkits) {
        if (!rewards.has(reward)) continue;
        for (const name of targets) {
            const pending = new Map<string, string>();
            if (!visit(name, new Set(), pending)) continue;
            for (const [dep, line] of pending) { result.set(dep, line); resolved.add(dep); }
            resolved.add(name);
        }
    }
    return [...result.values()].join("\n");
}
