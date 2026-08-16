// atom:wff|item|unknown (U is used only in assertion #nf(-,xx,xx))
// logic:wff[]->wff
// quant:Vvar:wff->wff
// bounded-quant:Vvar@item:wff->wff
// fn:item[]->item
// pred:item[]->wff
// sep:{var@item|wff}->item
// class:{var|wff}->item
// rpl:{item|var@item}->item
import { NodeType } from "../../asttype.js";
import { HSError } from "./error.js";
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
    getReplvarsNameArrayByOrder(res = []) {
        if (this.isReplvar() && !res.includes(this.name)) {
            res.push(this.name);
            return res;
        }
        for (const node of this.nodes) {
            node.getReplvarsNameArrayByOrder(res);
        }
        return res;
    }
    getReplvarVars(res = new Set, root = true) {
        let name = this.isReplvar();
        // root只有孤零零的atom不知道是不是变量
        if (name && !root) {
            res.add(name);
            return;
        }
        if (this.type === NodeType.SB) {
            this.nodes[1].getReplvarVars(res, false);
            this.nodes[3].nodes.forEach(e => e.getReplvarVars(res, false));
        }
        else if (this.type === NodeType.QUANT || this.type === NodeType.BOUNDED_QUANT || this.type === NodeType.SEP || this.type === NodeType.CLASS) {
            this.nodes[0].getReplvarVars(res, false);
        }
        else if (this.type === NodeType.RPL) {
            this.nodes[1].getReplvarVars(res, false);
        }
        else if (this.type === NodeType.ASSERT) {
            if (this.name === "dt")
                this.nodes.forEach(e => e.getReplvarVars(res, false));
            if (this.name === "nf" || this.name === "of")
                this.nodes[1].nodes.forEach(e => e.getReplvarVars(res, false));
            if (this.name === "nf")
                this.nodes[2].nodes.forEach(e => e.getReplvarVars(res, false));
        }
    }
    getReplvars(res = new Map()) {
        if (this.isReplvar()) {
            if (this.type === NodeType.ATOM_UKNOWN)
                return res;
            const isItem = this.type === NodeType.ATOM_ITEM;
            const oldIsItem = res.get(this.name);
            if (oldIsItem !== undefined && oldIsItem !== isItem) {
                throw HSError.isItemAndWff(this.name);
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
                    throw HSError.matchFail(this, res[pattern.name], pattern.name);
            }
            else
                res[pattern.name] = this.clone();
            return res;
        }
        if (this.name !== pattern.name || this.type !== pattern.type || this.nodes?.length !== pattern.nodes?.length) {
            throw HSError.matchFail(this, pattern);
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
    // 把ast中所有局部变量（#开头）按映射重命名，返回新的AST（不修改原ast）
    renameLocalVars_mut(map) {
        if (this.isLocalvar() && map.has(this.name)) {
            this.name = map.get(this.name);
        }
        else
            this.nodes.map(e => e.renameLocalVars_mut(map));
        return this;
    }
    checkVAR() {
        if ((this.type !== NodeType.ATOM_UKNOWN && this.type !== NodeType.ATOM_ITEM) || !this.name.match(/^[a-z\$\#]/))
            throw HSError.isNotVar(this);
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
            for (const q of this.nodes[3].nodes) {
                q.checkVAR();
            }
            return;
        }
        throw HSError.isNotItem(this);
    }
    checkAssert() {
        if (this.type !== NodeType.ASSERT)
            throw HSError.isNotAssertion(this);
        if (this.name === "of") {
            if (this.nodes.length !== 2)
                throw HSError.isNotAssertion(this);
            if (this.nodes[1].type !== NodeType.FN || this.nodes[1].name !== " ")
                throw HSError.isNotAssertion(this);
            this.nodes[1].nodes.forEach(e => e.checkVAR());
            return;
        }
        else if (this.name === "nf") {
            if (this.nodes.length !== 3)
                throw HSError.isNotAssertion(this);
            if (this.nodes[1].type !== NodeType.FN || this.nodes[1].name !== " ")
                throw HSError.isNotAssertion(this);
            this.nodes[1].nodes.forEach(e => e.checkVAR());
            if (this.nodes[2].type !== NodeType.FN || this.nodes[2].name !== " ")
                throw HSError.isNotAssertion(this);
            this.nodes[2].nodes.forEach(e => e.checkVAR());
            return;
        }
        else if (this.name === "dt") {
            this.nodes.forEach(e => e.checkVAR());
            return;
        }
        throw HSError.isNotAssertion(this);
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
            for (const q of this.nodes[3].nodes) {
                q.checkVAR();
            }
            return;
        }
        throw HSError.isNotWFF(this);
    }
}
//# sourceMappingURL=ast.js.map