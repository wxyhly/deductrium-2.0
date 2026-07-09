// atom:wff|item
// logic:wff[]->wff
// quant:Vvar:wff->wff
// fn:item[]->item
// pred:item[]->wff
// sep:{var@item|wff}->item
// rpl:{item|var@item}->item
// sub: #sb(wff|item,var,item;...var)
export var NodeType;
(function (NodeType) {
    NodeType[NodeType["VAR"] = 0] = "VAR";
    NodeType[NodeType["ATOM_ITEM"] = 1] = "ATOM_ITEM";
    NodeType[NodeType["ATOM_WFF"] = 2] = "ATOM_WFF";
    NodeType[NodeType["LOGIC"] = 3] = "LOGIC";
    NodeType[NodeType["QUANT"] = 4] = "QUANT";
    NodeType[NodeType["FN"] = 5] = "FN";
    NodeType[NodeType["PRED"] = 6] = "PRED";
    NodeType[NodeType["SEP"] = 7] = "SEP";
    NodeType[NodeType["RPL"] = 8] = "RPL";
    NodeType[NodeType["SB"] = 9] = "SB";
})(NodeType || (NodeType = {}));
export var AstType;
(function (AstType) {
    AstType[AstType["WFF"] = 0] = "WFF";
    AstType[AstType["ITEM"] = 1] = "ITEM";
    AstType[AstType["VAR"] = 2] = "VAR"; // var is special item
})(AstType || (AstType = {}));
export class AST {
    type;
    nodes;
    name;
    astType;
    start;
    end;
    constructor(type, name, ...nodes) {
        this.type = type;
        this.name = name;
        this.nodes = nodes;
    }
    range(start, end) { this.start = start; this.end = end; return this; }
    clone() {
        const nodes = this.nodes.map(e => e.clone());
        return new AST(this.type, this.name, ...nodes);
    }
    static atom(n) { return new AST(NodeType.ATOM, n); }
    isAtom() { return this.type === NodeType.ATOM ? this.name : null; }
    isLogic() { return this.type === NodeType.LOGIC; }
    isFn() { return this.type === NodeType.FN; }
    isPred() { return this.type === NodeType.PRED; }
    isSep() { return this.type === NodeType.SEP; }
    isRpl() { return this.type === NodeType.RPL; }
    isSb() { return this.type === NodeType.SB; }
    isQuant() { return this.type === NodeType.QUANT ? [this.name, ...this.nodes] : null; }
    calcType(astType) {
        this.astType ??= astType;
        if (this.astType !== astType)
            return { ast: this, expect: astType, got: this.astType };
        let n;
        if (n = this.isAtom()) {
        }
    }
    getVars(res = new Set) {
        const n = this.isAtom();
        if (n) {
            res.add(n);
            return res;
        }
        for (const n of this.nodes) {
            n.getVars(res);
        }
        return res;
    }
}
//# sourceMappingURL=ast.js.map