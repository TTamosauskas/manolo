import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import handler from '../src/worker.js';

function fakeDB(){
 const cx=new DatabaseSync(':memory:');
 cx.exec(fs.readFileSync('migrations/0001_init.sql','utf8'));
 cx.exec(fs.readFileSync('data/seed.sql','utf8'));
 for(const file of fs.readdirSync('imports').filter(x=>x.endsWith('.sql')).sort())cx.exec(fs.readFileSync(path.join('imports',file),'utf8'));
 return {prepare(sql){const st=cx.prepare(sql);return {first:async()=>st.get()||null,all:async()=>({results:st.all()}),run:async()=>st.run(),bind(...params){return {first:async()=>st.get(...params)||null,all:async()=>({results:st.all(...params)}),run:async()=>st.run(...params)}}}}};
}
function environment(){
 let calls=0;
 return {
  DB:fakeDB(),ACCESS_SALT:'test-secret-not-for-production',MAX_MESSAGES_PER_HOUR:'30',MAX_GLOBAL_AI_PER_DAY:'100',LIVE_ARTICLE_SEARCH:false,
  ASSETS:{fetch:async()=>new Response('<h1>Chat</h1>',{status:200})},
  AI:{run:async(_model,{messages})=>{
   calls++;
   const prompt=messages.at(-1).content;
   if(prompt.includes('Crie UMA questão')) return {response:JSON.stringify({question:'Qual princípio pertence à tradição citada no material recuperado?',options:['Mentalismo','Astronautismo','Geolinguística','Sismologia','Bioquímica'],correct:'A',explanations:{A:'Mentalismo está descrito no artigo citado como uma das doutrinas.',B:'Astronautismo não é um dos princípios descritos nesse artigo.',C:'Geolinguística não é um dos princípios descritos no artigo.',D:'Sismologia não é um dos princípios descritos nessa página.',E:'Bioquímica não está citada como princípio hermético nesse artigo.'}})};
   if(prompt.includes('Responda como JSON'))return {response:JSON.stringify({answer:'O artigo descreve os sigilos como símbolos da intenção.',followups:['O que é a técnica dos sigilos?','Quem foi Austin Osman Spare?']})};
   return {response:'Segundo o artigo, a prática tem caráter simbólico.'};
  }}, get calls(){return calls;}
 };
}
async function chat(env,payload){const response=await handler.fetch(new Request('https://chat.example/api/chat',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://chat.example'},body:JSON.stringify(payload)}),env);return {status:response.status,...await response.json()};}

test('Fluxos integrados: chat livre, ensinar, entrevistas e teste 3 questões',async()=>{
 const env=environment();
 let r=await chat(env,{message:'O que são sigilos?'});
 assert.equal(r.status,200);assert.equal(r.mode,'free');assert.match(r.message,/mortesubita.net/);assert.ok(r.sources[0].url.startsWith('https://mortesubita.net/'));
 const id=r.sessionId;
 r=await chat(env,{sessionId:id,action:'teach'});assert.equal(r.mode,'teach');
 r=await chat(env,{sessionId:id,message:'sigilos'});assert.match(r.message,/O que é a técnica/);assert.match(r.message,/A\)/);
 r=await chat(env,{sessionId:id,message:'A'});assert.match(r.message,/sigilos/);
 r=await chat(env,{sessionId:id,action:'interviews'});assert.equal(r.mode,'interviews');
 const prev=env.calls;
 r=await chat(env,{sessionId:id,message:'Cabala'});assert.match(r.message,/youtube.com/);assert.equal(env.calls,prev);
 r=await chat(env,{sessionId:id,action:'quiz'});assert.match(r.message,/Questão 1\/3/);
 r=await chat(env,{sessionId:id,message:'A'});assert.match(r.message,/Questão 2\/3/);
 r=await chat(env,{sessionId:id,message:'B'});assert.match(r.message,/Questão 3\/3/);
 r=await chat(env,{sessionId:id,message:'A'});assert.match(r.message,/Nota: 2\/3/);assert.equal(r.mode,'home');
});

test('Controle de origem e ausência de segredo',async()=>{
 const env=environment();delete env.ACCESS_SALT;
 const r=await chat(env,{message:'Olá'});assert.equal(r.status,503);
 const response=await handler.fetch(new Request('https://chat.example/api/chat',{method:'POST',headers:{Origin:'https://example.evil','Content-Type':'application/json'},body:'{"message":"x"}'}),environment());assert.equal(response.status,403);
});

test('Gemma 4: configura geração sem modo thinking',async()=>{
 const env=environment();
 let input;
 env.AI.run=async(_model,params)=>{input=params;return {response:'Uma explicação real baseada no artigo original.'};};
 const r=await chat(env,{message:'hermetismo'});
 assert.equal(r.status,200);
 assert.equal(input.chat_template_kwargs.enable_thinking,false);
});

test('Modelo vazio: mensagem clara ao invés de resposta sem conteúdo',async()=>{
 const env=environment();
 env.AI.run=async()=>({response:''});
 const r=await chat(env,{message:'hermetismo'});
 assert.equal(r.status,200);
 assert.match(r.message,/não retornou uma explicação/);
});

test('Abertura do chat e reset usam sempre a mensagem inicial solicitada',async()=>{
 const html=fs.readFileSync('public/index.html','utf8');
 const initial='Sou Manolo, seu tutor em assuntos ocultos. Minha base de conhecimento são os livros antigos em domínio público e os mais recentes artigos de mortesubita.net.';
 assert.ok(html.includes('<strong>¡Hola, mi amigo!</strong>'));
 assert.ok(html.includes(initial));
 assert.ok(html.includes('Escolha um modo ou faça sua pergunta.'));
 const env=environment();
 const r=await chat(env,{action:'reset'});
 assert.equal(r.status,200);
 assert.equal(r.message,`**¡Hola, mi amigo!**\n\n${initial}\n\nEscolha um modo ou faça sua pergunta.`);
});
test('Entrevistas não incluem aviso sobre títulos e transcrições',async()=>{
 const env=environment();
 const start=await chat(env,{action:'interviews'});
 const answer=await chat(env,{sessionId:start.sessionId,message:'alquimia'});
 assert.equal(answer.status,200);
 assert.match(answer.message,/youtube\.com/);
 assert.doesNotMatch(answer.message,/transcriç|transcri[cç]/i);
 const frontend=fs.readFileSync('public/chat.js','utf8');
 assert.doesNotMatch(frontend,/não contém transcrições|não equivalem a transcrições/i);
});
