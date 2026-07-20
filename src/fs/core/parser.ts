import { IParser, Token } from "../../astrender.js";
import { AST, NodeType } from "./ast.js";
import { Bool3, F, T, U } from "./bool3.js";
import { FSError } from "./error.js";

// ========== 符号映射 ==========
const symbolMap: Record<string, string> = {
    "∀": "\\a", "∀ₛ": "\\a@", "∃ₛ": "\\e@", "∃!ₛ": "\\e!@", "∃": "\\e", "∃!": "\\e!", "∈": "@", "¬": "~",
    "→": ">", "↔": "<>", "⊢": "|-", "＼": "\\\\",
    "⊂": "\\c", "＜": "\\<", "＞": "\\>", "∪": "\\u", "∩": "\\i",
    "∧": "/\\", "∨": "\\/",
    "≤": "\\<=", "≥": "\\>=", "∣": "\\d", "×": "\\x"
};
const constMap: Record<string, string> = {
    "ℕ": "\\N", "ℤ": "\\Z", "ℚ": "\\Q", "ℝ": "\\R",
    "ω": "\\o", "Ω": "\\O", "ℵ": "\\Al", "δ": "\\del", "ε": "\\ep", "ξ": "\\ksi", "π": "\\pi", "φ": "\\ph", "ψ": "\\ps", "θ": "\\th", "λ": "\\l", "μ": "\\m", "σ": "\\si", "τ": "\\t"
};
const strMap = Object.assign(Object.assign({}, symbolMap), constMap);
const symbolsUnicode = Object.keys(symbolMap).sort((a, b) => b.length - a.length);
const ascii2unicode: Array<[string, string]> = genAscii2unicodeTable(strMap);
function genAscii2unicodeTable(strMap: Record<string, string>) {
    const arr = Array.from(Object.entries(strMap)).sort((a, b) => a[1].length - b[1].length);
    const res: Record<string, string> = {};
    for (let i = 0; i < arr.length; i++) {
        const [u, a] = arr[i];
        res[a] = u;
        for (let j = 0; j < i; j++) {
            const na = a.replace(arr[j][1], arr[j][0]);
            if (na !== a && na !== u) res[na] = u;
        }
    }
    return Array.from(Object.entries(res)).sort((a, b) => b[0].length - a[0].length);
}

const charSeps = '()[]{},;|:=+*! \t\n';
const predSyms = ["=", "@", "\\<", "\\>", "\\<=", "\\>=", "\\d"];
const setSyms = ["\\u", "\\i", "+", "-", "\\\\"];

export class FSParser implements IParser {
    private tokens: Token[] = [];
    private cursor: number = 0;
    private token!: Token;
    inputReplacements: [string, string][] = ascii2unicode;

