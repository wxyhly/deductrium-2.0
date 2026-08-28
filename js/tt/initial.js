// ==================== 类型层初始系统表（T-layer 系统定义） ====================
// 移植自 deductrium-hott-optimised/src/tt/initial.ts（原系统完整定义，HoTT 基础）。
// 宇宙多态（hott 风格）：
//   - 类型形成子/构造子/消去子/定理都带显式宇宙层级参数：`@name : Πu:𝒰@. ... 𝒰u ...`
//   - 别名 `name := @name ?u` 隐藏层级（scheme 多态，使用处按上下文求解）
//   - 计算规则同时注册 @-头（显式层级）与别名头（隐藏层级）两种形式
// 小类型（True/False/nat/Bool/Z/S1/S2/I/Ord）在层级 0：`X : 𝒰`。
// 面糖：`x=y`、`A+B`、`A×B`、`(a,b)`、`m▪n`、`[[a]]`、`[a]` 由 kast.ts desugar 处理。
const U = "𝒰"; // 裸 𝒰 = 层级 0
export function initMinimalRules() {
    return [
        { group: "True", kind: "type", text: `True:${U}` },
        { group: "True", kind: "ctor", text: "true:True" },
        { group: "False", kind: "type", text: `False:${U}` },
        { group: "nat", kind: "type", text: `nat:${U}` },
        { group: "nat", kind: "ctor", text: "0:nat" },
        { group: "nat", kind: "ctor", text: "succ:nat→nat" },
    ];
}
export function initCreativeRules() {
    const r = [];
    const add = (group, kind, text) => r.push({ group, kind, text });
    // ===== True =====
    add("True", "type", `True:${U}`);
    add("True", "ctor", "true:True");
    add("True", "ind", "@ind_True:Πu:𝒰@.ΠC:(True→𝒰u).C true→Πx:True.C x");
    add("True", "def", "ind_True := @ind_True ?u");
    add("True", "rule", "@ind_True ?u ?C ?ct true ≡ ?ct");
    add("True", "rule", "ind_True ?C ?ct true ≡ ?ct");
    // ===== False =====
    add("False", "type", `False:${U}`);
    add("False", "ind", "@ind_False:Πu:𝒰@.ΠC:(False→𝒰u).Πx:False.C x");
    add("False", "def", "ind_False := @ind_False ?u");
    add("False", "def", "not := λa:𝒰_. a→False");
    // ===== Bool =====
    add("Bool", "type", `Bool:${U}`);
    add("Bool", "ctor", "0b:Bool");
    add("Bool", "ctor", "1b:Bool");
    add("Bool", "ind", "@ind_Bool:Πu:𝒰@.ΠC:(Bool→𝒰u).C 0b→C 1b→Πx:Bool.C x");
    add("Bool", "def", "ind_Bool := @ind_Bool ?u");
    add("Bool", "rule", "@ind_Bool ?u ?C ?c0 ?c1 0b ≡ ?c0");
    add("Bool", "rule", "@ind_Bool ?u ?C ?c0 ?c1 1b ≡ ?c1");
    add("Bool", "rule", "ind_Bool ?C ?c0 ?c1 0b ≡ ?c0");
    add("Bool", "rule", "ind_Bool ?C ?c0 ?c1 1b ≡ ?c1");
    // ===== nat =====
    add("nat", "type", `nat:${U}`);
    add("nat", "ctor", "0:nat");
    add("nat", "ctor", "succ:nat→nat");
    add("nat", "ind", "@ind_nat:Πu:𝒰@.ΠC:(nat→𝒰u).C 0→(Πn:nat.C n→C (succ n))→Πn:nat.C n");
    add("nat", "def", "ind_nat := @ind_nat ?u");
    add("nat", "def", "pred := ind_nat (λx:nat. nat) 0 (λx:nat. λy:nat. x)");
    add("nat", "def", "double := ind_nat (λx:nat. nat) 0 (λy:nat. λz:nat. succ (succ z))");
    add("nat", "def", "add := λx:nat. ind_nat (λy:nat. nat) x (λx:nat. succ)");
    add("nat", "def", "mul := λx:nat. ind_nat (λy:nat. nat) 0 (λk:nat. λn:nat. add n x)");
    add("nat", "def", "pow := λx:nat. ind_nat (λy:nat. nat) 1 (λk:nat. λn:nat. mul n x)");
    add("nat", "def", "factorial := ind_nat (λy:nat. nat) 1 (λk:nat. λn:nat. mul n (succ k))");
    add("nat", "rule", "@ind_nat ?u ?C ?c0 ?cs 0 ≡ ?c0");
    add("nat", "rule", "@ind_nat ?u ?C ?c0 ?cs (succ ?n) ≡ ?cs ?n (@ind_nat ?u ?C ?c0 ?cs ?n)");
    add("nat", "rule", "ind_nat ?C ?c0 ?cs 0 ≡ ?c0");
    add("nat", "rule", "ind_nat ?C ?c0 ?cs (succ ?n) ≡ ?cs ?n (ind_nat ?C ?c0 ?cs ?n)");
    // ===== eq（路径相等） =====
    // 与原版一致：`eq := @eq ?u ?a`（2 参糖，隐藏层级与类型：eq x y）、`refl := @refl ?u ?a`（1 参糖：refl x）、
    // `rfl := refl ?x`（0 参）。定理/消去子的类型用显式 @eq u a x y / @refl u a x（u,a 是绑定的层级/类型变量）。
    add("eq", "type", "@eq:Πu:𝒰@.Πa:𝒰u.a→a→𝒰u");
    add("eq", "def", "eq := @eq ?u ?a");
    add("eq", "ctor", "@refl:Πu:𝒰@.Πa:𝒰u.Πx:a.@eq u a x x");
    add("eq", "def", "refl := @refl ?u ?a");
    add("eq", "def", "rfl := refl ?x");
    add("eq", "ind", "@ind_eq:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.Πx:a.ΠC:(Πy:a.@eq u a x y→𝒰v).C x (@refl u a x)→Πy:a.Πm:@eq u a x y.C y m");
    add("eq", "def", "ind_eq := @ind_eq ?u ?v");
    add("eq", "ind", "@ind_eq2:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(Πx:a.Πy:a.@eq u a x y→𝒰v).(Πx:a.C x x (@refl u a x))→Πx:a.Πy:a.Πm:@eq u a x y.C x y m");
    add("eq", "def", "ind_eq2 := @ind_eq2 ?u ?v");
    // 定理常量（原 @ap/@apid/... 公设：无定义体，不归约）
    add("eq", "def", "@ap:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.Πb:𝒰v.Πx:a.Πy:a.Πf:(a→b).@eq u a x y→@eq v b (f x) (f y)");
    add("eq", "def", "ap := @ap ?u ?v");
    add("eq", "def", "@apid:Πu:𝒰@.Πa:𝒰u.Πx:a.Πy:a.Πp:(@eq u a x y).@eq u a (ap a a x y (λz:a. z) p) p");
    add("eq", "def", "apid := @apid ?u");
    add("eq", "def", "@apconst:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.Πb:𝒰v.Πx:a.Πy:a.Πp:(@eq u a x y).Πk:b.@eq v b (ap a b x y (λz:a. k) p) (@refl v b k)");
    add("eq", "def", "apconst := @apconst ?u ?v");
    add("eq", "def", "@trans:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.Πx:a.Πy:a.ΠC:(a→𝒰v).@eq u a x y→C x→C y");
    add("eq", "def", "trans := @trans ?u ?v");
    add("eq", "def", "@apd:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.Πx:a.Πy:a.ΠC:(a→𝒰v).Πf:(Πx:a.C x).Πp:(@eq u a x y).@eq v (C y) (trans a x y C p (f x)) (f y)");
    add("eq", "def", "apd := @apd ?u ?v");
    add("eq", "def", "@inveq:Πu:𝒰@.Πa:𝒰u.Πx:a.Πy:a.@eq u a x y→@eq u a y x");
    add("eq", "def", "inveq := @inveq ?u");
    add("eq", "def", "@compeq:Πu:𝒰@.Πa:𝒰u.Πx:a.Πy:a.Πz:a.@eq u a x y→@eq u a y z→@eq u a x z");
    add("eq", "def", "compeq := @compeq ?u");
    add("eq", "def", "@rightrfl:Πu:𝒰@.Πa:𝒰u.Πx:a.Πy:a.Πm:(@eq u a x y).@eq u a (compeq a x y y m (@refl u a y)) m");
    add("eq", "def", "rightrfl := @rightrfl ?u");
    add("eq", "def", "@invinveq:Πu:𝒰@.Πa:𝒰u.Πx:a.Πy:a.Πm:(@eq u a x y).@eq u a (inveq a y x (inveq a x y m)) m");
    add("eq", "def", "invinveq := @invinveq ?u");
    add("eq", "def", "@rightinveq:Πu:𝒰@.Πa:𝒰u.Πx:a.Πy:a.Πm:(@eq u a x y).@eq u a (compeq a x y y m (inveq a x y m)) (@refl u a x)");
    add("eq", "def", "rightinveq := @rightinveq ?u");
    add("eq", "def", "@leftinveq:Πu:𝒰@.Πa:𝒰u.Πx:a.Πy:a.Πm:(@eq u a x y).@eq u a (compeq a y x y (inveq a x y m) m) (@refl u a y)");
    add("eq", "def", "leftinveq := @leftinveq ?u");
    add("eq", "def", "@compinveq:Πu:𝒰@.Πa:𝒰u.Πx:a.Πy:a.Πz:a.Πm:(@eq u a x y).Πn:(@eq u a y z).@eq u a (inveq a x z (compeq a x y z m n)) (compeq a z y x (inveq a y z n) (inveq a x y m))");
    add("eq", "def", "compinveq := @compinveq ?u");
    add("eq", "def", "@compeqassoc:Πu:𝒰@.Πa:𝒰u.Πx:a.Πy:a.Πz:a.Πw:a.Πm:(@eq u a x y).Πn:(@eq u a y z).Πo:(@eq u a z w).@eq u a (compeq a x z w (compeq a x y z m n) o) (compeq a x y w m (compeq a y z w n o))");
    add("eq", "def", "compeqassoc := @compeqassoc ?u");
    add("eq", "def", "@transconst:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.Πb:𝒰v.Πx:a.Πy:a.Πm:(@eq u a x y).Πk:b.@eq v b (trans a x y (λx:a. b) m k) k");
    add("eq", "def", "transconst := @transconst ?u ?v");
    add("eq", "def", "@transright:Πu:𝒰@.Πa:𝒰u.Πx0:a.Πx1:a.Πx2:a.Πp:(@eq u a x1 x2).Πq:(@eq u a x0 x1).@eq u a (trans a x0 x2 (λx:a. @eq u a x0 x) p q) (compeq a x0 x1 x2 q p)");
    add("eq", "def", "transright := @transright ?u");
    add("eq", "def", "@transleft:Πu:𝒰@.Πa:𝒰u.Πx0:a.Πx1:a.Πx2:a.Πp:(@eq u a x1 x2).Πq:(@eq u a x1 x0).@eq u a (trans a x1 x2 (λx:a. @eq u a x x0) p q) (compeq a x2 x1 x0 (inveq a x1 x2 p) q)");
    add("eq", "def", "transleft := @transleft ?u");
    add("eq", "def", "@transleftright:Πu:𝒰@.Πa:𝒰u.Πx0:a.Πx1:a.Πx2:a.Πp:(@eq u a x1 x2).Πq:(@eq u a x1 x1).@eq u a (trans a x1 x2 (λx:a. @eq u a x x) p q) (compeq a x2 x1 x2 (compeq a x2 x1 x1 (inveq a x1 x2 p) q) p)");
    add("eq", "def", "transleftright := @transleftright ?u");
    add("eq", "def", "@transeq:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.Πb:𝒰v.Πx:a.Πy:a.Πf:(a→b).Πg:(a→b).Πp:(@eq u a x y).Πq:(@eq v b (f x) (g x)).@eq v b (trans a x y (λz:a. @eq v b (f z) (g z)) p q) (compeq b (f y) (g x) (g y) (compeq b (f y) (f x) (g x) (inveq b (f x) (f y) (ap a b x y f p)) q) (ap a b x y g p))");
    add("eq", "def", "transeq := @transeq ?u ?v");
    // 计算规则（@-头：模式用 @refl ?u2 ?a2 ?x；结果用 1 参糖 refl）
    add("eq", "rule", "@ind_eq ?u ?v ?a ?x ?C ?crfl ?x (@refl ?u2 ?a2 ?x) ≡ ?crfl");
    add("eq", "rule", "@ind_eq2 ?u ?v ?a ?C ?crfl ?x ?x (@refl ?u2 ?a2 ?x) ≡ ?crfl ?x");
    add("eq", "rule", "@ap ?u ?v ?a ?b ?x ?y ?f (@refl ?u2 ?a2 ?x) ≡ refl (?f ?x)");
    add("eq", "rule", "@apd ?u ?v ?a ?x ?y ?C ?f (@refl ?u2 ?a2 ?x) ≡ refl (?f ?x)");
    add("eq", "rule", "@trans ?u ?v ?a ?x ?y ?C (@refl ?u2 ?a2 ?x) ?v2 ≡ ?v2");
    add("eq", "rule", "@inveq ?u ?a ?x ?y (@refl ?u2 ?a2 ?x) ≡ refl ?x");
    add("eq", "rule", "@compeq ?u ?a ?x ?y ?z (@refl ?u2 ?a2 ?x) ?q ≡ ?q");
    add("eq", "rule", "@rightrfl ?u ?a ?x ?y (@refl ?u2 ?a2 ?x) ≡ refl (refl ?x)");
    add("eq", "rule", "@invinveq ?u ?a ?x ?y (@refl ?u2 ?a2 ?x) ≡ refl (refl ?x)");
    add("eq", "rule", "@rightinveq ?u ?a ?x ?y (@refl ?u2 ?a2 ?x) ≡ refl (refl ?x)");
    add("eq", "rule", "@leftinveq ?u ?a ?x ?y (@refl ?u2 ?a2 ?x) ≡ refl (refl ?x)");
    add("eq", "rule", "@compinveq ?u ?a ?x ?y ?z (@refl ?u2 ?a2 ?x) ?n ≡ inveq ?a ?y ?z (rightrfl ?a ?y ?z (inveq ?a ?y ?z ?n))");
    add("eq", "rule", "@compeqassoc ?u ?a ?x ?y ?z ?w (@refl ?u2 ?a2 ?x) ?n ?o ≡ refl (compeq ?a ?x ?z ?w ?n ?o)");
    add("eq", "rule", "@transconst ?u ?v ?a ?b ?x ?y (@refl ?u2 ?a2 ?x) ?k ≡ refl ?k");
    add("eq", "rule", "@transright ?u ?a ?x0 ?x1 ?x2 (@refl ?u2 ?a2 ?x1) ?q ≡ inveq ?a ?x1 ?x2 (rightrfl ?a ?x0 ?x1 ?q)");
    add("eq", "rule", "@transleft ?u ?a ?x0 ?x1 ?x2 (@refl ?u2 ?a2 ?x1) ?q ≡ refl ?q");
    add("eq", "rule", "@transleftright ?u ?a ?x0 ?x1 ?x2 (@refl ?u2 ?a2 ?x1) ?q ≡ inveq ?a ?x1 ?x2 (rightrfl ?a ?x0 ?x1 ?q)");
    add("eq", "rule", "@transeq ?u ?v ?a ?b ?x ?y ?f ?g (@refl ?u2 ?a2 ?x) ?q ≡ inveq ?b ?x ?y (rightrfl ?b ?x ?y ?q)");
    // 别名头（值头部是别名；refl 用 1 参糖模式）
    add("eq", "rule", "ind_eq ?a ?x ?C ?crfl ?x (refl ?x) ≡ ?crfl");
    add("eq", "rule", "ind_eq2 ?a ?C ?crfl ?x ?x (refl ?x) ≡ ?crfl ?x");
    add("eq", "rule", "ap ?a ?b ?x ?y ?f (refl ?x) ≡ refl (?f ?x)");
    add("eq", "rule", "apd ?a ?x ?y ?C ?f (refl ?x) ≡ refl (?f ?x)");
    add("eq", "rule", "trans ?a ?x ?y ?C (refl ?x) ?v ≡ ?v");
    add("eq", "rule", "inveq ?a ?x ?y (refl ?x) ≡ refl ?x");
    add("eq", "rule", "compeq ?a ?x ?y ?z (refl ?x) ?q ≡ ?q");
    add("eq", "rule", "rightrfl ?a ?x ?y (refl ?x) ≡ refl (refl ?x)");
    add("eq", "rule", "invinveq ?a ?x ?y (refl ?x) ≡ refl (refl ?x)");
    add("eq", "rule", "rightinveq ?a ?x ?y (refl ?x) ≡ refl (refl ?x)");
    add("eq", "rule", "leftinveq ?a ?x ?y (refl ?x) ≡ refl (refl ?x)");
    add("eq", "rule", "compinveq ?a ?x ?y ?z (refl ?x) ?n ≡ inveq ?a ?y ?z (rightrfl ?a ?y ?z (inveq ?a ?y ?z ?n))");
    add("eq", "rule", "compeqassoc ?a ?x ?y ?z ?w (refl ?x) ?n ?o ≡ refl (compeq ?a ?x ?z ?w ?n ?o)");
    add("eq", "rule", "transconst ?a ?b ?x ?y (refl ?x) ?k ≡ refl ?k");
    add("eq", "rule", "transright ?a ?x0 ?x1 ?x2 (refl ?x1) ?q ≡ inveq ?a ?x1 ?x2 (rightrfl ?a ?x0 ?x1 ?q)");
    add("eq", "rule", "transleft ?a ?x0 ?x1 ?x2 (refl ?x1) ?q ≡ refl ?q");
    add("eq", "rule", "transleftright ?a ?x0 ?x1 ?x2 (refl ?x1) ?q ≡ inveq ?a ?x1 ?x2 (rightrfl ?a ?x0 ?x1 ?q)");
    add("eq", "rule", "transeq ?a ?b ?x ?y ?f ?g (refl ?x) ?q ≡ inveq ?b ?x ?y (rightrfl ?b ?x ?y ?q)");
    // ===== Prod（Σ 依赖积） =====
    // ===== Prod（Σ 依赖积） =====
    add("Prod", "type", "Σa:𝒰.C a : 𝒰");
    add("Prod", "ctor", "@pair:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(a→𝒰v).Πx:a.Πy:C x.Σz:a.C z");
    add("Prod", "def", "pair := @pair ?u ?v ?a");
    add("Prod", "ind", "@ind_Σ:Πu:𝒰@.Πv:𝒰@.Πw:𝒰@.Πa:𝒰u.ΠC:(a→𝒰v).ΠD:(Σz:a.C z→𝒰w).(Πx:a.Πy:C x.D (pair a C x y))→Πm:(Σz:a.C z).D m");
    add("Prod", "def", "ind_Σ := @ind_Σ ?u ?v ?w");
    add("Prod", "def", "@pr0:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(a→𝒰v).(Σz:a.C z)→a");
    add("Prod", "def", "pr0 := @pr0 ?u ?v");
    add("Prod", "def", "@pr1:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.Πb:𝒰v.(Σ_:a.b)→b");
    add("Prod", "def", "pr1 := @pr1 ?u ?v");
    add("Prod", "def", "@prd1:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(a→𝒰v).Πm:(Σz:a.C z).C (pr0 a C m)");
    add("Prod", "def", "prd1 := @prd1 ?u ?v");
    add("Prod", "rule", "@ind_Σ ?u ?v ?w ?a ?C ?D ?f (@pair ?u2 ?v2 ?a ?C ?x ?y) ≡ ?f ?x ?y");
    add("Prod", "rule", "@pr0 ?u ?v ?a ?C (@pair ?u2 ?v2 ?a ?C ?x ?y) ≡ ?x");
    add("Prod", "rule", "@pr1 ?u ?v ?a ?b (@pair ?u2 ?v2 ?a (λx:a. b) ?x ?y) ≡ ?y");
    add("Prod", "rule", "@prd1 ?u ?v ?a ?C (@pair ?u2 ?v2 ?a ?C ?x ?y) ≡ ?y");
    add("Prod", "rule", "ind_Σ ?a ?C ?D ?f (@pair ?u2 ?v2 ?a ?C ?x ?y) ≡ ?f ?x ?y");
    add("Prod", "rule", "pr0 ?a ?C (@pair ?u2 ?v2 ?a ?C ?x ?y) ≡ ?x");
    add("Prod", "rule", "pr1 ?a ?b (@pair ?u2 ?v2 ?a (λx:a. b) ?x ?y) ≡ ?y");
    add("Prod", "rule", "prd1 ?a ?C (@pair ?u2 ?v2 ?a ?C ?x ?y) ≡ ?y");
    add("Prod", "rule", "ind_Σ ?a ?C ?D ?f (pair ?C ?x ?y) ≡ ?f ?x ?y");
    add("Prod", "rule", "pr0 ?a ?C (pair ?C ?x ?y) ≡ ?x");
    add("Prod", "rule", "pr1 ?a ?b (pair (λx:a. b) ?x ?y) ≡ ?y");
    add("Prod", "rule", "prd1 ?a ?C (pair ?C ?x ?y) ≡ ?y");
    // ===== Sum（无交并） =====
    add("Sum", "type", "@Sum:Πu:𝒰@.Πv:𝒰@.𝒰u→𝒰v→𝒰max(u,v)");
    add("Sum", "def", "Sum := @Sum ?u ?v");
    add("Sum", "ctor", "@inl:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.Πb:𝒰v.Πx:a.Sum a b");
    add("Sum", "def", "inl := @inl ?u ?v");
    add("Sum", "ctor", "@inr:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.Πb:𝒰v.Πy:b.Sum a b");
    add("Sum", "def", "inr := @inr ?u ?v");
    add("Sum", "ind", "@ind_Sum:Πu:𝒰@.Πv:𝒰@.Πw:𝒰@.Πa:𝒰u.Πb:𝒰v.ΠC:(Sum a b→𝒰w).(Πx:a.C (inl a b x))→(Πy:b.C (inr a b y))→Πm:Sum a b.C m");
    add("Sum", "def", "ind_Sum := @ind_Sum ?u ?v ?w");
    add("Sum", "rule", "@ind_Sum ?u ?v ?w ?a ?b ?C ?fl ?fr (@inl ?u2 ?v2 ?a ?b ?x) ≡ ?fl ?x");
    add("Sum", "rule", "@ind_Sum ?u ?v ?w ?a ?b ?C ?fl ?fr (@inr ?u2 ?v2 ?a ?b ?y) ≡ ?fr ?y");
    add("Sum", "rule", "ind_Sum ?a ?b ?C ?fl ?fr (@inl ?u2 ?v2 ?a ?b ?x) ≡ ?fl ?x");
    add("Sum", "rule", "ind_Sum ?a ?b ?C ?fl ?fr (@inr ?u2 ?v2 ?a ?b ?y) ≡ ?fr ?y");
    add("Sum", "rule", "ind_Sum ?a ?b ?C ?fl ?fr (inl ?a ?b ?x) ≡ ?fl ?x");
    add("Sum", "rule", "ind_Sum ?a ?b ?C ?fl ?fr (inr ?a ?b ?y) ≡ ?fr ?y");
    // ===== Z（整数） =====
    add("Z", "type", `Z:${U}`);
    add("Z", "ctor", "0Z:Z");
    add("Z", "ctor", "pos:nat→Z");
    add("Z", "ctor", "neg:nat→Z");
    add("Z", "ind", "@ind_Z:Πu:𝒰@.ΠC:(Z→𝒰u).C 0Z→(Πx:nat.C (pos x))→(Πx:nat.C (neg x))→Πm:Z.C m");
    add("Z", "def", "ind_Z := @ind_Z ?u");
    add("Z", "def", "nat2Z := ind_nat (λh:nat. Z) 0Z (λh:nat. λz:Z. pos h)");
    add("Z", "def", "absZ := ind_Z (λx:Z. Z) 0Z pos pos");
    add("Z", "def", "succZ := ind_Z (λh:Z. Z) (pos 0) (λh:nat. pos (succ h)) (ind_nat (λh:nat. Z) 0Z (λh:nat. λz:Z. neg h))");
    add("Z", "def", "predZ := ind_Z (λh:Z. Z) (neg 0) (ind_nat (λh:nat. Z) 0Z (λh:nat. λz:Z. pos h)) (λh:nat. neg (succ h))");
    add("Z", "def", "negZ := ind_Z (λh:Z. Z) 0Z neg pos");
    add("Z", "def", "addZ := λx:Z. ind_Z (λy:Z. Z) x (ind_nat (λy:nat. Z) (succZ x) (λy:nat. succZ)) (ind_nat (λy:nat. Z) (predZ x) (λy:nat. predZ))");
    add("Z", "def", "mulZ := λx:Z. ind_Z (λy:Z. Z) 0Z (ind_nat (λy:nat. Z) x (λy:nat. λh:Z. addZ h x)) (ind_nat (λy:nat. Z) (negZ x) (λy:nat. λh:Z. addZ h (negZ x)))");
    add("Z", "def", "pred_succZ := ind_Z (λx:Z. eq (predZ (succZ x)) x) rfl (λx:nat. rfl) (ind_nat (λx:nat. eq (predZ (succZ (neg x))) (neg x)) rfl (λx:nat. λy:(eq (predZ (succZ (neg x))) (neg x)). rfl))");
    add("Z", "def", "succ_predZ := ind_Z (λx:Z. eq (succZ (predZ x)) x) rfl (ind_nat (λx:nat. eq (succZ (predZ (pos x))) (pos x)) rfl (λx:nat. λy:(eq (succZ (predZ (pos x))) (pos x)). rfl)) (λx:nat. rfl)");
    add("Z", "rule", "@ind_Z ?u ?C ?c0 ?cp ?cn 0Z ≡ ?c0");
    add("Z", "rule", "@ind_Z ?u ?C ?c0 ?cp ?cn (pos ?n) ≡ ?cp ?n");
    add("Z", "rule", "@ind_Z ?u ?C ?c0 ?cp ?cn (neg ?n) ≡ ?cn ?n");
    add("Z", "rule", "ind_Z ?C ?c0 ?cp ?cn 0Z ≡ ?c0");
    add("Z", "rule", "ind_Z ?C ?c0 ?cp ?cn (pos ?n) ≡ ?cp ?n");
    add("Z", "rule", "ind_Z ?C ?c0 ?cp ?cn (neg ?n) ≡ ?cn ?n");
    // ===== Even =====
    add("Even", "type", "Even:nat→𝒰");
    add("Even", "ctor", "even0:Even 0");
    add("Even", "ctor", "evenss:Πx:nat.Even x→Even (succ (succ x))");
    add("Even", "ind", "@ind_Even:Πu:𝒰@.ΠC:(Πx:nat.Even x→𝒰u).C 0 even0→(Πx:nat.Πe:Even x.C x e→C (succ (succ x)) (evenss x e))→Πx:nat.Πe:Even x.C x e");
    add("Even", "def", "ind_Even := @ind_Even ?u");
    add("Even", "rule", "@ind_Even ?u ?C ?c0 ?css 0 even0 ≡ ?c0");
    add("Even", "rule", "@ind_Even ?u ?C ?c0 ?css (succ (succ ?x)) (evenss ?x ?e) ≡ ?css ?x ?e (@ind_Even ?u ?C ?c0 ?css ?x ?e)");
    add("Even", "rule", "ind_Even ?C ?c0 ?css 0 even0 ≡ ?c0");
    add("Even", "rule", "ind_Even ?C ?c0 ?css (succ (succ ?x)) (evenss ?x ?e) ≡ ?css ?x ?e (ind_Even ?C ?c0 ?css ?x ?e)");
    // ===== Aleph =====
    add("Aleph", "def", "Aleph := ind_nat (λx:nat. 𝒰) nat (λx:nat. λx:𝒰. x→Bool)");
    // ===== List =====
    add("List", "type", "@List:Πu:𝒰@.𝒰u→𝒰u");
    add("List", "def", "List := @List ?u");
    add("List", "ctor", "@nil:Πu:𝒰@.Πa:𝒰u.List a");
    add("List", "def", "nil := @nil ?u");
    add("List", "ctor", "@cons:Πu:𝒰@.Πa:𝒰u.Πx:a.Πxs:List a.List a");
    add("List", "def", "cons := @cons ?u");
    add("List", "ind", "@ind_List:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(List a→𝒰v).C (nil a)→(Πx:a.Πxs:List a.C xs→C (cons a x xs))→Πxs:List a.C xs");
    add("List", "def", "ind_List := @ind_List ?u ?v");
    add("List", "rule", "@ind_List ?u ?v ?a ?C ?cn ?cc (@nil ?u2 ?a) ≡ ?cn");
    add("List", "rule", "@ind_List ?u ?v ?a ?C ?cn ?cc (@cons ?u2 ?a ?x ?xs) ≡ ?cc ?x ?xs (@ind_List ?u ?v ?a ?C ?cn ?cc ?xs)");
    add("List", "rule", "ind_List ?a ?C ?cn ?cc (@nil ?u2 ?a) ≡ ?cn");
    add("List", "rule", "ind_List ?a ?C ?cn ?cc (@cons ?u2 ?a ?x ?xs) ≡ ?cc ?x ?xs (ind_List ?a ?C ?cn ?cc ?xs)");
    add("List", "rule", "ind_List ?a ?C ?cn ?cc (nil ?a) ≡ ?cn");
    add("List", "rule", "ind_List ?a ?C ?cn ?cc (cons ?a ?x ?xs) ≡ ?cc ?x ?xs (ind_List ?a ?C ?cn ?cc ?xs)");
    // ===== Option =====
    add("Option", "type", "@Option:Πu:𝒰@.𝒰u→𝒰u");
    add("Option", "def", "Option := @Option ?u");
    add("Option", "ctor", "@none:Πu:𝒰@.Πa:𝒰u.Option a");
    add("Option", "def", "none := @none ?u");
    add("Option", "ctor", "@some:Πu:𝒰@.Πa:𝒰u.Πx:a.Option a");
    add("Option", "def", "some := @some ?u");
    add("Option", "ind", "@ind_Option:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(Option a→𝒰v).C (none a)→(Πx:a.C (some a x))→Πm:Option a.C m");
    add("Option", "def", "ind_Option := @ind_Option ?u ?v");
    add("Option", "rule", "@ind_Option ?u ?v ?a ?C ?cn ?cs (@none ?u2 ?a) ≡ ?cn");
    add("Option", "rule", "@ind_Option ?u ?v ?a ?C ?cn ?cs (@some ?u2 ?a ?x) ≡ ?cs ?x");
    add("Option", "rule", "ind_Option ?a ?C ?cn ?cs (@none ?u2 ?a) ≡ ?cn");
    add("Option", "rule", "ind_Option ?a ?C ?cn ?cs (@some ?u2 ?a ?x) ≡ ?cs ?x");
    add("Option", "rule", "ind_Option ?a ?C ?cn ?cs (none ?a) ≡ ?cn");
    add("Option", "rule", "ind_Option ?a ?C ?cn ?cs (some ?a ?x) ≡ ?cs ?x");
    // ===== W（W 类型） =====
    add("W", "type", "𝖶x:a.C x : 𝒰");
    add("W", "ctor", "@sup:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(a→𝒰v).Πx:a.Πf:(C x→𝖶z:a.C z).𝖶z:a.C z");
    add("W", "def", "sup := @sup ?u ?v");
    add("W", "ind", "@ind_W:Πu:𝒰@.Πv:𝒰@.Πw:𝒰@.Πa:𝒰u.ΠC:(a→𝒰v).ΠD:(𝖶z:a.C z→𝒰w).(Πx:a.Πf:(C x→𝖶z:a.C z).(Πy:C x.D (f y))→D (sup a C x f))→Πm:(𝖶z:a.C z).D m");
    add("W", "def", "ind_W := @ind_W ?u ?v ?w");
    add("W", "def", "NW := 𝖶x:Bool. ind_Bool (λx:Bool. 𝒰) False True x");
    add("W", "rule", "@ind_W ?u ?v ?w ?a ?C ?D ?h (@sup ?u2 ?v2 ?a ?C ?x ?f) ≡ ?h ?x ?f (λy:C ?x. @ind_W ?u ?v ?w ?a ?C ?D ?h (f y))");
    add("W", "rule", "ind_W ?a ?C ?D ?h (@sup ?u2 ?v2 ?a ?C ?x ?f) ≡ ?h ?x ?f (λy:C ?x. ind_W ?a ?C ?D ?h (f y))");
    add("W", "rule", "ind_W ?a ?C ?D ?h (sup ?a ?C ?x ?f) ≡ ?h ?x ?f (λy:C ?x. ind_W ?a ?C ?D ?h (f y))");
    // ===== Ord（序数） =====
    add("Ord", "type", `Ord:${U}`);
    add("Ord", "ctor", "0O:Ord");
    add("Ord", "ctor", "succO:Ord→Ord");
    add("Ord", "ctor", "limO:(nat→Ord)→Ord");
    add("Ord", "ind", "@ind_Ord:Πu:𝒰@.ΠC:(Ord→𝒰u).C 0O→(Πo:Ord.C o→C (succO o))→(Πarr:(nat→Ord).(Πn:nat.C (arr n))→C (limO arr))→Πx:Ord.C x");
    add("Ord", "def", "ind_Ord := @ind_Ord ?u");
    add("Ord", "def", "natO := ind_nat (λx:nat. Ord) 0O (λx:nat. λh:Ord. succO h)");
    add("Ord", "def", "omega := limO natO");
    add("Ord", "def", "leqO := ind_Ord (λx:Ord. Ord→𝒰) (λx:Ord. True) (λo:Ord. λleqo:(Ord→𝒰). ind_Ord (λx:Ord. 𝒰) False (λm:Ord. λleqm:𝒰. leqo m) (λarr:(nat→Ord). λfnleq:(Πn:nat. 𝒰). Σx:nat. fnleq x)) (λarr:(nat→Ord). λg:(nat→Ord→𝒰). λo:Ord. Πx:nat. g x o)");
    add("Ord", "def", "addO := ind_Ord (λx:Ord. Ord→Ord) (λx:Ord. x) (λx:Ord. λf:(Ord→Ord). λy:Ord. succO (f y)) (λarr:(nat→Ord). λg:(nat→Ord→Ord). λy:Ord. limO (λn:nat. g n y))");
    add("Ord", "rule", "@ind_Ord ?u ?C ?c0 ?cs ?clim 0O ≡ ?c0");
    add("Ord", "rule", "@ind_Ord ?u ?C ?c0 ?cs ?clim (succO ?o) ≡ ?cs ?o (@ind_Ord ?u ?C ?c0 ?cs ?clim ?o)");
    add("Ord", "rule", "@ind_Ord ?u ?C ?c0 ?cs ?clim (limO ?f) ≡ ?clim ?f (λn:nat. @ind_Ord ?u ?C ?c0 ?cs ?clim (?f n))");
    add("Ord", "rule", "ind_Ord ?C ?c0 ?cs ?clim 0O ≡ ?c0");
    add("Ord", "rule", "ind_Ord ?C ?c0 ?cs ?clim (succO ?o) ≡ ?cs ?o (ind_Ord ?C ?c0 ?cs ?clim ?o)");
    add("Ord", "rule", "ind_Ord ?C ?c0 ?cs ?clim (limO ?f) ≡ ?clim ?f (λn:nat. ind_Ord ?C ?c0 ?cs ?clim (?f n))");
    // ===== LiftU =====
    add("LiftU", "type", "@LiftU:Πu:𝒰@.𝒰u→𝒰u");
    add("LiftU", "def", "LiftU := @LiftU ?u");
    add("LiftU", "ctor", "@liftU:Πu:𝒰@.Πa:𝒰u.a→LiftU a");
    add("LiftU", "def", "liftU := @liftU ?u");
    add("LiftU", "ind", "@lowerU:Πu:𝒰@.Πa:𝒰u.LiftU a→a");
    add("LiftU", "def", "lowerU := @lowerU ?u");
    add("LiftU", "rule", "@lowerU ?u ?a (@liftU ?u2 ?a ?x) ≡ ?x");
    add("LiftU", "rule", "@liftU ?u ?a (@lowerU ?u2 ?a ?x) ≡ ?x");
    add("LiftU", "rule", "lowerU ?a (@liftU ?u2 ?a ?x) ≡ ?x");
    add("LiftU", "rule", "liftU ?a (@lowerU ?u2 ?a ?x) ≡ ?x");
    add("LiftU", "rule", "lowerU ?a (liftU ?a ?x) ≡ ?x");
    add("LiftU", "rule", "liftU ?a (lowerU ?a ?x) ≡ ?x");
    // ===== fnext（函数外延性，公设） =====
    add("fnext", "def", "@fnext:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(a→𝒰v).Πf:(Πx:a.C x).Πg:(Πx:a.C x).(Πx:a.eq (f x) (g x))→eq f g");
    add("fnext", "def", "fnext := @fnext ?u ?v");
    add("fnext", "def", "@happly:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(a→𝒰v).Πf:(Πx:a.C x).Πg:(Πx:a.C x).eq f g→Πx:a.eq (f x) (g x)");
    add("fnext", "def", "happly := @happly ?u ?v");
    add("fnext", "def", "@fnext_happly:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(a→𝒰v).Πf:(Πx:a.C x).Πg:(Πx:a.C x).Πp:(eq f g).eq (fnext a C f g (happly a C f g p)) p");
    add("fnext", "def", "fnext_happly := @fnext_happly ?u ?v");
    add("fnext", "def", "@happly_fnext:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(a→𝒰v).Πf:(Πx:a.C x).Πg:(Πx:a.C x).Πp:(Πx:a.eq (f x) (g x)).eq (happly a C f g (fnext a C f g p)) p");
    add("fnext", "def", "happly_fnext := @happly_fnext ?u ?v");
    add("fnext", "rule", "@happly ?u ?v ?a ?C ?f ?g (@refl ?u2 ?a2 ?f) ?x ≡ refl (?f ?x)");
    add("fnext", "rule", "happly ?a ?C ?f ?g (@refl ?u2 ?a2 ?f) ?x ≡ refl (?f ?x)");
    add("fnext", "rule", "happly ?a ?C ?f ?g (refl ?f2) ?x ≡ refl (?f ?x)");
    // ===== eqv（等价） =====
    add("eqv", "def", "eqv := λa:𝒰. λb:𝒰. Σf:(a→b). ((Σg:(b→a). Πx:a. eq x (g (f x))) × (Σh:(b→a). Πx:b. eq x (f (h x))))");
    add("eqv", "def", "eqvrefl := λa:𝒰. pair (λf:(a→a). (Σg:(a→a). Πx:a. eq x (g (f x))) × (Σh:(a→a). Πx:a. eq x (f (h x)))) (λx:a. x) (pair (λp:(Σg:(a→a). Πx:a. eq x (g x)). (Σh:(a→a). Πx:a. eq x (h x))) (pair (λg:(a→a). Πx:a. eq x (g x)) (λx:a. x) (λx:a. rfl)) (pair (λh:(a→a). Πx:a. eq x (h x)) (λx:a. x) (λx:a. rfl)))");
    add("eqv", "def", "@id2eqv:Πu:𝒰@.Πa:𝒰u.Πb:𝒰u.eq a b→eqv a b");
    add("eqv", "def", "id2eqv := @id2eqv ?u");
    add("eqv", "rule", "@id2eqv ?u ?a ?b (@refl ?u2 ?a2 ?a) ≡ eqvrefl ?a");
    add("eqv", "rule", "id2eqv ?a ?b (@refl ?u2 ?a2 ?a) ≡ eqvrefl ?a");
    add("eqv", "rule", "id2eqv ?a ?b (refl ?a2) ≡ eqvrefl ?a");
    // ===== ua（非直谓性公设） =====
    add("ua", "def", "@ua:Πu:𝒰@.Πa:𝒰u.Πb:𝒰u.eqv a b→eq a b");
    add("ua", "def", "ua := @ua ?u");
    add("ua", "def", "@ua_id2eqv:Πu:𝒰@.Πa:𝒰u.Πb:𝒰u.Πm:(eq a b).eq (ua a b (id2eqv a b m)) m");
    add("ua", "def", "ua_id2eqv := @ua_id2eqv ?u");
    add("ua", "def", "@id2eqv_ua:Πu:𝒰@.Πa:𝒰u.Πb:𝒰u.Πm:(eqv a b).eq (id2eqv a b (ua a b m)) m");
    add("ua", "def", "id2eqv_ua := @id2eqv_ua ?u");
    // ===== naiveqv =====
    add("naiveqv", "def", "naiveqv := λa:𝒰. λb:𝒰. Σf:(a→b). Σg:(b→a). (Πx:a. eq x (g (f x))) × (Πx:b. eq x (f (g x)))");
    // ===== LEM（排中律公设） =====
    add("LEM", "def", "@LEM:Πu:𝒰@.Πa:𝒰u.Sum (Trunc a) (not (Trunc a))");
    add("LEM", "def", "LEM := @LEM ?u");
    // ===== S1（圆） =====
    add("S1", "type", `S1:${U}`);
    add("S1", "ctor", "base:S1");
    add("S1", "ctor", "loop:eq base base");
    add("S1", "ind", "@ind_S1:Πu:𝒰@.ΠC:(S1→𝒰u).Πcb:(C base).Πcl:(eq (trans S1 base base C loop cb) cb).Πm:S1.C m");
    add("S1", "def", "ind_S1 := @ind_S1 ?u");
    add("S1", "def", "rec_S1 := λa:𝒰. λcb:a. λcl:(eq cb cb). ind_S1 (λx:S1. a) cb (compeq a (trans S1 base base (λx:S1. a) loop cb) cb cb (transconst S1 a base base loop cb) cl)");
    add("S1", "def", "@ap_loop:Πu:𝒰@.Πa:𝒰u.Πcb:a.Πcl:(eq cb cb).eq (ap S1 a base base (rec_S1 a cb cl) loop) cl");
    add("S1", "def", "ap_loop := @ap_loop ?u");
    add("S1", "def", "@apd_loop:Πu:𝒰@.ΠC:(S1→𝒰u).Πcb:(C base).Πcl:(eq (trans S1 base base C loop cb) cb).eq (apd S1 base base C (ind_S1 C cb cl) loop) cl");
    add("S1", "def", "apd_loop := @apd_loop ?u");
    add("S1", "def", "loop_pow := ind_Z (λh:Z. eq base base) (refl base) (ind_nat (λh:nat. eq base base) loop (λh:nat. λq:(eq base base). compeq S1 base base base loop q)) (ind_nat (λh:nat. eq base base) (inveq S1 base base loop) (λh:nat. λq:(eq base base). compeq S1 base base base (inveq S1 base base loop) q))");
    add("S1", "def", "code_S1:S1→𝒰");
    add("S1", "rule", "@ind_S1 ?u ?C ?cb ?cl base ≡ ?cb");
    add("S1", "rule", "ind_S1 ?C ?cb ?cl base ≡ ?cb");
    add("S1", "rule", "code_S1 base ≡ Z");
    // ===== S2（球面） =====
    add("S2", "type", `S2:${U}`);
    add("S2", "ctor", "base2:S2");
    add("S2", "ctor", "surf:eq (refl base2) (refl base2)");
    add("S2", "ind", "@ind_S2:Πu:𝒰@.ΠC:(S2→𝒰u).Πcb:(C base2).Πcs:(eq (refl cb) (compeq (C base2) cb cb cb (trans2 S2 base2 base2 (refl base2) (refl base2) C surf cb) (refl cb))).Πm:S2.C m");
    add("S2", "def", "ind_S2 := @ind_S2 ?u");
    add("S2", "def", "@trans2:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.Πx:a.Πy:a.Πm:(eq x y).Πn:(eq x y).ΠC:(a→𝒰v).(eq (eq x y) m n)→Πu2:(C x).eq (trans a x y C m u2) (trans a x y C n u2)");
    add("S2", "def", "trans2 := @trans2 ?u ?v");
    add("S2", "def", "@apd2:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.Πx:a.Πy:a.Πm:(eq x y).Πn:(eq x y).ΠC:(a→𝒰v).Πf:(Πx:a.C x).Πr:(eq (eq x y) m n).eq (apd a x y C f m) (compeq (C y) (trans a x y C m (f x)) (trans a x y C n (f x)) (f y) (trans2 a x y m n C r (f x)) (apd a x y C f n))");
    add("S2", "def", "apd2 := @apd2 ?u ?v");
    add("S2", "rule", "@ind_S2 ?u ?C ?cb ?cs base2 ≡ ?cb");
    add("S2", "rule", "ind_S2 ?C ?cb ?cs base2 ≡ ?cb");
    add("S2", "rule", "@trans2 ?u ?v ?a ?x ?y ?m ?n ?C (@refl ?u2 ?a2 ?x2) ?u3 ≡ refl (trans ?a ?x ?y ?C ?m ?u3)");
    add("S2", "rule", "trans2 ?a ?x ?y ?m ?n ?C (@refl ?u2 ?a2 ?x2) ?u3 ≡ refl (trans ?a ?x ?y ?C ?m ?u3)");
    add("S2", "rule", "trans2 ?a ?x ?y ?m ?n ?C (refl ?x2) ?u3 ≡ refl (trans ?a ?x ?y ?C ?m ?u3)");
    add("S2", "rule", "@apd2 ?u ?v ?a ?x ?y ?m ?n ?C ?f (@refl ?u2 ?a2 ?x2) ≡ refl (apd ?a ?x ?y ?C ?f ?m)");
    add("S2", "rule", "apd2 ?a ?x ?y ?m ?n ?C ?f (@refl ?u2 ?a2 ?x2) ≡ refl (apd ?a ?x ?y ?C ?f ?m)");
    add("S2", "rule", "apd2 ?a ?x ?y ?m ?n ?C ?f (refl ?x2) ≡ refl (apd ?a ?x ?y ?C ?f ?m)");
    // ===== I（区间） =====
    add("I", "type", `I:${U}`);
    add("I", "ctor", "0I:I");
    add("I", "ctor", "1I:I");
    add("I", "ctor", "segI:eq 0I 1I");
    add("I", "ind", "@ind_I:Πu:𝒰@.ΠC:(I→𝒰u).Πc0:(C 0I).Πc1:(C 1I).Πcs:(eq (trans I 0I 1I C segI c0) c1).Πm:I.C m");
    add("I", "def", "ind_I := @ind_I ?u");
    add("I", "def", "@apd_segI:Πu:𝒰@.ΠC:(I→𝒰u).Πc0:(C 0I).Πc1:(C 1I).Πcs:(eq (trans I 0I 1I C segI c0) c1).eq (apd I 0I 1I C (ind_I C c0 c1 cs) segI) cs");
    add("I", "def", "apd_segI := @apd_segI ?u");
    add("I", "rule", "@ind_I ?u ?C ?c0 ?c1 ?cs 0I ≡ ?c0");
    add("I", "rule", "@ind_I ?u ?C ?c0 ?c1 ?cs 1I ≡ ?c1");
    add("I", "rule", "ind_I ?C ?c0 ?c1 ?cs 0I ≡ ?c0");
    add("I", "rule", "ind_I ?C ?c0 ?c1 ?cs 1I ≡ ?c1");
    // ===== Sus（悬垂） =====
    add("Sus", "type", "@Sus:Πu:𝒰@.𝒰u→𝒰u");
    add("Sus", "def", "Sus := @Sus ?u");
    add("Sus", "ctor", "@North:Πu:𝒰@.Πa:𝒰u.Sus a");
    add("Sus", "def", "North := @North ?u");
    add("Sus", "ctor", "@South:Πu:𝒰@.Πa:𝒰u.Sus a");
    add("Sus", "def", "South := @South ?u");
    add("Sus", "ctor", "@merid:Πu:𝒰@.Πa:𝒰u.Πx:a.eq (North a) (South a)");
    add("Sus", "def", "merid := @merid ?u");
    add("Sus", "ind", "@ind_Sus:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(Sus a→𝒰v).Πcn:(C (North a)).Πcs:(C (South a)).Πcm:(Πx:a.eq (trans (Sus a) (North a) (South a) C (merid a x) cn) cs).Πm:(Sus a).C m");
    add("Sus", "def", "ind_Sus := @ind_Sus ?u ?v");
    add("Sus", "def", "@apd_merid:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(Sus a→𝒰v).Πcn:(C (North a)).Πcs:(C (South a)).Πcm:(Πx:a.eq (trans (Sus a) (North a) (South a) C (merid a x) cn) cs).Πx:a.eq (apd (Sus a) (North a) (South a) C (ind_Sus a C cn cs cm) (merid a x)) (cm x)");
    add("Sus", "def", "apd_merid := @apd_merid ?u ?v");
    add("Sus", "rule", "@ind_Sus ?u ?v ?a ?C ?cn ?cs ?cm (@North ?u2 ?a) ≡ ?cn");
    add("Sus", "rule", "@ind_Sus ?u ?v ?a ?C ?cn ?cs ?cm (@South ?u2 ?a) ≡ ?cs");
    add("Sus", "rule", "ind_Sus ?a ?C ?cn ?cs ?cm (@North ?u2 ?a) ≡ ?cn");
    add("Sus", "rule", "ind_Sus ?a ?C ?cn ?cs ?cm (@South ?u2 ?a) ≡ ?cs");
    add("Sus", "rule", "ind_Sus ?a ?C ?cn ?cs ?cm (North ?a) ≡ ?cn");
    add("Sus", "rule", "ind_Sus ?a ?C ?cn ?cs ?cm (South ?a) ≡ ?cs");
    // ===== Pushout（推出） =====
    add("Pushout", "type", "@Pushout:Πu:𝒰@.Πa:𝒰u.Πb:𝒰u.Πc:𝒰u.Πf:(c→a).Πg:(c→b).𝒰u");
    add("Pushout", "def", "Pushout := @Pushout ?u");
    add("Pushout", "ctor", "@pol:Πu:𝒰@.Πa:𝒰u.Πb:𝒰u.Πc:𝒰u.Πf:(c→a).Πg:(c→b).Πx:a.Pushout a b c f g");
    add("Pushout", "def", "pol := @pol ?u");
    add("Pushout", "ctor", "@por:Πu:𝒰@.Πa:𝒰u.Πb:𝒰u.Πc:𝒰u.Πf:(c→a).Πg:(c→b).Πx:b.Pushout a b c f g");
    add("Pushout", "def", "por := @por ?u");
    add("Pushout", "ctor", "@glue:Πu:𝒰@.Πa:𝒰u.Πb:𝒰u.Πc:𝒰u.Πf:(c→a).Πg:(c→b).Πx:c.eq (pol a b c f g (f x)) (por a b c f g (g x))");
    add("Pushout", "def", "glue := @glue ?u");
    add("Pushout", "ind", "@ind_Pushout:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.Πb:𝒰u.Πc:𝒰u.Πf:(c→a).Πg:(c→b).ΠD:(Pushout a b c f g→𝒰v).(Πxl:a.D (pol a b c f g xl))→(Πxr:b.D (por a b c f g xr))→(Πxg:c.eq (trans (Pushout a b c f g) (pol a b c f g (f xg)) (por a b c f g (g xg)) D (glue a b c f g xg) (cl (f xg))) (cr (g xg)))→Πm:(Pushout a b c f g).D m");
    add("Pushout", "def", "ind_Pushout := @ind_Pushout ?u ?v");
    add("Pushout", "def", "@apd_glue:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.Πb:𝒰u.Πc:𝒰u.Πf:(c→a).Πg:(c→b).ΠD:(Pushout a b c f g→𝒰v).Πcl:(Πxl:a.D (pol a b c f g xl)).Πcr:(Πxr:b.D (por a b c f g xr)).Πcg:(Πxg:c.eq (trans (Pushout a b c f g) (pol a b c f g (f xg)) (por a b c f g (g xg)) D (glue a b c f g xg) (cl (f xg))) (cr (g xg))).Πxg:c.eq (apd (Pushout a b c f g) (pol a b c f g (f xg)) (por a b c f g (g xg)) D (ind_Pushout a b c f g D cl cr cg) (glue a b c f g xg)) (cg xg)");
    add("Pushout", "def", "apd_glue := @apd_glue ?u ?v");
    add("Pushout", "def", "Join := λa:𝒰. λb:𝒰. Pushout a b (Σ_:a. b) (pr0 a (λx:a. b)) (pr1 a b)");
    add("Pushout", "def", "Wedge := λa:𝒰. λb:𝒰. λxa:a. λxb:b. Pushout a b True (λx:True. xa) (λx:True. xb)");
    add("Pushout", "rule", "@ind_Pushout ?u ?v ?a ?b ?c ?f ?g ?D ?cl ?cr ?cg (@pol ?u2 ?a ?b ?c ?f ?g ?x) ≡ ?cl ?x");
    add("Pushout", "rule", "@ind_Pushout ?u ?v ?a ?b ?c ?f ?g ?D ?cl ?cr ?cg (@por ?u2 ?a ?b ?c ?f ?g ?x) ≡ ?cr ?x");
    add("Pushout", "rule", "ind_Pushout ?a ?b ?c ?f ?g ?D ?cl ?cr ?cg (@pol ?u2 ?a ?b ?c ?f ?g ?x) ≡ ?cl ?x");
    add("Pushout", "rule", "ind_Pushout ?a ?b ?c ?f ?g ?D ?cl ?cr ?cg (@por ?u2 ?a ?b ?c ?f ?g ?x) ≡ ?cr ?x");
    add("Pushout", "rule", "ind_Pushout ?a ?b ?c ?f ?g ?D ?cl ?cr ?cg (pol ?a ?b ?c ?f ?g ?x) ≡ ?cl ?x");
    add("Pushout", "rule", "ind_Pushout ?a ?b ?c ?f ?g ?D ?cl ?cr ?cg (por ?a ?b ?c ?f ?g ?x) ≡ ?cr ?x");
    // ===== S3 =====
    add("S3", "def", "S3 := Sus S2");
    // ===== Prop / Contr / Set（h-层级） =====
    add("Prop", "def", "isProp := λa:𝒰. Πx:a. Πy:a. eq x y");
    add("Contr", "def", "isContr := λa:𝒰. Σx:a. Πy:a. eq x y");
    add("Set", "def", "isSet := λa:𝒰. Πx:a. Πy:a. isProp (eq x y)");
    // ===== Trunc（截断） =====
    add("Trunc", "type", "@Trunc:Πu:𝒰@.𝒰u→𝒰u");
    add("Trunc", "def", "Trunc := @Trunc ?u");
    add("Trunc", "ctor", "@ctorTrunc:Πu:𝒰@.Πa:𝒰u.a→Trunc a");
    add("Trunc", "def", "ctorTrunc := @ctorTrunc ?u");
    add("Trunc", "ctor", "@trunc:Πu:𝒰@.Πa:𝒰u.Πx:(Trunc a).Πy:(Trunc a).eq x y");
    add("Trunc", "def", "trunc := @trunc ?u");
    add("Trunc", "ind", "@ind_Trunc:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(Trunc a→𝒰v).(Πx:a.C (ctorTrunc a x))→(Πx:(Trunc a).Πy:(Trunc a).Πcx:(C x).Πcy:(C y).eq (trans (Trunc a) x y C (trunc a x y) cx) cy)→Πm:(Trunc a).C m");
    add("Trunc", "def", "ind_Trunc := @ind_Trunc ?u ?v");
    add("Trunc", "def", "@apd_trunc:Πu:𝒰@.Πv:𝒰@.Πa:𝒰u.ΠC:(Trunc a→𝒰v).Πc:(Πx:a.C (ctorTrunc a x)).Πctr:(Πx:(Trunc a).Πy:(Trunc a).Πcx:(C x).Πcy:(C y).eq (trans (Trunc a) x y C (trunc a x y) cx) cy).Πx:(Trunc a).Πy:(Trunc a).eq (apd (Trunc a) x y C (ind_Trunc a C c ctr) (trunc a x y)) (ctr x y (ind_Trunc a C c ctr x) (ind_Trunc a C c ctr y))");
    add("Trunc", "def", "apd_trunc := @apd_trunc ?u ?v");
    add("Trunc", "rule", "@ind_Trunc ?u ?v ?a ?C ?c ?ctr (@ctorTrunc ?u2 ?a ?x) ≡ ?c ?x");
    add("Trunc", "rule", "ind_Trunc ?a ?C ?c ?ctr (@ctorTrunc ?u2 ?a ?x) ≡ ?c ?x");
    add("Trunc", "rule", "ind_Trunc ?a ?C ?c ?ctr (ctorTrunc ?a ?x) ≡ ?c ?x");
    return r;
}
export function initTypeSystem(creative) {
    return creative ? initCreativeRules() : initMinimalRules();
}
//# sourceMappingURL=initial.js.map