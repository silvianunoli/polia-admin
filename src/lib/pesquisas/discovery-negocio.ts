// Pesquisa de discovery da Pólia (pública e anônima).
//
// Enxuta (15 perguntas) pra tráfego frio: quanto mais curta, mais respostas, e a
// validação vem da largura. Só fica o que testa hipótese ou segmenta a leitura.
//
// Público AMPLIADO: a 1ª pergunta (estagio) classifica quem já vende, quem
// começou agora e quem ainda não vende (tá planejando). As perguntas que
// pressupõem venda têm uma opção de escape ("ainda não vendo / defini") pra
// iniciante não travar. Fluxo linear, sem caminhos separados (KISS).
//
// Posicionamento marca-primeiro: o bloco de marca/valor (compra_pesa, tem_marca,
// inseguranca) é o que valida a tese "a dor lidera pela marca, não só pelo preço".

import type { PesquisaConfig } from "./tipos";

export const discoveryNegocio: PesquisaConfig = {
  slug: "discovery-negocio",
  perguntas: [
    {
      id: "estagio",
      ordem: 1,
      parte: 1,
      tipo: "unica",
      titulo: "Onde você está com o seu negócio hoje?",
      opcoes: [
        { id: "ja_vendo", rotulo: "Já vendo faz um tempo" },
        { id: "comecei", rotulo: "Comecei a vender agora, poucas vendas" },
        { id: "planejando", rotulo: "Ainda não vendo, tô planejando começar" },
      ],
    },
    {
      id: "categoria",
      ordem: 2,
      parte: 1,
      tipo: "unica",
      titulo: "O que você vende, ou pretende vender?",
      opcoes: [
        { id: "moda_acessorios", rotulo: "Roupa, bolsa e acessórios" },
        { id: "moda_intima_fitness", rotulo: "Moda íntima e fitness (lingerie, roupa de treino)" },
        { id: "beleza_estetica", rotulo: "Beleza e estética (salão, unha, cílios, sobrancelha)" },
        { id: "cosmeticos", rotulo: "Cosméticos e perfumaria (maquiagem, perfume, cremes)" },
        { id: "artesanato", rotulo: "Artesanato e coisas feitas à mão" },
        { id: "comida", rotulo: "Comida e doces (bolo, salgado, marmita)" },
        { id: "saude_bem_estar", rotulo: "Saúde e bem-estar (nutrição, terapia, personal)" },
        { id: "servicos", rotulo: "Serviços (consultoria, design, fotografia, redes sociais)" },
        { id: "educacao", rotulo: "Aulas, cursos ou mentoria" },
        { id: "digital", rotulo: "Produto digital (e-book, curso online, modelo pronto)" },
        { id: "casa_decoracao", rotulo: "Casa e decoração" },
        { id: "papelaria_presentes", rotulo: "Papelaria e presentes personalizados" },
        { id: "pet", rotulo: "Coisas pra pet (produtos ou serviços)" },
        { id: "infantil", rotulo: "Infantil (roupa, brinquedo, festa)" },
        { id: "revenda", rotulo: "Revenda ou catálogo de outras marcas" },
        { id: "outro", rotulo: "Outra coisa" },
      ],
    },
    {
      id: "quem_toca",
      ordem: 3,
      parte: 1,
      tipo: "unica",
      titulo: "Quem toca o negócio hoje?",
      opcoes: [
        { id: "so_eu", rotulo: "Só eu" },
        { id: "ajuda_informal", rotulo: "Eu e uma ajuda informal (família, parceria)" },
        { id: "contratadas_1_2", rotulo: "Eu e 1 ou 2 contratadas" },
        { id: "equipe_3", rotulo: "Uma equipe de 3 ou mais" },
      ],
    },
    {
      id: "faturamento",
      ordem: 4,
      parte: 1,
      tipo: "unica",
      opcional: true,
      titulo: "Quanto o negócio fatura por mês, mais ou menos?",
      opcoes: [
        { id: "ainda_nao", rotulo: "Ainda não faturo" },
        { id: "ate_1k", rotulo: "Até R$1 mil" },
        { id: "1_3k", rotulo: "De R$1 a 3 mil" },
        { id: "3_10k", rotulo: "De R$3 a 10 mil" },
        { id: "mais_10k", rotulo: "Mais de R$10 mil" },
        { id: "nao_dizer", rotulo: "Prefiro não dizer" },
      ],
    },
    {
      id: "preco_como",
      ordem: 5,
      parte: 1,
      tipo: "unica",
      titulo: "Quando você definiu o preço do seu último produto ou serviço, como chegou no valor?",
      opcoes: [
        { id: "copiei", rotulo: "Copiei de quem vende parecido" },
        { id: "margem_olho", rotulo: "Somei o custo e coloquei um valor em cima, no olho" },
        { id: "perguntei", rotulo: "Perguntei pra alguém" },
        { id: "planilha", rotulo: "Fiz conta em planilha" },
        { id: "justo", rotulo: "Botei o valor que me pareceu justo" },
        { id: "nao_calculei", rotulo: "Não parei pra calcular" },
        { id: "ainda_nao", rotulo: "Ainda não defini preço" },
      ],
    },
    {
      id: "separa_dinheiro",
      ordem: 6,
      parte: 1,
      tipo: "unica",
      titulo: "Você separa o dinheiro do negócio do seu dinheiro pessoal?",
      opcoes: [
        { id: "sempre", rotulo: "Sempre" },
        { id: "as_vezes", rotulo: "Às vezes" },
        { id: "tudo_junto", rotulo: "Não, é tudo junto" },
      ],
    },
    {
      id: "onde_clareza",
      ordem: 7,
      parte: 1,
      tipo: "multipla",
      maxSelecoes: 2,
      titulo: "O que mais te faz sentir falta de clareza no negócio hoje?",
      ajuda: "Escolha até 2.",
      opcoes: [
        { id: "quanto_cobrar", rotulo: "Não sei quanto cobrar" },
        { id: "dou_lucro", rotulo: "Não sei se dou lucro de verdade" },
        { id: "controle_caixa", rotulo: "Perco o controle do que entra e sai" },
        { id: "diferencial", rotulo: "Não sei o que me diferencia" },
        { id: "acham_caro", rotulo: "Minha cliente acha caro ou não entende meu valor" },
        { id: "quem_e_cliente", rotulo: "Não sei quem é a minha cliente" },
        { id: "no_controle", rotulo: "Me sinto no controle" },
      ],
    },
    {
      id: "aperto",
      ordem: 8,
      parte: 1,
      tipo: "aberta",
      opcional: true,
      titulo: "Com as suas palavras: qual é o maior aperto ou dúvida sobre o seu negócio hoje?",
      ajuda: "Opcional, mas é a resposta que mais ajuda.",
      placeholder: "Escreve com as suas palavras...",
    },
    {
      id: "organiza_hoje",
      ordem: 9,
      parte: 1,
      tipo: "unica",
      titulo: "Como você organiza as contas e o planejamento hoje?",
      opcoes: [
        { id: "caderno", rotulo: "Caderno ou papel" },
        { id: "planilha", rotulo: "Planilha própria" },
        { id: "app_financas", rotulo: "App de finanças" },
        { id: "de_cabeca", rotulo: "É tudo de cabeça" },
        { id: "contador", rotulo: "Meu contador cuida" },
        { id: "nao_organizo", rotulo: "Não organizo" },
      ],
    },
    {
      id: "ja_pagou",
      ordem: 10,
      parte: 1,
      tipo: "unica",
      titulo:
        "Você já pagou por algo pra ajudar no negócio (curso, mentoria, ferramenta, consultoria)?",
      opcoes: [
        { id: "nunca", rotulo: "Nunca" },
        { id: "uma", rotulo: "Uma vez" },
        { id: "varias", rotulo: "Mais de uma vez" },
      ],
    },
    {
      id: "compra_pesa",
      ordem: 11,
      parte: 1,
      tipo: "unica",
      titulo: "Na hora que alguém decide comprar de você, o que pesa mais?",
      opcoes: [
        { id: "preco", rotulo: "O preço" },
        { id: "marca", rotulo: "O que a minha marca representa" },
        { id: "os_dois", rotulo: "Os dois igual" },
        { id: "ainda_nao", rotulo: "Ainda não vendi pra saber" },
        { id: "nao_sei", rotulo: "Sinceramente, não sei" },
      ],
    },
    {
      id: "tem_marca",
      ordem: 12,
      parte: 1,
      tipo: "unica",
      titulo: "Você sente que tem uma marca, ou que só vende produtos?",
      opcoes: [
        { id: "tenho", rotulo: "Tenho uma marca" },
        { id: "construindo", rotulo: "Tô construindo" },
        { id: "so_vendo", rotulo: "Sinto que só vendo produtos" },
      ],
    },
    {
      id: "inseguranca",
      ordem: 13,
      parte: 1,
      tipo: "unica",
      titulo: "O que te dá mais insegurança hoje?",
      opcoes: [
        { id: "marca", rotulo: "A minha marca e identidade" },
        { id: "precos", rotulo: "Os meus preços" },
        { id: "numeros", rotulo: "Os meus números" },
        { id: "nada", rotulo: "Nada, tô segura" },
      ],
    },
    {
      id: "trava",
      ordem: 14,
      parte: 1,
      tipo: "unica",
      titulo: "O que mais te trava pra resolver isso?",
      opcoes: [
        { id: "tempo", rotulo: "Falta de tempo" },
        { id: "comecar", rotulo: "Não sei por onde começar" },
        { id: "complicado", rotulo: "Parece complicado demais" },
        { id: "nao_deu", rotulo: "Já tentei e não deu certo" },
        { id: "nao_confio", rotulo: "Não confio em curso ou ferramenta" },
        { id: "custo", rotulo: "O custo" },
        { id: "nada", rotulo: "Nada me trava" },
      ],
    },
    {
      id: "episodio",
      ordem: 15,
      parte: 1,
      tipo: "aberta",
      opcional: true,
      titulo:
        "Me conta a última vez que você se sentiu perdida ou insegura numa decisão do negócio. O que aconteceu?",
      ajuda: "Opcional. É a pergunta de história, a que mais rende.",
      placeholder: "Conta como foi...",
    },
  ],
};
