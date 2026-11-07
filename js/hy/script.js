/** A bounded, data-only map language. This module has no game or DOM dependencies. */
import { createCurrencyBalances, exchange, validateBankConfig, validateCurrencyBalances, validateCurrencyId } from './economy.js';
const MAX_SOURCE = 16_384;
const MAX_COMMANDS = 256;
const MAX_ID = 128;
const MAX_VALUE = 1e12;
const TILE_NAMES = ['road', 'wall', 'gate', 'reward', 'ordinal'];
const COMPARISONS = ['>=', '<=', '==', '!=', '>', '<'];
const LAYERS = ['D-layer', 'T-layer', 'P-layer', 'G-layer'];
function fail(line, message) {
    throw new Error(`Map script line ${line}: ${message}`);
}
function validId(value, line) {
    if (typeof value !== 'string' || !value.length || value.length > MAX_ID || /[\s\u0000-\u001f\u007f;"]/.test(value)) {
        fail(line, 'Invalid ID (1–128 characters, no whitespace or script separators)');
    }
    return value;
}
function validValue(value, integer, line) {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_VALUE
        || (integer ? !Number.isSafeInteger(value) : value < 0)) {
        fail(line, integer ? 'Count must be a safe integer within ±1e12' : 'Money must be finite and within 0..1e12');
    }
    return value;
}
function parseCommand(tokens, line) {
    const words = tokens.map(token => token.value);
    const [op, kind] = words;
    const shape = (length, textAt = -1) => {
        if (tokens.length !== length || tokens.some((token, i) => token.quoted !== (i === textAt))) {
            fail(line, 'Wrong arguments; text must use JSON double quotes and IDs must be bare tokens');
        }
    };
    const id = (at) => validId(words[at], line);
    const number = (at, integer) => {
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(words[at] ?? ''))
            fail(line, 'Invalid number');
        return validValue(Number(words[at]), integer, line);
    };
    const comparison = (at) => {
        if (!COMPARISONS.includes(words[at]))
            fail(line, 'Invalid comparison');
        return words[at];
    };
    const currency = (at) => {
        try {
            return validateCurrencyId(words[at]);
        }
        catch {
            return fail(line, 'Invalid currency ID');
        }
    };
    if (op === 'exchange') {
        shape(tokens.length === 5 ? 5 : 4);
        const command = { line, op, bankId: id(1), currency: currency(2), value: number(3, false) };
        if (tokens.length === 5)
            command.to = currency(4);
        return command;
    }
    if (op === 'require') {
        if (kind === 'key' || kind === 'not-key' || kind === 'flag' || kind === 'not-flag' || kind === 'reward') {
            shape(3);
            return { line, op, kind, id: id(2) };
        }
        if (kind === 'money') {
            shape(4);
            return { line, op, kind, comparison: comparison(2), value: number(3, false) };
        }
        if (kind === 'currency') {
            shape(5);
            return { line, op, kind, currency: currency(2), comparison: comparison(3), value: number(4, false) };
        }
        if (kind === 'count') {
            shape(5);
            return { line, op, kind, id: id(2), comparison: comparison(3), value: number(4, true) };
        }
    }
    if (op === 'give' || op === 'take') {
        if (kind === 'key') {
            shape(3);
            return { line, op, kind, id: id(2) };
        }
        if (kind === 'money') {
            shape(3);
            return { line, op, kind, value: number(2, false) };
        }
        if (kind === 'currency') {
            shape(4);
            return { line, op, kind, currency: currency(2), value: number(3, false) };
        }
    }
    if ((op === 'set' || op === 'clear') && kind === 'flag') {
        shape(3);
        return { line, op, kind, id: id(2) };
    }
    if ((op === 'set' || op === 'add') && kind === 'count') {
        shape(4);
        return { line, op, kind, id: id(2), value: number(3, true) };
    }
    if ((op === 'disable' || op === 'enable') && kind === 'axiom') {
        shape(3);
        return { line, op, kind, id: id(2) };
    }
    if (op === 'unlock' && (kind === 'reward' || kind === 'layer')) {
        shape(3);
        if (kind === 'layer' && !LAYERS.includes(words[2]))
            fail(line, 'Invalid layer');
        return { line, op, kind, id: id(2) };
    }
    if ((op === 'open' || op === 'close') && kind === 'gate') {
        shape(3);
        return { line, op, kind, id: id(2) };
    }
    if (op === 'set' && kind === 'tile') {
        shape(4);
        const type = TILE_NAMES.findIndex(name => name === words[3]);
        if (type < 0)
            fail(line, 'Invalid tile type');
        return { line, op, kind, id: id(2), type };
    }
    if (op === 'set' && kind === 'text') {
        shape(4, 3);
        return { line, op, kind, id: id(2), text: words[3] };
    }
    if (op === 'message') {
        shape(2, 1);
        return { line, op, text: words[1] };
    }
    return fail(line, 'Unknown command');
}
/** Statements are separated by newlines/semicolons, except inside JSON strings. */
export function parseMapScript(source) {
    if (typeof source !== 'string')
        fail(1, 'Source must be a string');
    if (source.length > MAX_SOURCE)
        fail(1, 'Source exceeds 16384 characters');
    const commands = [];
    const lines = source.split(/\r\n|\r|\n/);
    lines.forEach((text, index) => {
        const line = index + 1;
        if (text.trimStart().startsWith('//'))
            return;
        let tokens = [];
        const flush = () => {
            if (!tokens.length)
                return;
            if (commands.length >= MAX_COMMANDS)
                fail(line, 'Script exceeds 256 commands');
            commands.push(parseCommand(tokens, line));
            tokens = [];
        };
        let cursor = 0;
        while (cursor < text.length) {
            const ch = text[cursor];
            if (/\s/.test(ch)) {
                cursor++;
                continue;
            }
            if (ch === ';') {
                flush();
                cursor++;
                continue;
            }
            const start = cursor;
            if (ch === '"') {
                cursor++;
                let closed = false;
                while (cursor < text.length) {
                    if (text[cursor] === '\\') {
                        cursor += 2;
                        continue;
                    }
                    if (text[cursor++] === '"') {
                        closed = true;
                        break;
                    }
                }
                if (!closed)
                    fail(line, 'Unterminated JSON string');
                let value;
                try {
                    value = JSON.parse(text.slice(start, cursor));
                }
                catch {
                    fail(line, 'Invalid JSON string');
                }
                if (typeof value !== 'string')
                    fail(line, 'Expected a JSON string');
                if (cursor < text.length && !/[\s;]/.test(text[cursor]))
                    fail(line, 'Missing separator after string');
                tokens.push({ value, quoted: true });
            }
            else {
                while (cursor < text.length && !/[\s;]/.test(text[cursor]))
                    cursor++;
                const value = text.slice(start, cursor);
                if (value.includes('"'))
                    fail(line, 'Missing separator before string');
                tokens.push({ value, quoted: false });
            }
        }
        flush();
    });
    return commands;
}
/** Normalizes whitespace/comments and preserves JSON text exactly. */
export function formatMapScript(commands) {
    const source = commands.map(command => {
        if (command.op === 'message')
            return `message ${JSON.stringify(command.text)}`;
        if (command.op === 'exchange')
            return `exchange ${command.bankId} ${command.currency} ${command.value}${command.to === undefined ? '' : ` ${command.to}`}`;
        if (command.op === 'require') {
            if (command.kind === 'money')
                return `require money ${command.comparison} ${command.value}`;
            if (command.kind === 'currency')
                return `require currency ${command.currency} ${command.comparison} ${command.value}`;
            if (command.kind === 'count')
                return `require count ${command.id} ${command.comparison} ${command.value}`;
            return `require ${command.kind} ${command.id}`;
        }
        if (command.kind === 'money')
            return `${command.op} money ${command.value}`;
        if (command.kind === 'currency')
            return `${command.op} currency ${command.currency} ${command.value}`;
        if (command.kind === 'count')
            return `${command.op} count ${command.id} ${command.value}`;
        if (command.kind === 'tile')
            return `set tile ${command.id} ${TILE_NAMES[command.type]}`;
        if (command.kind === 'text')
            return `set text ${command.id} ${JSON.stringify(command.text)}`;
        return `${command.op} ${command.kind} ${command.id}`;
    }).join('\n');
    parseMapScript(source);
    return source;
}
/** Only keys, flags, counters and tile references belong to a module namespace. */
export function rewriteMapScript(source, namespace) {
    const commands = parseMapScript(source).map(command => {
        if ('kind' in command && 'id' in command
            && ['key', 'not-key', 'flag', 'not-flag', 'count', 'gate', 'tile', 'text'].includes(command.kind)) {
            return { ...command, id: validId(namespace(command.id), command.line) };
        }
        return command;
    });
    return formatMapScript(commands);
}
function record(input, label) {
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)) {
        fail(1, `${label} must be a plain object`);
    }
    // Accept JSON data, not objects whose accessors execute during restoration.
    for (const key of Reflect.ownKeys(input)) {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (typeof key !== 'string' || !descriptor.enumerable || !('value' in descriptor))
            fail(1, `${label} must contain JSON data`);
    }
    return input;
}
function put(target, id, value) {
    // IDs such as __proto__ and constructor remain ordinary own JSON properties.
    Object.defineProperty(target, id, { value, writable: true, enumerable: true, configurable: true });
}
function textValue(value) {
    if (typeof value !== 'string' || value.length > MAX_SOURCE)
        fail(1, 'Text must be a string of at most 16384 characters');
    return value;
}
/** Missing fields default for old saves; present fields are strictly validated and cloned. */
export function createMapScriptState(input) {
    const state = { keys: [], flags: [], counts: {}, disabledAxioms: [], done: [], tileEdits: {}, rewards: [], layers: [] };
    if (input === undefined)
        return state;
    const restored = record(input, 'State');
    for (const key of Object.keys(restored)) {
        if (!Object.hasOwn(state, key))
            fail(1, `Unknown state field: ${key}`);
    }
    for (const field of ['keys', 'flags', 'disabledAxioms', 'done', 'rewards', 'layers']) {
        if (!Object.hasOwn(restored, field))
            continue;
        const values = restored[field];
        if (!Array.isArray(values))
            fail(1, `${field} must be an array`);
        const unique = new Set();
        for (let index = 0; index < values.length; index++) {
            const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
            if (!descriptor || !('value' in descriptor))
                fail(1, `${field} must contain JSON array entries`);
            const id = validId(descriptor.value, 1);
            if (field === 'layers' && !LAYERS.includes(id))
                fail(1, 'Invalid restored layer');
            unique.add(id);
        }
        state[field] = [...unique];
    }
    if (Object.hasOwn(restored, 'counts')) {
        for (const [id, value] of Object.entries(record(restored.counts, 'counts'))) {
            put(state.counts, validId(id, 1), validValue(value, true, 1));
        }
    }
    if (Object.hasOwn(restored, 'tileEdits')) {
        for (const [id, inputEdit] of Object.entries(record(restored.tileEdits, 'tileEdits'))) {
            validId(id, 1);
            const edit = record(inputEdit, 'Tile edit');
            if (Object.keys(edit).some(key => key !== 'type' && key !== 'text'))
                fail(1, 'Unknown tile edit field');
            const copy = {};
            if (Object.hasOwn(edit, 'type')) {
                if (typeof edit.type !== 'number' || !Number.isInteger(edit.type) || edit.type < 0 || edit.type >= TILE_NAMES.length) {
                    fail(1, 'Invalid restored tile type');
                }
                copy.type = edit.type;
            }
            if (Object.hasOwn(edit, 'text'))
                copy.text = textValue(edit.text);
            put(state.tileEdits, id, copy);
        }
    }
    return state;
}
function compare(left, comparison, right) {
    switch (comparison) {
        case '>=': return left >= right;
        case '<=': return left <= right;
        case '==': return left === right;
        case '!=': return left !== right;
        case '>': return left > right;
        case '<': return left < right;
    }
}
function changeMember(values, id, present) {
    const index = values.indexOf(id);
    if (present && index < 0)
        values.push(id);
    else if (!present && index >= 0)
        values.splice(index, 1);
}
/** Validates all references first, then simulates on an independent state with no side effects.
 * checksOnly is used by once-per-tile gates: every require observes the incoming state.
 * The caller owns once-only bookkeeping in state.done and application of returned effects.
 */
