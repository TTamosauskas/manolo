const feed=document.querySelector('#feed');
const input=document.querySelector('#message');
const form=document.querySelector('#composer');
const send=document.querySelector('#send');
const modes=[...document.querySelectorAll('[data-action]')];
const store='manolo-chat-v1';
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
  if(role!=='user'){const icon=document.createElement('img');icon.className='avatar';icon.src='/gpt-icon.jpg';icon.alt='';el.append(icon);}
  const bubble=document.createElement('div');bubble.className='bubble'+(error?' is-error':'');
  formatText(bubble,message);el.append(bubble);feed.append(el);feed.scrollTop=feed.scrollHeight;persist();return el;
}
function persist(){const items=[...feed.querySelectorAll('.message')].slice(-60).map(el=>({role:el.classList.contains('from-user')?'user':'assistant',text:el.querySelector('.bubble')?.dataset?.raw||''})).filter(x=>x.text);try{localStorage.setItem(store,JSON.stringify({sessionId,activeMode,items}));}catch{}}
function setRaw(el,raw){el.querySelector('.bubble').dataset.raw=raw;persist();}
function load(){try{const state=JSON.parse(localStorage.getItem(store)||'null');if(!state||!Array.isArray(state.items)||!state.items.length)return;sessionId=state.sessionId||null;activeMode=state.activeMode||'home';feed.innerHTML='';for(const m of state.items.slice(-60)){if(typeof m.text==='string'){const el=append(m.role==='user'?'user':'assistant',m.text);setRaw(el,m.text);}}setMode(activeMode);}catch{}}
function setMode(mode){activeMode=mode;for(const b of modes)b.setAttribute('aria-pressed',String(b.dataset.action===mode));}
function busy(value){pending=value;send.disabled=value;input.disabled=value;for(const b of modes)b.disabled=value;document.querySelector('#reset').disabled=value;}
async function request(message='',action=''){
  if(pending)return;
  busy(true);
  if(message){const m=append('user',message);setRaw(m,message);}
  const placeholder=append('assistant','Consultando...');setRaw(placeholder,'Consultando...');
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,message,action})});
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
document.querySelector('#reset').addEventListener('click',()=>{if(pending)return;feed.innerHTML=welcome;sessionId=null;setMode('home');try{localStorage.removeItem(store);}catch{}input.focus();});
load();
