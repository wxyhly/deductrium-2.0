// atom:wff|item|unknown (U is used only in assertion #nf(-,xx,xx))
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
export var NodeType;
(function (NodeType) {
    NodeType[NodeType["ATOM_ITEM"] = 0] = "ATOM_ITEM";
    NodeType[NodeType["ATOM_WFF"] = 1] = "ATOM_WFF";
    NodeType[NodeType["ATOM_UKNOWN"] = 2] = "ATOM_UKNOWN";
    NodeType[NodeType["LOGIC"] = 3] = "LOGIC";
    NodeType[NodeType["QUANT"] = 4] = "QUANT";
    NodeType[NodeType["BOUNDED_QUANT"] = 5] = "BOUNDED_QUANT";
    NodeType[NodeType["FN"] = 6] = "FN";
    NodeType[NodeType["PRED"] = 7] = "PRED";
    NodeType[NodeType["SEP"] = 8] = "SEP";
    NodeType[NodeType["RPL"] = 9] = "RPL";
    NodeType[NodeType["CLASS"] = 10] = "CLASS";
    NodeType[NodeType["SB"] = 11] = "SB";
    NodeType[NodeType["ASSERT"] = 12] = "ASSERT";
    // rule: wff,wff|-wff
    // cmd: str dname ast ast
    NodeType[NodeType["CMD"] = 13] = "CMD";
    NodeType[NodeType["RULE"] = 14] = "RULE";
    NodeType[NodeType["NODE_DNAME"] = 15] = "NODE_DNAME";
    NodeType[NodeType["ATOM_DNAME"] = 16] = "ATOM_DNAME";
})(NodeType || (NodeType = {}));
export class AST {
    type;
    nodes;
    name;
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
    copyFrom(ast) {
        this.type = ast.type;
        this.name = ast.name;
        this.nodes = ast.nodes.map(e => e.clone());
    }
    isAtom() { return this.type === NodeType.ATOM_UKNOWN || this.type === NodeType.ATOM_ITEM || this.type === NodeType.ATOM_WFF ? this.name : undefined; }
    becomeItem() {
        if (this.type === NodeType.ATOM_UKNOWN || this.type === NodeType.ATOM_WFF && this.name.match(/^[^A-Z]/))
            this.type = NodeType.ATOM_ITEM;
        if (this.type === NodeType.SB)
            this.nodes[0].becomeItem();
    }
    isReplvar() {
        const n = this.isAtom();
        return n && n.startsWith("$") ? n : undefined;
    }
    isLocalvar() {
        const n = this.isAtom();
        return n && n.startsWith("#") ? n : undefined;
    }
    getReplvarsArrayByOrder(res = []) {
        if (this.isReplvar() && !res.includes(this.name)) {
            res.push(this.name);
            return res;
        }
        for (const node of this.nodes) {
            node.getReplvarsArrayByOrder(res);
        }
        return res;
    }
    getReplvars(res = new Map()) {
        if (this.isReplvar()) {
            if (this.type === NodeType.ATOM_UKNOWN)
                return res;
            const isItem = this.type === NodeType.ATOM_ITEM;
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
    getLocalvars(res = new Set) {
        if (this.isLocalvar()) {
            res.add(this.name);
            return res;
        }
        for (const node of this.nodes) {
            node.getLocalvars(res);
        }
        return res;
    }
    hasSbFn() {
        if (this.type === NodeType.SB)
            return true;
        for (const node of this.nodes) {
            if (node.hasSbFn())
                return true;
        }
        return false;
    }
    equal(ast) {
        if (this === ast)
            return true;
        if (this.name !== ast.name)
            return false;
        if (this.type !== ast.type)
            return false;
        if (this.nodes?.length !== ast.nodes?.length)
            return false;
        if (this.nodes?.length) {
            for (let i = 0; i < ast.nodes.length; i++) {
                if (!this.nodes[i].equal(ast.nodes[i]))
                    return false;
            }
        }
        return true;
    }
    match(pattern, res = {}) {
        if (pattern.isReplvar()) {
            if (res[pattern.name]) {
                if (!this.equal(res[pattern.name]))
                    throw FSError.matchFail(this, res[pattern.name], pattern.name);
            }
            else
                res[pattern.name] = this.clone();
            return res;
        }
        if (this.name !== pattern.name || this.type !== pattern.type || this.nodes?.length !== pattern.nodes?.length) {
            throw FSError.matchFail(this, pattern);
        }
        if (this.nodes?.length) {
            for (let i = 0; i < this.nodes.length; i++) {
                this.nodes[i].match(pattern.nodes?.[i], res);
            }
        }
        return res;
    }
    mut_replaceByMatchTable(mt) {
        if (this.isAtom()) {
            const replacement = mt[this.name];
            if (replacement)
                this.copyFrom(replacement);
            return this;
        }
        this.nodes.forEach(node => node.mut_replaceByMatchTable(mt));
        return this;
    }
    checkVAR() {
        if ((this.type !== NodeType.ATOM_UKNOWN && this.type !== NodeType.ATOM_ITEM) || !this.name.match(/^[a-z\$\#]/))
            throw FSError.isNotVar(this);
    }
    checkITEM() {
        if ((this.type === NodeType.ATOM_ITEM || this.type === NodeType.ATOM_UKNOWN) && !this.name.match(/^[A-Z]/))
            return;
        if (this.type === NodeType.FN) {
            for (let i = 0; i < this.nodes.length; i++) {
                this.nodes[i].checkITEM();
            }
            return;
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
            for (let i = 3; i < this.nodes.length; i++) {
                this.nodes[i].checkVAR();
            }
            return;
        }
        throw FSError.isNotItem(this);
    }
    checkAssert() {
        if (this.type !== NodeType.ASSERT)
            throw FSError.isNotAssertion(this);
        if (this.name === "of") {
            if (this.nodes.length !== 2)
                throw FSError.isNotAssertion(this);
            if (this.nodes[1].type !== NodeType.FN || this.nodes[1].name !== " ")
                throw FSError.isNotAssertion(this);
            this.nodes[1].nodes.forEach(e => e.checkVAR());
            return;
        }
        else if (this.name === "nf") {
            if (this.nodes.length !== 3)
                throw FSError.isNotAssertion(this);
            if (this.nodes[1].type !== NodeType.FN || this.nodes[1].name !== " ")
                throw FSError.isNotAssertion(this);
            this.nodes[1].nodes.forEach(e => e.checkVAR());
            if (this.nodes[2].type !== NodeType.FN || this.nodes[2].name !== " ")
                throw FSError.isNotAssertion(this);
            this.nodes[2].nodes.forEach(e => e.checkVAR());
            return;
        }
        else if (this.name === "dt") {
            this.nodes.forEach(e => e.checkVAR());
            return;
        }
        throw FSError.isNotAssertion(this);
    }
    checkWFF() {
        if (this.type === NodeType.ATOM_WFF && this.name.match(/^[A-Z\$]/))
            return;
        if (this.type === NodeType.LOGIC) {
            for (let i = 0; i < this.nodes.length; i++) {
                this.nodes[i].checkWFF();
            }
            return;
        }
        if (this.type === NodeType.QUANT) {
            this.nodes[0].checkVAR();
            this.nodes[1].checkWFF();
            return;
        }
        if (this.type === NodeType.PRED) {
            for (let i = 0; i < this.nodes.length; i++) {
                this.nodes[i].checkITEM();
            }
            return;
        }
        if (this.type === NodeType.SB) {
            this.nodes[0].checkWFF();
            this.nodes[1].checkVAR();
            this.nodes[2].checkITEM();
            for (let i = 3; i < this.nodes.length; i++) {
                this.nodes[i].checkVAR();
            }
            return;
        }
        throw FSError.isNotWFF(this);
    }
}
//# sourceMappingURL=ast.js.map