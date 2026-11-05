import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ExecutionEngine,defineCommand} from '../js/hs/gui/cmdmgr.js';
import {AST} from '../js/hs/core/ast.js';
import {NodeType} from '../js/asttype.js';
import {HSError} from '../js/hs/core/error.js';

const atom=text=>new AST(NodeType.ATOM_ITEM,text);
const dependency=HSError.delFail({name:'ss1',id:0},[{name:'ss1',id:1}],null);
function fixture({executeError=false,asyncError=false}={}) {
    const engine=new ExecutionEngine();
    const ui={text:'',prompt:'',error:null,clears:0};
    engine.ui={
        setInputText:text=>{ui.text=text;},
        showPrompt:prompt=>{ui.prompt=prompt;},
        showError:error=>{ui.error=error;},
        clearError:()=>{ui.error=null;},
        setClearState:()=>{ui.prompt='';ui.error=null;ui.clears++;},
    };
    let stale=false;
    const req=(prompt,validate=()=>true)=>({prompt,default:'',parse:input=>validate(input)?{success:true,value:atom(input)}:{success:false,error:HSError.emptyValue}});
    defineCommand('del',args=>{
        if(!args.length)return req('targets');
        if(stale)throw dependency;
        if(args.length===1)return req('choose ss1: 1 step / 2 macro',s=>s==='1'||s==='2');
        if(!executeError&&args[1].name==='2')throw dependency;
        if(executeError||args.length===3)return null;
        return req('confirm y/n');
    },()=>{
        if(asyncError)return Promise.reject(dependency);
        if(executeError)throw dependency;
    });
    const run=text=>{ui.text=text;engine.run(text);};
    return {engine,ui,run,stale:()=>{stale=true;}};
}

test('rejected collected choice rewinds without rethrowing or discarding the command',()=>{
    const {engine,ui,run}=fixture();
    run('del ss1');run('2');
    assert.equal(ui.error,dependency);
    assert.deepEqual(engine.getCompletionContext(),{command:'del',argumentCount:2});
    assert.doesNotThrow(()=>engine.handleEsc());
    assert.equal(ui.error,null);assert.equal(ui.text,'2');assert.match(ui.prompt,/choose ss1/);
    assert.deepEqual(engine.getCompletionContext(),{command:'del',argumentCount:1});
    run('2');assert.equal(ui.error,dependency);engine.handleEsc();
    run('1');assert.equal(ui.prompt,'confirm y/n');assert.equal(ui.error,null);
    assert.equal(ui.clears,0);
    engine.handleEsc();assert.equal(ui.text,'1');
    engine.handleEsc();assert.equal(ui.text,'ss1');assert.equal(ui.prompt,'targets');
    engine.handleEsc();assert.equal(ui.text,'del ss1');assert.equal(engine.isExecuting(),false);
});

test('invalid uncollected input clears its error without rewinding valid arguments',()=>{
    const {engine,ui,run}=fixture();
    run('del ss1');run('invalid choice');
    assert.ok(ui.error);engine.handleEsc();
    assert.equal(ui.error,null);assert.equal(ui.text,'invalid choice');
    assert.equal(engine.getCompletionContext().argumentCount,1);
    run('1');assert.equal(ui.prompt,'confirm y/n');
});

for(const asyncError of [false,true])test(`${asyncError?'async':'sync'} execution failure rewinds the last parameter and preserves earlier arguments`,async()=>{
    const {engine,ui,run}=fixture({executeError:true,asyncError});
    run('del ss1');run('2');await Promise.resolve();
    assert.equal(ui.error,dependency);assert.doesNotThrow(()=>engine.handleEsc());
    assert.equal(ui.error,null);assert.equal(ui.text,'2');assert.match(ui.prompt,/choose/);
    assert.equal(engine.getCompletionContext().argumentCount,1);
});

test('stale earlier parameters backtrack to a usable prompt instead of trapping Esc',()=>{
    const {engine,ui,run,stale}=fixture();
    run('del ss1');run('2');stale();
    assert.doesNotThrow(()=>engine.handleEsc());
    assert.equal(ui.error,null);assert.equal(ui.text,'ss1');assert.equal(ui.prompt,'targets');
    assert.deepEqual(engine.getCompletionContext(),{command:'del',argumentCount:0});
    assert.equal(ui.clears,0);
});

test('idle command errors keep the full editable command and navigation escape callback',()=>{
    const {engine,ui,run,stale}=fixture();
    stale();run('del ss1');assert.ok(ui.error);assert.equal(ui.text,'del ss1');
    let escapes=0;engine.onIdleEscape=()=>{escapes++;return true;};
    engine.handleEsc();assert.equal(escapes,1);assert.equal(ui.error,null);
    assert.equal(ui.text,'del ss1');assert.equal(engine.isExecuting(),false);
});
