// Casca HTML dos e-mails da Pólia no polia-admin (convite, e-mail avulso do
// CRM, campanha).
//
// CÓPIA da fonte da verdade, que vive no produto:
//   polia-app/supabase/functions/_shared/email-polia.ts
// Repositórios separados não compartilham import, então a cópia é inevitável.
// O que NÃO é inevitável é ela divergir: foi exatamente isso que aconteceu
// entre 17/08 e 18/09/2026, quando este arquivo ficou parado na versão
// pré-v3 (título em Georgia serifada, rodapé em #9E9E9E que reprova AA) e os
// e-mails do admin passaram a chegar com outra cara dos do produto. Mexeu na
// casca lá, traga pra cá no mesmo dia. O app tem teste de regressão
// (src/lib/email-template.test.ts) que trava cor e tipografia; aqui ainda não
// tem, então a conferência é manual.
//
// Este arquivo é PURO de propósito: sem import, sem `process.env`. É o que
// permite o editor de campanha usar a mesma casca no client pra pré-visualizar
// exatamente o que vai sair. O transporte (chave da API, fetch pro Resend)
// fica em `src/lib/email-template.ts`.

// Escapa HTML antes de interpolar qualquer texto de origem não confiável
// (formulário público, input de usuária) num e-mail — sem isso, dá pra
// injetar HTML/script no corpo do e-mail que o destinatário abre.
export function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Tokens ───────────────────────────────────────────────────────────────
// Layout em tabela + estilo inline: é o padrão robusto pra e-mail. Outlook
// desktop não lê <style> externo, flexbox nem grid, e nenhum cliente lê
// variável CSS, então os tokens de src/styles.css entram aqui como valor
// literal. Os hexes abaixo NÃO são cor solta: cada um é o token real do
// escopo .polia-v3 (conferido no CSS, não de memória) -- mexer neles sem
// mexer no styles.css quebra a correspondência com o site.
const COR_BG = "#F2F0ED"; // --bg, fundo da página
const COR_CARTAO = "#FFFFFF"; // o site usa branco em cima de --bg pra cartão
const COR_BORDA = "#E6E6E6"; // --line
const COR_INK = "#0A0A0A"; // --ink, título/texto do botão/borda do botão
const COR_INK_SOFT = "#2C2C2C"; // --ink-soft, corpo
const COR_MUTED = "#6B6B6B"; // --muted (valor real do CSS -- o #767676 do
// DESIGN.md tá desatualizado, reprova AA; o CSS já corrigiu isso em agosto)
const COR_SECUNDARIA = "#7CCBCD"; // --secondary, fundo do botão padrão
const COR_DESTAQUE = "#F6DAD4"; // --surface-pink, caixa de destaque do quiz
const COR_AMARELO = "#FFC629"; // --highlight, botão só do editorial
const COR_ALERTA_FUNDO = "#FBEAE7"; // --danger-soft

// Fonte: nenhum cliente de e-mail carrega fonte web de forma confiável, então
// Cabinet Grotesk e Inter aparecem na pilha pra funcionar onde der, e o
// fallback é a sans do sistema. Serifada seria erro: os títulos do site são
// Cabinet Grotesk, uma grotesca. Fraunces no site é só itálico de acento.
const FONTE_TITULO =
  "'Cabinet Grotesk','Inter',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
// Botão e corpo do site usam Inter, não Cabinet -- conferido ao vivo no botão
// real ("Entrar na lista", font-family computada = Inter). O botão do e-mail
// usava DM Sans antes; corrigido pra bater com o produto.
const FONTE_CORPO = "'Inter',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
// Só pra texto que É label em caixa alta de verdade (rótulo, assinatura do
// editorial, domínio do rodapé) -- DESIGN.md §3: "Labels em caixa alta = DM
// Sans Bold". Não é a fonte do botão (isso é Inter, ver acima).
const FONTE_ROTULO = "'DM Sans','Inter',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

// Raio: --radius (12px) pro cartão, --radius-xl (16px) pro botão -- os dois
// valores reais do styles.css, não um raio novo inventado pro e-mail. O botão
// real do site é 16px (`rounded-xl`), conferido ao vivo via getComputedStyle;
// o cartão usa o raio base, que é o que qualquer superfície do produto usa
// por padrão quando não é um botão.
const RAIO_CARTAO = 12;
const RAIO_BOTAO = 16;

