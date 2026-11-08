// Run against the parent's compiled production modules: node --test test/test-intuitionistic-mod.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {makeProject, publishExample, IPC_RULES, ALLOWED_TAGS, SOLUTIONS, REGION, ENTRY} from '../examples/intuitionistic-propositional.mjs';
import {EditorProject} from '../tools/map-editor/model.mjs';
import {projectFromWorld} from '../tools/map-editor/publish.mjs';
import {regionContains} from '../tools/map-editor/geometry.mjs';
import {Polygon} from '../js/hy/tiling.js';
import {blockMap, nameMap, initMap} from '../js/hy/maploader.js';
import {parseWorld, validateWorldBase, worldRuntimeTiles, worldTileId} from '../js/hy/world.js';
import {parseMapScript, formatMapScript, planMapScript, createMapScriptState} from '../js/hy/script.js';
import {createMapScriptEngine} from '../js/hy/script-engine.js';
import {HSLayer} from '../js/hs/main.js';
import {HilbertSystem} from '../js/hs/core/core.js';
import {HSParser} from '../js/hs/core/parser.js';
import {initialSurvivalRules, initialCreativeRules} from '../js/hs/core/initial.js';
import {intuitionisticRules} from '../js/hs/core/intuitionistic.js';
import {ruleProvenance, permitsProvenance} from '../js/hs/provenance.js';
import {NodeType} from '../js/asttype.js';
import {LangMgr} from '../js/lang.js';

LangMgr.lang = 'zh';
const json = async suffix => JSON.parse(await readFile(new URL(`../examples/intuitionistic-propositional.${suffix}.json`, import.meta.url), 'utf8'));
const project = await json('map-project');
const world = await json('world');
const polygon = new Polygon(6, 4);
const parser = new HSParser();
const formula = (text, kind = 'wff') => parser.parse(text, kind);
const sid = id => worldTileId(world.id, id);
const runtime = worldRuntimeTiles(world);
const runtimeById = new Map(runtime.map(([hash, tile]) => [tile.name, {hash, ...tile}]));
const silent = action => { const old = console.log; try {console.log = () => {}; return action();} finally {console.log = old;} };
const walk = (commands, visit) => {
    for (const command of commands) {
        visit(command);
        if (command.op === 'on') walk(command.body, visit);
        if (command.op === 'if') {
            command.branches.forEach(branch => walk(branch.body, visit));
            if (command.elseBody) walk(command.elseBody, visit);
        }
    }
};

function fixture(creative = false) {
    const hs = Object.create(HSLayer.prototype);
    hs.hilbertSystem = new HilbertSystem();
    hs.ruleList = [];
    hs.ruleListView = {refresh() {}, expandedFolders:new Set(), idCounter:1};
    hs.propListView = {refresh() {}, setData() {}};
    hs.addRules(creative ? initialCreativeRules : initialSurvivalRules);
    if (!creative) hs.addRules(initialCreativeRules.split('\n').find(line => line.trim().startsWith('.i:')));
    hs.sheetGui = {
        activeIndex:0, sheets:[{name:'IPC', pe:[], ctx:hs.hilbertSystem.saveContext()}],
        saveCurrentSheet() { this.sheets[0].ctx = hs.hilbertSystem.saveContext(); },
        restoreExpanded() {}, render() {},
    };
    hs.refresh = () => {};
    const engine = createMapScriptEngine(hs, {});
    const state = createMapScriptState();
    state.engine.rules = [...IPC_RULES, '.i'];
    engine.restore(state);
    return {hs, engine, state};
}

function run(hs, commands) {
    for (const command of commands) {
        try { hs.hilbertSystem.fromCmd([formula(command, 'cmd')]); }
        catch (cause) { throw new Error(`Proof command failed: ${command}`, {cause}); }
    }
}

