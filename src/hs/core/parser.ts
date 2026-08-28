import { IParser, Token } from "../../astrender.js";
import { NodeType } from "../../asttype.js";
import { AST } from "./ast.js";
import { Bool3, F3, T3, U3 } from "./bool3.js";

// ========== 符号映射 ==========
const symbolMap: Record<string, string> = {
    "∀": "\\a", "∀ₛ": "\\a@", "∃ₛ": "\\e@", "∃!ₛ": "\\e!@", "∃": "\\e", "∃!": "\\e!", "∈": "@", "¬": "~",
    "→": ">", "↔": "<>", "⊢": "|-", "＼": "\\\\",
    "⊂": "\\c", "＜": "\\<", "＞": "\\>", "∪": "\\u", "∩": "\\i",
    "∧": "/\\", "∨": "\\/", "◇": "\\<>", "□": "\\[]",
    "≤": "\\<=", "≥": "\\>=", "∣": "\\d", "×": "\\x"
};
const constMap: Record<string, string> = {
    "ℕ": "\\N", "ℤ": "\\Z", "ℚ": "\\Q", "ℝ": "\\R",
    "ω": "\\o", "Ω": "\\O", "ℵ": "\\Al", "δ": "\\del", "ε": "\\ep", "ξ": "\\ksi", "π": "\\pi", "φ": "\\ph", "ψ": "\\ps", "θ": "\\th", "λ": "\\l", "μ": "\\m", "σ": "\\si", "τ": "\\t"
};
const strMap = Object.assign(Object.assign({}, symbolMap), constMap);
const symbolsUnicode = Object.keys(symbolMap).sort((a, b) => b.length - a.length);
// 排了顺序给输入替换用
const ascii2unicode: Array<[string, string]> = genAscii2unicodeTable(strMap);
// 原始对应关系给stringify用
const ascii2unicodeTable: Record<string, string> = Object.fromEntries(Object.entries(strMap).map(e => e.reverse()));
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

const charSeps = '()[]{},;|:=+*! \t\n\\';
const predSyms = ["=", "@", "\\<", "\\>", "\\<=", "\\>=", "\\d", "\\c"];
// 集合/算术二元运算（按优先级：∪ < ∩ < +- < *× < \\）
const setSyms = ["\\u", "\\i", "+", "-", "\\", "*", "\\x"];

// rulename parse rule:

const prefix = new Set("uvce<>");
const ruleCharSeps = "(,;\n \t:)";

