// Parser de CSV mínimo (RFC 4180: aspas, vírgula e aspas escapadas "").
// Sem dependência de lib externa — só isso é usado no projeto (import de
// respostas de pesquisa no admin).

export function parseCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let dentroAspas = false;
  const s = texto.replace(/\r\n/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (dentroAspas) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      dentroAspas = true;
    } else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo.length > 0 || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  return linhas.filter((l) => l.some((c) => c.trim().length > 0));
}

// Escapa um campo pra CSV (RFC 4180): aspas quando tem vírgula, aspas ou quebra de linha.
function escaparCampoCsv(valor: string): string {
  if (/[",\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

export function gerarCsv(cabecalho: string[], linhas: string[][]): string {
  const todas = [cabecalho, ...linhas];
  return todas.map((linha) => linha.map(escaparCampoCsv).join(",")).join("\r\n");
}

// Baixa o CSV com BOM UTF-8 (senão o Excel abre acento quebrado no Windows).
export function baixarCsv(nomeArquivo: string, conteudo: string): void {
  const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
