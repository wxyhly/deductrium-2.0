import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { AtomSolver } from '../js/hs/core/assert.js';
import { HSError } from '../js/hs/core/error.js';
import { ExecutionEngine, defineCommand } from '../js/hs/gui/cmdmgr.js';
import { initialCreativeRules } from '../js/hs/core/initial.js';

// Exercise the generated production modules; the main task owns compilation.
const navigationModule = import('../js/hs/proof-navigation.js').catch(error => ({ error }));
const parser = new HSParser();
const ast = (text, type = 'wff') => parser.parse(text, type);
const run = (system, commands) => system.fromCmd(commands.split(';').filter(Boolean).map(text => ast(text, 'cmd')));
const last = system => system.getLastChildP(null);

function fixture() {
    const system = new HilbertSystem();
    const add = (name, formula, commands) => {
        const parsed = ast(formula, 'rule');
        const assertions = parsed.nodes.filter(node => node.type === NodeType.ASSERT).map(node => AtomSolver.fromAST(node));
        const nodes = parsed.nodes.filter(node => node.type !== NodeType.ASSERT);
        const conclusion = nodes.pop();
        const rule = new Deduction(new Set(), new AST(NodeType.ATOM_DNAME, name), assertions, nodes, conclusion);
        system.rules.set(name, rule);
        if (commands) {
            run(system, commands);
            rule.step = system.props.slice();
            system.clear();
        }
        return rule;
    };
    add('mp', '$1→$2,$1⊢$2');
    add('a1', '⊢$1→$2→$1');
    add('a2', '⊢($1→$2→$3)→($1→$2)→($1→$3)');
    add('a6', '#nf($,$x)⊢$→∀$x:$');
    add('.i', '⊢$→$', 'a1 $ $;a1 $ $→$;a2 $ $→$ $;mp 3 2;mp 4 1');
    add('inner', '⊢$→$', '.i $');
    add('outer', '⊢$→$', 'inner $');
    add('link', '$1→$2,$2→$3⊢$1→$3', 'hyp $1→$2;hyp $2→$3;cond $1;mp 1 3;mp 2 4');
    return { system, add };
}

async function navigatorFor(system) {
    const module = await navigationModule;
    if (module.error) throw module.error;
    let refreshes = 0;
    const navigator = new module.ProofNavigator(system, () => refreshes++);
    return { navigator, refreshes: () => refreshes };
}

function sameContext(system, context) {
    const restored = system.saveContext();
    for (const key of Object.keys(context)) assert.strictEqual(restored[key], context[key], key);
}

function rememberRules(system) {
    const map = system.rules;
    const entries = [...map].map(([name, rule]) => ({
        name, rule, step: rule.step, commands: rule.step && system.genCmd(rule.step), formula: rule.toString(),
    }));
    return () => {
        assert.strictEqual(system.rules, map);
        assert.equal(map.size, entries.length);
        for (const entry of entries) {
            assert.strictEqual(map.get(entry.name), entry.rule);
            assert.strictEqual(entry.rule.step, entry.step);
            assert.equal(entry.rule.toString(), entry.formula);
            if (entry.step) assert.deepEqual(system.genCmd(entry.step), entry.commands);
        }
    };
}

