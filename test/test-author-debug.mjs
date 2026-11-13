// Run against the production JavaScript from the normal build.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import {authorDebugEnabled, authorDebugSaveMode, AuthorDebugSession, mountAuthorDebug} from '../js/hy/author-debug.js';
import {createMapScriptState,parseMapScript,planMapScript} from '../js/hy/script.js';
import {validateCurrencyBalances} from '../js/hy/economy.js';

const pack = (mode,data) => JSON.stringify({version:0,mode,timestamp:1,data});
const saveSource = fs.readFileSync(new URL('../js/saveload.js',import.meta.url),'utf8').replace('export class SaveLoad','class SaveLoad');
const gameSource = fs.readFileSync(new URL('../js/game.js',import.meta.url),'utf8');
const start=gameSource.indexOf('saveload = new SaveLoad('), end=gameSource.indexOf('\n    progressLayer =',start);
assert.ok(start>=0 && end>start,'use the real production Game SaveLoad initializer');
const initializer=gameSource.slice(start+'saveload = '.length,end).trim();

function environment() {
    const entries=new Map([['deductrium2_survival','REAL survival'],['deductrium2_creative','REAL creative'],
        ['deductrium2_world-review','REAL world'],...[0,1,2,3].map(i=>['deductrium2_slot'+i,'REAL slot '+i])]);
    const protectedEntries=new Map(entries), writes=[], timers=new Map(); let timer=0, failWrite=false, migrations=0;
    const context=vm.createContext({structuredClone,URLSearchParams,authorDebugSaveMode,Error,
        console:{log(){},error(){}},LZString:{compressToUTF16:value=>value,decompressFromUTF16:value=>value},
        localStorage:{getItem:key=>entries.get(key)??null,setItem(key,value){if(failWrite)throw Error('quota exceeded');writes.push(key);entries.set(key,String(value));}},
        setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),
        window:{location:{search:'?mod-world=review&author-debug'}},
        activeWorldSaveMode:'world-review',editorPreview:false,gameMode:'survival',activeWorld:undefined,
        enabledMods:[],captureModWorlds:()=>[],createMapScriptState,
    });
    vm.runInContext(saveSource+'\nthis.SaveLoad=SaveLoad;',context);
    const layer=value=>({data:{value},serialize(){return structuredClone(this.data);},deserialize(data){
        this.data=structuredClone(data);if(data.reject)throw Error('late TT rejection');
    }});
    const game={hsLayer:layer('HS original'),ttLayer:layer('TT original'),hyLayer:{...layer('HY original'),world:{currentOrd:[1]}},
        gotRewards:new Set(['reward']),destructedGates:new Set(['gate']),gotAchievements:new Set(['achievement']),
        unlockedInfos:new Set(['info']),deductrium:10,typeDeductrium:2,modBalances:{},deductriumConsumed:3,typeDeductriumConsumed:1,
        tilesParcour:4,maxOrd:[1],nextOrd:[1],ordBase:15,mapScript:createMapScriptState({keys:['initial'],done:['old'],eventDone:{door:['touch']}}),
        getCurrentLayer(){return this.layer??'P-layer';},switchLayer(value){this.layer=value;},
        currencyBalances(){return {reasoning:this.deductrium,type:this.typeDeductrium,...this.modBalances};},validateBalances:validateCurrencyBalances,
        modPosition:()=>({}),applyGotRewards(){},restoreMapScript(){},updateStats(){},
        progressLayer:{refreshAchievements(){},refreshSymbols(){},refreshKnowledge(){}},
    };
    context.gameForTest=game;
    const save=vm.runInContext(`(function(){return ${initializer};}).call(gameForTest)`,context);
    game.saveload=save;
    save.beforeLoad=data=>{migrations++;if(data.rejectMigration)throw Error('world migration rejected');return structuredClone(data);};
    const session=new AuthorDebugSession(save,()=>save.serialize(),3);
    return {save,game,session,entries,writes,timers,protectedEntries,context,migrations:()=>migrations,
        failWrite:value=>{failWrite=value;},assertProtected(){for(const [key,value] of protectedEntries)assert.equal(entries.get(key),value,key);}};
}

test('author tools require explicit author-debug plus world/preview; all slots remain isolated',()=>{
    for(const query of ['', '?author-debug','?mod-world=x','?map-editor-preview','?creative&author-debug']) {
        assert.equal(authorDebugEnabled(query),false);assert.equal(authorDebugSaveMode('survival',query),'survival');
        assert.equal(mountAuthorDebug({search:query,save:null,readState(){throw Error('must not read');}}),undefined);
    }
    assert.equal(authorDebugEnabled('?map-editor-preview&author-debug'),true);
    assert.equal(authorDebugEnabled('?author-debug&mod-world=x'),true);
    const e=environment();
    assert.equal(e.save.saveMode,'world-author-debug:world-review');
    for(let i=0;i<4;i++)assert.equal(e.save.slotKey(i),e.save.saveKey+':slot'+i);
    assert.throws(()=>new AuthorDebugSession({saveMode:'survival'},()=>({})),/独立存档/);
    assert.throws(()=>e.session.snapshotKey(''),/快照名称/);
    assert.equal(e.session.snapshotKey('../a:b'),e.save.saveKey+':author-snapshot:..%2Fa%3Ab');
});

