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
const {lobbyBank,redeemMapBankOffer} = await import('../js/hy/bank.js');
const {createMapScriptState, parseMapScript, planMapScript} = await import('../js/hy/script.js');
const {createMapScriptEngine} = await import('../js/hy/script-engine.js');
const {captureModWorlds,prepareModSave} = await import('../js/hy/mod-saves.js');

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
        'editorPreview', 'editorPreviewSaveMode', 'createMapScriptState', 'parseMapScript', 'planMapScript', 'createMapScriptEngine',
        'activeWorld','activeWorldSaveMode','createCurrencyBalances','lobbyBank','redeemMapBankOffer',
        'installedMods','enabledMods','captureModWorlds','prepareModSave',gameSource)(
        { location: { search: mode === 'creative' ? '?creative' : '' } }, documentBoundary,
        () => { confirmations++; return confirmResult; }, initialCreativeRules, initialSurvivalRules,
        HSBoundary, TTBoundary, HyBoundary, blockMap, nameMap, Type, LangMgr,
        ProgressBoundary, id => id, SaveBoundary, HSParser, calcMaxReachOrd, cmp, printOrd,
        tileColor, tileTextColor, tileDisplayText, stringifyDeductriumAmout,
        false, ()=>'unused', createMapScriptState, parseMapScript, planMapScript, createMapScriptEngine, undefined,undefined,createCurrencyBalances,lobbyBank,redeemMapBankOffer,
        [],[],captureModWorlds,prepareModSave);
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


test('native bank counter rewards repeat on entry, never claim or pay again on reload', () => {
    let game = makeGame(); game.deductrium = 1000;
    const entry = block('bank-entrance'); assert.equal(entry.type, Type.Road);
    const before = game.saveload.serialize().balances;
    assert.equal(hit(game, 'bank-lobby'), true);
    game.hyLayer.world.onStepToAnotherTile(nameMap.get('bank-lobby'));
    assert.deepEqual(game.saveload.serialize().balances, before);
    assert.equal(confirmations, 0);
    assert.equal(hit(game, 'bank-r2t-10'), true);
    assert.deepEqual(game.saveload.serialize().balances, {reasoning:989.9,type:10});
    assert.equal(block('bank-r2t-10').type, Type.Reward);
    assert(!game.gotRewards.has('bank-r2t-10'));
    assert.equal(hit(game, 'bank-r2t-10'), true);
    assert.deepEqual(game.saveload.serialize().balances, {reasoning:979.8,type:20});
    assert.equal(hit(game, 'bank-t2r-10'), true);
    assert.deepEqual(game.saveload.serialize().balances, {reasoning:989.8,type:9.9});
    const saved=structuredClone(game.saveload.serialize()); game=makeGame(saved);
    assert.deepEqual(game.saveload.serialize().balances, saved.balances);
    game.hyLayer.world.hitReward(block('bank-r2t-10'),nameMap.get('bank-r2t-10'),true);
    assert.deepEqual(game.saveload.serialize().balances, saved.balances);
    const snapshot=game.saveload.serialize();
    assert.equal(hit(game, 'bank-t2r-10'), false);
    assert.deepEqual(game.saveload.serialize(), snapshot);
    assert.equal(game.deductriumConsumed, 0);
});


test('native bank exchanging 101 type for 100 reasoning unlocks economic achievements', () => {
    const game = makeGame({ ...saveData(), balances: { reasoning: 0, type: 101 } });
    assert.deepEqual(game.saveload.serialize().ac, []);

    assert.equal(hit(game, 'bank-t2r-100'), true);
    const result = game.saveload.serialize();
    assert.deepEqual(result.balances, { reasoning: 100, type: 0 });
    assert.deepEqual(new Set(result.ac), new Set(['firstEat', 'vegan40']));
    assert.equal(result.DC, 0);
    assert.equal(result.TC, 0);
    assert.equal(block('bank-t2r-100').type, Type.Reward);
    assert(!result.rw.includes('bank-t2r-100'));
    assert.equal(confirmations, 0);
});

