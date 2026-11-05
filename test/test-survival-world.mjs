// Run after the project's normal TypeScript build: node test/test-survival-world.mjs.
// Exercise shipped production modules without TypeScript/runtime-hook dependencies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const { HWorld } = await import('../js/hy/hworld.js');
const { Polygon } = await import('../js/hy/tiling.js');
const { blockMap, nameMap, TileBlockType: Type } = await import('../js/hy/maploader.js');
const { LangMgr } = await import('../js/lang.js');
const { HSParser } = await import('../js/hs/core/parser.js');
const { initialCreativeRules, initialSurvivalRules } = await import('../js/hs/core/initial.js');
const { calcMaxReachOrd, cmp, printOrd, genOrdTiles } = await import('../js/hy/ordinal.js');
const { Serde: HySerde } = await import('../js/hy/serde.js');
const { Rotor } = await import('../js/hy/algebra.js');

const quiet = fn => {
    const log = console.log;
    console.log = () => {};
    try { return fn(); } finally { console.log = log; }
};
let saved;
let confirmations;
let confirmResult;
class SaveBoundary {
    static getSavedLang() { return 'en'; }
    constructor(mode, serialize, deserialize) { Object.assign(this, { mode, serialize, deserialize }); }
    notifySave() {}
    load() { if (!saved) return false; this.deserialize(structuredClone(saved)); return true; }
}
// HS/TT and DOM are integration boundaries; Game, map parsing, geometry lookup,
// collision dispatch, reward callbacks, and save callbacks are production code.
class HSBoundary {
    applied = [];
    configurations = [];
    rules = new Map();
    gateCalls = [];
    gateResult = false;
    rememberGate(ast) { this.gateCalls.push(['remember', ast]); }
    checkPropGate(ast) { this.gateCalls.push(['prop', ast]); return this.gateResult; }
    checkRuleGate(ast) { this.gateCalls.push(['rule', ast]); return this.gateResult; }
    addRules() {}
    unlockBasicPropCmd() {}
    unlockBasicRuleCmd() { this.creative = true; }
    unlockMetaBlock() {}
    configureSurvival(rewards) {
        this.configurations.push([...rewards]);
        for (const name of rewards) this.applyReward(name);
    }
    applyReward(name) { this.applied.push(name); }
    serialize() { return { rules: [...this.rules], r: [...this.rules.keys()].map(name => `(1)${name}:ax:.`).join('\n') }; }
    deserialize(data) { this.rules = new Map(data.rules || []); }
}
class TTBoundary { serialize() { return {}; } deserialize() {} }
class HyBoundary {
    constructor() {
        blockMap.clear(); nameMap.clear();
        this.world = Object.create(HWorld.prototype);
        this.world.atlasTile = new Polygon(6, 4);
        this.world.currentTile = [];
        this.world.currentOrd = [];
        this.world.navigateDraw = false;
        this.world.highLightGetD = false;
        this.world.localCamMat = new Rotor();
        this.world.onLoop = () => {};
        this.serde = new HySerde(this.world);
        quiet(() => this.world.reload());
    }
    serialize() { return this.serde.serialize(); }
    deserialize(data) { this.serde.deserialize(data); }
}
class ProgressBoundary { refreshAchievements() {} refreshSymbols() {} refreshKnowledge() {} }
const documentBoundary = {
    getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
};
let gameSource = fs.readFileSync(new URL('../js/game.js', import.meta.url), 'utf8');
assert.equal((gameSource.match(/window\.game = new Game;/g) || []).length, 1);
gameSource = gameSource.replace(/^import .*$/gm, '').replace('window.game = new Game;', 'return Game;');
function makeGame(data, mode = 'survival') {
    saved = data; confirmations = 0; confirmResult = true;
    const Game = new Function('window', 'document', 'confirm', 'initialCreativeRules', 'initialSurvivalRules',
        'HSLayer', 'TTLayer', 'HyLayer', 'blockMap', 'nameMap', 'TileBlockType', 'LangMgr',
        'ProgressLayer', 'kbFullId', 'SaveLoad', 'HSParser', 'calcMaxReachOrd', 'cmp', 'printOrd', gameSource)(
        { location: { search: mode === 'creative' ? '?creative' : '' } }, documentBoundary,
        () => { confirmations++; return confirmResult; }, initialCreativeRules, initialSurvivalRules,
        HSBoundary, TTBoundary, HyBoundary, blockMap, nameMap, Type, LangMgr,
        ProgressBoundary, id => id, SaveBoundary, HSParser, calcMaxReachOrd, cmp, printOrd);
    // LangMgr only touches the DOM in its constructor.
    const previousDocument = globalThis.document;
    globalThis.document = documentBoundary;
    try { return quiet(() => new Game()); }
    finally { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; }
}
const block = name => blockMap.get(nameMap.get(name) ?? name);
const hit = (game, name) => {
    const hash = nameMap.get(name) ?? name;
    return game.hyLayer.world.hitTest(hash.split(',').map(Number));
};
const saveData = (rw = [], dg = [], D = 0) => ({ rw, dg, D, DC: 0, tp: 0, ac: [], in: [], hs: { rules: [] } });

