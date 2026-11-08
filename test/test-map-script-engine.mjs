// Production modules only; MAP_SCRIPT_JS_ROOT optionally points at a scoped temporary build.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = process.env.MAP_SCRIPT_JS_ROOT ? pathToFileURL(path.resolve(process.env.MAP_SCRIPT_JS_ROOT) + path.sep) : new URL('../js/', import.meta.url);
const load = relative => import(new URL(relative, root));
const { createMapScriptEngine } = await load('hy/script-engine.js');
const { createMapScriptState } = await load('hy/script.js');
const { HSLayer } = await load('hs/main.js');
const { HilbertSystem } = await load('hs/core/core.js');
const { HSParser } = await load('hs/core/parser.js');
const { Serde } = await load('hs/serde.js');
const { initialSurvivalRules, initialCreativeRules } = await load('hs/core/initial.js');
const { TTGui, buildSysData } = await load('tt/gui.js');
const { Core } = await load('tt/core.js');
const { initTypeSystem } = await load('tt/initial.js');
const { LangMgr } = await load('lang.js');
LangMgr.lang = 'zh';

function fixture(text = initialSurvivalRules, entries = []) {
    const hs = Object.create(HSLayer.prototype);
    hs.hilbertSystem = new HilbertSystem();
    hs.ruleList = [];
    hs.ruleListView = { refresh() {}, expandedFolders: new Set(), idCounter: 1 };
    hs.propListView = { refresh() {}, setData() {} };
    hs.addRules(text);
    hs.sheetGui = {
        activeIndex: 0, sheets: [{ name: 'Sheet', pe: [], ctx: hs.hilbertSystem.saveContext() }],
        saveCurrentSheet() { this.sheets[this.activeIndex].ctx = hs.hilbertSystem.saveContext(); },
        restoreExpanded() {}, render() {},
    };
    hs.refresh = () => {};
    const gui = Object.create(TTGui.prototype);
    gui.creative = false;
    gui.core = new Core();
    gui.core.registerSystemRules(initTypeSystem(false));
    gui.sysData = buildSysData(initTypeSystem(false));
    gui.tableData = entries.map((content, i) => ({ uuid: i + 1, name: '', content }));
    gui.sysView = { refresh() {} }; gui.tableView = { refresh() {} };
    gui.tableData.forEach(node => gui.checkAndMark(node));
    const tt = { getGui: () => gui };
    return { hs, gui, tt, engine: createMapScriptEngine(hs, tt), state: createMapScriptState() };
}
const run = (hs, text) => hs.hilbertSystem.fromCmd(text.split(';').filter(Boolean).map(s => new HSParser().parse(s, 'cmd')));
const proof = text => ({ kind: 'proof', text });
const type = text => ({ kind: 'type', text });

test('construction, static validation and empty state stay lazy with Game stubs', () => {
    const engine = createMapScriptEngine({}, {});
    engine.validate({ op: 'unlock-rule', id: '.i' });
    engine.validate(type('True'));
    engine.validateState(createMapScriptState());
    engine.restore(createMapScriptState());
});

test('staged disabled axioms isolate both proof and rule queries from live state', () => {
    const { hs, engine, state } = fixture();
    run(hs, 'd a1 P Q');
    assert.equal(engine.query(proof('P→Q→P'), state), true);
    const staged = structuredClone(state); staged.disabledAxioms = ['a1'];
    assert.equal(engine.query(proof('P→Q→P'), staged), false);
    assert.equal(engine.query({ kind: 'rule-present', id: 'a1' }, staged), false);
    assert.equal(engine.query({ kind: 'rule', text: '⊢$1→$2→$1' }, staged), false);
    assert.equal(engine.query(proof('P→Q→P'), state), true);
    assert.equal(hs.hilbertSystem.props.length, 1);
});

