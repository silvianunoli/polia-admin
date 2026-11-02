// Pesquisa de gestão do dia a dia (novembro/2026, card MARCA-12). A de julho
// perguntou sobre preço; esta mede a Pólia One como sistema de gestão: onde a
// marca vende, quantos pedidos, o que usa hoje pra controlar, quanto paga e o
// que faria abrir a Pólia todo dia.
//
// Um link só pra dois públicos: quem já criou conta na Pólia One e quem chega
// pelos grupos. A primeira pergunta separa os dois na leitura; o bloco "se você
// criou conta" é opcional pra quem não criou pular.
//
// categoria e quem_toca repetem os ids de opção da discovery-negocio, pra dar
// pra comparar as amostras no admin.

import type { PesquisaConfig } from "./tipos";
import { discoveryNegocio } from "./discovery-negocio";

const daDiscovery = (id: string) => discoveryNegocio.perguntas.find((p) => p.id === id)!.opcoes!;

export const pesquisaGestao: PesquisaConfig = {
  slug: "pesquisa-gestao",
  // Incentivo decidido pela Sil em 31/10: 30 dias de Premium pra quem termina.
  // Cupom PESQUISA30 no Stripe: 100%, repeating, 1 mês.
  brinde: {
    titulo: "30 dias de Premium, por conta da Pólia.",
    texto: "Sem cartão. Depois dos 30 dias a conta volta pro Grátis sozinha, sem cobrança nenhuma.",
    rotulo: "Quero os 30 dias de Premium",
    plano: "premium",
    codigo: "PESQUISA30",
  },
  perguntas: [
    {
      id: "conta_polia",
      ordem: 1,
      parte: 1,
      tipo: "unica",
      titulo: "Você já criou uma conta na Pólia One?",
      opcoes: [
        { id: "sim", rotulo: "Sim" },
        { id: "nao", rotulo: "Não" },
        { id: "nao_lembro", rotulo: "Não lembro" },
      ],
    },
    {
      id: "categoria",
      ordem: 2,
      parte: 1,
      tipo: "unica",
      titulo: "O que a sua marca vende?",
      opcoes: daDiscovery("categoria"),
    },
    {
      id: "canais",
      ordem: 3,
      parte: 1,
      tipo: "multipla",
      titulo: "Onde você vende hoje?",
      ajuda: "Marca todos os lugares.",
      maxSelecoes: 8,
      opcoes: [
        { id: "instagram", rotulo: "Instagram" },
        { id: "whatsapp", rotulo: "WhatsApp" },
        { id: "site_proprio", rotulo: "Site ou loja própria" },
        { id: "shopee", rotulo: "Shopee" },
        { id: "mercado_livre", rotulo: "Mercado Livre" },
        { id: "tiktok_shop", rotulo: "TikTok Shop" },
        { id: "feira_loja_fisica", rotulo: "Feira ou loja física" },
        { id: "encomenda_direta", rotulo: "Encomenda direta, por indicação" },
        { id: "outro", rotulo: "Outro lugar" },
      ],
    },
    {
      id: "pedidos_semana",
      ordem: 4,
      parte: 1,
      tipo: "unica",
      titulo: "Quantos pedidos você recebe por semana, mais ou menos?",
      opcoes: [
        { id: "ate_5", rotulo: "Até 5" },
        { id: "6_a_20", rotulo: "De 6 a 20" },
        { id: "21_a_50", rotulo: "De 21 a 50" },
        { id: "mais_50", rotulo: "Mais de 50" },
        { id: "nao_sei", rotulo: "Não sei dizer" },
      ],
    },
    {
      id: "quem_toca",
      ordem: 5,
      parte: 1,
      tipo: "unica",
      titulo: "Quem toca o negócio hoje?",
      opcoes: daDiscovery("quem_toca"),
    },
    {
      id: "controle_hoje",
      ordem: 6,
      parte: 1,
      tipo: "multipla",
      titulo: "O que você usa hoje pra controlar pedidos, estoque e dinheiro?",
      ajuda: "Marca tudo que você usa.",
      maxSelecoes: 8,
      opcoes: [
        { id: "caderno", rotulo: "Caderno ou agenda" },
        { id: "planilha", rotulo: "Planilha" },
        { id: "bling", rotulo: "Bling" },
        { id: "tiny_olist", rotulo: "Tiny ou Olist" },
        { id: "notion", rotulo: "Notion" },
        { id: "app_banco", rotulo: "O app do banco" },
        { id: "whatsapp_cabeca", rotulo: "O WhatsApp e a cabeça" },
        { id: "outro_sistema", rotulo: "Outro sistema" },
        { id: "nada", rotulo: "Nada, ainda não controlo" },
      ],
    },
    {
      id: "gasto_ferramentas",
      ordem: 7,
      parte: 1,
      tipo: "unica",
      titulo: "Quanto você paga por mês, somando as ferramentas do negócio?",
      ajuda: "Sistema, app, agendador de posts, loja online.",
      opcoes: [
        { id: "nada", rotulo: "Nada" },
        { id: "ate_50", rotulo: "Até R$ 50" },
        { id: "50_a_150", rotulo: "De R$ 50 a R$ 150" },
        { id: "mais_150", rotulo: "Mais de R$ 150" },
        { id: "nao_sei", rotulo: "Não sei dizer" },
      ],
    },
    {
      id: "ultimo_problema",
      ordem: 8,
      parte: 1,
      tipo: "aberta",
      opcional: true,
      titulo:
        "Conta a última vez que um pedido, uma encomenda ou o estoque deu problema. O que aconteceu?",
      placeholder: "Do jeito que você contaria pra uma amiga.",
    },
    {
      id: "ferramenta_largou",
      ordem: 9,
      parte: 1,
      tipo: "aberta",
      opcional: true,
      titulo: "Você já tentou alguma ferramenta de gestão e largou? Qual, e por quê?",
      placeholder: "Pode ser app, sistema, planilha pronta.",
    },
    {
      id: "abriria_todo_dia",
      ordem: 10,
      parte: 1,
      tipo: "unica",
      titulo: "Qual destas faria você abrir um sistema de gestão todo dia?",
      opcoes: [
        { id: "pedidos_todos_canais", rotulo: "Ver os pedidos de todos os canais num lugar só" },
        { id: "estoque_sozinho", rotulo: "Estoque que baixa sozinho quando vende" },
        { id: "aviso_prazo", rotulo: "Aviso de encomenda com prazo chegando" },
        { id: "lucro_hoje", rotulo: "Ver quanto a marca lucrou hoje" },
        { id: "mensagens_um_lugar", rotulo: "Responder Instagram e WhatsApp num lugar só" },
        { id: "posts_semana", rotulo: "Deixar os posts da semana agendados" },
        { id: "outro", rotulo: "Outra coisa" },
      ],
    },
    {
      id: "polia_procurava",
      ordem: 11,
      parte: 1,
      tipo: "unica",
      opcional: true,
      titulo: "Se você criou conta na Pólia One: o que estava procurando?",
      ajuda: "Não criou conta? Pode pular.",
      opcoes: [
        { id: "quanto_cobrar", rotulo: "Saber quanto cobrar" },
        { id: "organizar_pedidos", rotulo: "Organizar pedidos e encomendas" },
        { id: "controlar_estoque", rotulo: "Controlar o estoque" },
        { id: "juntar_canais", rotulo: "Juntar as vendas de vários canais" },
        { id: "quanto_lucra", rotulo: "Saber quanto a marca lucra" },
        { id: "redes_sociais", rotulo: "Organizar as redes sociais" },
        { id: "so_conhecer", rotulo: "Só quis conhecer" },
        { id: "outro", rotulo: "Outra coisa" },
      ],
    },
    {
      id: "polia_voltou",
      ordem: 12,
      parte: 1,
      tipo: "unica",
      opcional: true,
      titulo: "Se você criou conta: depois do primeiro dia, voltou a usar?",
      ajuda: "Não criou conta? Pode pular.",
      opcoes: [
        { id: "varias_vezes", rotulo: "Voltei várias vezes" },
        { id: "uma_duas", rotulo: "Uma ou duas vezes" },
        { id: "nao_voltei", rotulo: "Não voltei" },
      ],
    },
    {
      id: "polia_faltou",
      ordem: 13,
      parte: 1,
      tipo: "aberta",
      opcional: true,
      titulo: "Se você criou conta: o que faltou pra Pólia One virar parte do seu dia?",
      placeholder: "Pode ser bem sincera.",
    },
    {
      id: "conversa_whatsapp",
      ordem: 14,
      parte: 2,
      tipo: "aberta",
      opcional: true,
      sensivel: true,
      titulo: "Topa uma conversa de 20 minutos pelo WhatsApp? Deixa seu número com DDD.",
      ajuda: "Só usamos pra marcar a conversa. Pode pular.",
      placeholder: "(11) 90000-0000",
    },
  ],
};
