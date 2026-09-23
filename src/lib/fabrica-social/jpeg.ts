/*
  Converte imagem para JPEG e limita o tamanho, no navegador.

  Existe por causa do TikTok: o post de fotos dele só aceita JPEG e WebP, no
  máximo 1080×1920 (o lado maior até 1920, o menor até 1080) — e a arte
  exportada aqui (e a maioria do que a pessoa sobe) é PNG, às vezes maior do
  que isso quando vem direto de uma ferramenta de IA. Converter e redimensionar
  no upload, e não na hora de publicar, é a única saída — a edge function roda
  em Deno, sem canvas, e não tem como redesenhar a imagem.

  Medido em produção em 24/09/2026: uma foto 1536×2752 (vinda de upload direto,
  sem passar pelo Editor) voltou do TikTok com `picture_size_check_failed` —
  o container é criado, mas o processamento recusa depois. Por isso o
  redimensionamento entra aqui, não só a troca de formato.

  O Instagram aceita JPEG sem restrição de tamanho relevante aqui (é até o
  formato que a Graph API documenta), então isso não custa nada do outro lado.
  Só roda quando o TikTok está entre os destinos: post só de Instagram continua
  subindo o arquivo original, como sempre subiu.

  Fundo branco por baixo: JPEG não tem transparência, e sem o fundo um PNG
  com área transparente sairia preto.
*/
const TIKTOK_LADO_MAIOR = 1920;
const TIKTOK_LADO_MENOR = 1080;

export async function paraJpeg(file: File, qualidade = 0.92): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  try {
    const maior = Math.max(bitmap.width, bitmap.height);
    const menor = Math.min(bitmap.width, bitmap.height);
    let escala = 1;
    if (maior > TIKTOK_LADO_MAIOR) escala = Math.min(escala, TIKTOK_LADO_MAIOR / maior);
    if (menor > TIKTOK_LADO_MENOR) escala = Math.min(escala, TIKTOK_LADO_MENOR / menor);

    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);

    // Já é JPEG e já cabe no limite: nada a fazer, evita reprocessar à toa.
    if (file.type === "image/jpeg" && escala === 1) return file;

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas indisponível para converter a imagem");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, largura, altura);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", qualidade),
    );
    if (!blob) throw new Error("não consegui converter a imagem para JPEG");

    const nome = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nome, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