test('reward callback forwards independent rewards, ignores duplicate money and loading payouts', () => {
    const game = makeGame();
    assert.equal(hit(game, 'macro'), true);
    assert(game.hsLayer.applied.includes('macro'));
    assert(game.gotRewards.has('macro'));
    assert.equal(block('macro').type, Type.Road);
    const reward = { name: 'test-cash', type: Type.Reward, text: '', data: { getD: 7 } };
    const receive = game.hyLayer.world.onGetReward;
    receive('99', reward); receive('99', reward);
    assert.equal(game.deductrium, 7);
    receive('98', { name: 'loaded-cash', type: Type.Reward, text: '', data: { getD: 50 } }, true);
    assert.equal(game.deductrium, 7);
});

const targets = {
    'del<>': 'port-iff', delK: 'K', delL: 'L', 'del-pn': '.pn', delAl: 'Aleph',
    delAlw: 'AlephW', 'del-W': 'W', 'del-ttAleph': 'ttpAleph', mnt: 'port-rp', mcvt: 'V', omega: 'w',
};
test('all explicit targets and legacy mappings demolish and persist gates, including absent legacy w', () => {
    const game = makeGame();
    // w belongs to the unported legacy ordinal naming scheme; supply that gate
    // only to verify the mapping, without changing the production ordinal map.
    assert.equal(nameMap.has('w'), false);
    nameMap.set('w', '99'); blockMap.set('99', { name: 'w', type: Type.Gate, text: '', data: {} });
    for (const [reward, target] of Object.entries(targets)) {
        if (target !== 'w') assert.equal(block(reward).data.dstrTarget, target, `${reward}: explicit map target`);
        hit(game, reward);
        assert.equal(block(target).type, Type.Road, `${reward} removes ${target}`);
        assert.equal(block(target).data.del, true);
        assert(game.destructedGates.has(target));
        assert.equal(hit(game, target), true);
        // Old map data containing display-only dstr still uses the legacy mapping.
        block(target).type = Type.Gate;
        game.applyUnlockEffect({ name: reward, type: Type.Reward, text: '', data: {} });
        assert.equal(block(target).type, Type.Road);
    }
    assert.equal(game.destructedGates.size, Object.keys(targets).length);
    const generic = { name: 'generic', type: Type.Reward, text: '', data: { dstr: 'K' } };
    block('K').type = Type.Gate;
    game.hyLayer.world.onGetReward('97', generic);
    assert.equal(block('K').type, Type.Road);
    game.applyUnlockEffect({ type: Type.Reward, text: '', data: { dstrTarget: 'missing' } });
});

