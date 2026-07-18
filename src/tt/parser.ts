import { IParser, Token } from "../astrender.js";
import { AST, NodeType } from "./ast.js";

// ========== 符号映射 ==========
const symbolMap: Record<string, string> = {
    "→": ">", "¬": "~", "×": "\\x",
    "λ": "\\l", "Π": "\\p", "Σ": "\\s", "𝖶": "\\w",   // 使用 Ⱳ 作为 W 的显示
    "≃": "~=", "≡": "==", "▪": "*",
    "⟦": "[[", "⟧": "]]"
};
const constMap: Record<string, string> = {
    "ℕ": "\\N", "ℤ": "\\Z", "ℚ": "\\Q", "ℝ": "\\R", "𝒰": "\\u",
};
export const asciiToUnicode: Record<string, string> = Object.fromEntries(
    Object.entries(symbolMap).map(([uni, asc]) => [asc, uni]).concat(
        Object.entries(constMap).map(([uni, asc]) => [asc, uni])).sort((b, a) => b[1].length - a[1].length)
);
const charSeps = '()[]{},;.~|:=+* \t\n';

export class TypeParser implements IParser {
    private tokens: Token[] = [];
    private tokensWithSpaces: Token[] = [];
    private cursor: number = 0;
    private token!: Token;
    inputReplacements: [string, string][] = Object.entries(symbolMap).concat(Object.entries(constMap)).sort((a, b) => b[1].length - a[1].length);

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
            for (const uni of Object.keys(symbolMap)) {
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
            if (unicodeText.startsWith(':=', pos)) {
                tokens.push({ type: 'sym', text: ':=', displayText: ':=', start: pos, end: pos + 2 });
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
    getTokens(): Token[] {
        return this.tokens;
    }
    parse(unicodeText: string): AST {
        this.tokens = this.tokenize(unicodeText);
        this.tokensWithSpaces = this.tokens;
        this.tokens = this.tokens.filter(e => e.type !== "space");
        this.cursor = 0;
        let ast: AST | undefined;
        this.nextSym();
        try {
            ast = this.sentence();
        } catch { }
        this.tokens = this.tokensWithSpaces;
        return ast!;
    }
    private sentence() {
        const ast = this.type();
        if (this.cursor < this.tokens.length) {
            const tok = this.token;
            if (tok.text === ':' || tok.text === ':=' || tok.text === '==') {
                const op = tok.text;
                const opToken = tok;
                this.nextSym();
                const right = this.type();
                if (!right) throw new Error("Incomplete expression");
                if (op === ':=' && this.token?.text === ':') {
                    // def := expr : type
                    this.nextSym();
                    const type = this.type();
                    const colNode = new AST(NodeType.SYM, ':', right, type).range(right.start!, type.end!);
                    const ast2 = new AST(NodeType.PRED, ':=', ast, colNode).range(ast.start!, colNode.end!);
                    opToken.parentAST = ast2;
                    return ast2;
                }
                const ast2 = new AST(NodeType.PRED, op, ast, right).range(ast.start!, right.end!);
                opToken.parentAST = ast2;
                return ast2;
            }
        }
        return ast;
    }

    private type(): AST {
        let left = this.typeTerm0();
        if (this.token && this.token.text === '>') {
            const op = this.token.text;
            const opToken = this.token;
            const start = left.start;
            this.nextSym();
            const right = this.typeTerm0();
            const ast = new AST(NodeType.SYM, op, left, right).range(start, right.end);
            opToken.parentAST = ast;
            return ast;
        }
        return left;
    }

    private typeTerm0(): AST {
        let left = this.typeTerm0half();
        while (this.token && this.token.text === '+') {
            const opToken = this.token;
            const start = left.start;
            this.nextSym();
            const right = this.typeTerm0half();
            left = new AST(NodeType.SYM, '+', left, right).range(start!, right.end!);
            opToken.parentAST = left;
        }
        return left;
    }

    private typeTerm0half(): AST {
        let left = this.typeTerm1();
        while (this.token && this.token.text === '\\x') {   // 原来是 X，现在 \x
            const opToken = this.token;
            const start = left.start;
            this.nextSym();
            const right = this.typeTerm1();
            left = new AST(NodeType.SYM, 'x', left, right).range(start!, right.end!);
            opToken.parentAST = left;
        }
        return left;
    }

    private typeTerm1(): AST {
        let left = this.typeTerm2();
        while (this.token && (this.token.text === '~' || this.token.text === '~=' || this.token.text === '=')) {
            const opToken = this.token;
            const start = left.start;
            this.nextSym();
            const right = this.typeTerm2();
            left = new AST(NodeType.SYM, opToken.text, left, right).range(start!, right.end!);
            opToken.parentAST = left;
        }
        return left;
    }

    private typeTerm2(): AST {
        let left = this.typeTerm();
        while (this.token && this.token.text === '*') {
            const opToken = this.token;
            const start = left.start;
            this.nextSym();
            const right = this.typeTerm();
            left = new AST(NodeType.SYM, '*', left, right).range(start!, right.end!);
            opToken.parentAST = left;
        }
        return left;
    }

    private typeTerm(): AST {
        // 处理 apply：连续两个表达式（空格分隔）
        let val = this.typeTerm3();
        while (this.token && this.token.text !== '>' && this.token.text !== ':' &&
            this.token.text !== '==' && this.token.text !== ':=' && this.token.text !== '~=' &&
            this.token.text !== '=' && this.token.text !== '*' && this.token.text !== '+' &&
            this.token.text !== '\\x' && this.token.text !== '~' && this.token.text !== ']' &&
            this.token.text !== ']]' && this.token.text !== ')' && this.token.text !== ',' &&
            this.token.text !== '.') {
            const func = val;
            const spaceStart = this.tokensWithSpaces.indexOf(this.tokens[this.cursor - 2]);
            const spaceEnd = this.tokensWithSpaces.indexOf(this.token);
            const arg = this.typeTerm3();
            const app = new AST(NodeType.APP, '', func, arg).range(func.start!, arg.end!);
            this.tokensWithSpaces.slice(spaceStart + 1, spaceEnd).forEach(e => e.parentAST = app);
            val = app;
        }
        return val;
    }

    private typeTerm3(): AST {
        const token = this.token;
        const tokens = new Set([token]);
        if (!token) throw new Error("Unexpected end of input");

        // 括号分组
        if (token.text === '(') {
            const start = token.start;
            this.nextSym();
            const inner = this.type();
            // 检查是否 (x: T) -> ...
            if (inner.type === NodeType.ATOM && this.token && this.token.text === ':') {
                // 变为 Pi 类型
                tokens.add(this.tokens[this.cursor - 2]);
                tokens.add(this.token);
                const varNode = inner;
                this.nextSym();
                const type = this.type();
                tokens.add(this.token);
                this.expectSym(')');
                tokens.add(this.token);
                this.expectSym('>');
                const body = this.type();
                const bound = new AST(NodeType.BOUND, '\\p', varNode, type, body).range(start!, body.end!);
                tokens.forEach(t => t.parentAST = bound);
                return bound;
            } else {
                tokens.add(this.token);
                const args: AST[] = [];
                while (this.token.text === ",") {
                    this.nextSym();
                    args.push(this.type());
                    tokens.add(this.token);
                }
                this.expectSym(')');
                if (args.length) {
                    const ast = new AST(NodeType.SYM, "()", ...args).range(start, this.tokens[this.cursor - 2].end);
                    tokens.forEach(t => t.parentAST = ast);
                    return ast;
                }
                const ast = inner.range(start, this.tokens[this.cursor - 2].end);
                tokens.forEach(t => t.parentAST = ast);
                return ast;
            }
        }

        // [[ ]]
        if (token.text === '[[') {
            const start = token.start;
            this.nextSym();
            const inner = this.type();
            this.expectSym(']]');
            return new AST(NodeType.SYM, '[[]]', inner).range(start, this.tokens[this.cursor - 2].end);
        }

        // [ ]
        if (token.text === '[') {
            const start = token.start;
            this.nextSym();
            const inner = this.type();
            this.expectSym(']');
            return new AST(NodeType.SYM, '[]', inner).range(start, this.tokens[this.cursor - 2].end);
        }

        // BOUND 绑定符
        if (token.text === '\\l' || token.text === '\\p' || token.text === '\\s' || token.text === '\\w') {
            const start = token.start;
            this.nextSym();
            const varName = this.token;
            const tokens = [token, varName];
            this.expectVar();   // 变量
            const param = new AST(NodeType.ATOM, varName.text).range(varName.start, varName.end);
            varName.type = 'atom-var';   // 标记
            let paramType: AST | undefined;
            if (this.token.text === ":") {
                tokens.push(this.token);
                this.nextSym();
                paramType = this.type();
            }
            tokens.push(this.token);

            if (!(this.acceptSym('.') || this.acceptSym(','))) throw new Error(`. or , expected after bound variable type`);
            const body = this.type();
            const bound = new AST(NodeType.BOUND, token.text, param, paramType ?? new AST(NodeType.ATOM, ""), body).range(start, body.end!);
            tokens.forEach(e => e.parentAST = bound);   // 操作符 token 高亮整个 bound
            return bound;
        }

        // \U, \Usucc, \Umax
        if (token.text.startsWith('\\U')) {
            const start = token.start;
            if (token.text === '\\U') {
                this.nextSym();
                const index = this.parseAtom();   // 期望数字或变量
                return new AST(NodeType.U, '', index).range(start, index.end!);
            } else if (token.text === '\\Usucc' || token.text === '\\Umax') {
                const ufnToken = token;
                this.nextSym();
                this.expectSym('(');
                const args: AST[] = [];
                if (!this.acceptSym(')')) {
                    args.push(this.type());   // 参数可以是表达式
                    while (this.acceptSym(',')) {
                        args.push(this.type());
                    }
                    this.expectSym(')');
                }
                const ufn = new AST(NodeType.UFN, token.text, ...args).range(start, this.tokens[this.cursor - 2].end);
                ufnToken.parentAST = ufn;
                return ufn;
            }
        }

        // 变量
        return this.parseAtom();
    }

    private parseAtom(): AST {
        const token = this.token;
        if (token.type === 'atom') {
            this.nextSym();
            return new AST(NodeType.ATOM, token.text).range(token.start, token.end);
        }
        throw new Error(`Expected atom, but got ${token.text}`);
    }

    // 辅助：跳过空格取下一 token
    private nextSym() {
        do {
            this.token = this.tokens[this.cursor++];
        } while (this.token && this.token.type === 'space');
    }

    private acceptSym(s: string): boolean {
        if (this.token && this.token.text === s) {
            this.nextSym();
            return true;
        }
        return false;
    }

    private expectSym(s: string) {
        if (!this.acceptSym(s)) throw new Error(`Expected "${s}" but got "${this.token?.text}"`);
    }

    private acceptVar(): boolean {
        if (this.token && (this.token.type === 'atom')) {
            this.nextSym();
            return true;
        }
        return false;
    }

    private expectVar() {
        if (!this.acceptVar()) throw new Error(`Expected variable, but got "${this.token?.text}"`);
    }
}