// Exercise the generated modules used by the game; source compilation is performed separately.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_CURRENCY_BALANCE, createCurrencyBalances, validateCurrencyId, validateCurrencyBalances, validateBankConfig, quoteExchange, exchange } from '../js/hy/economy.js';

const rule = (extra = {}) => ({ from: 'reasoning', to: 'type', rate: 2, feeRate: 0.1, feeFixed: 1,
    minimum: 2, rounding: 'floor', precision: 2, ...extra });
const bank = (extra = {}) => ({ rules: [rule(extra)] });

test('legacy D initializes only reasoning; both ledgers validate independently', () => {
    assert.deepEqual(createCurrencyBalances(37), { reasoning: 37, type: 0 });
    assert.deepEqual(createCurrencyBalances(37, 9), { reasoning: 37, type: 9 });
    assert.deepEqual(createCurrencyBalances(MAX_CURRENCY_BALANCE, MAX_CURRENCY_BALANCE), { reasoning: 1e12, type: 1e12 });
    for (const value of [undefined, null, '3', -1, NaN, Infinity, -Infinity, 1e12 + 1]) {
        assert.throws(() => createCurrencyBalances(value));
        if (value !== undefined) assert.throws(() => createCurrencyBalances(1, value));
    }
});

test('quotes and exchanges agree, return both new balances, and never mutate or alias inputs', () => {
    const balances = Object.freeze({ reasoning: 100, type: 5 });
    const config = Object.freeze({ rules: Object.freeze([Object.freeze(rule())]) });
    const quote = quoteExchange(balances, config, 'reasoning', 10);
    const result = exchange(balances, config, 'reasoning', 10);
    assert.deepEqual(result, { balances: { reasoning: 88, type: 25 }, from: 'reasoning', to: 'type', amount: 10, fee: 2, debit: 12, credit: 20 });
    assert.deepEqual(quote, result);
    assert.notEqual(quote.balances, result.balances);
    quote.balances.reasoning = 0;
    assert.equal(balances.reasoning, 100);
    assert.equal(result.balances.reasoning, 88);
    const snapshot = validateBankConfig(config);
    snapshot.rules[0].rate = 9;
    assert.equal(config.rules[0].rate, 2);
});

test('reverse direction needs explicit policy and applies its own rate, minimum and fee', () => {
    const config = { rules: [rule(), rule({ from: 'type', to: 'reasoning', rate: 0.5, feeRate: 0.25, feeFixed: 2, minimum: 4 })] };
    const result = exchange({ reasoning: 1, type: 20 }, config, 'type', 8);
    assert.deepEqual(result, { balances: { reasoning: 5, type: 8 }, from: 'type', to: 'reasoning', amount: 8, fee: 4, debit: 12, credit: 4 });
    assert.throws(() => exchange({ reasoning: 1, type: 20 }, bank(), 'type', 8), /Unsupported bank direction/);
    assert.throws(() => exchange({ reasoning: 1, type: 20 }, config, 'type', 3), /minimum/);
});

test('authors explicitly select every rounding mode and decimal precision', () => {
    for (const [rounding, precision, expected] of [
        ['none', 0, 3.125], ['floor', 2, 3.12], ['ceil', 2, 3.13], ['round', 2, 3.13],
        ['floor', 0, 3], ['ceil', 0, 4], ['round', 0, 3], ['floor', 12, 3.125],
    ]) {
        const quote = quoteExchange({ reasoning: 10, type: 0 }, bank({ rate: 1.5625, feeRate: 0, feeFixed: 0, rounding, precision }), 'reasoning', 2);
        assert.equal(quote.credit, expected);
        assert.equal(quote.balances.type, expected);
    }
    const quote = quoteExchange({ reasoning: 10, type: 0 }, bank({ feeRate: 0.125, feeFixed: 0.25 }), 'reasoning', 2);
    assert.equal(quote.fee, 0.5);
    assert.equal(quote.debit, 2.5);
    assert.equal(quote.credit, 4);
});

test('missing policy is never replaced by implicit gameplay defaults', () => {
    for (const field of Object.keys(rule())) {
        const config = bank(); delete config.rules[0][field];
        assert.throws(() => validateBankConfig(config), new RegExp(`missing ${field}`));
    }
    for (const config of [undefined, null, [], {}, { rules: [] }, { rules: {} }, { rules: [rule(), rule()] },
        { rules: [rule(), rule(), rule()] }, { rules: [null] }, { rules: Array(1) },
        { rules: [rule({ from: '__proto__' })] }, { rules: [rule({ to: 'reasoning' })] },
        { rules: [rule({ rate: 0 })] }, { rules: [rule({ rounding: 'auto' })] },
        { rules: [rule({ precision: -1 })] }, { rules: [rule({ precision: 13 })] },
        { rules: [rule({ precision: 1.5 })] }, { rules: [rule({ precision: '2' })] }]) {
        assert.throws(() => validateBankConfig(config));
    }
    for (const field of ['rate', 'feeRate', 'feeFixed', 'minimum']) {
        for (const value of [null, '2', NaN, Infinity, -1, 1e12 + 1]) {
            assert.throws(() => validateBankConfig(bank({ [field]: value })), undefined, `${field}=${value}`);
        }
    }
    assert.doesNotThrow(() => validateBankConfig(bank({ feeRate: 0, feeFixed: 0, minimum: 0, precision: 0 })));
});

