// Exercise the shipped planner; build JavaScript with the project's normal build first.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMapScriptState, planMapScript } from '../js/hy/script.js';

const state = input => createMapScriptState(input);
const environment = extra => ({
    money: 20, typeMoney: 4, rewards: new Set(),
    hasTile: () => true, hasAxiom: id => id === 'a1',
    engine: {
        validate(request) { if (request.text === 'bad') throw Error('Invalid axiom body'); },
        query() { return false; },
    },
    ...extra,
});
const plan = (source, input = state(), extra = {}, checksOnly = false) =>
    planMapScript(source, input, environment(extra), checksOnly);
const unchanged = (result, input) => {
    assert.deepEqual(result.state, input);
    assert.deepEqual(result.effects, []);
    assert.deepEqual(result.attemptEffects, []);
    assert.equal(result.money, 20);
    assert.equal(result.typeMoney, 4);
    assert.equal(result.spent, 0);
    assert.equal(result.typeSpent, 0);
};

test('adding an axiom then enabling it in the same flat script succeeds', () => {
    const input = state();
    const result = plan('add axiom sorry "⊢$p"\nenable axiom sorry\nrequire axiom sorry', input);
    assert.equal(result.status, 'pass');
    assert.deepEqual(result.state.engine.axioms, {sorry: '⊢$p'});
    assert.deepEqual(result.state.disabledAxioms, []);
    assert.deepEqual(result.effects, [{op: 'engine', edit: {op: 'add-axiom', id: 'sorry', text: '⊢$p'}}]);
    assert.deepEqual(input, state());
});

test('add enables new axioms by default and preserves an existing disabled policy', () => {
    assert.equal(plan('add axiom sorry "⊢$p"; require axiom sorry').status, 'pass');
    const input = state({disabledAxioms: ['sorry']});
    const disabled = plan('add axiom sorry "⊢$p"; require not-axiom sorry', input);
    assert.equal(disabled.status, 'pass');
    assert.deepEqual(disabled.state.disabledAxioms, ['sorry']);
    assert.equal(plan('add axiom sorry "⊢$p"; enable axiom sorry; require axiom sorry', input).status, 'pass');
});

test('selected branches see staged disable and re-enable in predicates', () => {
    const result = plan(`add axiom sorry "⊢$p"
disable axiom sorry
require not-axiom sorry
if axiom sorry
  block
elif not-axiom sorry
  enable axiom sorry
end
require axiom sorry`);
    assert.equal(result.status, 'pass');
    assert.deepEqual(result.state.disabledAxioms, []);
});

test('remove hides a newly added axiom and a live incoming custom axiom', () => {
    assert.equal(plan('add axiom sorry "⊢$p"; remove axiom sorry; require not-axiom sorry').status, 'pass');
    const input = state({engine: {axioms: {sorry: '⊢$p'}}});
    const result = plan('remove axiom sorry; require not-axiom sorry', input, {hasAxiom: () => true});
    assert.equal(result.status, 'pass');
    assert.deepEqual(result.state.engine.axioms, {});
    assert.deepEqual(input.engine.axioms, {sorry: '⊢$p'});
});

test('enable and disable after removal fail without mutating incoming state', () => {
    for (const op of ['enable', 'disable']) {
        for (const input of [state(), state({engine: {axioms: {sorry: '⊢$p'}}})]) {
            const before = structuredClone(input);
            const live = Object.hasOwn(input.engine.axioms, 'sorry');
            assert.throws(() => plan(`give money 3\nadd axiom sorry "⊢$p"\nremove axiom sorry\n${op} axiom sorry`, input,
                {hasAxiom: id => id === 'sorry' && live}), /line 4: Unknown axiom: sorry/);
            assert.deepEqual(input, before);
        }
    }
});

test('declarations in false branches and later statements do not create runtime axioms', () => {
    for (const source of [
        'if key absent\nadd axiom sorry "⊢$p"\nend\nenable axiom sorry',
        'enable axiom sorry\nadd axiom sorry "⊢$p"',
        'if not-key absent\nenable axiom sorry\nelse\nadd axiom sorry "⊢$p"\nend',
    ]) {
        const input = state(), before = structuredClone(input);
        assert.throws(() => plan(source, input), /Unknown axiom: sorry/);
        assert.deepEqual(input, before);
    }
    assert.equal(plan('if key absent; add axiom sorry "⊢$p"; end; require not-axiom sorry').status, 'pass');
    assert.equal(plan('if key absent; add axiom sorry "⊢$p"; end; require axiom sorry').status, 'blocked');
});

test('incoming custom axioms work without a live adapter registration', () => {
    const input = state({engine: {axioms: {sorry: '⊢$p'}}, disabledAxioms: ['sorry']});
    const result = plan('require not-axiom sorry; enable axiom sorry; require axiom sorry; disable axiom sorry; require not-axiom sorry', input,
        {hasAxiom: () => false});
    assert.equal(result.status, 'pass');
    assert.deepEqual(result.state.disabledAxioms, ['sorry']);
});

test('builtins retain live environment lookup and disable policy', () => {
    const result = plan('require axiom a1; disable axiom a1; require not-axiom a1; enable axiom a1; require axiom a1');
    assert.equal(result.status, 'pass');
    assert.deepEqual(result.state.disabledAxioms, []);
});

