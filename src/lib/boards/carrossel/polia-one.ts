import baseCss from "./polia-one/base.css?raw";
import capa from "./polia-one/1-capa.html?raw";
import umaParaCadaCoisa from "./polia-one/2-uma-para-cada-coisa.html?raw";
import tudoConectado from "./polia-one/3-tudo-conectado.html?raw";
import oPoliaOne from "./polia-one/4-o-polia-one.html?raw";
import oQueEntra from "./polia-one/5-o-que-entra.html?raw";
import aResposta from "./polia-one/6-a-resposta.html?raw";
import fechamento from "./polia-one/7-fechamento.html?raw";

// Conteúdo de partida do primeiro carrossel. Vive no repo, não no banco:
// o banco guarda o que ela editou, e isto aqui é o que semeia quando o
// carrossel ainda não existe. Consumido só por server function -- nunca
// importar em componente de client, senão o bundle vira asset estático e
// passa por fora do guard de auth (mesmo motivo do comentário em
// boards.functions.ts).
export const CARROSSEL_POLIA_ONE = {
  slug: "polia-one",
  titulo: "Pólia One",
  descricao: "Seu negócio em um só lugar. Sete pranchas, 1080x1350, para o feed.",
  largura: 1080,
  altura: 1350,
  cssBase: baseCss,
  slides: [
    { ordem: 1, titulo: "1 · Capa", html: capa },
    { ordem: 2, titulo: "2 · Uma para cada coisa", html: umaParaCadaCoisa },
    { ordem: 3, titulo: "3 · Tudo conectado", html: tudoConectado },
    { ordem: 4, titulo: "4 · O Pólia One", html: oPoliaOne },
    { ordem: 5, titulo: "5 · O que entra", html: oQueEntra },
    { ordem: 6, titulo: "6 · A resposta", html: aResposta },
    { ordem: 7, titulo: "7 · Fechamento", html: fechamento },
  ],
};
