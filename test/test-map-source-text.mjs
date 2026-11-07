import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MapDocument, readText} from '../tools/map-editor/source-text.mjs';
import {Polygon} from '../js/hy/tiling.js';
import {blockMap, initMap} from '../js/hy/maploader.js';
const source = await readFile(new URL('../src/hy/map.ts',import.meta.url),'utf8');
const runtimeLoader = await readFile(new URL('../js/hy/maploader.js',import.meta.url),'utf8');
const polygon = new Polygon(6,4), doc = new MapDocument(source,polygon);
let checks = 0;
const check = (name, run) => {run(); checks++; console.log('PASS '+name);};
check('untouched source is byte-for-byte identical',()=>assert.equal(doc.exportSource(),source));
check('every static map tile agrees with the real runtime loader',()=>{
    const log = console.log; console.log = ()=>{};
    try {initMap(new Polygon(6,4));} finally {console.log = log;}
    for (const [hash,row] of doc.tiles) {
        const actual = blockMap.get(hash); assert.ok(actual,hash); assert.equal(row.type,actual.type,hash);
        if (row.id) assert.deepEqual(row.values,typeof actual.text==='string'?{'':actual.text}:actual.text,`L${row.line}`);
    }
});
const row = doc.records.find(r=>r.active && r.values.zh && r.values.en && r.prefix.includes('[='));
const text = '换行\n[zh] [n] [p] [=getD:999] ` ${danger} \\ 保留\\[方括号] 😀';
check('editing round-trips literal syntax, Chinese, emoji and template delimiters',()=>{
    doc.set(row.id,{...row.values,zh:text});
    const next = new MapDocument(doc.exportSource(),new Polygon(6,4));
    assert.equal(next.byId.get(row.id).values.zh,text);
    assert.equal(next.byId.get(row.id).values.en,row.values.en);
    assert.equal(next.byId.get(row.id).prefix,row.prefix);
    assert.equal(next.byId.get(row.id).hash,row.hash);
});
check('all other source lines and metadata remain untouched',()=>{
    const before = source.split('\n'), after = doc.exportSource().split('\n'); assert.equal(after.length,before.length);
    for (let i=0;i<before.length;i++) if(i!==row.line-1) assert.equal(after[i],before[i],`L${i+1}`);
});
check('portable project restores and rejects a different source atomically',()=>{
    const next = new MapDocument(source,new Polygon(6,4)); next.restore(JSON.parse(JSON.stringify(doc.project())));
    assert.equal(next.exportSource(),doc.exportSource());
    const before = next.exportSource(); assert.throws(()=>next.restore({...doc.project(),source:source+' '})); assert.equal(next.exportSource(),before);
    const invalid = {...doc.project(),edits:[{id:row.id,values:{zh:'overwrite'}},{id:'unknown',values:{zh:'bad'}}]};
    assert.throws(()=>next.restore(invalid)); assert.equal(next.exportSource(),before);
});
check('plain text can become multilingual without changing the original meaning',()=>{
    const row = doc.records.find(r=>r.active && r.values['']); const plain = row.values[''];
    doc.set(row.id,{zh:plain,en:'New translation\nline 2'});
    const next = new MapDocument(doc.exportSource(),new Polygon(6,4));
    assert.deepEqual(next.byId.get(row.id).values,{zh:plain,en:'New translation\nline 2'});
});
check('relative branches, names and code blocks keep runtime positioning',()=>{
    const mini = 'export const mapData = `\n@root\n1@[[anchor]]one\n{\n:%,2@next\n}\n:%*,3@side\n:anchor,4@[zh]中文[en]English\n`;';
    const parsed = new MapDocument(mini,new Polygon(6,4));
    // The runtime keeps the block snapshot by reference; % mutates that same path.
    assert.equal(parsed.records[2].hash,'1,2'); assert.equal(parsed.records[3].hash,'1,2,3'); assert.equal(parsed.records[4].hash,'1,4');
});
check('escaped language markers never become metadata',()=>assert.deepEqual(readText('hello\\[en\\][n]world'),{'':'hello[en]\nworld'}));
check('wrong anchors, malformed blocks and executable templates fail closed',()=>{
    for (const text of ['export const mapData = `:missing,1@x`;','export const mapData = `\n{\n@x`;','export const mapData = `@${alert(1)}`;']) assert.throws(()=>new MapDocument(text,new Polygon(6,4)));
});
check('a trailing backslash preserves both languages in the model and real game loader',()=>{
    const next = new MapDocument(source,new Polygon(6,4));
    const values = {zh:'中文末尾\\',en:'English'}; next.set(row.id,values);
    const exported = next.exportSource(), parsed = new MapDocument(exported,new Polygon(6,4));
    assert.deepEqual(parsed.values(row.id),values);
    // Run the shipped loader on the exported map, with ordinal generation irrelevant here.
    const data = new Function(exported.replace('export const mapData =','return '))();
    const loader = new Function('mapData','genOrdTiles',runtimeLoader.replace(/^import .*$/gm,'').replace(/\bexport /g,'')+'\nreturn {initMap,blockMap};')(data,()=>{});
    const log = console.log; console.log=()=>{};
    try { loader.initMap(new Polygon(6,4)); } finally { console.log=log; }
    assert.deepEqual(loader.blockMap.get(row.hash).text,values);
});
check('unrepresentable slash-newline text stays in portable drafts and cannot silently export',()=>{
    const next = new MapDocument(source,new Polygon(6,4));
    for (const values of [{zh:'反斜杠\\\n下一行',en:'English'},{zh:'中文\\',en:'English\\'}]) {
        next.set(row.id,values); assert.throws(()=>next.exportSource(),/地图格式无法保留/);
        const restored = new MapDocument(source,new Polygon(6,4)); restored.restore(JSON.parse(JSON.stringify(next.project())));
        assert.deepEqual(restored.values(row.id),values);
    }
});
console.log(`${checks} map source parser checks passed`);
