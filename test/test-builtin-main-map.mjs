// Run after the normal TypeScript build: node --test test/test-builtin-main-map.mjs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {parseMapData} from '../js/hy/map-source.js';
import {Polygon} from '../js/hy/tiling.js';
import {genOrdTiles} from '../js/hy/ordinal.js';
import {HWorld} from '../js/hy/hworld.js';
import {blockMap, nameMap, initMap} from '../js/hy/maploader.js';
import {mainMapModData} from '../js/hy/builtin/main-map.js';
import {typeMapData} from '../js/hy/type-map.js';
import {assertTypeMapAnchors, buildBuiltinMap, generateBuiltinMaps} from '../tools/build-builtin-map.mjs';

const source = await readFile(new URL('../src/hy/map.ts', import.meta.url), 'utf8');
const mapData = new Function(source.replace('export const mapData =', 'const mapData =') + '\nreturn mapData;')();
const sourceHash = '0b65a1bca2568f246778b978b05eb77ef76686a7675aa388ea1899c7eccba110';
// Captured independently from the real pre-migration initMap v8 snapshot.
// This expected value must not be regenerated from the new parser or data modules.
const nativeGoldenHash = 'bcb493dcd22b53775e420a47a6221fd9fc3ab02b63760b6bb2dd5cee35346cb5';
const polygon = () => new Polygon(6, 4);
const snapshot = (tiles, names) => ({tiles: [...tiles], names: [...names]});
const goldenHash = (tiles, names) => createHash('sha256').update(JSON.stringify({
    tiles: [...tiles].map(([hash, tile]) => [hash, Object.entries(tile)]), names: [...names],
})).digest('hex');
function fullSourceMap() {
    const p = polygon(), tiles = new Map(), names = new Map();
    genOrdTiles(tiles, names, p, [1, 2, 1], [1], 5);
    parseMapData(mapData, p, tiles, names);
    return {tiles, names};
}

