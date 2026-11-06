// Run after the normal TypeScript build: node test/test-survival-access.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { HSLayer } from '../js/hs/main.js';
import { SurvivalAccess } from '../js/hs/access.js';
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { HSError } from '../js/hs/core/error.js';
import { initialCreativeRules } from '../js/hs/core/initial.js';
import { TreeListViewer } from '../js/listmgr.js';

const parser = new HSParser();
const commands = texts => texts.map(text => parser.parse(text, 'cmd'));
const fullRewards = ['.prop', '1st', 'hyp', 'macro', 'mkdir', 'mct', 'mdt',
    'midt', 'mcpt', 'mnt', 'mcvt', 'mvt', 'met', 'mifft', 'mcmt'];

// Exercise the shipped constructor's actual callbacks without constructing its
// DOM widgets. No permission/replay/move/expand logic is replaced by a stub.
const mainSource = readFileSync(new URL('../js/hs/main.js', import.meta.url), 'utf8');
function callback(property, layer) {
    const marker = `        this.${property} = `;
    const start = mainSource.indexOf(marker);
    assert.ok(start >= 0, `production callback exists: ${property}`);
    const end = mainSource.indexOf('\n        };', start);
    assert.ok(end > start, `production callback terminates: ${property}`);
    const expression = mainSource.slice(start + marker.length, end + '\n        }'.length);
    return new Function('HSParser', 'HSError',
        `return function () { return (${expression}); };`)(HSParser, HSError).call(layer);
}

function fixture(rewards = ['.prop', '1st']) {
    const layer = Object.create(HSLayer.prototype);
    const errors = [];
    const system = new HilbertSystem();
    Object.assign(layer, {
        hilbertSystem: system, ruleList: [], activeRuleFolder: null,
        propListView: { refresh() {}, expandedFolders: new Set(), idCounter: 100 },
        ruleListView: { refresh() {} },
        cmdInput: { setParserArgs() {}, setValue() {} },
        cmdUIMgr: { insertText() {} },
        cmdEngine: { run() {}, isExecuting: () => false, reportError: e => errors.push(e) },
        survivalAccess: null,
    });
    if (rewards === null) layer.addRules(initialCreativeRules);
    else {
        layer.configureSurvival(rewards);
        assert.ok(layer.survivalAccess instanceof SurvivalAccess);
    }
    layer.sheetGui = {
        activeIndex: 0,
        sheets: [{ name: 'original', ctx: system.saveContext() }],
        render() {},
        addSheet() {
            this.sheets[this.activeIndex].ctx = system.saveContext();
            system.loadContext(system.createEmptyContext());
            this.sheets.push({ name: 'new', ctx: system.saveContext() });
            this.activeIndex = this.sheets.length - 1;
        },
    };
    layer.ruleListView.onMenuAction = callback('ruleListView.onMenuAction', layer);
    layer.propListView.allowDrop = callback('propListView.allowDrop', layer);
    layer.propListView.onMenuAction = callback('propListView.onMenuAction', layer);
    return { layer, system, errors, access: layer.survivalAccess };
}

// saveContext contains references: compare both identity and a deep copy so an
// in-place mutation cannot hide behind a restored context object.
function unchangedAfter(f, action) {
    const { system, layer } = f;
    const context = system.saveContext();
    const rules = system.rules;
    const entries = [...rules];
    const before = structuredClone({ context, rules, sheets: layer.sheetGui.sheets });
    const activeIndex = layer.sheetGui.activeIndex;
    const expanded = [...layer.propListView.expandedFolders];
    const idCounter = layer.propListView.idCounter;
    action();
    const after = system.saveContext();
    for (const key of Object.keys(context)) assert.equal(after[key], context[key], key);
    assert.equal(system.rules, rules);
    assert.deepEqual([...system.rules], entries);
    assert.deepEqual(structuredClone({ context: after, rules: system.rules,
        sheets: layer.sheetGui.sheets }), before);
    assert.equal(layer.sheetGui.activeIndex, activeIndex);
    assert.deepEqual([...layer.propListView.expandedFolders], expanded);
    assert.equal(layer.propListView.idCounter, idCounter);
}

function rejected(f, action, type, feature) {
    unchangedAfter(f, () => assert.throws(action,
        e => e?.type === type && (feature === undefined || e.feature === feature)));
}

function seed(f, texts) {
    // Trusted kernel replay also supplies imported/older proof fixtures. The
    // permission check belongs to the interactive operation being tested.
    f.system.fromCmd(commands(texts));
}

test('move rejects a closed theorem inside an axiom-only variable block', () => {
    const f = fixture();
    seed(f, ['var x', 'pop', '.i y=y']);
    const [variable, theorem] = f.system.props;
    assert.equal(f.system.rules.get('.i').conditions.length, 0);
    assert.ok(f.system.rules.get('.i').step.length);
    rejected(f, () => f.access.checkMove(theorem, variable, f.system), 'quantifyAxiomOnly');
    unchangedAfter(f, () => assert.equal(f.layer.propListView.allowDrop(theorem, variable, 'inside'), false));
});

