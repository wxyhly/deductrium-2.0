import { knowledgeBase } from "./kb.js";
// Skill notes follow the same stable reward IDs as the reasoning layer. Merely
// seeing a locked gate does not grant its knowledge or its underlying skill.
const rewardKnowledge = {
    dL: ["→", "⊢", "d", "b", "clear", "name", "del"],
    macro: ["m"], hyp: ["hyp"], neg: ["¬"], iff: ["↔"], andor: ["∧", "∨"],
    dG: ["dG"], mct: ["cond", "c:", "cd", "pop"], mdt: [">", "cond", "c:", "cd", "pop"],
    mcpt: ["mcpt", "cond", "c:", "<", "cd", "pop"], midt: ["<"],
    "1st": ["∀", "∃", "var", "v:", "cd", "pop"], mcvt: ["v:"],
    mvt: ["u:", "v:", "#nf"], met: ["e:", "u:", "v:"],
    mifft: ["msbt", "#sb"], mnt: ["mcnt", "#sb"], mcmt: ["combine"],
    mkdir: ["dir", "cd", "pop"], nf: ["#nf"], rp: ["#sb"],
    aExt: ["∈", "="], "d<": ["⊂"], dU: ["∪"], dI: ["∩"],
    "d-": ["＼"], dX: ["×"], peano: ["ℕ"], dSd0: ["ℕ"],
    dN: ["ℕ"], dZ: ["ℤ"], dQ: ["ℚ"], dR: ["ℝ"], dw: ["ω"],
    "d<=": ["≤", "≥"], ddiv: ["∣"],
};
export function knowledgeId(value) {
    if (typeof value !== "string")
        return;
    if (value.startsWith("sym:")) {
        if (Object.hasOwn(knowledgeBase.syms, value.slice(4)))
            return value;
    }
    else if (value.startsWith("mec:")) {
        if (Object.hasOwn(knowledgeBase.mecanism, value.slice(4)))
            return value;
    }
    else {
        if (Object.hasOwn(knowledgeBase.syms, value))
            return "sym:" + value;
        if (Object.hasOwn(knowledgeBase.mecanism, value))
            return "mec:" + value;
    }
}
export function rewardKnowledgeIds(reward) {
    const notes = Object.hasOwn(rewardKnowledge, reward) ? rewardKnowledge[reward] : [];
    return [...new Set([reward, ...notes]
            .map(knowledgeId).filter((id) => id !== undefined))];
}
// Called only after collecting/passing/stepping onto a tile. Read both language
// variants so changing language never changes the player's discovery progress.
export function tileKnowledgeIds(tile) {
    const ids = new Set(tile.name ? rewardKnowledgeIds(tile.name) : []);
    const explicit = tile.data?.info;
    for (const value of Array.isArray(explicit) ? explicit : [explicit]) {
        const id = knowledgeId(value);
        if (id)
            ids.add(id);
    }
    const texts = typeof tile.text === "string" ? [tile.text] : Object.values(tile.text);
    for (const symbol of Object.keys(knowledgeBase.syms)) {
        if (texts.some(text => text.includes(symbol)))
            ids.add("sym:" + symbol);
    }
    for (const marker of ["#p", "#d", "#t", "#nf", "#sb"]) {
        if (texts.some(text => text.includes(marker)))
            ids.add("mec:" + marker);
    }
    if (tile.data?.p)
        ids.add("mec:#p");
    if (tile.data?.d)
        ids.add("mec:#d");
    if (tile.data?.t || tile.data?.td)
        ids.add("mec:#t");
    return [...ids];
}
//# sourceMappingURL=unlocks.js.map