// Logo do cabeçalho. É PNG hospedado de propósito, e a tentação de trocar por
// SVG inline (que é o que o site e o polia-office usam) precisa ser resistida:
// Gmail, Outlook e Yahoo removem a tag <svg> do HTML do e-mail. Inline o SVG
// aqui e a marca some pra maior parte de quem recebe, sem nem deixar texto no
// lugar — fica um buraco. O PNG é rasterizado do arquivo-fonte oficial
// (public/polia-one-light.svg, o wordmark "one" com a trilha de 3 pontos,
// trocado em 17/09/2026 -- era o lockup "pólia" + selo "ONE" de 16/09 antes),
// então não há segunda versão do logo pra sair de sincronia. É servido por URL
// externa (~3KB), nunca embutido em base64 no HTML do e-mail -- isso mantém o
// e-mail leve e evita o peso extra que um base64 de logo adicionaria em toda
// mensagem enviada. Pra regerar depois de mexer no logo (3x do tamanho de
// exibição, achatado sobre o --bg do cabeçalho; o arquivo-fonte tem fundo
// transparente, então não precisa remover nenhum <rect> antes):
//
//   node -e "const s=require('sharp'),f=require('fs');s(f.readFileSync('public/polia-one-light.svg'),{density:600}).resize({width:357,height:120,fit:'fill'}).flatten({background:'#F2F0ED'}).png({compressionLevel:9,palette:true}).toFile('public/marketing/logo-email.png')"
//
// O `alt` não é detalhe de acessibilidade só: imagem remota vem bloqueada por
// padrão em boa parte dos clientes, e o alt estilizado faz o cabeçalho cair
// exatamente no wordmark de texto que existia aqui antes. Nenhum cenário fica
// pior do que estava.
//
// A URL é absoluta porque e-mail não tem origem. Ela só existe depois que o
// APP for deployado (o Worker é quem serve /marketing/*): deployar as edge
// functions antes do app deixa a imagem em 404 até o app subir.
const LOGO_URL = "https://one.usepolia.com.br/marketing/logo-email.png";
// 119x40 é a proporção exata do SVG (467x157): mudar só um dos dois achata o logo.
const LOGO_LARGURA = 119;
const LOGO_ALTURA = 40;

// Fala com a gente, no rodapé de todo e-mail (16/09/2026). O destino real é
// WhatsApp, mas o número ainda não existe -- contratar é pendência da Sil.
// Até lá, aponta pro /ajuda, que já existe e resolve a mesma dúvida. Trocar
// pra wa.me/<numero> assim que o número for contratado.
const AJUDA_URL = "https://one.usepolia.com.br/ajuda";

// ── Blocos compartilhados ────────────────────────────────────────────────
// Cada um monta um pedaço de HTML reaproveitado pelas duas variantes lá
// embaixo. Existem pra que nenhuma decisão visual (cor de botão, raio,
// padding do rodapé) precise ser tomada duas vezes em dois arquivos que
// podem divergir com o tempo -- foi exatamente isso que aconteceu antes desta
// revisão.

function blocoLogo(): string {
  return `
            <tr>
              <td style="padding:0 0 28px;text-align:center;">
                <img src="${LOGO_URL}" width="${LOGO_LARGURA}" height="${LOGO_ALTURA}" alt="Pólia" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:${LOGO_LARGURA}px;height:${LOGO_ALTURA}px;font-family:${FONTE_TITULO};font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${COR_INK};" />
              </td>
            </tr>`;
}

// O ÚNICO componente de botão dos 12 e-mails. Forma conferida ao vivo contra
// o botão real do site (Entrar na lista, no header): fundo turquesa, borda
// 1,5px tinta, raio 16px, Inter 600, SEM caixa alta, sem letter-spacing --
// tudo isso é o botão real, não uma escolha nova. Só a cor de fundo muda por
// parâmetro (turquesa no transacional, amarelo no editorial, porque ali o
// amarelo é o único destaque da peça) -- a forma nunca muda.
function blocoBotao({
  label,
  url,
  corFundo = COR_SECUNDARIA,
}: {
  label: string;
  url: string;
  corFundo?: string;
}): string {
  return `
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
                  <tr>
                    <td style="background-color:${corFundo};border:1.5px solid ${COR_INK};border-radius:${RAIO_BOTAO}px;">
                      <a href="${url}" style="display:inline-block;padding:13px 28px;font-family:${FONTE_CORPO};font-size:15px;font-weight:600;color:${COR_INK};text-decoration:none;border-radius:${RAIO_BOTAO - 2}px;">
                        ${label}
                      </a>
                    </td>
                  </tr>
                </table>`;
}