test('move checks every descendant of an ordinary folder', () => {
    const f = fixture(['.prop', '1st', 'mkdir']);
    seed(f, ['var x', 'pop', 'dir outer', 'dir inner', '.i y=y']);
    const [variable, folder] = f.system.props;
    rejected(f, () => f.access.checkMove(folder, variable, f.system), 'quantifyAxiomOnly');
    unchangedAfter(f, () => assert.equal(f.layer.propListView.allowDrop(folder, variable, 'inside'), false));
});

test('move checks target ancestry for inside, before and after drops', () => {
    const f = fixture(['.prop', '1st', 'mkdir']);
    seed(f, ['var x', 'dir inner', 'a1 y=y y=y', 'cd 0', '.i y=y']);
    const variable = f.system.props[0];
    const folder = variable.children[0];
    const axiom = folder.children[0];
    const theorem = f.system.props[1];
    rejected(f, () => f.access.checkMove(theorem, folder, f.system), 'quantifyAxiomOnly');
    for (const position of ['before', 'after']) {
        unchangedAfter(f, () => assert.equal(f.layer.propListView.allowDrop(theorem, axiom, position), false));
    }
    unchangedAfter(f, () => assert.equal(f.layer.propListView.allowDrop(theorem, folder, 'inside'), false));
});

test('move finds a nested variable block even when destination is root', () => {
    const f = fixture(['.prop', '1st', 'mkdir']);
    seed(f, ['dir outer', 'dir inner', 'var x', '.i y=y']);
    const outer = f.system.props[0];
    rejected(f, () => f.access.checkMove(outer, null, f.system), 'quantifyAxiomOnly');
    unchangedAfter(f, () => assert.equal(f.layer.propListView.allowDrop(outer, null, 'after'), false));
});

test('move rejects a condition-bearing primitive rule in an axiom-only block', () => {
    const f = fixture(['.prop', '1st', 'hyp']);
    seed(f, ['hyp $p', 'hyp $p→$q', 'mp 2 1', 'var x']);
    assert.equal(f.system.rules.get('mp').step, undefined);
    rejected(f, () => f.access.checkMove(f.system.props[2], f.system.props[3], f.system), 'quantifyAxiomOnly');
});

test('axiom-only move permits axioms recursively and closed theorems at root', () => {
    const f = fixture(['.prop', '1st', 'mkdir']);
    seed(f, ['var x', 'pop', 'dir axioms', 'a1 y=y y=y', 'cd 0', '.i y=y']);
    const [variable, folder, theorem] = f.system.props;
    unchangedAfter(f, () => {
        f.access.checkMove(folder, variable, f.system);
        f.access.checkMove(theorem, null, f.system);
        assert.equal(f.layer.propListView.allowDrop(folder, variable, 'inside'), true);
    });
});

for (const reward of ['mcvt', 'mvt', 'met']) {
    test(`${reward} permits the same theorem move through the real list boundary`, () => {
        const f = fixture(['.prop', '1st', reward]);
        seed(f, ['var x', 'pop', '.i y=y']);
        const [variable, theorem] = f.system.props;
        unchangedAfter(f, () => f.access.checkMove(theorem, variable, f.system));
        assert.equal(f.layer.propListView.allowDrop(theorem, variable, 'inside'), true);
        variable.uuid = 1;
        theorem.uuid = 2;
        const view = Object.assign(Object.create(TreeListViewer.prototype), { data: f.system.props });
        assert.equal(view.moveNode(theorem.uuid, variable.uuid, 'inside'), true);
        f.system.updatePropIdx();
        assert.equal(theorem.parent, variable);
        assert.deepEqual(f.system.genCmd(), ['var x', '.i y=y']);
    });
}

test('replay rejects each locked command before changing the current proof', () => {
    const f = fixture(['.prop']);
    seed(f, ['.i y=y']);
    for (const [name, text] of [
        ['hyp', 'hyp $p'], ['cond', 'cond $p'], ['var', 'var x'],
        ['dir', 'dir folder'], ['m', 'm saved'],
        ['mcpt', 'mcpt $p→$p'], ['mcnt', 'mcnt (∀x:P(x)) {x,y}'],
    ]) {
        rejected(f, () => f.access.checkReplay(commands([text]), f.system), 'lockedFeature', name);
    }
});

test('replay tracks nested variable scope and a later return to root', () => {
    const f = fixture(['.prop', '1st', 'mkdir']);
    seed(f, ['dir existing', 'a1 $old $old']);
    rejected(f, () => f.access.checkReplay(commands([
        'var x', 'var z', 'dir nested', '.i y=y',
    ]), f.system), 'quantifyAxiomOnly');
    unchangedAfter(f, () => f.access.checkReplay(commands([
        'var x', 'dir nested', 'a1 y=y y=y', 'cd 0', '.i y=y',
    ]), f.system));
    seed(f, ['cd 0', 'var x']);
    const scope = f.system.props.at(-1);
    rejected(f, () => f.access.checkReplay(commands(['.i y=y']), f.system, scope), 'quantifyAxiomOnly');
});

