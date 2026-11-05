import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { getSurvivalRules } from '../js/hs/rewards.js';
import { initialCreativeRules } from '../js/hs/core/initial.js';
import { HilbertSystem } from '../js/hs/core/core.js';
import { HSParser } from '../js/hs/core/parser.js';
import { Deduction } from '../js/hs/core/deduction.js';
import { AST } from '../js/hs/core/ast.js';
import { AtomSolver } from '../js/hs/core/assert.js';
import { MCPT } from '../js/hs/core/combine.js';
import { NodeType } from '../js/asttype.js';

const parser = new HSParser();
const names = text => text.split('\n').filter(Boolean).map(line => line.slice(0, line.indexOf(':')));
const rewards = (...ids) => new Set(ids);
const get = ids => getSurvivalRules(ids, new Map());
const builtinLines = new Map(initialCreativeRules.split('\n').map(line => line.trim())
    .filter(line => line && !/^[{}]/.test(line)).map(line => [line.slice(0, line.indexOf(':')), line]));
let checks = 0;
function check(label, fn) { fn(); checks++; console.log('ok - ' + label); }

// The real loader's parsing/recording protocol, with a hard failure on replay
// errors. Keep rule.step so downstream v transformations see actual proofs.
function load(system, text, expandMCPT = false) {
    for (const line of text.split('\n').filter(Boolean)) {
        const colon = line.indexOf(':');
        const name = line.slice(0, colon);
        const rest = line.slice(colon + 1).trim();
        const axiom = rest.startsWith('ax:');
        const header = axiom ? rest.slice(3) : rest.slice(0, rest.indexOf(';'));
        const ast = parser.parse(header, 'rule');
        const assertions = ast.nodes.filter(node => node.type === NodeType.ASSERT).map(node => AtomSolver.fromAST(node));
        const conditions = ast.nodes.filter(node => node.type !== NodeType.ASSERT);
        const rule = new Deduction(new Set(), new AST(NodeType.ATOM_DNAME, name), assertions, conditions, conditions.pop());
        assert(!system.rules.has(name), 'must not replace ' + name);
        system.rules.set(name, rule);
        if (axiom) continue;
        try {
            system.fromCmd(assertions.map(a => parser.parse('hyp ' + AtomSolver.print(a), 'cmd')));
            system.fromCmd(rule.conditions.map(a => parser.parse('hyp ' + a, 'cmd')));
            for (const step of rest.slice(rest.indexOf(';') + 1).split(';').filter(s => s.trim())) {
                const cmd = parser.parse(step, 'cmd');
                if (expandMCPT && cmd.name === 'mcpt') {
                    // Independently replay generated completeness proofs in a
                    // separate context. Then retain the original command/IDs.
                    const context = system.saveContext();
                    system.loadContext(system.createEmptyContext());
                    try {
                        const proof = new MCPT(cmd.nodes[0]).check(true);
                        system.fromCmd(proof.map(s => parser.parse(s, 'cmd')));
                        assert(system.checkConclusionInPropList().conclusion.equal(cmd.nodes[0]));
                    } finally { system.loadContext(context); }
                }
                system.fromCmd([cmd]);
            }
            assert(system.checkConclusionInPropList().conclusion.equal(rule.conclusion), name + ' conclusion');
            rule.step = system.props.slice();
        } finally { system.clear(); }
    }
}

check('initial rules only', () => assert.deepEqual(names(get(rewards())), ['mp', 'a1', 'a2']));
const mappings = new Map([
    ['neg', ['a3']], ['1st', ['a4', 'a5', 'a6']], ['a7', ['a7']], ['a8', ['a8']],
    ['iff', ['d<>1', 'd<>2']], ['andor', ['d/\\', 'd\\/']], ['dE', ['d\\e']], ['dE!', ['d\\e!']],
    ['aExt', ['aext']], ['aSep', ['asep']], ['aPair', ['apair']], ['aUnion', ['aunion']],
    ['aPow', ['apow']], ['aRepl', ['arepl']], ['aInf', ['ainf']], ['aReg', ['areg']], ['aChoice', ['achoice']],
    ['d{}', ['d{}']], ['d{.}', ['d{.}']], ['d{..}', ['d{..}']], ['d()', ['dpair']], ['d()pr', ['dpr']],
    ['d<', ['d\\c']], ['dU', ['dunion', 'd\\u']], ['dI', ['d\\i']], ['dPow', ['dpow']],
    ['d{@|}', ['dsep']], ['d{|@}', ['drepl']], ['dsub', ['d\\\\']], ['dX', ['d\\x']], ['dw', ['d\\o']],
]);
for (const [id, expected] of mappings) check('direct reward ' + id, () => {
    assert.deepEqual(new Set(names(get(rewards(id))).filter(name => !['mp', 'a1', 'a2'].includes(name))), new Set(expected));
});
check('unknown, command and unported rewards add no rules', () => {
    assert.equal(get(rewards('missing', 'macro', 'hyp', 'mcpt', 'mnt', 'mifft', 'dZ', 'dRel', 'dOrder', 'dEquiv')), get(rewards()));
});
check('ZFC toolkit grants no axioms or unported aliases', () => {
    assert.equal(get(rewards('.zfc')), get(rewards()));
    assert.equal(get(rewards('.zfc', 'aExt')), get(rewards('aExt')));
});
check('propositional toolkit waits for earned leaves', () => {
    const early = names(get(rewards('.prop')));
    assert.deepEqual(early, ['mp', 'a1', 'a2', '.i', '.t', '.cs']);
    assert(!names(get(rewards('.prop', 'neg'))).includes('.<>'));
    const middle = names(get(rewards('.prop', 'neg', 'iff')));
    assert(middle.includes('.<>r<>'));
    assert(!middle.includes('.<>r\\/'));
    assert(!middle.includes('d\\/'));
});
check('first order toolkit pulls only earned proof support', () => {
    assert.deepEqual(names(get(rewards('.1st'))), ['mp', 'a1', 'a2']);
    const quant = names(get(rewards('.1st', '1st')));
    assert(quant.includes('.\\acn'));
    assert(!quant.includes('.=s'));
    assert(!quant.includes('a7'));
    assert(!quant.includes('a8'));
    const eq = names(get(rewards('.1st', 'a7', 'a8')));
    assert(eq.includes('.=s'));
    assert(!eq.includes('a4'));
});