for (const station of ['1', '2']) test(`relief station ${station}: entry, threshold, return, replay, and loading`, () => {
    const game = makeGame();
    const gate = `JJZP-${station}`, entrance = `JJZO-${station}`, inside = `JJZI-${station}`, end = `JJZ-${station}`;
    assert(block(inside), `${inside} exists independently`);
    for (const [money, pass] of [[0, true], [3, true], [4, false], [10, false]]) {
        game.deductrium = money;
        assert.equal(hit(game, gate), pass, `balance ${money}`);
    }
    game.deductrium = 0; game.gotRewards.add('dG');
    assert.equal(hit(game, gate), false);
    game.gotRewards.delete('dG');
    hit(game, entrance); assert.equal(hit(game, gate), true); hit(game, inside); hit(game, end);
    assert.equal(game.deductrium, 5);
    assert.equal(hit(game, gate), true, 'round marker permits leaving with money');
    assert.equal(hit(game, end), true); assert.equal(game.deductrium, 5, 'no second payout before returning');
    assert(game.gotRewards.has(inside));
    game.hyLayer.world.onGetReward(nameMap.get(entrance), block(entrance), true);
    assert(game.gotRewards.has(inside), 'loading entrance must not clear the marker');
    assert(game.gotRewards.has(end), 'loading entrance must not reset the endpoint');
    assert.equal(block(end).type, Type.Road);
    game.applyGotRewards();
    assert.equal(game.deductrium, 5);
    assert(game.gotRewards.has(inside));
    hit(game, entrance);
    assert(!game.gotRewards.has(inside)); assert(!game.gotRewards.has(end));
    assert.equal(block(end).type, Type.Reward); assert.equal(block(end).data.got, false);
    assert.equal(block(inside).type, Type.Reward);
    assert.equal(hit(game, gate), false);
    game.deductrium = 3;
    hit(game, gate); hit(game, inside); hit(game, end);
    assert.equal(game.deductrium, 8, 'a new trip can claim 5 again');
    const other = station === '1' ? '2' : '1';
    game.gotRewards.add('dG');
    assert.equal(hit(game, `JJZP-${other}`), false, 'markers belong to their station');
    assert.equal(hit(game, gate), true, 'current round marker works even after gaining dG');
});

test('mct2mdt requires mct and 20µg, reuses confirmation, and dG prevents subsequent payment', () => {
    const game = makeGame();
    assert.equal(block('mct2mdt').data.payD, 20);
    assert.equal(block('mct2mdt').data.requiresReward, 'mct');
    game.deductrium = 100;
    assert.equal(hit(game, 'mct2mdt'), false); assert.equal(game.deductrium, 100);
    game.gotRewards.add('mct'); game.deductrium = 19;
    assert.equal(hit(game, 'mct2mdt'), false); assert.equal(confirmations, 0);
    game.deductrium = 20; confirmResult = false;
    assert.equal(hit(game, 'mct2mdt'), false); assert.equal(game.deductrium, 20);
    confirmResult = true;
    assert.equal(hit(game, 'mct2mdt'), true); assert.equal(game.deductrium, 0);
    assert.equal(game.deductriumConsumed, 20); assert.equal(confirmations, 2);
    game.deductrium = 40; game.gotRewards.add('dG');
    assert.equal(hit(game, 'mct2mdt'), true); assert.equal(game.deductrium, 20);
    assert.equal(confirmations, 2);
    assert.equal(hit(game, 'mct2mdt'), true); assert.equal(game.deductrium, 20);
});

test('ordinary dG gates, save callback, and constructor restore are idempotent', () => {
    let game = makeGame(); game.gotRewards.add('dG'); game.deductrium = 10;
    assert.equal(hit(game, '宏门'), true);
    assert.equal(game.deductrium, 9);
    assert(game.destructedGates.has('宏门'));
    const unnamed = { type: Type.Gate, text: '', data: { payD: 1 } };
    blockMap.set('99', unnamed); assert.equal(hit(game, '99'), true);
    assert(game.destructedGates.has('99'));
    const data = game.saveload.serialize();
    data.rw.push('neg', 'del<>', 'JJZO-1', 'JJZI-1', 'JJZ-1', 'missing-old-reward');
    data.hs.rules.push(['.i', 'player-macro']);
    data.D = 18;
    game = makeGame(data);
    assert.equal(game.deductrium, 18);
    assert.equal(block('宏门').type, Type.Road); assert.equal(block('宏门').data.del, true);
    assert.equal(block('port-iff').type, Type.Road);
    assert.equal(block('JJZ-1').type, Type.Road); assert(game.gotRewards.has('JJZI-1'));
    assert.equal(block('JJZO-1').type, Type.Reward); assert.equal(block('JJZI-1').type, Type.Reward);
    assert(game.hsLayer.configurations.length >= 2, 'load callback and constructor each restore capabilities');
    assert(game.hsLayer.configurations.every(rewards => rewards.includes('neg')));
    assert(game.hsLayer.applied.includes('neg'));
    const snapshot = game.saveload.serialize();
    game.applyGotRewards();
    assert.deepEqual(game.saveload.serialize(), snapshot);
    assert.equal(game.hsLayer.rules.get('.i'), 'player-macro');
    // Direct load callback covers slot imports after the constructor has finished.
    quiet(() => game.saveload.deserialize(saveData(['hyp'], ['K'], 31)));
    assert.equal(block('K').type, Type.Road); assert.equal(block('K').data.del, true);
    assert.equal(block('宏门').type, Type.Gate, 'previous slot gate mutations are cleared');
    assert.equal(block('port-iff').type, Type.Gate);
    assert.equal(block('JJZ-1').type, Type.Reward);
    assert.equal(game.deductrium, 31);
    assert.deepEqual(game.hsLayer.configurations.at(-1), ['hyp']);
    assert(game.hsLayer.applied.includes('hyp'));
});

