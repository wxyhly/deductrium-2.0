import assert from 'node:assert/strict';
import {test} from 'node:test';
import {HSLayer} from '../js/hs/main.js';
import {Serde} from '../js/hs/serde.js';
import {SheetGui} from '../js/hs/gui/sheet.js';
import {HilbertSystem} from '../js/hs/core/core.js';
import {HSParser} from '../js/hs/core/parser.js';
import {initialCreativeRules} from '../js/hs/core/initial.js';
import {rerecordRule} from '../js/hs/rerecord.js';
import {ruleProvenance} from '../js/hs/provenance.js';

const identity = 'a1 $p $p;a1 $p $p→$p;a2 $p $p→$p $p;mp 3 2;mp 4 1';
const brokenRules = [
    'stableProof:⊢$p→$p;.i $p',
    'C:⊢$p→$p;B $p',
    'B:⊢$p→$p;A $p',
    'A:⊢$p→$p;missing',
    'unrelated:⊢$p→$p;stillMissing',
].join('\n');
const run = (core, commands) => core.fromCmd(commands.split(';').filter(Boolean)
    .map(command => new HSParser().parse(command, 'cmd')));

function fixture(extra = brokenRules) {
    // Only DOM presentation is replaced. Rule replay, sheet switching and all
    // serialization use the shipped implementations, including their callbacks.
    const layer = Object.create(HSLayer.prototype);
    const core = layer.hilbertSystem = new HilbertSystem();
    layer.ruleList = [];
    layer.mapScriptRules = new Map();
    layer.ruleListView = {refresh() {}, expandedFolders: new Set(), idCounter: 1};
    layer.propListView = {refresh() {}, setData() {}};
    const gui = layer.sheetGui = Object.assign(Object.create(SheetGui.prototype), {
        hs: core,
        sheets: [{name: 'Original', ctx: core.saveContext(), pe: []}],
        activeIndex: 0,
        expandedIds: [],
        render() {},
        guard: () => true,
        onChange() {},
        onRefresh: () => layer.propListView.setData(core.props),
        captureExpanded: () => [...gui.expandedIds],
        restoreExpanded: ids => { gui.expandedIds = [...ids]; },
    });
    layer.refresh = () => layer.propListView.setData(core.props);
    const serde = new Serde(layer, core, layer.ruleList, layer.propListView, layer.ruleListView);
    layer.addRules(initialCreativeRules + '\n' + extra);
    return {layer, core, gui, serde};
}

function repairA({layer, core}) {
    const failed = core.rules.get('A');
    assert.ok(failed.error, 'the fixture starts with a genuinely failed A');
    run(core, identity);
    const replacement = rerecordRule(core, failed);
    layer.retryFailedRules();
    for (const name of ['A', 'B', 'C']) {
        const rule = core.rules.get(name);
        assert.ok(rule.step?.length, name + ' has an actual proof');
        assert.equal(rule.error, undefined, name + ' recovered');
        assert.equal(ruleProvenance(core, rule).valid, true, name + ' has verified provenance');
    }
    return replacement;
}

function commands(core, sheet) {
    return core.genCmd(sheet.ctx.props).join(';');
}

test('retry repairs reverse-ordered C→B→A without replacing valid rules or other live references', () => {
    const state = fixture(), {layer, core, gui} = state;
    const valid = new Map([...core.rules].filter(([, rule]) => !rule.error));
    const failedB = core.rules.get('B'), failedC = core.rules.get('C');
    const unrelated = core.rules.get('unrelated');
    const unrelatedError = structuredClone(unrelated.error);
    layer.mapScriptRules.set('B', failedB);
    layer.mapScriptRules.set('stableProof', core.rules.get('stableProof'));
    const ruleMap = core.rules, aliases = core.renamedSysRule;
    const nodes = [...layer.ruleList], sheet = gui.sheets[0], context = sheet.ctx;
    const order = [...core.rules.keys()];

    repairA(state);

    assert.notEqual(core.rules.get('B'), failedB);
    assert.notEqual(core.rules.get('C'), failedC);
    assert.equal(layer.mapScriptRules.get('B'), core.rules.get('B'), 'owned failed rule follows its replacement');
    assert.equal(layer.mapScriptRules.get('stableProof'), valid.get('stableProof'));
    for (const [name, rule] of valid) assert.equal(core.rules.get(name), rule, name + ' keeps its object identity');
    assert.equal(core.rules, ruleMap);
    assert.equal(core.renamedSysRule, aliases);
    assert.deepEqual([...core.rules.keys()], order);
    nodes.forEach((node, i) => assert.equal(layer.ruleList[i], node, 'rule-list node identity'));
    assert.equal(gui.sheets[0], sheet);
    assert.equal(sheet.ctx, context);
    assert.equal(core.rules.get('unrelated'), unrelated);
    assert.deepEqual(unrelated.error, unrelatedError, 'unrelated failures keep their original diagnostics');

    const repaired = new Map(core.rules);
    const active = core.saveContext();
    layer.retryFailedRules();
    for (const [name, rule] of repaired) assert.equal(core.rules.get(name), rule, 'a second retry is a no-op for ' + name);
    for (const key of Object.keys(active)) assert.equal(core.saveContext()[key], active[key], 'active ' + key);
});

