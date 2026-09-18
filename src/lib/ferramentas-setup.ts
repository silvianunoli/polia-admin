// Runbook das 14 ferramentas externas do projeto, extraído de
// SETUP-FERRAMENTAS-EXTERNAS.md (raiz do workspace). Fonte única: lido pela
// página /ferramentas e injetado no board /estrategico por
// boards.functions.ts, pra não existirem duas cópias que divergem.
//
// O texto traz marcação inline (<code>, <b>, links) que veio do markdown; é
// conteúdo versionado neste repo, nunca entrada de usuária. Nenhum segredo
// real mora aqui, só onde cada um vive.

// Um bloco "ol" é uma lista numerada de passos (cada passo pode ter um trecho
// de comando); "ul" é lista de armadilhas; "p" é parágrafo; "h4" é subtítulo
// dentro do passo a passo (ex.: "do zero", "Gemini").
export type BlocoPassos = { tipo: "ol"; itens: { texto: string; code: string | null }[] };
export type BlocoLista = { tipo: "ul"; itens: string[] };
export type BlocoTexto = { tipo: "p" | "h4" | "code"; html: string };
export type Bloco = BlocoPassos | BlocoLista | BlocoTexto;

export interface FerramentaSetup {
  id: string;
  nome: string;
  oQueE: string;
  passos: Bloco[];
  armadilhas: Bloco[];
}

