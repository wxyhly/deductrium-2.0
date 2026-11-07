import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Polygon} from '../js/hy/tiling.js';
import {blockMap,nameMap} from '../js/hy/maploader.js';
import {buildWorld,projectFromWorld} from '../tools/map-editor/publish.mjs';
import {EditorProject} from '../tools/map-editor/model.mjs';

const polygon=new Polygon(6,4);
function example() {
    const project=new EditorProject(polygon);
    project.setInfo('workshop','工坊');
    project.put('',{type:0,text:'入口',data:{}});
    project.put('1',{type:3,text:'奖励',data:{script:'give currency mod:workshop 5'}});
    project.setWorld({revision:1,mode:'standalone',spawn:{tileId:project.tiles.get('').id,rotation:2},
        banks:{},migrations:[],currency:{id:'mod:workshop',name:'工坊币'}});
    return project;
}
test('world publication preserves stable tile identity, settings, data and project immutability',()=>{
    const project=example(),before=project.toJSON();
    const world=buildWorld(project);
    assert.equal(world.id,'workshop');assert.equal(world.spawn.rotation,2);
    assert.equal(world.currency.id,'mod:workshop');
    assert.deepEqual(world.tiles.map(t=>t.id),[...project.tiles.values()].map(t=>t.id));
    assert.deepEqual(project.toJSON(),before);
    const imported=projectFromWorld(JSON.parse(JSON.stringify(world)),polygon);
    assert.deepEqual(buildWorld(imported),world);
    imported.put('1',{type:3,text:'新版奖励',data:{script:'give currency mod:workshop 5'}});
    assert.equal(imported.tiles.get('1').id,world.tiles[1].id);
});
test('publishing revalidates edited region and banks instead of accepting unchecked metadata',()=>{
    const project=example(),before=project.toJSON();
    assert.throws(()=>buildWorld(project,{...project.world,currency:{id:'mod:foreign',name:'Bad'}}),/currency/i);
    assert.throws(()=>buildWorld(project,{...project.world,banks:{central:{rules:[]}}}),/rules/i);
    assert.deepEqual(project.toJSON(),before);
    project._region={hash:'',edge:0,side:-1};
    assert.throws(()=>buildWorld(project),/半平面/);
    const bad=new EditorProject(polygon);bad.put('',{type:0,text:'start'});
    assert.throws(()=>buildWorld(bad),/世界设置/);
});
test('extension collision validation always restores the live editor map registry',()=>{
    const marker={type:0,text:'kept',data:{}};
    const oldTiles=new Map(blockMap),oldNames=new Map(nameMap),log=console.log;
    try {
        console.log=()=>{};
        blockMap.clear();nameMap.clear();blockMap.set('sentinel',marker);nameMap.set('sentinel','sentinel');
        const project=example();project.setWorld({...project.world,mode:'extension'});
        assert.throws(()=>buildWorld(project),/主世界重叠/);
        assert.equal(blockMap.size,1);assert.equal(blockMap.get('sentinel'),marker);
        assert.deepEqual([...nameMap],[['sentinel','sentinel']]);
    } finally {
        console.log=log;
        blockMap.clear();nameMap.clear();for(const entry of oldTiles)blockMap.set(...entry);for(const entry of oldNames)nameMap.set(...entry);
    }
});