// Caixa de atenção discreta -- não um card vermelho alarmante. Usa o mesmo
// --danger/--danger-soft que o produto usa pra erro (styles.css), com filete
// lateral em vez de fundo cheio. Hoje só o pagamento recusado usa isso: é o
// único e-mail dos 12 que precisa comunicar "isso merece sua atenção" sem
// soar susto.
// Sem filete lateral de propósito (pedido da Sil, 16/09/2026): o fundo
// --danger-soft sozinho já diferencia a caixa sem parecer alarme.
function blocoAlerta(textoHtml: string): string {
  return `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="background-color:${COR_ALERTA_FUNDO};border-radius:8px;padding:16px 20px;">
                      <p style="margin:0;font-family:${FONTE_CORPO};font-size:14px;line-height:1.5;color:${COR_INK_SOFT};">${textoHtml}</p>
                    </td>
                  </tr>
                </table>`;
}

// Assinatura + "fale com a gente" em todo e-mail dos 12 (16/09/2026, pedido da
// Sil). O domínio voltou a ser "one.usepolia.com.br" -- mas SEM caixa alta
// (pedido explícito: domínio em capslock lê como grito/spam; nome de marca
// não). A tagline mantém a caixa alta, é rótulo, não endereço. Descadastro
// continua condicional -- só os e-mails de lista (quiz, manual) levam, pelo
// mesmo motivo de sempre: ninguém opta por não receber o recibo da própria
// compra.
function blocoRodape({ descadastroUrl }: { descadastroUrl?: string }): string {
  const linhaDescadastro = descadastroUrl
    ? `
                <p style="margin:8px 0 0;font-family:${FONTE_ROTULO};font-size:11px;font-weight:700;letter-spacing:0.06em;color:${COR_MUTED};">
                  <a href="${descadastroUrl}" style="color:${COR_MUTED};text-decoration:underline;">Não quero mais receber</a>
                </p>`
    : "";
  return `
            <tr>
              <td style="padding-top:24px;text-align:left;">
                <p style="margin:0;font-family:${FONTE_ROTULO};font-size:11px;font-weight:700;letter-spacing:0.06em;color:${COR_MUTED};">
                  one.usepolia.com.br
                </p>
                <p style="margin:4px 0 0;font-family:${FONTE_ROTULO};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${COR_MUTED};">
                  Pequenas marcas. Grandes sonhos.
                </p>
                <p style="margin:8px 0 0;font-family:${FONTE_ROTULO};font-size:11px;font-weight:700;letter-spacing:0.06em;color:${COR_MUTED};">
                  Alguma dúvida? <a href="${AJUDA_URL}" style="color:${COR_MUTED};text-decoration:underline;">Fale com a gente</a>
                </p>
                ${linhaDescadastro}
              </td>
            </tr>`;
}

