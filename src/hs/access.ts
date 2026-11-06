import { NodeType } from "../asttype.js";
import { AST } from "./core/ast.js";
import { HilbertSystem } from "./core/core.js";
import { Deduction, Proposition } from "./core/deduction.js";
import { HSError } from "./core/error.js";
import { HSParser } from "./core/parser.js";

// Gameplay permissions apply at the interactive boundary. Kernel replay and
// built-in proof verification continue to use the complete inference system.
export class SurvivalAccess {
    constructor(readonly rewards = new Set<string>()) { }

    private require(feature: string, ...rewards: string[]) {
        if (!rewards.some(reward => this.rewards.has(reward))) throw HSError.lockedFeature(feature);
    }

    private get axiomOnly() {
        return !this.rewards.has("mcvt") && !this.rewards.has("mvt") && !this.rewards.has("met");
    }

    checkRuleName(ast: AST, system: HilbertSystem) {
        if (ast.type === NodeType.ATOM_DNAME) {
            if (ast.name === "msbt>" || ast.name === "msbt<") this.require("msbt", "mifft");
            if (ast.name === "mcpt") this.require("mcpt", "mcpt");
            this.checkNumberName(ast.name);
            return;
        }
        if (ast.type !== NodeType.NODE_DNAME) return;
        const unlocks: Record<string, string[]> = {
            c: ["mct", "mdt", "mcpt"], ">": ["mdt"], "<": ["midt", "mcpt"],
            v: ["1st", "mcvt", "mvt", "met"], u: ["mvt", "met"], e: ["met"],
        };
        if (ast.name) {
            const rewards = unlocks[ast.name];
            if (rewards) this.require(ast.name, ...rewards);
            this.checkRuleName(ast.nodes[0], system);
            if (ast.name === "v" && this.axiomOnly) this.checkAxiom(system.getD(ast.nodes[0]));
        } else {
            // msbt(rule) is a special command template rather than composition.
            const special = ast.nodes[0]?.name === "msbt>" || ast.nodes[0]?.name === "msbt<";
            if (!special) this.require("composition", "mcmt");
            for (const child of ast.nodes) this.checkRuleName(child, system);
        }
    }

    private checkNumberName(name: string) {
        // Classify names before getD, including rules cached by an earlier save
        // or preloaded in creative mode. Keep this boundary independent of the
        // optional number module so the base game can load it as well.
        if (/^d[1-9][0-9]*$/.test(name)) {
            if (/^d(?:[1-9]|10)$/.test(name)) this.require("natural literals", "peano", "natop");
            else this.require("natural literals", "natop");
        } else if (/^dZ[+-]?(?:0|[1-9][0-9]*)$/.test(name)) {
            this.require("integer literals", "dZn");
        } else if (/^\.(?:0|[1-9][0-9]*)@N$/.test(name)
            || /^\.(?:0|[1-9][0-9]*)[+*](?:0|[1-9][0-9]*)$/.test(name)) {
            this.require("natural arithmetic", "natop");
        } else if (/^\.[+-]?(?:0|[1-9][0-9]*)@Z$/.test(name)
            || /^\.[+-]?(?:0|[1-9][0-9]*)[+*-][+-]?(?:0|[1-9][0-9]*)$/.test(name)) {
            this.require("integer arithmetic", "dZop");
        } else if (/^d(?:Q[+-]?(?:0|[1-9][0-9]*)q?|[+-]?(?:0|[1-9][0-9]*)q|Q?[+-]?(?:0|[1-9][0-9]*)\.[0-9]*q?)$/.test(name)) {
            // The current map has no rational/real literal rewards.
            this.require("rational literals");
        } else if (/^d(?:R[+-]?(?:0|[1-9][0-9]*)r?|[+-]?(?:0|[1-9][0-9]*)r|R?[+-]?(?:0|[1-9][0-9]*)\.[0-9]*r?)$/.test(name)) {
            this.require("real literals");
        }
    }

    private checkAxiom(rule: Deduction) {
        if (rule.conditions.length || rule.step?.length) throw HSError.quantifyAxiomOnly;
    }

    checkScope(scope: Proposition | null, rule?: Deduction) {
        if (!this.axiomOnly) return;
        for (let parent = scope; parent; parent = parent.parent) {
            if (parent.from.type !== "v") continue;
            if (!rule) throw HSError.quantifyAxiomOnly;
            this.checkAxiom(rule);
            return;
        }
    }

    checkMove(source: Proposition, scope: Proposition | null, system: HilbertSystem) {
        let quantified = false;
        for (let parent = scope; parent; parent = parent.parent) {
            if (parent.from.type === "v") quantified = true;
        }
        const visit = (prop: Proposition, inVariable: boolean) => {
            inVariable ||= prop.from.type === "v";
            if (prop.from.type === "d") {
                const name = prop.from.data.deduction;
                this.checkRuleName(name, system);
                if (inVariable && this.axiomOnly) {
                    if (system.isMsbtDname(name) || name.name === "mcpt" || name.name === "mcnt") {
                        throw HSError.quantifyAxiomOnly;
                    }
                    this.checkAxiom(system.getD(name));
                }
            }
            prop.children?.forEach(child => visit(child, inVariable));
        };
        visit(source, quantified);
    }

    private checkCommand(name: string) {
        const unlocks: Record<string, string[]> = {
            m: ["macro"], hyp: ["hyp"], mcpt: ["mcpt"], mcnt: ["mnt"],
            cond: ["mct", "mdt", "mcpt"], var: ["1st", "mcvt", "mvt", "met"], dir: ["mkdir"],
        };
        const rewards = unlocks[name];
        if (rewards) this.require(name, ...rewards);
    }

    // Preview replay in an isolated system so rejected menu operations cannot
    // create a sheet, change the active proof, or register a partial macro.
    checkReplay(commands: AST[], system: HilbertSystem, scope: Proposition | null = null) {
        const preview = new HilbertSystem();
        preview.rules = new Map(system.rules);
        for (const cmd of commands) {
            this.checkCommand(cmd.name);
            const active = preview.saveContext().activeProp ?? scope;
            if (cmd.name === "d") {
                const name = cmd.nodes[0];
                this.checkRuleName(name, preview);
                const special = preview.isMsbtDname(name);
                this.checkScope(active, special ? undefined : preview.getD(name));
            } else if (cmd.name === "mcpt" || cmd.name === "mcnt") {
                this.checkScope(active);
            }
            preview.fromCmd([cmd]);
        }
    }

    checkExpand(prop: Proposition, system: HilbertSystem) {
        const parser = new HSParser();
        const preview = new HilbertSystem();
        preview.rules = new Map(system.rules);
        preview.fromCmd(system.genCmd().map(cmd => parser.parse(cmd, "cmd")));
        const copy = preview.getP(String(prop.id));
        if (!copy) throw HSError.pname404(String(prop.id));
        preview.expand(copy);
        this.checkReplay(preview.genCmd().map(cmd => parser.parse(cmd, "cmd")), system);
    }
}
