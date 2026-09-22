# CLAUDE.md — polia-admin (Gestão Pólia)

> Carrega automaticamente sempre que o Claude Code (Cowork) mexe em algo dentro de `polia-admin/`.
> Serve pra qualquer sessão futura saber, sem a Sil precisar reexplicar, como subir/agendar post
> no blog direto pelo banco -- sem precisar abrir o editor em `office.usepolia.com.br/blog`.

## Blog CMS — publicar ou agendar post direto no banco

Projeto Supabase **"Pólia"** (id `egzwkyqpkexgrhbxwcvb`), tabela `public.blog_posts`. RLS exige
`is_admin(auth.uid())` pro client autenticado -- inserir via SQL (MCP Supabase, `execute_sql`
com service role) passa direto, sem precisar de sessão.

### Campos

| Campo | Obrigatório | Observação |
|---|---|---|
| `titulo` | sim | texto livre |
| `slug` | sim | **único** (`blog_posts_slug_key`) -- gerar do título: minúsculo, sem acento, espaço vira `-`. Sempre `select` antes pra conferir que não existe. |
| `conteudo_md` | não, mas sempre preencher | corpo do post em Markdown |
| `resumo` | não | 1-2 frases, aparece no índice do blog |
| `categoria` | não | texto livre, mas usar uma das atuais: `Começar`, `Dinheiro e Gestão`, `Empreender Sozinha`, `Crescimento` (fonte real: `CATEGORIAS` em [src/components/blog-admin/PostEditor.tsx](src/components/blog-admin/PostEditor.tsx)) |
| `tempo_leitura` | não | inteiro, minutos. Calcular: palavras do markdown ÷ 200, arredondar pra cima, mínimo 1 |
| `capa_url` | não | URL pública do bucket `blog-media` |
| `autor_id` | não | uuid de `profiles`, pode deixar null |
| `id` | não | tem `default gen_random_uuid()`, não precisa passar |

### Publicar x Agendar (o ponto que exige atenção)

- **Publicar agora**: `publicado = true`, `publicado_em = now()`, `agendado_para = null`.
- **Agendar**: `publicado = false`, `agendado_para = <timestamp UTC>`, `publicado_em = null`.
  Um `pg_cron` (`publish-due-blog-posts`, roda todo minuto, função `publish_due_posts()`) marca
  `publicado = true` sozinho quando `agendado_para <= now()` -- **nunca** setar `publicado = true`
  manualmente num post que devia esperar a data.
- **Fuso horário**: a Sil sempre fala a data/hora em horário de Brasília. `America/Sao_Paulo` é
  **UTC-3 o ano inteiro** (Brasil não tem mais horário de verão desde 2019) -- pra gravar
  `agendado_para`, some 3 horas. Ex.: "17/09 às 08h" → `2026-09-17 11:00:00+00`.
- Nunca agendar pra data/hora que já passou -- o cron publicaria na próxima rodada (até 1 min),
  o que passa a impressão de bug pra quem não sabe que existe agendamento por trás.

### Antes de gravar

Sempre confirmar de volta pra Sil, num resumo curto, os três pontos que ela pediu atenção:
**título exato**, **categoria** e **data/hora em horário de Brasília** (não em UTC) que vai usar
-- ela confirma e só depois o insert roda. Isso evita post com título errado ou agendado no dia
errado.

### Como ela pode pedir

"Sobe esse post no blog: título [X], categoria [Y], agenda pra [17/09 às 08h]. Conteúdo: [markdown]."

## E-mail — a casca daqui é CÓPIA da do produto

`src/lib/email-casca.ts` (convite, e-mail avulso do CRM, campanha) é cópia de
**`polia-app/supabase/functions/_shared/email-polia.ts`**, que é a fonte da verdade.
Repositórios separados não compartilham import, então a cópia é inevitável; divergir não é.

Foi exatamente isso que aconteceu entre 17/08 e 18/09/2026: o admin ficou parado na versão
pré-v3 (título em **Georgia serifada** e rodapé em **#9E9E9E**, que reprova AA) enquanto o
produto já tinha virado. Resultado: o e-mail do convite e a primeira campanha chegaram com
outra cara dos e-mails que as usuárias recebem.

**Regra: mexeu na casca no polia-app, copie pra cá no mesmo dia.** Isso não depende mais de
alguém lembrar: desde 18/09/2026 o repo tem Vitest e `src/lib/email-casca.test.ts` trava, nas
três variantes, cor fora da paleta v3, `#9E9E9E`/`#767676` e serifada em título. O CI roda
`npm test` **antes** do build, então regressão de e-mail derruba o deploy em vez de chegar na
caixa de entrada de alguém.

```bash
npm test
```

Um dos casos compara este arquivo com o do polia-app e falha se os blocos compartilhados
divergirem. Ele se pula sozinho quando o outro repo não está ao lado (é o caso do CI, que só
clona este). Quer dizer: **a checagem de divergência só acontece na máquina da Sil**, com os
dois repos na mesma pasta. Rode `npm test` local depois de mexer em e-mail.

Três variantes, mesma base de blocos: `emailPolia` (transacional), `emailPoliaEditorial`
(material, botão amarelo) e `emailPoliaCampanha` (newsletter, corpo em HTML vindo do editor
do CRM). Variação nova entra como **parâmetro**, nunca como segunda cópia do HTML.

## Convites — quem pode criar conta, e com qual acesso

Tela: `/crm/convites` (era uma aba de `/crm/usuarias` até 21/09/2026). Tabela
`public.convites_cadastro`. O cadastro do produto é **fechado**: só e-mail que está nessa tabela
consegue criar conta, e o Auth Hook `hook_checar_convite_cadastro` barra até a criação pelo
Admin API.

O convite carrega **o tipo de acesso**: `plano` (`confere`/`controle`/`projete`/`beta`) e
`is_admin`. Quem aplica é o gatilho `aplicar_convite_no_perfil()`, **BEFORE INSERT em
`public.profiles`**.

Três coisas que não são óbvias e já custaram raciocínio:

1. **O convite só vale no nascimento da conta.** Editar o convite depois que a pessoa se
   cadastrou não muda nada — o gatilho não roda mais. A tela recusa essa edição de propósito, em
   vez de aceitar em silêncio. Mudar plano de quem já tem conta **não tem tela ainda** (CRM-10).
2. **A ordem alfabética dos gatilhos é intencional.** `aplicar_convite_no_perfil` roda antes de
   `tmp_plano_beta_conta_teste` porque gatilhos do mesmo timing disparam em ordem de nome — é
   assim que a conta de teste continua ganhando `beta` por cima do convite. Renomear qualquer um
   dos dois pra algo que inverta a ordem quebra isso sem erro nenhum.
3. **Plano concedido na mão não é permanente.** O webhook do Stripe escreve `profiles.plano`
   (inclusive `'cancelada'`), então quem assinar e cancelar perde a concessão manual.

Nunca dar `is_admin` sem a Sil pedir nominalmente: abre o `office.usepolia.com.br` inteiro pra
quem tiver acesso àquela caixa de e-mail. A ação tem log de auditoria próprio
(`criar_convite_admin` / `convite_acesso_admin`), separado do convite comum.
