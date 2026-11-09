// Run after tsc: node --test test/test-map-notation.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { initMap, blockMap, nameMap } from '../js/hy/maploader.js';
import { Polygon } from '../js/hy/tiling.js';
import { HSParser } from '../js/hs/core/parser.js';
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSLayer } from '../js/hs/main.js';
import { initialCreativeRules } from '../js/hs/core/initial.js';
import { NodeType } from '../js/asttype.js';
import { knowledgeBase } from '../js/pg/kb.js';

const log = console.log;
try { console.log = () => {}; initMap(new Polygon(6, 4)); }
finally { console.log = log; }
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const gates = [...blockMap.values()].filter(tile => tile.data?.p || tile.data?.d);
const parse = (text, kind = 'wff') => new HSParser().parse(text.replaceAll('\n', ''), kind);
const gate = text => {
    const found = gates.find(tile => tile.text === text);
    assert.ok(found, `official gate: ${text}`);
    return parse(found.text, found.data.d ? 'rule' : 'wff');
};
function walk(ast, visit) { visit(ast); ast.nodes.forEach(child => walk(child, visit)); }

test('notation migration preserves every tile address, name, reward, flag and type-layer gate', () => {
    assert.equal(blockMap.size, 2096);
    assert.equal(nameMap.size, 501);
    assert.equal(hash([...blockMap].map(([hash, { type, name, data }]) => [hash, type, name, data])),
        'fda1dfb73c157ad3fde7acacf9c556d54f6fbcfe6375287610b1955fb4955752');
    assert.equal(hash([...nameMap]), '011e2faebb70f68f8b8cc2812d887197b83500f591f41442d17e821248945e18');
    assert.equal(hash([...blockMap].filter(([, tile]) => tile.data?.t || tile.data?.td)),
        '64901398038a22b35e971134bab30d446ed26fa1e91f811cf408780f56005f67');
});

test('all official HS gates parse completely and use current set/function notation', () => {
    assert.equal(gates.length, 218);
    for (const tile of gates) {
        const parser = new HSParser();
        const ast = parser.parse(tile.text.replaceAll('\n', ''), tile.data.d ? 'rule' : 'wff');
        assert.ok(ast, tile.text);
        assert.equal(parser.token, undefined, `unconsumed notation: ${tile.text}`);
        walk(ast, node => {
            assert.ok(!['Pr1', 'Pr2', 'Pow', 'Union', 'quiv', 'N'].includes(node.name), tile.text);
            if (node.type === NodeType.ATOM_ITEM) assert.ok(!['Z', 'Q', 'R'].includes(node.name), tile.text);
        });
    }
});

test('real current proofs pass migrated natural, integer, projection and recorded-rule gates', () => {
    const layer = Object.create(HSLayer.prototype);
    layer.hilbertSystem = new HilbertSystem();
    layer.ruleList = [];
    layer.ruleListView = { refresh() {}, expandedFolders: new Set(), idCounter: 1 };
    layer.propListView = { refresh() {} };
    layer.addRules(initialCreativeRules);
    const hs = layer.hilbertSystem;
    layer.sheetGui = { saveCurrentSheet() {}, sheets: [] };
    for (const [text, commands] of [
        ['$0∈ℕ→($1∈ℕ→$0+$1=$1+$0)', '.+s $0 $1'],
        ['∀x:(x∈ℕ→x*0=0)', 'var x;d*1 x'],
        ['$1∈ℤ→($2∈ℤ→($1+$2)=($2+$1))', '.Z+s $1 $2'],
        ['x = pr1((x,y))', '.Pr1 x y;.=s 1'],
        ['y = pr2((x,y))', '.Pr2 x y;.=s 1'],
    ]) {
        hs.clear();
        hs.fromCmd(new HSParser().parse(commands, 'cmds').nodes);
        layer.sheetGui.sheets = [{ ctx: hs.saveContext() }];
        assert.equal(layer.checkPropGate(gate(text)), true, text);
        if (text.includes('ℕ')) assert.equal(layer.checkPropGate(parse(text.replaceAll('ℕ', 'N'))), false);
        if (text.includes('pr1')) assert.equal(layer.checkPropGate(parse(text.replaceAll('pr1', 'Pr1'))), false);
    }
    const rule = hs.rules.get('.Zr');
    assert.equal(rule.error, undefined);
    assert.ok(rule.step.length, 'integer-shift gate is backed by a replayed proof');
    assert.equal(layer.checkRuleGate(gate('$x∈ℕ,$y∈ℕ,$z∈ℕ⊢Z(($x,$y))=Z(($x+$z,$y+$z))')), true);
    const expectedPow = parse('pow(ω)', 'item');
    let found = false;
    walk(gate('¬Equiv(ω,pow(ω))'), node => { if (node.equal(expectedPow)) found = true; });
    assert.ok(found, 'Cantor gate uses the function from dpow');
    assert.ok(hs.rules.get('dpow').conclusion.toString().includes('pow('));
    const renameHint = [...blockMap.values()].find(tile =>
        typeof tile.text === 'object' && tile.text.en?.includes('Try executing the rule'));
    const hintedRule = renameHint.text.en.match(/"([^"]+)"/)[1];
    assert.equal(hintedRule, '>veve.\\acn');
    assert.ok(hs.getD(new HSParser().parse(hintedRule, 'dname')).step.length,
        'the copied rule name from the hint resolves to a checked proof');
});

test('subset explanation agrees with the nonstrict d\\c definition', () => {
    assert.ok(!/真子集|严格包含|Proper subset|strictly contained/.test(knowledgeBase.syms['⊂'].name));
    assert.match(knowledgeBase.syms['⊂'].name, /子集/);
    assert.match(knowledgeBase.syms['⊂'].name, /Subset/);
});