function environment(engine, selfId, event, rewards = []) {
    return {
        money:0, typeMoney:0, rewards:new Set(rewards), event, selfId,
        hasTile:id => runtimeById.has(id),
        getTileType:id => runtimeById.get(id)?.type,
        hasAxiom:() => false, hasLayer:id => id === 'D-layer', engine,
    };
}

test('checked-in editor project and runtime JSON are exact actual publications of the generator', () => {
    assert.deepEqual(project, makeProject());
    assert.deepEqual(world, publishExample(project));
    assert.equal(world.format, 'deductrium-world-v2');
    assert.equal(world.mode, 'extension');
    assert.ok(world.tiles.length >= 12 && world.tiles.length <= 20);
    assert.equal(world.tiles.length, 18);
    const imported = projectFromWorld(world, polygon);
    assert.deepEqual(publishExample(imported.toJSON()), world);
    assert.deepEqual(EditorProject.fromJSON(project, polygon).toJSON(), project);
});

test('the portable manifest keeps stable script identities for user installation', async () => {
    const published = JSON.parse(await readFile(new URL('../examples/intuitionistic-propositional.world.json', import.meta.url), 'utf8'));
    assert.deepEqual(published, world);
    assert.deepEqual(worldRuntimeTiles(parseWorld(published)), runtime);
    assert.equal(runtimeById.get(sid('entry')).hash, '2,2,4,3,1,2,3,1,3,1');
    assert.ok(runtimeById.has('mod:intuitionistic-propositional::toolkit'));
});

test('all six vertices satisfy the exact plane, the full real official base is preserved, and entry is adjacent', () => {
    const previousTiles = new Map(blockMap), previousNames = new Map(nameMap);
    try {
        silent(() => initMap(polygon));
        const official = new Map(blockMap);
        assert.ok(official.size >= 2000, 'validate the complete official map, not a small mock');
        assert.equal(official.get('')?.type, 0, 'official origin remains a walkable fresh-game spawn');
        assert.equal(official.get('1')?.type, 0);
        const before = structuredClone([...blockMap]);
        const names = structuredClone([...nameMap]);
        validateWorldBase(parseWorld(world), official);
        assert.deepEqual(world.region, REGION);
        assert.deepEqual(world.entry, ENTRY);
        const entry = world.tiles.find(tile => tile.id === ENTRY.tileId);
        assert.equal(entry.hash, polygon.getNeighborAndDir(ENTRY.mainHash.split(',').map(Number), ENTRY.edge, true)[0].join(','));
        assert.equal(entry.hash, '2,2,4,3,1,2,3,1,3,1');
        assert.equal(nameMap.get('aa'), '2,2,4');
        assert.equal(nameMap.get('neg'), '2,2,4,3,1,2');
        const gateHash = '2,2,4,3,1,2,3,1';
        const gate = official.get(gateHash);
        assert.equal(gate.type, 2, 'the original gate must remain intact in a fresh map');
        assert.equal(gate.text, '$0→($0→$1)⊢$0→$1');
        assert.equal(gate.data.d, true);
        const neighbor = edge => polygon.getNeighborAndDir(gateHash.split(',').map(Number), edge, true)[0].join(',');
        assert.equal(neighbor(2), ENTRY.mainHash);
        assert.equal(official.get(ENTRY.mainHash)?.type, 3, 'attach via the existing reward beside the requested lower gate');
        assert.equal(official.get(ENTRY.mainHash)?.data.getD, 4);
        const toolkit = world.tiles.find(tile => tile.id === 'toolkit');
        assert.equal(toolkit.hash, neighbor(3), 'the toolkit sits directly outside the requested gate on its empty edge 3');
        assert.equal(toolkit.hash, '2,2,4,3,1,2,3,1,3');
        assert.equal(polygon.getNeighborAndDir(entry.hash.split(',').map(Number), 0, true)[0].join(','), toolkit.hash);
        assert.equal(world.spawn.rotation, 2, 'camera orientation follows the rigid relocation');
        for (const tile of world.tiles) {
            assert.equal(regionContains(tile.hash, REGION, polygon), true, tile.id);
            assert.equal(official.has(tile.hash), false, tile.id);
        }
        for (const hash of official.keys()) assert.equal(regionContains(hash, {...REGION, side:1}, polygon), true, hash);
        assert.deepEqual(publishExample(project), world);
        assert.deepEqual([...blockMap], before);
        assert.deepEqual([...nameMap], names);
        assert.equal(world.spawn.tileId, 'entry', 'local spawn metadata stays valid without replacing the extension-mode official start');
    } finally {
        blockMap.clear(); previousTiles.forEach((tile, hash) => blockMap.set(hash, tile));
        nameMap.clear(); previousNames.forEach((hash, name) => nameMap.set(name, hash));
    }
});