test('native bank rejects insufficient type including the fee without debit or achievements', () => {
    const game = makeGame({ ...saveData(), balances: { reasoning: 0, type: 100 } });
    const before = structuredClone(game.saveload.serialize());
    const counterBefore = structuredClone(block('bank-t2r-100'));

    for (let attempt = 0; attempt < 2; attempt++) {
        assert.equal(hit(game, 'bank-t2r-100'), false);
        assert.deepEqual(game.saveload.serialize(), before);
        assert.deepEqual(block('bank-t2r-100'), counterBefore);
    }
    assert.equal(confirmations, 0);
});

test('native bank restore with sufficient funds never exchanges or grants achievements', () => {
    // Include a legacy claim to exercise applyGotRewards as well as hitReward(isLoading).
    const data = { ...saveData(['bank-t2r-100']), balances: { reasoning: 0, type: 101 } };
    let game = makeGame(data);
    assert.deepEqual(game.saveload.serialize().balances, { reasoning: 0, type: 101 });
    assert.deepEqual(game.saveload.serialize().ac, []);
    assert.equal(block('bank-t2r-100').type, Type.Reward);
    assert.equal(Object.hasOwn(block('bank-t2r-100').data, 'got'), false);

    const before = structuredClone(game.saveload.serialize());
    for (let replay = 0; replay < 2; replay++) {
        assert.equal(game.hyLayer.world.hitReward(block('bank-t2r-100'), nameMap.get('bank-t2r-100'), true), true);
        assert.deepEqual(game.saveload.serialize(), before);
    }
    game = makeGame(before);
    assert.deepEqual(game.saveload.serialize(), before);
    assert.equal(block('bank-t2r-100').type, Type.Reward);
    assert.equal(confirmations, 0);
});

test('actual script callback executes staged branches, unlocks achievement/info and reloads without effects',()=>{
    const script=`if layer G-layer and axiom a3 and tile branch-door == gate
        disable axiom a3
        give key red
        unlock layer T-layer
        unlock achievement scripted-branch
        unlock info mec:scripted-branch
        open gate branch-door
        if layer T-layer and not axiom a3 and tile branch-door == road
            give currency type 7
            set text branch-sign "Done"
        else
            take money 1000
        end
    else
        give money 999
    end`;
    const tiles=[['0',{type:Type.Reward,name:'branch-prize',text:'Branch',data:{script}}],
        ['1',{type:Type.Gate,name:'branch-door',text:'Door',data:{never:true}}],
        ['2',{type:Type.Road,name:'branch-sign',text:'Before',data:{}}]];
    let game=makeGame(undefined,'survival',tiles);
    assert.equal(hit(game,'branch-prize'),true);
    assert.equal(game.typeDeductrium,7); assert.equal(game.deductrium,0);
    assert(game.gotAchievements.has('scripted-branch'));assert(game.unlockedInfos.has('mec:scripted-branch'));
    assert(game.mapScript.layers.includes('T-layer'));assert(game.hsLayer.disabled.includes('a3'));
    assert.equal(block('branch-door').type,Type.Road); assert.equal(block('branch-sign').text,'Done');
    const saved=structuredClone(game.saveload.serialize());game=makeGame(saved,'survival',tiles);
    assert.equal(hit(game,'branch-prize'),true);assert.deepEqual(game.saveload.serialize().balances,saved.balances);
    assert(game.gotAchievements.has('scripted-branch'));assert(game.unlockedInfos.has('mec:scripted-branch'));
    assert.equal(block('branch-sign').text,'Done');
});

test('net-zero script rewards retain both earning and spending achievements without replaying payment',()=>{
    const tiles=[['0',{type:Type.Reward,name:'balanced-prize',text:'Balanced',data:{script:'give money 40\ntake money 40'}}]];
    let game=makeGame(undefined,'survival',tiles);
    assert.equal(hit(game,'balanced-prize'),true);
    assert.equal(game.deductrium,0);assert.equal(game.deductriumConsumed,40);
    for(const id of ['firstEat','firstPay','vegan40']) assert(game.gotAchievements.has(id),id);
    const saved=structuredClone(game.saveload.serialize());game=makeGame(saved,'survival',tiles);
    assert.equal(hit(game,'balanced-prize'),true);
    assert.equal(game.deductrium,0);assert.equal(game.deductriumConsumed,40);
});

