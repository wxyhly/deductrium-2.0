/** Pure registered-currency accounting. Bank policy is explicit author data. */
export type Currency = string;
export type CurrencyBalances = Record<Currency, number>;

export interface BankExchangeRule {
    from: Currency;
    to: Currency;
    rate: number;
    feeRate: number;
    feeFixed: number;
    minimum: number;
    rounding: 'none' | 'floor' | 'ceil' | 'round';
    precision: number;
}

export interface BankConfig {
    rules: readonly BankExchangeRule[];
}

export interface ExchangeResult {
    balances: CurrencyBalances;
    from: Currency;
    to: Currency;
    amount: number;
    fee: number;
    debit: number;
    credit: number;
}

export const MAX_CURRENCY_BALANCE = 1e12;

function amountValue(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_CURRENCY_BALANCE) {
        throw new Error(`${label} must be finite and within 0..1e12`);
    }
    return value;
}

/** Currency IDs are global registry keys, never module-instance references. */
export function validateCurrencyId(value: unknown): Currency {
    if (typeof value !== 'string' || !value.length || value.length > 128 || /[\s\u0000-\u001f\u007f;"]/.test(value)
        || value === 'prototype' || Object.hasOwn(Object.prototype, value)) throw new Error('Invalid currency ID');
    return value;
}

function dataRecord(value: unknown, fields: readonly string[] | undefined, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
        throw new Error(`${label} must be a plain object`);
    }
    for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (typeof key !== 'string' || (fields && !fields.includes(key)) || !descriptor.enumerable || !('value' in descriptor)) {
            throw new Error(`${label} must contain only the declared JSON fields`);
        }
    }
    for (const field of fields ?? []) {
        if (!Object.hasOwn(value, field)) throw new Error(`${label} is missing ${field}`);
    }
    return value as Record<string, unknown>;
}

/** Clone exactly the registered ledgers; never synthesize an unregistered currency. */
export function validateCurrencyBalances(input: unknown): CurrencyBalances {
    const values = dataRecord(input, undefined, 'Balances');
    const result: CurrencyBalances = {};
    for (const [id, amount] of Object.entries(values)) {
        result[validateCurrencyId(id)] = amountValue(amount, `Balance ${id}`);
    }
    return result;
}

/** The caller passes legacy D as money: it belongs only to reasoning, never to both ledgers. */
export function createCurrencyBalances(money: number, typeMoney = 0, extra: Readonly<CurrencyBalances> = {}): CurrencyBalances {
    const additional = validateCurrencyBalances(extra);
    if (Object.hasOwn(additional, 'reasoning') || Object.hasOwn(additional, 'type')) {
        throw new Error('Extra balances cannot override reasoning or type');
    }
    return { reasoning: amountValue(money, 'Reasoning balance'), type: amountValue(typeMoney, 'Type balance'), ...additional };
}

