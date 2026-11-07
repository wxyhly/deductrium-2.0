import assert from 'node:assert/strict';
import {test} from 'node:test';
import {HSLayer} from '../js/hs/main.js';
import {HilbertSystem} from '../js/hs/core/core.js';
import {HSParser} from '../js/hs/core/parser.js';
import {initialCreativeRules} from '../js/hs/core/initial.js';
import {createRulePreview} from '../js/hs/gui/rule-preview.js';
import {Assertion} from '../js/hs/core/assert.js';

const parse=(text,type='dname')=>new HSParser().parse(text,type);
function system(extraRules='') {
    const layer=Object.create(HSLayer.prototype);
    layer.hilbertSystem=new HilbertSystem();
    layer.ruleList=[];
    layer.ruleListView={refresh(){}};
    layer.addRules(initialCreativeRules+'\n'+extraRules);
    assert.ok([...layer.hilbertSystem.rules.values()].every(rule=>!rule.error));
    return layer.hilbertSystem;
}
const run=(hs,commands)=>hs.fromCmd(commands.split(';').map(text=>parse(text,'cmd')));

test('composed universal instantiation agrees with the explicit Peano proof',()=>{
    const direct=system(),explicit=system();
    run(explicit,'apn2;<a4 1 $x');
    run(direct,'d <a4(apn2) $x');
    assert.equal(direct.props.at(-1).ast.toString(),'$x∈ℕ→S($x)∈ℕ');
    assert.ok(direct.props.at(-1).ast.equal(explicit.props.at(-1).ast));
    const rule=direct.getD(parse('<a4(apn2)'));
    assert.ok(rule.step.length>0);
    assert.equal(rule.toString(),createRulePreview(direct)('<a4(apn2)'));
    const replay=system();
    replay.fromCmd(direct.genCmd(rule.step).map(text=>parse(text,'cmd')));
    const expected=rule.conclusion.clone();
    Assertion.reduceSbFn(rule.assertions,expected);
    assert.ok(replay.props.at(-1).ast.equal(expected));
});

test('empty-set instantiation checks normalized proofs and preserves caller context',()=>{
    const hs=system();
    run(hs,'hyp A;cond B;d a1 A B');
    const before=hs.saveContext(),commands=hs.genCmd(hs.props);
    const rule=hs.getD(parse('<a4(d{})'));
    assert.equal(rule.conclusion.hasSbFn(),true,'retain the symbolic schema and its parameters');
    assert.equal(rule.toString(),createRulePreview(hs)('<a4(d{})'));
    const after=hs.saveContext();
    for(const key of Object.keys(before)) assert.equal(after[key],before[key],key);
    assert.deepEqual(hs.genCmd(hs.props),commands);
    const fresh=system();run(fresh,'d <a4(d{}) y');
    assert.equal(fresh.props.at(-1).ast.toString(),'¬y∈{}');
    fresh.expand(fresh.props.at(-1));
    assert.equal(fresh.props.at(-1).ast.toString(),'¬y∈{}');
});

test('symbolic substitutions remain symbolic and captured instantiations are rejected',()=>{
    const hs=system('qSymbolic:ax:⊢∀x:$P;');
    const symbolic=hs.getD(parse('<a4(qSymbolic)'));
    assert.equal(symbolic.conclusion.hasSbFn(),true);
    assert.equal(symbolic.toString(),createRulePreview(hs)('<a4(qSymbolic)'));
    assert.throws(()=>run(hs,'d <a4(qSymbolic) (∀y:x=y) y'),error=>JSON.stringify(error).includes('sbFail'));
    assert.equal(hs.props.length,0);
});
