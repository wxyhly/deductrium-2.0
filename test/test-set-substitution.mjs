import assert from 'node:assert/strict';
import test from 'node:test';
import { AST } from '../js/hs/core/ast.js';
import { NodeType } from '../js/asttype.js';
import { Assertion, NFAssertion, OFAssertion } from '../js/hs/core/assert.js';
import { HSParser } from '../js/hs/core/parser.js';
import { HSLayer } from '../js/hs/main.js';
import { HilbertSystem } from '../js/hs/core/core.js';
import { initialCreativeRules } from '../js/hs/core/initial.js';
import { numberSetTheorems } from '../js/hs/core/number/set.js';

const atom = name => new AST(NodeType.ATOM_ITEM, name);
const fn = (name, ...nodes) => new AST(NodeType.FN, name, ...nodes);
const pair = (x, y) => fn('()', x, y);
const eq = (x, y) => new AST(NodeType.PRED, '=', x, y);
const rpl = (body, variable, domain) => new AST(NodeType.RPL, '', body, atom(variable), domain);
const sep = (variable, domain, predicate) => new AST(NodeType.SEP, '', atom(variable), domain, predicate);
const cls = (variable, predicate) => new AST(NodeType.CLASS, '', atom(variable), predicate);
const sb = (body, src, dst, qs = []) =>
    new AST(NodeType.SB, '', body, atom(src), dst, fn(' ', ...qs.map(atom)));

function substitute(body, src, dst, qs = [], premises = []) {
    const result = sb(body.clone(), src, dst.clone(), qs);
    Assertion.reduceSbFn(premises, result);
    return result;
}

function equalAST(actual, expected) {
    assert.ok(actual.equal(expected), `${actual.toString()} != ${expected.toString()}`);
}

function capture(body, src, dst, variable) {
    assert.throws(() => substitute(body, src, dst), error =>
        error?.type === 'sbFail' && error.quantifierSet.has(variable));
}

// Binder layouts follow AST.checkITEM(), NFAssertion.reduce() and
// OFAssertion.reduce(): RPL=[image, variable, domain], SEP=[variable,
// domain, predicate]. Only image/predicate is bound; domain uses the outer qs.
// This kernel has no checkNotFreeToEq/checkNt entry points: checks go through
// Assertion.check(NFAssertion/OFAssertion). qs protects the substitution source
// and also excludes free destination variables (capture must be rejected).
test('set parser exposes the binder layouts used by substitution', () => {
    const parser = new HSParser();
    equalAST(parser.parse('{(x,y)|y∈A}', 'item'), rpl(pair(atom('x'), atom('y')), 'y', atom('A')));
    equalAST(parser.parse('{y∈A|x=y}', 'item'), sep('y', atom('A'), eq(atom('x'), atom('y'))));
});

test('replacement image substitutes the free source', () => {
    equalAST(substitute(rpl(pair(atom('x'), atom('y')), 'y', atom('A')), 'x', atom('a')),
        rpl(pair(atom('a'), atom('y')), 'y', atom('A')));
});

test('separation predicate substitutes the free source', () => {
    equalAST(substitute(sep('y', atom('A'), eq(atom('x'), atom('y'))), 'x', atom('a')),
        sep('y', atom('A'), eq(atom('a'), atom('y'))));
});

test('replacement preserves bound source but substitutes its free domain occurrence', () => {
    equalAST(substitute(rpl(pair(atom('x'), atom('y')), 'x', atom('x')), 'x', atom('a')),
        rpl(pair(atom('x'), atom('y')), 'x', atom('a')));
});

test('separation preserves bound source but substitutes its free domain occurrence', () => {
    equalAST(substitute(sep('x', atom('x'), eq(atom('x'), atom('y'))), 'x', atom('a')),
        sep('x', atom('a'), eq(atom('x'), atom('y'))));
});

test('a replacement binder does not capture destination in its domain', () => {
    equalAST(substitute(rpl(atom('y'), 'y', atom('x')), 'x', atom('y')),
        rpl(atom('y'), 'y', atom('y')));
});

test('a separation binder does not capture destination in its domain', () => {
    equalAST(substitute(sep('y', atom('x'), eq(atom('y'), atom('y'))), 'x', atom('y')),
        sep('y', atom('y'), eq(atom('y'), atom('y'))));
});

test('replacement rejects capture in its image', () => {
    capture(rpl(pair(atom('x'), atom('y')), 'y', atom('A')), 'x', atom('y'), 'y');
});

test('separation rejects capture in its predicate', () => {
    capture(sep('y', atom('A'), eq(atom('x'), atom('y'))), 'x', atom('y'), 'y');
});

test('compound destinations also reject capture', () => {
    capture(rpl(atom('x'), 'y', atom('A')), 'x', pair(atom('a'), atom('y')), 'y');
    capture(sep('y', atom('A'), eq(atom('x'), atom('a'))), 'x', fn('f', atom('y')), 'y');
});

test('bound variables inside the destination are not free capture', () => {
    const destination = rpl(atom('y'), 'y', atom('A'));
    equalAST(substitute(rpl(atom('x'), 'y', atom('B')), 'x', destination),
        rpl(destination, 'y', atom('B')));
});