test('the eighteen cells form one connected corridor and every tutorial gate is unavoidable', () => {
    const byHash = new Map(world.tiles.map(tile => [tile.hash, tile]));
    const adjacency = new Map(world.tiles.map(tile => [tile.id, []]));
    for (const tile of world.tiles) for (let edge = 0; edge < 6; edge++) {
        const hash = polygon.getNeighborAndDir(tile.hash.split(',').map(Number), edge, true)[0].join(',');
        if (byHash.has(hash)) adjacency.get(tile.id).push(byHash.get(hash).id);
    }
    const reachable = removed => {
        const seen = new Set(['entry']), pending = ['entry'];
        for (const id of pending) for (const next of adjacency.get(id)) {
            if (next !== removed && !seen.has(next)) {seen.add(next); pending.push(next);}
        }
        return seen;
    };
    assert.equal(reachable().size, 18);
    assert.ok([...adjacency.values()].every(neighbors => neighbors.length <= 2));
    for (const goal of SOLUTIONS) assert.equal(reachable(goal.id).has('completed'), false, goal.id);
    for (const id of ['excluded-middle', 'double-negation-elimination', 'peirce']) {
        assert.equal(byHash.get(world.tiles.find(tile => tile.id === id).hash).type, 0);
        assert.equal(reachable(id).has('completed'), true, `${id} is an optional exhibit, not an impossible door`);
    }
});

test('native #pi/#di gates have complete string formulas, genuine logical ASTs and exact script source policies', () => {
    assert.ok(world.tiles.every(tile => typeof tile.text === 'string'));
    assert.equal(world.tiles.filter(tile => tile.type === 2).length, SOLUTIONS.length);
    for (const goal of SOLUTIONS) {
        const tile = world.tiles.find(tile => tile.id === goal.id);
        assert.equal(tile.data[goal.kind === 'proof' ? 'pi' : 'di'], true);
        assert.equal(tile.text, goal.target);
        const ast = formula(tile.text, goal.kind === 'proof' ? 'wff' : 'rule');
        assert.equal(ast.end, tile.text.length);
        const visit = node => {
            assert.ok([NodeType.ATOM_WFF, NodeType.LOGIC, NodeType.RULE].includes(node.type), node.toString());
            node.nodes.forEach(visit);
        };
        visit(ast);
        const nodes = parseMapScript(tile.data.script), requires = [], remembers = [];
        walk(nodes, command => {
            if (command.op === 'require') requires.push(command);
            if (command.op === 'remember') remembers.push(command);
        });
        assert.equal(requires.length, 1);
        assert.deepEqual(requires[0].allowedTags, ALLOWED_TAGS);
        assert.equal(requires[0].kind, goal.kind);
        assert.equal(requires[0].text, goal.target);
        assert.equal(remembers.length, 1);
        assert.equal(remembers[0].text, goal.target);
        assert.equal(nodes.find(node => node.event === 'pass').body[0].mode, 'repeat');
    }
    assert.equal(formula('P').type, NodeType.ATOM_WFF);
    assert.equal(formula('P(x)').type, NodeType.PRED);
});

