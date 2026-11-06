// Run after the project's normal build: node test/test-editing.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
const { planDeletion, checkDeletion, deleteSelection } = await import('../js/hs/editing.js');
const { HilbertSystem } = await import('../js/hs/core/core.js');
const { HSParser } = await import('../js/hs/core/parser.js');
const { Deduction, Proposition } = await import('../js/hs/core/deduction.js');
const { AtomSolver } = await import('../js/hs/core/assert.js');
const { NodeType } = await import('../js/asttype.js');
const parser = new HSParser();
const parse = (text, kind = 'wff') => parser.parse(text, kind);
const commands = (system, text) => system.fromCmd(text.split(';').filter(Boolean).map(c => parse(c, 'cmd')));
const rule = (system, name, text) => {
    const ast = parse(text, 'rule');
    const assertions = ast.nodes.filter(n => n.type === NodeType.ASSERT).map(n => AtomSolver.fromAST(n));
    const nodes = ast.nodes.filter(n => n.type !== NodeType.ASSERT);
    const result = new Deduction(new Set(), parse(name, 'dname'), assertions, nodes.slice(0, -1), nodes.at(-1));
    system.rules.set(name, result);
    return result;
};
const fixture = () => {
    const system = new HilbertSystem();
    rule(system, 'mp', '$1→$2,$1⊢$2');
    rule(system, 'a1', '⊢$1→$2→$1');
    rule(system, 'a2', '⊢($1→$2→$3)→($1→$2)→($1→$3)');
    rule(system, 'a6', '#nf($,$x)⊢$→∀$x:$');
    rule(system, 'a7', '⊢$A=$A');
    commands(system, 'a1 $ $;a1 $ $→$;a2 $ $→$ $;mp 3 2;mp 4 1');
    system.m('identity');
    return system;
};
const sheet = system => {
    const ctx = system.saveContext();
    system.loadContext(system.createEmptyContext());
    return ctx;
};

// Record every live object's own references and collection entries. Checking a
// failed operation must detect mutation even when arrays/caches retain identity.
function unchangedAfter(...roots) {
    const saved = new Map();
    const visit = value => {
        if (value === null || typeof value !== 'object' || saved.has(value)) return;
        const entries = value instanceof Map ? [...value] : value instanceof Set ? [...value] : Object.entries(value);
        saved.set(value, entries);
        if (value instanceof Set) entries.forEach(visit);
        else for (const [key, entry] of entries) { visit(key); visit(entry); }
    };
    roots.forEach(visit);
    return () => {
        for (const [object, before] of saved) {
            const after = object instanceof Map ? [...object] : object instanceof Set ? [...object] : Object.entries(object);
            assert.equal(after.length, before.length);
            for (let i = 0; i < before.length; i++) {
                if (object instanceof Set) assert.equal(after[i], before[i]);
                else { assert.equal(after[i][0], before[i][0]); assert.equal(after[i][1], before[i][1]); }
            }
        }
    };
}
function blocked(system, plan, contexts = [], expected = () => true) {
    const unchanged = unchangedAfter(system, contexts);
    for (const operation of [checkDeletion, deleteSelection]) {
        assert.throws(() => operation(system, plan, contexts), e => {
            assert.equal(e.type, 'delFail');
            assert.ok(expected(e));
            return true;
        });
        unchanged();
    }
}
function roundTrip(system, contexts = [system.saveContext()]) {
    for (const ctx of contexts) {
        const restored = new HilbertSystem();
        restored.rules = system.rules;
        restored.renamedSysRule = new Map(system.renamedSysRule);
        const cmds = system.genCmd(ctx.props);
        commands(restored, cmds.join(';'));
        assert.deepEqual(restored.genCmd(), cmds);
    }
}

test('direct macro application blocks deletion even with empty dependence', () => {
    const system = fixture();
    commands(system, 'identity A');
    assert.equal(system.rules.get('identity').dependence.size, 0);
    blocked(system, planDeletion(system, [], ['identity']), [], e => e.item.name === 'identity' && e.rely[0].id === 1);
});