test('recorded ccmp and mct2mdt gates stay demolished when restoring the enclosed mdt reward', () => {
    // Minimized from a real save: the reward and both gate records are present,
    // without ordinal metadata. Loading must replay dg, never charge the fee again.
    const data = { ...saveData(['dG', 'mct', 'mdt'], ['ccmp', 'mct2mdt'], 24), DC: 27 };
    const game = makeGame(data);
    const check = () => {
        assert(game.gotRewards.has('mdt'));
        for (const name of data.dg) {
            assert.equal(block(name).type, Type.Road, name);
            assert.equal(block(name).data.del, true, name);
            assert.equal(hit(game, name), true, name);
        }
        assert.equal(game.deductrium, 24);
        assert.equal(game.deductriumConsumed, 27);
        assert.equal(confirmations, 0);
        assert.deepEqual([...game.destructedGates], data.dg);
    };
    check();
    quiet(() => game.saveload.deserialize(saveData()));
    for (const name of data.dg) assert.equal(block(name).type, Type.Gate, 'fresh slot clears demolition');
    quiet(() => game.saveload.deserialize(data));
    check();
    game.applyGotRewards();
    check();
});

test('creative initialization keeps its existing full command unlock path', () => {
    const game = makeGame(undefined, 'creative');
    assert.equal(game.hsLayer.creative, true);
    assert.equal(game.hsLayer.configurations.length, 0);
});

test('highlightd controls cash highlighting immediately after rewards and save changes', () => {
    const game = makeGame();
    const cash = { type: Type.Reward, text: '', data: { getD: 7 } };
    const color = highLight => game.hyLayer.world.onTileColor(cash, highLight);
    assert.equal(color(true), 'rgb(200,255,20)', 'cash starts with the normal reward color');
    hit(game, 'highlightd');
    assert.equal(color(true), 'rgb(255,255,0)', 'earned reward immediately enables highlighting');
    assert.equal(color(false), 'rgb(200,255,20)');
    assert.equal(game.hyLayer.world.onTileColor({ type: Type.Reward, data: {} }, true), 'rgb(200,255,20)');
    quiet(() => game.saveload.deserialize(saveData()));
    assert.equal(color(true), 'rgb(200,255,20)', 'loading a fresh save removes highlighting');
    quiet(() => game.saveload.deserialize(saveData(['highlightd'])));
    assert.equal(color(true), 'rgb(255,255,0)', 'loading the earned reward restores highlighting');
});

test('preord requires 256 actual step callbacks and I1I2I3 requires all three reward callbacks', () => {
    let game = makeGame();
    for (let i = 0; i < 255; i++) game.hyLayer.world.onStepToAnotherTile('');
    assert.equal(hit(game, 'preord'), false);
    game.hyLayer.world.onStepToAnotherTile('');
    assert.equal(game.tilesParcour, 256);
    assert.equal(hit(game, 'preord'), true);
    assert.equal(hit(game, 'I1I2I3'), false);
    for (const key of ['I1', 'I2']) hit(game, key);
    assert.equal(hit(game, 'I1I2I3'), false);
    hit(game, 'I3');
    assert.equal(hit(game, 'I1I2I3'), true);
    game = makeGame(game.saveload.serialize());
    assert.equal(hit(game, 'preord'), true);
    assert.equal(hit(game, 'I1I2I3'), true);
    game.gotRewards.add('dG');
    assert.equal(hit(game, 'I1I2I3'), true);
    assert(game.destructedGates.has('I1I2I3'));
});

