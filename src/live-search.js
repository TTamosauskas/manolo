// Busca pública ao vivo: restrita ao WordPress de mortesubita.net.
// O site é a única fonte de conteúdo do Manolo; o D1 é apenas reserva.
const HOST='https://mortesubita.net';
const AGENT='ManoloResearchBot/1.0 (+https://github.com/TTamosauskas/manolo; respects robots.txt)';
const STOP=new Set(['quem','qual','quais','como','onde','quando','porque','porquê','sobre','para','quero','pode','voce','você','saber','diga','fale','explique','esse','essa','isto','aquilo','ele','ela','isso','dos','das','com','uma','uns','nos','nas','está','ser','mais','sao','são','que','qual','seu','minha','isso','site','morte','súbita','subita','artigos']);
let cachedRules=null;
export function searchWords(question){
  return [...new Set((String(question||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z0-9]{3,}/g)||[]).map(x=>x.length>6&&x.endsWith('inho')?x.slice(0,-4)+'o':x))].filter(x=>!STOP.has(x)).slice(0,5);
}
export function decodeHtml(text){
  const names={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',hellip:'…',mdash:'—',ndash:'–',ldquo:'“',rdquo:'”',lsquo:'‘',rsquo:'’',aacute:'á',agrave:'à',atilde:'ã',acirc:'â',eacute:'é',ecirc:'ê',iacute:'í',oacute:'ó',otilde:'õ',ocirc:'ô',uacute:'ú',ccedil:'ç'};
  return String(text||'').replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,(all,key)=>{
    if(key.startsWith('#')){
      const n=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
      return Number.isInteger(n)&&n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';
    }
    return names[key.toLowerCase()]??all;
  });
}
export function textFromWordPress(html){
  return decodeHtml(String(html||'')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<\/(?:p|li|h[1-6]|blockquote|div|section)>/gi,'\n')
    .replace(/<[^>]+>/g,' '))
    .replace(/[\t \u00a0]+/g,' ')
    .replace(/\n[ \t]*/g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}
