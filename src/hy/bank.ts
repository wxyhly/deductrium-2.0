import { quoteExchange, validateBankConfig, type BankConfig, type CurrencyBalances, type ExchangeResult } from './economy.js';

/** The lobby counter exchanges equal principal amounts; the source pays the extra 1% fee. */
export const lobbyBank: BankConfig = {rules: [
    {from: 'reasoning', to: 'type', rate: 1, feeRate: 0.01, feeFixed: 0, minimum: 1, rounding: 'none', precision: 12},
    {from: 'type', to: 'reasoning', rate: 1, feeRate: 0.01, feeFixed: 0, minimum: 1, rounding: 'none', precision: 12},
]};

export interface MapBankOffer { bank: string; from: string; to: string; amount: number }

/** A reward tile is an explicit, repeatable counter. Merely entering a bank never transfers funds. */
export function validateMapBankOffer(input: unknown, banks: Readonly<Record<string, BankConfig>>): MapBankOffer {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid bank offer');
    const value = input as Record<string, unknown>;
    if (Object.keys(value).some(key => !['bank', 'from', 'to', 'amount'].includes(key))
        || typeof value.bank !== 'string' || typeof value.from !== 'string' || typeof value.to !== 'string'
        || typeof value.amount !== 'number') throw new Error('Invalid bank offer');
    const bank = Object.getOwnPropertyDescriptor(banks, value.bank);
    if (!bank || !('value' in bank)) throw new Error(`Unknown bank: ${value.bank}`);
    // Check policy and bounds independently of the player's funds.
    const config = validateBankConfig(bank.value);
    const rule = config.rules.find(rule => rule.from === value.from && rule.to === value.to);
    if (!rule) throw new Error(`Unsupported bank direction: ${value.from} -> ${value.to}`);
    const registered = Object.fromEntries(config.rules.flatMap(rule => [[rule.from, 0], [rule.to, 0]]));
    // Use the exact debit, so a valid small offer is not lost beside an artificial huge balance.
    registered[value.from] = value.amount + (value.amount * rule.feeRate + rule.feeFixed);
    quoteExchange(registered, config, value.from, value.amount, value.to);
    return value as unknown as MapBankOffer;
}
export function redeemMapBankOffer(input: unknown, banks: Readonly<Record<string, BankConfig>>, balances: CurrencyBalances): ExchangeResult {
    const offer = validateMapBankOffer(input, banks);
    return quoteExchange(balances, banks[offer.bank], offer.from, offer.amount, offer.to);
}