test('reset reward can be reclaimed once without duplicate payout after ordinary script commits or reload', () => {
    const tiles = [
        ['0', { type: Type.Reward, name: 'reset-prize', text: 'Prize', data: { getD: 4 } }],
        ['1', { type: Type.Road, name: 'reset-switch', text: 'Reset', data: { script: 'event repeat; reset reward reset-prize' } }],
        ['2', { type: Type.Road, name: 'ordinary-script', text: 'Ordinary', data: { script: 'event repeat; give key visited' } }],
    ];
    let game = makeGame(undefined, 'survival', tiles);
    const observations = [];
    const observe = stage => {
        const save = game.saveload.serialize();
        observations.push({ stage, balance: save.balances.reasoning, claimed: save.rw.includes('reset-prize') });
        assert.equal(save.balances.type, 0);
    };

    assert.equal(hit(game, 'reset-prize'), true);
    observe('first claim');
    assert.equal(hit(game, 'reset-switch'), true);
    assert.equal(block('reset-prize').type, Type.Reward);
    observe('reset');
    assert.equal(hit(game, 'reset-prize'), true);
    observe('reclaimed');
    assert.equal(hit(game, 'ordinary-script'), true);
    assert(game.saveload.serialize().ms.keys.includes('visited'));
    observe('ordinary script committed');
    assert.equal(hit(game, 'reset-prize'), true);
    observe('touched after ordinary script');

    const saved = structuredClone(game.saveload.serialize());
    game = makeGame(saved, 'survival', tiles);
    observe('reloaded');
    assert.equal(hit(game, 'reset-prize'), true);
    observe('touched after reload');

    assert.deepEqual(observations, [
        { stage: 'first claim', balance: 4, claimed: true },
        { stage: 'reset', balance: 4, claimed: false },
        { stage: 'reclaimed', balance: 8, claimed: true },
        { stage: 'ordinary script committed', balance: 8, claimed: true },
        { stage: 'touched after ordinary script', balance: 8, claimed: true },
        { stage: 'reloaded', balance: 8, claimed: true },
        { stage: 'touched after reload', balance: 8, claimed: true },
    ]);
});

test('event repeat reward switches from keep to consume and stays Road without payments or counts on later touches or reload', () => {
    const script = `event repeat
give money 2
add count visits 1
if flag kept
    reward consume
else
    reward keep
    set flag kept
end`;
    const tiles = [['0', { type: Type.Reward, name: 'consume-prize', text: 'Prize', data: { script } }]];
    let game = makeGame(undefined, 'survival', tiles);
    const observations = [];
    const observe = stage => {
        const save = game.saveload.serialize();
        observations.push({ stage, type: block('consume-prize').type,
            balance: save.balances.reasoning, visits: save.ms.counts.visits });
    };

    assert.equal(hit(game, 'consume-prize'), true);
    observe('kept');
    assert.equal(hit(game, 'consume-prize'), true);
    observe('consumed');
    assert.equal(hit(game, 'consume-prize'), true);
    observe('third touch');
    const saved = structuredClone(game.saveload.serialize());
    game = makeGame(saved, 'survival', tiles);
    observe('reloaded');
    assert.equal(hit(game, 'consume-prize'), true);
    observe('touched after reload');

    assert.deepEqual(observations, [
        { stage: 'kept', type: Type.Reward, balance: 2, visits: 1 },
        { stage: 'consumed', type: Type.Road, balance: 4, visits: 2 },
        { stage: 'third touch', type: Type.Road, balance: 4, visits: 2 },
        { stage: 'reloaded', type: Type.Road, balance: 4, visits: 2 },
        { stage: 'touched after reload', type: Type.Road, balance: 4, visits: 2 },
    ]);
});
