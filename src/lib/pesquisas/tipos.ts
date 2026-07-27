// Tipos compartilhados por toda pesquisa (config + agregação + páginas).
// Uma pesquisa é um PesquisaConfig; o registro em registro.ts lista todas.

export type TipoPergunta = "unica" | "multipla" | "aberta";

export interface OpcaoPergunta {
  id: string;
  rotulo: string;
}

export interface Pergunta {
  id: string; // estável: é a chave em pesquisa_respostas.respostas
  ordem: number;
  parte: 1 | 2; // 1 = seu negócio, 2 = sobre você (perfil opcional)
  tipo: TipoPergunta;
  titulo: string;
  ajuda?: string;
  opcional?: boolean; // pode pular sem responder
  sensivel?: boolean; // dado pessoal (LGPD): sempre opcional + "prefiro não dizer"
  opcoes?: OpcaoPergunta[]; // unica / multipla
  maxSelecoes?: number; // multipla
  placeholder?: string; // aberta
}

export interface PesquisaConfig {
  slug: string;
  perguntas: Pergunta[];
}
