/** A bounded, data-only map language. This module has no game or DOM dependencies. */
import { createCurrencyBalances, exchange, validateBankConfig, validateCurrencyBalances, validateCurrencyId } from './economy.js';
import { validProofTags } from '../hs/proof-tags.js';
const MAX_SOURCE = 16_384;
const MAX_COMMANDS = 256;
const MAX_DEPTH = 16;
const MAX_ID = 128;
const MAX_VALUE = 1e12;
const TILE_NAMES = ['road', 'wall', 'gate', 'reward', 'ordinal'];
const COMPARISONS = ['>=', '<=', '==', '!=', '>', '<'];
const LAYERS = ['D-layer', 'T-layer', 'P-layer', 'G-layer'];
const METRICS = ['steps', 'demolished', 'spent', 'ordinal-base'];
const EVENT_NAMES = ['touch', 'pass', 'collect', 'start'];
function fail(line, message) {
    throw new Error(`Map script line ${line}: ${message}`);
}
function validId(value, line) {
    if (typeof value !== 'string' || !value.length || value.length > MAX_ID || /[\s\u0000-\u001f\u007f;"]/.test(value)) {
        fail(line, 'Invalid ID (1–128 characters, no whitespace or script separators)');
    }
    return value;
}
function eventName(value, line) {
    if (typeof value !== 'string' || !EVENT_NAMES.includes(value))
        fail(line, 'Unknown event (touch, pass, collect or start)');
    return value;
}
function validValue(value, integer, line) {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_VALUE
        || (integer ? !Number.isSafeInteger(value) : value < 0)) {
        fail(line, integer ? 'Count must be a safe integer within ±1e12' : 'Money must be finite and within 0..1e12');
    }
    return value;
}
function ordinalValue(value, line) {
    if (!Array.isArray(value) || value.length > 64)
        fail(line, 'Ordinal must be an array of at most 64 components');
    const result = [];
    for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        const component = descriptor && 'value' in descriptor ? descriptor.value : undefined;
        if (typeof component !== 'number' || !Number.isSafeInteger(component) || component < 1 || component > 64
            || (index === 0 ? component !== 1 : component > result[index - 1] + 1)) {
            fail(line, 'Invalid ordinal component (start at 1, positive <=64, rise at most 1)');
        }
        result.push(component);
    }
    return result;
}
function ordinalToken(token, line) {
    if (!token?.quoted)
        fail(line, 'Ordinal must be a JSON array inside a JSON string');
    let value;
    try {
        value = JSON.parse(token.value);
    }
    catch {
        return fail(line, 'Invalid ordinal JSON');
    }
    return ordinalValue(value, line);
}
/** Finite arithmetic: +, -, *, min/max, parentheses and read-only references. */
function numberTokens(input) {
    return input.flatMap(token => token.quoted ? [token] : token.value.split(/([()*,])/).filter(Boolean)
        .flatMap(value => {
        // Signs following e/E are part of a numeric literal, not arithmetic operators.
        const pieces = value.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[+-]|[^+\-]+/g) ?? [];
        return pieces.map(part => ({ value: part, quoted: false }));
    }));
}
function parseNumberExpression(tokens, line) {
    let cursor = 0, nodes = 0;
    const node = (value) => {
        if (++nodes > 256)
            fail(line, 'Number expression exceeds 256 nodes');
        return value;
    };
    const atom = (depth) => {
        if (depth > MAX_DEPTH)
            fail(line, 'Number expression nesting exceeds 16');
        const token = tokens[cursor++];
        if (!token || token.quoted)
            fail(line, 'Invalid number expression');
        if (token.value === '+' || token.value === '-') {
            const value = atom(depth + 1);
            return token.value === '+' ? value : node({ kind: 'binary', operator: '-', left: node({ kind: 'literal', value: 0 }), right: value });
        }
        if (token.value === '(') {
            const value = sum(depth + 1);
            if (tokens[cursor++]?.value !== ')')
                fail(line, 'Expected closing number parenthesis');
            return value;
        }
        if (token.value === 'min' || token.value === 'max') {
            if (tokens[cursor++]?.value !== '(')
                fail(line, 'Expected min/max parenthesis');
            const left = sum(depth + 1);
            if (tokens[cursor++]?.value !== ',')
                fail(line, 'min/max requires two arguments');
            const right = sum(depth + 1);
            if (tokens[cursor++]?.value !== ')')
                fail(line, 'Expected closing min/max parenthesis');
            return node({ kind: 'binary', operator: token.value, left, right });
        }
        if (['currency', 'count', 'metric'].includes(token.value)) {
            if (tokens[cursor++]?.value !== '(')
                fail(line, 'Expected reference parenthesis');
            const parts = [];
            while (tokens[cursor] && tokens[cursor].value !== ')') {
                const part = tokens[cursor++];
                if (part.quoted || part.value === '(')
                    fail(line, 'Invalid number reference');
                parts.push(part.value);
            }
            if (!parts.length || tokens[cursor++]?.value !== ')')
                fail(line, 'Invalid number reference');
            const id = { value: parts.join('') };
            if (token.value === 'currency') {
                let currency;
                try {
                    currency = validateCurrencyId(id.value);
                }
                catch {
                    return fail(line, 'Invalid currency ID');
                }
                return node({ kind: 'currency', currency });
            }
            if (token.value === 'metric') {
                if (!METRICS.includes(id.value))
                    fail(line, 'Unknown metric');
                return node({ kind: 'metric', name: id.value });
            }
            return node({ kind: 'count', id: validId(id.value, line) });
        }
        if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token.value))
            fail(line, 'Invalid number expression');
        return node({ kind: 'literal', value: validValue(Number(token.value), false, line) });
    };
    const product = (depth) => {
        let left = atom(depth);
        while (tokens[cursor]?.value === '*') {
            cursor++;
            left = node({ kind: 'binary', operator: '*', left, right: atom(depth) });
        }
        return left;
    };
    const sum = (depth) => {
        let left = product(depth);
        while (tokens[cursor]?.value === '+' || tokens[cursor]?.value === '-') {
            const operator = tokens[cursor++].value;
            left = node({ kind: 'binary', operator, left, right: product(depth) });
        }
        return left;
    };
    const result = sum(0);
    if (cursor !== tokens.length)
        fail(line, 'Unexpected number expression token');
    return result;
}
function numberOperand(input, integer, line) {
    if (input.length === 1 && !input[0].quoted && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(input[0].value)) {
        return { value: validValue(Number(input[0].value), integer, line) };
    }
    const expression = parseNumberExpression(numberTokens(input), line);
    return expression.kind === 'literal' ? { value: validValue(expression.value, integer, line) } : { value: 0, expression };
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
    if (op === 'allow' || op === 'block') {
        shape(1);
        return { line, op };
    }
    if (op === 'confirm') {
        shape(2, 1);
        return { line, op, text: words[1] };
    }
    if (op === 'event') {
        shape(2);
        if (kind !== 'once' && kind !== 'repeat')
            fail(line, 'Invalid event policy');
        return { line, op, mode: kind };
    }
    if (op === 'reward') {
        shape(2);
        if (kind !== 'consume' && kind !== 'keep')
            fail(line, 'Invalid reward policy');
        return { line, op, mode: kind };
    }
    if (op === 'remember') {
        shape(3, 2);
        if (kind !== 'proof' && kind !== 'rule' && kind !== 'type')
            fail(line, 'Invalid remembered target kind');
        return { line, op, kind, text: words[2] };
    }
    if (op === 'recompute' && kind === 'ordinal') {
        shape(2);
        return { line, op, kind };
    }
    if ((op === 'raise' || op === 'generate') && kind === 'ordinal') {
        shape(3, 2);
        return { line, op, kind, value: ordinalToken(tokens[2], line) };
    }
    if (op === 'set' && kind === 'ordinal') {
        if (words[2] === 'base') {
            shape(4);
            const value = number(3, true);
            if (value < 1 || value > 15)
                fail(line, 'Ordinal base must be within 1..15');
            return { line, op, kind: 'ordinal-base', value };
        }
        shape(4, 3);
        if (words[2] !== 'current' && words[2] !== 'max')
            fail(line, 'Ordinal assignment must target current or max');
        return { line, op, kind, slot: words[2], value: ordinalToken(tokens[3], line) };
    }
    if (op === 'set' && kind === 'language') {
        shape(3);
        if (words[2] !== 'zh' && words[2] !== 'en')
            fail(line, 'Invalid language');
        return { line, op, kind, language: words[2] };
    }
    if (op === 'add' && kind === 'axiom') {
        shape(4, 3);
        return { line, op, kind, id: id(2), text: words[3] };
    }
    if (op === 'remove' && kind === 'axiom') {
        shape(3);
        return { line, op, kind, id: id(2) };
    }
    if ((op === 'disable' || op === 'enable') && kind === 'type') {
        shape(3);
        return { line, op, kind, id: id(2) };
    }
    if ((op === 'clear' || op === 'reset') && kind === 'reward') {
        shape(3);
        return { line, op, kind, id: id(2) };
    }
    if (op === 'demolish' && kind === 'gate') {
        shape(3);
        return { line, op, kind, id: id(2) };
    }
    if (op === 'exchange') {
        if (tokens.some(token => token.quoted) || tokens.length < 4)
            fail(line, 'Invalid exchange arguments');
        let operand, to;
        try {
            operand = numberOperand(tokens.slice(3), false, line);
        }
        catch (error) {
            if (tokens.length < 5)
                throw error;
            to = currency(tokens.length - 1);
            operand = numberOperand(tokens.slice(3, -1), false, line);
        }
        const command = { line, op, bankId: id(1), currency: currency(2), ...operand };
        if (to !== undefined)
            command.to = to;
        return command;
    }
    if (op === 'require') {
        if (kind === 'proof' || kind === 'rule') {
            if (tokens.length === 3) {
                shape(3, 2);
                return { line, op, kind, text: words[2] };
            }
            if (words[3] !== 'using' || tokens.length < 5
                || tokens.some((token, i) => token.quoted !== (i === 2)))
                fail(line, 'Expected using followed by proof source tags');
            const allowedTags = words.slice(4);
            if (!validProofTags(allowedTags))
                fail(line, 'Unknown, duplicate, or empty proof source tags');
            return { line, op, kind, text: words[2], allowedTags };
        }
        if (kind === 'type') {
            shape(3, 2);
            return { line, op, kind, text: words[2] };
        }
        if (kind === 'rule-name') {
            shape(3, 2);
            if (!words[2].length || words[2].length > MAX_ID)
                fail(line, 'Invalid rule-name pattern');
            return { line, op, kind, pattern: words[2] };
        }
        if (kind === 'rule-present' || kind === 'type-present') {
            shape(3);
            return { line, op, kind, id: id(2) };
        }
        if (kind === 'ordinal') {
            shape(5, 4);
            const slot = words[2];
            if (slot !== 'current' && slot !== 'max' && slot !== 'next')
                fail(line, 'Invalid ordinal slot');
            return { line, op, kind, slot, comparison: comparison(3), value: ordinalToken(tokens[4], line) };
        }
        if (kind === 'metric') {
            if (tokens.slice(0, 4).some(token => token.quoted))
                fail(line, 'Metric arguments must be bare tokens');
            if (!METRICS.includes(words[2]))
                fail(line, 'Unknown metric');
            return { line, op, kind, name: words[2], comparison: comparison(3), ...numberOperand(tokens.slice(4), false, line) };
        }
        if (kind === 'key' || kind === 'not-key' || kind === 'flag' || kind === 'not-flag' || kind === 'reward'
            || kind === 'not-reward' || kind === 'layer' || kind === 'axiom' || kind === 'not-axiom') {
            if (kind === 'layer' && !LAYERS.includes(words[2]))
                fail(line, 'Invalid layer');
            shape(3);
            return { line, op, kind, id: id(2) };
        }
        if (kind === 'money') {
            if (tokens.slice(0, 3).some(token => token.quoted))
                fail(line, 'Money arguments must be bare tokens');
            return { line, op, kind, comparison: comparison(2), ...numberOperand(tokens.slice(3), false, line) };
        }
        if (kind === 'currency') {
            if (tokens.slice(0, 4).some(token => token.quoted))
                fail(line, 'Currency arguments must be bare tokens');
            return { line, op, kind, currency: currency(2), comparison: comparison(3), ...numberOperand(tokens.slice(4), false, line) };
        }
        if (kind === 'count') {
            if (tokens.slice(0, 4).some(token => token.quoted))
                fail(line, 'Count arguments must be bare tokens');
            return { line, op, kind, id: id(2), comparison: comparison(3), ...numberOperand(tokens.slice(4), true, line) };
        }
        if (kind === 'tile') {
            shape(5);
            const operator = comparison(3);
            if (operator !== '==' && operator !== '!=')
                fail(line, 'Tile comparison must be == or !=');
            const type = TILE_NAMES.findIndex(name => name === words[4]);
            if (type < 0)
                fail(line, 'Invalid tile type');
            return { line, op, kind, id: id(2), comparison: operator, type };
        }
    }
    if (op === 'give' || op === 'take') {
        if (kind === 'key') {
            shape(3);
            return { line, op, kind, id: id(2) };
        }
        if (kind === 'money' || kind === 'currency') {
            if (tokens.some(token => token.quoted))
                fail(line, 'Money arguments must be bare tokens');
            const operand = numberOperand(tokens.slice(kind === 'money' ? 2 : 3), false, line);
            return kind === 'money' ? { line, op, kind, ...operand } : { line, op, kind, currency: currency(2), ...operand };
        }
    }
    if ((op === 'set' || op === 'clear') && kind === 'flag') {
        shape(3);
        return { line, op, kind, id: id(2) };
    }
    if ((op === 'set' || op === 'add') && kind === 'count') {
        if (tokens.some(token => token.quoted))
            fail(line, 'Count arguments must be bare tokens');
        return { line, op, kind, id: id(2), ...numberOperand(tokens.slice(3), true, line) };
    }
    if ((op === 'disable' || op === 'enable') && kind === 'axiom') {
        shape(3);
        return { line, op, kind, id: id(2) };
    }
    if (op === 'unlock' && (kind === 'reward' || kind === 'layer' || kind === 'achievement' || kind === 'info' || kind === 'rule' || kind === 'type')) {
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
/** not > and > or. Parentheses are structural only inside branch conditions. */
function parseCondition(input, line) {
    const tokens = input.flatMap(token => token.quoted ? [token]
        : token.value.split(/([()])/).filter(Boolean).map(value => ({ value, quoted: false })));
    let cursor = 0;
    const at = (value) => !tokens[cursor]?.quoted && tokens[cursor]?.value === value;
    const unary = (depth) => {
        if (depth > MAX_DEPTH)
            fail(line, 'Condition nesting exceeds 16');
        if (at('not')) {
            cursor++;
            return { line, op: 'not', condition: unary(depth + 1) };
        }
        if (at('(')) {
            cursor++;
            const condition = expression(depth + 1);
            if (!at(')'))
                fail(line, 'Expected closing parenthesis');
            cursor++;
            return condition;
        }
        const start = cursor, kind = tokens[cursor]?.value;
        if (tokens[cursor]?.quoted)
            fail(line, 'Expected bare predicate name');
        const numeric = kind === 'money' || kind === 'currency' || kind === 'count' || kind === 'metric';
        if (numeric) {
            cursor += kind === 'money' ? 2 : 3;
            const operandStart = cursor;
            let nesting = 0;
            while (cursor < tokens.length) {
                if (!tokens[cursor].quoted) {
                    const word = tokens[cursor].value;
                    if (!nesting && (word === ')' || word === 'and' || word === 'or'))
                        break;
                    if (word === '(')
                        nesting++;
                    if (word === ')')
                        nesting--;
                }
                cursor++;
            }
            if (cursor === operandStart)
                fail(line, 'Incomplete condition predicate');
        }
        else {
            cursor += kind === 'ordinal' || kind === 'tile' ? 4 : 2;
            if ((kind === 'proof' || kind === 'rule') && at('using')) {
                cursor++;
                while (cursor < tokens.length && (tokens[cursor].quoted || ![')', 'and', 'or'].includes(tokens[cursor].value)))
                    cursor++;
            }
        }
        const words = tokens.slice(start, cursor);
        if (cursor > tokens.length)
            fail(line, 'Incomplete condition predicate');
        const command = parseCommand([{ value: 'require', quoted: false }, ...words], line);
        if (command.op !== 'require')
            fail(line, 'Expected condition predicate');
        const { op: _op, ...predicate } = command;
        return { line, op: 'predicate', predicate };
    };
    const conjunction = (depth) => {
        let condition = unary(depth);
        while (at('and')) {
            cursor++;
            condition = { line, op: 'and', left: condition, right: unary(depth) };
        }
        return condition;
    };
    const expression = (depth) => {
        let condition = conjunction(depth);
        while (at('or')) {
            cursor++;
            condition = { line, op: 'or', left: condition, right: conjunction(depth) };
        }
        return condition;
    };
    const condition = expression(0);
    if (cursor !== tokens.length)
        fail(line, 'Unexpected condition token');
    return condition;
}
/** All control markers count toward the 256-statement bound. Physical lines survive nesting. */
export function parseMapScript(source) {
    if (typeof source !== 'string')
        fail(1, 'Source must be a string');
    if (source.length > MAX_SOURCE)
        fail(1, 'Source exceeds 16384 characters');
    const commands = [];
    const stack = [];
    const events = new Set();
    let body = commands;
    let statements = 0;
    const lines = source.split(/\r\n|\r|\n/);
    lines.forEach((text, index) => {
        const line = index + 1;
        if (text.trimStart().startsWith('//'))
            return;
        let tokens = [];
        const flush = () => {
            if (!tokens.length)
                return;
            if (++statements > MAX_COMMANDS)
                fail(line, 'Script exceeds 256 commands');
            const op = tokens[0].value;
            if (op === 'on') {
                if (tokens.length !== 2 || tokens.some(token => token.quoted))
                    fail(line, 'Expected on touch/pass/collect/start');
                if (stack.length)
                    fail(line, 'Event handlers must be top-level');
                if (commands.length && !events.size)
                    fail(line, 'Cannot mix event handlers and flat commands');
                const event = eventName(tokens[1].value, line);
                if (events.has(event))
                    fail(line, `Duplicate event handler: ${event}`);
                events.add(event);
                const node = { line, op, event, body: [], endLine: line };
                body.push(node);
                stack.push({ node, body });
                body = node.body;
            }
            else if (op === 'if' || op === 'elif') {
                if (tokens[0].quoted)
                    fail(line, 'Control words must be bare tokens');
                if (op === 'if') {
                    if (!stack.length && events.size)
                        fail(line, 'Cannot mix event handlers and flat commands');
                    if (stack.length >= MAX_DEPTH)
                        fail(line, 'Branch nesting exceeds 16');
                    const node = { line, op, branches: [], endLine: line };
                    body.push(node);
                    stack.push({ node, body });
                }
                const frame = stack[stack.length - 1];
                if (!frame || frame.node.op !== 'if')
                    fail(line, 'Unexpected elif');
                if (frame.node.elseBody !== undefined)
                    fail(line, 'elif after else');
                const branch = { line, condition: parseCondition(tokens.slice(1), line), body: [] };
                frame.node.branches.push(branch);
                body = branch.body;
            }
            else if (op === 'else' || op === 'end') {
                if (tokens.length !== 1 || tokens[0].quoted)
                    fail(line, `Wrong arguments for ${op}`);
                const frame = stack[stack.length - 1];
                if (!frame)
                    fail(line, `Unexpected ${op}`);
                if (op === 'else') {
                    if (frame.node.op !== 'if')
                        fail(line, 'Unexpected else');
                    if (frame.node.elseBody !== undefined)
                        fail(line, 'Duplicate else');
                    frame.node.elseLine = line;
                    body = frame.node.elseBody = [];
                }
                else {
                    frame.node.endLine = line;
                    body = stack.pop().body;
                }
            }
            else {
                if (!stack.length && events.size)
                    fail(line, 'Cannot mix event handlers and flat commands');
                body.push(parseCommand(tokens, line));
            }
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
                if (cursor < text.length && !/[\s;)]/.test(text[cursor]))
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
    if (stack.length)
        fail(stack[stack.length - 1].node.line, `Missing end for ${stack[stack.length - 1].node.op}`);
    return commands;
}
function formatNumber(expression) {
    if (expression.kind === 'literal')
        return String(expression.value);
    if (expression.kind === 'currency')
        return `currency(${expression.currency})`;
    if (expression.kind === 'count')
        return `count(${expression.id})`;
    if (expression.kind === 'metric')
        return `metric(${expression.name})`;
    if (expression.operator === 'min' || expression.operator === 'max')
        return `${expression.operator}(${formatNumber(expression.left)},${formatNumber(expression.right)})`;
    // Iterative parsing of flat arithmetic chains must not turn into excessive formatted nesting.
    const precedence = (value) => value.kind !== 'binary' || value.operator === 'min' || value.operator === 'max' ? 3 : value.operator === '*' ? 2 : 1;
    const left = formatNumber(expression.left), right = formatNumber(expression.right);
    return `${precedence(expression.left) < precedence(expression) ? `(${left})` : left}${expression.operator}${precedence(expression.right) <= precedence(expression) ? `(${right})` : right}`;
}
function formatPredicate(predicate) {
    const operand = 'expression' in predicate && predicate.expression ? formatNumber(predicate.expression)
        : 'value' in predicate ? String(predicate.value) : '';
    if (predicate.kind === 'money')
        return `money ${predicate.comparison} ${operand}`;
    if (predicate.kind === 'currency')
        return `currency ${predicate.currency} ${predicate.comparison} ${operand}`;
    if (predicate.kind === 'count')
        return `count ${predicate.id} ${predicate.comparison} ${operand}`;
    if (predicate.kind === 'metric')
        return `metric ${predicate.name} ${predicate.comparison} ${operand}`;
    if (predicate.kind === 'proof' || predicate.kind === 'rule' || predicate.kind === 'type')
        return `${predicate.kind} ${JSON.stringify(predicate.text)}`
            + ('allowedTags' in predicate && predicate.allowedTags ? ` using ${predicate.allowedTags.join(' ')}` : '');
    if (predicate.kind === 'rule-name')
        return `rule-name ${JSON.stringify(predicate.pattern)}`;
    if (predicate.kind === 'ordinal')
        return `ordinal ${predicate.slot} ${predicate.comparison} ${JSON.stringify(JSON.stringify(predicate.value))}`;
    if (predicate.kind === 'tile')
        return `tile ${predicate.id} ${predicate.comparison} ${TILE_NAMES[predicate.type]}`;
    if ('id' in predicate)
        return `${predicate.kind} ${predicate.id}`;
    return fail(predicate.line, 'Unsupported predicate');
}
function formatCondition(condition, parentPrecedence = 0) {
    if (condition.op === 'predicate')
        return formatPredicate(condition.predicate);
    const precedence = condition.op === 'or' ? 1 : condition.op === 'and' ? 2 : 3;
    const source = condition.op === 'not' ? `not ${formatCondition(condition.condition, precedence)}`
        : `${formatCondition(condition.left, precedence)} ${condition.op} ${formatCondition(condition.right, precedence + 1)}`;
    return precedence < parentPrecedence ? `(${source})` : source;
}
function formatStatements(commands, depth) {
    if (depth > MAX_DEPTH)
        fail(commands[0]?.line ?? 1, 'Branch nesting exceeds 16');
    return commands.map(command => {
        if (command.op === 'on')
            return [`on ${command.event}`, formatStatements(command.body, depth + 1), 'end'].filter(Boolean).join('\n');
        if (command.op === 'if') {
            if (!command.branches.length)
                fail(command.line, 'if must contain a condition');
            const source = command.branches.map((branch, index) => [
                `${index ? 'elif' : 'if'} ${formatCondition(branch.condition)}`,
                formatStatements(branch.body, depth + 1),
            ].filter(Boolean).join('\n'));
            if (command.elseBody !== undefined)
                source.push(['else', formatStatements(command.elseBody, depth + 1)].filter(Boolean).join('\n'));
            source.push('end');
            return source.join('\n');
        }
        if (command.op === 'message')
            return `message ${JSON.stringify(command.text)}`;
        if (command.op === 'exchange')
            return `exchange ${command.bankId} ${command.currency} ${command.expression ? formatNumber(command.expression) : command.value}${command.to === undefined ? '' : ` ${command.to}`}`;
        if (command.op === 'require')
            return `require ${formatPredicate(command)}`;
        if (command.op === 'allow' || command.op === 'block')
            return command.op;
        if (command.op === 'event' || command.op === 'reward')
            return `${command.op} ${command.mode}`;
        if (command.op === 'confirm')
            return `confirm ${JSON.stringify(command.text)}`;
        if (command.op === 'remember')
            return `remember ${command.kind} ${JSON.stringify(command.text)}`;
        if (!('kind' in command))
            return fail(command.line, 'Unsupported command');
        if (command.kind === 'ordinal') {
            if (command.op === 'recompute')
                return 'recompute ordinal';
            return `${command.op} ordinal ${command.op === 'set' ? `${command.slot} ` : ''}${JSON.stringify(JSON.stringify(command.value))}`;
        }
        if (command.kind === 'ordinal-base')
            return `set ordinal base ${command.value}`;
        if (command.kind === 'language')
            return `set language ${command.language}`;
        if (command.kind === 'axiom' && command.op === 'add')
            return `add axiom ${command.id} ${JSON.stringify(command.text)}`;
        if (command.kind === 'money')
            return `${command.op} money ${command.expression ? formatNumber(command.expression) : command.value}`;
        if (command.kind === 'currency')
            return `${command.op} currency ${command.currency} ${command.expression ? formatNumber(command.expression) : command.value}`;
        if (command.kind === 'count')
            return `${command.op} count ${command.id} ${command.expression ? formatNumber(command.expression) : command.value}`;
        if (command.kind === 'tile')
            return `set tile ${command.id} ${TILE_NAMES[command.type]}`;
        if (command.kind === 'text')
            return `set text ${command.id} ${JSON.stringify(command.text)}`;
        return `${command.op} ${command.kind} ${command.id}`;
    }).join('\n');
}
/** Normalizes whitespace/comments and preserves JSON text exactly. */
export function formatMapScript(commands) {
    const source = formatStatements(commands, 0);
    parseMapScript(source);
    return source;
}
function hasTileReference(value) {
    return 'kind' in value && 'id' in value && (['gate', 'tile', 'text'].includes(value.kind)
        || ('op' in value && value.op === 'reset' && value.kind === 'reward'));
}
/** Only keys, flags, counters and tile references belong to a module namespace. */
export function rewriteMapScript(source, namespace) {
    const rewriteNumber = (expression, line) => {
        if (expression.kind === 'count')
            return { ...expression, id: validId(namespace(expression.id), line) };
        if (expression.kind === 'binary')
            return { ...expression, left: rewriteNumber(expression.left, line), right: rewriteNumber(expression.right, line) };
        return expression;
    };
    const rewritePredicate = (predicate) => {
        if ('expression' in predicate && predicate.expression)
            predicate = { ...predicate, expression: rewriteNumber(predicate.expression, predicate.line) };
        if ('id' in predicate && hasTileReference(predicate) && predicate.id === '@self')
            return predicate;
        if ('id' in predicate && ['key', 'not-key', 'flag', 'not-flag', 'count', 'tile'].includes(predicate.kind)) {
            return { ...predicate, id: validId(namespace(predicate.id), predicate.line) };
        }
        return predicate;
    };
    const rewriteCondition = (condition) => {
        if (condition.op === 'predicate')
            return { ...condition, predicate: rewritePredicate(condition.predicate) };
        if (condition.op === 'not')
            return { ...condition, condition: rewriteCondition(condition.condition) };
        return { ...condition, left: rewriteCondition(condition.left), right: rewriteCondition(condition.right) };
    };
    const rewriteStatements = (statements) => statements.map(command => {
        if (command.op === 'on')
            return { ...command, body: rewriteStatements(command.body) };
        if (command.op === 'if')
            return {
                ...command,
                branches: command.branches.map(branch => ({ ...branch, condition: rewriteCondition(branch.condition), body: rewriteStatements(branch.body) })),
                ...(command.elseBody === undefined ? {} : { elseBody: rewriteStatements(command.elseBody) }),
            };
        if (command.op === 'require')
            return { ...command, ...rewritePredicate(command) };
        if ('expression' in command && command.expression)
            command = { ...command, expression: rewriteNumber(command.expression, command.line) };
        if ('id' in command && hasTileReference(command) && command.id === '@self')
            return command;
        if ('kind' in command && 'id' in command
            && ['key', 'not-key', 'flag', 'not-flag', 'count', 'gate', 'tile', 'text'].includes(command.kind)) {
            return { ...command, id: validId(namespace(command.id), command.line) };
        }
        if (command.op === 'reset' && command.kind === 'reward')
            return { ...command, id: validId(namespace(command.id), command.line) };
        return command;
    });
    return formatMapScript(rewriteStatements(parseMapScript(source)));
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
function idArray(input, label) {
    if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype
        || Reflect.ownKeys(input).length !== input.length + 1)
        fail(1, `${label} must be a JSON array`);
    const values = new Set();
    for (let index = 0; index < input.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
            fail(1, `${label} must contain JSON array entries`);
        values.add(validId(descriptor.value, 1));
    }
    return [...values];
}
function ordinalState(input) {
    const value = record(input, 'ordinal');
    if (Object.keys(value).length !== 4 || !['current', 'max', 'next', 'base'].every(key => Object.hasOwn(value, key))) {
        fail(1, 'Ordinal state must contain current, max, next and base');
    }
    const base = validValue(value.base, true, 1);
    if (base < 1 || base > 15)
        fail(1, 'Ordinal base must be within 1..15');
    return { current: ordinalValue(value.current, 1), max: ordinalValue(value.max, 1), next: ordinalValue(value.next, 1), base };
}
/** Missing fields default for old saves; present fields are strictly validated and cloned. */
export function createMapScriptState(input) {
    const state = { keys: [], flags: [], counts: {}, disabledAxioms: [], done: [], tileEdits: {}, rewards: [], layers: [],
        engine: { rules: [], axioms: {}, types: [], disabledTypes: [] }, removedRewards: [] };
    if (input === undefined)
        return state;
    const restored = record(input, 'State');
    for (const key of Object.keys(restored)) {
        if (!Object.hasOwn(state, key) && key !== 'ordinal' && key !== 'eventDone')
            fail(1, `Unknown state field: ${key}`);
    }
    for (const field of ['keys', 'flags', 'disabledAxioms', 'done', 'rewards', 'layers', 'removedRewards']) {
        if (!Object.hasOwn(restored, field))
            continue;
        state[field] = idArray(restored[field], field);
        if (field === 'layers' && state.layers.some(id => !LAYERS.includes(id)))
            fail(1, 'Invalid restored layer');
    }
    if (state.rewards.some(id => state.removedRewards.includes(id)))
        fail(1, 'Reward cannot also be removed');
    if (Object.hasOwn(restored, 'eventDone')) {
        state.eventDone = {};
        for (const [id, inputEvents] of Object.entries(record(restored.eventDone, 'eventDone'))) {
            validId(id, 1);
            if (!Array.isArray(inputEvents) || inputEvents.length > EVENT_NAMES.length)
                fail(1, 'eventDone events must be an array of at most four unique events');
            const events = idArray(inputEvents, 'eventDone events');
            if (events.length !== inputEvents.length)
                fail(1, 'Duplicate completed event');
            put(state.eventDone, id, events.map(event => eventName(event, 1)));
        }
    }
    if (Object.hasOwn(restored, 'engine')) {
        const engine = record(restored.engine, 'engine');
        for (const key of Object.keys(engine))
            if (!Object.hasOwn(state.engine, key))
                fail(1, `Unknown engine state field: ${key}`);
        for (const key of ['rules', 'types', 'disabledTypes']) {
            if (Object.hasOwn(engine, key))
                state.engine[key] = idArray(engine[key], `engine.${key}`);
        }
        if (Object.hasOwn(engine, 'axioms')) {
            for (const [id, text] of Object.entries(record(engine.axioms, 'engine.axioms')))
                put(state.engine.axioms, validId(id, 1), textValue(text));
        }
    }
    if (Object.hasOwn(restored, 'ordinal'))
        state.ordinal = ordinalState(restored.ordinal);
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
function engineQuery(predicate) {
    if (predicate.kind === 'proof' || predicate.kind === 'rule')
        return { kind: predicate.kind, text: predicate.text,
            ...(predicate.allowedTags ? { allowedTags: [...predicate.allowedTags] } : {}) };
    if (predicate.kind === 'type')
        return { kind: predicate.kind, text: predicate.text };
    if (predicate.kind === 'rule-name')
        return { kind: predicate.kind, pattern: predicate.pattern };
    if (predicate.kind === 'rule-present' || predicate.kind === 'type-present')
        return { kind: predicate.kind, id: predicate.id };
    return undefined;
}
function engineEdit(command) {
    if (command.op === 'unlock' && (command.kind === 'rule' || command.kind === 'type'))
        return { op: command.kind === 'rule' ? 'unlock-rule' : 'unlock-type', id: command.id };
    if ((command.op === 'disable' || command.op === 'enable') && command.kind === 'type')
        return { op: command.op === 'disable' ? 'disable-type' : 'enable-type', id: command.id };
    if (command.op === 'add' && command.kind === 'axiom')
        return { op: 'add-axiom', id: command.id, text: command.text };
    if (command.op === 'remove' && command.kind === 'axiom')
        return { op: 'remove-axiom', id: command.id };
    return undefined;
}
/** Validates all references first, then simulates on an independent state with no side effects.
 * checksOnly is used by once-per-tile gates: branches and requires observe incoming state.
 * The caller owns once-only bookkeeping in state.done/eventDone and application of returned effects.
 */
export function planMapScript(source, state, env, checksOnly = false) {
    let observer;
    let limit = 256;
    // Debug options are deliberately excluded from normal environment validation.
    try {
        if (typeof env?.trace === 'function')
            observer = env.trace;
        if (Number.isFinite(env?.traceLimit))
            limit = Math.max(1, Math.min(1024, Math.floor(env.traceLimit)));
    }
    catch { /* A broken observer must not become a script failure. */ }
    let emitted = 0, truncated = false, blockedLine;
    const lines = observer && typeof source === 'string' && source.length <= MAX_SOURCE ? source.split(/\r\n|\r|\n/) : [];
    const trace = (entry) => {
        if (entry.kind === 'condition' && entry.result === false)
            blockedLine = entry.line;
        if (entry.kind === 'action' && entry.op === 'block')
            blockedLine = entry.line;
        if (!observer)
            return;
        const final = entry.kind === 'outcome';
        if (emitted >= limit - (final ? 0 : 1)) {
            truncated = true;
            return;
        }
        emitted++;
        try {
            observer({ ...entry, phase: 'plan', tileId: env.selfId, event: env.event,
                ...(entry.line === undefined ? {} : { source: lines[entry.line - 1] }),
                ...(final && truncated ? { truncated: true } : {}) });
        }
        catch { /* Observability has no authority over the transaction. */ }
    };
    try {
        const plan = planMapScriptCore(source, state, env, checksOnly, trace);
        trace({ kind: 'outcome', outcome: plan.status === 'blocked' ? 'blocked' : plan.confirmation === undefined ? 'pass' : 'confirmation',
            ...(plan.status === 'blocked' ? { line: blockedLine, reason: '条件未满足或执行了 block；事务未提交' } : {}),
            ...(!plan.handled ? { reason: '当前事件没有处理器，未执行任何动作' } : {}),
            ...(plan.confirmation === undefined ? {} : { reason: plan.confirmation }) });
        return plan;
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const match = /^Map script line (\d+):/.exec(reason);
        trace({ kind: 'outcome', outcome: 'exception', reason, ...(match ? { line: Number(match[1]) } : {}) });
        throw error;
    }
}
function planMapScriptCore(source, state, env, checksOnly, trace) {
    const commands = parseMapScript(source);
    const next = createMapScriptState(state);
    const incoming = createMapScriptState(next);
    if (!env || typeof env.hasTile !== 'function' || typeof env.hasAxiom !== 'function'
        || !env.rewards || typeof env.rewards.has !== 'function'
        || (env.getTileType !== undefined && typeof env.getTileType !== 'function')
        || (env.hasLayer !== undefined && typeof env.hasLayer !== 'function')
        || (env.completed !== undefined && typeof env.completed !== 'boolean')
        || (env.compareOrdinals !== undefined && typeof env.compareOrdinals !== 'function')
        || (env.nextOrdinal !== undefined && typeof env.nextOrdinal !== 'function')
        || (env.engine !== undefined && (!env.engine || typeof env.engine.validate !== 'function' || typeof env.engine.query !== 'function')))
        fail(1, 'Invalid environment');
    if (env.event !== undefined)
        eventName(env.event, 1);
    const explicit = commands[0]?.op === 'on';
    const selected = explicit ? commands.find((command) => command.op === 'on' && command.event === env.event) : undefined;
    const selectedCommands = explicit ? selected?.body ?? [] : commands;
    const handled = !explicit || selected !== undefined;
    const selection = { handled, ...(selected === undefined ? {} : { event: selected.event }) };
    const metrics = {};
    if (env.metrics !== undefined) {
        for (const [name, value] of Object.entries(record(env.metrics, 'metrics'))) {
            if (!METRICS.includes(name))
                fail(1, `Unknown metric: ${name}`);
            put(metrics, name, validValue(value, false, 1));
        }
    }
    // Global progress can advance outside scripts; prefer the current host snapshot.
    let ordinal = env.ordinal === undefined ? (next.ordinal === undefined ? undefined : ordinalState(next.ordinal)) : ordinalState(env.ordinal);
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
    const incomingBalances = { ...balances };
    const effects = [];
    const attemptEffects = [];
    let status = 'pass', stopped = false;
    let confirmation, repeat, consumeReward;
    let demolished = 0;
    let eventPolicy;
    const tileTypes = new Map();
    // Declarations permit static references anywhere in the tree, including other handlers.
    // Actual availability still follows only the selected execution and its staged state.
    const declaredAxioms = new Set();
    const collectAxioms = (statements) => {
        for (const statement of statements) {
            if (statement.op === 'on')
                collectAxioms(statement.body);
            else if (statement.op === 'if') {
                for (const branch of statement.branches)
                    collectAxioms(branch.body);
                if (statement.elseBody !== undefined)
                    collectAxioms(statement.elseBody);
            }
            else if (statement.op === 'add' && statement.kind === 'axiom')
                declaredAxioms.add(statement.id);
        }
    };
    collectAxioms(commands);
    const hasAxiom = (id) => Object.hasOwn(next.engine.axioms, id)
        // The live engine still contains incoming custom axioms removed during this plan.
        || (!Object.hasOwn(incoming.engine.axioms, id) && env.hasAxiom(id));
    const metric = (name, line) => {
        if (name === 'ordinal-base' && ordinal)
            return ordinal.base;
        if (name === 'spent')
            return validValue((metrics.spent ?? 0) + spent, false, line);
        if (name === 'demolished')
            return validValue((metrics.demolished ?? 0) + demolished, false, line);
        if (!Object.hasOwn(metrics, name))
            fail(line, `Missing metric: ${name}`);
        return metrics[name];
    };
    const validateNumber = (expression, line) => {
        if (expression.kind === 'binary') {
            validateNumber(expression.left, line);
            validateNumber(expression.right, line);
        }
        else if (expression.kind === 'currency' && !Object.hasOwn(balances, expression.currency))
            fail(line, `Unregistered currency: ${expression.currency}`);
        else if (expression.kind === 'metric')
            metric(expression.name, line);
    };
    const validateReference = (command) => {
        const selfReference = 'id' in command && hasTileReference(command) && command.id === '@self';
        if (selfReference) {
            if (env.selfId === undefined)
                fail(command.line, '@self requires env.selfId');
            if (env.selfId === '@self')
                fail(command.line, '@self requires a concrete env.selfId');
            try {
                validId(env.selfId, command.line);
            }
            catch {
                fail(command.line, '@self requires env.selfId to be a valid tile ID');
            }
            // The parsed tree is private to this plan; all later reads/effects use the concrete ID.
            if ('id' in command)
                command.id = env.selfId;
        }
        if ('expression' in command && command.expression)
            validateNumber(command.expression, command.line);
        const query = (!('op' in command) || command.op === 'require') ? engineQuery(command) : undefined;
        const edit = 'op' in command && command.op !== 'require' ? engineEdit(command) : undefined;
        if (query || edit) {
            if (!env.engine)
                fail(command.line, 'Engine operations require env.engine');
            economyAtLine(command.line, () => env.engine.validate({ ...(query ?? edit) }));
        }
        if ('kind' in command && command.kind === 'metric')
            metric(command.name, command.line);
        if ('kind' in command && command.kind === 'ordinal') {
            if ((!('op' in command) || command.op === 'require' || command.op === 'raise') && !env.compareOrdinals)
                fail(command.line, 'Ordinal comparisons require env.compareOrdinals');
            if ('op' in command && (command.op === 'raise' || command.op === 'recompute') && !env.nextOrdinal)
                fail(command.line, 'Ordinal recomputation requires env.nextOrdinal');
        }
        if ('op' in command && command.op === 'event') {
            if (eventPolicy !== undefined && eventPolicy !== command.mode)
                fail(command.line, 'Conflicting event policies');
            eventPolicy = command.mode;
        }
        if ('currency' in command && !Object.hasOwn(balances, command.currency))
            fail(command.line, `Unregistered currency: ${command.currency}`);
        if ('op' in command && command.op === 'exchange') {
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
            if (!command.expression && (command.value === 0 || command.value < rule.minimum))
                fail(command.line, 'Exchange amount must be positive and meet minimum');
        }
        if ('kind' in command && 'id' in command) {
            if (hasTileReference(command) && !env.hasTile(command.id)) {
                fail(command.line, selfReference ? `@self target is not an available tile: ${command.id}` : `Unknown tile: ${command.id}`);
            }
            if ('op' in command && (command.op === 'enable' || command.op === 'disable')
                && command.kind === 'axiom' && !declaredAxioms.has(command.id) && !hasAxiom(command.id))
                fail(command.line, `Unknown axiom: ${command.id}`);
            if (command.kind === 'tile' && 'comparison' in command && !tileTypes.has(command.id)) {
                if (!env.getTileType)
                    fail(command.line, 'Tile predicates require env.getTileType');
                const type = economyAtLine(command.line, () => env.getTileType(command.id));
                if (typeof type !== 'number' || !Number.isInteger(type) || type < 0 || type >= TILE_NAMES.length) {
                    fail(command.line, `Invalid tile type: ${command.id}`);
                }
                tileTypes.set(command.id, type);
            }
        }
    };
    const validateCondition = (condition) => {
        if (condition.op === 'predicate')
            validateReference(condition.predicate);
        else if (condition.op === 'not')
            validateCondition(condition.condition);
        else {
            validateCondition(condition.left);
            validateCondition(condition.right);
        }
    };
    const validateStatements = (statements) => {
        for (const statement of statements) {
            if (statement.op === 'on') {
                eventPolicy = undefined;
                validateStatements(statement.body);
            }
            else if (statement.op === 'if') {
                for (const branch of statement.branches) {
                    validateCondition(branch.condition);
                    validateStatements(branch.body);
                }
                if (statement.elseBody !== undefined)
                    validateStatements(statement.elseBody);
            }
            else
                validateReference(statement);
        }
    };
    if (explicit) {
        for (const command of commands) {
            eventPolicy = undefined;
            validateStatements([command]);
            if (command === selected)
                repeat = eventPolicy === 'repeat';
        }
    }
    else {
        validateStatements(commands);
        repeat = eventPolicy === undefined ? undefined : eventPolicy === 'repeat';
    }
    checksOnly = checksOnly || (env.completed === true && repeat !== true);
    const count = (id) => Object.hasOwn(next.counts, id) ? next.counts[id] : 0;
    const tileEdit = (id) => {
        if (!Object.hasOwn(next.tileEdits, id))
            put(next.tileEdits, id, {});
        return next.tileEdits[id];
    };
    const ownsReward = (id) => !next.removedRewards.includes(id) && (next.rewards.includes(id) || env.rewards.has(id));
    const numeric = (expression, line) => {
        let value;
        if (expression.kind === 'literal')
            value = expression.value;
        else if (expression.kind === 'currency')
            value = balances[expression.currency];
        else if (expression.kind === 'count')
            value = count(expression.id);
        else if (expression.kind === 'metric')
            value = metric(expression.name, line);
        else {
            const left = numeric(expression.left, line), right = numeric(expression.right, line);
            value = expression.operator === '+' ? left + right : expression.operator === '-' ? left - right
                : expression.operator === '*' ? left * right : expression.operator === 'min' ? Math.min(left, right) : Math.max(left, right);
        }
        if (!Number.isFinite(value) || Math.abs(value) > MAX_VALUE)
            fail(line, 'Number expression must be finite and within ±1e12');
        return value;
    };
    const operand = (value) => value.expression ? numeric(value.expression, value.line) : value.value;
    const currentOrdinal = () => ordinal ??= { current: [], max: [], next: [], base: 15 };
    const compareOrdinal = (left, right, line) => {
        const result = economyAtLine(line, () => env.compareOrdinals([...left], [...right]));
        if (typeof result !== 'number' || !Number.isFinite(result))
            fail(line, 'Invalid ordinal comparison result');
        return result;
    };
    const recomputeOrdinal = (line) => {
        const value = currentOrdinal();
        value.next = economyAtLine(line, () => ordinalValue(env.nextOrdinal([...value.max], value.base, ownsReward('stepw')), line));
        next.ordinal = ordinalState(value);
    };
    const predicateResult = (predicate) => {
        const query = engineQuery(predicate);
        if (query) {
            const result = economyAtLine(predicate.line, () => env.engine.query(query, createMapScriptState(next)));
            if (typeof result !== 'boolean')
                fail(predicate.line, 'Engine query must return a boolean');
            return result;
        }
        switch (predicate.kind) {
            case 'key': return next.keys.includes(predicate.id);
            case 'not-key': return !next.keys.includes(predicate.id);
            case 'flag': return next.flags.includes(predicate.id);
            case 'not-flag': return !next.flags.includes(predicate.id);
            case 'reward': return ownsReward(predicate.id);
            case 'not-reward': return !ownsReward(predicate.id);
            case 'layer': return next.layers.includes(predicate.id) || (env.hasLayer?.(predicate.id) ?? false);
            case 'axiom': return hasAxiom(predicate.id) && !next.disabledAxioms.includes(predicate.id);
            case 'not-axiom': return !hasAxiom(predicate.id) || next.disabledAxioms.includes(predicate.id);
            case 'money': return compare(balances.reasoning, predicate.comparison, operand(predicate));
            case 'currency': return compare(balances[predicate.currency], predicate.comparison, operand(predicate));
            case 'count': return compare(count(predicate.id), predicate.comparison, operand(predicate));
            case 'metric': return compare(metric(predicate.name, predicate.line), predicate.comparison, operand(predicate));
            case 'ordinal': return compare(compareOrdinal(currentOrdinal()[predicate.slot], predicate.value, predicate.line), predicate.comparison, 0);
            case 'tile': {
                const type = Object.hasOwn(next.tileEdits, predicate.id) && next.tileEdits[predicate.id].type !== undefined
                    ? next.tileEdits[predicate.id].type : tileTypes.get(predicate.id);
                return compare(type, predicate.comparison, predicate.type);
            }
        }
        return fail(predicate.line, 'Unsupported predicate');
    };
    const evaluatePredicate = (predicate) => {
        const result = predicateResult(predicate);
        trace({ kind: 'condition', line: predicate.line, op: predicate.kind, result,
            ...(result ? {} : { reason: `不满足：${formatPredicate(predicate)}` }) });
        return result;
    };
    const skipCondition = (condition, reason) => {
        trace({ kind: 'not-run', line: condition.line, op: condition.op === 'predicate' ? condition.predicate.kind : condition.op, reason });
        if (condition.op === 'not')
            skipCondition(condition.condition, reason);
        else if (condition.op === 'and' || condition.op === 'or') {
            skipCondition(condition.left, reason);
            skipCondition(condition.right, reason);
        }
    };
    const skip = (statements, reason) => {
        for (const statement of statements) {
            trace({ kind: 'not-run', line: statement.line, op: statement.op, reason });
            if (statement.op === 'on')
                skip(statement.body, reason);
            else if (statement.op === 'if') {
                for (const branch of statement.branches) {
                    skipCondition(branch.condition, reason);
                    skip(branch.body, reason);
                }
                if (statement.elseBody) {
                    trace({ kind: 'not-run', line: statement.elseLine, op: 'else', reason });
                    skip(statement.elseBody, reason);
                }
            }
        }
    };
    const evaluateCondition = (condition) => {
        if (condition.op === 'predicate')
            return evaluatePredicate(condition.predicate);
        let result;
        if (condition.op === 'not')
            result = !evaluateCondition(condition.condition);
        else {
            const left = evaluateCondition(condition.left);
            if (condition.op === 'and' ? !left : left) {
                skipCondition(condition.right, 'short-circuit');
                result = left;
            }
            else
                result = evaluateCondition(condition.right);
        }
        trace({ kind: 'condition', line: condition.line, op: condition.op, result });
        return result;
    };
    const execute = (statements) => {
        for (const command of statements) {
            if (stopped) {
                skip([command], 'stopped');
                continue;
            }
            if (command.op === 'on')
                continue; // Only the selected handler body is executable.
            const { line, op } = command;
            if (command.op === 'if') {
                let selected = false;
                for (const branch of command.branches) {
                    if (selected) {
                        skipCondition(branch.condition, 'unselected-branch');
                        skip(branch.body, 'unselected-branch');
                    }
                    else if (evaluateCondition(branch.condition)) {
                        selected = true;
                        execute(branch.body);
                    }
                    else
                        skip(branch.body, 'false-condition');
                }
                if (command.elseBody !== undefined) {
                    if (selected) {
                        trace({ kind: 'not-run', line: command.elseLine, op: 'else', reason: 'unselected-branch' });
                        skip(command.elseBody, 'unselected-branch');
                    }
                    else
                        execute(command.elseBody);
                }
                continue;
            }
            if (command.op === 'require') {
                if (!evaluatePredicate(command)) {
                    status = 'blocked';
                    stopped = true;
                }
                continue;
            }
            if (command.op === 'allow' || command.op === 'block') {
                trace({ kind: 'action', line, op, reason: 'staged' });
                status = command.op === 'allow' ? 'pass' : 'blocked';
                stopped = true;
                continue;
            }
            if (command.op === 'event') {
                trace({ kind: 'action', line, op, reason: command.mode });
                continue;
            }
            if (checksOnly) {
                trace({ kind: 'not-run', line, op, reason: 'checks-only' });
                continue;
            }
            let actionFailed = false;
            try {
                if (command.op === 'reward') {
                    consumeReward = command.mode === 'consume';
                    continue;
                }
                if (command.op === 'confirm') {
                    if (confirmation !== undefined && confirmation !== command.text)
                        fail(line, 'Conflicting confirmation requests');
                    confirmation = command.text;
                    continue;
                }
                if (command.op === 'remember') {
                    attemptEffects.push({ op: 'remember', kind: command.kind, text: command.text });
                    continue;
                }
                if (command.op === 'generate') {
                    attemptEffects.push({ op: 'generate-ordinal', value: [...command.value] });
                    continue;
                }
                const edit = engineEdit(command);
                if (edit) {
                    if (edit.op === 'unlock-rule')
                        changeMember(next.engine.rules, edit.id, true);
                    else if (edit.op === 'unlock-type')
                        changeMember(next.engine.types, edit.id, true);
                    else if (edit.op === 'disable-type' || edit.op === 'enable-type')
                        changeMember(next.engine.disabledTypes, edit.id, edit.op === 'disable-type');
                    else if (edit.op === 'add-axiom')
                        put(next.engine.axioms, edit.id, edit.text);
                    else if (edit.op === 'remove-axiom')
                        delete next.engine.axioms[edit.id];
                    effects.push({ op: 'engine', edit });
                    continue;
                }
                if (command.op === 'recompute') {
                    recomputeOrdinal(line);
                    continue;
                }
                if (command.op === 'raise') {
                    const value = currentOrdinal();
                    if (compareOrdinal(command.value, value.max, line) > 0) {
                        value.max = [...command.value];
                        recomputeOrdinal(line);
                    }
                    continue;
                }
                if (command.op === 'set' && command.kind === 'ordinal') {
                    currentOrdinal()[command.slot] = [...command.value];
                    next.ordinal = ordinalState(currentOrdinal());
                    continue;
                }
                if (command.op === 'set' && command.kind === 'ordinal-base') {
                    currentOrdinal().base = command.value;
                    next.ordinal = ordinalState(currentOrdinal());
                    continue;
                }
                if (command.op === 'set' && command.kind === 'language') {
                    effects.push({ op: 'language', value: command.language });
                    continue;
                }
                if (command.op === 'exchange') {
                    const value = validValue(operand(command), false, line);
                    const result = economyAtLine(line, () => exchange(balances, banks.get(command.bankId), command.currency, value, command.to));
                    balances = result.balances;
                    continue;
                }
                if (command.op === 'message') {
                    effects.push({ op: 'message', text: command.text });
                    continue;
                }
                if (!('kind' in command))
                    fail(line, 'Unsupported command');
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
                        put(next.counts, command.id, validValue(op === 'add' ? count(command.id) + operand(command) : operand(command), true, line));
                        break;
                    case 'money': {
                        const value = validValue(operand(command), false, line);
                        if (op === 'take' && balances.reasoning < value)
                            fail(line, 'Insufficient money');
                        balances.reasoning = validValue(balances.reasoning + (op === 'give' ? value : -value), false, line);
                        if (op === 'take')
                            spent = validValue(spent + value, false, line);
                        break;
                    }
                    case 'currency': {
                        const value = validValue(operand(command), false, line);
                        const balance = balances[command.currency];
                        if (op === 'take' && balance < value)
                            fail(line, `Insufficient ${command.currency} currency`);
                        const updated = validValue(balance + (op === 'give' ? value : -value), false, line);
                        balances[command.currency] = updated;
                        if (op === 'take' && command.currency === 'reasoning')
                            spent = validValue(spent + value, false, line);
                        if (op === 'take' && command.currency === 'type')
                            typeSpent = validValue(typeSpent + value, false, line);
                        break;
                    }
                    case 'axiom':
                        if (!hasAxiom(command.id))
                            fail(line, `Unknown axiom: ${command.id}`);
                        changeMember(next.disabledAxioms, command.id, op === 'disable');
                        break;
                    case 'reward':
                        if (command.op === 'clear' || command.op === 'reset') {
                            changeMember(next.rewards, command.id, false);
                            changeMember(next.removedRewards, command.id, true);
                            if (command.op === 'reset') {
                                changeMember(next.done, command.id, false);
                                tileEdit(command.id).type = 3;
                                effects.push({ op: 'reset', id: command.id });
                            }
                            else
                                effects.push({ op: 'clear-reward', id: command.id });
                            break;
                        }
                        {
                            const owned = ownsReward(command.id);
                            changeMember(next.removedRewards, command.id, false);
                            if (!next.rewards.includes(command.id)) {
                                next.rewards.push(command.id);
                                if (!owned)
                                    effects.push({ op: 'reward', id: command.id });
                            }
                        }
                        break;
                    case 'layer':
                        if (!next.layers.includes(command.id)) {
                            next.layers.push(command.id);
                            effects.push({ op: 'layer', id: command.id });
                        }
                        break;
                    case 'achievement':
                    case 'info':
                        if (!effects.some(effect => effect.op === command.kind && 'id' in effect && effect.id === command.id)) {
                            effects.push({ op: command.kind, id: command.id });
                        }
                        break;
                    case 'gate':
                        if (command.op === 'demolish') {
                            tileEdit(command.id).type = 0;
                            if (!effects.some(effect => effect.op === 'demolish' && effect.id === command.id))
                                demolished++;
                            effects.push({ op: 'demolish', id: command.id });
                            break;
                        }
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
            catch (error) {
                actionFailed = true;
                throw error;
            }
            finally {
                trace({ kind: 'action', line, op, reason: actionFailed ? 'exception' : 'staged' });
            }
        }
    };
    if (explicit)
        for (const command of commands)
            if (command !== selected)
                skip([command], 'unselected-event');
    execute(selectedCommands);
    if (status === 'blocked') {
        return { ...selection, state: incoming, money, spent: 0, typeMoney, typeSpent: 0, balances: incomingBalances, effects: [], status: 'blocked',
            ...(repeat === undefined ? {} : { repeat }), ...(consumeReward === undefined ? {} : { consumeReward }), attemptEffects };
    }
    return { ...selection, state: next, money: balances.reasoning, spent, typeMoney: balances.type, typeSpent, balances, effects, status,
        ...(confirmation === undefined ? {} : { confirmation }), ...(repeat === undefined ? {} : { repeat }),
        ...(consumeReward === undefined ? {} : { consumeReward }), attemptEffects };
}
//# sourceMappingURL=script.js.map