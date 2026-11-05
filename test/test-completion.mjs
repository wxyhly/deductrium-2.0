import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeCommand } from '../js/hs/gui/completion.js';
import { HSParser } from '../js/hs/core/parser.js';

const source = {
    commands: ['d', 'del', 'dir', 'inln', 'entr', 'rename', 'm', 'mcpt'],
    rules: [
        {name:'a1',hint:'⊢$1→$2→$1',derived:{conditions:0,implication:true}}, {name:'a2',derived:{conditions:0,implication:true}}, {name:'.i',expandable:true},
        {name:'zMacro',expandable:true,derived:{conditions:0,implication:true}}, {name:'zMore',expandable:true}, {name:'mp',derived:{conditions:2,implication:false}},
    ],
    targets: [{name:'1',expandable:true},{name:'12',expandable:true},{name:'zMacro',kind:'D',expandable:true},{name:'stepName',expandable:false}],
    folders: [{name:'my folder'},{name:'zFolder'}],
};
const complete = (text, extra = {}, cursor = text.length) => completeCommand(text,cursor,cursor,{...source,...extra});
const labels = xs => xs.map(x=>x.label);
const apply = (text,item) => text.slice(0,item.start)+item.text+text.slice(item.end);

test('derived previews use the completed whole rule name after matching and limiting candidates', () => {
    const calls=[];
    const previewRule=name=>{calls.push(name);return 'preview:'+name;};
    for(const [text,cursor,expected] of [
        ['d ca',4,'ca1'], ['vc<a',4,'vc<a1'], ['d c(a',5,'c(a1)'],
        ['d mp(#,a',8,'mp(#,a1)'], ['d c(a2) $p',5,'c(a1)'],
        ['hyp $p; d ca $q',12,'ca1'],
    ]) {
        calls.length=0;
        const result=complete(text,{previewRule},cursor);
        assert.equal(result[0].hint,'preview:'+expected,text);
        assert.equal(result[0].hintType,'rule');
        assert.equal(calls[0],expected);
    }
    const prompted=complete('ca',{previewRule,pending:{command:'d',argumentCount:0}});
    assert.equal(prompted[0].hint,'preview:ca1');
    calls.length=0;
    complete('a',{previewRule});
    complete('del zM',{previewRule});
    complete('ca',{previewRule,pending:{command:'d',argumentCount:1}});
    assert.deepEqual(calls,[],'ordinary rules, editing, and formula prompts need no generation');
    const rules=Array.from({length:150},(_,i)=>({name:`z${i}`}));
    complete('cz',{rules,previewRule});
    assert.equal(calls.length,100,'only the displayed candidate limit is previewed');
});

test('idle rules and commands, stable order, case insensitive names',()=>{
    assert.deepEqual(labels(complete('a')),['a1','a2']);
    assert.deepEqual(labels(complete('ZMA')),['zMacro']);
    assert.deepEqual(labels(complete('d')),['d','del','dir']);
    assert.deepEqual(labels(complete('m')),['mp','m','mcpt']);
    assert.deepEqual(complete(''),[]);
    assert.deepEqual(labels(complete('del', {commands:['d']})),[]);
});
test('same-named proof and macro remain separate P and D candidates',()=>{
    const macro={name:'ss1',kind:'D',expandable:true,hint:'⊢$p→$p'};
    const extra={rules:[macro],targets:[{name:'ss1',expandable:true,hint:'$p→$p'},macro,macro]};
    for(const command of ['del','rename','inln','entr']) {
        const result=complete(command+' ss1',extra);
        assert.deepEqual(result.map(({kind,label})=>({kind,label})),[{kind:'P',label:'ss1'},{kind:'D',label:'ss1'}],command);
        assert.equal(result[0].hint,'$p→$p');
        assert.equal(result[1].hint,'⊢$p→$p');
    }
});
test('rule prompts only complete the name, never proof/formula/new-name parameters',()=>{
    assert.deepEqual(labels(complete('a',{pending:{command:'d',argumentCount:0}})),['a1','a2']);
    for(const command of ['d','rename','del','inln','entr'])
        assert.deepEqual(complete('a',{pending:{command,argumentCount:1}}),[]);
    for(const text of ['hyp a','m z','rename zMacro new','d a1 z','del zMacro 1'])
        assert.deepEqual(complete(text),[]);
});
test('prefixes and composition complete the innermost rule atom without generating rules',()=>{
    for (const text of ['ca','vc<a','d ca','d c(a','d mp(a','d mp(#,a','d a1:a']) {
        const items=complete(text);
        assert.equal(items.length,2,text);
        assert.ok(apply(text,items[0]).endsWith(text.endsWith('ca')?'ca1':'a1'),text);
    }
    assert.deepEqual(complete('d c'),[]);
    assert.equal(apply('d c(a2)',complete('d c(a2)',{},5)[0]),'d c(a1)');
});
test('cursor replacement preserves later commands, parameters and delimiters',()=>{
    assert.equal(apply('  a; d a $p',complete('  a; d a $p',{},8)[0]),'  a; d a1 $p');
    assert.equal(apply('hyp $p\n a',complete('hyp $p\n a')[0]),'hyp $p\n a1');
    assert.equal(apply('zMacro',complete('zMacro',{},2)[0]),'zMacro');
    assert.deepEqual(completeCommand('a',0,1,source),[]);
});
test('editing targets, lists, quoted folders, and inspection input',()=>{
    assert.deepEqual(labels(complete('del 1')),['1','12']);
    assert.equal(apply('del 1,zM',complete('del 1,zM')[0]),'del 1,zMacro');
    assert.equal(apply('rename "my f',complete('rename "my f')[0]),'rename "my folder"');
    assert.equal(apply('rename "my f" new',complete('rename "my f" new',{},12)[0]),'rename "my folder" new');
    assert.deepEqual(labels(complete('inln zM')),['zMacro','zMore']);
    assert.deepEqual(labels(complete('zM',{pending:{command:'entr',argumentCount:0}})),['zMacro','zMore']);
    assert.deepEqual(labels(complete('1',{inspecting:true})),['1','12']);
    assert.deepEqual(complete('del zFolder'),[]);
    assert.deepEqual(complete('z',{pending:{command:'del',argumentCount:2}}),[]);
});
test('bounded candidates, plain labels, no source mutation',()=>{
    const rules=Array.from({length:150},(_,i)=>({name:`z${i}`}));
    assert.equal(complete('z',{rules}).length,100);
    assert.deepEqual(labels(complete('<b',{rules:[{name:'<b>text'}]})),['<b>text']);
    assert.equal(source.rules.length,6);
});
test('editing command tokens preserve input whitespace and exact quoted names',()=>{
    for(const text of ['del 1,zMacro  ', 'inln zMacro', 'entr  1', 'rename "my folder" "new folder"', 'rename  zMacro   zNew  ']) {
        const parser = new HSParser();
        parser.parse(text,'cmds');
        assert.equal(parser.getTokens().map(t=>text.slice(t.start,t.end)).join(''),text);
    }
});

