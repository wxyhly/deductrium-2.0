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
    addRules() {}
    unlockBasicPropCmd() {}
    unlockBasicRuleCmd() { this.creative = true; }
    unlockMetaBlock() {}
    configureSurvival(rewards) {
        this.configurations.push([...rewards]);
        for (const name of rewards) this.applyReward(name);
    }
    applyReward(name) { this.applied.push(name); }
    serialize() { return { rules: [...this.rules] }; }
    deserialize(data) { this.rules = new Map(data.rules || []); }
}
class TTBoundary { serialize() { return {}; } deserialize() {} }
class HyBoundary {
    constructor() {
        blockMap.clear(); nameMap.clear();
        this.world = Object.create(HWorld.prototype);
        this.world.atlasTile = new Polygon(6, 4);
        quiet(() => this.world.reload());
    }
    serialize() { return {}; }
    deserialize() {}
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
        'ProgressLayer', 'kbFullId', 'SaveLoad', 'HSParser', gameSource)(
        { location: { search: mode === 'creative' ? '?creative' : '' } }, documentBoundary,
        () => { confirmations++; return confirmResult; }, initialCreativeRules, initialSurvivalRules,
        HSBoundary, TTBoundary, HyBoundary, blockMap, nameMap, Type, LangMgr,
        ProgressBoundary, id => id, SaveBoundary, HSParser);
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