// command parse rule:
interface CommandDef {
    params: Array<{ type: 'rulename' | 'atom_token' | 'ast', astType?: 'wff' | 'item', repeat?: boolean, optional?: boolean, separator?: string }>;
}
const commandDefs: Record<string, CommandDef> = {
    hyp: { params: [{ type: 'ast', astType: 'wff' }] },
    cond: { params: [{ type: 'ast', astType: 'wff' }] },
    var: { params: [{ type: 'ast', astType: 'item' }] },
    d: { params: [{ type: 'rulename' }, { type: 'ast', astType: 'wff', repeat: true }] },
    clear: { params: [] },
    b: { params: [] },
    pop: { params: [] },
    cd: { params: [{ type: 'ast', astType: 'item' }] },
    name: { params: [{ type: 'ast', astType: 'item' }, { type: 'ast', astType: 'item' }] },
    del: { params: [{ type: 'ast', astType: 'item' }] },
    dir: { params: [{ type: 'ast', astType: 'item' }] },
    m: { params: [{ type: 'rulename' }] },
    mcpt: { params: [{ type: 'ast', astType: 'wff' }] },
    mcnt: { params: [{ type: 'ast', astType: 'wff' }, { type: 'ast', astType: 'item' }] },
    // axiom: { params: [{ type: 'atom_token' }, { type: 'ast', astType: 'wff' }] },
    // assert: { params: [{ type: 'atom_token' }, { type: 'ast', astType: 'wff' }, { type: 'ast', astType: 'wff', optional: true, repeat: true, separator: ',' }] },
};
type ReplvarTable = { item: Map<string, boolean>, var: Set<string> };
export class HSParser implements IParser {
    allowReplaceTokenType(type: string): boolean {
        return !(type.startsWith("rule") || type.startsWith("cmd"));
    }
    private tokenizeAST(text: string): void {
        while (this.cursor < text.length) {
            if (text[this.cursor] === ' ' || text[this.cursor] === '\t' || text[this.cursor] === ';' || text[this.cursor] === '\n') {
                if (text[this.cursor] === ';' || text[this.cursor] === '\n') {
                    return;
                }
                this.pushSpaceToken(text);
                this.cursor++;
                continue;
            }
            // 1. Unicode 符号
            let matchedUni: string | null = null;
            for (const uni of symbolsUnicode) {
                if (text.startsWith(uni, this.cursor)) { matchedUni = uni; break; }
            }
            if (matchedUni) {
                this.tokens.push({
                    type: 'sym',
                    text: symbolMap[matchedUni],
                    displayText: matchedUni,
                    start: this.cursor,
                    end: this.cursor + matchedUni.length
                });
                this.cursor += matchedUni.length;
                continue;
            }
            // 1.5 ascii 转义序列（\a \c \e! \<= \\ 等；地图文本/直接 parse 不依赖 applyInputReplacements）
            // ascii2unicode 已按长度降序，最长优先（如 \e!@ 先于 \e）
            let matchedAscii: [string, string] | null = null;
            if (text[this.cursor] === "\\") {
                for (const [a, u] of ascii2unicode) {
                    if (text.startsWith(a, this.cursor)) { matchedAscii = [a, u]; break; }
                }
            }
            if (matchedAscii) {
                this.tokens.push({
                    type: 'sym',
                    text: symbolMap[matchedAscii[1]] ?? matchedAscii[1],
                    displayText: matchedAscii[0],
                    start: this.cursor,
                    end: this.cursor + matchedAscii[0].length
                });
                this.cursor += matchedAscii[0].length;
                continue;
            }
            // 2. {}
            if (text.startsWith('{}', this.cursor)) {
                this.tokens.push({ type: 'atom', text: '{}', displayText: '{}', start: this.cursor, end: this.cursor + 2 });
                this.cursor += 2; continue;
            }
            // 3. 单字符分隔符
            if (charSeps.includes(text[this.cursor])) {
                this.tokens.push({ type: "(){}|[]".includes(text[this.cursor]) ? 'layer' : 'sym', text: text[this.cursor], displayText: text[this.cursor], start: this.cursor, end: this.cursor + 1 });
                this.cursor++; continue;
            }
            // 4. atom
            const start = this.cursor;
            while (this.cursor < text.length &&
                !charSeps.includes(text[this.cursor]) &&
                !Object.keys(symbolMap).includes(text[this.cursor])) {
                this.cursor++;
            }
            const word = text.slice(start, this.cursor);
            this.tokens.push({
                type: "atom",
                text: word,
                displayText: word,
                start,
                end: this.cursor
            });
        }
    }
    inputReplacements: [string, string][] = ascii2unicode;
    private tokens: Token[] = [];
    private cursor: number = 0;
    private token!: Token;
    private pushSpaceToken(text: string) {
        this.tokens.push({
            type: 'space',
            text: text[this.cursor],
            displayText: text[this.cursor],
            start: this.cursor,
            end: this.cursor + 1
        });
    }
    private tokenize(text: string, mode: 'cmd' | 'ast' | 'rulename', replvarTable?: { item: Map<string, boolean>, var: Set<string> }) {

        this.cursor = 0;
        this.tokens = [];
        if (mode === "cmd") this.tokenizeCMD(text);
        if (mode === "ast") this.tokenizeAST(text);
        if (mode === "rulename") { this.tokenizeRuleName(text); this.tokenizeAST(text); }
        return this.tokens;
    }
    private tokenizeCMD(text: string): void {
        while (this.cursor < text.length) {
            if (text[this.cursor] === ' ' || text[this.cursor] === '\t' || text[this.cursor] === ';' || text[this.cursor] === '\n') {
                this.pushSpaceToken(text);
                this.cursor++;
                continue;
            }
            const start = this.cursor;
            while (this.cursor < text.length && !charSeps.includes(text[this.cursor])) {
                this.cursor++;
            }
            const word = text.slice(start, this.cursor);
            let cmdFormat = commandDefs[word];
            if (!cmdFormat) {
                this.cursor = start;
                const cmd = (word === "#nf" || word === "#of" || word === "#dt") && text.slice(this.cursor + 3).trim().startsWith("(") ? "hyp" : "d";
                cmdFormat = commandDefs[cmd];
                this.tokens.push({
                    type: "cmd",
                    text: cmd,
                    displayText: "",
                    start,
                    end: this.cursor
                });
            } else {
                this.tokens.push({
                    type: "cmd",
                    text: word,
                    displayText: word,
                    start,
                    end: this.cursor
                });
            }
            for (const paramDef of cmdFormat.params) {
                if (this.cursor >= text.length) return;
                if (paramDef.type === 'rulename') {
                    this.tokenizeRuleName(text);
                } else if (paramDef.type === 'ast') {
                    this.tokenizeAST(text);
                } else if (paramDef.type === 'atom_token') {
                    const start = this.cursor;
                    while (this.cursor < text.length && !charSeps.includes(text[this.cursor])) {
                        this.pushSpaceToken(text);
                        this.cursor++;
                    }
                    const word = text.slice(start, this.cursor);
                    this.tokens.push({
                        type: "cmd-atom-param",
                        text: word,
                        displayText: word,
                        start,
                        end: this.cursor
                    });
                }
            }
        }
    }
    private tokenizeRuleName(text: string): void {
        while (this.cursor < text.length && (text[this.cursor] === ' ' || text[this.cursor] === '\t')) {
            this.pushSpaceToken(text);
            this.cursor++;
        }
        while (this.cursor < text.length) {
            const startPos = this.cursor;
            if (text[this.cursor] === ' ' || text[this.cursor] === '\t' || text[this.cursor] === ';' || text[this.cursor] === '\n') return;
            if (ruleCharSeps.includes(text[this.cursor])) {
                this.tokens.push({ type: "()".includes(text[this.cursor]) ? 'rule-layer' : 'rule-sym', text: text[this.cursor], displayText: text[this.cursor], start: this.cursor, end: this.cursor + 1 });
                this.cursor++; continue;
            }
            // 扫描直到遇到分隔符或空白
            while (this.cursor < text.length && !ruleCharSeps.includes(text[this.cursor])) {
                this.cursor++;
            }
            const word = text.slice(startPos, this.cursor);
            if (word.length === 0) return;
            let i = 0;
            // prefix token
            while (i < word.length && prefix.has(word[i])) {
                this.tokens.push({
                    type: 'rule-prefix',
                    text: word[i],
                    displayText: word[i],
                    start: startPos + i,
                    end: startPos + i + 1
                });
                i++;
            }
            // 剩余部分作为一个 token
            if (i < word.length) {
                const rest = word.slice(i);
                this.tokens.push({
                    type: 'rule-atom',
                    text: rest,
                    displayText: rest,
                    start: startPos + i,
                    end: startPos + word.length
                });
            }
            // this.cursor++;
        }
    }
    getTokens() {
        for (const t of this.tokens) {
            const word = t.text;
            if (t.type === "atom" && /^\$.*$/.test(word)) {
                t.type = 'replvar';
            } else if (t.type === "atom-item") {
                t.type = /^\$.*$/.test(word) ? 'replvar-item' : /^\#.*$/.test(word) ? 'atom-locvar' : /^[a-z].*$/.test(word) ? 'atom-free-var' : /^[A-Z].*$/.test(word) ? 'atom' : 'atom-const'
            } else if (t.type === "atom-wff") {
                t.type = /^\$.*$/.test(word) ? 'replvar-wff' : /^\#.*$/.test(word) ? 'atom-locvar' : /^[a-z].*$/.test(word) ? 'atom-free-var' : /^[A-Z].*$/.test(word) ? 'atom-wff' : 'atom-const';
            } else if (t.type === "atom-free-var") {
                t.type = /^\$.*$/.test(word) ? 'replvar-var' : /^\#.*$/.test(word) ? 'atom-locvar' : /^[a-z].*$/.test(word) ? 'atom-free-var' : /^[A-Z].*$/.test(word) ? 'atom' : 'atom';
            } else if (t.type === "pred") {
                if (t.text === "#sb") t.type = 'sb';
                if (t.text === "#nf" || t.text === "#of" || t.text === "#dt") t.type = 'assert';
            } else if (t.type === "rule-atom") {
                if (t.text.startsWith("a")) t.type = 'rule-axiom';
                else if (t.text.startsWith("d")) t.type = 'rule-def';
                else if (t.text === "mp") t.type = 'rule-mp';
                else if (t.text === "#") t.type = 'rule-sharp';
            }
        }
        return this.tokens;
    }
    private replvarTable?: ReplvarTable;
    // ---- 解析入口 ----
    parse(text: string, type: 'assert' | 'wff' | 'item' | 'ast' | 'cmds' | 'cmd' | 'rule' | 'dname', replvarTable?: ReplvarTable): AST {
        if (!text) return null!;
        this.replvarTable = replvarTable;
        this.tokens = this.tokenize(text, type === "cmd" || type === "cmds" ? "cmd" : type === "dname" ? "rulename" : "ast");
        const tokensWithSpaces = this.tokens;
        this.tokens = this.tokens.filter(e => e.type !== "space");
        this.cursor = 0;
        this.nextSym();
        let res: AST;
        try {
            switch (type) {
                case 'ast': res = this.parseWFF(U3); break;
                case 'wff': res = this.parseWFF(F3); break;
                case 'item': res = this.parseITEM(T3); break;
                case 'rule': res = this.parseRule(); break;
                case 'cmd': res = this.parseSingleCmd(); break;
                case 'cmds': res = this.parseCmds(); break;
                case 'dname': res = this.parseDname(); break;
            }
        } catch { }
        this.tokens = tokensWithSpaces;
        return res!;
    }
    parseCmds() {
        const cmds = [this.parseSingleCmd()];
        while (this.token) {
            cmds.push(this.parseSingleCmd());
        }
        return new AST(NodeType.CMD, "", ...cmds);
    }
    parseSingleCmd() {
        let cmd = this.token.text;
        const cmdToken = this.token;
        let args: AST[] = [];
        this.nextSym();
        if (cmdToken.type === "cmd") {
            if (this.token) {
                const params = commandDefs[cmd].params;
                const firstParam = params[0];
                if (cmd === "hyp") {
                    args = [this.parseWFF(F3)];
                } else if (firstParam?.type === "rulename") {
                    args = this.parseDeductCmd();
                } else {
                    for (const p of params) {
                        if (p.type === "ast") {
                            args.push(this.parseWFF(p.astType === "wff" ? F3 : p.astType === "item" ? T3 : U3));
                        }
                    }
                }
            }
        } else if (cmdToken.text === "#nf" || cmdToken.text === "#of" || cmdToken.text === "#dt") {
            // assert
            cmd = "hyp"; args = [this.parseWFF(F3)];
        } else {
            // by default is d
            cmd = "d"; args = this.parseDeductCmd();
        }
        const ast = new AST(NodeType.CMD, cmd, ...args).range(cmdToken.start, args[args.length - 1]?.end ?? cmdToken.end);
        cmdToken.parentAST = ast;
        return ast;
    }
    parseDeductCmd() {
        if (!this.token || this.token.text === ";") return [];
        const args = [this.parseDname()];
        if (!this.token || this.token.text === ";") return args;
        while (this.token && this.token.type !== "cmd") {
            args.push(this.parseWFF(U3));
        }
        return args;
    }
    parseDname(): AST {
        let left = this.parseDnameFn();
        if (this.token?.text === ":") {
            const sym = this.token;
            this.nextSym();
            let right = this.parseDname();
            const ast = new AST(NodeType.NODE_DNAME, "", left, right).range(left.start, right.end);
            sym.parentAST = ast; return ast;
        } else {
            return left;
        }
    }
    parseDnameFn(): AST {
        let left = this.parseDnameFastRule();
        while (this.token?.text === "(" && this.token.type === "rule-layer") {
            // fn(xxx,xxx)
            const tokens = new Set([this.token]);
            const start = left.start;
            this.nextSym();
            const args: AST[] = [];
            const closeparen = this.token;
            if (!this.acceptSym(')')) {
                args.push(this.parseDname());
                tokens.add(this.token);
                while (this.acceptSym(',')) {
                    if (this.acceptSym(")")) { this.prevSym(); break; }
                    args.push(this.parseDname());
                }
                tokens.add(this.token);
                this.expectSym(')');
            } else tokens.add(closeparen);
            const ast = new AST(NodeType.NODE_DNAME, "", left, ...args).range(start, this.tokens[this.cursor - 2].end);
            tokens.forEach(t => t.parentAST = ast);
            left = ast;
        }
        return left;
    }
    parseDnameFastRule(): AST {
        if (this.token.type !== "rule-prefix") return this.parseDnameAtom();
        const t = this.token;
        const sym = [t];
        this.nextSym();
        let next: AST;
        if (this.token.text === "(") {
            sym.push(this.token);
            this.nextSym();
            next = this.parseDname();
            sym.push(this.token);
            this.expectSym(")");
        } else if (this.token.text === ":") {
            sym.push(this.token);
            this.nextSym();
            next = this.parseDname();
        } else { next = this.parseDnameFastRule(); }
        const ast = new AST(NodeType.NODE_DNAME, t.text, next).range(t.start, this.tokens[this.cursor - 2].end);
        sym.forEach(e => e.parentAST = ast);
        return ast;
    }
    parseDnameAtom(): AST {
        if (this.token.text === "(" && this.token.type === "rule-layer") {
            const left = this.token;
            this.nextSym();
            const inner = this.parseDname();
            left.parentAST = inner;
            const right = this.token;
            inner.range(left.start, this.token.end);
            this.expectSym(")");
            right.parentAST = inner;
            return inner;
        } else if (this.token.type === "rule-atom") {
            let ast = new AST(NodeType.ATOM_DNAME, this.token.text).range(this.token.start, this.token.end);
            this.nextSym();
            return ast;
        }
        throw "can't reach";
    }
    parseRule() {
        const start = this.cursor - 1;
        let conds: AST[] = [];
        let symTokens: Set<Token> = new Set;
        while (this.token) {
            if (this.token.text === "|-") break;
            conds.push(this.parseWFF(F3));
            if (this.token.text === "|-") break;
            if (this.token.text !== ",") throw "parse rule failed";
            symTokens.add(this.token);
            this.nextSym();
        }
        if (this.token.text !== "|-") throw "parse rule failed";
        symTokens.add(this.token);
        this.nextSym();
        const conc = this.parseWFF(F3);

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
            const right = this.parseImplies(F3);
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
            const right = this.parseAnd(F3);
            const ast = new AST(NodeType.LOGIC, '\\/', left, right).range(start, right.end);
            opToken.parentAST = ast;
            left = ast;
        }
        return left;
    }

    private parseAnd(isItem: Bool3): AST {
        let left = this.parseUnaryLogic(isItem);
        while (this.token && this.token.text === '/\\') {
            const opToken = this.token;
            const start = left.start;
            this.nextSym();
            const right = this.parseUnaryLogic(F3);
            const ast = new AST(NodeType.LOGIC, '/\\', left, right).range(start, right.end);
            opToken.parentAST = ast;
            left = ast;
        }
        return left;
    }

    private parseUnaryLogic(isItem: Bool3): AST {
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
                this.parseITEM(T3);
                if ((this.token.text as string) === ":") symTokens.push(this.token);
            }
            this.acceptSym(':');
            const body = this.parseUnaryLogic(F3);
            const ast = (domainNode ?
                new AST(NodeType.BOUNDED_QUANT, quant, varNode, domainNode, body) :
                new AST(NodeType.QUANT, quant, varNode, body)
            ).range(start, body.end);
            quantToken.parentAST = ast;
            varToken.parentAST = ast;

            symTokens.forEach(e => e.parentAST = ast);
            return ast;
        } else if (this.token?.text === "~" || this.token?.text === "\\<>" || this.token?.text === "\\[]") {
            const opToken = this.token;
            const start = opToken.start;
            this.nextSym();
            const right = this.parseUnaryLogic(F3);
            const ast = new AST(NodeType.LOGIC, opToken.text, right).range(start, right.end);
            opToken.parentAST = ast;
            return ast;
        // } else if (this.token?.text === "+") {
        //     // 一元正号：+23 等价 23（旧地图 dZop 门如 (-13)*(+23)）
        //     const start = this.token.start;
        //     this.nextSym();
        //     return this.parseUnaryLogic(F3);
        }
        return this.parsePred(isItem);
    }
    private remarkItem(left: AST, leftToken: Token) {
        if (leftToken.text === "(") {
            const innerToken = this.tokens[this.tokens.indexOf(leftToken) + 1];
            this.remarkItem(left, innerToken);
        } else if (left.type === NodeType.ATOM_WFF) {
            left.type = NodeType.ATOM_ITEM;
            if (!leftToken.type.startsWith("replvar")) leftToken.type = "atom-item";
        } else if (left.type === NodeType.PRED && !predSyms.includes(left.name)) {
            // 函数调用在项位置（如 Pr2(x)=0、S(x)=y 中的 Pr2(x)/S(x)）：
            // 之前按 wff 上下文解析成了 PRED，作为谓词操作数时应转回 FN（项）
            left.type = NodeType.FN;
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
        const left = this.parseITEM(isItem === T3 ? T3 : U3);
        // 中缀谓词
        if (this.token && predSyms.includes(this.token.text)) {
            this.remarkItem(left, leftToken);
            const opToken = this.token;
            const op = opToken.text;
            const start = left.start;
            this.nextSym();
            const right = this.parseITEM(T3);
            const ast = new AST(NodeType.PRED, op, left, right).range(start, right.end);
            opToken.parentAST = ast;
            return ast;
        }
        return left;
    }
    // ---- ITEM 的递归下降（中缀集合/算术运算按优先级：∪ < ∩ < +- < *× < \） ----
    private parseITEM(isItem: Bool3): AST {
        return this.parseUnion(isItem);
    }
    // ∪ 最低
    private parseUnion(isItem: Bool3): AST {
        let leftToken = this.token;
        let left = this.parseInter(isItem);
        while (this.token?.text === '\\u') {
            this.remarkItem(left, leftToken);
            if (isItem === F3) throw new Error("Set operations only allowed in item context");
            const opToken = this.token;
            const start = left.start;
            this.nextSym();
            const right = this.parseInter(T3);
            const ast = new AST(NodeType.FN, opToken.text, left, right).range(start, right.end);
            opToken.parentAST = ast;
            left = ast;
        }
        return left;
    }
    // ∩
    private parseInter(isItem: Bool3): AST {
        let leftToken = this.token;
        let left = this.parseArith(isItem);
        while (this.token?.text === '\\i') {
            this.remarkItem(left, leftToken);
            if (isItem === F3) throw new Error("Set operations only allowed in item context");
            const opToken = this.token;
            const start = left.start;
            this.nextSym();
            const right = this.parseArith(T3);
            const ast = new AST(NodeType.FN, opToken.text, left, right).range(start, right.end);
            opToken.parentAST = ast;
            left = ast;
        }
        return left;
    }
    // 算术加减
    private parseArith(isItem: Bool3): AST {
        let leftToken = this.token;
        let left = this.parseMult(isItem);
        while (this.token && (this.token.text === '+' || this.token.text === '-')) {
            this.remarkItem(left, leftToken);
            if (isItem === F3) throw new Error("Set operations only allowed in item context");
            const opToken = this.token;
            const start = left.start;
            this.nextSym();
            const right = this.parseMult(T3);
            const ast = new AST(NodeType.FN, opToken.text, left, right).range(start, right.end);
            opToken.parentAST = ast;
            left = ast;
        }
        return left;
    }
    // 乘法/笛卡尔积
    private parseMult(isItem: Bool3): AST {
        let leftToken = this.token;
        let left = this.parseDiff(isItem);
        while (this.token && (this.token.text === '*' || this.token.text === '\\x')) {
            this.remarkItem(left, leftToken);
            if (isItem === F3) throw new Error("Set operations only allowed in item context");
            const opToken = this.token;
            const start = left.start;
            this.nextSym();
            const right = this.parseDiff(T3);
            const ast = new AST(NodeType.FN, opToken.text, left, right).range(start, right.end);
            opToken.parentAST = ast;
            left = ast;
        }
        return left;
    }
    // 差集 \\ 最高
    private parseDiff(isItem: Bool3): AST {
        let leftToken = this.token;
        let left = this.parseFn(isItem);
        while (this.token && (this.token.text === '\\' || this.token.text === '\\\\')) {
            this.remarkItem(left, leftToken);
            if (isItem === F3) throw new Error("Set operations only allowed in item context");
            const opToken = this.token;
            const start = left.start;
            this.nextSym();
            const right = this.parseFn(T3);
            const ast = new AST(NodeType.FN, opToken.text, left, right).range(start, right.end);
            opToken.parentAST = ast;
            left = ast;
        }
        return left;
    }

    private parseFn(isItem: Bool3): AST {
        // 一元正号/负号：+23 → 23、-x → -x（-13 已作为 atom；这里兜底括号内 +x）
        if (this.token?.text === "+" || this.token?.text === "-") {
            const start = this.token.start;
            this.nextSym();
            return this.parseFn(isItem);
        }
        const token = this.token;
        let left: AST | undefined;
        const tokens = new Set([token]);
        const leftToken = this.token;
        if (token.type === 'atom') {
            left = this.parseVarAtom(isItem === T3);
        }
        if (this.token?.text === '(') {
            tokens.add(this.token);
            if (left) {
                // 若left不是标准的函数/谓词命名，或left跟后面括号之间有空格，则在此截止
                if ((!left.name.match(/^[a-zA-Z]/) && left.name !== "#nf" && left.name !== "#of" && left.name !== "#dt" && left.name !== "#sb") || left.end !== this.token.start) {
                    // 括号可能是下一个要parse的AST，留给后面处理
                    return left;
                }
                // fn(xxx,xxx)
                const start = left.start;
                this.nextSym();
                const args: AST[] = [];
                if (isItem === T3) {
                    leftToken.type = "fn";
                } else {
                    leftToken.type = "pred";
                }
                if (left.name === "#sb") {
                    args.push(isItem === T3 ? this.parseITEM(T3) : this.parseWFF(isItem));
                    tokens.add(this.token); this.expectSym(',');
                    args.push(this.parseVariable());
                    tokens.add(this.token); this.expectSym(',');
                    args.push(this.parseITEM(T3));
                    tokens.add(this.token);
                    const bounded = new AST(NodeType.FN, " ");
                    args.push(bounded);
                    // 后续可选scope变量
                    if (this.acceptSym(',')) {
                        bounded.nodes ??= [];
                        while (this.token && (this.token.text as string) !== ")") {
                            const t = this.token;
                            bounded.nodes.push(this.parseVariable());
                            t.type = "atom-var";
                        }
                        // if (this.acceptSym(")")) { this.prevSym(); break; }
                        // args.push(this.parseVariable());
                        // tokens.add(this.token);
                    }
                    tokens.add(this.token); this.expectSym(')');
                    const ast = new AST(NodeType.SB, '', ...args).range(start, this.tokens[this.cursor - 2].end);
                    tokens.forEach(t => t.parentAST = ast);
                    return ast;
                }

                if (left.name === "#nf" || left.name === "#of" || left.name === "#dt") {
                    const set1: AST[] = [];
                    const set2: AST[] = [];
                    if (left.name !== "#dt") {
                        const t = this.token;
                        const type = this.replvarTable?.item?.get(t.text);
                        args.push(this.parseVariable());
                        if (!t.type.startsWith("replvar")) {
                            t.type = "replvar-" + (type === true ? "item" : type === false ? "wff" : "U3");
                        }
                        args[0].type = NodeType.ATOM_UKNOWN;
                        tokens.add(this.token);
                        if (left.name === "#of" && this.token.text as string === ")") {
                            this.expectSym(')');
                            args.push(new AST(NodeType.FN, " ", ...set1));
                        } else {
                            this.expectSym(',');
                            while (this.token && (this.token.text as string) !== "," && (this.token.text as string) !== ")") {
                                set1.push(this.parseVariable());
                            }
                            tokens.add(this.token);
                            if ((this.token.text as string) !== ")" && left.name === "#nf") {
                                this.nextSym();
                                while (this.token && (this.token.text as string) !== ")") {
                                    const t = this.token;
                                    set2.push(this.parseVariable());
                                    t.type = "atom-var";
                                }
                            }
                            tokens.add(this.token);
                            this.expectSym(')');
                            args.push(new AST(NodeType.FN, " ", ...set1));
                            if (left.name === "#nf") args.push(new AST(NodeType.FN, " ", ...set2));
                        }
                    } else {
                        while (this.token && (this.token.text as string) !== ")") {
                            args.push(this.parseVariable());
                        }
                        tokens.add(this.token);
                        this.expectSym(')');
                    }
                    const ast = new AST(NodeType.ASSERT, left.name.slice(1), ...args).range(start, this.tokens[this.cursor - 2].end);
                    tokens.forEach(t => t.parentAST = ast);
                    return ast;
                }
                const closeparen = this.token;
                if (!this.acceptSym(')')) {
                    args.push(this.parseITEM(T3));
                    tokens.add(this.token);
                    while (this.acceptSym(',')) {
                        if (this.acceptSym(")")) { this.prevSym(); break; }
                        args.push(this.parseITEM(T3));
                    }
                    tokens.add(this.token);
                    this.expectSym(')');
                } else tokens.add(closeparen);
                const ast = new AST(isItem === T3 ? NodeType.FN : NodeType.PRED, left.name, ...args).range(start, this.tokens[this.cursor - 2].end);
                tokens.forEach(t => t.parentAST = ast);
                return ast;
            } else {
                const start = token.start;
                this.nextSym();
                const leftToken = this.token;
                const inner = isItem === T3 ? this.parseITEM(T3) : this.parseWFF(isItem);
                const args: AST[] = [];
                let first = true;
                tokens.add(this.token);
                while (this.acceptSym(',')) {
                    if (first) {
                        first = false;
                        this.remarkItem(inner, leftToken);
                    }
                    if (this.acceptSym(")")) { this.prevSym(); break; }
                    args.push(this.parseITEM(T3));
                    tokens.add(this.token);
                }
                tokens.add(this.token);
                this.expectSym(')');
                if (args.length) {
                    const ast = new AST(NodeType.FN, "()", inner, ...args).range(start, this.tokens[this.cursor - 2].end);
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
                    const set = this.parseITEM(T3);
                    tokens.add(this.token);
                    this.expectSym("|");
                    const wff = this.parseWFF(F3);
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
                    const wff = this.parseWFF(F3);
                    tokens.add(this.token);
                    this.expectSym("}");
                    const ast = new AST(NodeType.CLASS, "", variable, wff).range(start, this.tokens[this.cursor - 2].end);
                    tokens.forEach(e => e.parentAST = ast);
                    return ast;
                }
                this.prevSym();
            }
            const first = this.parseITEM(T3);
            const args: AST[] = [];
            tokens.add(this.token);
            while (this.acceptSym(',')) {
                if (this.acceptSym("}")) { this.prevSym(); break; }
                args.push(this.parseITEM(T3));
                tokens.add(this.token);
            }
            // {xx|x@y}
            if (!args.length && this.acceptSym("|")) {
                tokens.add(this.token);
                const variable = this.parseVariable();
                tokens.add(this.token);
                this.expectSym("@");
                const item = this.parseITEM(T3);
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

    private parseVarAtom(isItem: boolean): AST {
        const token = this.token;
        const start = token.start;
        let nodeType: NodeType;
        let name = token.text;
        if (token.type === 'atom') {
            if (!isItem && !name.match(/^[a-z\#]/)) {
                token.type = 'atom-wff';
                nodeType = NodeType.ATOM_WFF;
            } else {
                token.type = 'atom-item';
                nodeType = NodeType.ATOM_ITEM;
            }
            const type = this.replvarTable?.item?.get(token.text);
            if (type === true) token.type = "replvar-item";
            if (type === false) token.type = "replvar-wff";
            if (this.replvarTable?.var?.has(token.text)) token.type = "replvar-var";
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
        if (this.replvarTable?.var?.has(token.text)) token.type = "replvar-var";
        const start = token.start;
        this.nextSym();
        return new AST(NodeType.ATOM_ITEM, token.text).range(start, token.end);
    }

    static stringify(ast: AST, parenthese: boolean): string {
        if (ast.type === NodeType.ATOM_ITEM || ast.type === NodeType.ATOM_WFF || ast.type === NodeType.ATOM_DNAME || ast.type === NodeType.ATOM_UKNOWN) return ast.name;
        const left = parenthese ? "(" : "";
        const right = parenthese ? ")" : "";
        if (ast.type === NodeType.LOGIC) {
            const a = ast.nodes[0];
            const b = ast.nodes[1];
            const name = ascii2unicodeTable[ast.name];
            if (ast.name === ">" || ast.name === "<>") return left + HSParser.stringify(a, a.type === NodeType.LOGIC && (a.name === ">" || a.name === "<>")) + name + HSParser.stringify(b, false) + right;
            if (ast.name === "\\/") return left + HSParser.stringify(a, a.type === NodeType.LOGIC && (a.name === ">" || a.name === "<>")) + name + HSParser.stringify(b, b.type === NodeType.LOGIC && (b.name === ">" || b.name === "<>" || b.name === "\\/")) + right;
            if (ast.name === "/\\") return left + HSParser.stringify(a, a.type === NodeType.LOGIC && (a.name === ">" || a.name === "<>" || a.name === "\\/")) + name + HSParser.stringify(b, b.type === NodeType.LOGIC && (b.name === ">" || b.name === "<>" || b.name === "\\/" || b.name === "/\\")) + right;
            if (ast.name === "~" || ast.name === "\\[]" || ast.name === "\\<>") return name + HSParser.stringify(a, a.type === NodeType.LOGIC && (a.name === ">" || a.name === "<>" || a.name === "\\/" || a.name === "/\\"));
        }
        if (ast.type === NodeType.QUANT || ast.type === NodeType.BOUNDED_QUANT) {
            const body = ast.nodes[ast.type === NodeType.QUANT ? 1 : 2];
            const bounded = ast.type === NodeType.BOUNDED_QUANT ? "@" + HSParser.stringify(ast.nodes[1], false) : "";
            return ascii2unicodeTable[ast.name] + ast.nodes[0].name + bounded + ":" + HSParser.stringify(body, body.type === NodeType.LOGIC && body.name !== "~");
        }
        if (ast.type === NodeType.SB) {
            const inner = ast.nodes.map(e => HSParser.stringify(e, false));
            if (inner[3]?.length === 0) inner.pop();
            return "#sb(" + inner.join(",") + ")";
        }
        if (ast.type === NodeType.ASSERT) {
            const inner = ast.nodes.map(e => HSParser.stringify(e, false));
            if (inner[2]?.length === 0) inner.pop();
            if (inner[1]?.length === 0) inner.pop();
            return "#" + ast.name + "(" + inner.join(ast.name === "dt" ? " " : ",") + ")";
        }
        if (ast.type === NodeType.FN) {
            // this space function is designed for #nf(a,b c d,e f)
            if (ast.name === " ") return ast.nodes.map(e => HSParser.stringify(e, false)).join(" ");
            if (setSyms.includes(ast.name)) {
                const a = ast.nodes[0];
                const b = ast.nodes[1];
                return left + HSParser.stringify(a, a.type === NodeType.FN && setSyms.includes(a.name)) + (ascii2unicodeTable[ast.name] || ast.name) + HSParser.stringify(b, b.type === NodeType.FN && setSyms.includes(b.name)) + right;
            }
            return (ast.name === "()" || ast.name === "{}" ? "" : ast.name) + (ast.name === "{}" ? "{" : "(") + ast.nodes.map(e => HSParser.stringify(e, false)).join(",") + (ast.name === "{}" ? "}" : ")");
        }
        if (ast.type === NodeType.PRED) {
            if (predSyms.includes(ast.name)) return `${HSParser.stringify(ast.nodes[0], false)}${ascii2unicodeTable[ast.name] || ast.name}${HSParser.stringify(ast.nodes[1], false)}`;
            // 非中缀谓词（函数式谓词如 Equiv(a,b)）：按函数调用形式输出
            return ast.name + "(" + ast.nodes.map(e => HSParser.stringify(e, false)).join(",") + ")";
        }
        if (ast.type === NodeType.SEP) {
            return `{${ast.nodes[0].name}∈${HSParser.stringify(ast.nodes[1], false)}|${HSParser.stringify(ast.nodes[2], false)}}`;
        }
        if (ast.type === NodeType.CLASS) {
            return `{${ast.nodes[0].name}|${HSParser.stringify(ast.nodes[1], false)}}`;
        }
        if (ast.type === NodeType.RPL) {
            return `{${HSParser.stringify(ast.nodes[0], false)}|${ast.nodes[1].name}∈${HSParser.stringify(ast.nodes[2], false)}}`;
        }
        if (ast.type === NodeType.RULE) {
            const conc = ast.nodes.pop()!;
            const str = ast.nodes.map(e => HSParser.stringify(e, false)).join(",") + "⊢" + HSParser.stringify(conc, false);
            ast.nodes.push(conc);
            return str;
        }
        if (ast.type === NodeType.NODE_DNAME) {
            if (ast.name) {
                const inner = ast.nodes[0];
                const colon = (inner.type === NodeType.NODE_DNAME && !inner.name) ? ":" : "";
                return ast.name + colon + HSParser.stringify(inner, false);
            }
            const fn = ast.nodes.shift()!;
            const str = HSParser.stringify(fn, true) + "(" + ast.nodes.map(e => HSParser.stringify(e, false)).join(",") + ")";
            ast.nodes.unshift(fn);
            return str;
        }
        return "";
    }
}
AST.prototype.toString = function () { return HSParser.stringify(this, false) };