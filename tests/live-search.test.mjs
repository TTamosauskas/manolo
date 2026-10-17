import test from 'node:test';
import assert from 'node:assert/strict';
import {searchWords,textFromWordPress,robotsPermits,relevanceScore,liveArticles,surpriseArticle} from '../src/live-search.js';

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

test('Bolo de Luz: descarta fontes incidentais e mantém múltiplos artigos úteis',async()=>{
  assert.deepEqual(searchWords('O que é o bolinho de luz?'),['bolo','luz']);
  assert.ok(relevanceScore('Receita do Bolo de Luz e outras Porras','Receita ritual de bolo de luz.',['bolo','luz'])>=90);
  assert.ok(relevanceScore('Segundo artigo sobre Bolo de Luz','Bolo de luz e seus usos.',['bolo','luz'])>=90);
  assert.equal(relevanceScore('William Lilly e a Astrologia Cristã','O astrólogo viu a luz.',['bolo','luz']),0);
  assert.ok(relevanceScore('O doce de Cosme Damião','Em festas se fala de bolo e, em outro capítulo distante, de luz.',['bolo','luz'])<90);
  const mock=(value)=>({ok:true,status:200,json:async()=>value});
  const items=[
    {id:1,title:'Receita do Bolo de Luz',url:'https://mortesubita.net/receita-do-bolo-de-luz/',type:'post'},
    {id:2,title:'Bolo de Luz na Missa Gnóstica',url:'https://mortesubita.net/bolo-de-luz-na-missa-gnostica/',type:'post'},
    {id:3,title:'William Lilly e a Astrologia Cristã',url:'https://mortesubita.net/william-lilly/',type:'post'},
    {id:4,title:'O doce de Cosme Damião',url:'https://mortesubita.net/o-doce/',type:'post'}
  ];
  const bodies={
    1:'<p>Receita ritual do Bolo de Luz para tradições thelemitas e suas aplicações.</p>'.repeat(7),
    2:'<p>O Bolo de Luz é utilizado em celebrações de distintas tradições mágicas.</p>'.repeat(7),
    3:'<p>William Lilly estudou astrologia cristã na Inglaterra em muitos textos históricos.</p>'.repeat(7),
    4:'<p>O bolo faz parte das tradições festivas e doações. Outras festividades ocorrem sob a luz do sol.</p>'.repeat(7)
  };
  const request=async url=>{
    if(url.includes('/search?'))return mock(items);
    const id=Number(url.match(/\/posts\/(\d+)/)?.[1]);
    const item=items.find(i=>i.id===id);
    if(item)return mock({status:'publish',link:item.url,title:{rendered:item.title},content:{rendered:bodies[id]}});
    throw Error('unexpected '+url);
  };
  const result=await liveArticles('O que é o bolinho de luz?',{request,checkRobots:false});
  assert.equal(result.status,'ok');
  assert.equal(result.rows.length,2);
  assert.deepEqual(result.rows.map(x=>x.url),items.slice(0,2).map(x=>x.url));
});
test('Demiurgo: aceita várias fontes realmente pertinentes',()=>{
  assert.ok(relevanceScore('Yaldabaoth, o Demiurgo no Gnosticismo','', ['demiurgo'])>0);
  assert.ok(relevanceScore('A Origem e a Evolução do Demiurgo','', ['demiurgo'])>0);
});

test('Surpreenda-me seleciona artigo WordPress com fonte validada',async()=>{
 const mock=(items,pages)=>({ok:true,headers:{get:()=>String(pages)},json:async()=>items});
 const urls=[];
 const request=async url=>{
   urls.push(url);
   const page=Number(new URL(url).searchParams.get('page'));
   if(page===1)return mock([{status:'publish',link:'https://mortesubita.net/artigo-a/',title:{rendered:'Artigo A'},content:{rendered:'Conteúdo histórico de ocultismo. '.repeat(20)}}],9);
   if(page===5)return mock([{status:'publish',link:'https://mortesubita.net/artigo-b/',title:{rendered:'Artigo B'},content:{rendered:'Tradição esotérica e estudos simbólicos. '.repeat(20)}}],9);
   throw Error('unexpected page');
 };
 const r=await surpriseArticle({request,checkRobots:false,random:()=>0.5});
 assert.equal(r.status,'ok');
 assert.equal(r.row.title,'Artigo B');
 assert.equal(r.row.url,'https://mortesubita.net/artigo-b/');
 assert.ok(urls.every(x=>x.startsWith('https://mortesubita.net/')));
 const fallback=await surpriseArticle({request,checkRobots:false,random:()=>0.5,exclude:['https://mortesubita.net/artigo-b/']});
 assert.equal(fallback.status,'empty');
});
test('Surpreenda-me rejeita URL externa e falha sem acesso público',async()=>{
 const request=async()=>({ok:true,headers:{get:()=>1},json:async()=>[{status:'publish',link:'https://site-externo.example/',title:{rendered:'Artigo Externo'},content:{rendered:'Texto qualquer. '.repeat(30)}}]});
 assert.equal((await surpriseArticle({request,checkRobots:false,random:()=>0})).status,'empty');
});