test('snapshot restores production Game + HS/TT serializer state without real-slot writes or trace data',()=>{
    const e=environment(),before=structuredClone(e.save.serialize());
    const entry={kind:'condition',line:3,source:'require key k',result:false};
    e.session.trace(entry);entry.line=999;
    e.session.capture('all');
    assert.equal(e.session.traces()[0].line,3);
    e.game.hsLayer.data={value:'changed HS'};e.game.ttLayer.data={value:'changed TT'};e.game.hyLayer.data={value:'changed HY'};
    e.game.gotRewards.clear();e.game.gotAchievements.clear();e.game.deductrium=99;e.game.typeDeductrium=8;
    e.game.mapScript.keys.push('later');e.game.mapScript.eventDone.door.push('pass');e.game.maxOrd=[2];
    e.save.notifySave();assert.equal(e.timers.size,1);
    e.session.restore('all');
    assert.deepEqual(structuredClone(e.save.serialize()),before);assert.equal(e.migrations(),1);assert.equal(e.timers.size,0);
    assert.equal(e.session.traces().length,1);assert.equal(e.session.traces()[0].line,3);
    const stored=JSON.parse(e.entries.get(e.session.snapshotKey('all')));
    assert.equal(JSON.stringify(stored).includes('require key k'),false);assert.equal(Object.hasOwn(stored.data,'trace'),false);
    assert.ok(e.writes.every(key=>key.startsWith(e.save.saveKey)));e.assertProtected();
});

for(const failure of ['migration','late TT','quota','mode'])test(`snapshot ${failure} failure preserves live/disk state and autosave transaction`,()=>{
    const e=environment();e.save.save();const before=structuredClone(e.save.serialize()),raw=e.save.exportSave();
    let data={...before,hs:{value:'partially applied HS'},tt:failure==='late TT'?{reject:true}:before.tt};
    if(failure==='migration')data.rejectMigration=true;
    e.entries.set(e.session.snapshotKey(),pack(failure==='mode'?'survival':e.save.saveMode,data));
    e.save.notifySave();const pending=[...e.timers.keys()],writes=e.writes.length;
    if(failure==='quota')e.failWrite(true);
    assert.throws(()=>e.session.restore(),failure==='migration'?/migration rejected/:failure==='late TT'?/late TT rejection/:failure==='quota'?/quota exceeded/:/mode mismatch/);
    assert.deepEqual(structuredClone(e.save.serialize()),before);assert.equal(e.save.exportSave(),raw);
    assert.equal(e.writes.length,writes);assert.deepEqual([...e.timers.keys()],pending);e.assertProtected();
});

test('trace ring is detached and bounded; missing or malformed snapshots do not mutate Game',()=>{
    const e=environment(),before=structuredClone(e.save.serialize());
    for(let i=0;i<9;i++)e.session.trace({kind:'action',line:i});
    assert.deepEqual(e.session.traces().map(entry=>entry.line),[6,7,8]);
    e.session.traces()[0].line=100;assert.equal(e.session.traces()[0].line,6);
    assert.throws(()=>e.session.restore(),/快照不存在/);
    e.entries.set(e.session.snapshotKey(),'broken package');assert.throws(()=>e.session.restore());
    assert.deepEqual(structuredClone(e.save.serialize()),before);e.assertProtected();
    e.session.clear();assert.deepEqual(e.session.traces(),[]);
});

function traceHost(e,accepted=true) {
    const from=gameSource.indexOf('    prepareMapScript('),to=gameSource.indexOf('    runMapScript(',from),entries=[];
    assert.ok(from>=0 && to>from);
    const dependencies={parseMapScript,planMapScript,gameMode:'survival',activeContentWorlds:()=>[{content:{rules:[]}}],
        createMapScriptEngine:(hs,tt,content)=>{
            assert.deepEqual(structuredClone(content),[{rules:[]}]);
            return {validateState(){if(e.rejectEngine)throw Error('host validation rejected');},validate(){},query(){return true;}};
        },
        TileBlockType:{Gate:2,Reward:3},blockMap:new Map(),nameMap:new Map(),confirm:()=>accepted,cmp:()=>0,calcMaxReachOrd:()=>[],
    };
    const prototype=new Function(...Object.keys(dependencies),'return class TraceHost {\n'+gameSource.slice(from,to)+'\n}')(...Object.values(dependencies)).prototype;
    Object.assign(e.game,{authorDebug:{trace:entry=>entries.push(structuredClone(entry))},mapBanks:()=>({}),lastScriptError:'',
        restoreMapScriptOrdinal(){},addDeductrium(delta){this.deductrium+=delta;},checkEconAchievements(){},showToast(){},
    });
    e.game.hsLayer.hasMapAxiom=()=>true;
    return {entries,prepare:(script,event)=>prototype.prepareMapScript.call(e.game,{name:'door',type:0,data:{script}},'0',event),
        commit:prepared=>prototype.commitMapScript.call(e.game,prepared)};
}

