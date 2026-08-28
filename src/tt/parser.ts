import { IParser, Token } from "../astrender.js";
import { AST, NodeType } from "./ast.js";

// ========== 符号映射 ==========
const symbolMap: Record<string, string> = {
    "→": ">", "¬": "~", "×": "\\x",
    "λ": "\\l", "Π": "\\p", "Σ": "\\s", "𝖶": "\\w",
    "≃": "~=", "≡": "==", "▪": "*",
    "⟦": "[[", "⟧": "]]",
    "𝒰": "\\u",   // 宇宙类型形成子（𝒰 = \u，如 \u 0、\u u、\u succ(u)）
};
const constMap: Record<string, string> = {
    "ℕ": "\\N", "ℤ": "\\Z", "ℚ": "\\Q", "ℝ": "\\R",
};
const strMap = Object.assign({}, symbolMap, constMap);
// 生成 ASCII → Unicode 输入替换表（含组合替换，同 HS 的 genAscii2unicodeTable）：
// 例如 ~= → ≃，但 ~ 会先被替换成 ¬，故额外生成 ¬= → ≃；
// 返回 [ascii, unicode][] 按 ascii 长度降序（最长优先，如 ¬= 先于 ~）
function genAscii2unicodeTable(strMap: Record<string, string>): [string, string][] {
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
// 组合替换表（[ascii, unicode][]，含 ¬=→≃ 等）
const asciiToUnicodeArr: [string, string][] = genAscii2unicodeTable(strMap);
export const asciiToUnicode: Record<string, string> = Object.fromEntries(asciiToUnicodeArr);
const charSeps = '()[]{},;.~|:=+* \t\n';

// ========== token 分类（由系统表驱动，可动态更新） ==========
// 系统表 [type]/[ctor]/[ind]/[def] 规则中定义的原子名集合。
// getTokens 遇到这些 atom 时把 token.type 设为 type/ctor/ind/def（→ CSS token-type 等）。
// 因为每次渲染都会 new TypeParser，这里用模块级集合共享；gui.ts 构建/刷新系统表时调用 setTokenCategories。
const tokenCategories = {
    type: new Set<string>(),
    ctor: new Set<string>(),
    ind: new Set<string>(),
    def: new Set<string>(),
};
export function setTokenCategories(cats: {
    type?: Iterable<string>, ctor?: Iterable<string>, ind?: Iterable<string>, def?: Iterable<string>,
}) {
    tokenCategories.type = new Set(cats.type ?? []);
    tokenCategories.ctor = new Set(cats.ctor ?? []);
    tokenCategories.ind = new Set(cats.ind ?? []);
    tokenCategories.def = new Set(cats.def ?? []);
}
// 宇宙相关 token：\u/\U/𝒰（宇宙形成子）、\u@/U@/U@:（层级排序）、Uu/Uv/U_/U0..（𝒰 u 等）、@0/@succ/@max（层级字面量）
function isUniverseToken(text: string): boolean {
    if (text === '\\u' || text === '\\U' || text === '\\u@' || text === '\\U@') return true;
    if (text === 'U' || text === 'U@' || text === 'U@:') return true;
    if (text === '@succ' || text === '@max') return true;
    if (/^@\d+$/.test(text)) return true;                    // @0 @1...
    if (/^U[a-z_]\w*$/.test(text) || /^U\d+$/.test(text)) return true;   // Uu Uv U_ U0
    return false;
}
// 解构的 ind_xxx 恒为 token-ind（即使来自 [def] 别名的 ind_Bool := @ind_Bool ?u）
function isIndName(text: string): boolean {
    return text.startsWith('ind_') || text.startsWith('@ind_');
}

export class TypeParser implements IParser {
    private tokens: Token[] = [];
    private tokensWithSpaces: Token[] = [];
    private cursor: number = 0;
    private token!: Token;
    // 输入替换：ASCII 输入 → Unicode 显示（含组合替换，如 ~= → ≃、¬= → ≃）
    inputReplacements: [string, string][] = asciiToUnicodeArr;

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
            // 2. 定义相等：=== / ==（≡ 的 ASCII 写法；GUI 输入替换也会把 == 换成 ≡）
            if (unicodeText.startsWith('===', pos) || unicodeText.startsWith('==', pos)) {
                const len = unicodeText.startsWith('===', pos) ? 3 : 2;
                tokens.push({ type: 'sym', text: '==', displayText: '≡', start: pos, end: pos + len });
                pos += len; continue;
            }
            // 3. :=
            if (unicodeText.startsWith(':=', pos)) {
                tokens.push({ type: 'sym', text: ':=', displayText: ':=', start: pos, end: pos + 2 });
                pos += 2; continue;
            }
            // 4. 单字符分隔符
            if (charSeps.includes(unicodeText[pos])) {
                tokens.push({ type: "(){}|[]".includes(unicodeText[pos]) ? 'layer' : 'sym', text: unicodeText[pos], displayText: unicodeText[pos], start: pos, end: pos + 1 });
                pos++; continue;
            }
            // 4. atom（绑定符符号 Π/λ/Σ/𝖶 出现在词中间时并入原子，如 ind_Σ；
            //    箭头/相等/其它符号仍切分，保证 nat→nat、x=y 正常）
            const start = pos;
            while (pos < unicodeText.length && !charSeps.includes(unicodeText[pos])) {
                const sym = Object.keys(symbolMap).find(k => unicodeText.startsWith(k, pos));
                if (!sym) { pos++; continue; }
                if (["Π", "λ", "Σ", "𝖶"].includes(sym) && pos > start) { pos += sym.length; continue; }
                break;
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
        // token 分类（高亮）：
        //  - 宇宙层级表达式：𝒰（sym \u）及其后随的层级（数字角标/变量/@/succ/max/(...)）→ universe
        //  - 系统表 [type]/[ctor]/[ind]/[def] 定义的原子 → 对应类别；自然数字面量（0/1/5...）→ ctor
        let uLevel = 0; // 0=不在宇宙层级表达式；1=刚见到 𝒰；2=见到 succ/max 待 (；3=在 (…) 内
        for (const t of this.tokens) {
            if (t.type === 'space') continue;
            if (t.type === 'sym' && (t.text === '\\u' || t.text === '\\U')) {
                // 𝒰 宇宙形成子
                t.type = 'universe';
                uLevel = 1;
                continue;
            }
            if (uLevel > 0) {
                if (t.type === 'atom') {
                    // 层级：数字角标/变量/@/succ/max
                    t.type = 'universe';
                    if (t.text === 'succ' || t.text === 'max') uLevel = 2;
                    continue;
                }
                if (t.type === 'sym') {
                    if (t.text === '(') { uLevel = 3; continue; }
                    if (t.text === ')') { uLevel = uLevel === 3 ? 1 : 0; continue; }
                    if (t.text === ',' && uLevel === 3) continue;
                    uLevel = 0;   // : → > . ≡ 等结束层级表达式，回落到普通分类
                } else {
                    uLevel = 0;
                }
            }
            if (t.type === 'atom') {
                if (/^\d+$/.test(t.text)) t.type = 'ctor';   // 自然数字面量
                else if (isUniverseToken(t.text)) t.type = 'universe';
                else if (isIndName(t.text) || tokenCategories.ind.has(t.text)) t.type = 'ind';
                else if (tokenCategories.type.has(t.text)) t.type = 'type';
                else if (tokenCategories.ctor.has(t.text)) t.type = 'ctor';
                else if (tokenCategories.def.has(t.text)) t.type = 'def';
            }
        }
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
                    const ast2 = new AST(NodeType.PROP, ':=', ast, colNode).range(ast.start!, colNode.end!);
                    opToken.parentAST = ast2;
                    return ast2;
                }
                const ast2 = new AST(NodeType.PROP, op, ast, right).range(ast.start!, right.end!);
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
            // 右结合：a→b→c = a→(b→c)（函数类型标准结合性）
            const right = this.type();
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

        // 宇宙：\u / \U / 𝒰（后随层级）、\u@（层级排序）、\usucc/\umax（层级运算）
        // 兼容 hott 写法：U（=𝒰0）、U@（层级排序）、Uu/Uv/U_/U0..（=𝒰 u 等，由 kast 处理）
        const uTok = token.text;
        const isUniverseKw = uTok === '\\u' || uTok === '\\U' || uTok === '\\u@' || uTok === '\\U@' ||
            uTok.startsWith('\\usucc') || uTok.startsWith('\\umax') ||
            uTok.startsWith('\\Usucc') || uTok.startsWith('\\Umax');
        if (isUniverseKw) {
            const start = token.start;
            // 层级排序：\u@ / \U@
            if (uTok === '\\u@' || uTok === '\\U@') {
                this.nextSym();
                return new AST(NodeType.ATOM, 'U@').range(start, token.end);
            }
            // 层级运算：\usucc(...) / \umax(...)
            const isSucc = uTok.startsWith('\\usucc') || uTok.startsWith('\\Usucc');
            const isMax = uTok.startsWith('\\umax') || uTok.startsWith('\\Umax');
            if (isSucc || isMax) {
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
                const ufn = new AST(NodeType.UFN, isSucc ? '\\usucc' : '\\umax', ...args).range(start, this.tokens[this.cursor - 2].end);
                ufnToken.parentAST = ufn;
                return ufn;
            }
            // 裸宇宙：\u / \U / 𝒰 —— 后随单个层级 atom（数字/变量/_）或 @（=层级排序）；无则 = 𝒰0
            this.nextSym();
            const nxt = this.token;
            if (nxt && nxt.text === '@') {
                this.nextSym();
                return new AST(NodeType.ATOM, 'U@').range(start, nxt.end);
            }
            // 𝒰 succ(...) / 𝒰 max(...)：把 succ/max 当作层级运算
            if (nxt && nxt.type === 'atom' && (nxt.text === 'succ' || nxt.text === 'max')) {
                const op = nxt.text;
                const opTok = nxt;
                this.nextSym();
                this.expectSym('(');
                const args: AST[] = [];
                if (!this.acceptSym(')')) {
                    args.push(this.type());
                    while (this.acceptSym(',')) args.push(this.type());
                    this.expectSym(')');
                }
                const ufn = new AST(NodeType.UFN, op === 'succ' ? '\\usucc' : '\\umax', ...args).range(start, this.tokens[this.cursor - 2].end);
                opTok.parentAST = ufn;
                return ufn;
            }
            let level: AST;
            if (nxt && nxt.type === 'atom' && /^[A-Za-z0-9_]+$/.test(nxt.text)) {
                level = new AST(NodeType.ATOM, nxt.text).range(nxt.start, nxt.end);
                this.nextSym();
            } else {
                level = new AST(NodeType.ATOM, '0').range(start, token.end);   // 裸 𝒰 = 𝒰0
            }
            return new AST(NodeType.U, '', level).range(start, level.end ?? token.end);
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