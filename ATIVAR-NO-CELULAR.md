# Manolo: ativar gratuitamente pelo celular

O instalador cuida do banco D1, catálogo Mayhem, modelo Gemma 4, segredo interno, backend e conexão com GitHub Pages. Você não precisa instalar programas ou usar terminal.

## 1. Conta Cloudflare

Abra https://dash.cloudflare.com/sign-up e crie uma conta gratuita. Não compre domínio nem contrate planos pagos.

No painel Workers & Pages, copie o Account ID (não o Zone ID). Também é possível usar a busca do painel com a expressão Copy account ID.

## 2. Token para o instalador

Na Cloudflare, entre em Manage Account > API Tokens (ou My Profile > API Tokens) e crie um token personalizado para a sua conta.

O token precisa ter autorização para criar/editar Workers e criar/editar D1. Na interface nova, use Workers (produto) com papel Admin e D1 (produto) com papel Admin, restringindo os recursos à sua conta. Na interface antiga, procure Account: Workers Scripts Edit e D1 Write/Edit. Não use Global API Key nem conceda permissões de DNS.

Guarde o token: ele será exibido somente uma vez. Nunca envie o token por chat nem o coloque em arquivos públicos.

## 3. Dois segredos no GitHub

Abra https://github.com/TTamosauskas/manolo/settings/secrets/actions e selecione New repository secret. Crie os dois segredos a seguir:

1. CLOUDFLARE_ACCOUNT_ID — valor: seu Account ID da Cloudflare.
2. CLOUDFLARE_API_TOKEN — valor: seu token de API da Cloudflare.

Os nomes são públicos, mas os valores devem ficar armazenados somente na área privada de segredos do GitHub.

## 4. Ativar GitHub Pages

Abra https://github.com/TTamosauskas/manolo/settings/pages.

Em Build and deployment, escolha Source = GitHub Actions. Se já estiver selecionado, não altere.

## 5. Executar instalador

Abra https://github.com/TTamosauskas/manolo/actions/workflows/deploy-backend.yml.

Escolha Run workflow, branch main e confirme. Aguarde a conclusão da execução Ativar backend Manolo (Cloudflare).

Se ficar verde, o backend foi implantado, verificado e conectado automaticamente ao arquivo public/config.js. O fluxo também solicita uma nova publicação do GitHub Pages.

Abra https://github.com/TTamosauskas/manolo/actions/workflows/deploy-pages.yml, verifique se a execução ficou verde. Se não tiver iniciado, use Run workflow.

## 6. Testar

Acesse https://ttamosauskas.github.io/manolo/.

Teste Entrevistas com alquimia. Depois teste Ensine-me com hermetismo ou outro dos dez assuntos indexados inicialmente. O teste completo da IA só estará disponível quando a Cloudflare realmente aceitar a implantação.

## Instalador atualizado

Se a primeira tentativa passou da autenticação e das migrações, mas falhou com mensagem sobre BEGIN TRANSACTION, reexecute depois de atualizar o repositório: os arquivos SQL foram corrigidos e o banco será reutilizado automaticamente. Não é necessário emitir um novo token.

## Se ocorrer erro

- Segredos ausentes: revise os nomes exatos do passo 3.
- Erro 403 da Cloudflare: confira escopo e permissões de Workers e D1, sem publicar o token.
- Get Pages site failed: ative GitHub Pages conforme o passo 4.
- Mensagem de artigo não encontrado: apenas dez resumos vêm instalados; o acervo integral precisa ser indexado separadamente com autorização do site.
- Cota da IA atingida: aguarde a renovação gratuita. Não ative plano pago.

O banco de dados será reutilizado em execuções posteriores. Os dez resumos iniciais não sobrescreverão textos completos que forem adicionados depois. O segredo interno ACCESS_SALT é criado automaticamente e preservado quando já existe.

ATENÇÃO: o workflow pode ser executado mais de uma vez, mas não significa gratuidade ilimitada. Nunca cole o token Cloudflare em issues, commits ou mensagens.