test('proof inspection completion excludes hypotheses/axioms and supports derived names',()=>{
    assert.deepEqual(complete('entr a'),[]);
    assert.deepEqual(complete('inln step'),[]);
    for(const text of ['entr ca','inln ca','entr c(a','entr mp(#,a']) {
        assert.deepEqual(labels(complete(text)),text.endsWith('ca')?['ca1','ca2']:['a1','a2']);
    }
    assert.deepEqual(labels(complete('del step')),['stepName']);
});

test('quoted rename completion replaces escaped tokens at the cursor in full commands and prompts',()=>{
    for (const name of ['a"b', 'a\\b', 'a; b,(c)', 'a\nb', 'a汉字']) {
        const encoded=JSON.stringify(name);
        for (const prefix of ['rename ', '']) {
            const extra={folders:[{name}],...(prefix ? {} : {pending:{command:'rename',argumentCount:0}})};
            const text=prefix+encoded+' renamed';
            for (const offset of [2,encoded.length-1,encoded.length]) {
                const items=complete(text,extra,prefix.length+offset);
                assert.equal(items.length,1,`${name} at ${offset}`);
                assert.equal(apply(text,items[0]),text,`${name} token suffix`);
            }
            assert.equal(apply(prefix+encoded.slice(0,-1),complete(prefix+encoded.slice(0,-1),extra)[0]),prefix+encoded);
            assert.deepEqual(complete(text,extra),[],'new-name parameter');
        }
    }
});

test('rename quotes escaped candidate names and tolerates incomplete escape input',()=>{
    for (const name of ['a"b','a\\b']) {
        const text='rename a';
        const result=apply(text,complete(text,{folders:[{name}]})[0]);
        assert.equal(result,'rename '+JSON.stringify(name));
        assert.equal(new HSParser().parse(result+' renamed','cmd').nodes[0].name,name);
    }
    for (const fragment of ['"a\\','"a\\u12','"a\\q'])
        assert.deepEqual(complete(fragment,{pending:{command:'rename',argumentCount:0}}),[]);
});

test('inline accepts proof folders while inspection excludes them in full commands and prompts',()=>{
    const targets=[{name:'box',inlinable:true},{name:'conditionBox',inlinable:true},{name:'variableBox',inlinable:true}];
    for (const target of targets) {
        for (const command of ['inln','entr']) {
            const expected=command==='inln'?[target.name]:[];
            assert.deepEqual(labels(complete(`${command} ${target.name}`,{targets})),expected);
            assert.deepEqual(labels(complete(target.name,{targets,pending:{command,argumentCount:0}})),expected);
        }
    }
});

test('derived inspection filters unsupported metadata without generating rules',()=>{
    const rules=[...source.rules,
        {name:'a4'},{name:'a5'},{name:'a6'},
        {name:'zTheorem',expandable:true,derived:{conditions:0,implication:true}},
        {name:'zInference',expandable:true,derived:{conditions:1,implication:false}},
        {name:'zError',expandable:false},
    ];
    for (const command of ['entr','inln']) {
        for (const fragment of ['va1','ea1','ua1','>a1','v(a1','e(a1','u(a1','>(a1','vzError','czError','e(zMacro'])
            assert.deepEqual(complete(`${command} ${fragment}`,{rules}),[],fragment);
        for (const fragment of ['ca1','<a1','vzTheorem','uzInference','>zInference','vca1']) {
            assert.equal(complete(`${command} ${fragment}`,{rules}).length,1,fragment);
            assert.equal(complete(fragment,{rules,pending:{command,argumentCount:0}}).length,1,fragment+' prompt');
        }
    }
});

test('literal name mode preserves complete input and leaves formula/item normalization enabled',()=>{
    const parser=new HSParser();
    for (const text of ['', '  "prompt\\"folder\\\\tail"  ', '  a\\b\t > $x \\a \n', '"unfinished\\']) {
        assert.equal(parser.parse(text,'name').name,text);
        const tokens=parser.getTokens();
        assert.equal(tokens.map(token=>text.slice(token.start,token.end)).join(''),text);
        assert.ok(tokens.every(token=>!parser.allowReplaceTokenType(token.type)));
    }
    for (const [text,mode] of [['$p>$q','wff'],['x\\\\y','item']]) {
        assert.ok(parser.parse(text,mode));
        assert.ok(parser.getTokens().some(token=>parser.allowReplaceTokenType(token.type)));
    }
});