test('derived rule unlock closes real dependencies and refuses unearned axioms', () => {
    const { hs, engine, state } = fixture();
    state.engine.rules = ['.i'];
    engine.validateState(state);
    assert.equal(engine.query({ kind: 'rule-present', id: '.i' }, state), true);
    assert.equal(hs.hilbertSystem.rules.has('.i'), false);
    engine.restore(state);
    assert.ok(hs.hilbertSystem.rules.get('.i').step.length);
    const missing = structuredClone(state); missing.engine.rules = ['.Z+s'];
    assert.throws(() => engine.validateState(missing), /必需公理/);
    assert.throws(() => engine.restore(missing), /必需公理/);
    assert.equal(hs.hilbertSystem.rules.has('.Z+s'), false);
});

test('restoring earned map rules preserves their row identities, folders and order', () => {
    const {hs,engine,state}=fixture();state.engine.rules=['.i'];engine.restore(state);
    const index=hs.ruleList.findIndex(node=>node.name==='.i'),row=hs.ruleList.splice(index,1)[0];
    row.uuid=405;const folder={name:'My tools',uuid:404,children:[row]};hs.ruleList.unshift(folder);
    const before=structuredClone(hs.ruleList);
    engine.restore(state);engine.restore(state);
    assert.deepEqual(hs.ruleList,before);assert.equal(hs.ruleList[0],folder);assert.equal(folder.children[0],row);
    assert.equal(hs.hilbertSystem.rules.get('.i').error,undefined);
    const empty=createMapScriptState();engine.restore(empty);
    assert.deepEqual(folder.children,[],'rules actually withdrawn by a script are removed');
});

test('dynamic a/d-prefixed axiom bodies persist and ownership survives new adapters', () => {
    const { hs, tt, engine, state } = fixture();
    state.engine.axioms.aCustom = '⊢P';
    engine.restore(state);
    const serde = new Serde(hs, hs.hilbertSystem, hs.ruleList, hs.propListView, hs.ruleListView);
    const saved = serde.serialize();
    assert.match(saved.r, /aCustom:ax:⊢P/);
    assert.doesNotMatch(saved.r, /aCustom:ax:\./);
    assert.ok(saved.mapRules.includes('aCustom'));
    run(hs, 'd aCustom');
    assert.equal(engine.query(proof('P'), state), true);
    const empty = createMapScriptState();
    assert.equal(engine.query(proof('P'), empty), false);
    const reloaded = fixture();
    new Serde(reloaded.hs, reloaded.hs.hilbertSystem, reloaded.hs.ruleList, reloaded.hs.propListView, reloaded.hs.ruleListView).deserialize(saved);
    assert.deepEqual(reloaded.hs.getMapScriptRuleNames(), ['aCustom']);
    createMapScriptEngine(reloaded.hs, reloaded.tt).restore(empty);
    assert.equal(reloaded.hs.hilbertSystem.rules.has('aCustom'), false);
    hs.addRules('qUser:⊢P→P;d .i P;');
    // A user axiom is unrelated to map ownership and must survive switching saves.
    hs.addRules('qOther:ax:⊢Q;');
    createMapScriptEngine(hs, tt).restore(empty);
    assert.equal(hs.hilbertSystem.rules.has('aCustom'), false);
    assert.equal(hs.hilbertSystem.rules.has('qOther'), true);
});

