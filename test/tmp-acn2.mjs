import { HSParser } from '../js/hs/core/parser.js';
const p = new HSParser();
const s = String.raw`.\acn<>`;
console.log('raw:', s);
const d = p.parse(s, 'dname');
console.log('dname toString:', d.toString());
console.log('dname type:', d.type, 'name:', d.name);
