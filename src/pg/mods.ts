import { LangMgr } from "../lang.js";
import type { SaveLoad } from "../saveload.js";
import { importMod, MOD_LIBRARY_KEY, readModLibrary, saveModLibrary, setModEnabled } from "../hy/mods.js";
import type { ModEntry } from "../hy/mods.js";
import { getModRuntimeError, validateModLibrary } from "../hy/mod-runtime.js";
import { prepareModSave } from "../hy/mod-saves.js";
import { activeWorld, WORLD_MANIFEST_KEY } from "../hy/world-runtime.js";
import { builtinMods } from "../hy/builtin-mods.js";

/** Settings for installed files. Runtime changes take effect after a saved reload. */
export class ModManager {
    private readonly list = document.getElementById("pg-mod-list")!;
    private readonly upload = document.getElementById("pg-mod-upload") as HTMLButtonElement;
    private readonly file = document.getElementById("pg-mod-file") as HTMLInputElement;
    private readonly status = document.getElementById("pg-mod-status")!;
    private busy = false;
    private refreshPending = false;
    private leaving = false;
    private readonly saveload: SaveLoad;

    constructor(saveload: SaveLoad) {
        this.saveload = saveload;
        if (!this.list || !this.upload || !this.file || !this.status) return;
        this.upload.addEventListener("click", () => {
            if (!this.busy) this.file.click();
        });
        this.file.addEventListener("change", () => {
            const file = this.file.files?.[0];
            this.file.value = "";
            if (file) void this.run(async () => {
                if (file.size > 8 * 1024 * 1024) throw new Error(LangMgr.text.modsFileTooLarge);
                const input: unknown = JSON.parse(await file.text());
                const entries = importMod(readModLibrary(), input);
                saveModLibrary(entries);
                this.render(entries);
                this.say(LangMgr.text.modsImported);
            });
        });
        window.addEventListener("storage", event => {
            if (event.storageArea !== localStorage) return;
            if (event.key !== null && event.key !== MOD_LIBRARY_KEY) return;
            if (this.busy) this.refreshPending = true;
            else this.refresh(true);
        });
        this.refresh();
        const error = getModRuntimeError();
        if (error) this.say(`${LangMgr.text.modsRuntimeError} ${error}`, true);
    }

    private say(message: string, error = false) {
        this.status.textContent = message;
        this.status.dataset.error = String(error);
    }

    private refresh(external = false) {
        try {
            this.render(readModLibrary());
            if (external) this.say(LangMgr.text.modsExternalChange);
        } catch (error) {
            this.report(error);
        }
    }

    private report(error: unknown) {
        this.say(`${LangMgr.text.modsFailed} ${error instanceof Error ? error.message : String(error)}`, true);
    }

    private async run(operation: () => void | Promise<void>) {
        if (this.busy) return;
        this.busy = true;
        this.setBusy(true);
        try {
            await operation();
        } catch (error) {
            this.report(error);
        } finally {
            this.busy = this.leaving;
            this.setBusy(this.leaving);
            if (this.refreshPending) {
                this.refreshPending = false;
                this.refresh(true);
            }
        }
    }

    private setBusy(busy: boolean) {
        this.upload.disabled = busy;
        this.list.setAttribute("aria-busy", String(busy));
        this.list.querySelectorAll<HTMLButtonElement>("button").forEach(button => {
            button.disabled = busy || button.dataset.unavailable === "true";
        });
    }