test('whole-tree preflight still rejects undeclared references in inactive code', () => {
    for (const source of [
        'if key absent; enable axiom missing; end',
        'if not-key absent; allow; else; disable axiom missing; end',
        'allow; enable axiom missing',
        'on touch; allow; end; on pass; disable axiom missing; end',
    ]) assert.throws(() => plan(source, state(), {event: 'touch'}), /Unknown axiom: missing/);
    assert.throws(() => plan('on touch; allow; end; on pass; add axiom sorry "bad"; enable axiom sorry; end', state(), {event: 'touch'}), /Invalid axiom body/);
});

test('cross-handler declarations validate statically but become available only after commit', () => {
    const source = 'on touch; add axiom sorry "⊢$p"; end; on pass; enable axiom sorry; require axiom sorry; end';
    const input = state();
    assert.throws(() => plan(source, input, {event: 'pass'}), /Unknown axiom: sorry/);
    const touch = plan(source, input, {event: 'touch'});
    assert.equal(touch.status, 'pass');
    const pass = plan(source, touch.state, {event: 'pass'});
    assert.equal(pass.status, 'pass');
    const unmatched = plan(source, input, {event: 'collect'});
    assert.equal(unmatched.handled, false);
    unchanged(unmatched, input);
});

test('blocked requirements roll back staged axiom and money edits', () => {
    const input = state({engine: {axioms: {existing: '⊢Q'}}});
    const result = plan('give money 3; add axiom sorry "⊢$p"; disable axiom sorry; remove axiom existing; require axiom sorry', input);
    assert.equal(result.status, 'blocked');
    unchanged(result, input);
});

test('checksOnly and completed handlers inspect incoming axioms without staging edits', () => {
    const source = 'add axiom sorry "⊢$p"; enable axiom sorry; require axiom sorry';
    for (const completed of [false, true]) {
        const input = state();
        const result = plan(source, input, {completed}, !completed);
        assert.equal(result.status, 'blocked');
        unchanged(result, input);
    }
    const input = state({engine: {axioms: {sorry: '⊢$p'}}});
    const result = plan('remove axiom sorry; disable axiom sorry; require axiom sorry', input, {hasAxiom: () => false}, true);
    assert.equal(result.status, 'pass');
    unchanged(result, input);
});

test('staged axiom membership handles prototype property names safely', () => {
    for (const id of ['__proto__', 'constructor', 'toString']) {
        const result = plan(`add axiom ${id} "⊢$p"; enable axiom ${id}; require axiom ${id}; remove axiom ${id}; require not-axiom ${id}`,
            state(), {hasAxiom: () => false});
        assert.equal(result.status, 'pass');
        assert.deepEqual(result.state.engine.axioms, {});
        assert.equal(Object.getPrototypeOf(result.state.engine.axioms), Object.prototype);
    }
});

test('real HS adapter keeps live ownership until commit while planner observes staged removal', async () => {
    const { createMapScriptEngine } = await import('../js/hy/script-engine.js');
    const { HSLayer } = await import('../js/hs/main.js');
    const { HilbertSystem } = await import('../js/hs/core/core.js');
    const { initialSurvivalRules } = await import('../js/hs/core/initial.js');
    const hs = Object.create(HSLayer.prototype);
    hs.hilbertSystem = new HilbertSystem();
    hs.ruleList = [];
    hs.ruleListView = {refresh() {}, expandedFolders: new Set(), idCounter: 1};
    hs.propListView = {refresh() {}, setData() {}};
    hs.addRules(initialSurvivalRules);
    hs.sheetGui = {
        activeIndex: 0, sheets: [{name: 'Sheet', pe: [], ctx: hs.hilbertSystem.saveContext()}],
        saveCurrentSheet() { this.sheets[this.activeIndex].ctx = hs.hilbertSystem.saveContext(); },
        restoreExpanded() {}, render() {},
    };
    hs.refresh = () => {};
    const engine = createMapScriptEngine(hs, {});
    const extra = {engine, hasAxiom: id => hs.hasMapAxiom(id)};
    assert.equal(hs.hasMapAxiom('sorry'), false);
    const added = plan('add axiom sorry "⊢$p"; enable axiom sorry; require axiom sorry; require rule-present sorry', state(), extra);
    assert.equal(added.status, 'pass');
    assert.equal(hs.hasMapAxiom('sorry'), false);
    engine.validateState(added.state);
    engine.restore(added.state);
    assert.equal(hs.hasMapAxiom('sorry'), true);

    const disabled = plan('disable axiom sorry; require not-axiom sorry', added.state, extra);
    assert.equal(disabled.status, 'pass');
    engine.restore(disabled.state);
    assert.equal(hs.hasMapAxiom('sorry'), true);
    const enabled = plan('enable axiom sorry; require axiom sorry', disabled.state, extra);
    assert.equal(enabled.status, 'pass');
    engine.restore(enabled.state);
    const removed = plan('remove axiom sorry; require not-axiom sorry; if axiom sorry; block; end', enabled.state, extra);
    assert.equal(removed.status, 'pass');
    assert.equal(hs.hasMapAxiom('sorry'), true);
    assert.throws(() => plan('remove axiom sorry; enable axiom sorry', enabled.state, extra), /Unknown axiom: sorry/);
    assert.equal(hs.hasMapAxiom('sorry'), true);
    engine.validateState(removed.state);
    engine.restore(removed.state);
    assert.equal(hs.hasMapAxiom('sorry'), false);
});
