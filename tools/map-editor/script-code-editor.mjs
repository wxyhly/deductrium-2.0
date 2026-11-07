import {tokenizeScript, completeScript} from './script-language.mjs';

/** Keep the native textarea as the editing surface; decoration never rewrites it. */
export function installScriptCodeEditor(field, {getContext = () => ({})} = {}) {
    const highlight = document.getElementById('script-highlight');
    const menu = document.getElementById('script-completions');
    let candidates = [], active = -1, composing = false;
    field.setAttribute('aria-autocomplete', 'list');
    field.setAttribute('aria-controls', menu.id);
    field.setAttribute('aria-expanded', 'false');

    function hide() {
        candidates = []; active = -1; menu.hidden = true; menu.replaceChildren();
        field.setAttribute('aria-expanded', 'false'); field.removeAttribute('aria-activedescendant');
    }
    function syncScroll() {
        highlight.scrollTop = field.scrollTop; highlight.scrollLeft = field.scrollLeft;
    }
    function render() {
        const source = field.value, fragment = document.createDocumentFragment();
        let offset = 0;
        for (const token of tokenizeScript(source)) {
            if (token.start > offset) fragment.append(source.slice(offset, token.start));
            const span = document.createElement('span');
            span.className = `script-token-${token.kind}`;
            span.textContent = source.slice(token.start, token.end); fragment.append(span);
            offset = token.end;
        }
        if (offset < source.length) fragment.append(source.slice(offset));
        highlight.replaceChildren(fragment); syncScroll();
    }
    function position() {
        if (menu.hidden) return;
        const rect = field.getBoundingClientRect(), view = window.visualViewport;
        const left = view?.offsetLeft ?? 0, top = view?.offsetTop ?? 0;
        const width = view?.width ?? innerWidth, height = view?.height ?? innerHeight;
        if (!rect.width || !rect.height || rect.bottom < top || rect.top > top + height) { hide(); return; }
        const gap = 4, below = top + height - rect.bottom - gap - 8, above = rect.top - top - gap - 8;
        // The sticky Apply/Reset actions are below the editor; keep them clickable.
        const down = above < 88 && below > above;
        menu.style.width = `${Math.min(rect.width, width - 16)}px`;
        menu.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - menu.offsetWidth - 8))}px`;
        menu.style.maxHeight = `${Math.max(44, Math.min(220, down ? below : above))}px`;
        menu.style.top = `${down ? rect.bottom + gap : Math.max(top + 8, rect.top - menu.offsetHeight - gap)}px`;
    }
    function select(index) {
        active = index;
        [...menu.children].forEach((button, i) => button.setAttribute('aria-selected', String(i === active)));
        if (active >= 0) {
            field.setAttribute('aria-activedescendant', menu.children[active].id);
            menu.children[active].scrollIntoView({block:'nearest'});
        } else field.removeAttribute('aria-activedescendant');
    }
    function replace(from, to, text) {
        field.focus({preventScroll:true}); field.setSelectionRange(from, to);
        const before = field.value;
        let inserted = false;
        try { inserted = document.execCommand('insertText', false, text); } catch { /* non-Chromium fallback */ }
        if (!inserted || field.value === before) {
            field.setRangeText(text, from, to, 'end');
            field.dispatchEvent(new Event('input', {bubbles:true}));
        }
        render(); hide();
    }
    function accept(index) {
        const item = candidates[index];
        if (!item) return;
        const following = field.value[item.to];
        const space = (!following || following === '\n') && /^[\w@:-]+$/.test(item.insertText) ? ' ' : '';
        replace(item.from, item.to, item.insertText + space);
    }
    function suggest() {
        hide();
        if (composing || document.activeElement !== field || field.selectionStart !== field.selectionEnd) return;
        candidates = completeScript(field.value, field.selectionStart, getContext());
        if (!candidates.length) return;
        const fragment = document.createDocumentFragment();
        candidates.forEach((item, index) => {
            const button = document.createElement('button');
            button.type = 'button'; button.tabIndex = -1; button.id = `script-candidate-${index}`;
            button.setAttribute('role','option'); button.setAttribute('aria-selected','false');
            const label = document.createElement('span'); label.textContent = item.label; button.append(label);
            if (item.detail) { const detail = document.createElement('small'); detail.textContent = item.detail; button.append(detail); }
            button.addEventListener('pointerdown', event => event.preventDefault());
            button.addEventListener('click', () => accept(index));
            fragment.append(button);
        });
        menu.replaceChildren(fragment); menu.hidden = false;
        field.setAttribute('aria-expanded','true'); position();
    }
    function indent(outdent) {
        const start = field.selectionStart, end = field.selectionEnd, source = field.value;
        const lineStart = source.lastIndexOf('\n', start - 1) + 1;
        if (!outdent && (start === end || !source.slice(start, end).includes('\n'))) {
            replace(start, end, '  '); return;
        }
        const last = end > start && source[end - 1] === '\n' ? end - 1 : end;
        const next = source.indexOf('\n', last), lineEnd = next < 0 ? source.length : next;
        const selected = source.slice(lineStart, lineEnd);
        const changed = selected.split('\n').map(line => outdent ? line.replace(/^(?: {1,2}|\t)/, '') : '  ' + line).join('\n');
        if (selected === changed) { hide(); return; }
        const firstDelta = (changed.split('\n')[0].length - selected.split('\n')[0].length);
        replace(lineStart, lineEnd, changed);
        field.setSelectionRange(Math.max(lineStart, start + firstDelta), Math.max(lineStart, end + changed.length - selected.length));
    }
    field.addEventListener('keydown', event => {
        if (composing || event.isComposing || event.keyCode === 229 || event.altKey || event.metaKey) return;
        if (event.ctrlKey && event.code === 'Space') { event.preventDefault(); event.stopPropagation(); suggest(); return; }
        if (event.ctrlKey) return;
        if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); event.stopPropagation(); hide(); return; }
        if (event.key === 'Tab') {
            event.preventDefault(); event.stopPropagation();
            if (!event.shiftKey && candidates.length) accept(active < 0 ? 0 : active);
            else indent(event.shiftKey);
        } else if (!event.shiftKey && candidates.length && ['ArrowDown','ArrowUp'].includes(event.key)) {
            event.preventDefault(); event.stopPropagation();
            select(active < 0 ? event.key === 'ArrowDown' ? 0 : candidates.length - 1
                : (active + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length);
        } else if (event.key === 'Enter' && active >= 0 && !menu.hidden) {
            event.preventDefault(); event.stopPropagation(); accept(active);
        }
    });
    field.addEventListener('input', () => { render(); suggest(); });
    field.addEventListener('click', suggest);
    field.addEventListener('keyup', event => {
        if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) suggest();
    });
    field.addEventListener('compositionstart', () => { composing = true; hide(); });
    field.addEventListener('compositionend', () => { composing = false; render(); });
    // Caret movement can scroll a long line after input/keydown has opened the
    // menu. Keep those candidates while aligning the decoration and popup.
    field.addEventListener('scroll', () => { syncScroll(); position(); });
    field.addEventListener('blur', hide);
    document.addEventListener('pointerdown', event => {
        if (event.target !== field && !menu.contains(event.target)) hide();
    }, true);
    field.closest('details').addEventListener('toggle', () => { if (!field.closest('details').open) hide(); });
    document.addEventListener('selectionchange', () => {
        if (document.activeElement === field && field.selectionStart !== field.selectionEnd) hide();
    });
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    render();
    return {refresh() { hide(); render(); }, hide};
}