export function planMapScript(source, state, env, checksOnly = false) {
    const commands = parseMapScript(source);
    const next = createMapScriptState(state);
    if (!env || typeof env.hasTile !== 'function' || typeof env.hasAxiom !== 'function'
        || !env.rewards || typeof env.rewards.has !== 'function')
        fail(1, 'Invalid environment');
    const money = validValue(env.money, false, 1);
    let spent = 0;
    const typeMoney = validValue(env.typeMoney === undefined ? 0 : env.typeMoney, false, 1);
    let typeSpent = 0;
    const banks = new Map();
    const economyAtLine = (line, calculate) => {
        try {
            return calculate();
        }
        catch (error) {
            return fail(line, error instanceof Error ? error.message : 'Invalid bank operation');
        }
    };
    let balances = economyAtLine(1, () => env.balances === undefined
        ? createCurrencyBalances(money, typeMoney) : validateCurrencyBalances(env.balances));
    if (!Object.hasOwn(balances, 'reasoning') || !Object.hasOwn(balances, 'type')
        || balances.reasoning !== money || balances.type !== typeMoney)
        fail(1, 'Balances must match money/typeMoney');
    const effects = [];
    for (const command of commands) {
        if ('currency' in command && !Object.hasOwn(balances, command.currency))
            fail(command.line, `Unregistered currency: ${command.currency}`);
        if (command.op === 'exchange') {
            if (command.to !== undefined && !Object.hasOwn(balances, command.to))
                fail(command.line, `Unregistered currency: ${command.to}`);
            if (!banks.has(command.bankId)) {
                const descriptor = env.banks && Object.getOwnPropertyDescriptor(env.banks, command.bankId);
                if (!descriptor || !('value' in descriptor))
                    fail(command.line, `Unknown bank: ${command.bankId}`);
                banks.set(command.bankId, economyAtLine(command.line, () => validateBankConfig(descriptor.value, balances)));
            }
            const candidates = banks.get(command.bankId).rules.filter(rule => rule.from === command.currency && (command.to === undefined || rule.to === command.to));
            if (candidates.length > 1)
                fail(command.line, `Ambiguous bank direction: ${command.currency}; specify target currency`);
            const rule = candidates[0];
            if (!rule)
                fail(command.line, `Unsupported bank direction: ${command.currency}`);
            if (command.value === 0 || command.value < rule.minimum)
                fail(command.line, 'Exchange amount must be positive and meet minimum');
        }
        if ('kind' in command && 'id' in command) {
            if (['gate', 'tile', 'text'].includes(command.kind) && !env.hasTile(command.id)) {
                fail(command.line, `Unknown tile: ${command.id}`);
            }
            if (command.kind === 'axiom' && !env.hasAxiom(command.id))
                fail(command.line, `Unknown axiom: ${command.id}`);
        }
    }
    const count = (id) => Object.hasOwn(next.counts, id) ? next.counts[id] : 0;
    const tileEdit = (id) => {
        if (!Object.hasOwn(next.tileEdits, id))
            put(next.tileEdits, id, {});
        return next.tileEdits[id];
    };
    for (const command of commands) {
        const { line, op } = command;
        if (command.op === 'require') {
            let met;
            switch (command.kind) {
                case 'key':
                    met = next.keys.includes(command.id);
                    break;
                case 'not-key':
                    met = !next.keys.includes(command.id);
                    break;
                case 'flag':
                    met = next.flags.includes(command.id);
                    break;
                case 'not-flag':
                    met = !next.flags.includes(command.id);
                    break;
                case 'reward':
                    met = next.rewards.includes(command.id) || env.rewards.has(command.id);
                    break;
                case 'money':
                    met = compare(balances.reasoning, command.comparison, command.value);
                    break;
                case 'currency':
                    met = compare(balances[command.currency], command.comparison, command.value);
                    break;
                case 'count':
                    met = compare(count(command.id), command.comparison, command.value);
                    break;
            }
            if (!met)
                fail(line, `Requirement not met: ${formatMapScript([command])}`);
            continue;
        }
        if (checksOnly)
            continue;
        if (command.op === 'exchange') {
            const result = economyAtLine(line, () => exchange(balances, banks.get(command.bankId), command.currency, command.value, command.to));
            balances = result.balances;
            continue;
        }
        if (command.op === 'message') {
            effects.push({ op: 'message', text: command.text });
            continue;
        }
        switch (command.kind) {
            case 'key':
                if (op === 'take' && !next.keys.includes(command.id))
                    fail(line, `Missing key: ${command.id}`);
                changeMember(next.keys, command.id, op === 'give');
                break;
            case 'flag':
                changeMember(next.flags, command.id, op === 'set');
                break;
            case 'count':
                put(next.counts, command.id, validValue(op === 'add' ? count(command.id) + command.value : command.value, true, line));
                break;
            case 'money':
                if (op === 'take' && balances.reasoning < command.value)
                    fail(line, 'Insufficient money');
                balances.reasoning = validValue(balances.reasoning + (op === 'give' ? command.value : -command.value), false, line);
                if (op === 'take')
                    spent = validValue(spent + command.value, false, line);
                break;
            case 'currency': {
                const balance = balances[command.currency];
                if (op === 'take' && balance < command.value)
                    fail(line, `Insufficient ${command.currency} currency`);
                const updated = validValue(balance + (op === 'give' ? command.value : -command.value), false, line);
                balances[command.currency] = updated;
                if (op === 'take' && command.currency === 'reasoning')
                    spent = validValue(spent + command.value, false, line);
                if (op === 'take' && command.currency === 'type')
                    typeSpent = validValue(typeSpent + command.value, false, line);
                break;
            }
            case 'axiom':
                changeMember(next.disabledAxioms, command.id, op === 'disable');
                break;
            case 'reward':
                if (!next.rewards.includes(command.id)) {
                    next.rewards.push(command.id);
                    if (!env.rewards.has(command.id))
                        effects.push({ op: 'reward', id: command.id });
                }
                break;
            case 'layer':
                if (!next.layers.includes(command.id)) {
                    next.layers.push(command.id);
                    effects.push({ op: 'layer', id: command.id });
                }
                break;
            case 'gate':
                tileEdit(command.id).type = command.op === 'open' ? 0 : 2;
                effects.push({ op: command.op, id: command.id });
                break;
            case 'tile':
                tileEdit(command.id).type = command.type;
                effects.push({ op: 'tile', id: command.id, type: command.type });
                break;
            case 'text':
                tileEdit(command.id).text = command.text;
                effects.push({ op: 'text', id: command.id, text: command.text });
                break;
        }
    }
    return { state: next, money: balances.reasoning, spent, typeMoney: balances.type, typeSpent, balances, effects };
}
//# sourceMappingURL=script.js.map