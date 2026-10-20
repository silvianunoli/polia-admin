import { emailPoliaCampanha, escapeHtml } from "@/lib/email-casca";

// Estilo inline do corpo escrito no editor. A casca (cabeçalho, cartão,
// rodapé) é a de email-casca.ts, a mesma dos outros e-mails da Pólia — aqui só
// se resolve o miolo.
//
// Regra de e-mail: tabela + estilo inline. Outlook desktop ignora <style>,
// flexbox e grid, e o Gmail corta o <head>. Nada de CSS moderno aqui.

// O Tiptap devolve HTML limpo mas sem estilo nenhum, e cliente de e-mail não
// herda margem nem cor de link. Então cada tag comum recebe o seu inline.
// Os valores são os mesmos dos parágrafos da casca: Inter 16px/1.65 em
// --ink-soft, título em Cabinet Grotesk. Nada de serifada: os títulos da
// Pólia são grotescas, e Georgia aqui foi justamente o erro que fez os
// e-mails do admin divergirem dos do produto.
const FONTE_CORPO = "'Inter',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const FONTE_TITULO =
  "'Cabinet Grotesk','Inter',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const CORPO = `font-family:${FONTE_CORPO};font-size:16px;line-height:1.65;color:#2C2C2C;`;

const ESTILOS: [RegExp, string][] = [
  [/<p>/g, `<p style="margin:0 0 18px;${CORPO}">`],
  [
    /<h2>/g,
    `<h2 style="margin:28px 0 12px;font-family:${FONTE_TITULO};font-size:22px;font-weight:700;line-height:1.2;letter-spacing:-0.02em;color:#0A0A0A;">`,
  ],
  [
    /<h3>/g,
    `<h3 style="margin:24px 0 8px;font-family:${FONTE_TITULO};font-size:18px;font-weight:700;line-height:1.25;letter-spacing:-0.02em;color:#0A0A0A;">`,
  ],
  [/<ul>/g, '<ul style="margin:0 0 18px;padding-left:20px;">'],
  [/<ol>/g, '<ol style="margin:0 0 18px;padding-left:20px;">'],
  [/<li>/g, `<li style="margin:0 0 8px;${CORPO}">`],
  [
    /<blockquote>/g,
    `<blockquote style="margin:0 0 18px;padding:8px 0 8px 16px;border-left:2px solid #7CCBCD;${CORPO}">`,
  ],
  [/<a /g, '<a style="color:#24696B;text-decoration:underline;" '],
  [/<hr>/g, '<hr style="border:none;border-top:1px solid #E6E6E6;margin:28px 0;">'],
  [/<img /g, '<img style="max-width:100%;height:auto;border-radius:12px;" '],
];

// O Diário é carta: corpo um ponto maior e mais arejado. E o <mark> do editor
// vira o único amarelo da peça (--highlight com texto tinta).
const CORPO_DIARIO = `font-family:${FONTE_CORPO};font-size:17px;line-height:1.7;color:#2C2C2C;`;
const ESTILOS_DIARIO: [RegExp, string][] = [
  [/<p>/g, `<p style="margin:0 0 18px;${CORPO_DIARIO}">`],
  [/<li>/g, `<li style="margin:0 0 8px;${CORPO_DIARIO}">`],
  [/<mark[^>]*>/g, '<mark style="background-color:#FFC629;color:#0A0A0A;padding:1px 3px;">'],
];

export function inlineParaEmail(html: string, modelo: ModeloCampanha = "padrao"): string {
  let saida = html;
  // Os do Diário vêm antes: trocam <p>/<li> pelo corpo maior, e o resto
  // (título, lista, link, citação) segue igual ao padrão.
  if (modelo === "diario") for (const [de, para] of ESTILOS_DIARIO) saida = saida.replace(de, para);
  for (const [de, para] of ESTILOS) saida = saida.replace(de, para);
  // Fora do Diário o <mark> fica sem cor: o amarelo é marca daquele modelo.
  if (modelo !== "diario") saida = saida.replace(/<mark[^>]*>/g, "<mark style=\"background:none;color:inherit;\">");
  return saida;
}

export type ModeloCampanha = "padrao" | "diario";

/** Campos próprios do Diário, como ficam em crm_campanhas.diario. Texto puro. */
export interface DiarioCampanha {
  titulo?: string;
  edicao?: number;
  acao_texto?: string;
  acao_rotulo?: string;
  acao_url?: string;
  despedida?: string;
  ps?: string;
}

