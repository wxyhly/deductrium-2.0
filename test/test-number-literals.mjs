// Optional argument: compiled JS directory, e.g. a temporary tsc --outDir.
import assert from 'node:assert/strict';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const build = process.argv[2]
    ? pathToFileURL(resolve(process.argv[2]) + sep)
    : new URL('../js/', import.meta.url);
const { getNumberLiteralDefinition: definition } = await import(new URL('hs/core/number-literals.js', build));
const { HSParser } = await import(new URL('hs/core/parser.js', build));
const { NodeType } = await import(new URL('asttype.js', build));
const parser = new HSParser();
let checked = 0;

const atom = name => [NodeType.ATOM_ITEM, name];
const fn = (name, ...nodes) => [NodeType.FN, name, ...nodes];
const pred = (name, ...nodes) => [NodeType.PRED, name, ...nodes];
const shape = ast => [ast.type, ast.name, ...ast.nodes.map(shape)];

function check(name, text, expected) {
    assert.equal(definition(name), text, name);
    const ast = parser.parse(text, 'rule');
    assert.ok(ast, `${name}: HSParser must parse the definition`);
    assert.equal(ast.type, NodeType.RULE, name);
    assert.equal(ast.end, text.length, `${name}: HSParser must consume the complete rule`);
    assert.equal(ast.nodes.length, 1, `${name}: a closed definition has no premises`);
    assert.deepEqual(shape(ast.nodes[0]), expected, `${name}: parsed definition must preserve every atom`);
    checked++;
}

function natural(n) {
    const predecessor = (BigInt(n) - 1n).toString();
    check(`d${n}`, `⊢${n}=S(${predecessor})`, pred('=', atom(n), fn('S', atom(predecessor))));
}

function integer(name, literal, first, second) {
    check(name, `⊢${literal}=Z((${first},${second}))`,
        pred('=', atom(literal), fn('Z', fn('()', atom(first), atom(second)))));
}

function rational(name, literal, numerator, denominator) {
    check(name, `⊢${literal}=Q((${numerator},${denominator}))`,
        pred('=', atom(literal), fn('Q', fn('()', atom(numerator), atom(denominator)))));
}

function real(name, literal, boundary) {
    check(name, `⊢${literal}={x∈ℚ|x≤${boundary}∧¬(x=${boundary})}`,
        pred('=', atom(literal), [NodeType.SEP, '', atom('x'), atom('ℚ'),
            [NodeType.LOGIC, '/\\', pred('\\<=', atom('x'), atom(boundary)),
                [NodeType.LOGIC, '~', pred('=', atom('x'), atom(boundary))]]
        ]));
}

for (const n of ['1', '2', '9', '10', '99', '100', '9007199254740993', '1' + '0'.repeat(320)]) natural(n);

for (const n of ['0', '1', '13', '9007199254740993']) {
    integer(`dZ${n}`, `+${n}`, n, '0');
    integer(`dZ+${n}`, `+${n}`, n, '0');
    integer(`dZ-${n}`, `-${n}`, '0', n);
    for (const prefix of ['dQ', 'd']) {
        for (const sign of ['', '+', '-']) {
            const literal = `${sign === '-' ? '-' : ''}${n}`;
            rational(`${prefix}${sign}${n}q`, `${literal}q`, `${sign || '+'}${n}`, '+1');
            real(`${prefix === 'dQ' ? 'dR' : 'd'}${sign}${n}r`, `${literal}r`, `${literal}q`);
        }
    }
    for (const sign of ['', '+', '-']) {
        const literal = `${sign === '-' ? '-' : ''}${n}`;
        rational(`dQ${sign}${n}`, `${literal}q`, `${sign || '+'}${n}`, '+1');
        real(`dR${sign}${n}`, `${literal}r`, `${literal}q`);
    }
}

// Include the legacy all-zero numerator regression and empty fractional part.
const decimals = [
    ['0.0', '0', '10'], ['0.000', '0', '1000'], ['0.', '0', '1'],
    ['5.', '5', '1'], ['0.5', '5', '10'], ['0.001', '1', '1000'],
    ['12.0300', '120300', '10000'], ['9007199254740993.0001', '90071992547409930001', '10000'],
    ['0.' + '0'.repeat(80) + '1', '1', '1' + '0'.repeat(81)]
];
for (const [digits, numerator, denominator] of decimals) {
    for (const sign of ['', '+', '-']) {
        const literal = `${sign === '-' ? '-' : ''}${digits}`;
        for (const prefix of ['d', 'dQ']) {
            for (const suffix of ['', 'q']) {
                rational(`${prefix}${sign}${digits}${suffix}`, literal, `${sign || '+'}${numerator}`, `+${denominator}`);
            }
        }
        // No suffix and no R prefix is already covered by rational().
        for (const [prefix, suffix] of [['dR', ''], ['dR', 'r'], ['d', 'r']]) {
            real(`${prefix}${sign}${digits}${suffix}`, `${literal}r`, literal);
        }
    }
}

for (const name of [
    '', 'd0', 'd00', 'd01', 'd-1', 'd+1', 'dZ', 'dQ', 'dR',
    'dZ01', 'dQ01', 'dR01', 'dZ1q', 'dZ1r', 'dQ1r', 'dR1q',
    'dQ0.5r', 'dR0.5q', 'dZ0.5', 'd.5', 'dQ.5', 'dR.5',
    'd1..0', 'd1.2.3', 'dQ1/2', 'dR1/2', 'd1e3', 'dNaN', 'dInfinity',
    '#1', '+1', '-1', 'd++1q', 'dQ--1', 'dR+-1', 'dQ1qq', 'dR1rr',
    ' d1', 'd1 ', 'd1\n', 'dQ0.0\r\n', 'dR1r\t', 'd1\n2', 'd1;⊢0=1'
]) {
    assert.equal(definition(name), undefined, name);
    checked++;
}

console.log(`number literal definitions: ${checked} cases passed`);
