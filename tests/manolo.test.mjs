import test from 'node:test';
import assert from 'node:assert/strict';
import {terms,ftsQuery,validSource,safeModelText,parseStructured,validateQuestion} from '../src/worker.js';

test('normalização de tópicos e consultas seguras',()=>{
 assert.deepEqual(terms('Quero saber SOBRE a Alquímia e seus sigilos!'),['saber','alquimia','seus','sigilos']);
 assert.equal(ftsQuery('magia do caos'),'"magia"* OR "caos"*');
 assert.equal(ftsQuery('!!???'),'');
 assert.equal(ftsQuery('" OR site:*'),'"site"*');
});
test('origem do artigo estritamente permitida',()=>{
 assert.equal(validSource('https://mortesubita.net/um-artigo/'),true);
 assert.equal(validSource('https://www.mortesubita.net/'),true);
 for(const url of ['https://mortesubita.net.evil.com/','https://evil.com/mortesubita.net','http://mortesubita.net/','javascript:alert(1)','https://mortesubita.net@evil.com/'])assert.equal(validSource(url),false,url);
});
test('modelo não injeta links nem html',()=>{
 const txt=safeModelText('Leia [isto](https://evil.com/x) e https://outro.com/foo <script>alert(1)</script>.');
 assert.equal(txt.includes('https://'),false);assert.equal(txt.includes('<'),false);
});
test('valida questão estruturada de cinco alternativas',()=>{
 const item={question:'Segundo o artigo, qual é um dos princípios citados no Caibalion?',options:['Mentalismo','Numerologia','Magnetismo','Naturalismo','Astrometria'],correct:'A',explanations:Object.fromEntries('ABCDE'.split('').map(x=>[x,'A justificativa deriva do trecho recuperado.']))};
 assert.equal(validateQuestion(item),true);
 assert.equal(validateQuestion({...item,options:[...item.options.slice(0,4),item.options[0]]}),false);
 assert.equal(validateQuestion({...item,correct:'F'}),false);
 assert.equal(parseStructured('```json\n'+JSON.stringify(item)+'\n```').correct,'A');
});