export const FERRAMENTAS_SETUP: FerramentaSetup[] = [
  {
    id: "1",
    nome: "Cloudflare Workers (hospedagem e deploy)",
    oQueE:
      "Onde o <code>polia-app</code> e o <code>polia-admin</code> rodam em produção. Cada um é um Worker\nseparado, com domínio próprio.",
    passos: [
      {
        tipo: "h4",
        html: "do zero",
      },
      {
        tipo: "ol",
        itens: [
          {
            texto: "Crie conta em <code>dash.cloudflare.com</code>.",
            code: null,
          },
          {
            texto:
              "Instale a CLI: <code>npm install -g wrangler</code> (o projeto já traz <code>wrangler</code> como devDependency, então dentro do repo basta <code>npx wrangler</code>).",
            code: null,
          },
          {
            texto: "Autentique: <code>npx wrangler login</code>, abre o navegador pra confirmar.",
            code: null,
          },
          {
            texto:
              "No <code>wrangler.jsonc</code> do projeto, confirme o <code>name</code> do Worker e a seção <code>routes</code>:",
            code: '"routes": [\n { "pattern": "usepolia.com.br", "custom_domain": true },\n { "pattern": "www.usepolia.com.br", "custom_domain": true }\n]',
          },
          {
            texto:
              "Configure os secrets, um por um: <code>npx wrangler secret put SUPABASE_URL</code> (repete pra cada variável que o Worker precisa).",
            code: null,
          },
          {
            texto: "Deploy: <code>npm run build &amp;&amp; npx wrangler deploy</code>.",
            code: null,
          },
          {
            texto:
              "No painel Cloudflare, DNS do domínio (<code>usepolia.com.br</code>) precisa apontar pro Worker — o <code>custom_domain: true</code> no <code>wrangler.jsonc</code> provisiona o registro sozinho no primeiro deploy.",
            code: null,
          },
        ],
      },
    ],
    armadilhas: [
      {
        tipo: "ul",
        itens: [
          "<code>wrangler.jsonc</code> precisa ficar <b>minimalista de propósito</b> (name + compatibility + observability). O Nitro (build tool do TanStack Start) gera o resto via <code>dist/server/wrangler.json</code>; definir <code>main</code>/<code>assets</code>/<code>base_dir</code> manualmente quebra os paths.",
          "<code>nitro: true</code> é <b>obrigatório</b> no <code>vite.config.ts</code> fora de ambiente Lovable, senão dependências como <code>h3-v2</code> ficam como bare import e o Worker quebra só em runtime, não em build.",
          "Trocar de domínio custom (cutover) não sincroniza só com <code>wrangler deploy</code> normal — precisa de <code>wrangler triggers deploy</code> pra desanexar/anexar a rota. Deploy do dia a dia não precisa disso.",
          "O Cloudflare só <b>retém os últimos 10 deploys por Worker</b> em <code>wrangler deployments list</code>. Não existe histórico de deploy mais antigo pra consultar depois disso.",
          "Deploy automático a cada push exige <code>CLOUDFLARE_API_TOKEN</code> como secret no repositório GitHub (ver seção GitHub). Sem isso, todo deploy é manual.",
        ],
      },
    ],
  },
  {
    id: "2",
    nome: "Cloudflare Turnstile (anti-bot)",
    oQueE:
      "CAPTCHA invisível nos formulários públicos (<code>/contato</code>, <code>/lista-de-espera</code>).",
    passos: [
      {
        tipo: "ol",
        itens: [
          {
            texto: "No painel Cloudflare, vá em <b>Turnstile</b> → <b>Add site</b>.",
            code: null,
          },
          {
            texto:
              "Domínio: <code>usepolia.com.br</code>. Modo: gerenciado (managed), não invisível puro nem sempre-visível.",
            code: null,
          },
          {
            texto:
              "Copie a <b>Site Key</b> (pública, vai no front) e a <b>Secret Key</b> (privada, valida no back).",
            code: null,
          },
          {
            texto: "Site Key entra direto no componente do widget no front-end.",
            code: null,
          },
          {
            texto:
              "Secret Key vira secret do Worker: <code>npx wrangler secret put TURNSTILE_SECRET_KEY</code>.",
            code: null,
          },
          {
            texto:
              "No servidor, a validação chama <code>https://challenges.cloudflare.com/turnstile/v0/siteverify</code> com a Secret Key + o token que o widget gerou.",
            code: null,
          },
        ],
      },
    ],
    armadilhas: [
      {
        tipo: "p",
        html: "o token do Turnstile é de <b>uso único</b>. A validação precisa acontecer só no servidor; o cliente só checa se o token existe antes de habilitar o botão de envio, nunca tenta validar ele mesmo. Este projeto usa a skill <code>turnstile-spin</code> pra automatizar esse setup — ela cria o widget via API e já deixa o Worker de <code>siteverify</code> pronto.",
      },
    ],
  },
  {
    id: "3",
    nome: "Cloudflare Email Routing",
    oQueE:
      "Roteamento de e-mail do domínio <code>usepolia.com.br</code> (ex.: <code>naoresponda@usepolia.com.br</code>)\npro Resend enviar em nome desse remetente.",
    passos: [
      {
        tipo: "ol",
        itens: [
          {
            texto: "No painel Cloudflare, domínio → <b>Email</b> → <b>Email Routing</b>.",
            code: null,
          },
          {
            texto:
              "Ative, e adicione os registros DNS que a Cloudflare sugerir automaticamente (MX e TXT de verificação SPF).",
            code: null,
          },
          {
            texto:
              "Configure o remetente <code>naoresponda@usepolia.com.br</code> como endereço válido.",
            code: null,
          },
          {
            texto:
              "No Resend (seção 6), adicione <code>usepolia.com.br</code> como domínio verificado, seguindo os registros DKIM que o Resend pedir — são adicionados no mesmo painel de DNS da Cloudflare.",
            code: null,
          },
        ],
      },
    ],
    armadilhas: [],
  },
  {
    id: "4",
    nome: "Supabase (banco de dados e autenticação)",
    oQueE: "Postgres + Auth + Storage + Edge Functions. Projeto <code>egzwkyqpkexgrhbxwcvb</code>.",
    passos: [
      {
        tipo: "h4",
        html: "do zero",
      },
      {
        tipo: "ol",
        itens: [
          {
            texto: "Crie conta em <code>supabase.com</code>, novo projeto.",
            code: null,
          },
          {
            texto:
              "Anote a <b>Project URL</b> e a <b>anon/publishable key</b> — viram <code>SUPABASE_URL</code> e <code>SUPABASE_PUBLISHABLE_KEY</code> nos secrets do Worker.",
            code: null,
          },
          {
            texto:
              "A <b>service role key</b> nunca vai pro client, só pro servidor (edge functions, ou secret do Worker se o Worker precisar dela pra alguma rotina admin).",
            code: null,
          },
          {
            texto:
              "Rode as migrations em ordem: <code>supabase/migrations/*.sql</code>, via CLI (<code>supabase db push</code>) ou via MCP (<code>apply_migration</code>, uma por vez).",
            code: null,
          },
          {
            texto:
              "Ative Row Level Security em <b>toda tabela com dado de usuária</b>, com policy <code>auth.uid() = user_id</code> como padrão. Tabela sem policy nenhuma fica deny-all por padrão do Postgres, mas confirme explicitamente.",
            code: null,
          },
          {
            texto:
              "Em Authentication → Providers, ative Email e Google (ver seção 7 pro lado Google).",
            code: null,
          },
          {
            texto:
              "Em Authentication → Rate Limits, configure o limite de tentativas de login. <b>Este passo ficou pendente neste projeto até hoje</b> — não pule.",
            code: null,
          },
          {
            texto:
              'Se for usar Auth Hooks (bloqueio de signup sem convite, por exemplo): Authentication → Hooks → "Before User Created", aponta pra uma function Postgres.',
            code: null,
          },
        ],
      },
    ],
    armadilhas: [
      {
        tipo: "ul",
        itens: [
          "<code>supabase db push</code> pode falhar por <b>dessincronia pré-existente do histórico de migração</b> (timestamps que não batem entre nome de arquivo local e o que o banco registrou como aplicado). <b>Nunca rode <code>supabase migration repair</code></b> com a lista gigante que o CLI sugere corrigir — o schema real está correto, é só bookkeeping desatualizado. Prefira aplicar migration nova via MCP <code>apply_migration</code>, que não depende desse histórico. Se estiver rodando localmente com filesystem/shell: use a CLI (<code>supabase start</code>, <code>supabase db push</code>, <code>supabase functions serve</code>) pra desenvolvimento local — ela cobre esse fluxo melhor que o MCP, que é pensado pra ambiente remoto.",
          'Projeto Supabase <b>pausa sozinho por inatividade</b> no plano gratuito, e volta a dar erro de "tenant not found" no connection pooler até reativar manualmente no painel.',
          "Conexão direta via <code>psql</code>/<code>pg</code> (fora do MCP) usa <code>db.&lt;project-ref&gt;.supabase.co:5432</code>, usuário <code>postgres</code>, senha do painel — só funciona com o projeto ativo.",
          "<code>leaked-password protection</code> é recurso do <b>plano Pro</b>, não do Free. Decidir conscientemente não pagar por isso ainda é uma decisão válida, não é bug pendente — mas registre a decisão em algum lugar (este projeto registra em memória de projeto).",
        ],
      },
    ],
  },
  {
    id: "5",
    nome: "Stripe (pagamento e assinatura)",
    oQueE: "Checkout e cobrança recorrente dos planos Confere/Controle/Projete.",
    passos: [
      {
        tipo: "ol",
        itens: [
          {
            texto: "Crie conta em <code>dashboard.stripe.com</code>.",
            code: null,
          },
          {
            texto:
              "Em modo <b>Test</b> primeiro (nunca comece direto em Live): crie os produtos e preços correspondentes aos planos pagos.",
            code: null,
          },
          {
            texto:
              "Anote os <code>price_id</code> de cada plano — viram variáveis de ambiente (<code>CFG-04</code> deste projeto: confirmar quais ainda faltam).",
            code: null,
          },
          {
            texto:
              "Configure o webhook: Developers → Webhooks → Add endpoint, apontando pra <code>https://usepolia.com.br/api/stripe-webhook</code> (ou a edge function equivalente). Eventos mínimos: <code>checkout.session.completed</code>, <code>customer.subscription.updated</code>, <code>customer.subscription.deleted</code>, <code>invoice.payment_failed</code>.",
            code: null,
          },
          {
            texto:
              "Copie o <b>Webhook Signing Secret</b> (<code>whsec_...</code>) e coloque como secret do Worker/edge function — o handler usa ele pra verificar que o evento realmente veio do Stripe.",
            code: null,
          },
          {
            texto:
              "Teste o fluxo inteiro em modo Test com os cartões de teste do Stripe antes de ativar Live.",
            code: null,
          },
          {
            texto:
              "Só depois de validar: ative <b>modo Live</b>, repita a criação de produtos/preços (Test e Live são catálogos separados), e troque as chaves e o webhook secret pelas versões Live.",
            code: null,
          },
        ],
      },
    ],
    armadilhas: [
      {
        tipo: "ul",
        itens: [
          "Uma vez em modo Live, <b>qualquer teste de checkout gera cobrança real</b>. O projeto está em Live hoje e o caminho de pagamento nunca foi testado ponta a ponta por esse exato motivo — é um item de risco aberto, não descuido.",
          "O webhook precisa ser <b>idempotente</b>: um evento pode chegar duplicado. Este projeto deduplica por <code>event.id</code> numa tabela própria antes de processar.",
          "Nunca gere senha temporária em texto puro no fluxo de checkout público. O padrão aqui é link de ativação com expiração (<code>generateLink type: invite</code> do Supabase).",
        ],
      },
    ],
  },
  {
    id: "6",
    nome: "Resend (e-mail transacional)",
    oQueE: "Envio dos e-mails da Pólia (confirmação de conta, boas-vindas, recibo, etc).",
    passos: [
      {
        tipo: "ol",
        itens: [
          {
            texto: "Crie conta em <code>resend.com</code>.",
            code: null,
          },
          {
            texto:
              "Adicione o domínio <code>usepolia.com.br</code> em Domains, e configure os registros DKIM/SPF que o Resend mostrar no DNS da Cloudflare (seção 3).",
            code: null,
          },
          {
            texto: "Aguarde a verificação do domínio (pode levar minutos a horas propagando DNS).",
            code: null,
          },
          {
            texto: "Gere uma <b>API Key</b> em API Keys → Create.",
            code: null,
          },
          {
            texto:
              "Configure como secret do Worker: <code>npx wrangler secret put RESEND_API_KEY</code>.",
            code: null,
          },
          {
            texto:
              'Teste enviando um e-mail de verdade antes de considerar pronto — não confie só em "a chave está configurada", confirme que um e-mail de teste chegou.',
            code: null,
          },
        ],
      },
    ],
    armadilhas: [
      {
        tipo: "p",
        html: '<code>RESEND_API_KEY</code> nunca foi configurada no Worker de produção desde o início do projeto até 2026-08-12. <b>Todo e-mail transacional falhava calado</b> — sem erro visível na tela, sem alerta, meses de e-mail de confirmação de conta nunca saindo. A causa raiz só apareceu quando alguém foi verificar manualmente. <b>Lição pro checklist de qualquer setup novo: depois de configurar um secret, envie um e-mail de teste de verdade e confirme que chegou. Nunca assuma que "configurado" significa "funcionando."</b>',
      },
    ],
  },
  {
    id: "7",
    nome: "Google Cloud Console (OAuth, Calendar, Gemini)",
    oQueE:
      "Três coisas debaixo do mesmo projeto Google Cloud: login social, integração com\nGoogle Calendar, e a API do Gemini pra geração de conteúdo por IA.",
    passos: [
      {
        tipo: "h4",
        html: "OAuth (login social + Calendar)",
      },
      {
        tipo: "ol",
        itens: [
          {
            texto: "Crie um projeto em <code>console.cloud.google.com</code>.",
            code: null,
          },
          {
            texto:
              "APIs & Services → OAuth consent screen: preencha nome do app, domínio, e-mail de suporte.",
            code: null,
          },
          {
            texto:
              "Enquanto o app estiver em <b>Testing</b>, adicione manualmente cada conta de teste em Audience → Test users, senão o login retorna <code>403 access_denied</code>.",
            code: null,
          },
          {
            texto:
              "Credentials → Create Credentials → OAuth client ID → Web application. Adicione a URL de redirect que o Supabase Auth pedir (painel Supabase → Authentication → Providers → Google mostra a URL exata).",
            code: null,
          },
          {
            texto:
              "Copie <b>Client ID</b> e <b>Client Secret</b>, cole no painel Supabase → Authentication → Providers → Google.",
            code: null,
          },
          {
            texto:
              'Pra Google Calendar especificamente: APIs & Services → Library → ative "Google Calendar API". O escopo usado é <code>calendar.readonly</code>.',
            code: null,
          },
          {
            texto:
              "Quando estiver pronto pra todo mundo (não só test users): OAuth consent screen → Publish App → Confirm. Preencha Branding (home page, link de privacidade e termos) antes de publicar.",
            code: null,
          },
        ],
      },
      {
        tipo: "h4",
        html: "Gemini",
      },
      {
        tipo: "ol",
        itens: [
          {
            texto:
              'No mesmo projeto Google Cloud (ou um dedicado), ative a API "Generative Language API".',
            code: null,
          },
          {
            texto:
              "Gere uma API key em <code>aistudio.google.com/apikey</code> (mais simples que passar pelo console de API key do Cloud diretamente).",
            code: null,
          },
          {
            texto: "Secret do Worker: <code>npx wrangler secret put GEMINI_API_KEY</code>.",
            code: null,
          },
          {
            texto:
              "Sem essa chave, funcionalidades de IA <b>somem silenciosamente</b> — não dão erro visível, só não aparecem. Teste gerando algo de verdade depois de configurar.",
            code: null,
          },
        ],
      },
    ],
    armadilhas: [
      {
        tipo: "ul",
        itens: [
          "<code>calendar.readonly</code> <b>não é escopo sensível/restrito</b> pra classificação atual do Google — publicar o app não entra em fila de revisão manual, fica em produção na hora. Isso pode mudar se o projeto pedir escopos mais invasivos no futuro (escrita no calendário, por exemplo).",
          "Testing vs. Production são dois modos com comportamento de allowlist bem diferente: em Testing, só quem está em Test users consegue logar; publicar resolve isso pra qualquer usuária.",
          "Login social (Supabase Auth) e Google Calendar OAuth são <b>fluxos separados</b>, mesmo usando o mesmo projeto Google Cloud — não confunda as duas integrações.",
        ],
      },
    ],
  },
  {
    id: "8",
    nome: "Magnific (geração de imagem por IA)",
    oQueE:
      "API usada pelo gerador de imagem do Estúdio (módulo social). Freepik e Magnific\ncompartilham a mesma API neste contexto.",
    passos: [
      {
        tipo: "ol",
        itens: [
          {
            texto: "Crie conta na plataforma Magnific/Freepik API.",
            code: null,
          },
          {
            texto: "Gere a API key no painel de desenvolvedor.",
            code: null,
          },
          {
            texto:
              "Configure como secret de Edge Function no Supabase (Dashboard → Edge Functions → Secrets, projeto <code>egzwkyqpkexgrhbxwcvb</code>): <code>MAGNIFIC_API_KEY</code>.",
            code: null,
          },
          {
            texto:
              'Opcional: <code>AIMER_CHARACTER_ID</code> — sem ele, o botão "Gerar com a Aimer" simplesmente não aparece na interface (não é erro, é feature condicional).',
            code: null,
          },
          {
            texto:
              'Teste gerando uma imagem de verdade. Sem a chave configurada, a ação responde com erro amigável ("Sem crédito pra gerar imagem agora") em vez de quebrar — comportamento intencional, mas ainda assim confirme que funciona de verdade depois de configurar.',
            code: null,
          },
        ],
      },
    ],
    armadilhas: [
      {
        tipo: "p",
        html: "<b>Nota:</b> prompts de geração de imagem com texto/tipografia devem pedir texto em\nportuguês explicitamente — o modelo tende a gerar em inglês por padrão se não for instruído.\n\n---",
      },
    ],
  },
  {
    id: "9",
    nome: "Meta for Developers (Instagram Graph API)",
    oQueE:
      "Base do agendador de posts do Instagram e do bot de resposta por DM (este último em\nstandby).",
    passos: [
      {
        tipo: "ol",
        itens: [
          {
            texto: "Crie um app em <code>developers.facebook.com</code>.",
            code: null,
          },
          {
            texto:
              'Adicione o produto "Instagram Graph API" (não a API de Instagram Basic Display, que é diferente e mais limitada).',
            code: null,
          },
          {
            texto: "Conecte a conta Instagram Business/Creator vinculada a uma Página do Facebook.",
            code: null,
          },
          {
            texto:
              "Gere um token de acesso de longa duração (long-lived token), e configure a renovação automática antes de expirar — este projeto tem uma edge function dedicada (<code>social-token-renovar</code>) exatamente pra isso.",
            code: null,
          },
          {
            texto:
              "Pra receber webhooks de comentário (necessário pro bot de DM): App → Webhooks → configure a URL da edge function <code>ig-webhook</code>, e <b>assine explicitamente o campo <code>comments</code></b> nos tópicos do webhook do Instagram.",
            code: null,
          },
          {
            texto:
              "Submeta o app pra revisão da Meta se for usar permissões além do básico de teste (necessário pra sair do modo desenvolvimento e funcionar pra contas fora da lista de testadores).",
            code: null,
          },
        ],
      },
    ],
    armadilhas: [
      {
        tipo: "p",
        html: "o webhook <code>ig-webhook</code> está deployado e ativo, mas <b>não recebe nenhum evento</b> quando alguém comenta a palavra-gatilho num post real — nem tentativa, nem erro nos logs. A suspeita não confirmada é que o campo <code>comments</code> não está de fato inscrito na assinatura do webhook (passo 5 acima), mesmo que a URL esteja correta. <b>Ao configurar isso do zero, confirme a assinatura do campo explicitamente no painel do app, não assuma que configurar a URL do webhook é suficiente.</b>",
      },
    ],
  },
  {
    id: "10",
    nome: "GitHub (repositório e CI/CD)",
    oQueE:
      "Hospedagem dos dois repositórios (<code>polia-app</code>, <code>polia-admin</code>) e, quando configurado,\ndeploy automático a cada push.",
    passos: [
      {
        tipo: "ol",
        itens: [
          {
            texto:
              "Crie o repositório em <code>github.com</code>, <code>git remote add origin &lt;url&gt;</code>.",
            code: null,
          },
          {
            texto:
              "Pra deploy automático (ainda <b>pendente</b> neste projeto): crie um GitHub Actions workflow (<code>.github/workflows/deploy.yml</code>) rodando <code>npm run build &amp;&amp; npx wrangler deploy</code> a cada push na <code>main</code>.",
            code: null,
          },
          {
            texto:
              "Gere um <b>Cloudflare API Token</b> com permissão de editar Workers (não use a Global API Key, que tem escopo amplo demais) em <code>dash.cloudflare.com</code> → My Profile → API Tokens.",
            code: null,
          },
          {
            texto:
              "No repositório GitHub: Settings → Secrets and variables → Actions → New repository secret → <code>CLOUDFLARE_API_TOKEN</code>.",
            code: null,
          },
          {
            texto:
              "O workflow usa esse secret pra autenticar o <code>wrangler deploy</code> sem precisar de login interativo.",
            code: null,
          },
        ],
      },
    ],
    armadilhas: [
      {
        tipo: "p",
        html: "<b>Estado real:</b> o passo 3 e 4 nunca foram feitos. Deploy continua 100% manual.\nÉ o item de maior retorno por esforço do board inteiro — dois minutos de configuração eliminam\ntodo deploy manual daqui pra frente.\n\n---",
      },
    ],
  },
  {
    id: "11",
    nome: "Figma (design system)",
    oQueE: "Onde vive o design system oficial da Pólia.",
    passos: [
      {
        tipo: "ol",
        itens: [
          {
            texto: "Crie conta em <code>figma.com</code>.",
            code: null,
          },
          {
            texto:
              "Arquivo do design system deste projeto: file key <code>ulUUiZbf5TqXtuMD4KRoIY</code>, 10 páginas (Design System, Foundation, Components, Patterns, Wireframes MVP).",
            code: null,
          },
          {
            texto:
              "Pra integração com Claude Code: MCP do Figma já disponível nesta sessão (<code>mcp__figma__*</code>), basta autenticar quando solicitado.",
            code: null,
          },
          {
            texto:
              "Tokens do Figma devem espelhar exatamente <code>polia-app/src/styles.css</code> (escopo <code>.polia-v3</code>) — nunca o contrário. O CSS é a fonte de verdade, o Figma documenta.",
            code: null,
          },
        ],
      },
    ],
    armadilhas: [],
  },
  {
    id: "12",
    nome: "Notion (hub do projeto)",
    oQueE: "Onde ficam as páginas de sessão e decisões documentadas fora do código.",
    passos: [
      {
        tipo: "ol",
        itens: [
          {
            texto: "Crie o workspace em <code>notion.so</code>.",
            code: null,
          },
          {
            texto: "Hub principal: página <b>🧭 Pólia</b>, pai de todas as páginas de sessão.",
            code: null,
          },
          {
            texto:
              "Convenção de nomenclatura de página de sessão: data + resumo curto do que foi decidido naquela sessão.",
            code: null,
          },
          {
            texto:
              'Existe uma tabela de "Decisões fixadas" no hub — mantenha atualizada; neste projeto ela ficou desatualizada em relação ao código real, então trate como histórico, não como fonte viva.',
            code: null,
          },
        ],
      },
    ],
    armadilhas: [],
  },
  {
    id: "13",
    nome: "Google Play Console (aplicativo Android)",
    oQueE: "Publicação do app Android (wrapper Capacitor do site).",
    passos: [
      {
        tipo: "ol",
        itens: [
          {
            texto:
              "Crie a conta de desenvolvedora em <code>play.google.com/console</code>. Escolha <b>Individual/pessoa física</b>, não Organização — evita a exigência de D-U-N-S number, que pode travar o processo por dias ou semanas.",
            code: null,
          },
          {
            texto: "Pague a taxa única de registro (US$ 25).",
            code: null,
          },
          {
            texto:
              "Crie a ficha do app: nome, pacote (formato <code>br.com.usepolia.app</code>), categoria.",
            code: null,
          },
          {
            texto:
              '<b>Antes de gerar o build de release</b>, complete o checklist técnico: gere um keystore de release (<code>keytool -genkey -v -keystore release.keystore ...</code>), configure <code>signingConfig</code> no <code>android/app/build.gradle</code> (o projeto usa chave de debug hoje, que não é aceita em produção), defina ícone e splash de marca, e incremente <code>versionCode</code>/<code>versionName</code> a cada envio (começam em 1/"1.0" e nunca foram incrementados neste projeto).',
            code: null,
          },
          {
            texto:
              "<code>minifyEnabled</code> deve ir para <code>true</code> antes do release (está <code>false</code> hoje, é build de desenvolvimento).",
            code: null,
          },
          {
            texto:
              "Teste em <b>aparelho físico</b>, não só emulador, antes de submeter — nunca foi feito neste projeto.",
            code: null,
          },
          {
            texto:
              "Upload do <code>.aab</code> (Android App Bundle, não <code>.apk</code>) na Play Console, preencha a ficha da loja (screenshots, descrição, classificação de conteúdo), submeta pra revisão.",
            code: null,
          },
        ],
      },
    ],
    armadilhas: [
      {
        tipo: "ul",
        itens: [
          "<code>capacitor.config.ts</code> aponta <code>server.url</code> pro site de produção ao vivo — o WebView carrega a versão publicada, não um bundle embutido. Isso significa que o app Android reflete o site automaticamente, mas também significa que testar localmente exige rodar o site primeiro.",
          "Antes de gerar qualquer build novo: <code>Remove-Item</code> na pasta de assets antiga do Android + <code>vite build</code> + <code>npx cap sync android</code>, senão fica lixo de uma paleta visual antiga empacotado no app.",
          "A pasta <code>android/</code> estava <b>fora do controle de versão</b> neste projeto (untracked no git) — decida cedo se ela entra no repositório ou vai pro <code>.gitignore</code> definitivamente.",
        ],
      },
    ],
  },
  {
    id: "14",
    nome: "Fontshare (tipografia)",
    oQueE: "Fonte da fonte Cabinet Grotesk, usada nos títulos da marca. Não está no Google\nFonts.",
    passos: [
      {
        tipo: "ol",
        itens: [
          {
            texto:
              "URL de import direto, sem necessidade de conta: <code>https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,600,700&amp;display=swap</code>.",
            code: null,
          },
          {
            texto:
              "Em página normal (site, app), esse link <code>&lt;link&gt;</code> funciona direto.",
            code: null,
          },
          {
            texto:
              "Em contexto com CSP restritiva que bloqueia host externo (por exemplo, um Artifact): esse link <b>não carrega silenciosamente</b>. Nesse caso, baixe o arquivo <code>.woff2</code> e embuta como <code>data:</code> URI direto no CSS, ou caia em Inter com <code>letter-spacing: -0.02em</code> como alternativa aceitável. Nunca resolva essa falta promovendo Fraunces a fonte de título — é a regressão visual mais comum já cometida neste projeto.",
            code: null,
          },
        ],
      },
    ],
    armadilhas: [],
  },
];
