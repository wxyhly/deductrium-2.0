export enum NodeType {
    ATOM=127, SYM, BOUND, U, APP, PRED, UFN
}

export class AST {
    type: NodeType; nodes: AST[]; name: string;
    start?: number; end?: number;
    range(start?: number, end?: number) { this.start = start; this.end = end; return this; }
    constructor(type: NodeType, name: string, ...nodes: AST[]) {
        this.type = type; this.name = name; this.nodes = nodes;
    }
    clone(): AST {
        const nodes = this.nodes.map(e => e.clone());
        return new AST(this.type, this.name, ...nodes);
    }
}