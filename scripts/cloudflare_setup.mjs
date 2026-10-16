import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const NAME='manolo-db';
export function databasesFromResult(result){
  if(Array.isArray(result))return result;
  if(Array.isArray(result?.databases))return result.databases;
  throw new Error('Resposta inesperada ao listar bancos D1.');
}
export function databaseUuid(record){
  const id=record?.uuid||record?.id;
  if(!/^[a-f0-9-]{36}$/i.test(String(id||'')))throw new Error('UUID D1 inválido.');
  return id;
}
export async function setup({accountId,apiToken,request=fetch,configPath='wrangler.jsonc'}){
  const endpoint='https://api.cloudflare.com/client/v4/accounts/'+accountId+'/d1/database';
  async function api(path,options={}){
    const response=await request(endpoint+path,{...options,headers:{Authorization:'Bearer '+apiToken,'Content-Type':'application/json'}});
    let data;try{data=await response.json();}catch{throw new Error('A Cloudflare respondeu com JSON inválido (HTTP '+response.status+').');}
    if(!response.ok||data?.success!==true){
      const details=(data?.errors||[]).map(e=>e.message||e.code).join('; ');
      throw new Error('Erro D1 (HTTP '+response.status+'): '+(details||'verifique as permissões D1 Admin/Write do token.'));
    }
    return data.result;
  }
  const items=databasesFromResult(await api('?per_page=100'));
  let database=items.find(item=>item.name===NAME);
  if(!database){
    console.log('Criando banco D1 manolo-db...');
    database=await api('',{method:'POST',body:JSON.stringify({name:NAME})});
  }else console.log('Reutilizando banco D1 manolo-db existente.');
  const uuid=databaseUuid(database);
  const config=JSON.parse(readFileSync(configPath,'utf8'));
  if(config.d1_databases?.length!==1||config.d1_databases[0]?.binding!=='DB')throw new Error('Binding D1 inesperado no wrangler.jsonc.');
  config.d1_databases[0].database_id=uuid;
  writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
  console.log('D1 configurado apenas na cópia temporária do workflow.');
  return uuid;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const accountId=(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
    const apiToken=(process.env.CLOUDFLARE_API_TOKEN||'').trim();
    if(!/^[a-f0-9]{32}$/i.test(accountId)||apiToken.length<16)throw new Error('Configure CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_API_TOKEN nos segredos do GitHub.');
    await setup({accountId,apiToken});
  }catch(err){console.error(err.message);process.exitCode=1;}
}
