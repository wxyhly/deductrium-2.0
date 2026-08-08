export var NodeType;
(function (NodeType) {
    NodeType[NodeType["ATOM"] = 0] = "ATOM";
    NodeType[NodeType["SYM"] = 1] = "SYM";
    NodeType[NodeType["BOUND"] = 2] = "BOUND";
    NodeType[NodeType["U"] = 3] = "U";
    NodeType[NodeType["APP"] = 4] = "APP";
    NodeType[NodeType["PRED"] = 5] = "PRED";
    NodeType[NodeType["UFN"] = 6] = "UFN";
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