test('nested rule and step browsing restores exact contexts and active folders', async () => {
    const { system } = fixture();
    run(system, 'hyp A;dir workspace;cond B;outer C');
    const root = system.saveContext();
    const originalCommands = system.genCmd();
    const unchanged = rememberRules(system);
    const { navigator, refreshes } = await navigatorFor(system);
    assert.equal(navigator.rootContext, undefined);
    assert.equal(navigator.parentContext, undefined);
    assert.equal(navigator.back(), false);
    navigator.enterRule(ast('outer', 'dname'));
    assert.equal(navigator.depth, 1);
    assert.strictEqual(navigator.rootContext.props, root.props);
    assert.strictEqual(navigator.parentContext.props, root.props);
    const outer = system.saveContext();
    navigator.enterStep(last(system));
    assert.equal(navigator.depth, 2);
    assert.strictEqual(navigator.rootContext.props, root.props);
    assert.strictEqual(navigator.parentContext.props, outer.props);
    assert.equal(last(system).from.data.deduction.toString(), '.i');
    navigator.enterStep(last(system));
    assert.equal(navigator.depth, 3);
    assert.equal(system.props.length, 5);
    assert.equal(navigator.back(), true);
    assert.equal(navigator.back(), true);
    sameContext(system, outer);
    assert.equal(navigator.back(), false);
    sameContext(system, root);
    assert.equal(root.activeProp.active, true);
    assert.deepEqual(system.genCmd(), originalCommands);
    assert.equal(navigator.active, false);
    assert.equal(navigator.rootContext, undefined);
    assert.equal(refreshes(), 6);
    unchanged();
});

test('close restores the original table in one refresh and is idempotent', async () => {
    const { system } = fixture();
    run(system, 'dir workspace;outer A');
    const root = system.saveContext();
    const { navigator, refreshes } = await navigatorFor(system);
    navigator.enterRule(ast('outer', 'dname'));
    navigator.enterRule(ast('inner', 'dname'));
    navigator.close();
    sameContext(system, root);
    assert.equal(navigator.depth, 0);
    assert.equal(refreshes(), 3);
    navigator.close();
    assert.equal(refreshes(), 3);
});

test('step inspection shows instantiated premises and proof, with unrelated steps excluded', async () => {
    const { system } = fixture();
    run(system, 'hyp A→B;hyp B→C;outer Z;link 1 2');
    const root = system.saveContext();
    const target = last(system);
    const unchanged = rememberRules(system);
    const { navigator } = await navigatorFor(system);
    navigator.enterStep(target);
    assert.deepEqual(system.props.slice(0, 2).map(prop => prop.ast.toString()), ['A→B', 'B→C']);
    assert.equal(last(system).ast.toString(), 'C');
    assert.equal(system.ref_addCaptureScopeToAST(last(system).ast, system.captureScope(null, last(system))).toString(), 'A→C');
    assert.ok(!system.genCmd().join(';').includes('Z'));
    assert.ok(system.props.every(prop => !root.props.includes(prop)));
    navigator.close();
    sameContext(system, root);
    assert.equal(target.ast.toString(), 'A→C');
    unchanged();
});

test('captured folder premises retain their meaning in an isolated step proof', async () => {
    const { system } = fixture();
    run(system, 'cond A;inner B;pop;inner C');
    // <a1 accepts a premise captured out of the cond folder; its generated proof is inspectable.
    const source = system.getP('2');
    const rule = system.getD(ast('<a1', 'dname'));
    const target = system.d(rule, [source], { [rule.replaceNames[0][0]]: ast('D') });
    const root = system.saveContext();
    const { navigator } = await navigatorFor(system);
    navigator.enterStep(target);
    assert.ok(system.props[0].ast.equal(ast('A→(B→B)')));
    assert.ok(last(system).ast.equal(target.ast));
    navigator.close();
    sameContext(system, root);
});