test('preserved macros block direct and transitive dependencies', () => {
    const system = fixture();
    commands(system, 'identity $'); system.m('wrapper');
    commands(system, 'wrapper $'); system.m('outer');
    blocked(system, planDeletion(system, [], ['identity']));
    blocked(system, planDeletion(system, [], ['identity', 'wrapper']), [], e => e.rely[0].name === 'outer');
    deleteSelection(system, planDeletion(system, [], ['identity', 'wrapper', 'outer']), []);
    assert.equal(system.rules.has('identity'), false);
    assert.equal(system.rules.has('outer'), false);
});

test('prefixes and combined rule arguments are scanned recursively', () => {
    for (const cmd of ['cidentity B A', 'mp(identity,#) A A']) {
        const system = fixture();
        // mp(identity,#) consumes A, whereas cidentity has no conditions.
        if (cmd.startsWith('mp')) commands(system, 'hyp A');
        commands(system, cmd.startsWith('mp') ? 'mp(identity,#) 1' : cmd);
        blocked(system, planDeletion(system, [], ['identity']));
    }
});

test('special msbt rule-template AST references block deletion', () => {
    const system = fixture();
    commands(system, 'a7 $x'); system.m('reflexive');
    commands(system, 'msbt>(reflexive) x=x 0');
    blocked(system, planDeletion(system, [], ['reflexive']));
    const plan = planDeletion(system, [system.props[0]], ['reflexive']);
    deleteSelection(system, plan, []);
    assert.equal(system.props.length, 0);
});

test('all sheets and the active sheet omitted from contexts are checked', () => {
    const system = fixture();
    commands(system, 'identity A');
    const other = sheet(system);
    blocked(system, planDeletion(system, [], ['identity']), [other]);
    commands(system, 'identity B');
    blocked(system, planDeletion(system, [], ['identity']), [other]);
    const selected = planDeletion(system, [...other.props, ...system.props], ['identity']);
    deleteSelection(system, selected, [other]);
    assert.equal(system.props.length, 0);
    assert.equal(other.props.length, 0);
    assert.equal(other.flatProps.size, 0);
});

test('cached rules with AST or meaningful dependence block deletion', () => {
    for (const source of ['step', 'dependence']) {
        const system = fixture();
        const cached = system.getD(parse('cidentity', 'dname'));
        if (source === 'dependence') { cached.step = undefined; cached.dependence.add('identity'); }
        system.rules.set('cached', cached);
        blocked(system, planDeletion(system, [], ['identity']), [], e => e.rely[0].name === 'cached');
    }
});

test('generated cached names retain dependencies without proof steps or dependence entries', () => {
    const system = fixture();
    const cached = system.getD(parse('eidentity', 'dname'));
    assert.equal(cached.step, undefined);
    assert.equal(cached.dependence.size, 0);
    system.rules.set('cached', cached);
    blocked(system, planDeletion(system, [], ['identity']), [], e => e.rely[0].name === 'cached');
});

test('generated expressions in dependence sets are scanned without registered cache entries', () => {
    const system = fixture();
    const cached = rule(system, 'cached', '⊢A');
    cached.dependence.add('mp(eidentity,#)');
    assert.equal(system.rules.has('mp(eidentity,#)'), false);
    blocked(system, planDeletion(system, [], ['identity']), [], e => e.rely[0].name === 'cached');
});

test('batch allows internal step dependencies and retains survivor identities', () => {
    const system = fixture();
    commands(system, 'hyp A;hyp A→B;mp 2 1;identity C');
    const [a, implication, b, survivor] = system.props;
    blocked(system, planDeletion(system, [a], []), [], e => e.rely[0] === b);
    const plan = planDeletion(system, [a, implication, b, a], []);
    assert.equal(plan.steps.size, 3);
    const unchanged = unchangedAfter(system);
    checkDeletion(system, plan, []); unchanged();
    deleteSelection(system, plan, []);
    assert.deepEqual(system.props, [survivor]);
    assert.equal(system.getP('1'), survivor);
    assert.equal(system.getP('-1'), survivor);
    assert.equal(system.getP('.'), survivor);
    assert.deepEqual(survivor.relyBefore, []);
    roundTrip(system);
});

