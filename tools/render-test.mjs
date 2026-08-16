// 复刻 game.ts 的渲染逻辑测试（formalize.getD/payD + prettyPD/prettyT + renderTileText + onGetReward）
const lang = "zh";
const LangMgr = {
    lang,
    text: {
        delGate: "(此门已拆除)", dstrPrefix: "拆除门",
        neverLocked: "你永远别想拿到这个奖励！",
        neverReward: "你拿到了本该\n永远拿不到的奖励\n如果你没有作弊\n则是游戏bug，请联系作者",
        unlockPrefix: "解锁", unlockedPrefix: "已解锁",
    },
    formalize: {
        getD: n => lang === "zh" ? `获取${n}推理素` : `Obtain ${n} of deductrium`,
        payD: n => lang === "zh" ? `通过此门需消耗推理素${n}` : `To pass this gate you need ${n} of deductrium`,
    },
};
const stringifyDeductriumAmout = n => {
    const absn = Math.abs(n);
    if (absn >= 1e12) return n / 1e12 + "T";
    if (absn >= 1e9) return n / 1e9 + "kg";
    if (absn >= 1e6) return n / 1e6 + "g";
    if (absn >= 1e3) return n / 1e3 + "mg";
    return n + "µg";
};
function prettyPD(text) {
    return text.replaceAll("V", "∀").replaceAll("/|", "∣").replaceAll(">=", "≥").replaceAll("<=", "≤").replaceAll("<>", "↔").replaceAll(/E([^q])/g, "∃$1").replaceAll("@", "∈").replaceAll("~", "¬")
        .replaceAll(">", " → ").replaceAll("<", "⊂").replaceAll("U", "∪").replaceAll("I", "∩")
        .replaceAll("&", "∧").replaceAll("|", "∨").replaceAll("∨∨", "|").replaceAll("omega", "ω").replaceAll("X", "×").replaceAll("*", "×")
        .replaceAll("N", "ℕ").replaceAll("Z", "ℤ").replaceAll("Q", "ℚ").replaceAll("R", "ℝ").replaceAll("ℝel", "Rel");
}
function prettyT(text) {
    return text.replaceAll("~=", "≃").replaceAll("->", " → ").replaceAll("*", "▪").replaceAll("L", "λ").replaceAll("S", "Σ").replaceAll("P", "Π")
        .replaceAll("X", "×").replaceAll("λiftU", "LiftU").replaceAll("λist", "List").replaceAll("Σet", "Set").replaceAll("Σ1", "S1").replaceAll("Σ2", "S2").replaceAll("Σ3", "S3").replaceAll("Πrop", "Prop").replaceAll("Πushout", "Pushout").replaceAll("Σus", "Sus").replaceAll("Σum", "Sum");
}
function renderTileText(block) {
    const data = block.data ?? {};
    let text = typeof block.text === "string" ? block.text : (block.text[LangMgr.lang] ?? Object.values(block.text)[0] ?? "");
    if (data.p || data.d) text = prettyPD(text) + (data.p ? "\n#p" : "\n#d");
    else if (data.t || data.td) text = prettyT(text) + "\n#t";
    if (data.del) text += "\n" + LangMgr.text.delGate;
    if (data.never) text = data.got ? LangMgr.text.neverReward : LangMgr.text.neverLocked;
    if (data.dstr !== undefined) text = LangMgr.text.dstrPrefix + data.dstr;
    if (data.getD !== undefined) text = LangMgr.formalize.getD(stringifyDeductriumAmout(data.getD));
    if (data.payD !== undefined) text = LangMgr.formalize.payD(stringifyDeductriumAmout(data.payD));
    if (data.unl !== undefined) text = (data.got ? LangMgr.text.unlockedPrefix : LangMgr.text.unlockPrefix) + text;
    return text;
}

const cases = [
    ["gate p 门", { text: "a>a", data: { p: true } }],
    ["gate d 门", { text: "⊢$0>(($0>$1)>$0)", data: { d: true } }],
    ["gate d 带量词", { text: "Vx:x=x", data: { p: true } }],
    ["gate d 带存在", { text: "(E$0:($1|#nf($2,$0)))", data: { p: true } }],
    ["gate t", { text: "True", data: { t: true } }],
    ["gate t 依赖", { text: "Pa:U,(not(not a))->a", data: { t: true } }],
    ["del 门", { text: "a>a", data: { p: true, del: true } }],
    ["unl", { text: { zh: "进度层", en: "progress layer" }, data: { unl: true } }],
    ["unl+got", { text: { zh: "进度层", en: "progress layer" }, data: { unl: true, got: true } }],
    ["never", { text: "", data: { never: true } }],
    ["never+got", { text: "", data: { never: true, got: true } }],
    ["dstr", { text: "", data: { dstr: "#ω" } }],
    ["dstr 带提示", { text: "", data: { dstr: "#<>(↔)\n提示：该门后才解锁相应符号" } }],
    ["getD 1µg", { text: "", data: { getD: 1 } }],
    ["getD 50kg", { text: "", data: { getD: 5e10 } }],
    ["payD 1kg", { text: "", data: { payD: 1e9 } }],
    ["payD 1mg", { text: "", data: { payD: 1e3 } }],
    ["普通双语", { text: { zh: "欢迎来到游戏", en: "Welcome" }, data: {} }],
];
for (const [name, b] of cases) console.log(name.padEnd(14), "=>", JSON.stringify(renderTileText(b)));

console.log("\n=== onGetReward 回调测试 ===");
const TileBlockType = { Road: 0, Wall: 1, Gate: 2, Reward: 3, Ordinal: 4 };
const onGetReward = (hash, block) => {
    block.data = block.data ?? {};
    block.data.got = true;
    if (block.type === TileBlockType.Reward) block.type = TileBlockType.Road;
};
const rewardTile = { type: TileBlockType.Reward, text: "", data: {} };
onGetReward("h", rewardTile);
console.log("reward 砖块:", JSON.stringify({ type: rewardTile.type, got: rewardTile.data.got }));
const gateTile = { type: TileBlockType.Gate, text: "x", data: undefined };
onGetReward("h", gateTile);
console.log("gate 砖块(非reward):", JSON.stringify({ type: gateTile.type, data: gateTile.data }));