test('JSON configuration rejects accessors without running them', () => {
    let reads = 0;
    const getter = { enumerable: true, get() { reads++; return 2; } };
    const config = bank(); Object.defineProperty(config.rules[0], 'rate', getter);
    assert.throws(() => validateBankConfig(config), /JSON/);
    const array = [rule()]; Object.defineProperty(array, '0', getter);
    assert.throws(() => validateBankConfig({ rules: array }), /JSON/);
    const balances = Object.defineProperty({ type: 0 }, 'reasoning', getter);
    assert.throws(() => exchange(balances, bank(), 'reasoning', 2), /JSON/);
    assert.equal(reads, 0);
});

test('all invalid amounts, balances, arithmetic overflows and rounded zero transfers fail atomically', () => {
    const balances = { reasoning: 20, type: 3 }, config = bank();
    const before = JSON.stringify({ balances, config });
    for (const amount of [0, -1, 1, null, '2', NaN, Infinity, 1e12 + 1, 20]) {
        for (const calculate of [quoteExchange, exchange]) assert.throws(() => calculate(balances, config, 'reasoning', amount));
        assert.equal(JSON.stringify({ balances, config }), before);
    }
    for (const side of ['reasoning', 'type']) {
        for (const value of [-1, NaN, Infinity, null, '2', 1e12 + 1]) {
            assert.throws(() => exchange({ ...balances, [side]: value }, config, 'reasoning', 2));
        }
    }
    assert.throws(() => exchange(balances, config, 'D', 2), /currency/);
    assert.throws(() => exchange({ reasoning: 1e12, type: 0 }, bank({ rate: 1e12 }), 'reasoning', 2), /Credit/);
    assert.throws(() => exchange({ reasoning: 1e12, type: 0 }, bank({ feeRate: 1e12 }), 'reasoning', 2), /Fee/);
    // Fee itself is valid at the limit; adding the principal must overflow the debit.
    assert.throws(() => exchange({ reasoning: 1e12, type: 0 }, bank({ feeRate: 0, feeFixed: 1e12 }), 'reasoning', 2), /Debit/);
    assert.throws(() => exchange({ reasoning: 20, type: 1e12 }, config, 'reasoning', 2), /Target balance/);
    assert.throws(() => exchange(balances, bank({ rate: 0.001, rounding: 'floor', precision: 0 }), 'reasoning', 2), /credit must be positive/);
    assert.throws(() => exchange({ reasoning: 1e12, type: 0 }, bank({ rate: 1e12, minimum: 0, feeRate: 0, feeFixed: 0, rounding: 'none' }), 'reasoning', 1e-20), /balance precision/);
    assert.throws(() => exchange({ reasoning: 20, type: 1e12 }, bank({ rate: 1e-20, feeRate: 0, feeFixed: 0, rounding: 'none' }), 'reasoning', 2), /balance precision/);
    const exact = exchange({ reasoning: 1e12, type: 0 }, bank({ rate: 1, feeRate: 0, feeFixed: 0 }), 'reasoning', 1e12);
    assert.deepEqual(exact.balances, { reasoning: 0, type: 1e12 });
});

test('confirmation recalculates against current funds and changed author policy', () => {
    const balances = { reasoning: 20, type: 0 }, config = bank();
    assert.equal(quoteExchange(balances, config, 'reasoning', 10).debit, 12);
    assert.throws(() => exchange({ reasoning: 11, type: 0 }, config, 'reasoning', 10), /Insufficient/);
    config.rules[0].rate = 3;
    assert.equal(exchange(balances, config, 'reasoning', 10).credit, 30);
    assert.deepEqual(balances, { reasoning: 20, type: 0 });
});