test('replay discards a macro registered before a later permission failure', () => {
    const f = fixture(['.prop', 'macro']);
    seed(f, ['.i y=y']);
    rejected(f, () => f.access.checkReplay(commands([
        '.i y=y', 'm savedPreview', 'cond $p',
    ]), f.system), 'lockedFeature', 'cond');
    assert.equal(f.system.rules.has('savedPreview'), false);
});

test('macro menu load rejects locked proof commands before adding a sheet', () => {
    const f = fixture(['.prop']);
    seed(f, ['.i y=y']);
    const rule = f.system.rules.get('.t');
    assert.ok(rule?.step.length, 'the toolkit legitimately supplies .t');
    rejected(f, () => f.access.checkReplay(commands(f.system.genCmd(rule.step)), f.system), 'lockedFeature', 'hyp');
    unchangedAfter(f, () => assert.equal(f.layer.ruleListView.onMenuAction({ name: '.t' }, 'load'), false));
    assert.equal(f.errors.at(-1)?.type, 'lockedFeature');
    assert.equal(f.errors.at(-1)?.feature, 'hyp');
});

test('macro menu load permits .t once hyp and cond are unlocked', () => {
    const f = fixture(['.prop', 'hyp', 'mct']);
    seed(f, ['.i y=y']);
    unchangedAfter(f, () => f.access.checkReplay(commands(
        f.system.genCmd(f.system.rules.get('.t').step)), f.system));
    f.layer.ruleListView.onMenuAction({ name: '.t' }, 'load');
    assert.deepEqual(f.errors, []);
    assert.equal(f.layer.sheetGui.sheets.length, 2);
    assert.equal(f.layer.sheetGui.activeIndex, 1);
    assert.equal(f.layer.sheetGui.sheets[1].name, '.t');
    assert.deepEqual(f.system.genCmd(), [
        'hyp $1→$2', 'hyp $2→$3', 'cond $1', 'mp 1 3', 'mp 2 4',
    ]);
});

test('expand checks the target parent even when a different folder is active', () => {
    const f = fixture();
    seed(f, ['var x', '.i y=y', 'cd 0']);
    const theorem = f.system.props[0].children[0];
    assert.equal(f.system.saveContext().activeProp, null);
    rejected(f, () => f.access.checkExpand(theorem, f.system), 'quantifyAxiomOnly');
    unchangedAfter(f, () => assert.equal(f.layer.propListView.onMenuAction(theorem, 'expand'), false));
    assert.equal(f.errors.at(-1)?.type, 'quantifyAxiomOnly');
});

test('expand checks generated conditional rules, preserving rejected folders', () => {
    const f = fixture(['.prop']);
    seed(f, ['cond $p', 'a1 $q $r', 'cd 0']);
    const folder = f.system.props[0];
    rejected(f, () => f.access.checkExpand(folder, f.system), 'lockedFeature', 'c');
    unchangedAfter(f, () => assert.equal(f.layer.propListView.onMenuAction(folder, 'expand'), false));
    assert.equal(f.errors.at(-1)?.type, 'lockedFeature');
});

test('full unlock allows isolated previews and real theorem expansion', () => {
    const f = fixture(fullRewards);
    seed(f, ['var x', '.i y=y', 'cd 0']);
    const theorem = f.system.props[0].children[0];
    unchangedAfter(f, () => {
        f.access.checkReplay(commands(['var z', '.i y=y']), f.system);
        f.access.checkExpand(theorem, f.system);
    });
    f.layer.propListView.onMenuAction(theorem, 'expand');
    assert.deepEqual(f.errors, []);
    assert.equal(f.system.props[0].children.length, 5);
    assert.deepEqual(f.system.props[0].children.map(p => p.from.data.deduction.name),
        ['a1', 'a1', 'a2', 'mp', 'mp']);
});

test('creative UI permits move, expansion and macro load without survival restrictions', () => {
    const f = fixture(null);
    assert.equal(f.access, null);
    seed(f, ['var x', 'pop', '.i y=y']);
    const [variable, theorem] = f.system.props;
    assert.equal(f.layer.propListView.allowDrop(theorem, variable, 'inside'), true);
    seed(f, ['cd 1', '.i y=y', 'cd 0']);
    f.layer.propListView.onMenuAction(variable.children[0], 'expand');
    assert.equal(variable.children.length, 5);
    f.layer.ruleListView.onMenuAction({ name: '.t' }, 'load');
    assert.deepEqual(f.errors, []);
    assert.equal(f.layer.sheetGui.sheets.length, 2);
    assert.equal(f.system.props[2].from.type, 'c');
});
