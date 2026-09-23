import { describe, expect, it } from "vitest";
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Regras de marca da Pólia que o ESLint não conhece (CLAUDE.md, BRAND.md):
// nada de travessão, nome de plano morto, vocabulário territorial, emoji ou
// exclamação em texto que a CLIENTE vê. Mesmo varredor do polia-app
// (src/regras-de-marca.test.ts de lá), com uma diferença de escopo:
//
// O office é ferramenta interna. Aqui o "—" é o marcador padrão de célula sem
// valor (founder-formato.ts), o guia de setup é documentação da fundadora e a
// navegação do founder chama a análise de "Jornadas". Nada disso chega na
// cliente, então as regras de forma valem só pros arquivos que geram algo
// que sai daqui: e-mail do CRM, convite, casca de e-mail e o manual da marca.
// A regra de nome de plano morto vale no repo inteiro, porque o CRM já vazou
// nome antigo uma vez (corrigido em 15/09/2026).
//
// A varredura usa o parser do TypeScript, então só entra o que vira texto de
// verdade (string literal, template, texto JSX): comentário, identificador e
// nome de coluna ficam de fora, e `console.*` também, porque log não é copy.

const RAIZ = join(__dirname, "..");
const SRC = join(RAIZ, "src");

const IGNORAR_ARQUIVO = /\.test\.|routeTree\.gen|integrations[\\/]supabase[\\/]types\.ts$|\.d\.ts$/;

// O que sai do office e chega na cliente (ou define a marca).
const VOLTADO_A_CLIENTE =
  /^src\/lib\/(crm-email-html|email-template|email-casca|planos-convite)\.ts$|^src\/routes\/manual-da-marca\.tsx$/;

function listarArquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) listarArquivos(caminho, saida);
    else if (/\.(ts|tsx)$/.test(nome) && !IGNORAR_ARQUIVO.test(caminho)) saida.push(caminho);
  }
  return saida;
}

function dentroDeConsole(no: ts.Node): boolean {
  for (let p = no.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && /^console\./.test(p.expression.getText())) return true;
  }
  return false;
}

interface Ocorrencia {
  arquivo: string;
  linha: number;
  texto: string;
}

