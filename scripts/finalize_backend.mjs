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
  const check=await request(url+'/api/health');
  if(!check.ok)throw new Error('Falha no endpoint /api/health: HTTP '+check.status);
  const data=await check.json();
  if(data?.ok!==true||data?.service!=='manolo')throw new Error('Endpoint inválido.');
  const cors=await request(url+'/api/chat',{method:'OPTIONS',headers:{Origin:'https://ttamosauskas.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
  if(cors.status!==204||cors.headers.get('access-control-allow-origin')!=='https://ttamosauskas.github.io')throw new Error('CORS não autorizou o GitHub Pages.');
  writeFileSync(configPath,'// URL pública da API, sem credenciais.\nwindow.MANOLO_API_URL = '+JSON.stringify(url+'/api/chat')+';\n');
  if(summaryPath)appendFileSync(summaryPath,'\n### Manolo: backend ativo\n\n- API: '+url+'\n- Status: '+url+'/api/health\n- Chat: https://ttamosauskas.github.io/manolo/\n');
  console.log('Backend publicado e preparado para a conexão com o GitHub Pages.');
  return url;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{await finish({log:readFileSync(process.argv[2],'utf8')});}catch(err){console.error(err.message);process.exitCode=1;}
}