test('nested replacement scopes distinguish both domains', () => {
    const body = rpl(rpl(pair(atom('x'), atom('z')), 'z', pair(atom('x'), atom('y'))),
        'y', pair(atom('x'), atom('y')));
    equalAST(substitute(body, 'x', atom('a')),
        rpl(rpl(pair(atom('a'), atom('z')), 'z', pair(atom('a'), atom('y'))),
            'y', pair(atom('a'), atom('y'))));
    equalAST(substitute(body, 'y', atom('a')),
        rpl(body.nodes[0].clone(), 'y', pair(atom('x'), atom('a'))));
});

test('an outer binder still captures a destination in an inner domain', () => {
    capture(rpl(rpl(atom('z'), 'z', atom('x')), 'y', atom('A')), 'x', atom('y'), 'y');
    capture(sep('y', atom('A'), eq(rpl(atom('z'), 'z', atom('x')), atom('a'))),
        'x', atom('y'), 'y');
});

test('mixed replacement/separation nesting preserves inner bound sources', () => {
    equalAST(substitute(rpl(sep('x', atom('x'), eq(atom('x'), atom('y'))), 'y', atom('x')), 'x', atom('a')),
        rpl(sep('x', atom('a'), eq(atom('x'), atom('y'))), 'y', atom('a')));
});

test('explicit qs protects a bound source even at an atom', () => {
    equalAST(substitute(atom('x'), 'x', atom('a'), ['x']), atom('x'));
    const body = rpl(pair(atom('x'), atom('y')), 'y', atom('x'));
    equalAST(substitute(body, 'x', atom('a'), ['x']), body);
});

test('explicit qs rejects a free destination in an outer scope', () => {
    assert.throws(() => substitute(rpl(atom('y'), 'y', atom('x')), 'x', atom('z'), ['z']),
        error => error?.type === 'sbFail' && error.quantifierSet.has('z'));
});

test('unknown source/binder equality remains symbolic until distinctness is known', () => {
    const body = rpl(atom('x'), '$q', atom('A'));
    equalAST(substitute(body, 'x', atom('0')),
        rpl(sb(atom('x'), 'x', atom('0'), ['$q']), '$q', atom('A')));
    const distinct = [{ type: 'dt', vs: new Set(['x', '$q']) }];
    equalAST(substitute(body, 'x', atom('0'), [], distinct), rpl(atom('0'), '$q', atom('A')));
});

test('unknown destination/binder equality is not accepted as capture free', () => {
    capture(rpl(atom('x'), 'y', atom('A')), 'x', atom('$a'), 'y');
    const distinct = [{ type: 'dt', vs: new Set(['$a', 'y']) }];
    equalAST(substitute(rpl(atom('x'), 'y', atom('A')), 'x', atom('$a'), [], distinct),
        rpl(atom('$a'), 'y', atom('A')));
});

test('NF and OF agree with the substitution scope of both binders', () => {
    for (const body of [rpl(atom('x'), 'x', atom('y')), sep('x', atom('y'), eq(atom('x'), atom('x')))]) {
        assert.equal(Assertion.check([], new NFAssertion(body, new Set(['x']), new Set()).reduce()).passed, true);
        assert.equal(Assertion.check([], new NFAssertion(body, new Set(['y']), new Set()).reduce()).passed, false);
        assert.equal(Assertion.check([], new OFAssertion(body, new Set(['y'])).reduce()).passed, true);
        assert.equal(Assertion.check([], new OFAssertion(body, new Set()).reduce()).passed, false);
    }
});

test('existing quantifier and class scopes still preserve bound sources', () => {
    for (const body of [new AST(NodeType.QUANT, '∀', atom('y'), eq(atom('x'), atom('y'))),
        cls('y', eq(atom('x'), atom('y')))]) {
        const expected = body.clone();
        expected.nodes[1].nodes[0] = atom('a');
        equalAST(substitute(body, 'x', atom('a')), expected);
        equalAST(substitute(body, 'y', atom('a')), body);
        capture(body, 'x', atom('y'), 'y');
    }
});

test('Cartesian product and integer membership replay through real HSLayer', () => {
    const layer = Object.create(HSLayer.prototype);
    layer.hilbertSystem = new HilbertSystem();
    layer.ruleList = [];
    layer.ruleListView = { refresh() {} };
    layer.addRules(initialCreativeRules);
    layer.addRules(numberSetTheorems);
    const parser = new HSParser();
    const expected = new Map([
        ['.setXi', '$x∈$A→$y∈$B→($x,$y)∈$A×$B'],
        ['.@Z', 'Z(($x,$y))∈ℤ'],
    ]);
    for (const [name, statement] of expected) {
        const rule = layer.hilbertSystem.rules.get(name);
        assert.ok(rule, name);
        assert.equal(rule.error, undefined, `${name}: ${JSON.stringify(rule.error)}`);
        assert.ok(rule.step?.length, `${name}: proof must replay`);
        assert.equal(rule.assertions.length, 0, `${name}: no extra constraints`);
        assert.equal(rule.conclusion.hasSbFn(), false, `${name}: no unresolved substitution`);
        equalAST(rule.conclusion, parser.parse(statement, 'wff'));
    }
    const z = layer.hilbertSystem.rules.get('.@Z');
    assert.deepEqual(z.conditions.map(p => p.toString()), ['$x∈ℕ', '$y∈ℕ']);
});
