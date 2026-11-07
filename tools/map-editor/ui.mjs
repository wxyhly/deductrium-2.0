const $ = id => document.getElementById(id);
const UI_KEY = 'deductrium-map-editor-ui-v1';

function installInspectorResize(preferences, savePreference) {
    const workspace = $('workspace'), inspector = $('inspector'), handle = $('inspector-resizer');
    const mobile = matchMedia('(max-width:700px)');
    let preferred = Number.isFinite(preferences.inspectorWidth) ? preferences.inspectorWidth : null;
    let dragging = null, minimum = 260, maximum = 330;
    function sync() {
        handle.hidden = mobile.matches;
        if (mobile.matches) { finish(); return; }
        const style = getComputedStyle(workspace), task = $('task-panel');
        const gap = parseFloat(style.columnGap);
        const taskWidth = !task.hidden && getComputedStyle(task).position !== 'absolute' ? task.offsetWidth + gap : 0;
        maximum = Math.max(minimum, workspace.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
            - document.querySelector('.task-nav').offsetWidth - 2 * gap - taskWidth - 260);
        const fallback = parseFloat(style.getPropertyValue('--inspector-default-width'));
        const width = Math.round(Math.max(minimum, Math.min(maximum, preferred ?? fallback)));
        workspace.style.setProperty('--inspector-width', `${width}px`);
        handle.style.left = `${inspector.offsetLeft - gap}px`;
        handle.setAttribute('aria-valuemin', String(minimum));
        handle.setAttribute('aria-valuemax', String(Math.floor(maximum)));
        handle.setAttribute('aria-valuenow', String(width));
    }
    function setWidth(width) {
        preferred = Math.max(minimum, Math.min(maximum, width));
        sync();
    }
    function finish(event) {
        if (!dragging || (event && event.pointerId !== dragging.id)) return;
        const id = dragging.id;
        dragging = null;
        workspace.classList.remove('resizing-inspector');
        if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
        savePreference({inspectorWidth: preferred});
    }
    handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || dragging || mobile.matches) return;
        event.preventDefault();
        handle.focus();
        dragging = {id: event.pointerId, x: event.clientX, width: inspector.offsetWidth};
        handle.setPointerCapture(event.pointerId);
        workspace.classList.add('resizing-inspector');
    });
    handle.addEventListener('pointermove', event => {
        if (!dragging || event.pointerId !== dragging.id) return;
        setWidth(dragging.width + dragging.x - event.clientX);
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(name, finish);
    handle.addEventListener('dblclick', () => {
        preferred = null;
        savePreference({inspectorWidth: null});
        sync();
    });
    handle.addEventListener('keydown', event => {
        const width = inspector.offsetWidth;
        const next = {ArrowLeft: width + 20, ArrowRight: width - 20, Home: minimum, End: maximum}[event.key];
        if (next === undefined || event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        setWidth(next);
        savePreference({inspectorWidth: preferred});
    });
    window.addEventListener('blur', () => finish());
    new ResizeObserver(sync).observe(workspace);
    sync();
    return sync;
}

// Disclosure state is independent of project data and unapplied forms.
export function installUI() {
    let panel = null, returnFocus = null, regionShown = false;
    let preferences = {};
    try {
        const saved = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) preferences = saved;
    } catch {}
    const savePreference = patch => {
        Object.assign(preferences, patch);
        try { localStorage.setItem(UI_KEY, JSON.stringify(preferences)); } catch {}
    };
    const syncInspector = installInspectorResize(preferences, savePreference);
    const buttons = [...document.querySelectorAll('[data-open-panel]')];
    function openPanel(next, focus = true) {
        panel = next;
        $('task-panel').hidden = !next;
        if (next) $('workspace').dataset.panel = next;
        else delete $('workspace').dataset.panel;
        for (const name of ['tiles', 'modules', 'project']) $(name + '-panel').hidden = name !== next;
        for (const button of buttons) button.setAttribute('aria-expanded', String(button.dataset.openPanel === next));
        if (next) {
            $('task-title').textContent = {tiles: '格子', modules: '模块', project: '项目与发布'}[next];
            // The editable half-plane is chosen before authoring; reveal it the first time the project panel opens.
            const region = $('region-settings');
            if (next === 'project' && region && !regionShown) region.open = regionShown = true;
            if (focus) $('close-panel').focus();
        } else if (focus) returnFocus?.focus();
        syncInspector();
    }
    for (const button of buttons) button.addEventListener('click', () => {
        returnFocus = button;
        openPanel(panel === button.dataset.openPanel ? null : button.dataset.openPanel);
    });
    // Arrow keys move between the task tabs; Enter/Space still toggle via click.
    const navButtons = [...document.querySelectorAll('.task-nav [data-open-panel]')];
    document.querySelector('.task-nav').addEventListener('keydown', event => {
        const index = navButtons.indexOf(event.target);
        const step = {ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1}[event.key];
        if (index < 0 || (!step && event.key !== 'Home' && event.key !== 'End')) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? navButtons.length - 1 : (index + step + navButtons.length) % navButtons.length;
        navButtons[next].focus();
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
        if (event.isComposing || event.keyCode === 229 || event.key !== 'Escape') return;
        const menu = menus.find(menu => menu.open);
        if (menu) { menu.open = false; menu.querySelector('summary').focus(); }
        else if (panel) openPanel(null);
        else if ($('inspector').dataset.expanded === 'true') $('toggle-inspector').click();
    });
    $('map-note').hidden = preferences.noteDismissed === true;
    $('dismiss-note').onclick = () => {
        $('map-note').hidden = true;
        savePreference({noteDismissed: true});
    };
    openPanel(null, false);
    return {openPanel};
}
