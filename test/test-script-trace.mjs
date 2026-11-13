// Run against the compiled production modules supplied by the parent build.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMapScriptState, planMapScript} from '../js/hy/script.js';

const environment = extra => ({money:20, rewards:new Set(), hasTile:()=>true, hasAxiom:()=>true, ...extra});
const run = (source, extra = {}, initial = createMapScriptState()) => {
    const entries=[];
    const plan=planMapScript(source, initial, environment({trace:entry=>entries.push(entry), ...extra}));
    return {plan, entries};
};

test('blocked trace reports the actual failed requirement and rolls back staged actions', () => {
    const initial=createMapScriptState(), before=structuredClone(initial);
    const {plan,entries}=run('give key staged\ntake money 3\nrequire flag locked\ngive key unreachable', {}, initial);
    assert.equal(plan.status,'blocked'); assert.deepEqual(plan.state,before); assert.equal(plan.money,20);
    assert.deepEqual(initial,before);
    assert.ok(entries.some(e=>e.kind==='condition' && e.line===3 && e.result===false));
    assert.ok(entries.some(e=>e.kind==='action' && e.line===1));
    assert.ok(entries.some(e=>e.kind==='not-run' && e.line===4));
    assert.equal(entries.at(-1).outcome,'blocked'); assert.equal(entries.at(-1).line,3);
});

test('short circuits and unselected handlers/branches are not queried and marked not-run', () => {
    let queried=0;
    const {entries,plan}=run(`on touch\nif not-key present or proof "P"\ngive key yes\nelif proof "Q"\ngive key no\nelse\ngive key other\nend\nend\non pass\nrequire proof "R"\nend`, {
        event:'touch', selfId:'door', engine:{validate(){},query(){queried++;return false;}},
    });
    assert.equal(queried,0); assert.deepEqual(plan.state.keys,['yes']);
    for(const line of [4,5,7,10,11]) assert.ok(entries.some(e=>e.kind==='not-run' && e.line===line),String(line));
    assert.ok(entries.some(e=>e.kind==='not-run' && e.reason==='short-circuit'));
    assert.ok(entries.every(e=>e.tileId==='door' && e.event==='touch'));
});

test('observer exceptions and mutation cannot change transactions or query results', () => {
    const source='give key x\nif proof "P"\ntake money 2\nend';
    let queries=0;
    const env=environment({engine:{validate(){}, query(){queries++;return true;}}});
    const plain=planMapScript(source,createMapScriptState(),env);
    const traced=planMapScript(source,createMapScriptState(),{...env,trace(entry){entry.kind='corrupted';throw Error('observer');}});
    assert.deepEqual(traced,plain); assert.equal(queries,2);
    assert.equal(Object.hasOwn(traced,'trace'),false); assert.equal(JSON.stringify(traced.state).includes('trace'),false);
});

test('trace is bounded and reserves the final outcome, including exceptions', () => {
    const {entries}=run(Array(50).fill('give money 1').join('\n'),{traceLimit:5});
    assert.equal(entries.length,5); assert.equal(entries.at(-1).outcome,'pass');
    assert.equal(entries.at(-1).truncated,true);
    const errors=[];
    assert.throws(()=>planMapScript('give key staged\ntake money 99',createMapScriptState(),environment({trace:e=>errors.push(e)})),/Insufficient money/);
    assert.equal(errors.at(-1).outcome,'exception'); assert.equal(errors.at(-1).line,2);
    assert.match(errors.at(-1).reason,/Insufficient money/);
});

test('confirmation, checksOnly/once and preflight failures retain their semantics', () => {
    assert.equal(run('confirm "继续？"\ngive key k').entries.at(-1).outcome,'confirmation');
    const {entries,plan}=run('event once\ngive key new\nrequire key old',{completed:true},createMapScriptState({keys:['old']}));
    assert.deepEqual(plan.state.keys,['old']);
    assert.ok(entries.some(e=>e.kind==='not-run' && e.line===2 && e.reason==='checks-only'));
    const trace=[];
    assert.throws(()=>planMapScript('if key absent\nopen gate missing\nend',createMapScriptState(),environment({hasTile:()=>false,trace:e=>trace.push(e)})),/Unknown tile/);
    assert.equal(trace.at(-1).outcome,'exception'); assert.equal(trace.at(-1).line,2);
    assert.equal(trace.some(e=>e.kind==='action'),false);
});

test('trace physical lines support CR-only sources and failed reasons identify the actual predicate',()=>{
    const {entries}=run('give key staged\rrequire flag missing\rgive key no');
    const condition=entries.find(e=>e.kind==='condition');
    assert.equal(condition.line,2);assert.equal(condition.source,'require flag missing');
    assert.match(condition.reason,/flag missing/);assert.equal(entries.at(-1).source,condition.source);
});

test('invalid debug option getters are isolated, and budgets of one still deliver terminal errors',()=>{
    const env=environment();Object.defineProperty(env,'trace',{get(){throw Error('broken observer getter');}});
    assert.equal(planMapScript('give key yes',createMapScriptState(),env).state.keys[0],'yes');
    const entries=[];
    assert.throws(()=>planMapScript('give key staged\ntake money 99',createMapScriptState(),environment({trace:e=>entries.push(e),traceLimit:1})),/Insufficient money/);
    assert.equal(entries.length,1);assert.equal(entries[0].outcome,'exception');assert.equal(entries[0].truncated,true);
});
