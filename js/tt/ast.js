export var NodeType;
(function (NodeType) {
    NodeType[NodeType["ATOM"] = 0] = "ATOM";
    NodeType[NodeType["SYM"] = 1] = "SYM";
    NodeType[NodeType["BOUND"] = 2] = "BOUND";
    NodeType[NodeType["U"] = 3] = "U";
    NodeType[NodeType["APP"] = 4] = "APP";
    NodeType[NodeType["PROP"] = 5] = "PROP";
    NodeType[NodeType["UFN"] = 6] = "UFN";
    NodeType[NodeType["INDEX"] = 7] = "INDEX";
})(NodeType || (NodeType = {}));
export class AST {
    type;
    nodes;
    name;
    start;
    end;
    index; // INDEX 节点的 De Bruijn 索引（0 = 最近绑定）
    range(start, end) { this.start = start; this.end = end; return this; }
    setIndex(i) { this.index = i; return this; }
    constructor(type, name, ...nodes) {
        this.type = type;
        this.name = name;
        this.nodes = nodes;
    }
    clone() {
        const nodes = this.nodes.map(e => e.clone());
        const c = new AST(this.type, this.name, ...nodes);
        c.index = this.index;
        return c;
    }
    // ============ De Bruijn 索引表示 ============
    // BOUND(name, [type, body])：type 在外部上下文求值，body 在扩展上下文（name 绑定）。
    // 转 DB 后，body 中该 name 的出现变为 INDEX(i)（i=向上数第 i 个绑定器，0=最近）；
    // ATOM 视为全局常量/自由名，不被绑定器捕获，转换后仍是 ATOM。
    // env：绑定名栈，env[0] = 最近绑定（即 DB 索引 0）。
    // 名字形式 -> DB 形式
    static toDB(e, env = []) {
        switch (e.type) {
            case NodeType.ATOM: {
                const i = env.indexOf(e.name);
                if (i < 0)
                    return e.clone(); // 自由/全局名
                return new AST(NodeType.INDEX, e.name).setIndex(i);
            }
            case NodeType.BOUND: {
                const [ty, body, ...rest] = e.nodes;
                const ns = [this.toDB(ty, env)];
                const env2 = [e.name, ...env];
                ns.push(this.toDB(body, env2));
                for (const r of rest)
                    ns.push(this.toDB(r, env2));
                const c = new AST(NodeType.BOUND, e.name, ...ns);
                c.start = e.start;
                c.end = e.end;
                return c;
            }
            default:
                return new AST(e.type, e.name, ...e.nodes.map(n => this.toDB(n, env)));
        }
    }
    // DB 形式 -> 名字形式
    static fromDB(e, env = []) {
        switch (e.type) {
            case NodeType.INDEX:
                return new AST(NodeType.ATOM, env[e.index] ?? '#' + e.index);
            case NodeType.BOUND: {
                const [ty, body, ...rest] = e.nodes;
                const ns = [this.fromDB(ty, env)];
                const env2 = [e.name, ...env];
                ns.push(this.fromDB(body, env2));
                for (const r of rest)
                    ns.push(this.fromDB(r, env2));
                const c = new AST(NodeType.BOUND, e.name, ...ns);
                c.start = e.start;
                c.end = e.end;
                return c;
            }
            default:
                return new AST(e.type, e.name, ...e.nodes.map(n => this.fromDB(n, env)));
        }
    }
    // 平移：DB 索引 >= cutoff 的自由变量增加 d（d 可为负）；越过绑定器时 cutoff+1
    static shift(d, e, cutoff = 0) {
        switch (e.type) {
            case NodeType.INDEX:
                return e.index >= cutoff
                    ? new AST(NodeType.INDEX, e.name).setIndex(e.index + d)
                    : e.clone();
            case NodeType.BOUND: {
                const [ty, body, ...rest] = e.nodes;
                const ns = [this.shift(d, ty, cutoff)];
                ns.push(this.shift(d, body, cutoff + 1));
                for (const r of rest)
                    ns.push(this.shift(d, r, cutoff + 1));
                const c = new AST(NodeType.BOUND, e.name, ...ns);
                c.start = e.start;
                c.end = e.end;
                return c;
            }
            default:
                return new AST(e.type, e.name, ...e.nodes.map(n => this.shift(d, n, cutoff)));
        }
    }
    // 替换：把 INDEX(i) 换成 val（val 视为处于替换点外层上下文，无预先移位）。
    // 结果少一层绑定：INDEX(j>i) -> j-1；进入 BOUND 的 body 时目标变 i+1、val 整体上移 1。
    static substAt(e, i, val) {
        switch (e.type) {
            case NodeType.INDEX:
                if (e.index === i)
                    return val.clone();
                if (e.index > i)
                    return new AST(NodeType.INDEX, e.name).setIndex(e.index - 1);
                return e.clone();
            case NodeType.BOUND: {
                const [ty, body, ...rest] = e.nodes;
                const ns = [this.substAt(ty, i, val)];
                const v1 = this.shift(1, val);
                ns.push(this.substAt(body, i + 1, v1));
                for (const r of rest)
                    ns.push(this.substAt(r, i + 1, v1));
                const c = new AST(NodeType.BOUND, e.name, ...ns);
                c.start = e.start;
                c.end = e.end;
                return c;
            }
            default:
                return new AST(e.type, e.name, ...e.nodes.map(n => this.substAt(n, i, val)));
        }
    }
    // 按名字替换：替换 DB 形式中仍为 ATOM(name) 的自由出现
    // （绑定出现已是 INDEX，天然不受影响；val 含自由名时不保证 α-安全）
    static substName(e, name, val) {
        switch (e.type) {
            case NodeType.ATOM:
                return e.name === name ? val.clone() : e.clone();
            default:
                return new AST(e.type, e.name, ...e.nodes.map(n => this.substName(n, name, val)));
        }
    }
    // 一步 β-归约（DB 形式）：(λx:A.M) N -> M[N/x]（类型 A 丢弃，N 按替换点上下文处理）
    static beta1(e) {
        if (e.type === NodeType.APP && e.nodes[0].type === NodeType.BOUND) {
            return this.substAt(e.nodes[0].nodes[1], 0, e.nodes[1]);
        }
        return e;
    }
}
// atom是变量、常量(只有name)、sym先不管，bound是lambda、pi这些，一个name，nodes是type和body，U是universe，nodes只有一个，角标。APP作用nodes有两个，Prop是 a:B, a=b这类断言，name是":"或"="或":="，nodes是a和b，注意:=有三个nodes，为断言a=b:c。
// ============ Core 类型论内核（大框架，子模块待填） ============
// 输入均为 AST，值即 AST（弱规范化表达式）。内部统一转 De Bruijn 索引表示做归约/相等。
export class Core {
    // 上下文：name -> AST（常量定义/变量绑定，暂以 Map 表示，可换 De Bruijn/栈）
    ctx = new Map();
    // ---- DB 表示：名字 <-> 索引（用户层接口）----
    toDB(e) { return AST.toDB(e); }
    fromDB(e) { return AST.fromDB(e); }
    // ---- 正规化 ----
    // whnf：弱头正规形（名字层接口，内部转 DB）
    whnf(e) {
        return AST.fromDB(this.whnfDB(AST.toDB(e)));
    }
    // nf：强正规形
    nf(e) {
        return AST.fromDB(this.nfDB(AST.toDB(e)));
    }
    // DB 内部：弱头正规形（沿最左头部反复做 δ 展开 + β 归约，直至无头部 redex）
    whnfDB(e) {
        let t = e;
        for (;;) {
            // δ：展开头部已定义常量
            let head = t;
            while (head.type === NodeType.APP)
                head = head.nodes[0];
            if (head.type === NodeType.ATOM) {
                const d = this.ctx.get(head.name);
                if (d) {
                    t = this.replaceHead(t, AST.toDB(d));
                    continue;
                }
            }
            // β：最左头部 redex (λx.M) a1 ... an
            const args = [];
            let h = t;
            while (h.type === NodeType.APP) {
                args.push(h.nodes[1]);
                h = h.nodes[0];
            }
            if (h.type === NodeType.BOUND && args.length > 0) {
                const arg = args[args.length - 1];
                t = AST.substAt(h.nodes[1], 0, arg);
                for (let k = args.length - 2; k >= 0; k--)
                    t = new AST(NodeType.APP, '', t, args[k]);
                continue;
            }
            break;
        }
        return t;
    }
    // DB 内部：强正规形
    nfDB(e) {
        const w = this.whnfDB(e);
        switch (w.type) {
            case NodeType.INDEX:
            case NodeType.ATOM:
            case NodeType.SYM:
                return w;
            case NodeType.APP:
                return new AST(NodeType.APP, w.name, this.nfDB(w.nodes[0]), this.nfDB(w.nodes[1]));
            case NodeType.BOUND: {
                const [ty, body, ...rest] = w.nodes;
                const c = new AST(NodeType.BOUND, w.name, this.nfDB(ty), this.nfDB(body), ...rest.map(r => this.nfDB(r)));
                c.start = w.start;
                c.end = w.end;
                return c;
            }
            default: // U, PROP, UFN
                return new AST(w.type, w.name, ...w.nodes.map(n => this.nfDB(n)));
        }
    }
    // 把 (f a1 ... an) 的头部 f 原位换成 head，保持参数
    replaceHead(t, head) {
        if (t.type !== NodeType.APP)
            return head;
        const args = [];
        let cur = t;
        while (cur.type === NodeType.APP) {
            args.unshift(cur.nodes[1]);
            cur = cur.nodes[0];
        }
        let r = head;
        for (const a of args)
            r = new AST(NodeType.APP, '', r, a);
        return r;
    }
    // ---- 转换 ----
    // conv：定义相等判断（双方 nf 后做结构比较）
    conv(a, b) {
        return this.convDB(this.nfDB(AST.toDB(a)), this.nfDB(AST.toDB(b)));
    }
    convDB(x, y) {
        if (x.type !== y.type)
            return false;
        switch (x.type) {
            case NodeType.INDEX: return x.index === y.index;
            case NodeType.ATOM:
            case NodeType.SYM:
            case NodeType.U:
                return x.name === y.name && this.convNodes(x, y);
            case NodeType.BOUND:
                return this.convNodes(x, y); // α 等价：绑定名不参与比较
            default: // APP, PROP, UFN
                return x.name === y.name && this.convNodes(x, y);
        }
    }
    convNodes(x, y) {
        if (x.nodes.length !== y.nodes.length)
            return false;
        return x.nodes.every((n, i) => this.convDB(n, y.nodes[i]));
    }
    // ---- 替换 / 归约 ----
    // subst：将 e 中自由名 name 替换为 val（转 DB 后替换仍为 ATOM 的自由出现，遮蔽的同名绑定不误伤）
    subst(e, name, val) {
        return AST.fromDB(AST.substName(AST.toDB(e), name, AST.toDB(val)));
    }
    // beta：β-归约一步（最外层 redex）
    beta(e) {
        return AST.fromDB(AST.beta1(AST.toDB(e)));
    }
    // delta：按上下文展开头部常量定义（一步）
    delta(e) {
        const d = AST.toDB(e);
        let head = d;
        while (head.type === NodeType.APP)
            head = head.nodes[0];
        if (head.type === NodeType.ATOM) {
            const def = this.ctx.get(head.name);
            if (def)
                return AST.fromDB(this.replaceHead(d, AST.toDB(def)));
        }
        return e;
    }
    // ---- 类型推导（synthesize / infer）----
    // infer：综合出 a 的类型
    infer(a) {
        throw new Error('NotImplemented: infer');
    }
    synth(a) {
        return this.infer(a);
    }
    // ---- 双向类型检查 ----
    // check：在期望类型 ty 下检查 a（checking 方向）
    check(a, ty) {
        throw new Error('NotImplemented: check');
    }
    // ---- 上下文操作 ----
    lookup(name) {
        return this.ctx.get(name);
    }
    define(name, val) {
        this.ctx.set(name, val);
    }
    // ---- 主入口 ----
    // 有 ty 则检查，无 ty 则推导；返回类型
    typecheck(a, ty) {
        if (ty === undefined)
            return this.infer(a);
        this.check(a, ty);
        return ty;
    }
}
//# sourceMappingURL=ast.js.map