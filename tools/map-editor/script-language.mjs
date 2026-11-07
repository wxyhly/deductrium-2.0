import {SCRIPT_GROUPS} from './script-help.mjs';
import {PROOF_TAGS} from '../../js/hs/proof-tags.js';

const proofTags = PROOF_TAGS.map(tag => tag.id);

const comparisons = ['>=', '<=', '==', '!=', '>', '<'];
const layers = ['D-layer', 'T-layer', 'P-layer', 'G-layer'];
const tileTypes = ['road', 'wall', 'gate', 'reward', 'ordinal'];
const metrics = ['steps', 'demolished', 'spent', 'ordinal-base'];
const functions = ['count', 'currency', 'metric', 'min', 'max'];
const operators = new Set([';', '(', ')', ',', '+', '-', '*', ...comparisons, '=', '!']);

// UTF-16 offsets match textarea selectionStart/selectionEnd. Invalid strings recover
// at the next physical line, just as the line-oriented parser does.
function scan(source) {
    const tokens = [];
    let i = 0, lineStart = true;
    const push = (start, kind, closed = true) => tokens.push({start, end: i, kind, closed, value: source.slice(start, i)});
    while (i < source.length) {
        const ch = source[i];
        if (ch === '\r' || ch === '\n') { i++; lineStart = true; continue; }
        if (/\s/.test(ch)) { i++; continue; }
        const start = i;
        if (lineStart && source.startsWith('//', i)) {
            while (i < source.length && !/[\r\n]/.test(source[i])) i++;
            push(start, 'comment'); lineStart = false; continue;
        }
        lineStart = false;
        if (ch === '"') {
            i++;
            let closed = false;
            while (i < source.length && !/[\r\n]/.test(source[i])) {
                if (source[i] === '\\') {
                    i++;
                    if (i < source.length && !/[\r\n]/.test(source[i])) i++;
                } else if (source[i++] === '"') { closed = true; break; }
            }
            push(start, 'string', closed); continue;
        }
        const pair = source.slice(i, i + 2);
        if (operators.has(pair)) { i += 2; push(start, 'operator'); continue; }
        if (operators.has(ch)) { i++; push(start, 'operator'); continue; }
        const number = source.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
        if (number && (i + number[0].length === source.length || /[\s;"(),+*<>=!\-]/.test(source[i + number[0].length]))) {
            i += number[0].length; push(start, 'number'); continue;
        }
        // Hyphens belong to IDs/keywords (not-key, ordinal-base, mod:my-id).
        while (i < source.length && !/[\s;"(),+*<>=!]/.test(source[i])) i++;
        push(start, 'reference');
    }
    return tokens;
}

function statements(source, tokens) {
    const result = [];
    let row = [], end = 0;
    for (const token of tokens) {
        if (/[\r\n]/.test(source.slice(end, token.start)) || token.value === ';' || token.kind === 'comment') {
            if (row.length) result.push(row);
            row = [];
        }
        if (token.value !== ';' && token.kind !== 'comment') row.push(token);
        end = token.end;
    }
    if (row.length) result.push(row);
    return result;
}

// Command and predicate vocabulary comes from the same catalogue as the help UI.
const commands = new Map(), predicates = new Set(), vocabulary = new Set();
for (const group of SCRIPT_GROUPS) for (const item of group.entries) {
    for (const row of statements(item.template, scan(item.template))) {
        const [head, second] = row;
        if (head.kind !== 'reference') continue;
        if (!commands.has(head.value)) commands.set(head.value, new Set());
        if (second?.kind === 'reference' && !['if', 'elif', 'exchange'].includes(head.value)) {
            commands.get(head.value).add(second.value);
        }
        if (head.value === 'require' && second) predicates.add(second.value);
    }
}
for (const [head, seconds] of commands) { vocabulary.add(head); for (const word of seconds) vocabulary.add(word); }
for (const word of [...functions, ...layers, ...tileTypes, ...metrics, ...proofTags, 'using', 'and', 'or', 'not', 'next', 'base']) vocabulary.add(word);

/** Non-overlapping spans only; whitespace is preserved by gaps, never rewritten. */
export function tokenizeScript(source) {
    if (typeof source !== 'string') return [];
    return scan(source).map(({start, end, kind, value}) => ({start, end,
        kind: kind === 'reference' && vocabulary.has(value) ? 'keyword' : kind}));
}

function symbols(source, tokens, context) {
    const values = name => Array.isArray(context[name]) ? context[name].flatMap(item => {
        const id = typeof item === 'string' ? item : item?.id;
        return typeof id === 'string' && id.length && !/[\s;"\u0000-\u001f\u007f]/.test(id) ? [id] : [];
    }) : [];
    const ids = {
        key: values('keys'), flag: values('flags'), count: values('counts'),
        axiom: values('axioms'), tile: ['@self', ...values('tiles')],
        currency: ['reasoning', 'type', ...values('currencies')], bank: values('banks'),
        reward: values('rewards'), rule: [...values('rules'), ...values('axioms')], type: values('types'),
        achievement: values('achievements'), info: values('infos'), layer: layers, metric: metrics
    };
    for (const row of statements(source, tokens)) {
        const [op, kind, id] = row;
        if (!id || id.kind !== 'reference' || !kind || kind.kind !== 'reference') continue;
        if ((kind.value === 'key' && op.value === 'give') || (kind.value === 'flag' && op.value === 'set')
            || (kind.value === 'count' && ['set', 'add'].includes(op.value))
            || (kind.value === 'axiom' && op.value === 'add')) ids[kind.value].push(id.value);
    }
    ids.rule.push(...ids.axiom);
    return ids;
}

function numberCandidates(words, ids, logical = false) {
    const last = words.at(-1);
    if (last === '(' && ['count', 'currency', 'metric'].includes(words.at(-2))) return ids[words.at(-2)];
    if (!last || ['(', ',', '+', '-', '*'].includes(last)) return functions;
    return ['+', '-', '*', ...(logical ? ['and', 'or'] : [])];
}

function conditionCandidates(words, ids, logical, following) {
    const split = words.findLastIndex(word => word === 'and' || word === 'or');
    const part = words.slice(split + 1);
    while (part[0] === '(' || part[0] === 'not') part.shift();
    if (!part.length) return [...predicates, ...(logical ? ['not'] : [])];
    const [kind] = part;
    const at = part.length - 1;
    const idKind = kind.startsWith('not-') ? kind.slice(4) : kind;
    if (['proof', 'rule'].includes(kind) && /^"[\s\S]*"$/.test(part[1] ?? '')) {
        if (at === 1) return ['using', ...(logical ? ['and', 'or'] : [])];
        if (part[2] === 'using' && part.at(-1) !== ')') {
            // Exclude tags on either side of the caret, stopping at this predicate's end.
            const end = following.findIndex(word => ['and', 'or', ')'].includes(word));
            const selected = new Set([...part.slice(3), ...following.slice(0, end < 0 ? following.length : end)]);
            const complete = part.length > 3 && part.slice(3).every(tag => proofTags.includes(tag));
            return [...proofTags.filter(tag => !selected.has(tag)), ...(logical && complete ? ['and', 'or'] : [])];
        }
    }
    if (['money', 'currency', 'count', 'metric'].includes(kind)) {
        const comparisonAt = kind === 'money' ? 1 : 2;
        if (at < comparisonAt - 1) return ids[kind] ?? [];
        if (at === comparisonAt - 1) return comparisons;
        return numberCandidates(part.slice(comparisonAt + 1), ids, logical);
    }
    if (kind === 'ordinal') {
        if (at === 0) return ['current', 'max', 'next'];
        if (at === 1) return comparisons;
        return at >= 3 && logical ? ['and', 'or'] : [];
    }
    if (kind === 'tile') {
        if (at === 0) return ids.tile;
        if (at === 1) return ['==', '!='];
        if (at === 2) return tileTypes;
    } else if (at === 0) {
        if (['proof', 'rule', 'type', 'rule-name'].includes(kind)) return [];
        return ids[idKind === 'rule-present' ? 'rule' : idKind === 'type-present' ? 'type' : idKind] ?? [];
    }
    return predicates.has(kind) && logical ? ['and', 'or'] : [];
}

function candidates(words, ids, following) {
    if (!words.length) return [...commands.keys()];
    const [op, kind] = words;
    if (['require', 'if', 'elif'].includes(op)) return conditionCandidates(words.slice(1), ids, op !== 'require', following);
    if (op === 'exchange') {
        if (words.length === 1) return ids.bank;
        if (words.length === 2) return ids.currency;
        return [...numberCandidates(words.slice(3), ids), ...(words.length > 3 ? ids.currency : [])];
    }
    if (words.length === 1) return [...(commands.get(op) ?? [])];
    if (['else', 'end', 'allow', 'block', 'on', 'event', 'reward', 'remember', 'message', 'confirm', 'recompute', 'raise', 'generate'].includes(op)) return [];
    if (op === 'set' && kind === 'language') return words.length === 2 ? ['zh', 'en'] : [];
    if (op === 'set' && kind === 'ordinal') {
        if (words.length === 2) return ['current', 'max', 'base'];
        return words.length === 3 && words[2] === 'base' ? Array.from({length: 15}, (_, i) => String(i + 1)) : [];
    }
    if (kind === 'money') return ['give', 'take'].includes(op) ? numberCandidates(words.slice(2), ids) : [];
    if (words.length === 2) return ids[kind === 'gate' || kind === 'text' ? 'tile' : kind] ?? [];
    if (op === 'set' && kind === 'tile') return words.length === 3 ? tileTypes : [];
    if ((['set', 'add'].includes(op) && kind === 'count') || (['give', 'take'].includes(op) && kind === 'currency')) return numberCandidates(words.slice(3), ids);
    return [];
}

/** Plain edits: caller owns DOM, spacing, undo and acceptance. No template insertion. */
export function completeScript(source, cursor, context = {}) {
    if (typeof source !== 'string' || !Number.isInteger(cursor) || cursor < 0 || cursor > source.length) return [];
    context = context && typeof context === 'object' ? context : {};
    const tokens = scan(source);
    // At a closing quote there is no separating space yet; a bare insertion
    // would glue a keyword to JSON text. Completion resumes after whitespace.
    if (tokens.some(token => (token.kind === 'comment' || token.kind === 'string')
        && cursor >= token.start && cursor <= token.end)) return [];
    const replaceable = tokens.filter(token => ['reference', 'number'].includes(token.kind) || comparisons.includes(token.value));
    const current = replaceable.find(token => cursor >= token.start && cursor < token.end)
        ?? replaceable.find(token => cursor === token.end);
    const from = current?.start ?? cursor, to = current?.end ?? cursor;
    const prefix = source.slice(from, cursor), original = source.slice(from, to);
    const before = tokens.filter(token => token.end <= from);
    let start = before.length;
    while (start > 0) {
        const token = before[start - 1], nextStart = start === before.length ? from : before[start].start;
        if (token.value === ';' || token.kind === 'comment' || /[\r\n]/.test(source.slice(token.end, nextStart))) break;
        start--;
    }
    const words = before.slice(start).map(token => token.value);
    const after = tokens.filter(token => token.start >= to);
    let end = 0, previous = to;
    while (end < after.length && after[end].value !== ';' && after[end].kind !== 'comment'
        && !/[\r\n]/.test(source.slice(previous, after[end].start))) previous = after[end++].end;
    const following = after.slice(0, end).map(token => token.value);
    const result = [], seen = new Set();
    for (const value of candidates(words, symbols(source, tokens, context), following)) {
        if (typeof value !== 'string' || !value.startsWith(prefix) || value === original || seen.has(value)) continue;
        seen.add(value);
        result.push({from, to, label: value, insertText: value});
        if (result.length === 80) break;
    }
    return result;
}