const TEXTOS: Ocorrencia[] = (() => {
  const saida: Ocorrencia[] = [];
  for (const caminho of listarArquivos(SRC)) {
    const fonte = readFileSync(caminho, "utf8");
    const sf = ts.createSourceFile(
      caminho,
      fonte,
      ts.ScriptTarget.Latest,
      true,
      caminho.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const arquivo = relative(RAIZ, caminho).split("\\").join("/");
    const visitar = (no: ts.Node) => {
      let texto: string | null = null;
      if (
        ts.isStringLiteral(no) ||
        ts.isNoSubstitutionTemplateLiteral(no) ||
        ts.isTemplateHead(no) ||
        ts.isTemplateMiddle(no) ||
        ts.isTemplateTail(no) ||
        ts.isJsxText(no)
      ) {
        texto = no.text;
      }
      if (texto !== null && texto.trim() && !dentroDeConsole(no)) {
        saida.push({
          arquivo,
          linha: sf.getLineAndCharacterOfPosition(no.getStart()).line + 1,
          texto,
        });
      }
      ts.forEachChild(no, visitar);
    };
    visitar(sf);
  }
  return saida;
})();

const TEXTOS_DE_CLIENTE = TEXTOS.filter((t) => VOLTADO_A_CLIENTE.test(t.arquivo));

// [arquivo, trecho do texto]. Trecho em vez de linha: linha muda a cada
// edição acima e faria o teste gritar sem motivo.
type Excecao = readonly [arquivo: string, trecho: string];

const INSTRUCAO_DE_IA = /Nunca use|Não use|nunca use|não use/;

function procurar(
  universo: Ocorrencia[],
  regra: RegExp,
  opcoes: { ignorarTexto?: RegExp; excecoes?: readonly Excecao[] } = {},
): string[] {
  const achados: string[] = [];
  for (const { arquivo, linha, texto } of universo) {
    if (!regra.test(texto)) continue;
    if (opcoes.ignorarTexto?.test(texto)) continue;
    const excecao = opcoes.excecoes?.some(([a, trecho]) => a === arquivo && texto.includes(trecho));
    if (excecao) continue;
    achados.push(`${arquivo}:${linha}  ${JSON.stringify(texto.trim().slice(0, 80))}`);
  }
  return achados;
}

describe("regras de marca no que sai do office pra cliente", () => {
  it("varreu os arquivos voltados à cliente (sanidade da varredura)", () => {
    const arquivos = new Set(TEXTOS_DE_CLIENTE.map((t) => t.arquivo));
    expect(arquivos.has("src/lib/crm-email-html.ts")).toBe(true);
    expect(arquivos.has("src/lib/planos-convite.ts")).toBe(true);
    expect(TEXTOS_DE_CLIENTE.length).toBeGreaterThan(30);
  });

  it("não tem travessão nem meia-risca", () => {
    expect(procurar(TEXTOS_DE_CLIENTE, /[—–]/, { ignorarTexto: /travess/ })).toEqual([]);
  });

  it("não usa vocabulário proibido", () => {
    expect(
      procurar(
        TEXTOS_DE_CLIENTE,
        /no seu ritmo|no seu tempo|do seu jeito|\binfoprodutos?\b|\btrilhas?\b|\bjornadas?\b|\betapas?\b|planilha por fora|\bDani\b|\bturma\b|girlboss|\bpoderosa\b|\btransforme\b|\brevolucion|fatura mais|Quero faturar|marca clara é marca que fatura/i,
        { ignorarTexto: INSTRUCAO_DE_IA },
      ),
    ).toEqual([]);
  });

  // ©, ® e ™ são tipografia, não emoji.
  it("não usa emoji", () => {
    expect(
      procurar(TEXTOS_DE_CLIENTE, /(?![\u00A9\u00AE\u2122])\p{Extended_Pictographic}/u, {
        ignorarTexto: INSTRUCAO_DE_IA,
      }),
    ).toEqual([]);
  });

  // Só conta "!" que fecha frase; `!important`, `!border-...` e `<!doctype`
  // são código.
  it("não usa exclamação", () => {
    expect(procurar(TEXTOS_DE_CLIENTE, /!(\s|$|["'”])/)).toEqual([]);
  });
});

describe("nomes de plano no office inteiro", () => {
  // Começo/Alcance/Voo mortos desde jul/2026; Confere/Controle/Projete desde
  // 14/09/2026. "Confere" e "Controle" também são verbo, então esses três só
  // contam como nome de plano: depois de "plano" ou listados em série. O guia
  // de setup registra a história dos price ids com os nomes antigos, de
  // propósito.
  it("não exibe nome de plano morto", () => {
    const achados = procurar(
      TEXTOS,
      /\b(Começo|Alcance|Voo)\b|\b[Pp]lanos? (Confere|Controle|Projete)\b|\b(Confere|Controle|Projete)(, | e | ou |\/)(Confere|Controle|Projete)\b/,
      { excecoes: [["src/lib/ferramentas-setup.ts", "planos Confere/Controle/Projete"]] },
    );
    expect(achados).toEqual([]);
  });

  it("o convite por e-mail fala em Grátis, Premium e Pro", () => {
    const convite = TEXTOS.filter((t) => t.arquivo === "src/lib/planos-convite.ts").map(
      (t) => t.texto,
    );
    for (const nome of ["Grátis", "Premium", "Pro"]) {
      expect(
        convite.some((t) => new RegExp(`\\b${nome}\\b`).test(t)),
        `plano ${nome}`,
      ).toBe(true);
    }
  });
});
