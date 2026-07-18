export var NodeType;
(function (NodeType) {
    NodeType[NodeType["ATOM"] = 127] = "ATOM";
    NodeType[NodeType["SYM"] = 128] = "SYM";
    NodeType[NodeType["BOUND"] = 129] = "BOUND";
    NodeType[NodeType["U"] = 130] = "U";
    NodeType[NodeType["APP"] = 131] = "APP";
    NodeType[NodeType["PRED"] = 132] = "PRED";
    NodeType[NodeType["UFN"] = 133] = "UFN";
})(NodeType || (NodeType = {}));
export class AST {
    type;
    nodes;
    name;
    start;
    end;
    range(start, end) { this.start = start; this.end = end; return this; }
    constructor(type, name, ...nodes) {
        this.type = type;
        this.name = name;
        this.nodes = nodes;
    }
    clone() {
        const nodes = this.nodes.map(e => e.clone());
        return new AST(this.type, this.name, ...nodes);
    }
}
//# sourceMappingURL=ast.js.map