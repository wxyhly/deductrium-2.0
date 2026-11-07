// Run after the normal TypeScript build: node --test test/test-game-currencies.mjs.
// Standalone fixture mirrors test-survival-world.mjs; no production callbacks are replaced.
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
const { tileColor, tileTextColor, tileDisplayText } = await import('../js/hy/appearance.js');
const { stringifyDeductriumAmout } = await import('../js/format.js');
const {createCurrencyBalances} = await import('../js/hy/economy.js');
const {createMapScriptState, planMapScript} = await import('../js/hy/script.js');

const quiet = fn => {
    const log = console.log;
    console.log = () => {};
    try { return fn(); } finally { console.log = log; }
};
let saved;
let confirmations;
let confirmResult;
let scriptTiles = [];
class SaveBoundary {
    static getSavedLang() { return 'en'; }
    constructor(mode, serialize, deserialize) { Object.assign(this, { mode, serialize, deserialize }); }
    notifySave() {}
    load() { if (!saved) return false; this.deserialize(structuredClone(saved)); return true; }
}
// HS/TT and DOM are integration boundaries; Game, map parsing, geometry lookup,
// collision dispatch, reward callbacks, and save callbacks are production code.
class HSBoundary {
    setMapDisabledAxioms(names) { this.disabled = [...names]; }
    hasMapAxiom(name) { return ['a1','a2','a3','mp'].includes(name); }
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
        for (const [hash,tile] of scriptTiles) {
            blockMap.set(hash, structuredClone(tile));
            if (tile.name) nameMap.set(tile.name,hash);
        }
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
function makeGame(data, mode = 'survival', tiles = []) {
    scriptTiles = tiles;
    saved = data; confirmations = 0; confirmResult = true;
    const Game = new Function('window', 'document', 'confirm', 'initialCreativeRules', 'initialSurvivalRules',
        'HSLayer', 'TTLayer', 'HyLayer', 'blockMap', 'nameMap', 'TileBlockType', 'LangMgr',
        'ProgressLayer', 'kbFullId', 'SaveLoad', 'HSParser', 'calcMaxReachOrd', 'cmp', 'printOrd',
        'tileColor', 'tileTextColor', 'tileDisplayText', 'stringifyDeductriumAmout',
        'editorPreview', 'editorPreviewSaveMode', 'createMapScriptState', 'planMapScript',
        'activeWorld','activeWorldSaveMode','createCurrencyBalances',gameSource)(
        { location: { search: mode === 'creative' ? '?creative' : '' } }, documentBoundary,
        () => { confirmations++; return confirmResult; }, initialCreativeRules, initialSurvivalRules,
        HSBoundary, TTBoundary, HyBoundary, blockMap, nameMap, Type, LangMgr,
        ProgressBoundary, id => id, SaveBoundary, HSParser, calcMaxReachOrd, cmp, printOrd,
        tileColor, tileTextColor, tileDisplayText, stringifyDeductriumAmout,
        false, ()=>'unused', createMapScriptState, planMapScript, undefined,undefined,createCurrencyBalances);
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


const prizeName = 'currency-prize';
const doorName = 'currency-door';
const signName = 'currency-sign';
function currencyTiles(getD, scriptAmount) {
    const data = { getD };
    if (scriptAmount !== undefined) data.script = [
        'give money ' + scriptAmount,
        'give currency type 3',
        'give key paid',
        'unlock reward macro',
        'open gate ' + doorName,
        'set text ' + signName + ' "Changed"',
    ].join(';');
    return [
        ['0', { type: Type.Reward, name: prizeName, text: 'Prize', data }],
        ['1', { type: Type.Gate, name: doorName, text: 'Door', data: { never: true } }],
        ['2', { type: Type.Road, name: signName, text: 'Original', data: {} }],
    ];
}
function gameplaySnapshot(game) {
    return structuredClone({
        save: game.saveload.serialize(),
        tiles: [prizeName, doorName, signName].map(name => block(name)),
        appliedRewards: game.hsLayer.applied,
        disabledAxioms: game.hsLayer.disabled,
    });
}

for (const { name, getD, scriptAmount, initial } of [
    { name: 'combined legacy and script payout overflow', getD: 1, scriptAmount: 1e12, initial: 0 },
    { name: 'legacy-only payout overflow', getD: 1, initial: 1e12 },
    { name: 'negative legacy payout with script effects', getD: -1, scriptAmount: 2, initial: 10 },
    { name: 'NaN legacy payout with script effects', getD: NaN, scriptAmount: 2, initial: 10 },
    { name: 'negative legacy-only payout', getD: -1, initial: 10 },
    { name: 'NaN legacy-only payout', getD: NaN, initial: 10 },
]) test(name + ' rejects atomically through the compiled reward callback', () => {
    const game = makeGame(undefined, 'survival', currencyTiles(getD, scriptAmount));
    game.deductrium = initial;
    game.typeDeductrium = 5;
    const before = gameplaySnapshot(game);
    assert.equal(hit(game, prizeName), false);
    assert.deepEqual(gameplaySnapshot(game), before,
        'rejection preserves balances, ms.done, reward claims, tile type/data, and script effects');
    assert.equal(block(prizeName).type, Type.Reward);
    assert.equal(Object.hasOwn(block(prizeName).data, 'got'), false);
    assert.equal(game.gotRewards.has(prizeName), false);
    assert.equal(game.mapScript.done.includes(prizeName), false);
    // A failed first attempt must not mark the prize claimed and bypass validation on retry.
    assert.equal(hit(game, prizeName), false);
    assert.deepEqual(gameplaySnapshot(game), before);
});

for (const [missing, balances] of [
    ['reasoning', { type: 9 }],
    ['type', { reasoning: 123 }],
]) test('modern ledger missing ' + missing + ' is rejected by the compiled load callback', () => {
    const data = { ...saveData([], [], 123), balances };
    const before = structuredClone(data);
    assert.throws(() => makeGame(data), /currency|ledger|balance/i);
    assert.deepEqual(data, before);
});

test('legacy save without balances maps D only to reasoning and round-trips as a modern ledger', () => {
    const data = saveData([], [], 123);
    assert.equal(Object.hasOwn(data, 'balances'), false);
    let game = makeGame(data);
    assert.deepEqual(game.saveload.serialize().balances, { reasoning: 123, type: 0 });
    const migrated = structuredClone(game.saveload.serialize());
    game = makeGame(migrated);
    assert.equal(game.saveload.serialize().D, 123);
    assert.deepEqual(game.saveload.serialize().balances, { reasoning: 123, type: 0 });
});

test('complete modern ledger preserves both independent balances', () => {
    const game = makeGame({ ...saveData([], [], 123), balances: { reasoning: 123, type: 9 } });
    assert.deepEqual(game.saveload.serialize().balances, { reasoning: 123, type: 9 });
});

test('valid combined payout reaches the limit, commits once, and survives save replay', () => {
    const tiles = currencyTiles(1, 999999999998);
    let game = makeGame(undefined, 'survival', tiles);
    game.deductrium = 1;
    game.typeDeductrium = 5;
    assert.equal(hit(game, prizeName), true);
    assert.deepEqual(game.saveload.serialize().balances, { reasoning: 1e12, type: 8 });
    assert.equal(block(prizeName).type, Type.Road);
    assert.equal(block(prizeName).data.got, true);
    assert(game.gotRewards.has(prizeName));
    assert(game.gotRewards.has('macro'));
    assert(game.hsLayer.applied.includes('macro'));
    assert(game.mapScript.done.includes(prizeName));
    assert.deepEqual(game.mapScript.keys, ['paid']);
    assert.equal(block(doorName).type, Type.Road);
    assert.equal(block(signName).text, 'Changed');
    assert.equal(hit(game, prizeName), true);
    assert.deepEqual(game.saveload.serialize().balances, { reasoning: 1e12, type: 8 });
    const saved = structuredClone(game.saveload.serialize());
    game = makeGame(saved, 'survival', tiles);
    assert.equal(hit(game, prizeName), true);
    assert.deepEqual(game.saveload.serialize().balances, { reasoning: 1e12, type: 8 });
    assert.equal(game.mapScript.done.filter(id => id === prizeName).length, 1);
});