test('scripts survive import/rewrite and reward grants exactly twelve IPC primitives with safe tools', () => {
    const granted = [], all = [];
    for (const tile of world.tiles) {
        if (!tile.data.script) continue;
        const commands = parseMapScript(tile.data.script);
        assert.equal(formatMapScript(parseMapScript(formatMapScript(commands))), formatMapScript(commands));
        walk(commands, command => {
            all.push(command);
            if (command.op === 'unlock' && command.kind === 'rule') granted.push(command.id);
        });
        assert.doesNotThrow(() => parseMapScript(runtimeById.get(sid(tile.id)).data.script));
    }
    assert.equal(IPC_RULES.length, 12);
    assert.deepEqual(new Set(granted), new Set([...IPC_RULES, '.i']));
    assert.ok(!granted.some(id => ['a3', '.a30', 'd/\\', 'd\\/', 'd<>'].includes(id)));
    assert.equal(all.some(command => ['add', 'disable', 'enable'].includes(command.op) && command.kind === 'axiom'), false);
    const {engine, state} = fixture();
    const tile = runtimeById.get(sid('toolkit'));
    const plan = planMapScript(tile.data.script, createMapScriptState(), environment(engine, tile.name, 'collect'));
    assert.equal(plan.status, 'pass');
    engine.validateState(plan.state);
    assert.deepEqual(new Set(plan.state.engine.rules), new Set([...IPC_RULES, '.i']));
    assert.deepEqual(new Set(plan.state.rewards), new Set(['macro', 'hyp', 'mct', 'mdt', 'copygateD']));
    assert.deepEqual(plan.state.disabledAxioms, []);
    assert.equal(state.engine.rules.includes('a3'), false);
});

for (const goal of SOLUTIONS) test(`actual HS replay proves ${goal.id}; its native and scripted gates agree`, () => {
    const {hs, engine, state} = fixture();
    const query = {kind:goal.kind, text:goal.target, allowedTags:ALLOWED_TAGS};
    assert.equal(engine.query(query, state), false, 'no solution was silently granted');
    run(hs, goal.commands);
    assert.equal(engine.query(query, state), true, goal.id);
    assert.equal(goal.kind === 'proof'
        ? hs.checkPropGate(formula(goal.target), ALLOWED_TAGS)
        : hs.checkRuleGate(formula(goal.target, 'rule'), ALLOWED_TAGS), true);
    const tile = runtimeById.get(sid(goal.id));
    const touch = planMapScript(tile.data.script, state, environment(engine, tile.name, 'touch'));
    assert.ok(touch.attemptEffects.some(effect => effect.op === 'remember' && effect.text === goal.target));
    for (const dG of [false, true]) {
        const planned = planMapScript(tile.data.script, state, environment(engine, tile.name, 'pass', dG ? ['dG'] : []));
        assert.equal(planned.status, 'pass');
        assert.equal(planned.state.tileEdits[tile.name].type, 0);
        assert.ok(planned.effects.some(effect => effect.op === (dG ? 'demolish' : 'open') && effect.id === tile.name));
        assert.ok(!Object.hasOwn(planned.state.tileEdits, '@self'));
    }
});

