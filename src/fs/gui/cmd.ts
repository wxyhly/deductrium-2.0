import { makeResizable } from "../../listmgr.js"

export function loadFSGui() {
    makeResizable(document.getElementById("cmdFooter")!, document.getElementById("cmdResizeHandle")!,true);
}