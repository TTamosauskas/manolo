import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function workerUrlFromLog(log){
  const urls=Array.from(log.matchAll(/https:\/\/[a-z0-9.-]+\.workers\.dev\b/ig),x=>x[0]);
  const found=urls.find(x=>{try{return new URL(x).hostname.startsWith('manolo.');}catch{return false;}});
  if(!found)throw new Error('Não foi encontrada a URL workers.dev no log de publicação.');
  return found;
}
export async function finish({log,request=fetch,configPath='public/config.js',summaryPath=process.env.GITHUB_STEP_SUMMARY}){
  const url=workerUrlFromLog(log);
  // O secret put implanta uma nova versão do Worker; aguarde a propagação nas bordas.
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let verified=false, lastError;
  for(let attempt=1;attempt<=10;attempt++){
    try{
      const check=await request(url+'/api/health');
      if(!check.ok)throw new Error('/api/health retornou HTTP '+check.status);
      const data=await check.json();
      if(data?.ok!==true||data?.service!=='manolo')throw new Error('/api/health respondeu sem a identificação Manolo.');
      const cors=await request(url+'/api/chat',{method:'OPTIONS',headers:{Origin:'https://ttamosauskas.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
      const allowed=cors.headers.get('access-control-allow-origin');
      if(cors.status!==204||allowed!=='https://ttamosauskas.github.io'){
        throw new Error('Preflight CORS: HTTP '+cors.status+', allow-origin='+JSON.stringify(allowed));
      }
      verified=true;
      break;
    }catch(err){
      lastError=err;
      console.warn('Aguardando propagação da API ('+attempt+'/10): '+err.message);
      if(attempt<10)await sleep(3000);
    }
  }
  if(!verified)throw new Error('Worker implantado, mas a API ainda não passou na verificação: '+lastError?.message);
  writeFileSync(configPath,'// URL pública da API, sem credenciais.\nwindow.MANOLO_API_URL = '+JSON.stringify(url+'/api/chat')+';\n');
  if(summaryPath)appendFileSync(summaryPath,'\n### Manolo: backend ativo\n\n- API: '+url+'\n- Status: '+url+'/api/health\n- Chat: https://ttamosauskas.github.io/manolo/\n');
  console.log('Backend publicado e preparado para a conexão com o GitHub Pages.');
  return url;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{await finish({log:readFileSync(process.argv[2],'utf8')});}catch(err){console.error(err.message);process.exitCode=1;}
}
