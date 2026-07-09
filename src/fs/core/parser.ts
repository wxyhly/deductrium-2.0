import { IParser, Token } from "../../ast.js";
import { AST, AstType, NodeType } from "./ast.js";

// ========== 符号映射 ==========
const symbolMap: Record<string, string> = {
    "∀": "\\A", "∃": "\\E", "∃!": "\\E!", "∈": "@", "¬": "~",
    "→": ">", "↔": "<>", "⊢": "|-",
    "⊂": "\\<", "∪": "\\U", "∩": "\\I",
    "∧": "\\&", "∨": "\\|", "ω": "\\omega",
    "≤": "<=", "≥": "→=", "∣": "\\div",
    "ℕ": "\\N", "ℤ": "\\Z", "ℚ": "\\Q", "ℝ": "\\R", "×": "\\x"
};
// 反向映射（用于输入替换）
export const asciiToUnicode: Record<string, string> = Object.fromEntries(
    Object.entries(symbolMap).map(([uni, asc]) => [asc, uni])
);
const charSeps = '()[]{},;|:=+* \t\n';
const predSyms = ["=", "@", "\\<", "<=", ">=", "\\div"];
// ========== ASTParser ==========
export class FSParser implements IParser {
    private tokens: Token[] = [];
    private cursor: number = 0;
    private token!: Token;
    inputReplacements: [string, string][] = Object.entries(symbolMap).sort((a, b) => b[1].length - a[1].length);