test('a classical-only derivation of the same identity is denied; an allowed derivation is accepted', () => {
    const {hs, engine, state} = fixture(true);
    run(hs, ['.i ¬P', 'a3 P P', 'mp 2 1']);
    assert.equal(engine.query({kind:'proof', text:'P→P'}, state), true);
    assert.equal(hs.checkPropGate(formula('P→P'), ALLOWED_TAGS), false);
    const tile = runtimeById.get(sid('identity'));
    for (const dG of [false, true]) {
        const result = planMapScript(tile.data.script, state, environment(engine, tile.name, 'pass', dG ? ['dG'] : []));
        assert.equal(result.status, 'blocked');
        assert.deepEqual(result.state, state);
        assert.deepEqual(result.effects, []);
    }
    run(hs, ['m qClassicalIdentity']);
    assert.equal(engine.query({kind:'rule', text:'⊢P→P'}, state), true);
    assert.equal(hs.checkRuleGate(formula('⊢P→P', 'rule'), ALLOWED_TAGS), false);
    const old = ruleProvenance(hs.hilbertSystem, hs.hilbertSystem.rules.get('.a30'));
    const primitive = ruleProvenance(hs.hilbertSystem, hs.hilbertSystem.rules.get('a3i'));
    assert.ok(old.tags.includes('classical'));
    assert.equal(permitsProvenance(old, ALLOWED_TAGS), false);
    assert.equal(permitsProvenance(primitive, ALLOWED_TAGS), true);
    assert.deepEqual(primitive.tags, ['intuitionistic']);
    hs.hilbertSystem.clear();
    run(hs, ['.i P']);
    assert.equal(engine.query({kind:'proof', text:'P→P', allowedTags:ALLOWED_TAGS}, state), true, 'owning a3 is permitted; using it is not');
});

// An independent finite Kripke evaluator checks the advertised countermodel and
// the primitive schemas, rather than substituting classical truth tables.
function forces(ast, worldIndex, successors, valuation) {
    const recurse = (node, at = worldIndex) => forces(node, at, successors, valuation);
    if (ast.type === NodeType.ATOM_WFF) return valuation.get(ast.name)?.has(worldIndex) ?? false;
    assert.equal(ast.type, NodeType.LOGIC);
    const [a, b] = ast.nodes;
    switch (ast.name) {
        case '/\\': return recurse(a) && recurse(b);
        case '\\/': return recurse(a) || recurse(b);
        case '>': return successors[worldIndex].every(at => !recurse(a, at) || recurse(b, at));
        case '~': return successors[worldIndex].every(at => !recurse(a, at));
        case '<>': return successors[worldIndex].every(at => recurse(a, at) === recurse(b, at));
        default: assert.fail(`Unexpected native connective: ${ast.name}`);
    }
}

test('all twelve primitive schemas are Kripke-valid on small frames; the optional classical exhibits have real countermodels', () => {
    const {hs} = fixture();
    const schemas = IPC_RULES.map(id => hs.hilbertSystem.rules.get(id));
    for (const rule of schemas) {
        assert.equal(rule.step, undefined, `${rule.name} must be primitive, not an a3-derived macro`);
        assert.deepEqual(ruleProvenance(hs.hilbertSystem, rule).tags, ['intuitionistic']);
    }
    assert.equal(formula(schemas.find(rule => rule.name.name === 'a3i').toString(), 'rule').equal(formula('⊢($1→$2)→¬$2→¬$1', 'rule')), true);
    for (const successors of [[[0]], [[0, 1], [1]], [[0, 1, 2], [1], [2]], [[0, 1, 2], [1, 2], [2]]]) {
        const count = successors.length;
        const upward = Array.from({length:2 ** count}, (_, mask) => new Set(Array.from({length:count}, (_, i) => i).filter(i => mask & (1 << i))))
            .filter(set => [...set].every(at => successors[at].every(next => set.has(next))));
        for (const rule of schemas) {
            const names = rule.replaceNames.map(([name]) => name);
            const valuations = [new Map()];
            for (const name of names) {
                const old = valuations.splice(0);
                for (const valuation of old) for (const set of upward) valuations.push(new Map([...valuation, [name, set]]));
            }
            for (const valuation of valuations) for (let at = 0; at < count; at++) assert.equal(forces(rule.conclusion, at, successors, valuation), true, rule.toString());
        }
    }
    const chain = [[0, 1], [1]], valuation = new Map([['P', new Set([1])], ['Q', new Set()]]);
    for (const text of ['P∨¬P', '¬¬P→P', '((P→Q)→P)→P']) assert.equal(forces(formula(text), 0, chain, valuation), false, text);
    assert.equal(forces(formula('¬¬P'), 0, chain, valuation), true);
});
