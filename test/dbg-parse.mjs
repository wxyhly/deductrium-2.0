import { HSParser } from './js/hs/core/parser.js';
const p = new HSParser();
for (const s of ['($0>$1)', '$0>$1', '(¬$1)', '¬($0>$1)']) {
    const a = p.parse(s, 'wff');
    console.log(JSON.stringify(s), '=> type:', a.type, 'name:', JSON.stringify(a.name), 'nodes:', a.nodes.map(n => n.type + ':' + n.name).join(','));
}
