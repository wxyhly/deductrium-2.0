// Run after the project's normal build: node test/test-targets.mjs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { targetAtom, findTargets } from '../js/hs/targets.js';
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { NodeType } from '../js/asttype.js';

test('prompt atoms preserve ordinary names and confirmation values', () => {
    for (const name of ['1', '1.2', 'savedProof', 'mp(a1,#)', 'a,b', 'my folder', 'y', 'n', '1:macro', "'literal'", '']) {
        const atom = targetAtom(` \t${name} \t`);
        assert.equal(atom.type, NodeType.ATOM_ITEM);
        assert.equal(atom.name, name);
    }
});

test('prompt atoms decode JSON double-quoted names and escapes', () => {
    for (const name of ['my folder', 'a"b', 'a\\b', 'a\\"b', '  keep spaces  ', '\n\t', '数学', '']) {
        assert.equal(targetAtom(`  ${JSON.stringify(name)}  `).name, name);
    }
    assert.equal(targetAtom('"\\u6570\\u5b66"').name, '数学');
});

test('malformed quoted prompt atoms fail instead of becoming literal names', () => {
    for (const text of ['"unterminated', '"bad\\q"', '"bad\\u12"', '"line\nbreak"', '"a" trailing', '"a" "b"', '"a";clear', '"trailing\\']) {
        assert.throws(() => targetAtom(text), SyntaxError, text);
    }
});

test('full rename and prompt parsing decode the same target and new name', () => {
    const parser = new HSParser();
    for (const [before, after] of [
        ['my folder', 'new folder'],
        ['a"b', 'c"d'],
        ['a\\b', 'c\\d'],
        ['a\\"b', '数学 folder'],
        ['  keep spaces  ', '  new spaces  '],
    ]) {
        const args = [before, after].map(name => JSON.stringify(name));
        const command = parser.parse(`rename ${args.join(' ')}`, 'cmd');
        assert.deepEqual(command.nodes.map(node => node.name), [before, after]);
        assert.deepEqual(command.nodes.map(node => node.name), args.map(value => targetAtom(value).name));
    }
});

test('a completed quoted folder resolves identically in full and prompt rename', () => {
    const system = new HilbertSystem();
    const parser = new HSParser();
    for (const name of ['my folder', 'a"b', 'a\\b']) {
        const folder = { name, uuid: 1, children: [] };
        const text = JSON.stringify(name);
        const prompt = targetAtom(text);
        const inline = parser.parse(`rename ${text} renamed`, 'cmd').nodes[0];
        const expected = [{ kind: 'folder', name, node: folder }];
        assert.deepEqual(findTargets(system, [folder], prompt.name, 'rename'), expected);
        assert.deepEqual(findTargets(system, [folder], inline.name, 'rename'), expected);
    }
});