function safeArticleUrl(value){
  try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='mortesubita.net'||u.hostname==='www.mortesubita.net')&&!u.username&&!u.password;}catch{return false;}
}
function normalized(text){return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function matchesWord(text,word){return new RegExp('(^|[^a-z0-9])'+word+'([^a-z0-9]|$)').test(text);}
export function relevanceScore(title,body,words){
  if(!words.length)return 0;
  const titleText=normalized(title),bodyText=normalized(body);
  if(words.length===1)return matchesWord(titleText,words[0])?100:matchesWord(bodyText,words[0])?25:0;
  const phrase=words.join('(?:[^a-z0-9]+[a-z0-9]{1,5}){0,2}[^a-z0-9]+');
  const phrasePattern=new RegExp('(^|[^a-z0-9])'+phrase+'([^a-z0-9]|$)');
  const titleCount=words.filter(w=>matchesWord(titleText,w)).length;
  const textCount=words.filter(w=>matchesWord(bodyText,w)).length;
  if(titleCount===words.length)return 120;
  if(phrasePattern.test(titleText))return 110;
  if(phrasePattern.test(bodyText))return 90;
  // Todos os termos precisam aparecer na mesma passagem curta, não em pontos dispersos.
  if(textCount!==words.length)return 0;
  for(const first of words){
    const re=new RegExp('(^|[^a-z0-9])'+first+'([^a-z0-9]|$)','g');
    for(const found of bodyText.matchAll(re)){
      const pos=found.index;
      const passage=bodyText.slice(Math.max(0,pos-65),pos+130);
      if(words.every(w=>matchesWord(passage,w)))return 45;
    }
  }
  return 0;
}
function brief(text,words){
  const start=text.slice(0,1500);
  const fold=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const contexts=[];
  for(const word of words.slice(0,3)){
    let pos=fold.indexOf(word,1000);
    if(pos<0)continue;
    const from=Math.max(0,pos-350),to=Math.min(text.length,pos+750);
    if(contexts.some(x=>Math.abs(x.pos-pos)<500))continue;
    contexts.push({pos,value:text.slice(from,to)});
  }
  return [start,...contexts.map(c=>c.value)].join('\n[…]\n').slice(0,4500);
}
export function robotsPermits(contents,path){
  const groups=[];let agents=[],rules=[],seenRule=false;
  function flush(){if(agents.length)groups.push({agents:agents.map(x=>x.toLowerCase()),rules});agents=[];rules=[];seenRule=false;}
  for(const raw of String(contents).split(/\r?\n/)){
    const line=raw.replace(/#.*$/,'').trim();
    if(!line)continue;
    const p=line.indexOf(':');if(p<0)continue;
    const key=line.slice(0,p).trim().toLowerCase(),value=line.slice(p+1).trim();
    if(key==='user-agent'){if(seenRule)flush();agents.push(value);continue;}
    if(key==='allow'||key==='disallow'){if(!agents.length)continue;seenRule=true;if(value)rules.push({type:key,path:value});}
  }
  flush();
  const selected=groups.filter(g=>g.agents.some(x=>x==='manoloresearchbot'||x==='manoloresearchbot/1.0'));
  const active=selected.length?selected:groups.filter(g=>g.agents.includes('*'));
  let best=null;
  for(const group of active)for(const rule of group.rules){
    const pattern=rule.path.split('?')[0];
    if(!pattern||!path.startsWith(pattern.replace(/[*$]/g,'')))continue;
    const weight=pattern.length;
    if(!best||weight>best.weight||(weight===best.weight&&rule.type==='allow'))best={weight,type:rule.type};
  }
  return !best||best.type==='allow';
}
async function remote(request,url,timeout=7000){
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const response=await request(url,{method:'GET',redirect:'manual',signal:ctrl.signal,headers:{'Accept':'application/json,text/plain;q=0.8','User-Agent':AGENT}});
    if(!response.ok)throw new Error('HTTP '+response.status);
    return response;
  }finally{clearTimeout(timer);}
}
async function permitted(request){
  if(cachedRules&&Date.now()<cachedRules.expires)return cachedRules.text;
  const response=await remote(request,HOST+'/robots.txt',5000);
  const text=(await response.text()).slice(0,30000);
  cachedRules={text,expires:Date.now()+15*60*1000};
  return text;
}
export async function liveArticles(question,{request=fetch,checkRobots=true}={}){
  const words=searchWords(question);
  if(!words.length)return {rows:[],status:'no_terms'};
  const searchPath='/wp-json/wp/v2/search';
  const postPath='/wp-json/wp/v2/posts/';
  try{
    if(checkRobots){
      const rules=await permitted(request);
      if(!robotsPermits(rules,searchPath)||!robotsPermits(rules,postPath))return {rows:[],status:'disallowed'};
    }
    let results=[];
    for(const query of [words.slice(0,3).join(' '),words[0]]){
      const endpoint=HOST+searchPath+'?search='+encodeURIComponent(query)+'&per_page=8&type=post';
      const response=await remote(request,endpoint);
      const data=await response.json();
      if(!Array.isArray(data))throw new Error('Busca do WordPress não devolveu uma lista');
      results=data.filter(x=>Number.isInteger(x.id)&&x.id>0&&safeArticleUrl(x.url)&&x.type==='post');
      if(results.length)break;
    }
    results=[...new Map(results.map(x=>[x.id,x])).values()]
      .sort((a,b)=>Number(words.every(w=>matchesWord(normalized(b.title),w)))-Number(words.every(w=>matchesWord(normalized(a.title),w)))||a.id-b.id)
      .slice(0,8);
    const posts=await Promise.allSettled(results.map(async item=>{
      const endpoint=HOST+postPath+item.id+'?_fields=id,link,title,content,status';
      const response=await remote(request,endpoint);
      const post=await response.json();
      const title=decodeHtml(post?.title?.rendered||item.title).replace(/<[^>]+>/g,'').trim();
      const body=textFromWordPress(post?.content?.rendered||'');
      const url=post?.link||item.url;
      if(!safeArticleUrl(url)||post?.status!=='publish'||body.length<250||title.length<5)return null;
      const score=relevanceScore(title,body,words);
      if(score===0)return null;
      return {title,url,body:brief(body,words),score};
    }));
    const candidates=posts.filter(x=>x.status==='fulfilled'&&x.value).map(x=>x.value).sort((a,b)=>b.score-a.score);
    // Menções incidentais não devem virar fonte se existem artigos especificamente sobre o tema.
    const minScore=candidates[0]?.score>=90?90:45;
    const rows=candidates.filter(x=>x.score>=minScore).slice(0,4).map(({score,...row})=>row);
    return {rows,status:rows.length?'ok':'empty'};
  }catch(error){
    console.warn('Live search Morte Súbita unavailable:',String(error).slice(0,160));
    return {rows:[],status:'unavailable'};
  }
}