test('atomic, missing, malformed and failed replay entries preserve context and depth', async () => {
    const { system, add } = fixture();
    const broken = add('broken', '⊢$→$', 'inner $');
    broken.step[0].from.data.deduction = ast('missing', 'dname');
    const errored = add('errored', '⊢$→$', 'inner $');
    errored.error = { cause: HSError.noConclusion, cmds: 'bad' };
    run(system, 'hyp A;dir workspace;a1 A B');
    const root = system.saveContext();
    const { navigator, refreshes } = await navigatorFor(system);
    for (const name of ['a1', 'missing', 'broken', 'errored']) {
        assert.throws(() => navigator.enterRule(ast(name, 'dname')));
        sameContext(system, root);
        assert.equal(navigator.depth, 0);
    }
    assert.throws(() => navigator.enterStep(last(system)), error => error.type === 'atomicStep');
    assert.throws(() => navigator.enterStep(system.getP('1')));
    const { system: foreign } = fixture();
    run(foreign, 'inner A');
    assert.throws(() => navigator.enterStep(last(foreign)));
    sameContext(system, root);
    assert.equal(refreshes(), 0);
    navigator.enterRule(ast('outer', 'dname'));
    const nested = system.saveContext();
    assert.throws(() => navigator.enterRule(ast('a1', 'dname')));
    sameContext(system, nested);
    assert.equal(navigator.depth, 1);
    navigator.close();
    sameContext(system, root);
});

test('preview objects and lazy/generated rule proofs never share stored macro objects', async () => {
    const { system } = fixture();
    const unchanged = rememberRules(system);
    const { navigator } = await navigatorFor(system);
    for (const name of ['link', 'c:inner', 'v:inner', 'mp(a1,#)']) {
        navigator.enterRule(ast(name, 'dname'));
        const preview = last(system);
        preview.ast.name = 'modified preview';
        navigator.close();
        unchanged();
    }
    navigator.enterRule(ast('outer', 'dname'));
    last(system).from.data.deduction.name = 'changed';
    navigator.close();
    unchanged();
});

test('lazy mcpt step inspection uses existing expansion and preserves the source', async () => {
    const { system, add } = fixture();
    for (const raw of initialCreativeRules.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('{') || line.startsWith('}') || line.startsWith('//')) continue;
        const colon = line.indexOf(':');
        const name = line.slice(0, colon);
        const rest = line.slice(colon + 1);
        const semicolon = rest.indexOf(';');
        const formula = rest.startsWith('ax:') ? rest.slice(3, semicolon) : rest.slice(0, semicolon);
        const conditions = ast(formula, 'rule').nodes.filter(node => node.type !== NodeType.ASSERT).slice(0, -1);
        try {
            add(name, formula, rest.startsWith('ax:') ? undefined
                : [...conditions.map(condition => `hyp ${condition}`), rest.slice(semicolon + 1)].join(';'));
        } catch (cause) { throw new Error(`Initial rule ${name} failed`, { cause }); }
        if (name === '.m2') break;
    }
    const step = system.mcpt(ast('A→A'));
    const root = system.saveContext();
    const unchanged = rememberRules(system);
    const { navigator } = await navigatorFor(system);
    navigator.enterStep(step);
    assert.equal(last(system).ast.toString(), 'A→A');
    assert.ok(system.props.length > 1);
    navigator.close();
    sameContext(system, root);
    assert.equal(step.from.data.deduction.name, 'mcpt');
    unchanged();
});

function engineFixture() {
    const engine = new ExecutionEngine();
    const events = [];
    let text = '';
    engine.ui = {
        setClearState: () => events.push(['clear']),
        showPrompt: (prompt, value) => events.push(['prompt', prompt, value]),
        showError: error => events.push(['error', error]),
        clearError: () => events.push(['clearError']),
        setInputText: value => { text = value; events.push(['text', value]); },
    };
    return { engine, events, text: () => text };
}
const param = {
    default: '', prompt: 'target',
    parse: input => ({ success: true, value: ast(input) }),
};

test('ordinary parameter Esc still undoes one argument, clears error, then cancels', () => {
    defineCommand('entr', args => args.length < 2 ? param : null, () => {});
    const { engine, events, text } = engineFixture();
    engine.run('entr A');
    engine.reportError(HSError.noConclusion);
    engine.handleEsc();
    assert.equal(engine.isExecuting(), true);
    assert.equal(text(), '');
    assert.deepEqual(events.at(-1), ['clearError']);
    engine.handleEsc();
    assert.equal(text(), 'A');
    assert.equal(engine.isExecuting(), true);
    engine.handleEsc();
    assert.equal(engine.isExecuting(), false);
    assert.equal(text(), 'entr A');
});

