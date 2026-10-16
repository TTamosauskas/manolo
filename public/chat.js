const feed=document.querySelector('#feed');
const input=document.querySelector('#message');
const form=document.querySelector('#composer');
const send=document.querySelector('#send');
const modes=[...document.querySelectorAll('[data-action]')];
const store='manolo-chat-v1';
const isPages=location.hostname.endsWith('.github.io');
const customApi=String(window.MANOLO_API_URL||'').trim();
const apiEndpoint=customApi || (isPages ? '' : location.origin+'/api/chat');
const offline={videos:null,topic:'',matches:[],offset:0};
function foldText(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
async function getLocalVideos(){
  if(offline.videos)return offline.videos;
  const response=await fetch('./mayhem.txt');
  if(!response.ok)throw new Error('Catálogo de vídeos ainda não publicado.');
  const rows=(await response.text()).split(/\r?\n/).map(line=>{
    const [title,url]=line.split('\t');
    try{const parsed=new URL(url);if(title&&parsed.protocol==='https:'&&['www.youtube.com','youtube.com','youtu.be'].includes(parsed.hostname))return {title,url};}catch{}
    return null;
  }).filter(Boolean);
  offline.videos=rows;
  return rows;
}
async function offlineChat(message='',action=''){
  if(pending)return;
  busy(true);
  if(message){const el=append('user',message);setRaw(el,message);}
  const placeholder=append('assistant','Consultando o catálogo...');setRaw(placeholder,'Consultando o catálogo...');
  try{
    let answer='';
    if(action==='interviews'){
      setMode('interviews');offline.topic='';offline.matches=[];offline.offset=0;
      answer='**¡Órale, amigo!**\n\nTenho o catálogo Mayhem disponível mesmo sem a IA. Sobre qual assunto você quer assistir a entrevistas ou vídeos?';
    }else if(action || activeMode!=='interviews'){
      if(action)setMode('home');
      answer='**¡Ándale, amigo!**\n\nEsta versão hospedada no GitHub Pages já permite pesquisar os vídeos do Mayhem. As aulas, perguntas sobre os artigos e testes dependem da conexão com a IA gratuita no servidor, ainda não ativada.\n\nEscolha **Entrevistas** para pesquisar agora.';
    }else{
      const more=/^(mais|proximos|proximas|continuar)$/i.test(foldText(message.trim()));
      if(!more || !offline.topic){
        offline.topic=message.trim();offline.offset=0;
        const videos=await getLocalVideos();
        const words=[...new Set(foldText(offline.topic).split(/[^a-z0-9]+/).filter(w=>w.length>2 && !['sobre','para','como','videos','entrevistas','com','dos','das'].includes(w)))];
        const ranked=videos.map(v=>{const title=foldText(v.title);return {...v,score:words.filter(w=>title.includes(w)).length};}).filter(v=>v.score>0);
        const strict=ranked.filter(v=>v.score===words.length);
        offline.matches=(strict.length?strict:ranked).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,'pt-BR'));
      }else offline.offset+=12;
      const page=offline.matches.slice(offline.offset,offline.offset+12);
      answer=page.length?'**¡Órale, compadre!**\n\nVídeos do catálogo Mayhem sobre **'+offline.topic+'**:\n\n'+page.map(v=>'- ['+v.title.replace(/[\[\]]/g,'')+']('+v.url+')').join('\n')+(offline.matches.length>offline.offset+12?'\n\nEscreva **mais** para ver os próximos.':''):'**¡Ay, caramba!**\n\nNão encontrei outros vídeos sobre **'+offline.topic+'** no catálogo. Você pode tentar outro termo.';
    }
    formatReplace(placeholder,answer);
  }catch(err){
    placeholder.querySelector('.bubble').classList.add('is-error');
    formatReplace(placeholder,'Não consegui consultar o catálogo: '+err.message);
  }finally{busy(false);input.focus();persist();}
}
function offlineGreeting(){
  const notice=append('assistant','**Aviso:** hospedagem gratuita pelo GitHub Pages. A pesquisa de **Entrevistas** já funciona aqui; o chat com IA aguarda a ativação do backend gratuito.');
  setRaw(notice,notice.querySelector('.bubble').textContent.replace('Aviso:','**Aviso:**'));
}

