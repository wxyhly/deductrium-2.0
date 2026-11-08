// Run after the normal TypeScript build; exercise the emitted JavaScript.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';
import {TreeListViewer} from '../js/listmgr.js';
import {SaveLoad} from '../js/saveload.js';
import {TTGui} from '../js/tt/gui.js';

const LZString = runInNewContext(
    readFileSync(new URL('../lib/lz-string.min.js', import.meta.url), 'utf8') + '\nLZString;');

// Omit layout only; keep the real menu dispatcher, fold handler and tree lookup.
class HeadlessTableView extends TreeListViewer {
    createResizeHandle() {}
    renderList() {}
    bindRowEvents() {}
}

function makeGui() {
    const gui = Object.create(TTGui.prototype);
    gui.tableData = [];
    gui.activeFolder = null;
    gui.tableView = new HeadlessTableView(gui.tableData, {
        style: {}, querySelector: () => ({}),
    });
    gui.initTableView();
    return gui;
}

const table = [{content: 'outer', children: [{content: 'inner', children: []}]}];

for (const scenario of [
    {name: 'set active folder', initial: -1, expected: 1, action: 'setActiveFolder'},
    {name: 'clear active folder', initial: 1, expected: -1, action: 'clearActiveFolder'},
    {name: 'collapse active folder', initial: 1, expected: -1, collapse: 'inner'},
    {name: 'collapse ancestor of active folder', initial: 1, expected: -1, collapse: 'outer'},
]) {
    test(`${scenario.name} notifies autosave and survives reload`, t => {
        const entries = new Map(), writes = [];
        const globals = {
            document: {addEventListener() {}, querySelectorAll: () => []},
            LZString,
            localStorage: {
                getItem: key => entries.get(key) ?? null,
                setItem(key, value) { entries.set(key, String(value)); writes.push(key); },
            },
        };
        for (const [key, value] of Object.entries(globals)) {
            const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
            Object.defineProperty(globalThis, key, {configurable: true, writable: true, value});
            t.after(() => {
                if (descriptor) Object.defineProperty(globalThis, key, descriptor);
                else delete globalThis[key];
            });
        }
        t.mock.timers.enable({apis: ['setTimeout']});

        const gui = makeGui();
        gui.deserialize({table, active: scenario.initial});
        const save = new SaveLoad('creative', () => ({tt: gui.serialize()}), data => gui.deserialize(data.tt));
        let notifications = 0;
        gui.onchange = () => { notifications++; save.notifySave(); };
        save.save();
        const savedActive = () => JSON.parse(LZString.decompressFromUTF16(save.exportSave())).data.tt.active;
        assert.equal(savedActive(), scenario.initial);

        const outer = gui.tableData[0], inner = outer.children[0];
        if (scenario.action) {
            gui.tableView.menuItemHandler({
                currentTarget: {dataset: {uuid: String(inner.uuid), action: scenario.action}},
                stopPropagation() {},
            });
        } else {
            gui.tableView.expandedFolders.add(outer.uuid);
            gui.tableView.expandedFolders.add(inner.uuid);
            const target = scenario.collapse === 'outer' ? outer : inner;
            gui.tableView.toggleHandler({currentTarget: {dataset: {uuid: String(target.uuid)}}});
            assert.equal(gui.tableView.expandedFolders.has(target.uuid), false);
        }
        assert.equal(gui.serialize().active, scenario.expected);
        assert.equal(Boolean(inner.active), scenario.expected === 1);
        assert.equal(notifications, 1, 'the folder interaction must notify SaveLoad exactly once');
        t.mock.timers.tick(1999);
        assert.equal(writes.length, 1, 'autosave must retain its normal delay');
        assert.equal(savedActive(), scenario.initial);
        t.mock.timers.tick(1);
        assert.equal(writes.length, 2, 'the delayed autosave must write the changed folder state');
        assert.equal(savedActive(), scenario.expected);

        const reloaded = makeGui();
        const reloadSave = new SaveLoad('creative', () => ({tt: reloaded.serialize()}),
            data => reloaded.deserialize(data.tt));
        assert.equal(reloadSave.load(), true);
        assert.deepEqual(reloaded.serialize(), {table, active: scenario.expected});
        assert.equal(Boolean(reloaded.tableData[0].children[0].active), scenario.expected === 1);
        assert.equal(writes.length, 2, 'loading must not write another save');
    });
}
