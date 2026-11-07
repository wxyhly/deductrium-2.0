import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {Polygon} from '../js/hy/tiling.js';
import {blockMap, nameMap, initMap} from '../js/hy/maploader.js';
import {installBuiltinMods} from '../js/hy/builtin-mods.js';
import {intuitionisticWorld} from '../js/hy/builtin/intuitionistic.js';
import {worldRuntimeTiles} from '../js/hy/world.js';

const polygon = new Polygon(6,4);
function load(include = false) {
    blockMap.clear(); nameMap.clear();
    const log = console.log;
    try {console.log = () => {};initMap(polygon,include);}
    finally {console.log = log;}
}
load();
const base = structuredClone(blockMap), baseNames = new Map(nameMap);
const additions = worldRuntimeTiles(intuitionisticWorld);

test('the built-in uses the exact published manifest, including stable script IDs', async () => {
    const published = JSON.parse(await readFile(new URL('../examples/intuitionistic-propositional.world.json',import.meta.url),'utf8'));
    assert.deepEqual(intuitionisticWorld,published);
    assert.equal(intuitionisticWorld.mode,'extension');
    assert.equal(additions.length,18);
});

test('main play adds IPC while all existing tiles and names remain identical', () => {
    load(true);
    assert.equal(blockMap.size,base.size+additions.length);
    for (const [hash,tile] of base) assert.deepEqual(blockMap.get(hash),tile,hash);
    for (const [id,hash] of baseNames) assert.equal(nameMap.get(id),hash,id);
    for (const [hash,tile] of additions) {
        assert.deepEqual(blockMap.get(hash),tile);
        assert.equal(nameMap.get(tile.name),hash);
    }
    const entry = intuitionisticWorld.tiles.find(tile=>tile.id===intuitionisticWorld.entry.tileId);
    const path = intuitionisticWorld.entry.mainHash.split(',').filter(Boolean).map(Number);
    polygon.getNeighborAndDir(path,intuitionisticWorld.entry.edge,false);
    assert.equal(path.join(','),entry.hash,'a real shared edge connects the main map and IPC');
});

test('map reload replaces only its own runtime copies without duplicates', () => {
    load(true);
    const [hash] = additions[0];
    blockMap.get(hash).text='runtime change';
    const log=console.log;
    try {console.log=()=>{};initMap(polygon,true);}
    finally {console.log=log;}
    assert.equal(blockMap.size,base.size+additions.length);
    assert.deepEqual(blockMap.get(hash),additions[0][1]);
    for (const [at,tile] of base) assert.deepEqual(blockMap.get(at),tile,at);
});

test('a collision aborts the entire addition before any map mutation', () => {
    const tiles=structuredClone(base),names=new Map(baseNames);
    const [hash]=additions.at(-1);
    tiles.set(hash,{type:0,name:'someone-else',text:'preserve me'});
    const snapshot=structuredClone(tiles),nameSnapshot=new Map(names);
    assert.throws(()=>installBuiltinMods(tiles,names),/overlap|intersects/i);
    assert.deepEqual(tiles,snapshot);assert.deepEqual(names,nameSnapshot);
    const clean=structuredClone(base),conflictingNames=new Map(baseNames);
    conflictingNames.set(additions[0][1].name,'');
    assert.throws(()=>installBuiltinMods(clean,conflictingNames),/name is occupied/);
    assert.deepEqual(clean,base);
});

test('the default map-loader path remains suitable for editor/publication validation', () => {
    load();
    assert.deepEqual(blockMap,base);assert.deepEqual(nameMap,baseNames);
    for (const [,tile] of additions) assert.equal(nameMap.has(tile.name),false);
});
