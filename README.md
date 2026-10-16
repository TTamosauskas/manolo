# Manolo — Morte Súbita inc.

Chat minimalista de ocultismo baseado **somente** nos artigos públicos de [mortesubita.net](https://mortesubita.net/) para perguntas, explicações e testes. O catálogo anexo `data/mayhem.txt` contém **1.544 URLs de vídeos** e é usado apenas para localizar entrevistas e conteúdos audiovisuais. A aplicação não extrai informações do conteúdo dos vídeos nem consulta outros sites para responder perguntas.

![Logotipo Manolo](public/gpt-icon.jpg)

## Funcionalidades

- **Ensine-me:** pergunta o assunto, recupera artigos, responde com fontes e sugere A/B para aprofundar.
- **Entrevistas:** busca diretamente no catálogo Mayhem, com links reais e páginas de 12 resultados. Digite `mais` para continuar.
- **Teste-me:** três perguntas consecutivas, cinco alternativas A–E, correções explicadas, progressão adaptativa, nota de 1 a 3 e indicação de fontes.
- **Pergunta livre:** pesquisa no índice de artigos do Morte Súbita e responde com referências.
- Conversa sem login, guardada temporariamente no navegador. Ícone original e HTML/CSS/JS sem dependências de interface.
- Proteção por origem, limites por visitante/hora, teto global de chamadas de IA/dia e URLs autorizadas. Nenhuma chave é enviada ao navegador.

## O que está funcionando e o que exige configuração

O código, os testes locais e os **1.544 vídeos** estão preparados. A instalação inclui um **índice inicial limitado de 10 resumos de artigos verificados** (`data/seed.sql`), para permitir testar o fluxo antes da coleta mais ampla. Não afirme que dez resumos equivalem ao conteúdo completo do site. O indexador `scripts/build_index.py` precisa rodar de um computador com acesso à Internet; ele respeita `robots.txt` e não acessa nenhum domínio diferente de `mortesubita.net`. A implementação não foi testada contra uma conta real da Cloudflare neste ambiente.

A interface e as consultas poderão funcionar gratuitamente dentro dos limites de Workers AI e Workers. **Não existe garantia de uso ilimitado**. A conta deve permanecer no plano Free; o backend interrompe chamadas após o teto `MAX_GLOBAL_AI_PER_DAY`.


## GitHub Pages (interface gratuita)

O workflow `.github/workflows/deploy-pages.yml` publica a pasta `public/` junto ao catálogo `data/mayhem.txt` no GitHub Pages. No repositório, vá em **Settings → Pages → Build and deployment → Source: GitHub Actions** e, em **Actions**, execute manualmente o workflow **Publicar Manolo no GitHub Pages** se ele não iniciar automaticamente.

Endereço esperado após o deploy: https://ttamosauskas.github.io/manolo/

**Limitação importante:** o GitHub Pages hospeda apenas os arquivos estáticos. Antes de configurar a API externa, o modo **Entrevistas** funciona por pesquisa local nos títulos de todos os 1.544 vídeos; **Ensine-me**, **Teste-me** e **Fazer pergunta** mostram um aviso claro de indisponibilidade. Não confunda a publicação da interface com a ativação da IA.

Depois de instalar o backend Worker/D1, edite `public/config.js` para definir `window.MANOLO_API_URL` com a URL completa HTTPS da rota `/api/chat` do Worker; a URL é pública e não é segredo. O Worker permite o acesso CORS de `https://ttamosauskas.github.io` por padrão, alterável pela variável `PAGES_ORIGIN`. Nunca coloque chaves no JavaScript público. Um push na branch `main` publicará a mudança no Pages automaticamente se estiver habilitado.

## Implantação na Cloudflare

Pré-requisitos: conta gratuita na Cloudflare, Node.js 22+, Python 3.10+, CLI Wrangler e terminal com acesso à Internet. Não é necessário comprar domínio.

1. No diretório do projeto: `npm install` e `npx wrangler login`.
2. Crie o banco: `npx wrangler d1 create manolo-db`.
3. Copie o `database_id` retornado para `wrangler.jsonc`, substituindo `COLOQUE_AQUI_O_ID_DO_SEU_BANCO`.
4. Crie um segredo aleatório e privado com `npx wrangler secret put ACCESS_SALT` (digite uma string longa e aleatória, não a inclua no GitHub). O segredo protege as identificações efêmeras usadas nos limites de consulta.
5. Aplique o esquema: `npx wrangler d1 migrations apply manolo-db --remote`.
6. Importe as 10 fontes iniciais: `npx wrangler d1 execute manolo-db --remote --file data/seed.sql`.
7. Importe os **16 lotes** do catálogo: `for f in imports/videos_*.sql; do npx wrangler d1 execute manolo-db --remote --file "$f"; done` (macOS/Linux). No PowerShell: `Get-ChildItem imports/videos_*.sql | ForEach-Object { npx wrangler d1 execute manolo-db --remote --file $_.FullName }`.
8. Rode `npm run deploy` e abra o endereço `*.workers.dev` fornecido pela Cloudflare.

Teste `/api/health` depois da publicação. Os botões Entrevistas funcionarão assim que o catálogo estiver importado; as respostas da IA exigem binding de Workers AI e franquia disponível.

### Ampliar o acervo de artigos

Execute localmente, fora do ambiente de deploy:

```bash
python scripts/build_index.py articles --limit 40 --delay 2
for f in imports/articles_*.sql; do npx wrangler d1 execute manolo-db --remote --file "$f"; done
```

Depois é possível usar `--limit 400`, monitorando carga, duplicações e regras de uso do site. Para artigos específicos:

```bash
python scripts/build_index.py articles --url https://mortesubita.net/os-sete-principios-hermeticos-caibalion/
```

O script consulta **somente o domínio autorizado**, exige `robots.txt` acessível, respeita suas diretivas, acessa URLs publicadas em sitemap, rejeita redirecionamentos externos e espera no mínimo um segundo entre páginas de artigos. Se o site bloquear a coleta, **não contorne o bloqueio**; será necessário obter acesso autorizado ou importar material disponibilizado pela administração. Não redistribua o texto integral do site nem conteúdo de assinantes.

**Importante:** execute o import dos resumos iniciais apenas uma vez, antes da indexação ampliada. Reexecutá-lo depois sobrescreveria os dez artigos correspondentes com seus resumos curtos.

## Desenvolvimento e testes

```bash
npm test
python -m unittest discover -s tests -p '*test.py' -v
```

Os testes de integração simulam D1 usando SQLite e simulam o modelo de IA, sem chamadas pagas nem scraping. Não constituem teste de conexão real à Cloudflare.

A execução remota de `wrangler dev --remote` usa recursos reais da conta; mesmo em desenvolvimento pode consumir a cota gratuita de Workers AI.

## Estrutura

- `public/`: página de chat, CSS, JS, ícone original e favicon.
- `src/worker.js`: API, estados da conversa, pesquisa FTS5, criação de questões, controles de quota.
- `data/mayhem.txt`: catálogo de URLs recebido como anexo.
- `data/seed.sql`: dez resumos iniciais com links reais do site.
- `imports/`: 16 lotes SQL com 1.544 vídeos, prontos para D1.
- `migrations/`: tabelas, índices FTS5 e gatilhos de atualização.
- `scripts/build_index.py`: importador de vídeos e coletor de artigos limitado ao domínio.
- `tests/`: testes de funções e integrações com simuladores.

## Limitações conhecidas

- O conjunto inicial tem só dez resumos. Perguntas fora dele retornarão ausência de material até a indexação maior.
- A pesquisa é textual por FTS5. Sinônimos incomuns podem não retornar resultados até adicionar expansão de consulta.
- Questões são produzidas por IA e validadas quanto ao formato, mas ainda podem exigir revisão humana quanto à exatidão pedagógica. Antes de uso educacional importante, implemente um banco editorial revisado de questões.
- A qualidade da extração depende da estrutura HTML e das permissões do WordPress do Morte Súbita.
- O site não é um substituto de fontes acadêmicas, médicas ou científicas. Crenças são tratadas como crenças e vinculadas a artigos.
- Sem domínio personalizado, o endereço do site terá o sufixo `workers.dev`.

## Fontes técnicas

- [Gemma 4 no Workers AI](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)
- [Bindings Workers AI](https://developers.cloudflare.com/workers-ai/configuration/bindings/)
- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Preços e limites gratuitos](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)

Código livre para personalização. Direitos dos artigos e materiais de origem permanecem com seus respectivos titulares.
