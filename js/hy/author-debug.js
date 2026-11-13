const DEBUG_PREFIX = 'world-author-debug:';
export function authorDebugEnabled(search) {
    const params = new URLSearchParams(search);
    return params.has('author-debug') && (params.has('mod-world') || params.has('map-editor-preview'));
}
/** ':' cannot occur in world IDs; starting with world- also isolates ProgressLayer slots. */
export function authorDebugSaveMode(mode, search) {
    return authorDebugEnabled(search) ? DEBUG_PREFIX + encodeURIComponent(mode) : mode;
}
/** Uses the actual Game SaveLoad, including its migration, validation and rollback callbacks. */
export class AuthorDebugSession {
    save;
    readState;
    capacity;
    entries = [];
    constructor(save, readState, capacity = 512) {
        this.save = save;
        this.readState = readState;
        this.capacity = capacity;
        if (!save.saveMode.startsWith(DEBUG_PREFIX))
            throw new Error('作者调试必须使用独立存档');
        if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 4096)
            throw new Error('Invalid trace capacity');
    }
    trace(entry) {
        this.entries.push({ ...entry });
        if (this.entries.length > this.capacity)
            this.entries.splice(0, this.entries.length - this.capacity);
    }
    traces() { return this.entries.map(entry => ({ ...entry })); }
    clear() { this.entries = []; }
    snapshotKey(name = 'quick') {
        if (!name.trim() || name.length > 64)
            throw new Error('快照名称须为 1–64 字符');
        return `${this.save.saveKey}:author-snapshot:${encodeURIComponent(name)}`;
    }
    capture(name = 'quick') { this.save.saveToKey(this.snapshotKey(name)); }
    restore(name = 'quick') {
        const raw = this.save.readKey(this.snapshotKey(name));
        if (raw === null)
            throw new Error('快照不存在');
        if (!this.save.importSave(raw))
            throw this.save.lastLoadError ?? new Error('快照恢复失败');
    }
}
const labels = { condition: '条件', action: '动作', 'not-run': '未执行', outcome: '结果' };
const outcomes = { pass: '通过', blocked: '阻止', confirmation: '等待确认', exception: '异常' };
export function mountAuthorDebug(options) {
    if (!authorDebugEnabled(options.search ?? window.location.search))
        return;
    const doc = options.document ?? document;
    const session = new AuthorDebugSession(options.save, options.readState);
    const panel = doc.createElement('details');
    panel.id = 'author-debug-panel';
    panel.open = true;
    panel.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:9000;box-sizing:border-box;width:min(40rem,calc(100vw - 16px));max-height:65vh;overflow:auto;padding:12px;background:Canvas;color:CanvasText;border:2px solid #9977cc;border-radius:6px;font:14px/1.5 system-ui';
    const title = doc.createElement('summary');
    title.textContent = '地图作者调试';
    const note = doc.createElement('p');
    note.textContent = '独立调试存档。轨迹中的动作仅表示计划；最终应用结果见 host 记录。';
    const status = doc.createElement('p');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const nameLabel = doc.createElement('label');
    nameLabel.textContent = '快照名称 ';
    const name = doc.createElement('input');
    name.value = 'quick';
    name.maxLength = 64;
    nameLabel.append(name);
    const controls = doc.createElement('div');
    const button = (text, action) => {
        const element = doc.createElement('button');
        element.type = 'button';
        element.textContent = text;
        element.addEventListener('click', () => {
            try {
                action();
                status.textContent = `${text}完成`;
                refresh();
            }
            catch (error) {
                status.textContent = error instanceof Error ? error.message : String(error);
            }
        });
        controls.append(element);
    };
    const stateTitle = doc.createElement('h3');
    stateTitle.textContent = '实时状态与证明上下文';
    const state = doc.createElement('pre');
    state.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-height:18rem;overflow:auto';
    const traceTitle = doc.createElement('h3');
    traceTitle.textContent = '实际事件轨迹（最多 512 条）';
    const traceList = doc.createElement('ol');
    traceList.style.cssText = 'max-height:18rem;overflow:auto;padding-left:2em;white-space:pre-wrap;overflow-wrap:anywhere';
    let disposed = false, dirty = true, previousState = '';
    const refresh = () => {
        if (disposed || !panel.open)
            return;
        try {
            const json = JSON.stringify(options.readState(), null, 2) ?? '无状态';
            const text = json.length > 48000 ? json.slice(0, 48000) + '\n…（显示已截断，快照保留完整状态）' : json;
            if (previousState !== text) {
                state.textContent = text;
                previousState = text;
            }
        }
        catch (error) {
            status.textContent = `读取状态失败：${error instanceof Error ? error.message : String(error)}`;
        }
        if (!dirty)
            return;
        dirty = false;
        traceList.replaceChildren();
        for (const entry of session.traces()) {
            const row = doc.createElement('li');
            const location = `${entry.tileId ?? '地图'} / ${entry.event ?? 'legacy'}${entry.line === undefined ? '' : ` / 第 ${entry.line} 行`}`;
            row.textContent = `${location} · ${entry.phase ?? 'plan'} · ${labels[entry.kind]} ${entry.op ?? ''}${entry.result === undefined ? '' : entry.result ? '：真' : '：假'}${entry.outcome ? `：${outcomes[entry.outcome]}` : ''}${entry.reason ? ` · ${entry.reason}` : ''}${entry.truncated ? ' · 轨迹已达上限' : ''}${entry.source ? `\n${entry.source}` : ''}`;
            if (options.revealSource && entry.tileId !== undefined && entry.line !== undefined) {
                const reveal = doc.createElement('button');
                reveal.type = 'button';
                reveal.textContent = '定位源码';
                reveal.addEventListener('click', () => options.revealSource(entry.tileId, entry.line));
                row.append(reveal);
            }
            traceList.append(row);
        }
    };
    button('刷新状态', () => { });
    button('捕获快照', () => session.capture(name.value));
    button('恢复快照', () => session.restore(name.value));
    button('清空轨迹', () => { session.clear(); dirty = true; });
    panel.append(title, note, nameLabel, controls, status, stateTitle, state, traceTitle, traceList);
    doc.body.append(panel);
    panel.addEventListener('toggle', refresh);
    // Rendering happens outside the script observer, after Game has committed its live transaction.
    const timer = setInterval(refresh, 750);
    refresh();
    return { session, trace: entry => { session.trace(entry); dirty = true; }, refresh,
        dispose: () => { disposed = true; clearInterval(timer); panel.remove(); } };
}
//# sourceMappingURL=author-debug.js.map