test('cmpss and highlightd control the actual world drawing flags and reset across saves', () => {
    const game = makeGame();
    assert.equal(game.hyLayer.world.navigateDraw, false);
    assert.equal(game.hyLayer.world.highLightGetD, false);
    hit(game, 'cmpss'); hit(game, 'highlightd');
    assert.equal(game.hyLayer.world.navigateDraw, true);
    assert.equal(game.hyLayer.world.highLightGetD, true);
    quiet(() => game.saveload.deserialize(saveData()));
    assert.equal(game.hyLayer.world.navigateDraw, false);
    assert.equal(game.hyLayer.world.highLightGetD, false);
    quiet(() => game.saveload.deserialize(saveData(['cmpss', 'highlightd'])));
    assert.equal(game.hyLayer.world.navigateDraw, true);
    assert.equal(game.hyLayer.world.highLightGetD, true);
});

test('p/d callbacks remember each parsed AST before either passing or failing the gate', () => {
    const game = makeGame();
    const world = game.hyLayer.world;
    for (const [flag, text, check] of [['p', 'A→A', 'prop'], ['d', '⊢A→A', 'rule']]) {
        for (const result of [false, true]) {
            const tile = { type: Type.Gate, text, data: { [flag]: true } };
            game.hsLayer.gateCalls.length = 0;
            game.hsLayer.gateResult = result;
            assert.equal(world.onPassGate('test', tile, '99'), result);
            assert.deepEqual(game.hsLayer.gateCalls.map(([kind]) => kind), ['remember', check]);
            assert.equal(game.hsLayer.gateCalls[0][1], game.hsLayer.gateCalls[1][1]);
        }
    }
    game.hsLayer.gateCalls.length = 0;
    assert.equal(world.onPassGate('invalid', { type: Type.Gate, text: '(', data: { p: true } }, '99'), false);
    assert.deepEqual(game.hsLayer.gateCalls, [], 'invalid syntax does not replace the previous gate');
});

test('existing automatic exits check erroneous axiom names and remain immune to dG', () => {
    const game = makeGame();
    game.gotRewards.add('dG');
    const exits = [...blockMap.entries()].filter(([, tile]) => Object.values(
        typeof tile.text === 'string' ? { text: tile.text } : tile.text
    ).some(text => text.endsWith('#imm')));
    assert.equal(exits.length, 2);
    for (const [hash, tile] of exits) {
        for (const bad of ['apn5x', 'asepx']) {
            game.hsLayer.rules.set(bad, 'bad axiom');
            assert.equal(hit(game, hash), false);
            game.hsLayer.rules.delete(bad);
        }
        game.hsLayer.rules.set('playerx', 'macro');
        assert.equal(hit(game, hash), true);
        assert.equal(tile.type, Type.Gate);
        assert(!game.destructedGates.has(tile.name || hash));
    }
});

test('ordinal gates use existing reachability, expand real tiles, and preserve ordinal gates with dG', () => {
    const game = makeGame();
    game.gotRewards.add('dG');
    assert.deepEqual(game.maxOrd, []);
    assert.deepEqual(game.nextOrd, [1]);
    assert.equal(hit(game, 'O1,1'), false, 'cannot skip a successor');
    assert.equal(hit(game, 'O1'), true);
    assert.deepEqual(game.maxOrd, [1]);
    assert.deepEqual(game.nextOrd, [1, 1]);
    assert.deepEqual(game.hyLayer.world.currentOrd, [1]);
    assert.equal(hit(game, 'O1,1'), true);
    assert.equal(hit(game, 'O1'), true, 'revisiting a smaller ordinal is permitted');
    assert.deepEqual(game.maxOrd, [1, 1]);
    assert.equal(block('O1').type, Type.Ordinal);
    assert(!game.destructedGates.has('O1'));
    assert.equal(game.hyLayer.world.onPassGate('', { type: Type.Ordinal, text: '', data: {} }, '99'), true);
    // An ordinary branch beyond the initial depth must be generated by onPassOrd.
    for (let length = 3; length <= 9; length++) {
        assert.equal(hit(game, 'O' + Array(length).fill(1).join(',')), true);
    }
    const ord = Array(9).fill(1);
    const hash = nameMap.get('O' + ord.join(','));
    game.hyLayer.world.currentTile = hash.split(',').map(Number);
    const data = game.saveload.serialize();
    const loaded = makeGame(data);
    assert.deepEqual(loaded.maxOrd, ord);
    assert.deepEqual(loaded.nextOrd, calcMaxReachOrd(ord, 15, false));
    assert.equal(blockMap.get(hash)?.name, 'O' + ord.join(','), 'loaded position has a real ordinal tile');
    assert.equal(hit(loaded, 'O' + Array(10).fill(1).join(',')), true);
    quiet(() => loaded.saveload.deserialize(saveData()));
    assert.deepEqual(loaded.maxOrd, []);
    assert.deepEqual(loaded.nextOrd, [1]);
    assert.equal(nameMap.has('O' + Array(10).fill(1).join(',')), false, 'fresh slot clears the other slot expansion');
    delete data.mo; delete data.ob;
    const legacy = makeGame(data);
    assert.deepEqual(legacy.maxOrd, ord, 'pre-wiring saves recover progress from the saved current ordinal');
    assert.equal(legacy.ordBase, 15);
    assert.equal(blockMap.get(hash)?.name, 'O' + ord.join(','));
});