    // ---- 词法分析（保持原有，但注意空格 token） ----
    private tokenize(unicodeText: string): Token[] {
        const tokens: Token[] = [];
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
            let matchedUni: string | null = null;
            for (const uni of symbolsUnicode) {
                if (unicodeText.startsWith(uni, pos)) { matchedUni = uni; break; }
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
                pos += 2; continue;
            }
            // 3. 单字符分隔符
            if (charSeps.includes(unicodeText[pos])) {
                tokens.push({ type: "(){}|[]".includes(unicodeText[pos]) ? 'layer' : 'sym', text: unicodeText[pos], displayText: unicodeText[pos], start: pos, end: pos + 1 });
                pos++; continue;
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
            } else if (t.type === "atom-item") {
                t.type = /^\$.*$/.test(word) ? 'replvar-item' : /^\#.*$/.test(word) ? 'atom-locvar' : /^[a-z].*$/.test(word) ? 'atom-free-var' : /^[A-Z].*$/.test(word) ? 'atom' : 'atom-const'
            } else if (t.type === "atom-wff") {
                t.type = /^\$.*$/.test(word) ? 'replvar-wff' : /^\#.*$/.test(word) || /^[a-z].*$/.test(word) ? 'atom' : /^[A-Z].*$/.test(word) ? 'atom-wff' : 'atom';
            } else if (t.type === "atom-free-var") {
                t.type = /^\$.*$/.test(word) ? 'replvar-var' : /^\#.*$/.test(word) ? 'atom-locvar' : /^[a-z].*$/.test(word) ? 'atom-free-var' : /^[A-Z].*$/.test(word) ? 'atom' : 'atom';
            } else if (t.type === "pred" && t.text === "#sb") {
                t.type = 'sb';
            }
        }
        return this.tokens;
    }

    // ---- 解析入口 ----
    parse(unicodeText: string, type: 'assert' | 'wff' | 'item' | 'ast' | 'cmd' | 'rule'): AST {
        this.tokens = this.tokenize(unicodeText);
        const tokensWithSpaces = this.tokens;
        this.tokens = this.tokens.filter(e => e.type !== "space");
        this.cursor = 0;
        this.nextSym();
        let res: AST;
        try {
            switch (type) {
                case 'ast': res = this.parseWFF(U); break;
                case 'wff': res = this.parseWFF(F); break;
                case 'item': res = this.parseITEM(T); break;
                case 'rule': res = this.nextRule(); break;
            }
        } catch { }
        this.tokens = tokensWithSpaces;
        return res!;
    }
    nextRule() {
        const start = this.cursor - 1;
        let conds: AST[] = [];
        let symTokens: Set<Token> = new Set;
        let paren = this.acceptSym("(");
        while (this.token) {
            if (this.token.text === "|-") break;
            conds.push(this.parseWFF(F));
            if (this.token.text === "|-") break;
            if (this.token.text !== ",") throw "parse rule failed";
            symTokens.add(this.token);
            this.nextSym();
        }
        if (this.token.text !== "|-") throw "parse rule failed";
        symTokens.add(this.token);
        this.nextSym();
        const conc = this.parseWFF(F);
        if (paren) this.expectSym(")");

        const ast = new AST(NodeType.RULE, "", ...conds, conc).range(start, this.tokens[this.cursor - 2].end);
        symTokens.forEach(e => e.parentAST = ast);
        return ast;
    }


    private nextSym() { this.token = this.tokens[this.cursor++]; }
    private prevSym() { this.token = this.tokens[this.cursor - 2]; this.cursor--; }
    private acceptSym(s: string): boolean {
        if (this.token && this.token.text === s) { this.nextSym(); return true; }
        return false;
    }
    private expectSym(s: string) {
        if (!this.acceptSym(s)) throw new Error(`Expected "${s}" but got "${this.token?.text}"`);
    }

    private parseWFF(isItem: Bool3): AST {
        return this.parseImplies(isItem);
    }

    private parseImplies(isItem: Bool3): AST {
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

    private parseOr(isItem: Bool3): AST {
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

    private parseAnd(isItem: Bool3): AST {
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

    private parseNot(isItem: Bool3): AST {
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

    private parseQuant(isItem: Bool3): AST {
        if (this.token && (this.token.text === '\\a' || this.token.text === '\\e' || this.token.text === '\\e!' || this.token.text === '\\a@' || this.token.text === '\\e@' || this.token.text === '\\e!@')) {
            const quantToken = this.token;
            const start = quantToken.start;
            const quant = quantToken.text;
            this.nextSym();
            const varToken = this.token;
            const varNode = this.parseVariable();
            let symTokens: Token[] = [];
            let domainNode: AST | undefined;
            if ((this.token.text as string) === "@" || (this.token.text as string) === ":") symTokens.push(this.token);
            if (this.acceptSym("@")) {
                this.parseITEM(T);
                if ((this.token.text as string) === ":") symTokens.push(this.token);
            }
            this.acceptSym(':');
            const body = this.parseQuant(F);
            const ast = (domainNode ?
                new AST(NodeType.BOUNDED_QUANT, quant, varNode, domainNode, body) :
                new AST(NodeType.QUANT, quant, varNode, body)
            ).range(start, body.end);
            quantToken.parentAST = ast;
            varToken.parentAST = ast;

            symTokens.forEach(e => e.parentAST = ast);
            return ast;
        }
        if (this.token?.text === "~") {
            return this.parseNot(F);
        }
        return this.parsePred(isItem);
    }
    private remarkItem(left: AST, leftToken: Token) {
        if (leftToken.text === "(") {
            const innerToken = this.tokens[this.tokens.indexOf(leftToken) + 1];
            this.remarkItem(left, innerToken);
        } else if (left.type === NodeType.ATOM_WFF) {
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
    private parsePred(isItem: Bool3): AST {
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
    private parseITEM(isItem: Bool3): AST {
        let leftToken = this.token;
        let left = this.parseFn(isItem);
        while (this.token && setSyms.includes(this.token.text)) {
            this.remarkItem(left, leftToken);
            if (isItem === F) throw new Error("Set operations only allowed in item context");
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

    private parseFn(isItem: Bool3): AST {
        const token = this.token;
        let left: AST | undefined;
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
                const args: AST[] = [];
                if (isItem === T) {
                    leftToken.type = "fn";
                } else {
                    leftToken.type = "pred";
                }
                if (left.name === "#sb") {
                    args.push(isItem === T ? this.parseITEM(T) : this.parseWFF(isItem));
                    tokens.add(this.token); this.expectSym(',');
                    args.push(this.parseVariable());
                    tokens.add(this.token); this.expectSym(',');
                    args.push(this.parseITEM(T));
                    tokens.add(this.token);
                    // 后续可选scope变量
                    while (this.acceptSym(',')) {
                        if (this.acceptSym(")")) { this.prevSym(); break; }
                        args.push(this.parseVariable());
                        tokens.add(this.token);
                    }
                    tokens.add(this.token); this.expectSym(')');
                    const ast = new AST(NodeType.SB, '', ...args).range(start, this.tokens[this.cursor - 2].end);
                    tokens.forEach(t => t.parentAST = ast);
                    return ast;
                }
                const closeparen = this.token;
                if (!this.acceptSym(')')) {
                    args.push(this.parseITEM(T));
                    tokens.add(this.token);
                    while (this.acceptSym(',')) {
                        if (this.acceptSym(")")) { this.prevSym(); break; }
                        args.push(this.parseITEM(T));
                    }
                    tokens.add(this.token);
                    this.expectSym(')');
                } else tokens.add(closeparen);
                const ast = new AST(isItem === T ? NodeType.FN : NodeType.PRED, left.name, ...args).range(start, this.tokens[this.cursor - 2].end);
                tokens.forEach(t => t.parentAST = ast);
                return ast;
            } else {
                const start = token.start;
                this.nextSym();
                const leftToken = this.token;
                const inner = isItem === T ? this.parseITEM(T) : this.parseWFF(isItem);
                const args: AST[] = [];
                let first = true;
                tokens.add(this.token);
                while (this.acceptSym(',')) {
                    if (first) {
                        first = false;
                        this.remarkItem(inner, leftToken);
                    }
                    if (this.acceptSym(")")) { this.prevSym(); break; }
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
                if ((this.token?.text as string) === "@") {
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
                if ((this.token?.text as string) === "|") {
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
            const args: AST[] = [];
            tokens.add(this.token);
            while (this.acceptSym(',')) {
                if (this.acceptSym("}")) { this.prevSym(); break; }
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
                const ast = new AST(NodeType.RPL, "", first, variable, item).range(start, this.tokens[this.cursor - 2].end);
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
        if (left) return left;
        throw new Error(`Unexpected token in item: "${token.text}"`);
    }
    // 解析变量/替换变量/局部变量，根据 isItem 决定节点类型
    private parseVarAtom(isItem: boolean): AST {
        const token = this.token;
        const start = token.start;
        let nodeType: NodeType;
        let name = token.text;
        if (token.type === 'atom') {
            if (!isItem) {
                token.type = 'atom-wff';
                nodeType = NodeType.ATOM_WFF;
            } else {
                token.type = 'atom-item';
                nodeType = NodeType.ATOM_ITEM;
            }
            this.nextSym();
            return new AST(nodeType, name).range(start, token.end);
        }
        throw "";
    }
    private parseVariable(): AST {
        const token = this.token;
        if (!token || (token.type !== 'atom')) {
            throw new Error(`Expected variable, but got "${token?.text}"`);
        }
        token.type = "atom-free-var";
        const start = token.start;
        this.nextSym();
        return new AST(NodeType.VAR, token.text).range(start, token.end);
    }

    static stringyfy(ast: AST, parenthese: boolean): string {
        if (ast.type === NodeType.ATOM_ITEM || ast.type === NodeType.ATOM_WFF || ast.type === NodeType.VAR) return ast.name;
        const left = parenthese ? "(" : "";
        const right = parenthese ? ")" : "";
        if (ast.type === NodeType.LOGIC) {
            const a = ast.nodes[0];
            const b = ast.nodes[1];
            if (ast.name === ">" || ast.name === "<>") return left + FSParser.stringyfy(a, a.type === NodeType.LOGIC && (a.name === ">" || a.name === "<>")) + ast.name + FSParser.stringyfy(b, false) + right;
            if (ast.name === "\\/") return left + FSParser.stringyfy(a, a.type === NodeType.LOGIC && (a.name === ">" || a.name === "<>")) + ast.name + FSParser.stringyfy(b, b.type === NodeType.LOGIC && (b.name === ">" || b.name === "<>" || b.name === "\\/")) + right;
            if (ast.name === "/\\") return left + FSParser.stringyfy(a, a.type === NodeType.LOGIC && (a.name === ">" || a.name === "<>" || a.name === "\\/")) + ast.name + FSParser.stringyfy(b, b.type === NodeType.LOGIC && (b.name === ">" || b.name === "<>" || b.name === "\\/" || b.name === "/\\")) + right;
            if (ast.name === "~") return "~" + FSParser.stringyfy(a, a.type === NodeType.LOGIC && (a.name === ">" || a.name === "<>" || a.name === "\\/" || a.name === "/\\"));
        }
        if (ast.type === NodeType.QUANT || ast.type === NodeType.BOUNDED_QUANT) {
            const body = ast.nodes[ast.type === NodeType.QUANT ? 1 : 2];
            const bounded = ast.type === NodeType.BOUNDED_QUANT ? "@" + FSParser.stringyfy(ast.nodes[1], false) : "";
            return ast.name + ast.nodes[0].name + bounded + ":" + FSParser.stringyfy(body, body.type === NodeType.LOGIC && body.name !== "~");
        }
        if (ast.type === NodeType.FN) {
            if (setSyms.includes(ast.name)) {
                const a = ast.nodes[0];
                const b = ast.nodes[1];
                return left + FSParser.stringyfy(a, a.type === NodeType.FN && setSyms.includes(a.name)) + ast.name + b + right;
            }
            return ast.name === "()" || ast.name === "{}" ? "" : ast.name + (ast.name === "{}" ? "{" : "(") + ast.nodes.map(e => FSParser.stringyfy(e, false)).join(",") + (ast.name === "{}" ? "}" : ")");
        }
        if (ast.type === NodeType.PRED) {
            return `${FSParser.stringyfy(ast.nodes[0], false)}${ast.name}${FSParser.stringyfy(ast.nodes[1], false)}`;
        }
        if (ast.type === NodeType.SEP) {
            return `{${ast.nodes[0].name}@${FSParser.stringyfy(ast.nodes[1], false)}|${FSParser.stringyfy(ast.nodes[2], false)}}`;
        }
        if (ast.type === NodeType.CLASS) {
            return `{${ast.nodes[0].name}|${FSParser.stringyfy(ast.nodes[1], false)}}`;
        }
        if (ast.type === NodeType.RPL) {
            return `{${FSParser.stringyfy(ast.nodes[0], false)}|${ast.nodes[1].name}@${FSParser.stringyfy(ast.nodes[2], false)}}`;
        }
        if (ast.type === NodeType.RULE) {
            const conc = ast.nodes.pop()!;
            const str = ast.nodes.map(e => FSParser.stringyfy(e, false)).join(",") + "|-" + FSParser.stringyfy(conc, false);
            ast.nodes.push(conc);
            return str;
        }
        return "";
    }
}