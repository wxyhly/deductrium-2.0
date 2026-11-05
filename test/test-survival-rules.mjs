import assert from 'node:assert/strict';
import fs from 'node:fs';
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
const mathMappings = new Map([
    ['peano', ['apn1', 'apn2', 'apn3', 'apn4', 'apn5', ...Array.from({ length: 10 }, (_, i) => `d${i + 1}`)]],
    ['add-mul', ['d+1', 'd+2', 'd*1', 'd*2']], ['dSd0', ['d0', 'dS', 'dN']],
    ['d<=', ['d<=', 'd>=']], ['ddiv', ['d/|']], ['dRel', ['dRel']], ['dOrder', ['dOrder', 'dWOrder']],
    ['dEquiv', ['dEquiv']], ['dPrime', ['dPrime']], ['dfZ', ['dfZ']], ['dZ', ['dZ']],
    ['dZ+', ['dZ+']], ['dZ*', ['dZ*']], ['dZ<=', ['dZ<=']], ['dZn', ['dZ-2', 'dZ-1', 'dZ0', 'dZ1', 'dZ2']],
]);
for (const [id, targets] of mathMappings) mappings.set(id, targets.filter(name => builtinLines.has(name)));
for (const [id, expected] of mappings) check('direct reward ' + id, () => {
    assert.deepEqual(new Set(names(get(rewards(id))).filter(name => !['mp', 'a1', 'a2'].includes(name))), new Set(expected));
});
check('unknown, command and unported rewards add no rules', () => {
    assert.equal(get(rewards('missing', 'macro', 'hyp', 'mcpt', 'mnt', 'mifft', 'apn5-err-out', 'asep-err-out')), get(rewards()));
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
    const logicText = initialCreativeRules.split('{ [zh]皮亚诺算数')[0];
    const creativeMacros = names(logicText.split('\n').map(s => s.trim()).filter(s => s && !/^[{}]/.test(s) && !/:\s*ax:/.test(s)).join('\n'));
    assert.equal(macros.length, 41);
    assert.deepEqual(new Set(macros), new Set(creativeMacros), 'no supported builtin proof may silently disappear');
    assert.equal(names(get(rewards('.prop', 'neg', 'iff', 'andor'))).filter(name => name.startsWith('.')).length, 37);
    assert(!names(allText).some(name => /^(an|dn)/.test(name)));
    const system = new HilbertSystem();
    load(system, allText, true);
    for (const [name, rule] of system.rules) if (name.startsWith('.')) assert(rule.step?.length, name);
    for (const line of allText.split('\n')) assert.equal(line, builtinLines.get(line.slice(0, line.indexOf(':'))));
});

const arithmeticTargets = ['.=Se', '.=Si', '.=S', '.0+', '.S+', '.+@N', '.pred', '.+s', '.+a', '.+e', '.+=0',
    '.0*', '.*@N', '.S*', '.*s', '.*+d', '.+*d', '.*a', '.*=0', '.*n=0', '.*e'];