test('ordinal rewards recalculate existing base/stepw logic once and survive old/new saves', () => {
    let game = makeGame();
    assert.equal(game.ordBase, 15);
    for (let i = 1; i <= 10; i++) hit(game, `base-${i}`);
    assert.equal(game.ordBase, 5);
    game.applyGotRewards();
    assert.equal(game.ordBase, 5, 'replaying rewards cannot reduce the base again');
    for (const [reward, base] of [['base5', 4], ['base4', 3], ['base3', 2], ['base2', 1]]) {
        hit(game, reward); assert.equal(game.ordBase, base);
    }
    for (const [reward, ord] of [['w^2', [1, 2, 2]], ['w^3', [1, 2, 2, 2]], ['ww2', [1, 2, 3, 2, 3]]]) {
        hit(game, reward);
        assert.deepEqual(game.maxOrd, ord);
        assert.deepEqual(game.nextOrd, calcMaxReachOrd(ord, 1, false));
    }
    hit(game, 'stepw');
    assert.deepEqual(game.nextOrd, calcMaxReachOrd(game.maxOrd, 1, true));
    game = makeGame(game.saveload.serialize());
    assert.equal(game.ordBase, 1);
    assert.deepEqual(game.maxOrd, [1, 2, 3, 2, 3]);
    assert.deepEqual(game.nextOrd, calcMaxReachOrd(game.maxOrd, 1, true));
    quiet(() => game.saveload.deserialize(saveData(['base-1', 'w^2'])));
    assert.equal(game.ordBase, 14, 'old saves derive progress from earned rewards');
    assert.deepEqual(game.maxOrd, [1, 2, 2]);
    quiet(() => game.saveload.deserialize(saveData()));
    assert.equal(game.ordBase, 15);
    assert.deepEqual(game.maxOrd, []);
});

test('ordinal progression awards the existing w2/w4 identifiers at their thresholds', () => {
    const game = makeGame();
    for (const [ord, achievement] of [[[1, 2, 3], 'w2'], [[1, 2, 3, 4, 5], 'w4']]) {
        game.nextOrd = ord;
        assert.equal(hit(game, 'O' + ord.join(',')), true);
        assert(game.gotAchievements.has(achievement));
    }
});

test('rejected ordinal gates only expand the map, without moving or advancing saved progress', () => {
    const game = makeGame();
    const before = game.saveload.serialize();
    const tiles = blockMap.size;
    assert.equal(hit(game, 'O1,1'), false);
    assert(blockMap.size > tiles, 'existing onPassOrd still reveals the surrounding branch');
    assert.deepEqual(game.saveload.serialize(), before, 'a rejected gate changes no saved state');
    assert.deepEqual(game.hyLayer.world.currentOrd, []);
    assert.equal(hit(game, 'O1,1'), false);
    assert.deepEqual(game.saveload.serialize(), before);
});

