// 调试 d\o 规则行 parse 失败
import { HSParser } from '../js/hs/core/parser.js';
import { initialCreativeRules } from '../js/hs/core/initial.js';

const parser = new HSParser();
const lines = initialCreativeRules.split("\n").filter(e => e && e.trim() && !e.trim().startsWith("//") && !e.trim().startsWith("{") && !e.trim().startsWith("}"));
const e = lines[82];
console.log('行:', JSON.stringify(e));
const name = e.slice(0, e.indexOf(":")).trim();
let rest = e.slice(e.indexOf(":") + 1).trim();
let steps = "";
if (rest.startsWith("ax:")) { rest = rest.slice(3); }
else { steps = rest.slice(rest.indexOf(";") + 1); rest = rest.slice(0, rest.indexOf(";")); }
console.log('name:', JSON.stringify(name));
console.log('rest:', JSON.stringify(rest));
console.log('steps:', JSON.stringify(steps));

const ast = parser.parse(rest, 'rule');
console.log('parse(rule):', ast ? ast.toString() : 'NULL');

// 试 parse 为 wff
const wff = parser.parse(rest, 'wff');
console.log('parse(wff):', wff ? wff.toString() : 'NULL');

// 试 parse 为 ast
const ast2 = parser.parse(rest, 'ast');
console.log('parse(ast):', ast2 ? ast2.toString() : 'NULL');