test('folders expand recursively, count real named nodes, and clear active selection', () => {
    const system = fixture();
    commands(system, 'dir outer;dir inner;identity A;cd 0;identity B');
    const outer = system.props[0];
    const inner = outer.children[0];
    const survivor = system.props[1];
    system.cd(inner);
    const ctx = system.saveContext();
    const plan = planDeletion(system, [outer, inner, inner.children[0]], []);
    assert.equal(plan.steps.size, 3);
    deleteSelection(system, plan, [ctx]);
    assert.equal(system.getActiveProp(), null);
    assert.equal(ctx.activeProp, null);
    assert.equal(system.getP('outer'), undefined);
    assert.equal(system.getP('inner'), undefined);
    assert.equal(system.getP('1'), survivor);
    roundTrip(system);
});

test('preserved active folder, names, parent and reverse references survive indexing', () => {
    const system = fixture();
    commands(system, 'hyp A;identity C;dir work;identity A;identity B;mp 4 1');
    const hypothesis = system.props[0];
    const folder = system.props[2];
    const [a, b, dependent] = folder.children;
    assert.equal(dependent.from.data.conditions[0], a);
    system.cd(folder);
    deleteSelection(system, planDeletion(system, [system.props[1], b], []), []);
    assert.equal(system.getActiveProp(), folder);
    assert.equal(system.getP('work'), folder);
    assert.equal(dependent.parent, folder);
    assert.deepEqual(dependent.relyBefore, [a, hypothesis]);
    assert.deepEqual(a.relyAfter, [dependent]);
    roundTrip(system);
});

test('assertion deletion replays implicit rule and variable-scope dependencies', () => {
    const system = fixture();
    commands(system, 'hyp #nf($P,$x);a6 $P $x');
    const [assertion, dependent] = system.props;
    assert.deepEqual(dependent.relyBefore, []);
    blocked(system, planDeletion(system, [assertion], []), [], e => e.rely[0] === dependent);
    deleteSelection(system, planDeletion(system, [assertion, dependent], []), []);
    assert.equal(system.props.length, 0);
    assert.equal(system.getReplvarsInfo().item.size, 0);
    assert.equal(system.getReplvarsInfo().var.size, 0);
});

test('assertion replay handles named folders and special mcpt, mcnt and msbt steps', () => {
    const system = fixture();
    commands(system, 'hyp #nf($P,$x);dir work;mcpt A→A;mcnt ∀x:x=y {z};msbt>(mcpt) ($↔$) (A→A) 0');
    const assertion = system.props[0];
    const folder = system.props[1];
    deleteSelection(system, planDeletion(system, [assertion], []), []);
    assert.equal(system.props[0], folder);
    assert.equal(system.getActiveProp(), folder);
    roundTrip(system);
});

test('assertion failure in a later sheet leaves earlier staged sheet and macros untouched', () => {
    const system = fixture();
    commands(system, 'identity A'); const first = sheet(system);
    commands(system, 'hyp #nf($P,$x);a6 $P $x');
    blocked(system, planDeletion(system, [first.props[0], system.props[0]], ['identity']), [first]);
});

test('macro proofs own their nodes and ignore unrelated sheet object ids', () => {
    const system = fixture();
    commands(system, 'hyp A;hyp A→B;mp 2 1');
    const proof = system.props.slice();
    const saved = system.m('savedProof');
    commands(system, 'hyp X;hyp Y;hyp Z');
    const unchanged = unchangedAfter(saved);
    deleteSelection(system, planDeletion(system, [system.props[0]], []), []);
    unchanged();
    assert.equal(saved.step[0], proof[0]);
    const loaded = new HilbertSystem(); loaded.rules = system.rules;
    commands(loaded, system.genCmd(saved.step).join(';'));
    assert.equal(loaded.props.at(-1).ast.toString(), 'B');
});