test('actual browser save placeholder shape reloads mp before restoring both engines', () => {
    const { hs, gui, engine, state } = fixture();
    state.engine.rules = ['.i', 'a3']; state.engine.types = ['Bool']; state.engine.disabledTypes = ['Bool'];
    state.rewards = ['copygateD'];
    engine.restore(state);
    hs.ruleList.forEach((node, i) => { node.uuid = i + 1; });
    const saved = new Serde(hs, hs.hilbertSystem, hs.ruleList, hs.propListView, hs.ruleListView).serialize();
    // Captured Chrome save: (1)mp:ax:. followed by a1/a2 placeholders and map .i/a3.
    assert.match(saved.r, /\(1\)mp:ax:\./);
    const restored = fixture();
    new Serde(restored.hs, restored.hs.hilbertSystem, restored.hs.ruleList, restored.hs.propListView, restored.hs.ruleListView).deserialize(saved);
    assert.equal(restored.hs.hilbertSystem.rules.get('mp').error, undefined);
    assert.equal(restored.hs.hilbertSystem.rules.get('mp').toString(), hs.hilbertSystem.rules.get('mp').toString());
    restored.engine.validateState(state); restored.engine.restore(state);
    assert.ok(restored.hs.hilbertSystem.rules.get('.i').step.length);
    assert.equal(restored.gui.core.sysTypes.has('Bool'), false);
    assert.notEqual(gui.core, restored.gui.core);
    const occupied = fixture('mp:ax:⊢P;'); occupied.state.engine.rules = ['.i'];
    assert.throws(() => occupied.engine.validateState(occupied.state), /已被占用/);
    assert.equal(occupied.hs.hilbertSystem.rules.get('mp').toString(), '⊢P');
});

test('pending reward prerequisites are staged without changing live rules or taking ownership', () => {
    const { hs, engine, state } = fixture();
    state.engine.rules = ['.ne'];
    assert.throws(() => engine.validateState(state), /必需公理/);
    state.rewards = ['neg'];
    engine.validateState(state);
    assert.equal(engine.query({kind:'rule-present', id:'.ne'}, state), true);
    assert.equal(hs.hilbertSystem.rules.has('a3'), false);
    state.engine.axioms.a3 = '⊢P';
    assert.throws(() => engine.restore(state), /已被占用/);
    assert.equal(hs.hilbertSystem.rules.has('a3'), false);
    assert.equal(hs.hilbertSystem.rules.has('.ne'), false);
});

test('axiom names, schemas, assertions and trailing garbage fail static validation', () => {
    const { engine } = fixture();
    for (const [id, text] of [['cq','⊢P'], ['q','⊢P;d a1 P Q'], ['q','⊢P)'], ['q','#nf(P)⊢P']]) {
        assert.throws(() => engine.validate({ op: 'add-axiom', id, text }), undefined, id + ':' + text);
    }
    engine.validate({ op: 'add-axiom', id: 'qMap', text: '#nf($P,$x)⊢$P→∀$x:$P' });
    assert.throws(() => engine.validate(type('True)')));
});

test('rule-name uses bounded finite globs and policy rather than arbitrary regex', () => {
    const { engine, state } = fixture();
    assert.equal(engine.query({ kind: 'rule-name', pattern: '^a.*1$' }, state), true);
    state.disabledAxioms = ['a1'];
    assert.equal(engine.query({ kind: 'rule-name', pattern: '^a.*1$' }, state), false);
    assert.throws(() => engine.validate({ kind: 'rule-name', pattern: '(a+)+$' }));
});

test('TT gates accept actual closed inhabitants, including bound lambdas', () => {
    const { engine, state } = fixture(undefined, ['(true)', 'λx:True.x']);
    assert.equal(engine.query(type('True'), state), true);
    assert.equal(engine.query(type('(True)'), state), true);
    assert.equal(engine.query(type('True→True'), state), true);
    assert.equal(engine.query(type('False'), state), false);
});

test('TT explicit holes and unresolved metas never establish False, directly or via definitions', () => {
    for (const entries of [['_ : False'], ['?x : False'], ['bad := _ : False', 'bad'], ['bad := _ : False', 'indirect := bad', 'indirect']]) {
        const { engine, state } = fixture(undefined, entries);
        assert.equal(engine.query(type('False'), state), false, entries.join(';'));
    }
});

test('TT closed polymorphic user definitions and solved system aliases remain usable', () => {
    const plain = fixture(undefined, ['identity := λa:𝒰.λx:a.x', 'identity True true']);
    assert.equal(plain.engine.query(type('True'), plain.state), true);
    const equality = fixture(undefined, ['refl true']);
    equality.state.engine.types = ['eq'];
    assert.equal(equality.engine.query(type('eq true true'), equality.state), true);
});

