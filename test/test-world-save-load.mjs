// Run after the project's normal TypeScript build; exercises shipped JavaScript.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';

const source = fs.readFileSync(new URL('../js/saveload.js', import.meta.url), 'utf8')
    .replace('export class SaveLoad', 'class SaveLoad');
const progressSource = fs.readFileSync(new URL('../js/pg/main.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/^export /gm, '');
const pack = (mode, data) => JSON.stringify({version:0, mode, timestamp:1, data});

function environment(mode = 'world-review') {
    const entries = new Map(), timers = new Map(), writes = [], alerts = [];
    let nextId = 0, live = {progress:'original', nested:{value:7}}, failWrite = false;
    const context = vm.createContext({
        structuredClone, console:{log(){}, warn(){}, error(){}},
        LZString:{compressToUTF16:value=>value, decompressFromUTF16:value=>value},
        localStorage:{
            getItem:key=>entries.get(key) ?? null,
            setItem(key, value) {
                if (failWrite) throw Error('quota exceeded');
                writes.push([key, value]); entries.set(key, String(value));
            },
            removeItem:key=>entries.delete(key),
        },
        setTimeout(callback) {timers.set(++nextId, callback); return nextId;},
        clearTimeout:id=>timers.delete(id),
        window:{location:{search:'?mod-world', pathname:'/game', hash:'#here', href:'unchanged'}},
        alert:message=>alerts.push(message), confirm:()=>true,
    });
    context.window.setTimeout = context.setTimeout;
    const SaveLoad = vm.runInContext(source + '\nSaveLoad;', context);
    const save = new SaveLoad(mode, () => live, data => {
        // Simulate several game subsystems applying before a later one rejects.
        live.progress = data.progress;
        live.nested.value = data.nested?.value ?? 0;
        save.notifySave();
        if (data.reject) throw Error('late deserialize failure');
    });
    save.beforeLoad = data => {
        if (data.preflightReject) throw Error('migration rejected');
        return structuredClone(data);
    };
    entries.set(save.saveKey, pack(mode, structuredClone(live)));
    return {save, SaveLoad, context, entries, timers, writes, alerts,
        live:()=>structuredClone(live), setLive:value=>{live=value;}, failWrite:value=>{failWrite=value;},
        tick() {const pending=[...timers.values()]; timers.clear(); for (const callback of pending) callback();},
    };
}

for (const method of ['importSave', 'loadFromString']) {
    test(`${method}: rejected preflight preserves live, raw save and pending autosave`, () => {
        const e=environment(), before=e.live(), raw=e.save.exportSave(); let serialized=0;
        e.save.serialize=()=>{serialized++; return e.live();};
        e.save.notifySave(); const pending=[...e.timers.keys()];
        assert.equal(e.save[method](pack(e.save.saveMode, {preflightReject:true})), false);
        assert.equal(serialized,0); assert.equal(e.writes.length,0);
        assert.equal(e.save.exportSave(),raw); assert.deepEqual(e.live(),before);
        assert.deepEqual([...e.timers.keys()],pending); assert.equal(e.save.writesBlocked,false);
        e.tick(); assert.equal(e.writes.length,1);
    });
    test(`${method}: late deserialize failure restores live and never replaces original raw`, () => {
        const e=environment(), before=e.live(), raw=e.save.exportSave();
        e.save.notifySave(); const pending=[...e.timers.keys()];
        assert.equal(e.save[method](pack(e.save.saveMode,{progress:'partial',nested:{value:99},reject:true})),false);
        assert.deepEqual(e.live(),before); assert.equal(e.save.exportSave(),raw);
        assert.equal(e.writes.length,0); assert.deepEqual([...e.timers.keys()],pending);
        assert.equal(e.save.writesBlocked,false);
        e.tick(); assert.deepEqual(JSON.parse(e.save.exportSave()).data,before);
    });
    test(`${method}: storage failure rolls back live and keeps autosave pending`, () => {
        const e=environment(), raw=e.save.exportSave(), before=e.live();
        e.save.notifySave(); const pending=[...e.timers.keys()]; e.failWrite(true);
        assert.equal(e.save[method](pack(e.save.saveMode,{progress:'new',nested:{value:9}})),false);
        assert.deepEqual(e.live(),before); assert.equal(e.save.exportSave(),raw);
        assert.deepEqual([...e.timers.keys()],pending); assert.equal(e.save.writesBlocked,false);
        e.failWrite(false); e.tick(); assert.deepEqual(JSON.parse(e.save.exportSave()).data,before);
    });
    test(`${method}: migration runs once, commits after live application and cancels old timer`, () => {
        const e=environment(); let preflights=0;
        e.save.beforeLoad=data=>{preflights++; assert.equal(e.writes.length,0); return {...data,progress:'migrated'};};
        const raw=pack(e.save.saveMode,{progress:'old',nested:{value:11}});
        e.save.notifySave(); assert.equal(e.save[method](raw),true);
        assert.equal(preflights,1); assert.equal(e.live().progress,'migrated');
        assert.equal(e.save.exportSave(),raw); assert.equal(e.timers.size,0);
        assert.equal(e.save.lastLoadError,null); assert.equal(e.save.writesBlocked,false);
        e.save.notifySave(); e.tick(); assert.equal(JSON.parse(e.save.exportSave()).data.progress,'migrated');
    });
}

test('failed startup world load preserves exportable raw and blocks writes until recovery', () => {
    const e=environment(), before=e.live(); e.save.notifySave();
    const broken=pack(e.save.saveMode,{preflightReject:true}); e.entries.set(e.save.saveKey,broken);
    assert.equal(e.save.load(),false); assert.equal(e.save.writesBlocked,true);
    assert.deepEqual(e.live(),before); assert.equal(e.save.exportSave(),broken);
    assert.throws(()=>e.save.save(),/migration rejected/);
    assert.throws(()=>e.save.saveToKey(e.save.slotKey(0)),/migration rejected/);
    e.tick(); assert.equal(e.writes.length,0); assert.equal(e.timers.size,0);
    e.save.notifySave(); assert.equal(e.timers.size,0);
    assert.equal(e.save.importSave(pack(e.save.saveMode,{preflightReject:true})),false);
    assert.equal(e.save.writesBlocked,true); assert.equal(e.save.exportSave(),broken);
    assert.equal(e.save.importSave(pack(e.save.saveMode,{progress:'recovered',nested:{value:4}})),true);
    assert.equal(e.save.writesBlocked,false); assert.equal(e.save.lastLoadError,null);
    e.save.notifySave(); assert.equal(e.timers.size,1); e.tick();
    assert.equal(JSON.parse(e.save.exportSave()).data.progress,'recovered');
});

test('failed startup application restores live and successful load revives autosave', () => {
    const e=environment(), before=e.live();
    const broken=pack(e.save.saveMode,{progress:'partial',reject:true});
    e.entries.set(e.save.saveKey,broken); e.save.notifySave();
    assert.equal(e.save.load(),false); assert.deepEqual(e.live(),before);
    e.tick(); assert.equal(e.save.exportSave(),broken);
    e.entries.set(e.save.saveKey,pack(e.save.saveMode,{progress:'recovered',nested:{value:5}}));
    assert.equal(e.save.load(),true); e.save.notifySave(); assert.equal(e.timers.size,1);
    e.tick(); assert.equal(JSON.parse(e.save.exportSave()).data.progress,'recovered');
});

test('world mismatches never redirect, deserialize or modify either world or normal saves', () => {
    for (const current of ['world-a','survival']) for (const incoming of ['world-b','survival']) {
        if (current===incoming) continue;
        for (const method of ['load','importSave','loadFromString']) {
            const e=environment(current), raw=pack(incoming,{progress:'foreign'}), before=e.live();
            // World prefix must protect isolation even if no migration callback was installed.
            e.save.beforeLoad=undefined;
            if(method==='load') e.entries.set(e.save.saveKey,raw);
            const allEntries=[...e.entries]; e.save.notifySave();
            assert.equal(method==='load'?e.save.load():e.save[method](raw),false);
            assert.equal(e.context.window.location.href,'unchanged'); assert.deepEqual([...e.entries],allEntries);
            assert.deepEqual(e.live(),before); assert.equal(e.writes.length,0);
            assert.equal(e.save.writesBlocked,method==='load'&&current.startsWith('world-'));
        }
    }
});

test('world slot keys cannot collide with world main saves; normal slot keys stay unchanged', () => {
    const e=environment('world-foo'), other=new e.SaveLoad('world-foo_slot0',()=>({progress:'other'}),()=>{});
    e.entries.set(other.saveKey,pack(other.saveMode,{progress:'other'}));
    const original=e.entries.get(other.saveKey);
    assert.equal(e.save.slotKey(0),'deductrium2_world-foo:slot0');
    e.save.saveToKey(e.save.slotKey(0)); assert.equal(e.entries.get(other.saveKey),original);
    const normal=new e.SaveLoad('survival',()=>({}),()=>{});
    assert.equal(normal.slotKey(0),'deductrium2_slot0');
    assert.throws(()=>e.save.slotKey(4),/Invalid save slot/);
});

test('normal creative/survival redirection and strict import behavior are retained', () => {
    const e=environment('survival'); e.save.beforeLoad=undefined;
    e.context.window.location.search=''; e.save.notifySave();
    const incoming=pack('creative',{progress:'other'}), before=e.live();
    assert.equal(e.save.importSave(incoming),false); assert.equal(e.writes.length,0); assert.equal(e.timers.size,1);
    assert.equal(e.save.loadFromString(incoming),true);
    assert.equal(e.context.window.location.href,'/game?creative#here');
    assert.deepEqual(e.live(),before); assert.equal(e.timers.size,0);
    assert.deepEqual(JSON.parse(e.save.exportSave()).data,before);
    const startup=environment('creative'); startup.save.beforeLoad=undefined;
    const foreign=pack('survival',{progress:'foreign'}); startup.entries.set(startup.save.saveKey,foreign);
    assert.equal(startup.save.load(),true);
    assert.equal(startup.context.window.location.href,'/game#here');
    assert.equal(startup.save.exportSave(),foreign); assert.equal(startup.writes.length,0);
});

test('malformed world raw is retained and blocked without a migration callback', () => {
    const e=environment(); e.save.beforeLoad=undefined; e.entries.set(e.save.saveKey,'not json');
    assert.equal(e.save.load(),false); assert.equal(e.save.writesBlocked,true);
    assert.equal(e.save.exportSave(),'not json'); assert.throws(()=>e.save.save());
});

test('production Game deserialize rolls back earlier subsystems when a later Set rejects', () => {
    const e=environment();
    const code=fs.readFileSync(new URL('../js/game.js', import.meta.url),'utf8');
    const start=code.indexOf('saveload = new SaveLoad('), end=code.indexOf('\n    progressLayer =',start);
    assert.ok(start>=0 && end>start);
    const expression=code.slice(start+'saveload = '.length,end).trim();
    const layer=()=>({data:{value:'original'},serialize(){return this.data;},deserialize(data){this.data=data;}});
    const game={hsLayer:layer(),ttLayer:layer(),hyLayer:{...layer(),world:{currentOrd:[]}},
        gotRewards:new Set(['reward']),destructedGates:new Set(),gotAchievements:new Set(['achievement']),
        unlockedInfos:new Set(['info']),deductrium:10,deductriumConsumed:2,typeDeductriumConsumed:0,
        tilesParcour:3,maxOrd:[1],ordBase:15,mapScript:{done:[]},
        getCurrentLayer:()=> 'P-layer',currencyBalances:()=>({reasoning:10,type:0}),validateBalances:data=>data,
        applyGotRewards(){},restoreMapScript(){},updateStats(){},switchLayer(){},
        progressLayer:{refreshAchievements(){},refreshSymbols(){},refreshKnowledge(){}},
    };
    Object.assign(e.context,{activeWorldSaveMode:e.save.saveMode,editorPreview:false,gameMode:'survival',
        activeWorld:undefined,createMapScriptState:data=>structuredClone(data),gameForTest:game});
    const save=vm.runInContext(`(function(){return ${expression};}).call(gameForTest)`,e.context);
    const before=structuredClone(save.serialize()), raw=e.entries.get(save.saveKey);
    const invalid={...before,hs:{value:'partial HS'},hy:{value:'partial HY'},ac:{}};
    assert.equal(save.importSave(pack(save.saveMode,invalid)),false);
    assert.deepEqual(structuredClone(save.serialize()),before);
    assert.equal(save.exportSave(),raw); assert.equal(e.writes.length,0);
});

test('unrecoverable callback failure keeps original disk save and blocks further writes', () => {
    const e=environment(), raw=e.save.exportSave();
    e.save.deserialize=()=>{throw Error('callback unavailable');};
    assert.equal(e.save.importSave(pack(e.save.saveMode,{progress:'new'})),false);
    assert.equal(e.save.exportSave(),raw); assert.equal(e.save.writesBlocked,true);
    assert.match(e.save.lastLoadError.message,/could not be restored/);
    assert.throws(()=>e.save.save(),/could not be restored/);
});

function progress(e) {
    class Element {
        children=[]; events=new Map(); value='selected'; files=[];
        addEventListener(name,fn) {this.events.set(name,fn);}
        append(...children) {this.children.push(...children);}
        appendChild(child) {this.children.push(child);return child;}
    }
    const file=new Element(), slots=new Element();
    e.context.document={getElementById:id=>id==='pg-import-file'?file:id==='pg-slots'?slots:null,
        createElement:()=>new Element(),querySelectorAll:()=>[]};
    e.context.LangMgr={text:{importFailed:'import failed',slotEmpty:'empty',slotInfo:'{mode}',
        modeSurvival:'survival',saveShort:'save',loadShort:'load',exportShort:'export',delete:'delete'},
        formalize:{loadSlotConfirm:()=> 'load?'}};
    e.context.knowledgeBase={syms:{},mecanism:{}};
    e.context.FileReader=class {readAsText(value) {this.result=value;this.onload();}};
    const ProgressLayer=vm.runInContext(progressSource+'\nProgressLayer;',e.context);
    // Exercise production event handlers and slot rendering; other panels are unrelated.
    const layer=Object.create(ProgressLayer.prototype);
    layer.saveload=e.save; layer.mode='survival'; layer.refreshTimer=null;
    layer.slotKeys=[0,1,2,3].map(i=>e.save.slotKey(i));
    let refreshed=0; layer.scheduleRefresh=()=>{refreshed++;};
    layer.bindEvents(); layer.renderSlots();
    return {file,slots,refreshes:()=>refreshed};
}

test('Progress file import can recover blocked world without saving damaged live state first', () => {
    const e=environment(); e.entries.set(e.save.saveKey,pack(e.save.saveMode,{preflightReject:true}));
    assert.equal(e.save.load(),false); const p=progress(e);
    p.file.files=[pack(e.save.saveMode,{progress:'recovered',nested:{value:3}})];
    p.file.events.get('change')();
    assert.equal(p.refreshes(),1); assert.equal(e.save.writesBlocked,false);
    assert.equal(JSON.parse(e.save.exportSave()).data.progress,'recovered'); assert.equal(e.writes.length,1);
});

test('Progress rejected file or slot import preserves timer, raw/live state and does not refresh', () => {
    for (const kind of ['file','slot']) {
        const e=environment(), before=e.live(), raw=e.save.exportSave();
        const invalid=pack(e.save.saveMode,{progress:'partial',reject:true});
        e.entries.set(e.save.slotKey(0),invalid); e.save.notifySave();
        const pending=[...e.timers.keys()], p=progress(e);
        if (kind==='file') {p.file.files=[invalid];p.file.events.get('change')();}
        else p.slots.children[0].children[2].children[1].events.get('click')();
        assert.equal(p.refreshes(),0); assert.deepEqual(e.live(),before);
        assert.equal(e.save.exportSave(),raw); assert.equal(e.writes.length,0);
        assert.deepEqual([...e.timers.keys()],pending); assert.deepEqual(e.alerts,['import failed']);
    }
});
