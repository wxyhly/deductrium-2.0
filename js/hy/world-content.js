import { HSParser } from '../hs/core/parser.js';
import { NodeType } from '../asttype.js';
const parser = new HSParser();
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
function object(value, allowed, required = allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        throw Error('Content: expected plain object');
    if (Object.keys(value).some(k => forbidden.has(k) || !allowed.includes(k)) || required.some(k => !Object.hasOwn(value, k)))
        throw Error('Content: invalid fields');
}
function text(value, limit = 32000) {
    if (typeof value !== 'string' || !value.trim() || value.length > limit)
        throw Error('Content: invalid text');
}
function localized(value) {
    if (typeof value === 'string') {
        text(value);
        return;
    }
    object(value, Object.keys(value ?? {}));
    if (!Object.keys(value).length || Object.keys(value).some(k => !/^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/.test(k)))
        throw Error('Content: invalid languages');
    Object.values(value).forEach(v => text(v));
}
function ruleName(id) {
    text(id, 128);
    const ast = parser.parse(id, 'dname');
    if (ast.type !== NodeType.ATOM_DNAME || ast.name === '#' || ast.end !== id.length)
        throw Error('Content: expected atomic rule name');
}
function checked(source, mode) {
    const ast = parser.parse(source, mode);
    if (ast.end !== source.trimEnd().length)
        throw Error('Content: trailing expression');
    if (mode === 'item')
        ast.checkITEM();
    if (mode === 'wff')
        ast.checkWFF();
    if (mode === 'rule' && ast.type !== NodeType.RULE)
        throw Error('Content: expected rule');
    return ast;
}
/** Serialize parsed commands, never raw proof text, into the legacy one-line rule format. */
export function worldTheoremLine(theorem) {
    ruleName(theorem.id);
    text(theorem.statement);
    text(theorem.proof, 128000);
    const statement = checked(theorem.statement, 'rule').toString();
    const source = theorem.proof.replace(/\r\n?/g, '\n');
    const parsed = parser.parse(source, 'cmds');
    if (!parsed?.nodes.length)
        throw Error('Content: invalid proof commands');
    const allowed = new Set(['d', 'hyp', 'cond', 'var', 'mcpt', 'cd', 'pop', 'dir', 'name']);
    let end = 0;
    const commands = parsed.nodes.map(command => {
        if (!allowed.has(command.name) || command.start === undefined || command.end === undefined
            || command.start < end || /[^\s;]/.test(source.slice(end, command.start)))
            throw Error('Content: invalid proof command');
        end = command.end;
        const serialized = [command.name, ...command.nodes.map(node => {
                const value = node.toString();
                // Preserve argument boundaries: `1 -2` otherwise becomes subtraction.
                return /^[+-]/.test(value) ? `(${value})` : value;
            })].join(' ');
        if (/[\r\n;]/.test(serialized))
            throw Error('Content: invalid proof command delimiter');
        return serialized;
    });
    if (/[^\s;]/.test(source.slice(end)))
        throw Error('Content: trailing proof input');
    return `${theorem.id}:${statement};${commands.join(';')}`;
}
/** Data validation is separate from kernel replay, which happens against the earned rules. */
export function validateWorldContent(input) {
    object(input, ['rules', 'definitions', 'knowledge', 'achievements'], []);
    const value = input;
    const result = { rules: [], definitions: [], knowledge: [], achievements: [] };
    const ids = new Set(), symbols = new Set();
    for (const key of ['rules', 'definitions', 'knowledge', 'achievements']) {
        const entries = value[key] ?? [];
        if (!Array.isArray(entries) || entries.length > 256)
            throw Error('Content: at most 256 entries per collection');
        for (const entry of entries) {
            if (key === 'rules') {
                object(entry, ['id', 'statement', 'proof']);
                ruleName(entry.id);
                text(entry.statement);
                text(entry.proof, 128000);
                worldTheoremLine(entry);
            }
            else if (key === 'definitions') {
                object(entry, ['id', 'kind', 'symbol', 'parameters', 'body']);
                ruleName(entry.id);
                if (!['constant', 'function', 'predicate'].includes(entry.kind) || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(entry.symbol) || forbidden.has(entry.symbol))
                    throw Error('Content: invalid definition symbol');
                if (symbols.has(entry.symbol))
                    throw Error('Content: duplicate definition symbol');
                symbols.add(entry.symbol);
                if (!Array.isArray(entry.parameters) || entry.parameters.length > 16 || new Set(entry.parameters).size !== entry.parameters.length || entry.parameters.some((p) => typeof p !== 'string' || !/^\$[a-z][a-z0-9_]*$/.test(p)))
                    throw Error('Content: definition parameters must be distinct item variables');
                if (entry.kind === 'constant' && entry.parameters.length !== 0 || entry.kind === 'function' && entry.parameters.length === 0)
                    throw Error('Content: constants need zero parameters; functions need parameters');
                text(entry.body);
                definitionLine(entry);
            }
            else {
                object(entry, key === 'knowledge' ? ['id', 'title', 'body'] : ['id', 'title', 'description']);
                if (typeof entry.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(entry.id) || forbidden.has(entry.id))
                    throw Error('Content: invalid local ID');
                localized(entry.title);
                localized(key === 'knowledge' ? entry.body : entry.description);
            }
            const id = (key === 'definitions' ? 'rules' : key) + ':' + entry.id;
            if (ids.has(id))
                throw Error('Content: duplicate ID ' + entry.id);
            ids.add(id);
            result[key].push(structuredClone(entry));
        }
    }
    return result;
}
/** Conservative explicit definitions: a fresh symbol, item parameters, no recursion or free parameters. */
export function definitionLine(definition, existing) {
    const { kind, symbol, parameters, body } = definition;
    const ast = checked(body, kind === 'predicate' ? 'wff' : 'item');
    const walk = (node, bound = new Set()) => {
        if (node.name === symbol)
            throw Error('Content: recursive definition');
        if (node.type === NodeType.SB || node.type === NodeType.ASSERT)
            throw Error('Content: definitions must use explicit expressions');
        if (node.isReplvar() && ((!parameters.includes(node.name) && !bound.has(node.name)) || node.type !== NodeType.ATOM_ITEM))
            throw Error('Content: undeclared definition parameter ' + node.name);
        if (!node.nodes.length && [NodeType.ATOM_ITEM, NodeType.ATOM_WFF, NodeType.ATOM_UKNOWN].includes(node.type) && !bound.has(node.name) && !parameters.includes(node.name)
            && !/^(?:[+-]?\d+(?:[qr])?|\\[A-Za-z]+)$/.test(node.name))
            throw Error('Content: unbound definition variable ' + node.name);
        const binder = node.getBoundVarName();
        if (binder) {
            const scope = new Set(bound);
            scope.add(binder);
            const binderIndex = node.type === NodeType.RPL ? 1 : 0;
            const bodyIndex = node.type === NodeType.RPL ? 0 : node.nodes.length - 1;
            node.nodes.forEach((child, i) => walk(child, i === binderIndex || i === bodyIndex ? scope : bound));
        }
        else
            node.nodes.forEach(child => walk(child, bound));
    };
    walk(ast);
    const occupied = (node) => node.name === symbol || node.nodes.some(occupied);
    if (existing && [...existing.values()].some(rule => occupied(rule.conclusion) || rule.conditions.some(occupied)))
        throw Error('Content: definition symbol already exists: ' + symbol);
    const call = `${symbol}(${parameters.join(',')})`;
    const statement = kind === 'predicate' ? `⊢${call}↔(${ast})` : `⊢${call}=(${ast})`;
    return `${definition.id}:ax:${checked(statement, 'rule')}`;
}
export function worldContentLines(content) {
    return [...content.definitions.map(d => definitionLine(d)), ...content.rules.map(worldTheoremLine)];
}
export function contentId(worldId, localId, note = false) { return `${note ? 'mec:' : ''}mod:${worldId}::${localId}`; }
export function localizedContent(value, language) {
    return typeof value === 'string' ? value : value[language] ?? value.zh ?? value.en ?? Object.values(value)[0] ?? '';
}
//# sourceMappingURL=world-content.js.map