    private button(label: string, action: () => void | Promise<void>, unavailable = false) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn-sm";
        button.textContent = label;
        button.dataset.unavailable = String(unavailable);
        button.disabled = this.busy || unavailable;
        button.addEventListener("click", () => void this.run(action));
        return button;
    }

    private current(id: string): { entries: ModEntry[]; entry: ModEntry } {
        const entries = readModLibrary();
        const entry = entries.find(item => item.world.id === id);
        if (!entry) throw new Error(LangMgr.text.modsMissing);
        return { entries, entry };
    }

    private render(entries: readonly ModEntry[]) {
        const content = document.createDocumentFragment();
        if (activeWorld) {
            const current = document.createElement("p");
            current.className = "pg-mod-current";
            current.textContent = `${LangMgr.text.modsCurrent} ${activeWorld.title || activeWorld.id}`;
            content.append(current, this.button(LangMgr.text.modsReturn, () => {
                this.saveload.save();
                this.saveload.cancelPendingSave();
                location.assign(location.pathname);
                this.leaving = true;
            }));
            const hint = document.createElement("p");
            hint.className = "pg-mod-note";
            hint.textContent = LangMgr.text.modsIsolated;
            content.append(hint);
        }
        if (activeWorld?.mode !== "standalone") {
            for (const builtin of builtinMods) {
                const row = document.createElement("article");
                row.className = "pg-mod-entry";
                row.dataset.modId = builtin.id;
                const name = document.createElement("h3");
                name.textContent = builtin.title || builtin.id;
                const meta = document.createElement("p");
                meta.className = "pg-mod-meta";
                meta.textContent = `${builtin.id} · ${LangMgr.text.modsRevision} ${builtin.revision}`;
                const state = document.createElement("p");
                state.className = "pg-mod-state";
                state.textContent = LangMgr.text.modsEnabled;
                row.append(name, meta, state);
                content.append(row);
            }
        }
        if (!entries.length) {
            const empty = document.createElement("p");
            empty.className = "pg-mod-note";
            empty.textContent = LangMgr.text.modsEmpty;
            content.append(empty);
        }
        for (const { world, enabled } of entries) {
            const row = document.createElement("article");
            row.className = "pg-mod-entry";
            row.dataset.modId = world.id;
            const name = document.createElement("h3");
            name.textContent = world.title || world.id;
            const meta = document.createElement("p");
            meta.className = "pg-mod-meta";
            meta.textContent = `${world.id} · ${LangMgr.text.modsRevision} ${world.revision} · ${world.mode === "extension" ? LangMgr.text.modsExtension : LangMgr.text.modsStandalone}`;
            const state = document.createElement("p");
            state.className = "pg-mod-state";
            state.textContent = world.mode === "extension"
                ? (enabled ? LangMgr.text.modsEnabled : LangMgr.text.modsDisabled)
                : LangMgr.text.modsSeparateSave;
            const actions = document.createElement("div");
            actions.className = "pg-actions pg-mod-actions";
            if (world.mode === "extension") {
                const toggle = this.button(enabled ? LangMgr.text.modsDisable : LangMgr.text.modsEnable, () => {
                    if (activeWorld) throw new Error(LangMgr.text.modsReturnFirst);
                    const latest = this.current(world.id);
                    // A stale button must never invert a change made in another tab.
                    const next = setModEnabled(latest.entries, world.id, !enabled);
                    validateModLibrary(next);
                    // Use the same JSON boundary as save(): live drafts can contain
                    // optional fields such as a TT row's children: undefined.
                    prepareModSave(JSON.parse(JSON.stringify(this.saveload.serialize())), next);
                    this.saveload.save();
                    saveModLibrary(next);
                    this.saveload.cancelPendingSave();
                    location.reload();
                    this.leaving = true;
                }, !!activeWorld);
                if (activeWorld) toggle.title = LangMgr.text.modsReturnFirst;
                actions.append(toggle);
            } else {
                actions.append(this.button(LangMgr.text.modsEnter, () => {
                    const latest = this.current(world.id).entry;
                    this.saveload.save();
                    localStorage.setItem(WORLD_MANIFEST_KEY, JSON.stringify(latest.world));
                    this.saveload.cancelPendingSave();
                    location.assign(location.pathname + "?mod-world");
                    this.leaving = true;
                }));
            }
            const remove = this.button(LangMgr.text.modsRemove, () => {
                const latest = this.current(world.id);
                if (latest.entry.enabled) throw new Error(LangMgr.text.modsDisableFirst);
                const next = latest.entries.filter(item => item.world.id !== world.id);
                this.saveload.save();
                saveModLibrary(next);
                this.saveload.cancelPendingSave();
                location.reload();
                this.leaving = true;
            }, enabled);
            remove.title = enabled ? LangMgr.text.modsDisableFirst : LangMgr.text.modsKeepProgress;
            actions.append(remove);
            row.append(name, meta, state, actions);
            content.append(row);
        }
        this.list.replaceChildren(content);
    }
}
