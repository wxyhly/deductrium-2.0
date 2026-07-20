// atom:wff|item
// logic:wff[]->wff
// quant:Vvar:wff->wff
// bounded-quant:Vvar@item:wff->wff
// fn:item[]->item
// pred:item[]->wff
// sep:{var@item|wff}->item
// class:{var|wff}->item
// rpl:{item|var@item}->item

import { FSError } from "./error.js";

// sub: #sb(wff|item,var,item;...var)
export enum NodeType {
    VAR, ATOM_ITEM, ATOM_WFF, LOGIC, QUANT, BOUNDED_QUANT, FN, PRED, SEP, RPL, CLASS, SB,
    RULE
}

type ReplvarTable = Map<string, boolean>;
export type MatchTable = Record<string, AST>;

export class AST {
    type: NodeType; nodes: AST[]; name: string;
    start?: number; end?: number;
    constructor(type: NodeType, name: string, ...nodes: AST[]) {
        this.type = type; this.name = name; this.nodes = nodes;
    }
    range(start?: number, end?: number) { this.start = start; this.end = end; return this; }
    clone(): AST {
        const nodes = this.nodes.map(e => e.clone());
        return new AST(this.type, this.name, ...nodes);
    }
    copyFrom(ast: AST) {
        this.type = ast.type; this.name = ast.name;
        this.nodes = ast.nodes.map(e => e.clone());
    }
    isAtom() { return this.type === NodeType.VAR || this.type === NodeType.ATOM_ITEM || this.type === NodeType.ATOM_WFF ? this.name : undefined; }
    isReplvar() {
        const n = this.isAtom();
        return n && n.startsWith("$") ? n : undefined;
    }
    getReplvars(res: ReplvarTable = new Map()) {
        if (this.isReplvar()) {
            const isItem = this.type === NodeType.ATOM_ITEM || this.type === NodeType.VAR;
            const oldIsItem = res.get(this.name);
            if (oldIsItem !== undefined && oldIsItem !== isItem) {
                throw FSError.isItemAndWff(this.name);
            }
            res.set(this.name, isItem);
            return res;
        }
        for (const node of this.nodes) {
            node.getReplvars(res);
        }
        return res;
    }
    equal(ast: AST) {
        if (this === ast) return true;
        if (this.name !== ast.name) return false;
        if (this.type !== ast.type) return false;
        if (this.nodes?.length !== ast.nodes?.length) return false;
        if (this.nodes?.length) {
            for (let i = 0; i < ast.nodes.length; i++) {
                if (!this.nodes[i].equal(ast.nodes[i])) return false;
            }
        }
        return true;
    }
    match(pattern: AST, res: MatchTable = {}) {
        if (pattern.isReplvar()) {
            if (res[pattern.name]) {
                if (!this.equal(res[pattern.name])) throw FSError.matchFail(this, res[pattern.name], pattern.name);
            } else res[pattern.name] = this.clone();
            return res;
        }
        if (
            this.name !== pattern.name || this.type !== pattern.type || this.nodes?.length !== pattern.nodes?.length
        ) { throw FSError.matchFail(this, res[pattern.name]); }
        if (this.nodes?.length) {
            for (let i = 0; i < this.nodes.length; i++) {
                this.nodes[i].match(pattern.nodes?.[i], res);
            }
        }
        return res;
    }
    mut_replaceByMatchTable(mt: MatchTable): AST {
        if (this.isAtom()) {
            const replacement = mt[this.name];
            if (replacement) this.copyFrom(replacement);
            return this;
        }
        this.nodes.forEach(node => node.mut_replaceByMatchTable(mt));
        return this;
    }
    checkVAR() {
        if (this.type !== NodeType.VAR) throw FSError.isNotVar(this);
    }
    checkITEM() {
        if (this.type === NodeType.ATOM_ITEM || this.type === NodeType.VAR) return;
        if (this.type === NodeType.FN) {
            for (let i = 0; i < this.nodes.length; i++) {
                this.nodes[i].checkITEM();
            } return;
        }
        if (this.type === NodeType.CLASS) {
            this.nodes[0].checkVAR();
            this.nodes[1].checkWFF();
            return;
        }
        if (this.type === NodeType.RPL) {
            this.nodes[0].checkITEM();
            this.nodes[1].checkVAR();
            this.nodes[2].checkITEM();
            return;
        }
        if (this.type === NodeType.SEP) {
            this.nodes[0].checkVAR();
            this.nodes[1].checkITEM();
            this.nodes[2].checkWFF();
            return;
        }
        if (this.type === NodeType.SB) {
            this.nodes[0].checkITEM();
            this.nodes[1].checkVAR();
            this.nodes[2].checkITEM();
            return;
        }
        throw FSError.isNotItem(this);
    }
    checkWFF() {
        if (this.type === NodeType.ATOM_WFF) return;
        if (this.type === NodeType.LOGIC) {
            for (let i = 0; i < this.nodes.length; i++) {
                this.nodes[i].checkWFF();
            } return;
        }
        if (this.type === NodeType.QUANT) {
            this.nodes[0].checkVAR();
            this.nodes[1].checkWFF();
            return;
        }
        if (this.type === NodeType.PRED) {
            for (let i = 0; i < this.nodes.length; i++) {
                this.nodes[i].checkITEM();
            } return;
        }
        if (this.type === NodeType.SB) {
            this.nodes[0].checkWFF();
            this.nodes[1].checkVAR();
            this.nodes[2].checkITEM();
            return;
        }
        throw FSError.isNotWFF(this);
    }
}