const numberRewards = rewards(...allRewards, 'kit+*', 'natop', 'dZop');
check('optional mathematical toolkits use checked proofs and earned leaves', () => {
    const text = get(numberRewards);
    const selected = names(text);
    const system = new HilbertSystem();
    load(system, text);
    for (const name of arithmeticTargets) if (builtinLines.has(name)) {
        assert(selected.includes(name), 'missing arithmetic proof ' + name);
        assert(system.rules.get(name).step?.length, name);
    }
    for (const name of ['.@Z', '.Zr', '.Xi', '.Pr1', '.Pr2']) if (builtinLines.has(name)) {
        assert(selected.includes(name), 'missing dynamic bridge ' + name);
        assert(system.rules.get(name).step?.length, name);
    }
    assert(!selected.includes('dZ-'), 'no map reward for integer subtraction');
    assert(!selected.some(name => /^(?:df?Q|ddkCut|dR(?!el)|an|dn)/.test(name)));
    assert.equal(get(new Set([...numberRewards].reverse())), text);
    const early = names(get(rewards('kit+*', 'natop', 'dZop')));
    assert(!early.some(name => /^(?:apn|d[0-9]|dZ|dfZ)/.test(name)));
    const loaded = new HilbertSystem();
    load(loaded, get(rewards('kit+*', 'natop', 'dZop')));
    load(loaded, getSurvivalRules(numberRewards, loaded.rules));
    assert.equal(getSurvivalRules(numberRewards, loaded.rules), '');
    for (const line of text.split('\n')) assert.equal(line, builtinLines.get(line.slice(0, line.indexOf(':'))));
});
check('unearned mathematical leaves cannot be borrowed from preloaded rules', () => {
    const system = new HilbertSystem();
    load(system, get(allRewards));
    const selected = names(getSurvivalRules(rewards('kit+*', 'dZop'), system.rules));
    assert(!selected.includes('.+s'));
    assert(!selected.includes('.@Z'));
    assert(!selected.includes('.Zr'));
});
if (builtinLines.has('apn1')) check('dynamic arithmetic works with only reward-selected rules', () => {
    const system = new HilbertSystem();
    load(system, get(numberRewards));
    const marker = system.hyp(parser.parse('A', 'wff'));
    const props = system.props;
    for (const [name, expected] of [
        ['d17', '17=S(16)'], ['dZ+17', '+17=Z((17,0))'],
        ['.2@N', '2∈ℕ'], ['.2+3', '2+3=5'], ['.2*3', '2*3=6'],
        ['.-2@Z', '-2∈ℤ'], ['.+2+-1', '+2+-1=+1'], ['.-1*+2', '-1*+2=-2'],
    ]) {
        const rule = system.getD(parser.parse(name, 'dname'));
        assert(!rule.error, name);
        assert(rule.conclusion.equal(parser.parse(expected, 'wff')), name);
        assert.equal(rule.conditions.length, 0, name);
        assert.equal(rule.assertions.length, 0, name);
        if (name.startsWith('.')) assert(rule.step?.length, name + ' must carry a proof');
        assert.equal(system.props, props, name + ' preserved proof context');
        assert.equal(system.props[0], marker);
    }
});
check('reward order, duplicates and repeated calls are deterministic', () => {
    assert.equal(get(new Set([...allRewards].reverse())), allText);
    assert.equal(get(new Set([...allRewards, ...allRewards])), allText);
    for (let i = 0; i < 50; i++) assert.equal(get(allRewards), allText);
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
check('later rewards preserve a twice-renamed builtin without reviving old names', () => {
    const system = new HilbertSystem();
    const ids = rewards('.prop');
    load(system, get(ids));
    system.renameD('.i', 'zI');
    const identity = system.rules.get('zI');
    ids.add('mkdir');
    assert.equal(getSurvivalRules(ids, system.rules, system.renamedSysRule), '');
    system.renameD('zI', 'zIdentity');
    assert.deepEqual([...system.renamedSysRule], [['.i', 'zIdentity']]);
    ids.add('iff');
    ids.add('neg');
    const delta = getSurvivalRules(ids, system.rules, system.renamedSysRule);
    assert(!names(delta).includes('.i'));
    assert(!names(delta).includes('zI'));
    assert(names(delta).includes('.<>i'));
    assert(names(delta).includes('.a31'));
    assert.equal(system.rules.get('zIdentity'), identity);
    load(system, delta);
    assert(system.rules.get('.<>i').step?.length);
    assert(!system.rules.has('.i'));
    assert(!system.rules.has('zI'));
    assert.equal(getSurvivalRules(ids, system.rules, system.renamedSysRule), '');
});
check('saved aliases replay before and after later rewards; a fresh map resets names', () => {
    const save = system => JSON.parse(JSON.stringify({
        aliases: [...system.renamedSysRule],
        rules: [...system.rules].map(([name, rule]) => name + ':' + (rule.step
            ? rule.toString() + ';' + system.genCmd(rule.step).filter(cmd => !cmd.startsWith('hyp ')).join(';')
            : 'ax:' + rule.toString())).join('\n'),
    }));
    const restore = saved => {
        const system = new HilbertSystem();
        system.renamedSysRule = new Map(saved.aliases);
        load(system, saved.rules);
        return system;
    };
    const early = new HilbertSystem();
    load(early, get(rewards('.prop')));
    early.renameD('.i', 'zI');
    early.renameD('zI', 'zIdentity');
    early.renameD('.t', 'zTrans');
    const saved = save(early);
    const restored = restore(saved);
    assert.equal(getSurvivalRules(rewards('.prop'), restored.rules, restored.renamedSysRule), '');
    const marker = restored.hyp(parser.parse('A', 'wff'));
    const props = restored.props;
    const before = new Map(restored.rules);
    const aliasesBefore = [...restored.renamedSysRule];
    const delta = getSurvivalRules(numberRewards, restored.rules, restored.renamedSysRule);
    assert.equal(restored.props, props);
    assert.equal(restored.props[0], marker);
    assert.deepEqual([...restored.renamedSysRule], aliasesBefore);
    for (const [name, rule] of before) assert.equal(restored.rules.get(name), rule);
    restored.clear();
    load(restored, delta);
    const advanced = restore(save(restored));
    assert(!advanced.rules.has('.i'));
    assert(!advanced.rules.has('zI'));
    assert(!advanced.rules.has('.t'));
    assert(advanced.rules.get('.<>i').step?.length);
    assert.equal(getSurvivalRules(numberRewards, advanced.rules, advanced.renamedSysRule), '');

    // Reconstruct rewards into an empty rule map with a separately restored
    // alias map, as well as starting a fresh game without any saved aliases.
    const rebuilt = new HilbertSystem();
    rebuilt.renamedSysRule = new Map(saved.aliases);
    load(rebuilt, getSurvivalRules(numberRewards, new Map(), rebuilt.renamedSysRule));
    assert.deepEqual(new Set(rebuilt.rules.keys()), new Set(advanced.rules.keys()));
    assert(!rebuilt.rules.has('.i'));
    assert.equal(getSurvivalRules(numberRewards, rebuilt.rules, rebuilt.renamedSysRule), '');
    assert.equal(getSurvivalRules(numberRewards, new Map(), new Map()), get(numberRewards));
});
check('aliases rewrite nested deduction ASTs while headers and formula arguments stay intact', () => {
    const aliases = new Map(names(get(numberRewards)).filter(name => name.startsWith('.'))
        .map((name, i) => [name, 'zBuiltin' + i]));
    const originals = new Map([...aliases].map(([name, alias]) => [alias, name]));
    const text = getSurvivalRules(numberRewards, new Map(), aliases);
    let rewritten = 0;
    const rename = ast => {
        if (ast.type === NodeType.ATOM_DNAME) {
            if (aliases.has(ast.name)) { ast.name = aliases.get(ast.name); rewritten++; }
        } else if (ast.type === NodeType.NODE_DNAME) ast.nodes.forEach(rename);
    };
    for (const line of text.split('\n')) {
        const colon = line.indexOf(':');
        const name = line.slice(0, colon);
        const original = builtinLines.get(originals.get(name) ?? name);
        const rest = line.slice(colon + 1);
        const originalRest = original.slice(original.indexOf(':') + 1);
        if (rest.trim().startsWith('ax:')) { assert.equal(rest, originalRest); continue; }
        const [header, ...steps] = rest.split(';');
        const [originalHeader, ...originalSteps] = originalRest.split(';');
        assert.equal(header, originalHeader, name + ' header');
        assert.equal(steps.length, originalSteps.length, name + ' command count');
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i], originalStep = originalSteps[i];
            if (!step.trim()) { assert.equal(step, originalStep); continue; }
            const expected = parser.parse(originalStep, 'cmd');
            const actual = parser.parse(step, 'cmd');
            if (expected.name === 'd') {
                const oldDname = expected.nodes[0], newDname = actual.nodes[0];
                assert.equal(step.slice(0, newDname.start), originalStep.slice(0, oldDname.start));
                assert.equal(step.slice(newDname.end), originalStep.slice(oldDname.end), name + ' formula arguments');
                rename(oldDname);
            } else assert.equal(step, originalStep, name + ' non-deduction command');
            assert(actual.equal(expected), name + ' deduction reference');
        }
    }
    assert(rewritten > 20, 'exercise simple, prefixed and composed references');
    const system = new HilbertSystem();
    system.renamedSysRule = new Map(aliases);
    load(system, text);
    for (const [name, alias] of aliases) {
        assert(!system.rules.has(name), name);
        assert(system.rules.get(alias).step?.length, alias);
    }
    assert.equal(getSurvivalRules(numberRewards, system.rules, aliases), '');
});
check('alias collisions and missing leaves fail closed without falling back to the old name', () => {
    const original = new HilbertSystem();
    load(original, get(rewards('.prop')));
    const identity = original.rules.get('.i');
    for (const collision of [
        new Deduction(new Set(), new AST(NodeType.ATOM_DNAME, 'zIdentity'), [], [], parser.parse('A', 'wff')),
        new Deduction(new Set(), new AST(NodeType.ATOM_DNAME, 'zIdentity'), [], [], parser.parse('$→$', 'wff')),
    ]) {
        const system = new HilbertSystem();
        load(system, get(rewards()));
        system.rules.set('.i', identity);
        system.rules.set('zIdentity', collision);
        const aliases = new Map([['.i', 'zIdentity']]);
        const text = getSurvivalRules(allRewards, system.rules, aliases);
        const selected = names(text);
        for (const name of ['.i', 'zIdentity', '.a31', '.<>i']) assert(!selected.includes(name), name);
        assert.equal(system.rules.get('zIdentity'), collision);
        assert.equal(system.rules.get('.i'), identity);
        load(system, text);
    }
    const system = new HilbertSystem();
    load(system, get(allRewards));
    system.renameD('.i', 'zIdentity');
    system.renameD('.ne', 'zNeg');
    const text = getSurvivalRules(rewards('.prop'), new Map([...system.rules]
        .filter(([name]) => ['mp', 'a1', 'a2', 'a3', 'zIdentity', 'zNeg'].includes(name))), system.renamedSysRule);
    for (const name of ['.i', '.ne', 'zNeg', '.ni', '.a31']) assert(!names(text).includes(name), name);
});
check('duplicate or malformed saved aliases cannot create ambiguous or invalid proofs', () => {
    for (const aliases of [
        new Map([['.i', 'zShared'], ['.t', 'zShared']]),
        new Map([['.i', '.t']]),
        new Map([['.i', '']]),
        new Map([['.i', '<a1']]),
        new Map([['.i', '#']]),
    ]) {
        const text = getSurvivalRules(allRewards, new Map(), aliases);
        const selected = names(text);
        for (const name of ['.i', 'zShared', '.a31', '.<>i']) assert(!selected.includes(name), name);
        const system = new HilbertSystem();
        load(system, text);
    }
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
    for (const id of [...numberRewards, '.filter']) assert(map.includes('[[' + id + ']]'), id);
});
console.log(`${checks} survival-rule checks passed`);
