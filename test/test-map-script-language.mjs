import assert from 'node:assert/strict';
import {test} from 'node:test';
import {tokenizeScript, completeScript} from '../tools/map-editor/script-language.mjs';
import {SCRIPT_GROUPS} from '../tools/map-editor/script-help.mjs';

function at(marked, context) {
    const cursor = marked.indexOf('|');
    assert.notEqual(cursor, -1);
    return completeScript(marked.replace('|', ''), cursor, context);
}
const labels = edits => edits.map(edit => edit.label);
const has = (marked, expected, context) => {
    const actual = labels(at(marked, context));
    for (const label of expected) assert.ok(actual.includes(label), `${marked}: missing ${label} in ${actual}`);
};
const lacks = (marked, expected, context) => {
    const actual = labels(at(marked, context));
    for (const label of expected) assert.ok(!actual.includes(label), `${marked}: unexpected ${label}`);
};

test('token spans preserve UTF-16 offsets, whitespace, CRLF and JSON escapes', () => {
    const source = '  on touch\r\n\tmessage "😀 \\"quoted\\" \\u4f60; //"; add count trips -1.5e+2\r\n  // 注释';
    const tokens = tokenizeScript(source);
    let end = 0;
    for (const token of tokens) {
        assert.ok(token.start >= end && token.end > token.start && token.end <= source.length);
        assert.ok(['keyword', 'string', 'number', 'comment', 'operator', 'reference'].includes(token.kind));
        assert.match(source.slice(end, token.start), /^\s*$/u);
        end = token.end;
    }
    assert.deepEqual(tokens.filter(t => t.kind === 'string').map(t => source.slice(t.start, t.end)), ['"😀 \\"quoted\\" \\u4f60; //"']);
    assert.deepEqual(tokens.filter(t => t.kind === 'number').map(t => source.slice(t.start, t.end)), ['1.5e+2']);
    assert.equal(source.slice(tokens.at(-1).start), '// 注释');
});

test('only whole physical lines starting with // are comments', () => {
    const source = '// first\n  // second\r\nmessage "// string"; // not a comment\ngive key red // neither';
    const tokens = tokenizeScript(source);
    assert.equal(tokens.filter(t => t.kind === 'comment').length, 2);
    assert.equal(tokens.filter(t => t.kind === 'reference' && source.slice(t.start, t.end) === '//').length, 2);
    assert.ok(!tokens.some(t => t.kind === 'comment' && t.start > source.indexOf('message')));
    assert.deepEqual(at('  // req|uire'), []);
    assert.deepEqual(at('// comment|'), []);
    has('message "text"; req|', ['require']);
});

test('numbers, comparison/arithmetic symbols, @self and namespace IDs', () => {
    const source = 'if currency mod:my-id >= .5e-2 and count visits != 2\nset tile @self road; add count visits -1*(2+3)';
    const tokens = tokenizeScript(source);
    for (const word of ['mod:my-id', '@self', 'visits']) {
        assert.ok(tokens.some(t => t.kind === 'reference' && source.slice(t.start, t.end) === word));
    }
    for (const operator of ['>=', '!=', '-', '*', '(', ')', '+', ';']) {
        assert.ok(tokens.some(t => t.kind === 'operator' && source.slice(t.start, t.end) === operator));
    }
    assert.ok(tokens.some(t => t.kind === 'number' && source.slice(t.start, t.end) === '.5e-2'));
});

test('unfinished strings and invalid escapes tolerate editing and recover next line', () => {
    for (const marked of ['message "hel|lo', 'message "bad\\q|"', 'message "escape\\|', 'message "a\\"b|"']) {
        assert.doesNotThrow(() => tokenizeScript(marked));
        assert.deepEqual(at(marked), []);
    }
    has('message "unfinished\n  req|', ['require']);
    assert.deepEqual(at('message "hello|"'), []);
    assert.deepEqual(at('message "hello"|'), []);
    assert.deepEqual(at('if proof "P"|'), []);
    has('if proof "P" |', ['and', 'or']);
});