test('builtin dependency replay respects recorded aliases and occupied canonical names', () => {
    const { hs, tt, engine, state } = fixture();
    state.engine.rules = ['.i']; engine.restore(state);
    hs.hilbertSystem.renameD('.i', 'qIdentity');
    hs.ruleList.find(n => n.name === '.i').name = 'qIdentity';
    createMapScriptEngine(hs, tt).restore(state);
    assert.ok(hs.hilbertSystem.rules.get('qIdentity').step.length);
    assert.equal(hs.hilbertSystem.rules.has('.i'), false);
    const blocked = fixture('a1:ax:⊢P;'); blocked.state.engine.rules = ['.i'];
    assert.throws(() => blocked.engine.validateState(blocked.state), /已被占用/);
});

test('TT disabling rebuilds the core and replays user definitions without stale bypasses', () => {
    const { engine, state, gui, tt } = fixture(undefined, ['mine := true', 'mine']);
    assert.equal(engine.query(type('True'), state), true);
    const table = gui.tableData, node = table[0], core = gui.core;
    const staged = structuredClone(state); staged.engine.disabledTypes = ['true'];
    assert.equal(engine.query(type('True'), staged), false);
    assert.equal(gui.core, core);
    assert.equal(engine.query(type('True'), state), true);
    engine.restore(staged);
    assert.notEqual(gui.core, core);
    assert.equal(gui.core.userDefs.has('mine'), false);
    assert.equal(gui.core.checker.hasConstantType('true'), false);
    assert.equal(gui.tableData, table); assert.equal(gui.tableData[0], node);
    createMapScriptEngine({}, tt).restore(state);
    assert.equal(engine.query(type('True'), state), true);
});

test('TT real group/symbol unlock resolves dependencies and unknown names fail', () => {
    const { engine, state, gui } = fixture();
    state.engine.types = ['Bool'];
    engine.validateState(state);
    assert.equal(engine.query({ kind: 'type-present', id: 'Bool' }, state), true);
    assert.equal(engine.query({ kind: 'type-present', id: '0b' }, state), true);
    assert.equal(gui.core.sysTypes.has('Bool'), false);
    engine.restore(state);
    assert.equal(gui.core.sysTypes.has('Bool'), true);
    assert.throws(() => engine.validate({ op: 'unlock-type', id: 'notAType' }));
});

test('validateState and restore stage both engines before any live write', () => {
    for (const reason of ['collision', 'axiom-dependency', 'tt-failure']) {
        const { hs, gui, engine, state } = fixture();
        const originalRules = [...hs.hilbertSystem.rules], originalCore = gui.core;
        state.engine.rules = ['.i']; state.engine.types = ['Bool'];
        if (reason === 'collision') state.engine.axioms.a1 = '⊢P';
        if (reason === 'axiom-dependency') state.engine.rules = ['.Z+s'];
        if (reason === 'tt-failure') state.engine.types = ['unknownTT'];
        assert.throws(() => engine.validateState(state), undefined, reason);
        assert.deepEqual([...hs.hilbertSystem.rules], originalRules);
        assert.equal(gui.core, originalCore);
        assert.throws(() => engine.restore(state), undefined, reason);
        assert.deepEqual([...hs.hilbertSystem.rules], originalRules);
        assert.equal(gui.core, originalCore);
    }
});

test('ordinary a/d named custom axioms never become builtin placeholders', () => {
    const { hs } = fixture();
    hs.addRules('a1:ax:⊢P;\ndOther:ax:⊢Q;');
    const saved = new Serde(hs, hs.hilbertSystem, hs.ruleList, hs.propListView, hs.ruleListView).serializeRulelist();
    assert.match(saved, /a1:ax:⊢P/); assert.match(saved, /dOther:ax:⊢Q/);
});
