import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {Polygon} from '../js/hy/tiling.js';
import {blockMap,nameMap,initMap} from '../js/hy/maploader.js';
import {worldRuntimeTiles} from '../js/hy/world.js';
import {MOD_LIBRARY_KEY,readModLibrary,saveModLibrary,importMod,setModEnabled,installMods} from '../js/hy/mods.js';

const manifest=JSON.parse(await readFile(new URL('../examples/intuitionistic-propositional.world.json',import.meta.url),'utf8'));
const storage=()=>{const data=new Map();return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
const silent=fn=>{const log=console.log;try{console.log=()=>{};return fn();}finally{console.log=log;}};
silent(()=>initMap(new Polygon(6,4)));
const base=structuredClone(blockMap),baseNames=new Map(nameMap);
const additions=worldRuntimeTiles(manifest);

test('normal play and editor contain no source-mounted mods, even on reload',()=>{
    for(const enabled of [true,false,true]){
        silent(()=>initMap(new Polygon(6,4),enabled));
        assert.equal(blockMap.size,2120);assert.deepEqual(blockMap,base);assert.deepEqual(nameMap,baseNames);
    }
});
test('upload is detached, inactive, persistent and idempotent',()=>{
    const input=structuredClone(manifest),entries=importMod([],input),store=storage();
    input.title='changed';assert.equal(entries[0].world.title,manifest.title);
    assert.equal(entries[0].enabled,false);assert.deepEqual(importMod(entries,manifest),entries);
    saveModLibrary(entries,store);assert.deepEqual(readModLibrary(store),entries);
    const mounted=structuredClone(base);installMods(entries,mounted,new Map(baseNames));assert.deepEqual(mounted,base);
});
test('enable mounts exactly the portable world and preserves every official tile',()=>{
    const entries=setModEnabled(importMod([],manifest),manifest.id,true),tiles=structuredClone(base),names=new Map(baseNames);
    installMods(entries,tiles,names);
    assert.equal(tiles.size,base.size+18);
    for(const [hash,tile] of base)assert.deepEqual(tiles.get(hash),tile);
    for(const [hash,tile] of additions){assert.deepEqual(tiles.get(hash),tile);assert.equal(names.get(tile.name),hash);}
    const disabled=setModEnabled(entries,manifest.id,false),fresh=structuredClone(base);
    installMods(disabled,fresh,new Map(baseNames));assert.deepEqual(fresh,base);
    assert.equal(entries[0].enabled,true,'toggle leaves its input untouched');
});
test('multiple enabled mods are validated atomically for tile and stable-name conflicts',()=>{
    const first={world:manifest,enabled:true},second={world:{...manifest,id:'another'},enabled:true};
    const tiles=structuredClone(base),names=new Map(baseNames);
    assert.throws(()=>installMods([first,second],tiles,names),/overlaps another/);
    assert.deepEqual(tiles,base);assert.deepEqual(names,baseNames);
    names.set(additions.at(-1)[1].name,'');const before=new Map(names);
    assert.throws(()=>installMods([first],tiles,names),/name is occupied/);
    assert.deepEqual(tiles,base);assert.deepEqual(names,before);
});

test('content rule names and symbols conflict at enable time, without changing the installed library',()=>{
    const content={rules:[{id:'qShared',statement:'⊢$1→$1',proof:'d .i $1'}]};
    const a={...manifest,id:'content-a',content},b={...manifest,id:'content-b',content};
    const installed=importMod(importMod([],a),b),enabled=setModEnabled(installed,a.id,true),before=structuredClone(enabled);
    assert.throws(()=>setModEnabled(enabled,b.id,true),/content rule|内容规则/);
    assert.deepEqual(enabled,before);
    assert.equal(installed.every(entry=>!entry.enabled),true,'inactive worlds may independently reuse names');
    const definition=(id)=>({definitions:[{id,kind:'function',symbol:'sharedFn',parameters:['$x'],body:'$x'}]});
    const defs=importMod(importMod([],{...a,content:definition('qA')}),{...b,content:definition('qB')});
    assert.throws(()=>setModEnabled(setModEnabled(defs,a.id,true),b.id,true),/content symbol|内容符号/);
});
test('invalid files, duplicate IDs and unsupported library versions never replace the stored data',()=>{
    const store=storage(),entries=importMod([],manifest);saveModLibrary(entries,store);
    const original=store.getItem(MOD_LIBRARY_KEY);
    for(const bad of [{...manifest,format:'javascript'},{...manifest,tiles:[]},null])assert.throws(()=>importMod(entries,bad));
    assert.throws(()=>saveModLibrary([...entries,...entries],store),/Duplicate/);
    assert.equal(store.getItem(MOD_LIBRARY_KEY),original);
    store.setItem(MOD_LIBRARY_KEY,JSON.stringify({version:99,mods:[]}));assert.throws(()=>readModLibrary(store),/format/);
});
test('quota failures preserve the previous library and validation finishes before the write',()=>{
    const entries=importMod([],manifest),store=storage();saveModLibrary(entries,store);const before=store.getItem(MOD_LIBRARY_KEY);
    assert.throws(()=>saveModLibrary(setModEnabled(entries,manifest.id,true),{setItem(){throw Error('QuotaExceededError');}}),/Quota/);
    assert.equal(store.getItem(MOD_LIBRARY_KEY),before);
});
test('standalone worlds install inactive and cannot be mounted as extensions',()=>{
    const world={...manifest,mode:'standalone'};delete world.entry;
    const entries=importMod([],world);assert.equal(entries[0].enabled,false);
    assert.throws(()=>setModEnabled(entries,world.id,true),/separately/);
    assert.throws(()=>installMods([{world,enabled:true}],new Map(base),new Map(baseNames)),/separately/);
});
test('updates require disabling and a higher compatible revision',()=>{
    const entries=importMod([],manifest),next={...manifest,revision:manifest.revision+1,title:'Updated'};
    assert.throws(()=>importMod(setModEnabled(entries,manifest.id,true),next),/Disable/);
    assert.throws(()=>importMod(entries,{...next,revision:manifest.revision}),/higher revision/);
    const updated=importMod(entries,next);assert.equal(updated[0].world.title,'Updated');assert.equal(updated[0].enabled,false);
    assert.equal(entries[0].world.title,manifest.title);
});
