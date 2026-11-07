import assert from 'node:assert/strict';
import {test} from 'node:test';
import {HilbertSystem} from '../js/hs/core/core.js';
import {HSParser} from '../js/hs/core/parser.js';
import {Deduction} from '../js/hs/core/deduction.js';
import {NodeType} from '../js/asttype.js';
import {Assertion} from '../js/hs/core/assert.js';
import {RuleCombiner} from '../js/hs/core/combine.js';
import {createRulePreview} from '../js/hs/gui/rule-preview.js';
import {completeCommand} from '../js/hs/gui/completion.js';

const parse=(text,type='dname')=>new HSParser().parse(text,type);
const add=(system,name,text)=>{
    const ast=parse(text,'rule');
    system.rules.set(name,new Deduction(new Set(),parse(name),[],ast.nodes.slice(0,-1),ast.nodes.at(-1)));
};
const fixture=()=>{
    const system=new HilbertSystem();
    for(const [name,text] of [
        ['mp','$1→$2,$1⊢$2'], ['a1','⊢$1→$2→$1'], ['a2','⊢($1→$2→$3)→($1→$2)→($1→$3)'],
        ['a4','⊢∀$x:$0→#sb($0,$x,$A)'], ['a5','⊢∀$x:($1→$2)→∀$x:$1→∀$x:$2'],
        ['sne','$1→$2⊢¬$2→¬$1'], ['r','$1→$2,$1⊢$2'],
        ['s<>','$1→$2,$2→$1⊢$1↔$2'], ['s<>s','$0↔$1⊢$1↔$0'],
    ]) add(system,name,text);
    system.fromCmd('a1 $ $;a1 $ $→$;a2 $ $→$ $;mp 3 2;mp 4 1'.split(';').map(text=>parse(text,'cmd')));
    system.m('sni');
    system.hyp(parse('A','wff'));
    system.c(parse('B','wff'));
    return system;
};
const source=system=>({commands:[],targets:[],folders:[],previewRule:createRulePreview(system),
    rules:[...system.rules].map(([name,rule])=>({name,hint:rule.toString(),hintType:'rule',expandable:!!rule.step?.length,
        derived:{conditions:rule.conditions.length,implication:rule.conclusion.type===NodeType.LOGIC&&rule.conclusion.name==='>'}}))});
const complete=(system,text,extra={})=>completeCommand(text,text.length,text.length,{...source(system),...extra});

function snapshot(root) {
    const saved=new Map();
    const visit=value=>{
        if(value===null||typeof value!=='object'||saved.has(value)) return;
        const entries=value instanceof Map?[...value]:value instanceof Set?[...value]:Object.entries(value);
        saved.set(value,entries);
        if(value instanceof Set) entries.forEach(visit);
        else for(const [key,item] of entries) {visit(key);visit(item);}
    };
    visit(root);
    return ()=>{
        for(const [value,entries] of saved) {
            const current=value instanceof Map?[...value]:value instanceof Set?[...value]:Object.entries(value);
            assert.equal(current.length,entries.length);
            current.forEach((entry,i)=>{
                if(value instanceof Set) assert.equal(entry,entries[i]);
                else {assert.equal(entry[0],entries[i][0]);assert.equal(entry[1],entries[i][1]);}
            });
        }
    };
}

test('real derived rule previews agree with default proof generation for every supported prefix and combinations',()=>{
    const system=fixture(),unchanged=snapshot(system);
    for(const name of ['<sni','vsni','ump','csni','esni','vc<sni','cvsni','e<sni','>mp',
        'mp(sni,#)','c(mp(sni,#))','<sne(mp)','r(sni,#)','s<>(>s<>s,>s<>s)']) {
        const expected=fixture().getD(parse(name)).toString();
        const original=parse(name),astUnchanged=snapshot(original);
        const generated=system.getD(original,false);
        assert.equal(generated.toString(),expected,name);
        assert.equal(generated.step,undefined,name+' does not construct a proof');
        assert.equal(createRulePreview(system)(name),expected,name+' isolated preview');
        astUnchanged();
    }
    unchanged();
});

test('completeCommand uses real core formulas for prefixed and complete application candidates',()=>{
    const system=fixture();
    for(const name of ['<sni','vsni','csni','esni','vc<sni','<sne(mp)','r(sni,#)','c(mp(sni,#))','s<>(>s<>s,>s<>s)']) {
        for(const prefix of ['', 'd ']) {
            const result=complete(system,prefix+name);
            const candidate=result.find(item=>item.label===name);
            assert.ok(candidate,prefix+name+' has a whole-name candidate');
            assert.equal(candidate.hint,fixture().getD(parse(name)).toString(),prefix+name);
            assert.equal(candidate.hintType,'rule');
            assert.equal((prefix+name).slice(0,candidate.start)+candidate.text+(prefix+name).slice(candidate.end),prefix+name);
        }
        assert.equal(complete(system,name,{pending:{command:'d',argumentCount:0}})[0].hint,fixture().getD(parse(name)).toString());
    }
    for(const text of ['d c(mp(sn','st(st(sne','d st(st(sne))']) {
        const cursor=text.indexOf('sne')>=0?text.indexOf('sne')+3:text.length;
        const candidate=completeCommand(text,cursor,cursor,source(system)).find(item=>item.label===(text.includes('sne')?'sne':'sni'));
        assert.ok(candidate,text);
        assert.equal(candidate.hint,system.rules.get(candidate.label).toString(),text+' previews its displayed name');
        assert.equal(text.slice(0,candidate.start)+candidate.text+text.slice(candidate.end),text.endsWith('sn')?text+'i':text);
    }
    assert.deepEqual(complete(system,'d sni(sni)'),[],'invalid complete application has no false formula');
});

