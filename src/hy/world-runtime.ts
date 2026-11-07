import { parseWorld, WorldManifest, worldSaveMode } from './world.js';

export const WORLD_MANIFEST_KEY = 'deductrium2_world_manifest';
const requested = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mod-world');
export function worldLoadFailure(error: unknown, saveKey?: string): void {
    const show = () => {
        document.getElementById('loading')?.classList.add('hide');
        const panel = document.createElement('section'); panel.id = 'world-load-error'; panel.setAttribute('role', 'alert');
        panel.style.cssText = 'position:fixed;z-index:10000;inset:10%;overflow:auto;padding:2rem;background:Canvas;color:CanvasText;border:2px solid #b75';
        const title = document.createElement('h2'); title.textContent = '世界未载入 / World not loaded';
        const text = document.createElement('p'); text.textContent = error instanceof Error ? error.message : String(error);
        const note = document.createElement('p'); note.textContent = '原存档保留。请修正世界文件或迁移计划后重试。 / Your save is preserved. Correct the world or migration before retrying.';
        const home = document.createElement('a'); home.href = window.location.pathname; home.textContent = '返回主世界 / Main world';
        panel.append(title, text, note, home);
        if (saveKey) {
            const exportButton = document.createElement('button'); exportButton.textContent = '导出原存档 / Export original save';
            exportButton.onclick = () => {
                const raw = localStorage.getItem(saveKey); if (!raw) return;
                const url = URL.createObjectURL(new Blob([raw], {type:'application/octet-stream'}));
                const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'world-recovery.dt'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            }; panel.append(document.createElement('br'), exportButton);
        }
        document.body.append(panel);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, {once:true}); else show();
}
function requestedWorld(): WorldManifest | undefined {
    if (!requested) return;
    try { return parseWorld(JSON.parse(localStorage.getItem(WORLD_MANIFEST_KEY) ?? 'null')); }
    catch (error) { worldLoadFailure(error); throw error; }
}
export const activeWorld = requestedWorld();
export const activeWorldSaveMode = activeWorld ? worldSaveMode(activeWorld) : undefined;