// Saudação de envio. O Resend troca contact.first_name pelo primeiro nome do contato (sintaxe da doc de broadcasts, conferida em 20/10/2026)
// (a sincronização da lista grava first_name); sem nome, vira "Oi, você.".
export const SAUDACAO_ENVIO = "Oi, {{{contact.first_name|você}}}.";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "terça, 20 out" no horário de Brasília (UTC-3 o ano todo desde 2019). */
export function dataDaEdicao(quando: Date): string {
  const brt = new Date(quando.getTime() - 3 * 60 * 60 * 1000);
  return `${DIAS[brt.getUTCDay()]}, ${brt.getUTCDate()} ${MESES[brt.getUTCMonth()]}`;
}

// Só link https vai pro botão: o campo é digitado na admin e entra cru num href.
function urlSegura(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" ? escapeHtml(u.toString()) : undefined;
  } catch {
    return undefined;
  }
}

// A campanha usa a MESMA casca dos outros e-mails da Pólia: logo no topo,
// título em Cabinet Grotesk, filete, corpo em Inter e o rodapé com o domínio,
// a assinatura da marca e o descadastro. O {{{RESEND_UNSUBSCRIBE_URL}}} é
// trocado pelo Resend pelo link real de cada destinatária. No modelo Diário a
// casca é a carta de terça e quinta (ver emailDiario em email-casca.ts).
export function montarHtmlCampanha(params: {
  assunto: string;
  preheader: string | null;
  corpo: string;
  modelo?: ModeloCampanha;
  diario?: DiarioCampanha | null;
  /** Quando a edição sai; vira a data do cabeçalho do Diário. */
  quando?: Date;
  /** Troca a saudação de envio (prévia e teste não passam pelo Resend). */
  saudacao?: string;
}): string {
  const modelo = params.modelo ?? "padrao";
  const d = params.diario ?? {};
  // Assunto e preheader são texto puro digitado na admin; a casca interpola
  // cru no <title> e no <h1>, então "Promoção & novidades" quebrava o HTML.
  return emailPoliaCampanha({
    preheader: escapeHtml(params.preheader ?? params.assunto),
    headline: escapeHtml(params.assunto),
    corpoHtml: inlineParaEmail(params.corpo, modelo),
    descadastroUrl: "{{{RESEND_UNSUBSCRIBE_URL}}}",
    ...(modelo === "diario"
      ? {
          diario: {
            titulo: escapeHtml(d.titulo?.trim() || params.assunto),
            edicao: d.edicao && d.edicao > 0 ? Math.floor(d.edicao) : 1,
            dataEdicao: dataDaEdicao(params.quando ?? new Date()),
            saudacao: params.saudacao ? escapeHtml(params.saudacao) : SAUDACAO_ENVIO,
            acao: d.acao_texto?.trim()
              ? {
                  texto: escapeHtml(d.acao_texto.trim()),
                  rotulo: d.acao_rotulo?.trim() ? escapeHtml(d.acao_rotulo.trim()) : undefined,
                  url: urlSegura(d.acao_url),
                }
              : undefined,
            despedida: escapeHtml(d.despedida?.trim() || "Até a próxima,"),
            ps: d.ps?.trim() ? escapeHtml(d.ps.trim()) : undefined,
          },
        }
      : {}),
  });
}

// Versão em texto puro do e-mail inteiro. No Diário entram também saudação,
// "Pra fazer hoje", despedida e PS, que não moram no corpo do editor.
export function textoDaCampanha(params: {
  corpo: string;
  modelo?: ModeloCampanha;
  diario?: DiarioCampanha | null;
}): string {
  const corpo = textoDoHtml(params.corpo);
  if (params.modelo !== "diario") return corpo;
  const d = params.diario ?? {};
  const partes = [SAUDACAO_ENVIO, corpo];
  if (d.acao_texto?.trim()) {
    const link = d.acao_rotulo?.trim() && d.acao_url?.trim() ? `\n${d.acao_rotulo.trim()}: ${d.acao_url.trim()}` : "";
    partes.push(`Pra fazer hoje: ${d.acao_texto.trim()}${link}`);
  }
  partes.push(`${d.despedida?.trim() || "Até a próxima,"}\nSil, fundadora da Pólia`);
  if (d.ps?.trim()) partes.push(`PS. ${d.ps.trim()}`);
  return partes.join("\n\n");
}

export function textoDoHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