const allRewards = rewards(...mappings.keys(), '.prop', '.1st', '.zfc');
const allText = get(allRewards);
check('all supported toolkits replay and MCPT support expands', () => {
    const macros = names(allText).filter(name => name.startsWith('.'));
    const creativeMacros = [...builtinLines].filter(([, line]) => !line.slice(line.indexOf(':') + 1).trim().startsWith('ax:')).map(([name]) => name);
    assert.equal(macros.length, 41);
    assert.deepEqual(new Set(macros), new Set(creativeMacros), 'no supported builtin proof may silently disappear');
    assert.equal(names(get(rewards('.prop', 'neg', 'iff', 'andor'))).filter(name => name.startsWith('.')).length, 37);
    assert(!names(allText).some(name => /^(an|dn)/.test(name)));
    const system = new HilbertSystem();
    load(system, allText, true);
    for (const [name, rule] of system.rules) if (name.startsWith('.')) assert(rule.step?.length, name);
    for (const line of allText.split('\n')) assert.equal(line, builtinLines.get(line.slice(0, line.indexOf(':'))));
});
check('reward order, duplicates and repeated calls are deterministic', () => {
    assert.equal(get(new Set([...allRewards].reverse())), allText);
    assert.equal(get(new Set([...allRewards, ...allRewards])), allText);
    const start = performance.now();
    for (let i = 0; i < 50; i++) assert.equal(get(allRewards), allText);
    assert(performance.now() - start < 5000, 'cached MCPT analysis should be inexpensive');
});
check('later rewards resolve pending macros; existing objects and context survive', () => {
    const system = new HilbertSystem();
    const earlyRewards = rewards('.prop', '.1st');
    load(system, getSurvivalRules(earlyRewards, system.rules));
    const before = new Map(system.rules);
    const marker = system.hyp(parser.parse('A', 'wff'));
    const props = system.props;
    const delta = getSurvivalRules(allRewards, system.rules);
    assert.equal(system.props, props);
    assert.equal(system.props[0], marker);
    for (const [name, rule] of before) assert.equal(system.rules.get(name), rule);
    assert(!names(delta).some(name => before.has(name)));
    system.clear();
    load(system, delta);
    assert.equal(getSurvivalRules(allRewards, system.rules), '');
    assert.deepEqual(new Set(system.rules.keys()), new Set(names(allText)));
});
check('player name collisions are preserved and cannot prove builtin dependants', () => {
    const system = new HilbertSystem();
    load(system, get(rewards()));
    const player = new Deduction(new Set(), new AST(NodeType.ATOM_DNAME, '.i'), [], [], parser.parse('A', 'wff'));
    system.rules.set('.i', player);
    const delta = getSurvivalRules(allRewards, system.rules);
    assert(!names(delta).includes('.i'));
    assert(!names(delta).includes('.<>i'));
    assert(!names(delta).includes('.a31'));
    assert.equal(system.rules.get('.i'), player);
});
check('existing unearned axioms cannot satisfy toolkit prerequisites', () => {
    const system = new HilbertSystem();
    load(system, get(rewards('neg', 'iff', 'andor', 'a7', 'a8', '1st')));
    const delta = names(getSurvivalRules(rewards('.prop', '.1st'), system.rules));
    assert(!delta.includes('.ne'));
    assert(!delta.includes('.=s'));
    assert(!delta.includes('.\\acn'));
});
check('each reward subset can load its closure in returned order', () => {
    for (let mask = 0; mask < 64; mask++) {
        const ids = ['.prop', '.1st', 'neg', 'iff', 'andor', '1st'].filter((_, i) => mask & (1 << i));
        const system = new HilbertSystem();
        load(system, get(new Set(ids)));
    }
});

// The map supplies stable old reward IDs; make sure direct and toolkit IDs
// remain actual map rewards rather than silently accepting typos.
check('mapped IDs are present in the current map', () => {
    const map = fs.readFileSync(new URL('../src/hy/map.ts', import.meta.url), 'utf8');
    for (const id of allRewards) assert(map.includes('[[' + id + ']]'), id);
});
console.log(`${checks} survival-rule checks passed`);