    // ---- 词法分析 ----
    private tokenize(unicodeText: string): Token[] {
        const tokens: Token[] = [];
        let pos = 0;
        while (pos < unicodeText.length) {
            if (unicodeText[pos] === ' ' || unicodeText[pos] === '\t' || unicodeText[pos] === '\n') {
                tokens.push({
                    type: 'space',
                    text: unicodeText[pos],          // 原样保留（一个空格、\t 或 \n）
                    displayText: unicodeText[pos],   // 显示也原样
                    start: pos,
                    end: pos + 1
                });
                pos++;
                continue;
            }

            // 1. Unicode 符号（symbolMap 的键）
            let matchedUni: string | null = null;
            for (const uni of Object.keys(symbolMap)) {
                if (unicodeText.startsWith(uni, pos)) { matchedUni = uni; break; }
            }
            if (matchedUni) {
                tokens.push({
                    type: 'keyword',
                    text: symbolMap[matchedUni],
                    displayText: matchedUni,
                    start: pos,
                    end: pos + matchedUni.length
                });
                pos += matchedUni.length;
                continue;
            }

            // 2. 特殊关键字 {}
            if (unicodeText.startsWith('{}', pos)) {
                tokens.push({ type: 'const', text: '{}', displayText: '{}', start: pos, end: pos + 2 });
                pos += 2; continue;
            }

            // 3. 单字符分隔符
            if (charSeps.includes(unicodeText[pos])) {
                tokens.push({ type: ":=".includes(unicodeText[pos]) ? 'keyword' : 'operator', text: unicodeText[pos], displayText: unicodeText[pos], start: pos, end: pos + 1 });
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
                type: /^\$.*$/.test(word) ? 'replvar' : /^\#.*$/.test(word) ? 'locvar' : /^[a-z].*$/.test(word) ? 'variable' : /^[A-Z].*$/.test(word) ? 'wff' : 'const',
                text: word,
                displayText: word,
                start,
                end: pos
            });
        }
        return tokens;
    }
    getTokens() {
        return this.tokens;
    }

    // ---- 解析入口 ----
    parse(unicodeText: string, rootType: AstType): AST {
        this.tokens = this.tokenize(unicodeText);
        this.cursor = 0;
        this.nextSym();
        if (rootType === AstType.WFF) {
            return this.parseWFF();
        } else {
            return this.parseITEM();
        }
    }

    // ---- 内部辅助 ----
    private nextSym() { this.token = this.tokens[this.cursor++]; }
    private acceptSym(s: string): boolean {
        if (this.token && this.token.text === s) { this.nextSym(); return true; }
        return false;
    }
    private expectSym(s: string) {
        if (!this.acceptSym(s)) throw new Error(`Expected "${s}" but got "${this.token?.text}"`);
    }
    private save() { return this.cursor; }
    private restore(pos: number) { this.cursor = pos; this.token = this.tokens[this.cursor - 1]; }

    // ---- WFF 递归下降 ----
    private parseWFF(): AST {
        return this.parseImplies();
    }

    private parseImplies(): AST {
        let left = this.parseOr();
        if (this.token && (this.token.text === '>' || this.token.text === '<>')) {
            const op = this.token.text;
            this.nextSym();
            const right = this.parseImplies();   // 右结合
            return new AST(NodeType.LOGIC, op, left, right).range(left.start, right.end);
        }
        return left;
    }

    private parseOr(): AST {
        let left = this.parseAnd();
        while (this.token && this.token.text === '|') {
            this.nextSym();
            const right = this.parseAnd();
            left = new AST(NodeType.LOGIC, '|', left, right).range(left.start, right.end);
        }
        return left;
    }

    private parseAnd(): AST {
        let left = this.parseNot();
        while (this.token && this.token.text === '&') {
            this.nextSym();
            const right = this.parseNot();
            left = new AST(NodeType.LOGIC, '&', left, right).range(left.start, right.end);
        }
        return left;
    }

    private parseNot(): AST {
        if (this.token && this.token.text === '~') {
            const left = this.token.start;
            this.nextSym();
            const right = this.parseNot();
            return new AST(NodeType.LOGIC, '~',).range(left, right.end);
        }
        return this.parseQuant();
    }

    private parseQuant(): AST {
        if (this.token && (this.token.text === '\\A' || this.token.text === '\\E' || this.token.text === '\\E!')) {
            const left = this.token.start;
            const quant = this.token.text;
            this.nextSym();
            const varNode = this.parseATOM_ITEM(true);
            if (this.acceptSym(':')) { /* 可选冒号 */ }
            const body = this.parseWFF();
            return new AST(NodeType.QUANT, quant, varNode, body).range(left, body.end);
        }
        return this.parseAtomicWFF();
    }

    private parseAtomicWFF(): AST {
        let bracket = false;
        // 括号
        if (this.token.text === '(') {
            this.nextSym();
            bracket = true;
        }
        const token = this.token;
        if (token.type === 'wff' || token.type === 'replvar') {
            if (token.type === 'replvar') {
                if (this.tokens[this.cursor]?.type === "keyword" && (predSyms.includes(this.tokens[this.cursor].text))) {
                    token.type = 'replvar-item';
                    const name = token.text;
                    this.nextSym();
                    const left = new AST(NodeType.ATOM_ITEM, name).range(token.start, token.end);
                    if (this.token && (predSyms.includes(this.token.text))) {
                        const op = this.token.text;
                        this.nextSym();
                        const right = this.parseITEM();
                        if (bracket) this.expectSym(")");
                        return new AST(NodeType.PRED, op, left, right).range(left.start, right.end);
                    }
                }
                token.type = 'replvar-wff';
            }
            const name = token.text;
            this.nextSym();
            if (bracket) this.expectSym(")");
            
            return new AST(NodeType.ATOM_WFF, name).range(token.start, token.end);
        }

        // 中缀谓词 = @ ：先解析左项，若后面跟 = 或 @，则构造谓词
        let left = this.parseITEM();
        if (this.token && (predSyms.includes(this.token.text))) {
            const op = this.token.text;
            this.nextSym();
            const right = this.parseITEM();
            if (bracket) this.expectSym(")");
            return new AST(NodeType.PRED, op, left, right).range(left.start, right.end);
        }

        // 谓词应用 fn(...)
        if (this.token && this.token.text === '(') {
            // 此时 left 是一个 ATOM（函数名），需要转换为谓词应用
            const fnName = left.name;
            this.token.type = 'wff';
            this.nextSym();  // 跳过 '('
            const args: AST[] = [];
            if (!this.acceptSym(')')) {
                args.push(this.parseITEM());
                while (this.acceptSym(',')) {
                    args.push(this.parseITEM());
                }
                this.expectSym(')');
                if (bracket) this.expectSym(")");
            }
            return new AST(NodeType.PRED, fnName, ...args).range(left.start, this.token.end);
        }

        // 其他情况：{ } 或 #sb 开头
        // if (this.token && this.token.text === '{') {
        //     return this.parseBrace(AstType.WFF);
        // }
        if (this.token && this.token.text.startsWith('#sb')) {
            return this.parseSb(AstType.WFF);
        }

        throw new Error(`Expected a formula, but got "${this.token?.text}"`);
    }

    // ---- ITEM 递归下降 ----
    private parseITEM(): AST {
        return this.parseInfixFn();
    }

    private parseInfixFn(): AST {
        let left = this.parseFnAppl();
        while (this.token && (this.token.text === '\\U' || this.token.text === '\\I')) {
            const op = this.token.text;
            this.nextSym();
            const right = this.parseFnAppl();
            left = new AST(NodeType.FN, op, left, right);
        }
        return left;
    }

    private parseFnAppl(): AST {
        let atom = this.parseAtomicITEM();
        // 函数应用 f(...)
        while (this.token && this.token.text === '(') {
            this.nextSym();
            const args: AST[] = [];
            if (!this.acceptSym(')')) {
                args.push(this.parseITEM());
                while (this.acceptSym(',')) {
                    args.push(this.parseITEM());
                }
                this.expectSym(')');
            }
            atom = new AST(NodeType.FN, atom.name, ...args);
        }
        return atom;
    }

    private parseATOM_ITEM(isVar: boolean): AST {
        if (!this.token) throw new Error("Unexpected end of input");
        if (this.token.type === 'variable' || this.token.type === 'replvar' || this.token.type === 'locvar') {
            const name = this.token.text;
            if (this.token.type === 'replvar') this.token.type = isVar ? 'replvar-var' : 'replvar-item';
            this.nextSym();
            return new AST(NodeType.VAR, name);
        }
        throw new Error(`Expected a variable, but got: "${this.token.text}"`);
    }
    private parseAtomicITEM(): AST {
        if (!this.token) throw new Error("Unexpected end of input");
        // atom
        if (this.token.type === 'variable' || this.token.type === 'replvar' || this.token.type === 'locvar') {
            return this.parseATOM_ITEM(false);
        }

        // 一元负号 / 正号
        if (this.token.text === '-' || this.token.text === '+') {
            const sign = this.token.text;
            this.nextSym();
            const atom = this.parseATOM_ITEM(false);
            return new AST(NodeType.ATOM_ITEM, sign + atom.name);
        }

        // 括号
        if (this.token.text === '(') {
            this.nextSym();
            const inner = this.parseITEM();
            this.expectSym(')');
            return inner;
        }

        // 大括号
        // if (this.token.text === '{') {
        //     return this.parseBrace(AstType.ITEM);
        // }

        // 替换函数
        if (this.token.text.startsWith('#sb')) {
            return this.parseSb(AstType.ITEM);
        }

        throw new Error(`Unexpected token in item: "${this.token.text}"`);
    }

    // ---- 大括号解析（SEP / RPL） ----
    // private parseBrace(outerContext: AstType): AST {
    //     this.expectSym('{');
    //     const posAfterBrace = this.save();

    //     // 策略：先尝试按 WFF 解析左部分，若失败则回退用 ITEM
    //     // 尝试1：左侧为 WFF（可能是 SEP 的 x@A 或 RPL 的 x@B）
    //     try {
    //         const leftWFF = this.parseWFF();
    //         if (this.token && this.token.text === '|') {
    //             this.nextSym();
    //             const rightWFF = this.parseWFF();
    //             this.expectSym('}');
    //             // 判断是 SEP 还是 RPL
    //             // SEP: 左侧形如 PRED name='@' 且左子节点为变量
    //             if (leftWFF.type === NodeType.PRED && leftWFF.name === '@' &&
    //                 leftWFF.nodes[0].type === NodeType.ATOM) {
    //                 const x = leftWFF.nodes[0];
    //                 const A = leftWFF.nodes[1];
    //                 return new AST(NodeType.SEP, '', x, A, rightWFF);
    //             }
    //             // RPL: 右侧形如 PRED name='@' 且左子节点为变量，左侧为 ITEM
    //             // 但此时左侧是 WFF，不可能为 ITEM，所以 RPL 无法在此分支生成
    //             // 如果不符合 SEP，报错
    //             throw new Error("Invalid brace expression");
    //         }
    //     } catch { /* 回退 */ }
    //     this.restore(posAfterBrace);

    //     // 尝试2：左侧为 ITEM，右侧为 WFF（RPL: {A | x@B}）
    //     const leftITEM = this.parseITEM();
    //     this.expectSym('|');
    //     const rightWFF = this.parseWFF();
    //     this.expectSym('}');
    //     // 右侧必须是 PRED name='@' 且左子节点为变量
    //     if (rightWFF.type === NodeType.PRED && rightWFF.name === '@' &&
    //         rightWFF.nodes[0].type === NodeType.ATOM) {
    //         const x = rightWFF.nodes[0];
    //         const B = rightWFF.nodes[1];
    //         return new AST(NodeType.RPL, '', leftITEM, x, B);
    //     }

    //     throw new Error("Invalid brace expression");
    // }

    // ---- 替换函数 #sb(a,b,c,x1...xn) ----
    private parseSb(expectedType: AstType): AST {
        this.nextSym(); // 吃掉 '#sb' 标识
        this.expectSym('(');
        const args: AST[] = [];

        // 第一个参数：根据 expectedType 解析 WFF 或 ITEM
        args.push(expectedType === AstType.WFF ? this.parseWFF() : this.parseITEM());
        this.expectSym(',');
        // 第二个参数：变量
        args.push(this.parseAtomicITEM());
        args[args.length - 1].astType = AstType.VAR;
        this.expectSym(',');
        // 第三个参数：ITEM
        args.push(this.parseITEM());
        // 后续可选变量
        while (this.acceptSym(',')) {
            const v = this.parseAtomicITEM();
            v.astType = AstType.VAR;
            args.push(v);
        }
        this.expectSym(')');
        // name 为空字符串
        return new AST(NodeType.SB, '', ...args);
    }
}