test('production Game host records confirmation decisions and commits eventDone only after acceptance',()=>{
    const source='on pass\nconfirm "继续"\ngive key earned\nend';
    const no=environment(),rejected=traceHost(no,false),before=structuredClone(no.game.mapScript);
    assert.equal(rejected.prepare(source,'pass'),false);assert.deepEqual(no.game.mapScript,before);
    assert.equal(rejected.entries.at(-1).phase,'host');assert.equal(rejected.entries.at(-1).outcome,'blocked');
    const yes=environment(),accepted=traceHost(yes),prepared=accepted.prepare(source,'pass');
    assert.equal(yes.game.mapScript.keys.includes('earned'),false);assert.equal(accepted.entries.at(-1).outcome,'confirmation');
    accepted.commit(prepared);assert.equal(yes.game.mapScript.keys.includes('earned'),true);
    assert.ok(yes.game.mapScript.eventDone.door.includes('pass'));
    assert.equal(accepted.entries.at(-1).phase,'host');assert.equal(accepted.entries.at(-1).outcome,'pass');
    yes.save.cancelPendingSave();no.assertProtected();yes.assertProtected();
});

test('production Game host traces parse, validation and commit errors at their actual boundary',()=>{
    const e=environment(),host=traceHost(e);
    assert.equal(host.prepare('give key yes\nunknown-command'),false);
    assert.equal(host.entries.at(-1).line,2);assert.equal(host.entries.at(-1).source,'unknown-command');assert.equal(host.entries.at(-1).outcome,'exception');
    e.rejectEngine=true;assert.equal(host.prepare('give key staged'),false);
    assert.match(host.entries.at(-1).reason,/host validation rejected/);assert.equal(e.game.mapScript.keys.includes('staged'),false);
    e.rejectEngine=false;const prepared=host.prepare('message "host action"');
    e.game.showToast=()=>{throw Error('host action failed');};
    assert.throws(()=>host.commit(prepared),/host action failed/);
    assert.equal(host.entries.at(-1).outcome,'exception');assert.equal(host.entries.at(-1).phase,'host');
    e.assertProtected();
});

test('panel controls use real snapshot session and safe text nodes, and cleanup stops refresh',()=>{
    const e=environment(),elements=[];let refreshCallback,cleared=false;
    class Element {
        children=[];style={};events={};textContent='';attributes={};open=false;
        constructor(tag){this.tag=tag;elements.push(this);}
        append(...nodes){this.children.push(...nodes);}
        replaceChildren(...nodes){this.children=nodes;}
        addEventListener(name,fn){this.events[name]=fn;}
        setAttribute(name,value){this.attributes[name]=value;}
        remove(){this.removed=true;}
    }
    const doc={body:new Element('body'),createElement:tag=>new Element(tag)};
    const oldSet=globalThis.setInterval,oldClear=globalThis.clearInterval;
    globalThis.setInterval=fn=>{refreshCallback=fn;return 123;};globalThis.clearInterval=id=>{assert.equal(id,123);cleared=true;};
    try {
        const handle=mountAuthorDebug({save:e.save,readState:()=>({keys:e.game.mapScript.keys,money:e.game.deductrium}),
            search:'?map-editor-preview&author-debug',document:doc});
        assert.equal(doc.body.children[0].id,'author-debug-panel');
        const status=elements.find(element=>element.attributes.role==='status');assert.equal(status.attributes['aria-live'],'polite');
        handle.trace({kind:'condition',tileId:'<img src=x>',line:2,source:'<script>x</script>',result:false});handle.refresh();
        const row=elements.find(element=>element.tag==='li');assert.match(row.textContent,/<script>x<\/script>/);assert.equal(row.children.length,0);
        elements.find(element=>element.textContent==='捕获快照').events.click();e.game.deductrium=888;
        elements.find(element=>element.textContent==='恢复快照').events.click();assert.equal(e.game.deductrium,10);
        assert.match(elements.find(element=>element.tag==='pre').textContent,/"money": 10/);
        elements.find(element=>element.textContent==='清空轨迹').events.click();assert.deepEqual(handle.session.traces(),[]);
        handle.dispose();refreshCallback();assert.equal(cleared,true);assert.equal(doc.body.children[0].removed,true);e.assertProtected();
    } finally {globalThis.setInterval=oldSet;globalThis.clearInterval=oldClear;}
});
