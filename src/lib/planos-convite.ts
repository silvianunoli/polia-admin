// Os planos que o convite pode liberar. Fonte única compartilhada pela tela
// (/crm/convites) e pelo servidor (convites.functions.ts), pra a validação do
// zod e as opções do formulário nunca divergirem.
//
// A chave interna (confere/controle/projete) é a que está em profiles.plano,
// nas migrations e nos segredos do Stripe — o nome visível mudou em 14/09/2026
// e a chave ficou. O rótulo curto sai de NOME_PLANO (lib/founder-formato.ts),
// que já é usado no Founder; aqui fica só o que é específico do convite: a
// ordem, a explicação e o nome que vai no e-mail.
//
// 'cancelada' NÃO entra: não é plano que se libera, é o estado em que o webhook
// do Stripe deixa quem cancelou.

export type PlanoConvite = "confere" | "controle" | "projete" | "beta";

export const PLANOS_CONVITE: {
  valor: PlanoConvite;
  explicacao: string;
  /** Como o plano é chamado no e-mail de convite, que é lido por quem está
   *  fora da Pólia — "Lançamento" não diz nada pra ela. */
  nomeNoEmail: string;
}[] = [
  {
    valor: "confere",
    explicacao: "Planejamento, Aimer, Metas e o teto do plano gratuito.",
    nomeNoEmail: "plano Grátis",
  },
  {
    valor: "controle",
    explicacao: "Preço sem limite, Financeiro, Clientes e Calendário.",
    nomeNoEmail: "plano Premium",
  },
  {
    valor: "projete",
    explicacao: "Tudo do Premium, mais Raio-x, Projeção e Plano de conteúdo.",
    nomeNoEmail: "plano Pro",
  },
  {
    valor: "beta",
    explicacao: "Acesso total, sem cota e sem cadeado. É o que as contas de teste usam.",
    nomeNoEmail: "acesso completo",
  },
];
