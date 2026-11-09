import assert from 'node:assert/strict';
import { test } from 'node:test';
import { knowledgeId, rewardKnowledgeIds, tileKnowledgeIds } from '../js/pg/unlocks.js';

test('only existing entries normalize, including explicit metadata arrays', () => {
    assert.equal(knowledgeId('ℕ'), 'sym:ℕ');
    assert.equal(knowledgeId('m'), 'mec:m');
    for (const value of [null, {}, 1, 'sym:missing', 'mec:missing', '__proto__', 'toString']) {
        assert.equal(knowledgeId(value), undefined);
    }
    const ids = tileKnowledgeIds({ type: 0, text: '', data: { info: ['→', 'sym:→', '#p', {}, 'mec:missing'] } });
    assert.deepEqual(ids.sort(), ['mec:#p', 'sym:→']);
});

test('discovery is independent of selected language and limited to the reached tile', () => {
    const tile = { type: 0, text: { zh: '∃!ₛx∈ℝ:x=x', en: 'λ' } };
    const ids = tileKnowledgeIds(tile);
    for (const id of ['sym:∃!ₛ', 'sym:∈', 'sym:ℝ', 'sym:λ']) assert(ids.includes(id));
    assert(!ids.includes('sym:ℕ'));
    assert(!ids.includes('mec:mcpt'));
    assert.deepEqual(tileKnowledgeIds(structuredClone(tile)), ids);
});

test('reward aliases unlock the applicable notes, without granting unrelated skills', () => {
    for (const [reward, notes] of Object.entries({
        dL: ['d', 'b', 'clear', 'name', 'del'],
        mct: ['cond', 'c:', 'cd', 'pop'], mdt: ['>', 'cond'],
        '1st': ['∀', '∃', 'var', 'v:'], mcpt: ['mcpt', '<'],
        mvt: ['u:', '#nf'], met: ['e:'], mnt: ['mcnt', '#sb'],
        mifft: ['msbt'], mcmt: ['combine'], mkdir: ['dir'],
        peano: ['ℕ'], dZ: ['ℤ'], dQ: ['ℚ'], dR: ['ℝ'], ddiv: ['∣'],
    })) {
        const ids = rewardKnowledgeIds(reward);
        for (const note of notes) assert(ids.includes(knowledgeId(note)), `${reward}: ${note}`);
        assert(ids.every(id => knowledgeId(id) === id));
    }
    for (const reward of ['unknown', '__proto__', 'constructor', 'toString'])
        assert.deepEqual(rewardKnowledgeIds(reward), []);
    assert(!rewardKnowledgeIds('macro').includes('mec:hyp'));
});