test('extra registered currencies initialize independently and cannot replace built-in ledgers', () => {
    const extra = { 'mod:alpha': 9, 'mod:beta': 9 };
    const balances = createCurrencyBalances(20, 7, extra);
    assert.deepEqual(balances, { reasoning: 20, type: 7, 'mod:alpha': 9, 'mod:beta': 9 });
    balances['mod:alpha']++;
    assert.equal(extra['mod:alpha'], 9);
    assert.equal(balances['mod:beta'], 9);
    assert.throws(() => createCurrencyBalances(20, 7, { reasoning: 1 }), /cannot override/);
    assert.throws(() => createCurrencyBalances(20, 7, { type: 7 }), /cannot override/);
    assert.deepEqual(validateCurrencyBalances(extra), extra);
    assert.notEqual(validateCurrencyBalances(extra), extra);
    for (const amount of [NaN, Infinity, -1, null, '1', 1e12 + 1]) {
        assert.throws(() => createCurrencyBalances(20, 7, { 'mod:alpha': amount }));
    }
});

test('registry IDs reject dangerous prototype keys, script separators and malformed JSON records', () => {
    for (const id of ['', '__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty',
        'bad id', 'bad;id', 'bad"id', 'bad\0id', 'x'.repeat(129), 1, null]) {
        assert.throws(() => validateCurrencyId(id));
        if (typeof id === 'string') assert.throws(() => validateCurrencyBalances(JSON.parse(`{${JSON.stringify(id)}:0}`)));
    }
    for (const id of ['reasoning', 'type', 'mod:alpha', '币种甲', 'x'.repeat(128)]) assert.equal(validateCurrencyId(id), id);
    const accessor = Object.defineProperty({}, 'mod:alpha', { enumerable: true, get() { throw new Error('executed'); } });
    assert.throws(() => validateCurrencyBalances(accessor), /JSON/);
    for (const input of [null, [], 3, new Date(), Object.create({ 'mod:alpha': 3 })]) assert.throws(() => validateCurrencyBalances(input));
});

test('multi-target banks need a target only when ambiguous and never merge mod balances', () => {
    const balances = createCurrencyBalances(100, 0, { 'mod:alpha': 10, 'mod:beta': 10 });
    const config = { rules: [
        rule({ to: 'mod:alpha', feeRate: 0, feeFixed: 0, rate: 2 }),
        rule({ to: 'mod:beta', feeRate: 0, feeFixed: 0, rate: 3 }),
        rule({ from: 'mod:alpha', to: 'mod:beta', feeRate: 0, feeFixed: 0, rate: 4 }),
    ] };
    const before = JSON.stringify({ balances, config });
    assert.equal(validateBankConfig(config).rules.length, 3);
    for (const calculate of [quoteExchange, exchange]) {
        assert.throws(() => calculate(balances, config, 'reasoning', 2), /Ambiguous bank direction/);
        const result = calculate(balances, config, 'reasoning', 2, 'mod:beta');
        assert.deepEqual(result.balances, { reasoning: 98, type: 0, 'mod:alpha': 10, 'mod:beta': 16 });
        assert.equal(result.to, 'mod:beta');
        assert.deepEqual(calculate(balances, config, 'mod:alpha', 2).balances,
            { reasoning: 100, type: 0, 'mod:alpha': 8, 'mod:beta': 18 });
        assert.throws(() => calculate(balances, config, 'reasoning', 2, 'type'), /Unsupported bank direction/);
    }
    assert.equal(JSON.stringify({ balances, config }), before);
});

test('all bank directions must involve registered currencies, including unused rules', () => {
    const balances = createCurrencyBalances(100);
    for (const config of [
        bank({ to: 'mod:missing' }), bank({ from: 'mod:missing' }),
        { rules: [rule(), rule({ from: 'mod:missing', to: 'type' })] },
    ]) {
        assert.doesNotThrow(() => validateBankConfig(config)); // Structural author-data validation.
        assert.throws(() => validateBankConfig(config, balances), /Unregistered currency/);
        assert.throws(() => quoteExchange(balances, config, 'reasoning', 2), /Unregistered currency/);
        assert.throws(() => exchange(balances, config, 'reasoning', 2), /Unregistered currency/);
    }
    assert.throws(() => exchange(balances, bank(), 'mod:missing', 2), /Unregistered currency/);
    assert.throws(() => exchange(balances, bank(), 'reasoning', 2, 'mod:missing'), /Unregistered currency/);
    assert.equal(Object.hasOwn(balances, 'mod:missing'), false);
});

test('bank rule limits count unique directed pairs rather than source currencies', () => {
    const rules = Array.from({ length: 64 }, (_, index) => rule({ to: `mod:coin${index}` }));
    assert.equal(validateBankConfig({ rules }).rules.length, 64);
    assert.throws(() => validateBankConfig({ rules: [...rules, rule({ to: 'mod:coin64' })] }), /1\.\.64/);
    assert.throws(() => validateBankConfig({ rules: [rule({ to: 'mod:alpha' }), rule({ to: 'mod:alpha', rate: 9 })] }), /Duplicate bank direction/);
    assert.doesNotThrow(() => validateBankConfig({ rules: [rule({ to: 'mod:alpha' }), rule({ from: 'mod:alpha', to: 'reasoning' })] }));
});
