import test from 'node:test';
import assert from 'node:assert/strict';
import {searchWords,textFromWordPress,robotsPermits,liveArticles} from '../src/live-search.js';

test('usa a palavra importante de uma pergunta',()=>{
  assert.deepEqual(searchWords('Quem é o Demiurgo?'),['demiurgo']);
  assert.deepEqual(searchWords('Me fale sobre a origem do demiurgo no gnosticismo'),['origem','demiurgo','gnosticismo']);
});
test('limpa o corpo do WordPress preservando português e entidades',()=>{
  const html='<p>O Demiurgo &#233; chamado &quot;artífice&quot;.</p><script>IGNORAR</script><p>No gnosticismo, cria coisas.</p>';
  const t=textFromWordPress(html);
  assert.match(t,/Demiurgo é chamado "artífice"/);
  assert.match(t,/cria coisas/);
  assert.doesNotMatch(t,/IGNORAR/);
});
test('respeita robots e caminhos proibidos',()=>{
  assert.equal(robotsPermits('User-agent: *\nDisallow:\n','/wp-json/wp/v2/search'),true);
  assert.equal(robotsPermits('User-agent: *\nDisallow: /wp-json/\n','/wp-json/wp/v2/search'),false);
  assert.equal(robotsPermits('User-agent: *\nDisallow: /\nAllow: /wp-json/\n','/wp-json/wp/v2/search'),true);
});
test('busca ao vivo pelo termo e obtém texto + URLs sem buscar domínios externos',async()=>{
  const requested=[];
  const make=(value)=>({ok:true,status:200,json:async()=>value});
  const request=async (url)=>{
    requested.push(url);
    if(url.includes('/search?'))return make([{id:21538,title:'Yaldabaoth, o Demiurgo no Gnosticismo',url:'https://mortesubita.net/yaldabaoth-o-demiurgo-no-gnosticismo/',type:'post'},
      {id:999,title:'Externo',url:'https://evil.example/fora/',type:'post'}]);
    if(url.includes('/posts/21538'))return make({id:21538,status:'publish',title:{rendered:'Yaldabaoth, o Demiurgo no Gnosticismo'},link:'https://mortesubita.net/yaldabaoth-o-demiurgo-no-gnosticismo/',content:{rendered:'<p>O Demiurgo é tratado neste artigo como figura de diferentes tradições gnósticas.</p>'.repeat(7)}});
    throw Error('unexpected URL: '+url);
  };
  const answer=await liveArticles('Quem é o Demiurgo?',{request,checkRobots:false});
  assert.equal(answer.status,'ok');
  assert.equal(answer.rows.length,1);
  assert.match(answer.rows[0].body,/gnósticas/);
  assert.equal(answer.rows[0].url,'https://mortesubita.net/yaldabaoth-o-demiurgo-no-gnosticismo/');
  assert.equal(requested.length,2);
  assert.ok(requested.every(x=>x.startsWith('https://mortesubita.net/')));
});
test('WordPress indisponível informa falha para permitir fallback local',async()=>{
  const r=await liveArticles('Demiurgo',{checkRobots:false,request:async()=>{throw Error('timeout')}});
  assert.equal(r.status,'unavailable');assert.deepEqual(r.rows,[]);
});
