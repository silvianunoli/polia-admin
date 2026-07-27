// Lint R1 do Módulo Social: reprova travessão e o vocabulário proibido do
// GUARDRAILS-VOZ.md antes de qualquer texto (legenda, alt, resposta de DM) ir
// pro público. Roda em código, não em IA — a revisora pode errar, isto não pode.

export interface ViolacaoLint {
  termo: string;
  trecho: string;
}

export interface ResultadoLint {
  aprovado: boolean;
  violacoes: ViolacaoLint[];
}

interface TermoProibido {
  termo: string;
  padrao: RegExp;
}

// \b do JS só reconhece [A-Za-z0-9_] como "palavra" — falha em fronteiras com
// acento (ex.: espaço seguido de "última"). Por isso o limite usa \p{L}/\p{N}
// com a flag "u", que cobre letra acentuada como caractere de palavra.
function comLimiteDePalavra(corpoRegex: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${corpoRegex})(?![\\p{L}\\p{N}])`, "iu");
}

const TERMOS_PROIBIDOS: TermoProibido[] = [
  { termo: "margem", padrao: comLimiteDePalavra("margem") },
  { termo: "etapa", padrao: comLimiteDePalavra("etapas?") },
  { termo: "trilha", padrao: comLimiteDePalavra("trilhas?") },
  { termo: "jornada", padrao: comLimiteDePalavra("jornadas?") },
  { termo: "marco", padrao: comLimiteDePalavra("marcos?") },
  { termo: "turma", padrao: comLimiteDePalavra("turmas?") },
  { termo: "infoproduto", padrao: comLimiteDePalavra("infoprodutos?") },
  { termo: '"sabe primeiro"', padrao: comLimiteDePalavra("sabe primeiro") },
  { termo: '"planilha por fora"', padrao: comLimiteDePalavra("planilha por fora") },
  { termo: '"do seu jeito"', padrao: comLimiteDePalavra("do seu jeito") },
  { termo: '"no seu tempo"', padrao: comLimiteDePalavra("no seu tempo") },
  { termo: '"no seu ritmo"', padrao: comLimiteDePalavra("no seu ritmo") },
  { termo: "miga", padrao: comLimiteDePalavra("migas?") },
  { termo: "querida", padrao: comLimiteDePalavra("queridas?") },
  { termo: "linda", padrao: comLimiteDePalavra("lindas?") },
  { termo: "bora", padrao: comLimiteDePalavra("bora") },
  { termo: "gata", padrao: comLimiteDePalavra("gatas?") },
  { termo: '"6 dígitos"', padrao: comLimiteDePalavra("6\\s*d[ií]gitos") },
  { termo: '"renda extra fácil"', padrao: comLimiteDePalavra("renda extra f[áa]cil") },
  { termo: "fórmula", padrao: comLimiteDePalavra("f[óo]rmulas?") },
  { termo: '"últimas vagas"', padrao: comLimiteDePalavra("[uú]ltimas vagas") },
  { termo: '"a sócia que já passou"', padrao: comLimiteDePalavra("a s[óo]cia que j[áa] passou") },
];

// "infoproduto" já cai na lista acima; "digital solto" precisa da exceção "produto digital".
const DIGITAL_SOLTO = /(?<!produto\s)(?<![\p{L}\p{N}])digital(?![\p{L}\p{N}])/iu;

const TAMANHO_JANELA_TRECHO = 20;

function extrairTrecho(texto: string, indice: number, tamanhoMatch: number): string {
  const inicio = Math.max(0, indice - TAMANHO_JANELA_TRECHO);
  const fim = Math.min(texto.length, indice + tamanhoMatch + TAMANHO_JANELA_TRECHO);
  const prefixo = inicio > 0 ? "…" : "";
  const sufixo = fim < texto.length ? "…" : "";
  return `${prefixo}${texto.slice(inicio, fim).trim()}${sufixo}`;
}

export function lintTextoSocial(texto: string): ResultadoLint {
  const violacoes: ViolacaoLint[] = [];

  const indiceTravessao = texto.indexOf("—");
  if (indiceTravessao !== -1) {
    violacoes.push({ termo: "travessão", trecho: extrairTrecho(texto, indiceTravessao, 1) });
  }

  for (const { termo, padrao } of TERMOS_PROIBIDOS) {
    const match = padrao.exec(texto);
    if (match) {
      violacoes.push({ termo, trecho: extrairTrecho(texto, match.index, match[0].length) });
    }
  }

  const matchDigital = DIGITAL_SOLTO.exec(texto);
  if (matchDigital) {
    violacoes.push({
      termo: '"digital" solto (usar: produto digital, com exemplo)',
      trecho: extrairTrecho(texto, matchDigital.index, matchDigital[0].length),
    });
  }

  return { aprovado: violacoes.length === 0, violacoes };
}
