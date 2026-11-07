const $ = id => document.getElementById(id);
const UI_KEY = 'deductrium-map-editor-ui-v1';

// Disclosure state is independent of project data and unapplied forms.
export function installUI() {
    let panel = null, returnFocus = null;
    const buttons = [...document.querySelectorAll('[data-open-panel]')];
    function openPanel(next, focus = true) {
        panel = next;
        $('task-panel').hidden = !next;
        if (next) $('workspace').dataset.panel = next;
        else delete $('workspace').dataset.panel;
        for (const name of ['tiles', 'modules', 'project']) $(name + '-panel').hidden = name !== next;
        for (const button of buttons) button.setAttribute('aria-expanded', String(button.dataset.openPanel === next));
        if (next) {
            $('task-title').textContent = {tiles: '格子', modules: '模块', project: '项目'}[next];
            if (focus) $('close-panel').focus();
        } else if (focus) returnFocus?.focus();
    }
    for (const button of buttons) button.addEventListener('click', () => {
        returnFocus = button;
        openPanel(panel === button.dataset.openPanel ? null : button.dataset.openPanel);
    });
    $('close-panel').onclick = () => openPanel(null);
    $('toggle-inspector').onclick = () => {
        const expanded = $('inspector').dataset.expanded !== 'true';
        $('inspector').dataset.expanded = String(expanded);
        $('toggle-inspector').setAttribute('aria-expanded', String(expanded));
        $('toggle-inspector').textContent = expanded ? '收起属性' : '展开属性';
    };
    $('open-module-export').onclick = () => {
        returnFocus = $('open-modules');
        openPanel('modules', false);
        $('module-export').open = true;
        $('module-export-id').focus();
    };
    const menus = [$('file-menu'), $('view-menu')];
    for (const menu of menus) {
        menu.addEventListener('toggle', () => {
            if (menu.open) for (const other of menus) if (other !== menu) other.open = false;
        });
        menu.addEventListener('click', event => { if (event.target.closest('button')) menu.open = false; });
    }
    document.addEventListener('click', event => {
        for (const menu of menus) if (!menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const menu = menus.find(menu => menu.open);
        if (menu) { menu.open = false; menu.querySelector('summary').focus(); }
        else if (panel) openPanel(null);
        else if ($('inspector').dataset.expanded === 'true') $('toggle-inspector').click();
    });
    try { $('map-note').hidden = JSON.parse(localStorage.getItem(UI_KEY) || '{}').noteDismissed === true; } catch {}
    $('dismiss-note').onclick = () => {
        $('map-note').hidden = true;
        try { localStorage.setItem(UI_KEY, JSON.stringify({noteDismissed: true})); } catch {}
    };
    openPanel(null, false);
    return {openPanel};
}
