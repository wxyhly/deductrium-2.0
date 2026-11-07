import type { TileBlock } from "./maploader.js";
import { LangMgr } from "../lang.js";
import { stringifyDeductriumAmout } from "../format.js";
import { getMapPalette } from "./palette.js";

export function tileColor(block: TileBlock | undefined, highlight: boolean, hasHighlightReward: boolean): string {
    const palette = getMapPalette();
    if (highlight && block?.data?.getD && !block.data.got && hasHighlightReward) return palette.highlight;
    return palette.tiles[block?.type ?? 1];
}

export function tileTextColor(block: TileBlock): string {
    return getMapPalette().text[block.type];
}

export function tileDisplayText(block: TileBlock): string {
    const data = block.data ?? {};
    let text = typeof block.text === "string" ? block.text : block.text[LangMgr.lang] ?? Object.values(block.text)[0] ?? "";
    if (data.pi || data.di || data.p || data.d) {
        // 门文本已由地图脚本转为 unicode，直接显示。
        text += data.pi ? '\n#pi' : data.di ? '\n#di' : data.p ? '\n#p' : '\n#d';
    }
    if (data.del) text += "\n" + LangMgr.text.delGate;
    if (data.script && data.got && data.exchange === undefined && !data.never && !data.dstr && !data.getD
        && !data.unl && !(data.payD && !data.requiresReward)) text = LangMgr.claimedRewardText(text);
    if (data.never) text = data.got ? LangMgr.text.neverReward : LangMgr.text.neverLocked;
    if (data.dstr) text = LangMgr.text.dstrPrefix + data.dstr;
    if (data.getD) text = LangMgr.formalize.getD(stringifyDeductriumAmout(data.getD), data.got);
    if (data.payD && !data.requiresReward) text = LangMgr.formalize.payD(stringifyDeductriumAmout(data.payD));
    if (data.unl) text = (data.got ? LangMgr.text.unlockedPrefix : LangMgr.text.unlockPrefix) + text;
    return text;
}