test('a genuinely external macro condition blocks, but deleting both owners is allowed', () => {
    const system = fixture();
    commands(system, 'hyp A;hyp A→B;mp 2 1');
    const [a, implication, conclusion] = system.props;
    const external = rule(system, 'external', 'A,A→B⊢B');
    external.step = [conclusion];
    blocked(system, planDeletion(system, [a], []), [], e => e.rely.some(p => p.name === 'external') || e.rely[0] === conclusion);
    deleteSelection(system, planDeletion(system, [a, implication, conclusion], ['external']), []);
    assert.equal(system.rules.has('external'), false);
});

test('a preserved macro owns selected sheet objects used only inside its own proof', () => {
    const system = fixture();
    commands(system, 'hyp A;hyp A→B;mp 2 1');
    const proof = system.props.slice();
    const saved = rule(system, 'savedProof', 'A,A→B⊢B');
    saved.step = proof;
    const unchanged = unchangedAfter(saved);
    deleteSelection(system, planDeletion(system, proof, []), []);
    assert.equal(system.props.length, 0);
    unchanged();
    const restored = new HilbertSystem(); restored.rules = system.rules;
    commands(restored, system.genCmd(saved.step).join(';'));
    assert.equal(restored.props.at(-1).ast.toString(), 'B');
});

test('error macros are deletable; preserved raw commands retain rule dependencies', () => {
    const system = fixture();
    const broken = rule(system, 'broken', '⊢A');
    broken.error = { cause: 'bad saved proof', cmds: 'identity A;bad input (' };
    blocked(system, planDeletion(system, [], ['identity']), [], e => e.rely[0].name === 'broken');
    deleteSelection(system, planDeletion(system, [], ['broken', 'identity']), []);
    assert.equal(system.rules.has('broken'), false);
});

test('axioms, missing macros and foreign steps fail without mutation', () => {
    const system = fixture();
    const unchanged = unchangedAfter(system);
    for (const name of ['a1', 'missing']) assert.throws(() => planDeletion(system, [], [name]), e => e.type === 'delFail');
    blocked(system, { steps: new Set(), macros: new Set(['a1']) });
    blocked(system, planDeletion(system, [Proposition.hyp(parse('A'))], []));
    unchanged();
});

test('stale plans reject missing steps, added descendants and replaced macros', () => {
    const system = fixture();
    commands(system, 'dir work;identity A');
    const folder = system.props[0];
    const plan = planDeletion(system, [folder], []);
    commands(system, 'identity B');
    blocked(system, plan);
    const removed = planDeletion(system, [folder.children[0]], []);
    system.delP(folder.children[0]);
    blocked(system, removed);
    const replaced = planDeletion(system, [], ['identity']);
    system.rules.set('identity', Object.assign(Object.create(Deduction.prototype), system.rules.get('identity')));
    blocked(system, replaced);
});

test('confirmation interval dependencies are rechecked and stale caches are ignored', () => {
    const system = fixture();
    const plan = planDeletion(system, [], ['identity']);
    checkDeletion(system, plan, []);
    commands(system, 'identity A');
    blocked(system, plan);
    const step = system.props[0];
    const stale = planDeletion(system, [step], []);
    system.props.splice(0); // Leave flatProps deliberately stale.
    blocked(system, stale);
});

test('dependency cycles terminate and independent deletion/save replay succeeds', () => {
    const system = fixture();
    const a = rule(system, 'loopA', '⊢A'); a.step = []; a.dependence.add('loopB');
    const b = rule(system, 'loopB', '⊢A'); b.step = []; b.dependence.add('loopA');
    commands(system, 'identity A');
    deleteSelection(system, planDeletion(system, [], ['loopA', 'loopB']), []);
    roundTrip(system);
});
