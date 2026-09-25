---
target: src/routes/trafego.tsx
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:C:\\Users\\silnu\\Desktop\\Novo Projeto\\polia-admin\\src\\routes\\trafego.tsx"
target_fingerprint: "sha256:066e71cf3827eb5a09db0a2241d971f08dbeded2fe73e51be3d8c5ff4a93945c"
target_path: "C:\\Users\\silnu\\Desktop\\Novo Projeto\\polia-admin\\src\\routes\\trafego.tsx"
timestamp: 2026-09-25T17-31-30Z
slug: src-routes-trafego-tsx
---
Method: dual-agent (Assessment A: revisão de design · Assessment B: detector automático + evidência de navegador, dois sub-agentes independentes)

## Nota de saúde do design

| # | Heurística | Nota | Achado |
|---|---|---|---|
| 1 | Visibilidade do status do sistema | 3 | Skeletons de carregamento e "Atualizado às Xh" funcionam; o ícone de refresh não anima durante o carregamento |
| 2 | Compatibilidade com o mundo real | 3 | Vocabulário certo de ads (CPL, CTR, orçamento diário) |
| 3 | Controle e liberdade do usuário | 1 | Sem seletor de período, sem descartar alerta, sem ordenar, sem exportar |
| 4 | Consistência e padrões | 3 | Reaproveita 100% os tokens/classes do resto do admin |
| 5 | Prevenção de erro | 3 | Página só leitura, botão desabilita durante carregamento |
| 6 | Reconhecimento, não memorização | 3 | Dados ficam visíveis; expandir/recolher uma campanha refaz a busca |
| 7 | Flexibilidade e eficiência | 1 | Ordenação fixa por gasto, sem ordenar coluna, sem atalho |
| 8 | Estética e design minimalista | 2 | Tokens limpos, mas avisos aparecem antes dos números que importam |
| 9 | Recuperação de erro | 2 | Erro cru da API do Meta aparece direto na tela, sem tradução |
| 10 | Ajuda e documentação | 1 | Os limiares dos alertas (R$20, 1,5x CPL, 30 dias) não são explicados em lugar nenhum |
| **Total** | | **22/40** | **Aceitável** |

## Veredito de especificidade

A casca é sob medida (tokens, cores, tipografia corretos), mas a estrutura é genérica: alertas empilhados → 4 cards de peso igual → 2 gráficos → tabela densa é o mesmo padrão de qualquer dashboard admin. Scan automático: 0 achados (limpo tecnicamente). Evidência de navegador: screenshot travou após 30s, agente abortou sem insistir — inconclusivo, mas vale monitorar.

## O que está funcionando

- Disciplina de token: zero cor fora da paleta
- BarrasDiarias: gráfico leve, dias sem gasto em opacidade reduzida em vez de sumir
- Progressive disclosure: detalhe por anúncio só carrega ao expandir

## Problemas prioritários

- **[P0] Alertas dominam a primeira dobra** — bloco de avisos sem limite, sem ordenação, direto abaixo do cabeçalho, antes dos cards de resumo.
- **[P0] Expandir campanha é inacessível por teclado** — linha clicável sem role/tabIndex/aria-expanded.
- **[P1] Erro técnico cru aparece na tela** — mensagem original da API do Meta, sem tradução.
- **[P1] Variação sem cor/sinal** — "+12% vs. período anterior" sempre no mesmo cinza.
- **[P2] Tabela só ordena por gasto** — não dá pra ordenar por CPL ou zero-lead.

## Red flags por persona

**Alex**: rola por até 4 alertas antes dos números; cards com peso visual igual; ordenação não responde "o que está sangrando dinheiro".
**Sam**: linha expansível inalcançável por teclado; alertas novos não anunciados (sem aria-live); coluna do ícone sem nome acessível.

## Observações menores

Ícone de atualizar não gira; miniatura sem imagem vira quadrado cinza "quebrado"; "Custo/Lead" vs "Custo por Lead" — nome diferente pra mesma coisa.

## Perguntas

1. Qual dos 4 números deveria dominar visualmente?
2. Alerta e resumo saudável deveriam dividir a mesma tela?
3. A tabela deveria ordenar por "quem precisa de atenção" em vez de gasto?