test('custom nested Esc keeps history and final false cancels even with collected args', () => {
    const { engine, events, text } = engineFixture();
    let level = 3;
    let history;
    defineCommand('entr', args => { history = args; return param; }, () => {}, {
        onEscape: () => --level > 0,
    });
    engine.run('entr A');
    engine.run('B');
    engine.reportError(HSError.noConclusion);
    engine.handleEsc();
    assert.equal(engine.isExecuting(), true);
    assert.equal(history.length, 2);
    assert.deepEqual(events.at(-1), ['clearError']);
    engine.handleEsc();
    assert.equal(engine.isExecuting(), true);
    assert.equal(history.length, 2);
    engine.handleEsc();
    assert.equal(engine.isExecuting(), false);
    assert.equal(text(), 'entr A');
});

test('idle Esc supports completed entr commands and nested navigation', async () => {
    const { system } = fixture();
    run(system, 'dir workspace;outer A');
    const root = system.saveContext();
    const { navigator } = await navigatorFor(system);
    const { engine, events } = engineFixture();
    defineCommand('entr', args => args.length ? null : param, args => navigator.enterRule(ast(args[0].name, 'dname')));
    engine.onIdleEscape = () => navigator.back();
    engine.run('entr outer');
    engine.run('entr inner');
    assert.equal(engine.isExecuting(), false);
    assert.equal(navigator.depth, 2, JSON.stringify(events));
    engine.handleEsc();
    assert.equal(navigator.depth, 1);
    engine.handleEsc();
    sameContext(system, root);
    engine.handleEsc();
    assert.equal(navigator.active, false);
});

test('beforeCommand guards run before resolving arguments and guard failures are reported', () => {
    let resolved = 0;
    let executed = 0;
    defineCommand('entr', () => { resolved++; return null; }, () => { executed++; });
    const { engine, events } = engineFixture();
    const calls = [];
    engine.beforeCommand = name => { calls.push(name); throw HSError.cmdIsRunning; };
    assert.doesNotThrow(() => engine.run('entr'));
    assert.deepEqual(calls, ['entr']);
    assert.equal(resolved, 0);
    assert.equal(executed, 0);
    assert.deepEqual(events.at(-1), ['error', HSError.cmdIsRunning]);
});

test('interactive getNextParam and parser exceptions go through reportError', () => {
    const { engine, events } = engineFixture();
    defineCommand('entr', args => {
        if (args.length) throw HSError.cmdIsRunning;
        return param;
    }, () => {});
    engine.run('entr');
    assert.doesNotThrow(() => engine.run('A'));
    assert.deepEqual(events.at(-1), ['error', HSError.cmdIsRunning]);
    defineCommand('entr', () => ({ ...param, parse: () => { throw HSError.noConclusion; } }), () => {});
    const other = engineFixture();
    other.engine.run('entr');
    assert.doesNotThrow(() => other.engine.run('A'));
    assert.deepEqual(other.events.at(-1), ['error', HSError.noConclusion]);
});

test('input transformation runs only before new commands and its errors are reported', () => {
    const { engine, events } = engineFixture();
    const transformed = [];
    const executed = [];
    defineCommand('entr', args => args.length < 2 ? param : null, args => executed.push(...args));
    engine.transformInput = input => { transformed.push(input); return `entr ${input}`; };
    engine.run('outer');
    assert.equal(engine.isExecuting(), true);
    engine.run('A');
    assert.equal(engine.isExecuting(), false);
    assert.deepEqual(transformed, ['outer']);
    assert.deepEqual(executed.map(value => value.name), ['outer', 'A']);
    engine.transformInput = () => { throw HSError.noConclusion; };
    assert.doesNotThrow(() => engine.run('inner'));
    assert.deepEqual(events.at(-1), ['error', HSError.noConclusion]);
});
