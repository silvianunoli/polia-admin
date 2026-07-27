// Recorte da tabela blog_posts do polia-app (fonte da verdade: types.ts
// gerado lá). Este app usa client Supabase "solto" (sem generic Database).
export interface BlogPost {
  id: string;
  titulo: string;
  slug: string;
  resumo: string | null;
  categoria: string | null;
  conteudo_md: string | null;
  capa_url: string | null;
  tempo_leitura: number | null;
  publicado: boolean;
  publicado_em: string | null;
  agendado_para: string | null;
  autor_id: string | null;
  created_at: string;
  updated_at: string;
}

export type BlogPostInsert = Partial<BlogPost> & Pick<BlogPost, "titulo" | "slug">;
export type BlogPostUpdate = Partial<BlogPost>;
