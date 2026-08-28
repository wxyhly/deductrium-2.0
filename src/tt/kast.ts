import { AST as CmdAST, NodeType } from "./ast.js";

// ==================== 内核 AST（KAST） ====================
// 移植自 deductrium-hott-optimised：plain-object 名字式表示。
// 与当前项目 src/tt/ast.ts 的 AST 类（NodeType 枚举 + De Bruijn）不同：
//  - type 是字符串（var/L/P/S/W/apply/U/rigid...）
//  - 绑定符带 name（变量名）与 bondVarId（绑定身份，prepare 时分配）
//  - checked/origin/displayExplicitAt 为可选元数据（移植代码兼容用）
// 内核/检查器（nbe-kernel.ts / nbe-checker.ts）直接操作该表示；
// Core 门面（core.ts）负责当前 AST <-> KAST 互转。
export type AST = {
    type: string, name: string, nodes?: AST[],
    checked?: AST, err?: any, bondVarId?: number, origin?: boolean | AST,
    /** True only for an @-alias occurrence explicitly typed by the user. */
    displayExplicitAt?: boolean
};
export type Context = [string, AST, number][];

// ==================== 面糖运算符 desugar ====================
// 移植自原系统 core.ts 的 desugar：
//   a = b   → eq _ a b          （命题相等，类型参数由上下文求解）
//   a ~= b  → eqv a b           （等价）
//   a + b   → Sum a b           （无交并）
//   a × b   → Σ _:a. b          （非依赖积）
//   a ▪ b / a * b → compeq _ _ _ _ a b（路径复合）
//   [[a]]   → Trunc a           （截断类型）
//   [a]     → ctorTrunc _ a     （截断构造）
//   (a, b)  → pair _ _ a b      （Σ 对）
function kApp(fn: AST, ...args: (AST | null)[]): AST | null {
    let acc: AST | null = fn;
    for (const a of args) {
        if (!a) return null;
        acc = { type: "apply", name: "", nodes: [acc, a] };
    }
    return acc;
}
const kHole = (): AST => ({ type: "var", name: "_" });
const kVar = (name: string): AST => ({ type: "var", name });

function desugarSym(e: CmdAST): AST | null {
    const nodes = e.nodes.map(n => toKAST(n));
    if (nodes.some(n => !n)) return null;
    const k = nodes as AST[];
    switch (e.name) {
        case "=": // a = b -> eq a b（eq 是 2 参糖：eq := @eq ?u ?a，隐藏层级与类型，与原版一致）
            return kApp(kVar("eq"), k[0], k[1]);
        case "~=": // a ~= b -> eqv a b
            return kApp(kVar("eqv"), k[0], k[1]);
        case "+": // a + b -> Sum a b
            return kApp(kVar("Sum"), k[0], k[1]);
        case "x": // a × b -> Σ _:a. b
            return { type: "S", name: "_", nodes: [k[0], k[1]] };
        case "*": // a ▪ b / a * b -> compeq _ _ _ _ a b
            return kApp(kVar("compeq"), kHole(), kHole(), kHole(), kHole(), k[0], k[1]);
        case "[[]]": // [[a]] -> Trunc a
            return kApp(kVar("Trunc"), k[0]);
        case "[]": // [a] -> ctorTrunc _ a
            return kApp(kVar("ctorTrunc"), kHole(), k[0]);
        default: {
            const t = e.name === ">" ? "->" : e.name === "x" ? "X" : e.name;
            return { type: t, name: "", nodes: k };
        }
    }
}