test('commands are sourced from every catalogue statement, never entire templates', () => {
    const completions = labels(at('|'));
    for (const group of SCRIPT_GROUPS) for (const entry of group.entries) {
        for (const line of entry.template.split(/[\r\n;]/)) {
            const head = line.trim().split(/\s/)[0];
            if (head) assert.ok(completions.includes(head), `catalogue command ${head}`);
        }
    }
    for (const edit of at('|')) assert.match(edit.insertText, /^[a-z-]+$/);
    has('  dis|', ['disable']);
    has('on touch\n  gi|', ['give']);
});

test('secondary keywords and event/policy enums are contextual', () => {
    has('give |', ['key', 'money', 'currency']);
    lacks('give |', ['flag', 'touch', 'set']);
    has('set |', ['flag', 'count', 'ordinal', 'tile', 'text', 'language']);
    has('unlock |', ['reward', 'layer', 'achievement', 'info', 'rule', 'type']);
    has('on |', ['touch', 'pass', 'collect', 'start']);
    has('event |', ['once', 'repeat']);
    has('reward |', ['keep', 'consume']);
    has('remember |', ['proof', 'rule', 'type']);
    assert.deepEqual(at('allow |'), []);
    assert.deepEqual(at('on touch |'), []);
});

test('whole current token is replaced, preserving suffix, indentation and later text', () => {
    const marked = 'on touch\r\n\t  req|zzz key red; message "unchanged"\r\nend';
    const source = marked.replace('|', '');
    const edit = at(marked).find(e => e.label === 'require');
    assert.deepEqual(edit, {from: source.indexOf('reqzzz'), to: source.indexOf('reqzzz') + 6, label: 'require', insertText: 'require'});
    assert.equal(source.slice(0, edit.from) + edit.insertText + source.slice(edit.to), 'on touch\r\n\t  require key red; message "unchanged"\r\nend');
    const id = at('open gate @s|garbage', {tiles: ['door']}).find(e => e.label === '@self');
    assert.equal(id.to - id.from, '@sgarbage'.length);
});

test('no-op candidates are omitted, including enums and symbols', () => {
    lacks('on touch|', ['touch']);
    lacks('set tile @self road|', ['road']);
    lacks('require key red|', ['red'], {keys: ['red']});
    lacks('require money >=|', ['>=']);
    lacks('on to|uch', ['touch']);
    has('on to|ch', ['touch']);
    has('set language e|zzz', ['en']);
});

test('declared symbols are collected across events and forward references without parser success', () => {
    const declarations = '\nadd axiom zLocal "⊢P"\ngive key blue\nset flag ready\nset count visits 0\nadd count other 1\ninvalid ??\n';
    has(`require key b|${declarations}`, ['blue']);
    has(`if not-flag r|${declarations}`, ['ready']);
    has(`require count v|${declarations}`, ['visits']);
    has(`remove axiom z|${declarations}`, ['zLocal']);
    has(`require rule-present z|${declarations}`, ['zLocal']);
    lacks('require key |\n// give key fake\nmessage "give key stringFake"', ['fake', 'stringFake']);
    lacks('require axiom |\nadd axiom "quotedId" "⊢P"', ['quotedId']);
});

test('external tiles/axioms/currencies/banks plus builtins, with no context mutation', () => {
    const context = {tiles: ['door', 'mod:room::gate'], axioms: ['a3', 'zCustom'], currencies: ['mod:gold'], banks: ['central']};
    const before = structuredClone(context);
    has('close gate |', ['@self', 'door', 'mod:room::gate'], context);
    has('disable axiom |', ['a3', 'zCustom'], context);
    has('take currency |', ['reasoning', 'type', 'mod:gold'], context);
    has('exchange |', ['central'], context);
    has('exchange central |', ['reasoning', 'type', 'mod:gold'], context);
    has('exchange central reasoning 10 |', ['type', 'mod:gold'], context);
    assert.deepEqual(context, before);
});

test('predicate positions and nested boolean conditions use the correct ID domains', () => {
    has('require |', ['not-key', 'key', 'proof', 'ordinal', 'metric', 'rule-present', 'type-present']);
    has('if (|', ['not', 'key', 'proof', 'count']);
    has('if key red |', ['and', 'or']);
    has('if (key red or flag ready) and not |', ['reward', 'key', 'axiom']);
    has('elif key red and not-axiom z|', ['zMap'], {axioms: ['zMap']});
    has('if key red or (tile |', ['@self', 'door'], {tiles: ['door']});
    lacks('require key red |', ['and', 'or', 'key']);
    has('require layer |', ['D-layer', 'T-layer', 'P-layer', 'G-layer']);
});

