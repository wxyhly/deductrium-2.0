import { SyntaxViewer } from "../../astrender.js";
import { HSParser } from "../core/parser.js";
/** Conservative shape propagation, without constructing any derived rule. */
function derivedExpandable(prefix, entry, ruleNames) {
    if (!entry.derived)
        return false;
    let { conditions, implication } = entry.derived;
    let proof = !!entry.expandable;
    const has = (...names) => names.every(name => ruleNames.has(name));
    for (let i = prefix.length - 1; i >= 0; i--) {
        const mp = i === prefix.length - 1 && entry.name === "mp";
        switch (prefix[i]) {
            case "c":
                if (!has("mp", "a1") || (mp && !has("a2")))
                    return false;
                proof = true;
                implication = true;
                break;
            case "v":
                if ((!conditions && !proof) || (conditions && !has("mp", mp ? "a5" : "a4")))
                    return false;
                proof = true;
                implication = false;
                break;
            case "u":
                if (!conditions || !has("mp", "a6", mp ? "a5" : "a4"))
                    return false;
                proof = true;
                implication = false;
                break;
            case "<":
                if (!implication || !has("mp"))
                    return false;
                conditions++;
                proof = true;
                // The consequent's shape is unknown in this small metadata view.
                implication = false;
                break;
            case ">":
                if (!conditions)
                    return false;
                conditions--;
                proof = true;
                implication = true;
                break;
            default: return false; // e does not provide a proof tree.
        }
    }
    return proof;
}
/** Match names first; only displayed derived candidates request isolated previews. */
export function completeCommand(text, cursor, selectionEnd, source) {
    if (cursor !== selectionEnd)
        return [];
    const before = text.slice(0, cursor);
    let segmentStart = 0;
    let inQuote = false;
    for (let i = 0; i < before.length; i++) {
        if (inQuote && before[i] === "\\") {
            i++;
            continue;
        }
        if (before[i] === '"')
            inQuote = !inQuote;
        else if (!inQuote && (before[i] === ";" || before[i] === "\n"))
            segmentStart = i + 1;
    }
    let fragment = before.slice(segmentStart);
    let start = segmentStart;
    let command;
    let idle = false;
    if (source.pending) {
        if (source.pending.argumentCount !== 0 || segmentStart)
            return [];
        command = source.pending.command;
    }
    else {
        const head = /^(\s*)(\S+)(\s+)/.exec(fragment);
        if (head) {
            command = head[2];
            start += head[0].length;
            fragment = fragment.slice(head[0].length);
        }
        else {
            const spaces = /^\s*/.exec(fragment)[0].length;
            start += spaces;
            fragment = fragment.slice(spaces);
            idle = !source.inspecting;
            command = source.inspecting ? "entr" : "d";
        }
    }
    const editing = ["inln", "entr", "del", "rename"].includes(command);
    if (command !== "d" && !editing)
        return [];
    if (editing) {
        // del accepts a comma-separated list; later rename arguments are new names.
        if (command === "del") {
            const comma = fragment.lastIndexOf(",");
            start += comma + 1;
            fragment = fragment.slice(comma + 1);
        }
        const spaces = /^\s*/.exec(fragment)[0].length;
        start += spaces;
        fragment = fragment.slice(spaces);
        if (fragment.startsWith('"')) {
            if (command !== "rename")
                return [];
            const token = /^"(?:\\.|[^"\\\n])*"/.exec(fragment);
            if (token && token[0].length !== fragment.length)
                return [];
        }
        else if (/\s/.test(fragment))
            return [];
    }
    else if (/\s/.test(fragment))
        return [];
    if (!fragment)
        return [];
    // Complete the innermost atom in a prefixed/composed rule name.
    let prefix = "";
    const composed = /[(),:]/.test(fragment);
    const proofTarget = command === "entr" || command === "inln";
    let outerPrefix = "";
    if (!editing || proofTarget) {
        const atom = /[^(),:]+$/.exec(fragment);
        if (!atom) {
            // A closed application has no atom left to complete. It still owns
            // one whole-rule preview, including any prefix outside the brackets.
            if (!proofTarget && fragment.endsWith(")")) {
                const hint = source.previewRule?.(fragment);
                if (hint)
                    return [{ kind: "D", label: fragment, hint, hintType: "rule", text: fragment, start, end: cursor }];
            }
            return [];
        }
        outerPrefix = /^([cvue<>]+)[(:]$/.exec(fragment.slice(0, atom.index))?.[1] ?? "";
        start += atom.index;
        fragment = atom[0];
        prefix = /^[cvue<>]+/.exec(fragment)?.[0] ?? "";
    }
    const quoted = editing && fragment.startsWith('"');
    let query = fragment;
    if (quoted) {
        try {
            query = JSON.parse(/^"(?:\\.|[^"\\\n])*"$/.test(fragment) ? fragment : fragment + '"');
        }
        catch {
            return [];
        }
    }
    const endMatch = quoted ? /^"(?:\\.|[^"\\\n])*"?/.exec(text.slice(start)) : editing && !proofTarget ? /^[^\s,;\n"]*/.exec(text.slice(cursor)) : /^[^\s(),:;\n]*/.exec(text.slice(cursor));
    const end = (quoted ? start : cursor) + (endMatch?.[0].length ?? 0);
    const results = [];
    const seen = new Set();
    const add = (kind, entry, value, lookup, query) => {
        if (!lookup.toLowerCase().startsWith(query.toLowerCase()))
            return;
        const key = kind + "\0" + value;
        if (seen.has(key))
            return;
        seen.add(key);
        results.push({ kind, label: value, hint: entry.hint ?? "", hintType: entry.hintType, text: value, start, end });
    };
    if (editing) {
        const entries = [...source.targets, ...(command === "rename" ? source.folders : [])];
        for (const entry of entries) {
            if (proofTarget && composed)
                continue; // Composition operands must be rules, not sheet aliases.
            if (proofTarget && !(command === "inln" ? entry.inlinable ?? entry.expandable : entry.expandable))
                continue;
            const value = quoted || /[\s"\\]/.test(entry.name) ? JSON.stringify(entry.name) : entry.name;
            // Only rename supports quoted folder names in the command grammar.
            if (command !== "rename" && /\s/.test(entry.name))
                continue;
            add(entry.kind ?? "P", entry, value, entry.name, query);
        }
        if (proofTarget) {
            const ruleNames = new Set(source.rules.map(entry => entry.name));
            for (const entry of source.rules) {
                if ((entry.expandable || (composed && !!entry.derived)) && (!outerPrefix || derivedExpandable(outerPrefix, entry, ruleNames)))
                    add("D", entry, entry.name, entry.name, fragment);
                if (prefix && fragment.length > prefix.length && derivedExpandable(outerPrefix + prefix, entry, ruleNames))
                    add("D", { name: entry.name }, prefix + entry.name, entry.name, fragment.slice(prefix.length));
            }
        }
    }
    else {
        for (const entry of source.rules)
            add("D", entry, entry.name, entry.name, fragment);
        if (prefix && fragment.length > prefix.length) {
            for (const entry of source.rules)
                add("D", { name: entry.name }, prefix + entry.name, entry.name, fragment.slice(prefix.length));
        }
        if (idle && start === segmentStart + before.slice(segmentStart).search(/\S/)) {
            for (const name of source.commands)
                add("C", { name }, name, name, fragment);
        }
    }
    return results.slice(0, 100).map(item => {
        if (item.kind !== "D" || (command !== "d" && !proofTarget) || (!prefix && !composed))
            return item;
        // Atom candidates describe their displayed name. Only the closed-rule
        // candidate above describes the full surrounding composition.
        const hint = source.previewRule?.(item.label) ?? "";
        return { ...item, hint, hintType: hint ? "rule" : undefined };
    });
}
export class CommandCompletion {
    editor;
    source;
    list = document.createElement("ul");
    textarea;
    items = [];
    active = -1;
    composing = false;
    snapshot = "";
    cursor = -1;
    previews = [];
    previewParser = new HSParser();
    constructor(editor, mount, source) {
        this.editor = editor;
        this.source = source;
        this.textarea = mount.querySelector("textarea");
        this.list.id = "hs-completions";
        this.list.className = "cmd-completions";
        this.list.hidden = true;
        this.list.setAttribute("role", "listbox");
        mount.appendChild(this.list);
        this.textarea.setAttribute("aria-controls", this.list.id);
        this.textarea.setAttribute("aria-autocomplete", "list");
        this.textarea.setAttribute("aria-expanded", "false");
        this.textarea.addEventListener("input", () => this.update());
        this.textarea.addEventListener("click", () => this.update());
        this.textarea.addEventListener("compositionstart", () => { this.composing = true; this.hide(); });
        this.textarea.addEventListener("compositionend", () => { this.composing = false; this.update(); });
        this.textarea.addEventListener("keydown", e => this.keydown(e), true);
        this.textarea.addEventListener("blur", () => this.hide());
    }
    hide() {
        this.clearPreviews();
        this.items = [];
        this.active = -1;
        this.list.hidden = true;
        this.list.replaceChildren();
        this.textarea.setAttribute("aria-expanded", "false");
        this.textarea.removeAttribute("aria-activedescendant");
    }
    update() {
        if (this.composing || this.editor.disabled) {
            this.hide();
            return;
        }
        this.items = completeCommand(this.editor.getValue(), this.textarea.selectionStart, this.textarea.selectionEnd, this.source());
        this.snapshot = this.editor.getValue();
        this.cursor = this.textarea.selectionStart;
        this.active = -1;
        this.clearPreviews();
        this.list.replaceChildren();
        this.textarea.removeAttribute("aria-activedescendant");
        this.list.hidden = !this.items.length;
        this.textarea.setAttribute("aria-expanded", String(!!this.items.length));
        this.items.forEach((item, i) => {
            const li = document.createElement("li");
            li.id = `hs-completion-${i}`;
            li.setAttribute("role", "option");
            li.setAttribute("aria-selected", "false");
            const name = document.createElement("span");
            name.className = "completion-name";
            name.append(`[${item.kind}] `);
            const label = document.createElement("span");
            if (item.kind === "P")
                label.textContent = item.label;
            else
                this.renderPreview(label, item.label, item.kind === "C" ? "cmd" : "dname");
            name.appendChild(label);
            const hint = document.createElement("span");
            hint.className = "completion-hint";
            if (item.hint && item.hintType && item.hintType !== "name")
                this.renderPreview(hint, item.hint, item.hintType);
            else
                hint.textContent = item.hint;
            li.append(name, hint);
            li.addEventListener("mousedown", e => e.preventDefault());
            li.addEventListener("click", () => { this.accept(i); if (item.kind !== "C")
                this.editor.onEnter?.(); });
            this.list.appendChild(li);
        });
    }
    clearPreviews() {
        this.previews.forEach(viewer => viewer.destroy());
        this.previews.length = 0;
    }
    renderPreview(host, text, type) {
        // Candidate selection owns clicks; a formula fragment must not insert
        // itself into the command prompt through SyntaxViewer's global handler.
        host.classList.add("completion-syntax");
        const viewer = new SyntaxViewer(host, this.previewParser, text, type);
        if (host.textContent !== text) {
            viewer.destroy();
            host.textContent = text;
        }
        else
            this.previews.push(viewer);
    }
    accept(index) {
        const item = this.items[index];
        if (!item)
            return;
        const value = this.editor.getValue();
        this.editor.setValue(value.slice(0, item.start) + item.text + value.slice(item.end));
        const cursor = item.start + item.text.length;
        this.editor.setSelectionRange(cursor, cursor);
        this.editor.focus();
        this.hide();
    }
    keydown(e) {
        if (this.composing || e.isComposing || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey)
            return;
        if (this.editor.getValue() !== this.snapshot || this.textarea.selectionStart !== this.cursor || this.textarea.selectionEnd !== this.cursor)
            this.hide();
        if (e.key === "Escape") {
            this.hide();
            return;
        }
        if (e.key === "Tab" && !e.shiftKey) {
            // Refresh also handles programmatic value changes and exact names.
            if (!this.items.length)
                this.update();
            if (this.items.length) {
                e.preventDefault();
                e.stopImmediatePropagation();
                this.accept(this.active < 0 ? 0 : this.active);
            }
        }
        else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && this.items.length) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.active = (this.active + (e.key === "ArrowDown" ? 1 : this.active < 0 ? 0 : -1) + this.items.length) % this.items.length;
            Array.from(this.list.children).forEach((li, i) => {
                li.classList.toggle("active", i === this.active);
                li.setAttribute("aria-selected", String(i === this.active));
            });
            const li = this.list.children[this.active];
            this.textarea.setAttribute("aria-activedescendant", li.id);
            li.scrollIntoView({ block: "nearest" });
        }
        else if (e.key === "Enter") {
            if (this.active >= 0)
                this.accept(this.active);
            else
                this.hide();
            // SyntaxEditor's normal Enter handler executes the accepted input.
        }
        else {
            this.hide();
        }
    }
}
//# sourceMappingURL=completion.js.map