test('previously explored ordinal branches regenerate at the same hashes after saving on another branch', () => {
    let game = makeGame(saveData(['w^2']));
    const branches = [Array(10).fill(1), [1, 2, ...Array(8).fill(1)]];
    const walk = ord => {
        for (let i = 1; i <= ord.length; i++) assert.equal(hit(game, 'O' + ord.slice(0, i).join(',')), true);
        const hash = nameMap.get('O' + ord.join(','));
        game.hyLayer.world.currentTile = hash.split(',').map(Number);
        return hash;
    };
    const hashes = branches.map(walk);
    walk([1]);
    const savedProgress = game.saveload.serialize();
    game = makeGame(savedProgress);
    assert.deepEqual(game.maxOrd, [1, 2, 2], 'max progress is independent of the current branch');
    assert.equal(block('w^2').type, Type.Road, 'earned static rewards retain their references');
    for (let i = 0; i < branches.length; i++) {
        assert.equal(nameMap.has('O' + branches[i].join(',')), false, 'distant explored branches are not stored');
        assert.equal(walk(branches[i]), hashes[i], 'the existing generator recreates the original named tile');
    }
    assert.deepEqual(game.maxOrd, [1, 2, 2]);
    assert.deepEqual(game.nextOrd, calcMaxReachOrd([1, 2, 2], 15, false));
});

test('base2 and stepw rewards affect real ordinal limit and successor gate callbacks', () => {
    const game = makeGame(saveData(['base2']));
    assert.equal(hit(game, 'O1'), true);
    assert.equal(hit(game, 'O1,2'), false);
    assert.equal(hit(game, 'O1,1'), true);
    assert.deepEqual(game.nextOrd, [1, 2], 'base two carries the finite successor to omega');
    assert.equal(hit(game, 'O1,2'), true);
    assert.equal(hit(game, 'O1,2,2'), false);
    hit(game, 'stepw');
    assert.deepEqual(game.nextOrd, [1, 2, 2], 'stepw immediately raises the next reachable limit');
    assert.equal(hit(game, 'O1,2,2'), true);
});

test('w4234 grants the official ordinal through reward and repeated save restoration', () => {
    let game = makeGame();
    assert.equal(hit(game, 'w4234'), true);
    assert.equal(printOrd(game.maxOrd), 'ω^4*4+ω^3*4+ω^2*4');
    const data = game.saveload.serialize();
    game.applyGotRewards();
    assert.deepEqual(game.saveload.serialize(), data);
    game = makeGame(data);
    assert.equal(printOrd(game.maxOrd), 'ω^4*4+ω^3*4+ω^2*4');
    assert.deepEqual(game.nextOrd, calcMaxReachOrd(game.maxOrd, 15, false));
});

test('generated ordinal messages stay bilingual when switching language after generation', () => {
    const game = makeGame();
    const world = game.hyLayer.world;
    const language = LangMgr.lang;
    try {
        for (const n of [139, 149, 157, 163, 173, 199, 211, 223, 233, 251, 277, 283, 313,
            347, 349, 401, 443, 577, 911, 1009, 1949, 2027, 8191]) {
            const blocks = new Map(), names = new Map();
            genOrdTiles(blocks, names, world.atlasTile, [], Array(n).fill(1), -1);
            const ordinal = blocks.get('');
            assert.equal(ordinal.text, String(n));
            assert.equal(ordinal.name, 'O' + Array(n).fill(1).join(','));
            const message = [...blocks.values()].find(block => block !== ordinal);
            assert.deepEqual(Object.keys(message.text).sort(), ['en', 'zh']);
            assert(message.text.zh && message.text.en);
            assert.doesNotMatch(message.text.en, /[\u4e00-\u9fff]/);
            for (const lang of ['en', 'zh', 'en']) {
                LangMgr.lang = lang;
                assert.equal(world.onTileText(message), message.text[lang], `ordinal ${n}, ${lang}`);
                assert.equal(world.onTileText(ordinal), String(n));
            }
            if (n === 347) {
                assert.match(message.text.zh, /ω²3\+ω4\+7/);
                assert.match(message.text.en, /ω²3\+ω4\+7/);
            }
        }
        const blocks = new Map();
        genOrdTiles(blocks, new Map(), world.atlasTile, [], Array(131).fill(1), -1);
        assert.equal([...blocks.values()].find(block => block.text === '').type, Type.Road);
    } finally {
        LangMgr.lang = language;
    }
});
