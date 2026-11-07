import assert from 'node:assert/strict';
import {test} from 'node:test';
import {lobbyBank,redeemMapBankOffer,validateMapBankOffer} from '../js/hy/bank.js';
import {Polygon} from '../js/hy/tiling.js';
import {initMap,blockMap,nameMap} from '../js/hy/maploader.js';
import {parseWorld} from '../js/hy/world.js';

const offer={bank:'lobby',from:'reasoning',to:'type',amount:100};
test('equal principal both ways, extra one-percent fee, atomic insufficient funds and invalid offers',()=>{
    const balances={reasoning:202,type:0}, banks={lobby:lobbyBank};
    const forward=redeemMapBankOffer(offer,banks,balances);
    assert.deepEqual(forward.balances,{reasoning:101,type:100});
    assert.equal(forward.fee,1); assert.equal(forward.credit,100);
    const reverse=redeemMapBankOffer({...offer,from:'type',to:'reasoning',amount:50},banks,forward.balances);
    assert.deepEqual(reverse.balances,{reasoning:151,type:49.5});
    assert.deepEqual(balances,{reasoning:202,type:0});
    for(const bad of [{...offer,amount:0},{...offer,amount:NaN},{...offer,amount:1e12},{...offer,bank:'missing'}, {...offer,unknown:1}]) {
        assert.throws(()=>validateMapBankOffer(bad,banks));
    }
    assert.throws(()=>redeemMapBankOffer(offer,banks,{reasoning:100,type:0}),/Insufficient/);
    const micro={...offer,amount:0.000001}, tinyBank={rules:lobbyBank.rules.map(rule=>({...rule,minimum:0}))};
    assert.equal(validateMapBankOffer(micro,{lobby:tinyBank}).amount,micro.amount);
    assert.equal(redeemMapBankOffer(micro,{lobby:tinyBank},{reasoning:1,type:0}).credit,micro.amount);
    assert.throws(()=>redeemMapBankOffer(micro,{lobby:tinyBank},{reasoning:1e12,type:0}),/balance precision/);
});

test('all bank denominations have a road-only approach and do not overwrite the entrance',()=>{
    const polygon=new Polygon(6,4),log=console.log; console.log=()=>{};
    try{initMap(polygon);}finally{console.log=log;}
    assert.equal(blockMap.get(nameMap.get('bank-entrance')).type,0);
    const start=nameMap.get('bank-lobby'), seen=new Set([start]), pending=[start];
    for(let i=0;i<pending.length;i++) for(let edge=0;edge<6;edge++) {
        const [next]=polygon.getNeighborAndDir(pending[i].split(',').filter(Boolean).map(Number),edge,true);
        const hash=next.join(',');
        if(blockMap.get(hash)?.type===0&&!seen.has(hash)){seen.add(hash);pending.push(hash);}
    }
    const offers=[...blockMap].filter(([,tile])=>tile.data?.exchange);
    assert.equal(offers.length,12);
    for(const [hash,tile] of offers){
        assert.equal(tile.type,3); assert.equal(tile.data.exchange.bank,'builtin:lobby');
        assert(Array.from({length:6},(_,edge)=>polygon.getNeighborAndDir(hash.split(',').map(Number),edge,true)[0].join(',')).some(neighbor=>seen.has(neighbor)),tile.name);
    }
});

test('published worlds validate native offers before play and preserve registered mod currencies',()=>{
    const bank={rules:[{...lobbyBank.rules[0],to:'mod:shop'}]};
    const world={format:'deductrium-world-v1',id:'shop',title:'Shop',revision:1,mode:'standalone',
        currency:{id:'mod:shop',name:'Coins'},spawn:{tileId:'start',rotation:0},banks:{lobby:bank},migrations:[],
        tiles:[{id:'start',hash:'',type:0,text:'Bank'},{id:'offer',hash:'1',type:3,text:'Buy',data:{exchange:{...offer,to:'mod:shop'}}}]};
    assert.equal(parseWorld(world).tiles[1].data.exchange.amount,100);
    for(const change of [w=>w.tiles[1].type=0,w=>w.tiles[1].data.script='give money 1',w=>w.tiles[1].data.exchange.bank='missing']){
        const bad=structuredClone(world); change(bad); assert.throws(()=>parseWorld(bad));
    }
});
