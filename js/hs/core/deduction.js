// import { Assertion } from "./assert.js";
import { NodeType } from "../../asttype.js";
import { AtomSolver } from "./assert.js";
import { AST } from "./ast.js";
import { HSError } from "./error.js";
export class Deduction {
    dependence; // record which axioms are used
    name;
    assertions;
    conditions;
    conclusion;
    step;
    replaceNames;
    // 组合规则专用：原规则replaceNames变量名 -> 组合后最终表达式（用于外部映射rv键）
    nameMap;
    // 从存档加载失败时记录：错误原因 + 存档原始cmd序列（用于"错误规则"菜单调试）
    // cause 为原始异常（unknown），渲染交给 LangMgr（HSErrorInfo 递归翻译、字符串原样、其他 String()）
    error;
    constructor(dependence, name, assertions, conditions, conclusion, step, nameMap) {
        try {
            this.dependence = dependence;
            this.name = name;
            this.assertions = assertions;
            this.conditions = conditions;
            this.conclusion = conclusion;
            this.step = step;
            this.nameMap = nameMap;
            const conclusionReplvars = conclusion.getReplvars();
            const conditionReplvars = new Map();
            conditions.forEach(c => c.getReplvars(conditionReplvars));
            assertions.forEach(c => AtomSolver.getReplvars(c, conclusionReplvars));
            this.replaceNames = [...conclusionReplvars.entries()].filter(e => {
                if (conditionReplvars.has(e[0])) {
                    if (conditionReplvars.get(e[0]) !== e[1]) {
                        throw HSError.isItemAndWff(e[0]);
                    }
                    return false;
                }
                return true;
            }); //.sort((a, b) => a[0].localeCompare(b[0]));
        }
        catch (e) {
            throw HSError.createRule(name, e);
        }
    }
    toString() {
        return this.assertions.map(e => AtomSolver.print(e)).concat(this.conditions).join(",") + "⊢" + this.conclusion;
    }
    getNewReplName(type) {
        const vars = new Set();
        this.conditions.forEach(c => c.getReplvars().forEach((_, n) => vars.add(n)));
        this.conclusion.getReplvars().forEach((_, n) => vars.add(n));
        return new AST(type === 'wff' ? NodeType.ATOM_WFF : NodeType.ATOM_ITEM, Deduction.freshReplName(vars, type === 'var'));
    }
    // 生成不与vars中已有变量重名的替换变量名（wff: $0,$1..；var: $a,$b..$z,$aa..字典序）
    static freshReplName(vars, isItem) {
        if (!isItem) {
            let i = 0;
            while (vars.has("$" + i))
                i++;
            return "$" + i;
        }
        // 字典序：$a..$z,然后$aa~$az $ba~$bz ...$zz，然后$aaa...
        for (let len = 1;; len++) {
            const arr = new Array(len).fill('a'.charCodeAt(0));
            while (true) {
                const name = "$" + arr.map(c => String.fromCharCode(c)).join("");
                if (!vars.has(name))
                    return name;
                let i = len - 1;
                while (i >= 0) {
                    if (arr[i] < 'z'.charCodeAt(0)) {
                        arr[i]++;
                        break;
                    }
                    arr[i] = 'a'.charCodeAt(0);
                    i--;
                }
                if (i < 0)
                    break;
            }
        }
    }
}
export class Proposition {
    ast;
    from;
    children;
    active;
    name = "";
    id = 0;
    uuid;
    parent;
    relyBefore;
    relyAfter;
    constructor(ast, from, name) {
        this.from = from;
        this.ast = ast;
        this.name = name || "";
        this.parent = null;
    }
    static hyp(ast) {
        if (ast.type === NodeType.ASSERT) {
            try {
                ast.checkAssert();
                ast.getReplvars();
            }
            catch (e) {
                throw HSError.hypFail(e);
            }
            const atomicAssertion = AtomSolver.fromAST(ast);
            return new Proposition(ast, { type: "a", data: atomicAssertion });
        }
        try {
            ast.checkWFF();
            ast.getReplvars();
        }
        catch (e) {
            throw HSError.hypFail(e);
        }
        return new Proposition(ast, { type: 'h' });
    }
    static mkdir(type, ast) {
        if (type === "c")
            try {
                ast.checkWFF();
                ast.getReplvars();
            }
            catch (e) {
                throw HSError.hypFail(e);
            }
        if (type === "v")
            try {
                ast.checkVAR();
            }
            catch (e) {
                throw HSError.hypFail(e);
            }
        const p = new Proposition(ast, { type });
        if (type === "f")
            p.name = ast.name;
        p.children = [];
        return p;
    }
    getCmd() {
        if (this.from.type === "a" || this.from.type === "h") {
            return `hyp ${this.ast}`;
        }
        else if (this.from.type === "f") {
            return `dir ${this.name}`;
        }
        else if (this.from.type === "c") {
            return `cond ${this.ast}`;
        }
        else if (this.from.type === "v") {
            return `var ${this.ast.name}`;
        }
        else if (this.from.type === "d") {
            const data = this.from.data;
            const name = data.deduction.toString();
            // 名称不是命令关键字（hyp/pop等）时省略"d "前缀（解析时默认按d命令处理）；
            // mcpt 等独立命令名的d步骤直接序列化为裸命令，重放时走对应命令分支。
            const kw = new Set(["hyp", "cond", "var", "dir", "d", "clear", "b", "pop", "cd", "name", "del", "m", "inln", "entr", "rename"]);
            const cond = data.conditions.map(p => p.id).join(" ");
            const prefix = kw.has(name) ? "d " : "";
            let values = Object.values(data.replaceValues);
            if (name === "msbt>(mcpt)" || name === "msbt<(mcpt)") {
                const p = data.replaceValues["$p"];
                const t = data.replaceValues["$t"];
                const i = data.replaceValues["$i"];
                const target = t ?? data.conditions[data.conditions.length - 1]?.id;
                return `${prefix}${name} ${p} ${target} ${i}`.trimEnd();
            }
            return `${prefix}${name} ${cond ? cond + " " : ""}${values.join(" ")}`.trimEnd();
        }
        throw "can't reach";
    }
}
//# sourceMappingURL=deduction.js.map