test('original authoring source and independently captured native golden remain unchanged', () => {
    assert.equal(createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex'), sourceHash);
    const {tiles, names} = fullSourceMap();
    assert.equal(tiles.size, 2120);
    assert.equal(names.size, 515);
    assert.equal(goldenHash(tiles, names), nativeGoldenHash);
    initMap(polygon());
    assert.equal(goldenHash(blockMap, nameMap), nativeGoldenHash);
});

test('absolute main and TT datasets preserve all final static tiles, aliases, orders and property shapes', () => {
    const {main, type} = buildBuiltinMap(source);
    assert.deepEqual(buildBuiltinMap(source.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')), {main, type});
    assert.deepEqual(mainMapModData, main);
    assert.deepEqual(typeMapData, type);
    assert.deepEqual([main.tiles.length, main.names.length, type.tiles.length, type.names.length], [1012, 193, 941, 155]);
    const mergedTiles = [...mainMapModData.tiles, ...typeMapData.tiles].sort((a, b) => a[0] - b[0]);
    const mergedNames = [...mainMapModData.names, ...typeMapData.names].sort((a, b) => a[0] - b[0]);
    const parsed = parseMapData(mapData, polygon());
    assert.deepEqual(mergedTiles.map(([, hash, tile]) => [hash, tile]), [...parsed.tiles]);
    assert.deepEqual(mergedNames.map(([, name, hash]) => [name, hash]), [...parsed.names]);
    assert.deepEqual(mergedTiles.map(([order]) => order), [...parsed.tiles.keys()].map((_, i) => i));
    assert.deepEqual(mergedNames.map(([order]) => order), [...parsed.names.keys()].map((_, i) => i));
    assert.ok(mergedTiles.some(([, , tile]) => Object.hasOwn(tile, 'name') && tile.name === undefined));
    assert.ok(mergedTiles.some(([, , tile]) => !Object.hasOwn(tile, 'name') && !Object.hasOwn(tile, 'data')));
    const mainNames = new Set(main.names.map(([, name]) => name));
    const typeNames = new Set(type.names.map(([, name]) => name));
    for (const name of ['type', 'ttrue', 'ttord']) assert.ok(typeNames.has(name), name);
    for (const name of ['port-iff', 'bank-lobby', 'aInf', 'base3']) assert.ok(mainNames.has(name), name);
});

test('new runtime equals ordinal seed followed by the full source parser in exact Map order', () => {
    const expected = fullSourceMap();
    initMap(polygon());
    assert.deepEqual(snapshot(blockMap, nameMap), snapshot(expected.tiles, expected.names));
});

test('all six neighboring directions and the five main-to-TT connections remain identical', () => {
    const expected = fullSourceMap(), p = polygon();
    initMap(p);
    const mainHashes = new Set(mainMapModData.tiles.map(([, hash]) => hash));
    const typeHashes = new Set(typeMapData.tiles.map(([, hash]) => hash));
    const connections = new Set();
    for (const [hash] of expected.tiles) {
        for (let edge = 0; edge < 6; edge++) {
            const path = hash ? hash.split(',').map(Number) : [];
            const neighbor = p.getNeighborAndDir(path, edge, true)[0].join(',');
            assert.deepEqual(blockMap.get(neighbor), expected.tiles.get(neighbor), `${hash} edge ${edge}`);
            if (typeHashes.has(hash) && mainHashes.has(neighbor)) connections.add([hash, neighbor].sort().join('|'));
        }
    }
    assert.equal(connections.size, 5);
});

test('runtime reward and text mutations cannot change generated data or survive map reinitialization', () => {
    initMap(polygon());
    const [, bankHash, bankSource] = mainMapModData.tiles.find(([, , tile]) => tile.data?.exchange);
    const [, textHash, textSource] = mainMapModData.tiles.find(([, , tile]) => typeof tile.text === 'object');
    const beforeBank = structuredClone(bankSource), beforeText = structuredClone(textSource);
    blockMap.get(bankHash).data.exchange.amount = -1;
    blockMap.get(bankHash).type = 0;
    blockMap.get(textHash).text.zh = 'changed';
    nameMap.set('temporary-alias', bankHash);
    assert.deepEqual(bankSource, beforeBank);
    assert.deepEqual(textSource, beforeText);
    initMap(polygon());
    assert.equal(goldenHash(blockMap, nameMap), nativeGoldenHash);
});

test('dynamic ordinal expansion and procedural temple lookup retain native behavior', () => {
    const expected = fullSourceMap(), p = polygon();
    initMap(p);
    const [ordinalName, ordinalHash] = [...nameMap].find(([name]) => /^O1,[1-9]$/.test(name));
    const ord = ordinalName.slice(1).split(',').map(Number);
    const size = blockMap.size;
    HWorld.prototype.onPassOrd.call({atlasTile: p}, ordinalHash, ord);
    genOrdTiles(expected.tiles, expected.names, polygon(), ordinalHash.split(',').map(Number), ord);
    assert.ok(blockMap.size > size);
    assert.deepEqual(snapshot(blockMap, nameMap), snapshot(expected.tiles, expected.names));
    const prefix = '1,' + Array(43).fill('2').join(',') + ',1,3,3';
    const templeRoad = prefix + ',3,3,3,3,3,3,3,3,5';
    assert.equal(blockMap.has(templeRoad), false);
    const getBlock = hash => HWorld.prototype.getBlock.call({}, hash);
    assert.deepEqual(getBlock(templeRoad), {type: 0, name: '', text: '', data: undefined});
    assert.equal(getBlock(templeRoad + ',2,3').type, 2);
    initMap(polygon());
});

test('relative snapshots, non-advancing branches, overwritten aliases and line ownership are preserved', () => {
    const mini = '@root\n1@[[anchor]]one\n{\n:%,2@next\n}\n:%*,3@side\n:anchor,4@named';
    const parsed = parseMapData(mini, polygon());
    assert.equal(parsed.tiles.get('1,2').text, 'next');
    assert.equal(parsed.tiles.get('1,2,3').text, 'side');
    assert.equal(parsed.tiles.get('1,4').text, 'named');
    const overwritten = parseMapData('@[[old]]before\n@[[new]]after\n1;2@ignored', polygon());
    assert.deepEqual([...overwritten.names], [['old', ''], ['new', '']]);
    assert.deepEqual([...overwritten.lines], [['', 2], ['1', 3], ['1,2', 3]]);
    assert.deepEqual(overwritten.tiles.get('1'), {type: 0, text: ''});
    assert.equal(Object.hasOwn(overwritten.tiles.get(''), 'name'), true);
});

test('TT ownership anchors fail closed on moved boundaries and generated modules are current', async () => {
    assertTypeMapAnchors(source);
    for (const anchor of [':%*,5$[[type]]', ':type,4@', ':%,3$[=getD:666]', '// 序数附加', '$[[ttord]]', ':ttord,1,3@']) {
        const changed = source.replace(anchor, '\n' + anchor);
        assert.notEqual(changed, source);
        assert.throws(() => buildBuiltinMap(changed), /ownership anchor|partition boundaries|Unexpected TT record/);
    }
    await generateBuiltinMaps({check: true});
});
