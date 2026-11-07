// Run after the project's normal TypeScript build: node test/test-map-appearance.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tileColor, tileTextColor, tileDisplayText } from '../js/hy/appearance.js';
import { stringifyDeductriumAmout } from '../js/format.js';
import { LangMgr } from '../js/lang.js';
import { TileBlockType as Type } from '../js/hy/maploader.js';

const tile = (text = 'A→A', data, type = Type.Gate) => ({ type, text, data });
const withDocument = (theme, run) => {
    const previous = globalThis.document;
    globalThis.document = { documentElement: { dataset: { theme } }, querySelectorAll: () => [] };
    try { return run(); }
    finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
};
const withLanguage = (lang, run) => withDocument('light', () => {
    const previous = { lang: LangMgr.lang, text: LangMgr.text };
    new LangMgr(lang);
    try { return run(); }
    finally { Object.assign(LangMgr, previous); }
});

test('each tile type and missing tiles retain the survival light and dark colors', () => {
    for (const [theme, fills, text] of [
        ['light', ['rgb(255,255,255)', 'rgb(220,220,220)', 'rgb(250,160,20)', 'rgb(200,255,20)', 'rgb(180,255,240)'],
            ['rgb(0,80,0)', 'rgb(60,60,255)', 'rgb(33,38,255)', 'rgb(255,0,0)', 'rgb(30,20,100)']],
        ['dark', ['#202d3c', '#101925', '#78501e', '#344b25', '#193f49'],
            ['#c6dfcd', '#93b8ff', '#fff0cb', '#e0f6a5', '#b4efef']],
    ]) withDocument(theme, () => {
        for (const type of [Type.Road, Type.Wall, Type.Gate, Type.Reward, Type.Ordinal]) {
            const block = tile('', undefined, type);
            assert.equal(tileColor(block, false, false), fills[type]);
            assert.equal(tileTextColor(block), text[type]);
        }
        assert.equal(tileColor(undefined, true, true), fills[Type.Wall]);
    });
});

test('cash highlights require the flag, reward, nonzero amount, and an unclaimed tile', () => {
    for (const [theme, highlight, reward, road] of [
        ['light', 'rgb(255,255,0)', 'rgb(200,255,20)', 'rgb(255,255,255)'],
        ['dark', '#706018', '#344b25', '#202d3c'],
    ]) withDocument(theme, () => {
        const cash = tile('', { getD: 100 }, Type.Reward);
        for (const flag of [false, true]) for (const unlocked of [false, true]) {
            assert.equal(tileColor(cash, flag, unlocked), flag && unlocked ? highlight : reward);
        }
        assert.equal(tileColor(tile('', { getD: 0 }, Type.Reward), true, true), reward);
        assert.equal(tileColor(tile('', { getD: 100, got: true }, Type.Reward), true, true), reward);
        assert.equal(tileColor(tile('', { getD: 100, got: true }, Type.Road), true, true), road);
        assert.equal(tileColor(tile('', { getD: -1 }, Type.Gate), true, true), highlight);
    });
});

test('display preserves literal Unicode, language lookup, first-language and empty fallbacks', () => {
    for (const lang of ['zh', 'en']) withLanguage(lang, () => {
        assert.equal(tileDisplayText(tile('∀x：A→A\n#imm')), '∀x：A→A\n#imm');
        assert.equal(tileDisplayText(tile({ zh: '中文', en: 'English' })), lang === 'zh' ? '中文' : 'English');
        assert.equal(tileDisplayText(tile({ fr: 'premier', de: 'zweiter' })), 'premier');
        assert.equal(tileDisplayText(tile({ zh: '', en: '' })), '');
        assert.equal(tileDisplayText(tile({})), '');
        assert.equal(tileDisplayText(tile('A→A', { p: true })), 'A→A\n#p');
        assert.equal(tileDisplayText(tile('A→A', { d: true })), 'A→A\n#d');
        assert.equal(tileDisplayText(tile('A→A', { p: true, d: true })), 'A→A\n#p');
    });
});

test('destruction, never rewards, money and unlock prefixes keep their original precedence', () => {
    for (const [lang, copy] of [
        ['en', {
            del: '(Destructed gate)', never: "You'll never get this reward!",
            gotNever: "You obtained the reward that\nshould never be obtainable.\nIf you didn't cheat,\nthis is a game bug — please contact the author",
            destruct: 'Destruct Gate K', cash: 'Obtain 1mg of deductrium', gotCash: 'Obtained 1mg of deductrium',
            pay: 'To pass this gate you need 2mg of deductrium', unlock: 'Unlock ', unlocked: 'Unlocked ',
        }],
        ['zh', {
            del: '(此门已拆除)', never: '你永远别想拿到这个奖励！',
            gotNever: '你拿到了本该\n永远拿不到的奖励\n如果你没有作弊\n则是游戏bug，请联系作者',
            destruct: '拆除门K', cash: '获取1mg推理素', gotCash: '已获取1mg推理素',
            pay: '通过此门需消耗推理素2mg', unlock: '解锁', unlocked: '已解锁',
        }],
    ]) withLanguage(lang, () => {
        assert.equal(tileDisplayText(tile('A→A', { p: true, del: true })), 'A→A\n#p\n' + copy.del);
        const data = { p: true, del: true, never: true };
        assert.equal(tileDisplayText(tile('base', data)), copy.never);
        assert.equal(tileDisplayText(tile('base', { ...data, got: true })), copy.gotNever);
        data.dstr = 'K';
        assert.equal(tileDisplayText(tile('base', data)), copy.destruct);
        data.getD = 1000;
        assert.equal(tileDisplayText(tile('base', data)), copy.cash);
        assert.equal(tileDisplayText(tile('base', { ...data, got: true })), copy.gotCash);
        data.payD = 2000;
        assert.equal(tileDisplayText(tile('base', data)), copy.pay);
        data.unl = true;
        assert.equal(tileDisplayText(tile('base', data)), copy.unlock + copy.pay);
        assert.equal(tileDisplayText(tile('base', { ...data, got: true })), copy.unlocked + copy.pay);
        data.requiresReward = 'mct';
        assert.equal(tileDisplayText(tile('base', data)), copy.unlock + copy.cash);
        assert.equal(tileDisplayText(tile('base', { payD: 2000, requiresReward: 'mct' })), 'base');
        assert.equal(tileDisplayText(tile('base', { getD: 0, payD: 0, dstr: '', unl: false })), 'base');
    });
});

test('shared deductrium formatting retains signs, fractions and all unit thresholds', () => {
    for (const [amount, expected] of [
        [0, '0µg'], [0.125, '0.125µg'], [999, '999µg'], [1000, '1mg'], [1500, '1.5mg'],
        [999999, '999.999mg'], [1e6, '1g'], [999999999, '999.999999g'], [1e9, '1kg'],
        [999999999999, '999.999999999kg'], [1e12, '1T'], [1.25e12, '1.25T'],
        [-7, '-7µg'], [-1000, '-1mg'], [-1e6, '-1g'], [-1e9, '-1kg'], [-1e12, '-1T'],
    ]) assert.equal(stringifyDeductriumAmout(amount), expected);
});
