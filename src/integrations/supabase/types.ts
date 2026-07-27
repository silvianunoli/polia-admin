// Recorte mínimo dos tipos gerados do polia-app — só o que os componentes
// admin usam hoje (Json, pros campos jsonb de auditoria/analytics). As
// queries do admin seguem sem o generic Database completo por enquanto
// (mesmo padrão pragmático usado no restante deste app).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
