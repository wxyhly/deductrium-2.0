import { AST, NodeType } from "./ast.js";
import { F, T, U } from "./bool3.js";
// ========== 符号映射 ==========
const symbolMap = {
    "∀": "\\a", "∀ₛ": "\\a@", "∃ₛ": "\\e@", "∃!ₛ": "\\e!@", "∃": "\\e", "∃!": "\\e!", "∈": "@", "¬": "~",
    "→": ">", "↔": "<>", "⊢": "|-", "＼": "\\\\",
    "⊂": "\\c", "＜": "\\<", "＞": "\\>", "∪": "\\u", "∩": "\\i",
    "∧": "/\\", "∨": "\\/",
    "≤": "\\<=", "≥": "\\>=", "∣": "\\d", "×": "\\x"
};
const constMap = {
    "ℕ": "\\N", "ℤ": "\\Z", "ℚ": "\\Q", "ℝ": "\\R",
    "ω": "\\o", "Ω": "\\O", "ℵ": "\\Al", "δ": "\\del", "ε": "\\ep", "ξ": "\\ksi", "π": "\\pi", "φ": "\\ph", "ψ": "\\ps", "θ": "\\th", "λ": "\\l", "μ": "\\m", "σ": "\\si", "τ": "\\t"
};
const strMap = Object.assign(Object.assign({}, symbolMap), constMap);
const symbolsUnicode = Object.keys(symbolMap).sort((a, b) => b.length - a.length);
const ascii2unicode = genAscii2unicodeTable(strMap);
function genAscii2unicodeTable(strMap) {
    const arr = Array.from(Object.entries(strMap)).sort((a, b) => a[1].length - b[1].length);
    const res = {};
    for (let i = 0; i < arr.length; i++) {
        const [u, a] = arr[i];
        res[a] = u;
        for (let j = 0; j < i; j++) {
            const na = a.replace(arr[j][1], arr[j][0]);
            if (na !== a && na !== u)
                res[na] = u;
        }
    }
    return Array.from(Object.entries(res)).sort((a, b) => b[0].length - a[0].length);
}
const charSeps = '()[]{},;|:=+*! \t\n';
const predSyms = ["=", "@", "\\<", "\\>", "\\<=", "\\>=", "\\d"];
const setSyms = ["\\u", "\\i", "+", "-", "\\\\"];
export class FSParser {
    tokens = [];
    cursor = 0;
    token;
    inputReplacements = ascii2unicode;
    // ---- 词法分析（保持原有，但注意空格 token） ----
    tokenize(unicodeText) {
        const tokens = [];
        let pos = 0;
        while (pos < unicodeText.length) {
            if (unicodeText[pos] === ' ' || unicodeText[pos] === '\t' || unicodeText[pos] === '\n') {
                tokens.push({
                    type: 'space',
                    text: unicodeText[pos],
                    displayText: unicodeText[pos],
                    start: pos,
                    end: pos + 1
                });
                pos++;
                continue;
            }
            // 1. Unicode 符号
            let matchedUni = null;
            for (const uni of symbolsUnicode) {
                if (unicodeText.startsWith(uni, pos)) {
                    matchedUni = uni;
                    break;
                }
            }
            if (matchedUni) {
                tokens.push({
                    type: 'sym',
                    text: symbolMap[matchedUni],
                    displayText: matchedUni,
                    start: pos,
                    end: pos + matchedUni.length
                });
                pos += matchedUni.length;
                continue;
            }
            // 2. {}
            if (unicodeText.startsWith('{}', pos)) {
                tokens.push({ type: 'atom', text: '{}', displayText: '{}', start: pos, end: pos + 2 });
                pos += 2;
                continue;
            }
            // 3. 单字符分隔符
            if (charSeps.includes(unicodeText[pos])) {
                tokens.push({ type: "(){}|[]".includes(unicodeText[pos]) ? 'layer' : 'sym', text: unicodeText[pos], displayText: unicodeText[pos], start: pos, end: pos + 1 });
                pos++;
                continue;
            }
            // 4. atom
            const start = pos;
            while (pos < unicodeText.length &&
                !charSeps.includes(unicodeText[pos]) &&
                !Object.keys(symbolMap).includes(unicodeText[pos])) {
                pos++;
            }
            const word = unicodeText.slice(start, pos);
            tokens.push({
                type: "atom",
                text: word,
                displayText: word,
                start,
                end: pos
            });
        }
        return tokens;
    }
    getTokens() {
        for (const t of this.tokens) {
            const word = t.text;
            if (t.type === "atom" && /^\$.*$/.test(word)) {
                t.type = 'replvar';
            }
            else if (t.type === "atom-item") {
                t.type = /^\$.*$/.test(word) ? 'replvar-item' : /^\#.*$/.test(word) ? 'atom-locvar' : /^[a-z].*$/.test(word) ? 'atom-free-var' : /^[A-Z].*$/.test(word) ? 'atom' : 'atom-const';
            }
            else if (t.type === "atom-wff") {
                t.type = /^\$.*$/.test(word) ? 'replvar-wff' : /^\#.*$/.test(word) || /^[a-z].*$/.test(word) ? 'atom' : /^[A-Z].*$/.test(word) ? 'atom-wff' : 'atom';
            }
            else if (t.type === "atom-free-var") {
                t.type = /^\$.*$/.test(word) ? 'replvar-var' : /^\#.*$/.test(word) ? 'atom-locvar' : /^[a-z].*$/.test(word) ? 'atom-free-var' : /^[A-Z].*$/.test(word) ? 'atom' : 'atom';
            }
            else if (t.type === "pred" && t.text === "#sb") {
                t.type = 'sb';
            }
        }
        return this.tokens;
    }
    // ---- 解析入口 ----
    parse(unicodeText, isItem) {
        this.tokens = this.tokenize(unicodeText);
        const tokensWithSpaces = this.tokens;
        this.tokens = this.tokens.filter(e => e.type !== "space");
        this.cursor = 0;
        this.nextSym();
        let res;
        try {
            if (isItem === T) {
                res = this.parseITEM(T);
            }
            else {
                res = this.parseWFF(isItem);
            }
        }
        catch (e) { }
        this.tokens = tokensWithSpaces;
        return res;
    }
    nextSym() { this.token = this.tokens[this.cursor++]; }
    prevSym() { this.token = this.tokens[this.cursor - 2]; this.cursor--; }
    acceptSym(s) {
        if (this.token && this.token.text === s) {
            this.nextSym();
            return true;
        }
        return false;
    }
    expectSym(s) {
        if (!this.acceptSym(s))
            throw new Error(`Expected "${s}" but got "${this.token?.text}"`);
    }
    parseWFF(isItem) {
        return this.parseImplies(isItem);
    }
    parseImplies(isItem) {
        let left = this.parseOr(isItem);
        if (this.token && (this.token.text === '>' || this.token.text === '<>')) {
            const op = this.token.text;
            const opToken = this.token;
            const start = left.start;
            this.nextSym();
            const right = this.parseImplies(F);
            const ast = new AST(NodeType.LOGIC, op, left, right).range(start, right.end);
            opToken.parentAST = ast;
            return ast;
        }
        return left;
    }
    parseOr(isItem) {
        let left = this.parseAnd(isItem);
        while (this.token && this.token.text === '\\/') {
            const opToken = this.token; // 操作符 token
            const start = left.start;
            this.nextSym();
            const right = this.parseAnd(F);
            const ast = new AST(NodeType.LOGIC, '|', left, right).range(start, right.end);
            opToken.parentAST = ast;
            left = ast;
        }
        return left;
    }
    parseAnd(isItem) {
        let left = this.parseNot(isItem);
        while (this.token && this.token.text === '/\\') {
            const opToken = this.token;
            const start = left.start;
            this.nextSym();
            const right = this.parseNot(F);
            const ast = new AST(NodeType.LOGIC, '&', left, right).range(start, right.end);
            opToken.parentAST = ast;
            left = ast;
        }
        return left;
    }
    parseNot(isItem) {
        if (this.token && this.token.text === '~') {
            const opToken = this.token;
            const start = opToken.start;
            this.nextSym();
            const right = this.parseNot(F);
            const ast = new AST(NodeType.LOGIC, '~', right).range(start, right.end);
            opToken.parentAST = ast;
            return ast;
        }
        return this.parseQuant(isItem);
    }
    parseQuant(isItem) {
        if (this.token && (this.token.text === '\\a' || this.token.text === '\\e' || this.token.text === '\\e!' || this.token.text === '\\a@' || this.token.text === '\\e@' || this.token.text === '\\e!@')) {
            const quantToken = this.token;
            const start = quantToken.start;
            const quant = quantToken.text;
            this.nextSym();
            const varToken = this.token;
            const varNode = this.parseVariable();
            let colonToken = this.token;
            if (!this.acceptSym(':')) {
                colonToken = undefined;
            }
            const body = this.parseQuant(F);
            const ast = new AST(NodeType.QUANT, quant, varNode, body).range(start, body.end);
            quantToken.parentAST = ast;
            varToken.parentAST = ast;
            if (colonToken)
                colonToken.parentAST = ast;
            return ast;
        }
        if (this.token?.text === "~") {
            return this.parseNot(F);
        }
        return this.parsePred(isItem);
    }
    remarkItem(left, leftToken) {
        // 必须先检测括号
        if (leftToken.text === "(") {
            const innerToken = this.tokens[this.tokens.indexOf(leftToken) + 1];
            this.remarkItem(left, innerToken);
        }
        else if (left.type === NodeType.ATOM_WFF) {
            left.type = NodeType.ATOM_ITEM;
            leftToken.type = "atom-item";
        }
        if (leftToken.type === "pred") {
            leftToken.type = "fn";
            if (leftToken.text === "#sb") {
                leftToken.type = "sb";
                // #sb ( ...
                const innerToken = this.tokens[this.tokens.indexOf(leftToken) + 2];
                const innerAst = left.nodes[0];
                this.remarkItem(innerAst, innerToken);
            }
        }
    }
    parsePred(isItem) {
        const leftToken = this.token;
        const left = this.parseITEM(isItem === T ? T : U);
        // 中缀谓词
        if (this.token && predSyms.includes(this.token.text)) {
            this.remarkItem(left, leftToken);
            const opToken = this.token;
            const op = opToken.text;
            const start = left.start;
            this.nextSym();
            const right = this.parseITEM(T);
            const ast = new AST(NodeType.PRED, op, left, right).range(start, right.end);
            opToken.parentAST = ast;
            return ast;
        }
        return left;
    }
    // ---- ITEM 的递归下降（带中缀集合运算） ----
    parseITEM(isItem) {
        let leftToken = this.token;
        let left = this.parseFn(isItem);
        while (this.token && setSyms.includes(this.token.text)) {
            this.remarkItem(left, leftToken);
            if (isItem === F)
                throw new Error("Set operations only allowed in item context");
            const opToken = this.token;
            const start = left.start;
            this.nextSym();
            const right = this.parseFn(T);
            const ast = new AST(NodeType.FN, opToken.text, left, right).range(start, right.end);
            opToken.parentAST = ast;
            left = ast;
        }
        return left;
    }
    parseFn(isItem) {
        const token = this.token;
        let left;
        const tokens = new Set([token]);
        const leftToken = this.token;
        if (token.type === 'atom') {
            left = this.parseVarAtom(isItem === T);
        }
        if (this.token?.text === '(') {
            tokens.add(this.token);
            if (left) {
                // fn(xxx,xxx)
                const start = left.start;
                this.nextSym();
                const args = [];
                if (isItem === T) {
                    leftToken.type = "fn";
                }
                else {
                    leftToken.type = "pred";
                }
                if (left.name === "#sb") {
                    args.push(isItem === T ? this.parseITEM(T) : this.parseWFF(isItem));
                    tokens.add(this.token);
                    this.expectSym(',');
                    args.push(this.parseVariable());
                    tokens.add(this.token);
                    this.expectSym(',');
                    args.push(this.parseITEM(T));
                    tokens.add(this.token);
                    // 后续可选scope变量
                    while (this.acceptSym(',')) {
                        if (this.acceptSym(")")) {
                            this.prevSym();
                            break;
                        }
                        args.push(this.parseVariable());
                        tokens.add(this.token);
                    }
                    tokens.add(this.token);
                    this.expectSym(')');
                    const ast = new AST(NodeType.SB, '', ...args).range(start, this.tokens[this.cursor - 2].end);
                    tokens.forEach(t => t.parentAST = ast);
                    return ast;
                }
                const closeparen = this.token;
                if (!this.acceptSym(')')) {
                    args.push(this.parseITEM(T));
                    tokens.add(this.token);
                    while (this.acceptSym(',')) {
                        if (this.acceptSym(")")) {
                            this.prevSym();
                            break;
                        }
                        args.push(this.parseITEM(T));
                    }
                    tokens.add(this.token);
                    this.expectSym(')');
                }
                else
                    tokens.add(closeparen);
                const ast = new AST(isItem === T ? NodeType.FN : NodeType.PRED, left.name, ...args).range(start, this.tokens[this.cursor - 2].end);
                tokens.forEach(t => t.parentAST = ast);
                return ast;
            }
            else {
                const start = token.start;
                this.nextSym();
                const leftToken = this.token;
                const inner = isItem === T ? this.parseITEM(T) : this.parseWFF(isItem);
                const args = [];
                let first = true;
                tokens.add(this.token);
                while (this.acceptSym(',')) {
                    if (first) {
                        first = false;
                        this.remarkItem(inner, leftToken);
                    }
                    if (this.acceptSym(")")) {
                        this.prevSym();
                        break;
                    }
                    args.push(this.parseITEM(T));
                    tokens.add(this.token);
                }
                tokens.add(this.token);
                this.expectSym(')');
                if (args.length) {
                    const ast = new AST(NodeType.FN, "()", ...args).range(start, this.tokens[this.cursor - 2].end);
                    tokens.forEach(t => t.parentAST = ast);
                    return ast;
                }
                const ast = inner.range(start, this.tokens[this.cursor - 2].end);
                tokens.forEach(t => t.parentAST = ast);
                return ast;
            }
        }
        if (!left && this.token?.text === '{') {
            const start = this.token.start;
            tokens.add(this.token);
            this.nextSym();
            if (this.token.type === "atom") {
                this.nextSym();
                //{x@y|wff}
                if (this.token?.text === "@") {
                    this.prevSym();
                    tokens.add(this.token);
                    const variable = this.parseVariable();
                    tokens.add(this.token);
                    this.nextSym();
                    const set = this.parseITEM(T);
                    tokens.add(this.token);
                    this.expectSym("|");
                    const wff = this.parseWFF(F);
                    tokens.add(this.token);
                    this.expectSym("}");
                    const ast = new AST(NodeType.SEP, "", variable, set, wff).range(start, this.tokens[this.cursor - 2].end);
                    tokens.forEach(e => e.parentAST = ast);
                    return ast;
                }
                //{x|wff}
                if (this.token?.text === "|") {
                    this.prevSym();
                    tokens.add(this.token);
                    const variable = this.parseVariable();
                    tokens.add(this.token);
                    this.nextSym();
                    const wff = this.parseWFF(F);
                    tokens.add(this.token);
                    this.expectSym("}");
                    const ast = new AST(NodeType.CLASS, "", variable, wff).range(start, this.tokens[this.cursor - 2].end);
                    tokens.forEach(e => e.parentAST = ast);
                    return ast;
                }
                this.prevSym();
            }
            const first = this.parseITEM(T);
            const args = [];
            tokens.add(this.token);
            while (this.acceptSym(',')) {
                if (this.acceptSym("}")) {
                    this.prevSym();
                    break;
                }
                args.push(this.parseITEM(T));
                tokens.add(this.token);
            }
            // {xx|x@y}
            if (!args.length && this.acceptSym("|")) {
                tokens.add(this.token);
                const variable = this.parseVariable();
                tokens.add(this.token);
                this.expectSym("@");
                const item = this.parseITEM(T);
                tokens.add(this.token);
                this.expectSym("}");
                const ast = new AST(NodeType.RPL, "{}", first, variable, item).range(start, this.tokens[this.cursor - 2].end);
                tokens.forEach(e => e.parentAST = ast);
                return ast;
            }
            tokens.add(this.token);
            // {xx,xx}
            this.expectSym("}");
            const ast = new AST(NodeType.FN, "{}", first, ...args).range(start, this.tokens[this.cursor - 2].end);
            tokens.forEach(e => e.parentAST = ast);
            return ast;
        }
        if (left)
            return left;
        throw new Error(`Unexpected token in item: "${token.text}"`);
    }
    // 解析变量/替换变量/局部变量，根据 isItem 决定节点类型
    parseVarAtom(isItem) {
        const token = this.token;
        const start = token.start;
        let nodeType;
        let name = token.text;
        if (token.type === 'atom') {
            if (!isItem) {
                token.type = 'atom-wff';
                nodeType = NodeType.ATOM_WFF;
            }
            else {
                token.type = 'atom-item';
                nodeType = NodeType.ATOM_ITEM;
            }
            this.nextSym();
            return new AST(nodeType, name).range(start, token.end);
        }
        throw "";
    }
    parseVariable() {
        const token = this.token;
        if (!token || (token.type !== 'atom')) {
            throw new Error(`Expected variable, but got "${token?.text}"`);
        }
        token.type = "atom-free-var";
        const start = token.start;
        this.nextSym();
        return new AST(NodeType.VAR, token.text).range(start, token.end);
    }
}
//# sourceMappingURL=parser.js.map