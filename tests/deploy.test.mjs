import test from 'node:test';
import assert from 'node:assert/strict';
import {databasesFromResult,databaseUuid,setup} from '../scripts/cloudflare_setup.mjs';
import {workerUrlFromLog,finish} from '../scripts/finalize_backend.mjs';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const ID='f1a1b1c1-d1e1-4a1b-8c1d-1e1a1b1c1d1e';
test('D1: lista e valida UUID',()=>{
  assert.equal(databasesFromResult([{name:'manolo-db'}]).length,1);
  assert.equal(databaseUuid({uuid:ID}),ID);
  assert.throws(()=>databaseUuid({uuid:'invalid'}));
});
test('D1: reutilização preserva outros bindings',async()=>{
  const path=join(mkdtempSync(join(tmpdir(),'manolo-')),'wrangler.jsonc');
  writeFileSync(path,JSON.stringify({d1_databases:[{binding:'DB',database_id:'PENDENTE'}],ai:{binding:'AI'}}));
  let requests=0;
  const request=async()=>{requests++;return {ok:true,status:200,json:async()=>({success:true,result:[{name:'manolo-db',uuid:ID}]})};};
  await setup({accountId:'a'.repeat(32),apiToken:'token-de-teste',request,configPath:path});
  assert.equal(requests,1);
  const parsed=JSON.parse(readFileSync(path,'utf8'));
  assert.equal(parsed.d1_databases[0].database_id,ID);
  assert.equal(parsed.ai.binding,'AI');
});
test('D1: erro de permissão não cria banco',async()=>{
  const path=join(mkdtempSync(join(tmpdir(),'manolo-')),'wrangler.jsonc');
  await assert.rejects(setup({accountId:'a'.repeat(32),apiToken:'teste',request:async()=>({ok:false,status:403,json:async()=>({success:false,errors:[{message:'Forbidden'}]})}),configPath:path}),/403/);
});
test('Backend: valida domínio e resposta de saúde',async()=>{
  const path=join(mkdtempSync(join(tmpdir(),'manolo-')),'config.js');
  const url=workerUrlFromLog('Publicado em https://manolo.exemplo.workers.dev');
  assert.equal(url,'https://manolo.exemplo.workers.dev');
  let count=0;
  const request=async(_,opts)=>{
    count++;
    if(opts?.method==='OPTIONS')return {status:204,headers:new Headers({'access-control-allow-origin':'https://ttamosauskas.github.io'})};
    return {ok:true,status:200,json:async()=>({ok:true,service:'manolo'})};
  };
  await finish({log:'Publicado em '+url,request,configPath:path,summaryPath:null});
  assert.equal(count,2);
  assert.match(readFileSync(path,'utf8'),/manolo.exemplo.workers.dev\/api\/chat/);
});