// Abre o documento até o início do conteúdo do cartão (quem chama escreve o
// miolo e depois fecha com fechamentoPagina). O padding do cartão é 32px --
// escala 4/8/12/16/24/32/48 do DESIGN.md, não o 48/44/44 "revista impressa"
// que só fazia sentido pro editorial. Card do produto não tem esse padrão;
// usa o raio base com respiro generoso, sem virar página de material.
function aberturaPagina({ preheader, headline }: { preheader: string; headline: string }): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${headline}</title>
    <style>
      @media only screen and (max-width: 600px) {
        .polia-cartao { padding: 24px !important; }
        .polia-h1 { font-size: 26px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${COR_BG};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COR_BG};">
      <tr>
        <td align="center" style="padding:40px 16px 48px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">${blocoLogo()}
            <tr>
              <td class="polia-cartao" style="background-color:${COR_CARTAO};border:1px solid ${COR_BORDA};border-radius:${RAIO_CARTAO}px;padding:32px;">`;
}

function fechamentoPagina({ descadastroUrl }: { descadastroUrl?: string }): string {
  return `
              </td>
            </tr>${blocoRodape({ descadastroUrl })}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// ── Variante transacional (11 dos 12 e-mails) ───────────────────────────────
export function emailPolia({
  preheader,
  rotulo,
  headline,
  paragrafos,
  destaque,
  alerta,
  ctaLabel,
  ctaUrl,
  descadastroUrl,
}: {
  preheader: string;
  /** Rótulo opcional em caixa alta acima do título, com o filete antes dele
   *  (mesmo tratamento do editorial). A maioria dos e-mails não passa isso --
   *  some sozinho quando omitido. */
  rotulo?: string;
  headline: string;
  paragrafos: string[];
  /** Caixa pêssego, igual à da tela de resultado do quiz. Passe já escapado. */
  destaque?: { rotulo: string; texto: string };
  /** Caixa de atenção com --danger-soft (ver blocoAlerta). Só o pagamento
   *  recusado usa isso hoje. Passe já escapado. */
  alerta?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Link de saída de um clique. Só pros e-mails de lista: os transacionais
   *  (conta criada, recibo, senha) não levam descadastro, porque ninguém pode
   *  optar por não receber o recibo da própria compra. */
  descadastroUrl?: string;
}): string {
  const corpoParagrafos = paragrafos
    .map(
      (p) =>
        `<p style="margin:0 0 18px;font-family:${FONTE_CORPO};font-size:16px;line-height:1.65;color:${COR_INK_SOFT};">${p}</p>`,
    )
    .join("\n");

  const caixaDestaque = destaque
    ? `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                  <tr>
                    <td style="background-color:${COR_DESTAQUE};border-radius:${RAIO_CARTAO}px;padding:24px;">
                      <p style="margin:0 0 8px;font-family:${FONTE_CORPO};font-size:13px;font-weight:600;line-height:1.4;color:${COR_INK_SOFT};">
                        ${destaque.rotulo}
                      </p>
                      <p style="margin:0;font-family:${FONTE_CORPO};font-size:15px;line-height:1.6;color:${COR_INK};">
                        ${destaque.texto}
                      </p>
                    </td>
                  </tr>
                </table>`
    : "";

  const caixaAlerta = alerta ? blocoAlerta(alerta) : "";

  const blocoRotulo = rotulo
    ? `
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                  <tr>
                    <td style="width:20px;padding-right:10px;vertical-align:middle;"><div style="width:20px;height:2px;background-color:${COR_INK};font-size:0;line-height:0;">&nbsp;</div></td>
                    <td style="vertical-align:middle;font-family:${FONTE_ROTULO};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${COR_INK_SOFT};">${rotulo}</td>
                  </tr>
                </table>`
    : "";

  const botao = ctaLabel && ctaUrl ? blocoBotao({ label: ctaLabel, url: ctaUrl }) : "";

  return (
    aberturaPagina({ preheader, headline }) +
    `
                ${blocoRotulo}
                <h1 class="polia-h1" style="margin:0 0 28px;font-family:${FONTE_TITULO};font-size:32px;font-weight:700;line-height:1.1;letter-spacing:-0.02em;color:${COR_INK};">
                  ${headline}
                </h1>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                  <tr><td style="height:1px;background-color:${COR_BORDA};font-size:0;line-height:0;">&nbsp;</td></tr>
                </table>
                ${corpoParagrafos}
                ${caixaAlerta}
                ${caixaDestaque}
                ${botao}` +
    fechamentoPagina({ descadastroUrl })
  );
}

// ── Variante editorial (só o e-mail do Manual da Marca) ─────────────────────
// Layout dos e-mails de MATERIAL. Nasceu em 14/09/2026 a pedido da fundadora:
// o e-mail de entrega precisava parecer uma página do próprio manual, não um
// aviso de sistema. Difere da variante transacional em três coisas, e só
// nelas: rótulo em caixa alta antes do título (aqui é obrigatório, não
// opcional), uma citação editorial antes do botão, e o botão em AMARELO
// (--highlight, texto tinta) -- nesta peça o amarelo é o único destaque e o
// turquesa fica de fora. Cabeçalho, cartão, tipografia do corpo e rodapé são
// os mesmos blocos compartilhados da variante transacional: é a mesma marca,
// só a "voz" muda.
export function emailPoliaEditorial({
  preheader,
  rotulo,
  headline,
  paragrafos,
  citacao,
  ctaLabel,
  ctaUrl,
  fechamento,
  assinatura,
  descadastroUrl,
}: {
  preheader: string;
  /** Rótulo em caixa alta acima do título, ex.: "Pólia · Material gratuito". */
  rotulo: string;
  headline: string;
  /** Já escapados. */
  paragrafos: string[];
  /** Frase curta em destaque antes do botão, uma linha por item. Já escapadas. */
  citacao?: string[];
  ctaLabel: string;
  ctaUrl: string;
  /** Linhas de despedida, já escapadas. */
  fechamento?: string[];
  /** Quem assina e a frase que fecha. Já escapadas. */
  assinatura: { nome: string; tagline?: string };
  descadastroUrl?: string;
}): string {
  const p = (texto: string, extra = "") =>
    `<p style="margin:0 0 18px;font-family:${FONTE_CORPO};font-size:16px;line-height:1.65;color:${COR_INK_SOFT};${extra}">${texto}</p>`;

  const corpo = paragrafos.map((t) => p(t)).join("\n");

  const blocoCitacao =
    citacao && citacao.length
      ? `
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 36px;">
                  <tr>
                    <td style="border-left:2px solid ${COR_INK};padding:4px 0 4px 20px;">
                      ${citacao
                        .map(
                          (linha) =>
                            `<p style="margin:0;font-family:${FONTE_TITULO};font-size:22px;font-weight:700;line-height:1.25;letter-spacing:-0.02em;color:${COR_INK};">${linha}</p>`,
                        )
                        .join("\n")}
                    </td>
                  </tr>
                </table>`
      : "";

  const linhasFechamento = (fechamento ?? []).map((t) => p(t, "margin-bottom:6px;")).join("\n");

  const blocoRotulo = `
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                  <tr>
                    <td style="width:20px;padding-right:10px;vertical-align:middle;"><div style="width:20px;height:2px;background-color:${COR_INK};font-size:0;line-height:0;">&nbsp;</div></td>
                    <td style="vertical-align:middle;font-family:${FONTE_ROTULO};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${COR_INK_SOFT};">${rotulo}</td>
                  </tr>
                </table>`;

  return (
    aberturaPagina({ preheader, headline }) +
    `
                ${blocoRotulo}
                <h1 class="polia-h1" style="margin:0 0 28px;font-family:${FONTE_TITULO};font-size:32px;font-weight:700;line-height:1.1;letter-spacing:-0.02em;color:${COR_INK};">
                  ${headline}
                </h1>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                  <tr><td style="height:1px;background-color:${COR_BORDA};font-size:0;line-height:0;">&nbsp;</td></tr>
                </table>
                ${corpo}
                ${blocoCitacao}
                ${blocoBotao({ label: ctaLabel, url: ctaUrl, corFundo: COR_AMARELO })}
                ${linhasFechamento}
                <p style="margin:18px 0 6px;font-family:${FONTE_TITULO};font-size:16px;font-weight:700;line-height:1.4;letter-spacing:-0.02em;color:${COR_INK};">${assinatura.nome}</p>
                ${
                  assinatura.tagline
                    ? `<p style="margin:0;font-family:${FONTE_ROTULO};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${COR_MUTED};">${assinatura.tagline}</p>`
                    : ""
                }` +
    fechamentoPagina({ descadastroUrl })
  );
}

// ── Variante campanha (newsletter escrita no editor do CRM) ─────────────────
// Difere da transacional em uma coisa só: o corpo não vem como lista de
// parágrafos, vem como HTML já montado pelo Tiptap (negrito, lista, link,
// subtítulo). Cabeçalho, cartão, filete, tipografia e rodapé são os MESMOS
// blocos compartilhados — é a mesma marca, só a origem do corpo muda.
//
// O descadastro aqui é obrigatório na prática: campanha é e-mail de lista, e
// o Resend troca {{{RESEND_UNSUBSCRIBE_URL}}} pelo link real de cada pessoa,
// que é o que também alimenta o cabeçalho List-Unsubscribe.
export function emailPoliaCampanha({
  preheader,
  rotulo,
  headline,
  corpoHtml,
  descadastroUrl,
}: {
  preheader: string;
  rotulo?: string;
  headline: string;
  /** HTML do editor, já com estilo inline (ver crm-email-html.ts). */
  corpoHtml: string;
  descadastroUrl?: string;
}): string {
  const blocoRotulo = rotulo
    ? `
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
                  <tr>
                    <td style="width:20px;padding-right:10px;vertical-align:middle;"><div style="width:20px;height:2px;background-color:${COR_INK};font-size:0;line-height:0;">&nbsp;</div></td>
                    <td style="vertical-align:middle;font-family:${FONTE_ROTULO};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${COR_INK_SOFT};">${rotulo}</td>
                  </tr>
                </table>`
    : "";

  return (
    aberturaPagina({ preheader, headline }) +
    `
                ${blocoRotulo}
                <h1 class="polia-h1" style="margin:0 0 28px;font-family:${FONTE_TITULO};font-size:32px;font-weight:700;line-height:1.1;letter-spacing:-0.02em;color:${COR_INK};">
                  ${headline}
                </h1>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                  <tr><td style="height:1px;background-color:${COR_BORDA};font-size:0;line-height:0;">&nbsp;</td></tr>
                </table>
                ${corpoHtml}` +
    fechamentoPagina({ descadastroUrl })
  );
}