/** Validate every direction, and return an independent snapshot for planning or quoting. */
export function validateBankConfig(input: unknown, balances?: Readonly<CurrencyBalances>): BankConfig {
    const bank = dataRecord(input, ['rules'], 'Bank');
    const registered = balances === undefined ? undefined : validateCurrencyBalances(balances);
    if (!Array.isArray(bank.rules) || bank.rules.length < 1 || bank.rules.length > 64) {
        throw new Error('Bank rules must contain 1..64 directions');
    }
    const rules: BankExchangeRule[] = [];
    const directions = new Set<string>();
    for (let index = 0; index < bank.rules.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(bank.rules, String(index));
        if (!descriptor || !('value' in descriptor)) throw new Error('Bank rules must contain JSON array entries');
        const rule = dataRecord(descriptor.value,
            ['from', 'to', 'rate', 'feeRate', 'feeFixed', 'minimum', 'rounding', 'precision'], 'Bank rule');
        const from = validateCurrencyId(rule.from), to = validateCurrencyId(rule.to);
        if (from === to) throw new Error('Bank currencies must be different');
        if (registered) {
            for (const id of [from, to]) {
                if (!Object.hasOwn(registered, id)) throw new Error(`Unregistered currency: ${id}`);
            }
        }
        const direction = `${from}\0${to}`;
        if (directions.has(direction)) throw new Error(`Duplicate bank direction: ${from} -> ${to}`);
        directions.add(direction);
        const rate = amountValue(rule.rate, 'Rate');
        if (rate === 0) throw new Error('Rate must be positive');
        const feeRate = amountValue(rule.feeRate, 'Fee rate');
        const feeFixed = amountValue(rule.feeFixed, 'Fixed fee');
        const minimum = amountValue(rule.minimum, 'Minimum');
        const rounding = rule.rounding;
        if (rounding !== 'none' && rounding !== 'floor' && rounding !== 'ceil' && rounding !== 'round') {
            throw new Error('Invalid rounding mode');
        }
        const precision = rule.precision;
        if (typeof precision !== 'number' || !Number.isInteger(precision) || precision < 0 || precision > 12) {
            throw new Error('Precision must be an integer within 0..12');
        }
        rules.push({ from, to, rate, feeRate, feeFixed, minimum, rounding, precision });
    }
    return { rules };
}

/** Fee is extra source currency; only target credit is rounded. No input is changed.
 * All balances, policy amounts and intermediate transfers are bounded by 1e12.
 * Recompute on confirmation against current balances/configuration; a quote reserves nothing.
 */
export function quoteExchange(balances: Readonly<CurrencyBalances>, bank: BankConfig, from: Currency, amount: number, to?: Currency): ExchangeResult {
    const next = validateCurrencyBalances(balances);
    const config = validateBankConfig(bank, next);
    validateCurrencyId(from);
    if (!Object.hasOwn(next, from)) throw new Error(`Unregistered currency: ${from}`);
    if (to !== undefined) {
        validateCurrencyId(to);
        if (!Object.hasOwn(next, to)) throw new Error(`Unregistered currency: ${to}`);
    }
    amountValue(amount, 'Exchange amount');
    if (amount === 0) throw new Error('Exchange amount must be positive');
    const candidates = config.rules.filter(candidate => candidate.from === from && (to === undefined || candidate.to === to));
    if (candidates.length > 1) throw new Error(`Ambiguous bank direction: ${from}; specify target currency`);
    const rule = candidates[0];
    if (!rule) throw new Error(`Unsupported bank direction: ${from}${to === undefined ? '' : ` -> ${to}`}`);
    if (amount < rule.minimum) throw new Error('Exchange amount is below minimum');
    const fee = amountValue(amount * rule.feeRate + rule.feeFixed, 'Fee');
    const debit = amountValue(amount + fee, 'Debit');
    if (next[from] < debit) throw new Error(`Insufficient ${from} currency`);
    const rawCredit = amountValue(amount * rule.rate, 'Credit');
    const factor = 10 ** rule.precision;
    const credit = amountValue(rule.rounding === 'none' ? rawCredit
        : Math[rule.rounding](rawCredit * factor) / factor, 'Rounded credit');
    if (credit === 0) throw new Error('Exchange credit must be positive');
    const previousSource = next[from], previousTarget = next[rule.to];
    next[from] = amountValue(next[from] - debit, 'Source balance');
    next[rule.to] = amountValue(next[rule.to] + credit, 'Target balance');
    // Do not mint currency or burn a transfer when a delta is too small for Number precision.
    if (next[from] >= previousSource || next[rule.to] <= previousTarget) {
        throw new Error('Exchange amount is below balance precision');
    }
    return { balances: next, from, to: rule.to, amount, fee, debit, credit };
}

/** Atomic pure calculation, shared by confirmed UI operations and map scripts. */
export function exchange(balances: Readonly<CurrencyBalances>, bank: BankConfig, from: Currency, amount: number, to?: Currency): ExchangeResult {
    return quoteExchange(balances, bank, from, amount, to);
}