let pending=false, sessionId=null, activeMode='home';
const welcome=feed.innerHTML;
function allowedLink(value){try{const u=new URL(value);return u.protocol==='https:' && ['mortesubita.net','www.mortesubita.net','www.youtube.com','youtube.com','youtu.be'].includes(u.hostname);}catch{return false;}}
function formatText(container,body){
  const pattern=/(\*\*[^*\n]+\*\*|\[[^\]\n]{1,180}\]\(https:\/\/[^)\s]+\))/g;
  let cursor=0;
  for(const match of body.matchAll(pattern)){
    container.append(document.createTextNode(body.slice(cursor,match.index)));
    const token=match[0];
    if(token.startsWith('**')){const strong=document.createElement('strong');strong.textContent=token.slice(2,-2);container.append(strong);}
    else{const close=token.indexOf('](');const name=token.slice(1,close);const address=token.slice(close+2,-1);if(allowedLink(address)){const a=document.createElement('a');a.textContent=name;a.href=address;a.target='_blank';a.rel='noopener noreferrer';container.append(a);}else container.append(document.createTextNode(name));}
    cursor=match.index+token.length;
  }
  container.append(document.createTextNode(body.slice(cursor)));
}
function append(role,message,error=false){
  const el=document.createElement('div');el.className='message '+(role==='user'?'from-user':'from-manolo');
  if(role!=='user'){const icon=document.createElement('img');icon.className='avatar';icon.src='./gpt-icon.jpg';icon.alt='';el.append(icon);}
  const bubble=document.createElement('div');bubble.className='bubble'+(error?' is-error':'');
  formatText(bubble,message);el.append(bubble);feed.append(el);feed.scrollTop=feed.scrollHeight;persist();return el;
}
function persist(){const items=[...feed.querySelectorAll('.message')].slice(-60).map(el=>({role:el.classList.contains('from-user')?'user':'assistant',text:el.querySelector('.bubble')?.dataset?.raw||''})).filter(x=>x.text);try{localStorage.setItem(store,JSON.stringify({sessionId,activeMode,items}));}catch{}}
function setRaw(el,raw){el.querySelector('.bubble').dataset.raw=raw;persist();}
function load(){try{const state=JSON.parse(localStorage.getItem(store)||'null');if(!state||!Array.isArray(state.items)||!state.items.length)return;sessionId=state.sessionId||null;activeMode=state.activeMode||'home';feed.innerHTML=welcome;for(const m of state.items.slice(-60)){if(typeof m.text==='string'){const el=append(m.role==='user'?'user':'assistant',m.text);setRaw(el,m.text);}}setMode(activeMode);}catch{}}
function setMode(mode){activeMode=mode;for(const b of modes)b.setAttribute('aria-pressed',String(b.dataset.action===mode));}
function busy(value){pending=value;send.disabled=value;input.disabled=value;for(const b of modes)b.disabled=value;document.querySelector('#reset').disabled=value;}
async function request(message='',action=''){
  if(pending)return;
  if(!apiEndpoint)return offlineChat(message,action);
  busy(true);
  if(message){const m=append('user',message);setRaw(m,message);}
  const placeholder=append('assistant','Consultando...');setRaw(placeholder,'Consultando...');
  try{
    const response=await fetch(apiEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,message,action})});
    const data=await response.json();
    if(!response.ok)throw new Error(data?.error||'Falha de comunicação');
    sessionId=data.sessionId;setMode(data.mode||activeMode);
    formatReplace(placeholder,data.message||'Sem resposta.');
  }catch(err){placeholder.querySelector('.bubble').classList.add('is-error');formatReplace(placeholder,`Não consegui completar a consulta: ${err.message}`);}
  finally{busy(false);input.focus();persist();}
}
function formatReplace(el,text){const b=el.querySelector('.bubble');b.replaceChildren();formatText(b,text);setRaw(el,text);feed.scrollTop=feed.scrollHeight;}
form.addEventListener('submit',e=>{e.preventDefault();const message=input.value.trim();if(!message)return;input.value='';resize();request(message);});
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit();}});
input.addEventListener('input',resize);
function resize(){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,135)+'px';}
for(const btn of modes)btn.addEventListener('click',()=>request('',btn.dataset.action));
document.querySelector('#reset').addEventListener('click',()=>{if(pending)return;feed.innerHTML=welcome;sessionId=null;setMode('home');try{localStorage.removeItem(store);}catch{}if(!apiEndpoint)offlineGreeting();input.focus();});
load();
if(!apiEndpoint && feed.querySelectorAll('.message').length===1)offlineGreeting();