for (const owned of [false, true]) {
    test('real Serde restores reverse dependencies before the B-containing draft' + (owned ? ' with map-owned rules' : ''), () => {
        const state = fixture(), {layer, core, gui, serde} = state;
        if (owned) {
            layer.mapScriptRules.set('B', core.rules.get('B'));
            layer.mapScriptRules.set('stableProof', core.rules.get('stableProof'));
        }
        repairA(state);
        run(core, 'name 5 originalConclusion');
        gui.expandedIds = [1];
        gui.addSheet();
        gui.sheets[gui.activeIndex].name = 'Rerecord draft';
        gui.sheets[gui.activeIndex].rerecord = {name: 'A', schema: core.rules.get('A').toString()};
        run(core, 'a1 $p $p;B $p;name 2 draftConclusion');
        gui.expandedIds = [2];
        const encoded = JSON.stringify(serde.serialize());
        const saved = JSON.parse(encoded);
        assert.ok(saved.r.indexOf('C:') < saved.r.indexOf('B:'));
        assert.ok(saved.r.indexOf('B:') < saved.r.indexOf('A:'), 'keep the dependency-hostile saved UI order');
        assert.match(saved.s.sheets[1].cmds, /B /, 'the saved draft really calls B');

        const restored = fixture('');
        restored.serde.deserialize(JSON.parse(encoded));
        for (const name of ['A', 'B', 'C']) {
            const rule = restored.core.rules.get(name);
            assert.equal(rule.error, undefined, name + ' survives reload');
            assert.equal(ruleProvenance(restored.core, rule).valid, true, name + ' provenance survives reload');
        }
        assert.equal(restored.gui.activeIndex, saved.s.activeIndex);
        assert.equal(restored.gui.sheets.length, 2);
        for (const [i, sheet] of restored.gui.sheets.entries()) {
            assert.equal(sheet.name, saved.s.sheets[i].name);
            assert.deepEqual(sheet.pe, saved.s.sheets[i].pe);
            assert.deepEqual(sheet.rerecord, saved.s.sheets[i].rerecord);
            assert.equal(commands(restored.core, sheet), saved.s.sheets[i].cmds, 'all rows and names in sheet ' + i + ' survive');
        }
        assert.equal(restored.core.props, restored.gui.sheets[1].ctx.props, 'the restored draft is the active context');
        assert.equal(restored.core.props.length, 2, 'replay must not silently empty the draft');
        assert.equal(restored.core.props[1].from.data.deduction.name, 'B');
        assert.equal(restored.core.props[1].name, 'draftConclusion');
        if (owned) {
            assert.equal(restored.layer.mapScriptRules.get('B'), restored.core.rules.get('B'));
            assert.equal(restored.layer.mapScriptRules.get('stableProof'), restored.core.rules.get('stableProof'));
        }
        assert.deepEqual(restored.serde.serialize(), saved, 'a complete save/reload/save retains rules, sheets and metadata');

        // Sheet switching uses the real SheetGui and must preserve both proofs.
        restored.gui.switchSheet(0);
        assert.equal(restored.core.genCmd().join(';'), saved.s.sheets[0].cmds);
        restored.gui.switchSheet(1);
        assert.equal(restored.core.genCmd().join(';'), saved.s.sheets[1].cmds);
        assert.deepEqual(restored.gui.sheets[1].rerecord, saved.s.sheets[1].rerecord);
    });
}
