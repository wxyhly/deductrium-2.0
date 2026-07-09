// atom:wff|item
// logic:wff[]->wff
// quant:Vvar:wff->wff
// fn:item[]->item
// pred:item[]->wff
// sep:{var@item|wff}->item
// rpl:{item|var@item}->item
// sub: #sb(wff|item,var,item;...var)
export enum NodeType {
    VAR, ATOM_ITEM, ATOM_WFF, LOGIC, QUANT, FN, PRED, SEP, RPL, SB
}
export enum AstType {
    WFF, ITEM, VAR // var is special item
}

export class AST {
    type: NodeType; nodes: AST[]; name: string; astType?: AstType;
    start?: number; end?: number;
    constructor(type: NodeType, name: string, ...nodes: AST[]) {
        this.type = type; this.name = name; this.nodes = nodes;
    }
    range(start?: number, end?: number) { this.start = start; this.end = end; return this; }
    clone(): AST {
        const nodes = this.nodes.map(e => e.clone());
        return new AST(this.type, this.name, ...nodes);
    }
    static atom(n: string) { return new AST(NodeType.ATOM, n); }
    isAtom() { return this.type === NodeType.ATOM ? this.name : null; }
    isLogic() { return this.type === NodeType.LOGIC; }
    isFn() { return this.type === NodeType.FN; }
    isPred() { return this.type === NodeType.PRED; }
    isSep() { return this.type === NodeType.SEP; }
    isRpl() { return this.type === NodeType.RPL; }
    isSb() { return this.type === NodeType.SB; }
    isQuant() { return this.type === NodeType.QUANT ? [this.name, ...this.nodes] : null; }
    calcType(astType: AstType) {
        this.astType ??= astType;
        if (this.astType !== astType) return { ast: this, expect: astType, got: this.astType };
        let n: string | null;
        if (n = this.isAtom()) {

        }
    }






    getVars(res: Set<string> = new Set) {
        const n = this.isAtom(); if (n) { res.add(n); return res; }
        for (const n of this.nodes) {
            n.getVars(res);
        }
        return res;
    }
}