test('formula-only resolution never switches contexts, applies deductions, replays macros or touches live graphs',()=>{
    const system=fixture(),unchanged=snapshot(system);
    const methods=['loadContext','hyp','d','clear','genDeductStep','replaySteps','fromCmd'];
    const saved=methods.map(name=>[name,HilbertSystem.prototype[name]]);
    for(const name of methods) HilbertSystem.prototype[name]=()=>{throw new Error('proof path entered: '+name);};
    try {
        for(const name of ['<sni','vsni','ump','csni','esni','vc<sni','>mp','mp(sni,#)','<sne(mp)'])
            assert.ok(createRulePreview(system)(name),name);
        assert.equal(createRulePreview(system)('<missing'),undefined);
        assert.equal(createRulePreview(system)('sni(sni)'),undefined);
        for(const invalid of ['mp(sni))','mp(sni)mp','mp(sni) $p','(sni))','sni '])
            assert.equal(createRulePreview(system)(invalid),undefined,invalid+' must parse the complete name');
        unchanged();
    } finally {for(const [name,method] of saved) HilbertSystem.prototype[name]=method;}
});

test('100 simple derived candidates all have previews with deterministic work limits',()=>{
    const system=fixture();
    for(let i=0;i<130;i++) add(system,`z${i}`,'⊢$p→$p');
    const unchanged=snapshot(system);
    const result=complete(system,'d cz');
    assert.equal(result.length,100);
    assert.ok(result.every(item=>item.hint==='⊢$0→$p→$p'&&item.hintType==='rule'));
    const preview=createRulePreview(system);
    assert.equal(preview('c'.repeat(129)+'sni'),undefined);
    assert.equal(preview('c'.repeat(25)+'sni'),undefined);
    assert.equal(preview('<sni'),'$⊢$');
    add(system,'huge','⊢'+'A→'.repeat(600)+'A');
    assert.equal(createRulePreview(system)('chuge'),undefined,'oversized base schemas stop before transformation');
    system.rules.delete('huge');
    unchanged();
});

test('preview batches refresh after renames, deletes and schema edits',()=>{
    const system=fixture();
    assert.equal(complete(system,'d esni')[0].hint,'⊢∃$a:($→$)');
    system.renameD('sni','fresh');
    assert.deepEqual(complete(system,'d esni'),[]);
    assert.equal(complete(system,'d efresh')[0].hint,'⊢∃$a:($→$)');
    add(system,'fresh','⊢A→B');
    assert.equal(complete(system,'d efresh')[0].hint,'⊢∃$a:(A→B)');
    system.rules.delete('fresh');
    assert.deepEqual(complete(system,'d efresh'),[]);
});

test('cyclic unification stops inside substitution before exponential tree allocation',()=>{
    const system=fixture();
    system.loadContext(system.createEmptyContext());
    system.fromCmd('hyp $1→$1;d sni $1→$1;mp 2 1'.split(';').map(text=>parse(text,'cmd')));
    system.m('zF');
    system.fromCmd([parse('a1 $1 $1','cmd')]);
    system.m('zG');
    const unchanged=snapshot(system);
    assert.equal(createRulePreview(system)('zF(zG)'),undefined);
    assert.throws(()=>system.getD(parse('zF(zG)'),false),e=>JSON.stringify(e).includes('combineCyclic'));
    let remaining=64;
    const combiner=new RuleCombiner(work=>{if((remaining-=work)<0) throw new Error('bounded substitution');});
    assert.throws(()=>combiner.applyMatchTable(parse('$0','wff'),{'$0':parse('$0→$0','wff')}),/bounded substitution/);
    unchanged();
});

test('substitution composition keeps preview schemas and checks normalized proofs',()=>{
    const system=fixture();
    add(system,'d{}','⊢∀x:¬x∈{}');
    const unchanged=snapshot(system);
    let rule;
    const reduce=Assertion.reduceSbFn;
    try {
        Assertion.reduceSbFn=()=>{throw Error('preview must not expand substitutions');};
        rule=system.getD(parse('<a4(d{})'),false);
        assert.equal(createRulePreview(system)('<a4(d{})'),rule.toString());
    } finally {Assertion.reduceSbFn=reduce;}
    const reduced=rule.conclusion.clone();
    Assertion.reduceSbFn(rule.assertions,reduced);
    assert.ok(!reduced.toString().includes('#sb('));
    assert.match(reduced.toString(),/^¬\$[a-zA-Z]+∈\{\}$/);
    const checked=system.getD(parse('<a4(d{})'));
    const checkedConclusion=checked.conclusion.clone();
    Assertion.reduceSbFn(checked.assertions,checkedConclusion);
    assert.ok(checkedConclusion.equal(reduced));
    assert.equal(checked.toString(),rule.toString());
    assert.ok(checked.step.length);
    unchanged();
});

test('getD defaults still generate proofs and match explicit true',()=>{
    for(const name of ['<sni','vsni','csni','vc<sni','>mp','mp(sni,#)','<sne(mp)']) {
        const system=fixture(),unchanged=snapshot(system);
        const a=system.getD(parse(name)),b=fixture().getD(parse(name),true);
        assert.ok(a.step?.length,name+' retains its proof');
        assert.deepEqual(system.genCmd(a.step),system.genCmd(b.step));
        assert.equal(a.toString(),b.toString());
        assert.deepEqual(a.replaceNames,b.replaceNames);
        unchanged();
    }
});
