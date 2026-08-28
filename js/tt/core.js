import { AST, NodeType } from "./ast.js";
import { TypeParser } from "./parser.js";
import { SemanticNbeKernel } from "./nbe-kernel.js";
import { SemanticNbeTypeChecker } from "./nbe-checker.js";
import { toKAST, fromKAST, astToString } from "./kast.js";
const failureMessages = {
    "budget-exhausted": "资源预算耗尽（表达式过大或归约过深）",
    "unsupported-syntax": "不支持的语法",
    "metavariable": "元变量无法求解",
    "unbound-variable": "未绑定变量",
    "unknown-constant": "未知常量",
    "expected-universe": "期望类型不是宇宙",
    "expected-function": "期望函数类型（作用对象不是函数）",
    "argument-type-mismatch": "参数类型不匹配",
    "type-mismatch": "类型不匹配",
    "conversion-unsupported": "类型转换不支持",
};
// 显示用：把检查器局部元变量名 ?nbe0/?nbe1/... 替换为 ?a/?b/...（仅影响展示，不影响内核）
function prettyMetaType(ast) {
    const map = new Map();
    let i = 0;
    const walk = (e) => {
        if (e.type === NodeType.ATOM && /^\?nbe\d+$/.test(e.name)) {
            let n = map.get(e.name);
            if (!n) {
                n = "?" + String.fromCharCode(97 + (i++ % 26));
                map.set(e.name, n);
            }
            return new AST(NodeType.ATOM, n);
        }
        if (e.nodes.length)
            return new AST(e.type, e.name, ...e.nodes.map(walk));
        return e;
    };
    return walk(ast);
}
export class Core {
    kernel = new SemanticNbeKernel;
    checker = new SemanticNbeTypeChecker(this.kernel);
    // 源定义（当前 AST 形式）：系统表 + 用户定义
    sysTypes = new Map();
    sysDefs = new Map();
    userDefs = new Map();
    userTypes = new Map();
    parser = new TypeParser;
    constructor() {
        this.initSystem();
    }
    // ===== 系统表 =====
    // 系统类型/构造子（无定义体，如 True:U、true:True、0:nat）
    setSystemType(name, type) {
        this.sysTypes.set(name, type);
        const k = toKAST(type);
        if (k)
            this.checker.setConstantType(name, k);
        else
            throw new Error(`无法解析系统类型 ${name}: ${astToString(type)}`);
    }
    // 系统定义（有定义体，如 not := \l a:U. a→False）
    setSystemDefinition(name, def, type) {
        const k = toKAST(def);
        if (!k)
            throw new Error(`无法解析系统定义 ${name}`);
        let resultType;
        let stored = k;
        let generalized;
        const options = {
            elaborateMetas: true,
            allowNamedSchematicMetas: true,
            allowUnsolvedTermMetas: true,
            allowGeneratedSchematicMetas: true,
            generalizeMetas: true,
        };
        if (type) {
            const kt = toKAST(type);
            if (!kt)
                throw new Error(`无法解析系统定义类型 ${name}`);
            const r = this.checker.tryCheck(k, kt, [], options);
            if (r.status !== "success")
                throw new Error(`系统定义 ${name} 类型检查失败: ${failureMessages[r.code]}`);
            resultType = r.type;
            stored = r.term ?? r.elaboratedTerm ?? k;
            generalized = r.generalizedMetas;
        }
        else {
            const r = this.checker.trySynthesize(k, [], options);
            if (r.status !== "success")
                throw new Error(`系统定义 ${name} 类型推断失败: ${failureMessages[r.code]}`);
            resultType = r.type;
            stored = r.term ?? r.elaboratedTerm ?? k;
            generalized = r.generalizedMetas;
        }
        const ok = this.registerConstant(name, resultType, stored, generalized);
        if (ok)
            this.sysDefs.set(name, def);
        return ok;
    }
    // 注册一个常量：推断类型含未解元变量 → 多态 scheme（每次使用实例化新元变量）；
    // 否则普通常量类型。定义体含元变量时 kernel 只保留源（惰性编译）。
    registerConstant(name, resultType, stored, generalized) {
        if (generalized?.length) {
            const ok = this.checker.setConstantSchemeSnapshot(name, {
                type: resultType,
                metas: generalized.map(m => ({ name: m.name, expectedType: m.expectedType })),
            });
            if (!ok) {
                // scheme 编译失败（如引用了未声明的元变量）→ 退回普通常量类型
                this.checker.setConstantType(name, resultType);
            }
        }
        else {
            this.checker.setConstantType(name, resultType);
        }
        return this.kernel.setDefinition(name, stored);
    }
    initSystem() {
        const p = (s) => this.parser.parse(s);
        const U0 = p("\\U 0"); // U @0（宇宙层级 0）
        const nat = p("nat");
        this.setSystemType("True", U0);
        this.setSystemType("true", p("True"));
        this.setSystemType("False", U0);
        this.setSystemType("nat", U0);
        this.setSystemType("0", nat);
        this.setSystemType("succ", p("nat→nat"));
        // 宇宙层级机制（hott 的 sysTypes）：U@ : U@:（层级之排序）、@succ/@max 层级算术
        const uAt = { type: "var", name: "U@" };
        const uAtColon = { type: "var", name: "U@:" };
        const arr = (a, b) => ({ type: "->", name: "", nodes: [a, b] });
        this.checker.setConstantType("U@", uAtColon);
        this.checker.setConstantType("U@:", uAtColon);
        this.checker.setConstantType("@succ", arr(uAt, uAt));
        this.checker.setConstantType("@max", arr(uAt, arr(uAt, uAt)));
    }
    // ===== 初始系统表批量注册 =====
    // 由 src/tt/initial.ts 的 SysRule 列表驱动（创造模式全量 / 其它模式最小集）：
    //   type/ctor/ind：`name:Type` → 注册常量类型
    //   def：`name := body` / `name : Type` → 注册定义/公设
    //   rule：`lhs ≡ rhs` → 注册计算规则（NBE 模式重写）
    // 三遍注册：先类型（常量类型互相引用），再计算规则（定义体检查需要归约），最后定义（可引用前面所有）。
    computeRules = {};
    registerSystemRules(rules) {
        this.computeRules = {};
        // pass 1：type/ctor/ind 常量类型
        for (const rule of rules) {
            const ast = this.parser.parse(rule.text);
            if (!ast) {
                console.warn(`[T-layer] 系统规则无法解析，已跳过: ${rule.group}/${rule.kind}: ${rule.text}`);
                continue;
            }
            if ((rule.kind === "type" || rule.kind === "ctor" || rule.kind === "ind")
                && ast.type === NodeType.PROP && ast.name === ":" && ast.nodes[0].type === NodeType.ATOM) {
                try {
                    this.setSystemType(ast.nodes[0].name, ast.nodes[1]);
                }
                catch (e) {
                    console.warn(`[T-layer] 系统类型注册失败 ${rule.text}:`, e);
                }
            }
            // 形如 `Σa:U.C a : U` 的形成规则：仅展示，不注册常量
        }
        // pass 2：计算规则
        for (const rule of rules) {
            const ast = this.parser.parse(rule.text);
            if (!ast || rule.kind !== "rule")
                continue;
            if (ast.type === NodeType.PROP && ast.name === "==") {
                const k = toKAST(ast.nodes[0]);
                const kr = toKAST(ast.nodes[1]);
                if (k && kr) {
                    // 摊平 lhs 的头部与应用参数：pattern = [head, ...args]
                    const args = [];
                    let head = k;
                    while (head.type === "apply") {
                        args.unshift(head.nodes[1]);
                        head = head.nodes[0];
                    }
                    if (head.type === "var" && head.name) {
                        (this.computeRules[head.name] ??= []).push({ pattern: [head, ...args], result: kr });
                    }
                }
            }
        }
        this.kernel.replaceComputeRules(this.computeRules);
        // pass 3：定义（需要类型 + 计算规则）
        for (const rule of rules) {
            const ast = this.parser.parse(rule.text);
            if (!ast || rule.kind !== "def")
                continue;
            // 两种形式：`name := body`（定义）或 `name : Type`（带类型的定理常量）
            if (ast.type === NodeType.PROP && ast.nodes[0].type === NodeType.ATOM) {
                const name = ast.nodes[0].name;
                try {
                    if (ast.name === ":=") {
                        const rhs = ast.nodes[1];
                        if (rhs.type === NodeType.SYM && rhs.name === ":") {
                            this.setSystemDefinition(name, rhs.nodes[0], rhs.nodes[1]);
                        }
                        else {
                            this.setSystemDefinition(name, rhs);
                        }
                    }
                    else if (ast.name === ":") {
                        this.setSystemType(name, ast.nodes[1]);
                    }
                }
                catch (e) {
                    console.warn(`[T-layer] 系统定义注册失败 ${rule.text}:`, e);
                }
            }
        }
    }
    // ===== 定义 =====
    // x := v 或 x := v : T；返回定义的类型（当前 AST）
    define(name, value, type) {
        if (this.sysTypes.has(name) || this.sysDefs.has(name)) {
            throw new Error(`名称 ${name} 是系统表名称，不能重新定义`);
        }
        const k = toKAST(value);
        if (!k)
            throw new Error(`无法解析定义体: ${astToString(value)}`);
        const options = {
            elaborateMetas: true,
            allowNamedSchematicMetas: true,
            allowUnsolvedTermMetas: true,
            allowGeneratedSchematicMetas: true,
            generalizeMetas: true,
        };
        let resultType;
        let stored = k;
        let generalized;
        if (type) {
            const kt = toKAST(type);
            if (!kt)
                throw new Error(`无法解析定义类型: ${astToString(type)}`);
            const r = this.checker.tryCheck(k, kt, [], options);
            if (r.status !== "success") {
                throw new Error(`${name} 的类型检查失败: ${failureMessages[r.code]}`);
            }
            // 用检查器解析后的类型（元变量已求解），而非原始 ?T
            resultType = r.type;
            stored = r.term ?? r.elaboratedTerm ?? k;
            generalized = r.generalizedMetas;
        }
        else {
            const r = this.checker.trySynthesize(k, [], options);
            if (r.status !== "success") {
                throw new Error(`${name} 的类型推断失败: ${failureMessages[r.code]}`);
            }
            resultType = r.type;
            stored = r.term ?? r.elaboratedTerm ?? k;
            generalized = r.generalizedMetas;
        }
        this.registerConstant(name, resultType, stored, generalized);
        this.userDefs.set(name, value);
        const currentType = prettyMetaType(fromKAST(resultType));
        this.userTypes.set(name, currentType);
        return currentType;
    }
    // ===== 断言 =====
    // a : T 类型断言（无返回值；失败抛错）
    assertType(expr, type) {
        const k = toKAST(expr);
        const kt = toKAST(type);
        if (!k || !kt)
            throw new Error("断言表达式无法解析");
        const r = this.checker.tryCheck(k, kt, [], {
            allowNamedSchematicMetas: true,
            allowUnsolvedTermMetas: true,
            allowGeneratedSchematicMetas: true,
        });
        if (r.status !== "success") {
            throw new Error(`类型断言失败: ${astToString(expr)} : ${astToString(type)} （${failureMessages[r.code]}）`);
        }
    }
    // a == b（≡）定义相等断言
    assertEq(left, right) {
        const kl = toKAST(left);
        const kr = toKAST(right);
        if (!kl || !kr)
            throw new Error("相等断言表达式无法解析");
        const r = this.checker.tryDefinitionalEquality(kl, kr, [], {
            allowNamedSchematicMetas: true,
            allowUnsolvedTermMetas: true,
            allowGeneratedSchematicMetas: true,
        });
        if (r.status !== "success") {
            // 检查器在两边不定义相等时返回 type-mismatch，这里给出更贴切的描述
            const why = r.code === "type-mismatch"
                ? "两边不定义相等"
                : failureMessages[r.code];
            throw new Error(`定义相等断言失败: ${astToString(left)} ≠ ${astToString(right)} （${why}）`);
        }
    }
    // 断言相等的布尔版（不抛错）
    eq(left, right) {
        const kl = toKAST(left);
        const kr = toKAST(right);
        if (!kl || !kr)
            return false;
        return this.checker.tryDefinitionalEquality(kl, kr, [], {
            allowNamedSchematicMetas: true,
            allowGeneratedSchematicMetas: true,
        }).status === "success";
    }
    // ===== 类型推断 =====
    infer(expr) {
        const k = toKAST(expr);
        if (!k)
            throw new Error("表达式无法解析");
        const r = this.checker.trySynthesize(k, [], {
            allowNamedSchematicMetas: true,
            allowUnsolvedTermMetas: true,
            allowGeneratedSchematicMetas: true,
        });
        if (r.status !== "success") {
            throw new Error(`类型推断失败: ${astToString(expr)} （${failureMessages[r.code]}）`);
        }
        return prettyMetaType(fromKAST(r.type));
    }
    // ===== 归约（调试用） =====
    whnf(expr) {
        const k = toKAST(expr);
        if (!k)
            return null;
        const r = this.kernel.tryWhnf(k);
        return r ? fromKAST(r) : null;
    }
    normalize(expr) {
        const k = toKAST(expr);
        if (!k)
            return null;
        const r = this.kernel.tryNormalize(k);
        return r ? fromKAST(r) : null;
    }
    // ===== 命令入口 =====
    // 解析文本（供 GUI 提交前解析；失败返回 null）
    parse(text) {
        return this.parser.parse(text) ?? null;
    }
    // 接受解析后的命令 AST：
    //   x := v / x := v : T（定义）、a : T（类型断言）、a == b（定义相等）、裸表达式（推断）
    run(cmd) {
        if (cmd.type === NodeType.PROP) {
            if (cmd.name === ":=") {
                const nameNode = cmd.nodes[0];
                const name = nameNode.type === NodeType.ATOM ? nameNode.name : "";
                if (!name)
                    throw new Error("定义缺少名称");
                const rhs = cmd.nodes[1];
                if (rhs.type === NodeType.SYM && rhs.name === ":") {
                    // x := v : T
                    const type = this.define(name, rhs.nodes[0], rhs.nodes[1]);
                    return { kind: "define", name, type };
                }
                const type = this.define(name, rhs);
                return { kind: "define", name, type };
            }
            if (cmd.name === ":") {
                this.assertType(cmd.nodes[0], cmd.nodes[1]);
                return { kind: "type-assert", type: cmd.nodes[1] };
            }
            if (cmd.name === "==") {
                this.assertEq(cmd.nodes[0], cmd.nodes[1]);
                const t = this.infer(cmd.nodes[0]);
                return { kind: "eq-assert", type: t };
            }
        }
        // 裸表达式：直接类型推断
        const type = this.infer(cmd);
        return { kind: "infer", type };
    }
    // 便捷入口：文本命令 -> 人类可读结果（测试/调试用）
    exec(text) {
        const ast = this.parser.parse(text);
        if (!ast)
            throw new Error(`无法解析: ${text}`);
        const r = this.run(ast);
        switch (r.kind) {
            case "define": return `${r.name} := ${text.slice(text.indexOf(":=") + 2).trim()} : ${astToString(r.type)}`;
            case "type-assert": return `✓ ${astToString(ast)}`;
            case "eq-assert": return `✓ ${astToString(ast)}`;
            case "infer": return `${astToString(ast)} : ${astToString(r.type)}`;
        }
    }
}
//# sourceMappingURL=core.js.map