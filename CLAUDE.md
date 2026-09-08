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