// ==================== 当前 AST -> KAST ====================
// 映射规则：
//   ATOM(name)        -> var（?x/_ 原样保留，由 checker 的 prepare 处理）
//   BOUND(\l,\p,\s,\w)-> L/P/S/W（nodes[0] 是变量名 ATOM，nodes[1] 类型，nodes[2] 体）
//   APP               -> apply
//   SYM(">")          -> "->"（函数类型）
//   SYM("x")          -> "X"（积）
//   SYM("()")         -> ","（二元嵌套）
//   PROP(":","=","==")-> ":" / ":" / "==="（"==" 是 ≡ 定义相等）
//   U                 -> apply(U, level)（level 数字规范化为 @N）
//   UFN(\Usucc,\Umax) -> apply(@succ/@max, ...)
// 常量名兼容：\N -> nat、\u -> U（用户输入 ℕ/𝒰 时解析为 \N/\u）
export function toKAST(e: CmdAST | null | undefined): AST | null {
    if (!e) return null;
    switch (e.type) {
        case NodeType.ATOM: {
            let name = e.name;
            if (name === "\\N") name = "nat";
            else if (name === "\\u" || name === "U") {
                // 裸 U（用户输入 U 或 𝒰）在 hott 中表示 U@0
                return { type: "apply", name: "", nodes: [{ type: "var", name: "U" }, { type: "var", name: "@0" }] };
            }
            if (name === "U@") return { type: "var", name: "U@" }; // 层级排序（U@ : U@:）
            const lvl = /^U([a-z])$/.exec(name);
            if (lvl) return { type: "apply", name: "", nodes: [{ type: "var", name: "U" }, { type: "var", name: lvl[1] }] }; // Uu → U u
            return { type: "var", name };
        }
        case NodeType.BOUND: {
            const kind = e.name; // \l \p \s \w
            const ktype: Record<string, string> = { "\\l": "L", "\\p": "P", "\\s": "S", "\\w": "W" };
            const [varName, ty, body] = e.nodes;
            const domain = toKAST(ty);
            const bodyK = toKAST(body);
            if (!domain || !bodyK) return null;
            return {
                type: ktype[kind] ?? "P",
                name: varName.type === NodeType.ATOM ? varName.name : "",
                nodes: [domain, bodyK]
            };
        }
        case NodeType.APP: {
            // U 被应用（U u / U @1）→ 宇宙取层级；不把裸 U 当成 U@0
            const headAtom = e.nodes[0];
            if (headAtom.type === NodeType.ATOM && (headAtom.name === "U" || headAtom.name === "\\u")) {
                const a = toKAST(e.nodes[1]);
                return a ? { type: "apply", name: "", nodes: [{ type: "var", name: "U" }, a] } : null;
            }
            const f = toKAST(e.nodes[0]);
            const a = toKAST(e.nodes[1]);
            return f && a ? { type: "apply", name: "", nodes: [f, a] } : null;
        }
        case NodeType.PROP: {
            const t = e.name === "==" ? "===" : e.name;
            const nodes: AST[] = [];
            for (const n of e.nodes) {
                const k = toKAST(n);
                if (!k) return null;
                nodes.push(k);
            }
            return { type: t, name: "", nodes };
        }
        case NodeType.SYM: {
            if (e.name === "()" && e.nodes.length >= 2) {
                // (a,b,c) -> pair 二元嵌套：(a, (b, c))
                let acc: AST | null = toKAST(e.nodes[e.nodes.length - 1]);
                for (let i = e.nodes.length - 2; i >= 0; i--) {
                    const next = toKAST(e.nodes[i]);
                    if (!acc || !next) return null;
                    acc = kApp(kVar("pair"), kHole(), kHole(), next, acc);
                }
                return acc;
            }
            return desugarSym(e);
        }
        case NodeType.U: {
            // \U index -> apply(U, level)；纯数字 level 规范化为 @N
            const level = toKAST(e.nodes[0]);
            if (!level) return null;
            if (level.type === "var" && /^\d+$/.test(level.name)) level.name = "@" + level.name;
            return { type: "apply", name: "", nodes: [{ type: "var", name: "U" }, level] };
        }
        case NodeType.UFN: {
            // \usucc(...) -> apply(@succ, ...)；\umax(...) -> apply(@max, ...)
            const head = e.name === "\\usucc" ? "@succ" : e.name === "\\umax" ? "@max" : e.name;
            let acc: AST | null = { type: "var", name: head };
            for (const arg of e.nodes) {
                const k = toKAST(arg);
                if (!k) return null;
                if (k.type === "var" && /^\d+$/.test(k.name)) k.name = "@" + k.name;
                acc = { type: "apply", name: "", nodes: [acc, k] };
            }
            return acc;
        }
        default:
            return null; // INDEX 等不应出现在源输入
    }
}

