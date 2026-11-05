import { NodeType } from "../asttype.js";
import { HilbertSystem } from "./core/core.js";
import { HSError } from "./core/error.js";
import { HSParser } from "./core/parser.js";
// Gameplay permissions apply at the interactive boundary. Kernel replay and
// built-in proof verification continue to use the complete inference system.
export class SurvivalAccess {
    rewards;
    constructor(rewards = new Set()) {
        this.rewards = rewards;
    }
    require(feature, ...rewards) {
        if (!rewards.some(reward => this.rewards.has(reward)))
            throw HSError.lockedFeature(feature);
    }
    get axiomOnly() {
        return !this.rewards.has("mcvt") && !this.rewards.has("mvt") && !this.rewards.has("met");
    }
    checkRuleName(ast, system) {
        if (ast.type === NodeType.ATOM_DNAME) {
            if (ast.name === "msbt>" || ast.name === "msbt<")
                this.require("msbt", "mifft");
            if (ast.name === "mcpt")
                this.require("mcpt", "mcpt");
            return;
        }
        if (ast.type !== NodeType.NODE_DNAME)
            return;
        const unlocks = {
            c: ["mct", "mdt", "mcpt"], ">": ["mdt"], "<": ["midt", "mcpt"],
            v: ["1st", "mcvt", "mvt", "met"], u: ["mvt", "met"], e: ["met"],
        };
        if (ast.name) {
            const rewards = unlocks[ast.name];
            if (rewards)
                this.require(ast.name, ...rewards);
            this.checkRuleName(ast.nodes[0], system);
            if (ast.name === "v" && this.axiomOnly)
                this.checkAxiom(system.getD(ast.nodes[0]));
        }
        else {
            // msbt(rule) is a special command template rather than composition.
            const special = ast.nodes[0]?.name === "msbt>" || ast.nodes[0]?.name === "msbt<";
            if (!special)
                this.require("composition", "mcmt");
            for (const child of ast.nodes)
                this.checkRuleName(child, system);
        }
    }
    checkAxiom(rule) {
        if (rule.conditions.length || rule.step?.length)
            throw HSError.quantifyAxiomOnly;
    }
    checkScope(scope, rule) {
        if (!this.axiomOnly)
            return;
        for (let parent = scope; parent; parent = parent.parent) {
            if (parent.from.type !== "v")
                continue;
            if (!rule)
                throw HSError.quantifyAxiomOnly;
            this.checkAxiom(rule);
            return;
        }
    }
    checkMove(source, scope, system) {
        let quantified = false;
        for (let parent = scope; parent; parent = parent.parent) {
            if (parent.from.type === "v")
                quantified = true;
        }
        const visit = (prop, inVariable) => {
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
    checkCommand(name) {
        const unlocks = {
            m: ["macro"], hyp: ["hyp"], mcpt: ["mcpt"], mcnt: ["mnt"],
            cond: ["mct", "mdt", "mcpt"], var: ["1st", "mcvt", "mvt", "met"], dir: ["mkdir"],
        };
        const rewards = unlocks[name];
        if (rewards)
            this.require(name, ...rewards);
    }
    // Preview replay in an isolated system so rejected menu operations cannot
    // create a sheet, change the active proof, or register a partial macro.
    checkReplay(commands, system, scope = null) {
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
            }
            else if (cmd.name === "mcpt" || cmd.name === "mcnt") {
                this.checkScope(active);
            }
            preview.fromCmd([cmd]);
        }
    }
    checkExpand(prop, system) {
        const parser = new HSParser();
        const preview = new HilbertSystem();
        preview.rules = new Map(system.rules);
        preview.fromCmd(system.genCmd().map(cmd => parser.parse(cmd, "cmd")));
        const copy = preview.getP(String(prop.id));
        if (!copy)
            throw HSError.pname404(String(prop.id));
        preview.expand(copy);
        this.checkReplay(preview.genCmd().map(cmd => parser.parse(cmd, "cmd")), system);
    }
}
//# sourceMappingURL=access.js.map