test('enumerations and comparisons exclude invalid alternatives', () => {
    has('set tile door |', ['road', 'wall', 'gate', 'reward', 'ordinal']);
    has('set language |', ['zh', 'en']);
    has('require ordinal |', ['current', 'max', 'next']);
    has('set ordinal |', ['current', 'max', 'base']);
    lacks('set ordinal |', ['next']);
    has('set ordinal base |', ['1', '15']);
    has('require metric |', ['steps', 'spent', 'demolished', 'ordinal-base']);
    has('require money |', comparisons());
    has('require count visits |', comparisons());
    has('require tile door |', ['==', '!=']);
    lacks('require tile door |', ['>=', '<']);
    has('if tile door == |', ['road', 'wall', 'gate']);
});
function comparisons() { return ['>=', '<=', '==', '!=', '>', '<']; }

test('number references and min/max nested arguments complete IDs, not commands', () => {
    const suffix = '\nset count visits 0';
    has('give money |', ['count', 'currency', 'metric', 'min', 'max']);
    has(`give money min(10, count(v|))${suffix}`, ['visits']);
    has('require money >= currency(mod:g|)', ['mod:gold'], {currencies: ['mod:gold']});
    has('if money >= max(0, metric(s|))', ['steps', 'spent']);
    has('set count visits metric(|)', ['steps', 'spent', 'demolished', 'ordinal-base']);
    has('if money >= count(visits) |', ['and', 'or', '+', '-', '*']);
    lacks('give money |', ['require', 'on', 'wall']);
});

test('semicolons and CR/LF reset completion context, strings keep delimiters inside', () => {
    for (const separator of [';', '\n', '\r', '\r\n']) has(`give money 5${separator}  un|`, ['unlock']);
    has('message "on touch; give money 5"; op|', ['open']);
    assert.deepEqual(at('message "on touch; gi|ve money 5"'), []);
});

test('deduplication, limit and ID filtering protect plain-text edits', () => {
    const tiles = ['door', 'door', '@self', '', 'bad id', 'bad;id', 'bad"id', ...Array.from({length: 150}, (_, i) => `tile${i}`)];
    const edits = at('open gate |', {tiles});
    assert.equal(edits.length, 80);
    assert.equal(new Set(labels(edits)).size, 80);
    assert.ok(!labels(edits).some(id => /[\s;"]/.test(id)));
    assert.deepEqual(at('message |', {tiles}), []);
    has('open gate |', ['door'], {tiles: [{id: 'door'}]});
});

test('invalid API input returns empty results, no DOM or compiled JS dependencies', () => {
    for (const source of [null, undefined, 123, {}, []]) {
        assert.deepEqual(tokenizeScript(source), []);
        assert.deepEqual(completeScript(source, 0), []);
    }
    for (const cursor of [undefined, null, NaN, Infinity, -1, 1.5, 999]) assert.deepEqual(completeScript('set ', cursor), []);
    for (const context of [null, false, 1, {tiles: null, banks: 'bad', axioms: [null, 1, {}]}]) assert.doesNotThrow(() => completeScript('open gate ', 10, context));
});

test('every cursor in malformed mixed text produces valid bounded edit ranges', () => {
    const source = 'on touch\n  if ??? (key @self and count(x) > -1e-2\r\nmessage "😀\\q; unfinished\n// hi\nset text @self "\\""; req???';
    for (let cursor = 0; cursor <= source.length; cursor++) {
        const edits = completeScript(source, cursor, {tiles: ['@self', 'door'], currencies: ['mod:gold']});
        assert.ok(edits.length <= 80);
        for (const edit of edits) {
            assert.ok(edit.from <= cursor && cursor <= edit.to && edit.from >= 0 && edit.to <= source.length);
            assert.notEqual(source.slice(edit.from, edit.to), edit.insertText);
            assert.equal(typeof edit.label, 'string');
            assert.ok(!/[\r\n]/.test(edit.insertText));
        }
    }
});