// ==================== KAST -> 当前 AST ====================
export function fromKAST(k: AST | null | undefined): CmdAST | null {
    if (!k) return null;
    switch (k.type) {
        case "var": {
            let name = k.name;
            // 宇宙层级字面量 @N -> 显示为 \U N 的层级 N（round-trip 稳定）
            if (/^@\d+$/.test(name)) name = name.slice(1);
            return new CmdAST(NodeType.ATOM, name);
        }
        case "L": case "P": case "S": case "W": {
            const kname: Record<string, string> = { L: "\\l", P: "\\p", S: "\\s", W: "\\w" };
            const [domain, body] = k.nodes ?? [];
            const d = fromKAST(domain);
            const b = fromKAST(body);
            if (!d || !b) return null;
            return new CmdAST(NodeType.BOUND, kname[k.type], new CmdAST(NodeType.ATOM, k.name), d, b);
        }
        case "apply": {
            const [fn, arg, ...rest] = k.nodes ?? [];
            const head = fn?.type === "var" ? fn : null;
            // U level -> \U
            if (head && head.name === "U" && !head.bondVarId && arg) {
                const level = fromKAST(arg);
                if (level) return new CmdAST(NodeType.U, "", level);
            }
            // @succ/@max -> \usucc/\umax
            if (head && !head.bondVarId && (head.name === "@succ" || head.name === "@max") && arg) {
                const ufnName = head.name === "@succ" ? "\\usucc" : "\\umax";
                const args: CmdAST[] = [];
                const a0 = fromKAST(arg);
                if (a0) args.push(a0);
                for (const r of rest ?? []) {
                    const ka = fromKAST(r);
                    if (ka) args.push(ka);
                }
                return new CmdAST(NodeType.UFN, ufnName, ...args);
            }
            const f = fromKAST(fn);
            const a = fromKAST(arg);
            if (!f || !a) return null;
            return new CmdAST(NodeType.APP, "", f, a);
        }
        case "->": {
            const d = fromKAST(k.nodes?.[0]);
            const b = fromKAST(k.nodes?.[1]);
            return d && b ? new CmdAST(NodeType.SYM, ">", d, b) : null;
        }
        case ":":
        case ":=":
        case "===": {
            const nodes: CmdAST[] = [];
            for (const n of k.nodes ?? []) {
                const c = fromKAST(n);
                if (!c) return null;
                nodes.push(c);
            }
            return new CmdAST(NodeType.PROP, k.type, ...nodes);
        }
        case "X": {
            const nodes: CmdAST[] = [];
            for (const n of k.nodes ?? []) {
                const c = fromKAST(n);
                if (!c) return null;
                nodes.push(c);
            }
            return new CmdAST(NodeType.SYM, "x", ...nodes);
        }
        default: {
            const nodes: CmdAST[] = [];
            for (const n of k.nodes ?? []) {
                const c = fromKAST(n);
                if (!c) return null;
                nodes.push(c);
            }
            return new CmdAST(NodeType.SYM, k.type, ...nodes);
        }
    }
}

// ==================== 当前 AST 字符串化（测试/调试用） ====================
const symDisplay: Record<string, string> = {
    ">": "→", "~": "¬", "\\x": "×", "~=": "≃", "==": "≡",
    "*": "▪", "[[]]": "⟦⟧", "[]": "[]", "x": "×", "()": "()"
};
const boundDisplay: Record<string, string> = { "\\l": "λ", "\\p": "Π", "\\s": "Σ", "\\w": "𝖶" };

export function astToString(e: CmdAST | null | undefined, wrap = false): string {
    if (!e) return "∅";
    switch (e.type) {
        case NodeType.ATOM: {
            // 层级排序显示为 𝒰@（U@ 是内部名，用户可见用 𝒰@）
            if (e.name === "U@") return "𝒰@";
            if (e.name === "U@:") return "𝒰@:";
            if (/^@\d+$/.test(e.name)) return e.name.slice(1);   // 层级字面量 @0 → 0
            return e.name;
        }
        case NodeType.U: {
            const lvl = astToString(e.nodes[0]);
            // 层级 0 显示为裸 𝒰（用户符号：𝒰 = 𝒰0）
            return lvl === "0" ? "𝒰" : "𝒰" + lvl;
        }
        case NodeType.UFN: {
            const args = e.nodes.map(n => astToString(n)).join(",");
            return e.name === "\\usucc" || e.name === "\\Usucc" ? `𝒰succ(${args})` : `𝒰max(${args})`;
        }
        case NodeType.BOUND: {
            const [varName, ty, body] = e.nodes;
            const hasTy = !(ty.type === NodeType.ATOM && ty.name === "");
            const tyS = hasTy ? ":" + astToString(ty) : "";
            const b = astToString(body);
            const s = `${boundDisplay[e.name] ?? e.name}${astToString(varName)}${tyS}.${b}`;
            return wrap ? `(${s})` : s;
        }
        case NodeType.APP: {
            const f = astToString(e.nodes[0], e.nodes[0].type === NodeType.BOUND || e.nodes[0].type === NodeType.APP);
            const a = astToString(e.nodes[1], true);
            return `${f} ${a}`;
        }
        case NodeType.PROP: {
            const op = e.name === "==" ? "≡" : e.name;
            const l = astToString(e.nodes[0], true);
            if (e.name === ":=" && e.nodes[1]?.type === NodeType.SYM && e.nodes[1].name === ":") {
                const r = astToString(e.nodes[1].nodes[0], true);
                const t = astToString(e.nodes[1].nodes[1]);
                return `${l} := ${r} : ${t}`;
            }
            const r = astToString(e.nodes[1], true);
            return `${l} ${op} ${r}`;
        }
        case NodeType.SYM: {
            const op = symDisplay[e.name] ?? e.name;
            if (e.nodes.length === 0) return op;
            if (e.nodes.length === 1) return `${op}${astToString(e.nodes[0], true)}`;
            const s = e.nodes.map(n => astToString(n, true)).join(op);
            return wrap ? `(${s})` : s;
        }
        default: return e.name;
    }
}
