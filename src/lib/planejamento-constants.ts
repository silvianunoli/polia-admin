// Recorte mínimo de src/lib/planejamento.ts do polia-app — fonte da verdade
// continua lá. Só o que o admin precisa pra exibir métricas/labels dos 6
// módulos, não duplica as perguntas/seções do Planejamento em si.
export const TOTAL_MODULOS = 6;

export interface Modulo {
  n: number;
  nome: string;
  subtitulo: string;
}

export const MODULOS: Modulo[] = [
  { n: 1, nome: "Razão de existir", subtitulo: "A base de tudo. Por que você existe, para quem, e o que te diferencia." },
  { n: 2, nome: "Quem você serve", subtitulo: "A pessoa que compra de você. Quem ela é de verdade." },
  { n: 3, nome: "O que você vende", subtitulo: "Produto, proposta de valor, e o que faz do seu o único." },
  { n: 4, nome: "Quanto vale", subtitulo: "Precificar é respeitar o seu trabalho. E entender o seu negócio." },
  { n: 5, nome: "Como te acharem", subtitulo: "Onde você aparece, como você fala, e como as pessoas chegam até a compra." },
  { n: 6, nome: "Onde você vai", subtitulo: "Metas que fazem sentido. Ações que te movem. Foco no que importa." },
];

export function moduloInfo(n: number): Modulo {
  return MODULOS[Math.min(Math.max(n, 1), TOTAL_MODULOS) - 1];
}
