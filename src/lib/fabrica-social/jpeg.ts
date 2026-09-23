/*
  Converte imagem para JPEG no navegador.

  Existe por causa do TikTok: o post de fotos dele só aceita JPEG e WebP, e a
  arte exportada aqui (e a maioria do que a pessoa sobe) é PNG. Converter no
  upload, e não na hora de publicar, é a única saída — a edge function roda em
  Deno, sem canvas, e não tem como redesenhar a imagem.

  O Instagram aceita JPEG sem restrição (é até o formato que a Graph API
  documenta), então a conversão não custa nada do outro lado. Só é feita quando
  o TikTok está entre os destinos: post só de Instagram continua subindo o
  arquivo original, como sempre subiu.

  Fundo branco por baixo: JPEG não tem transparência, e sem o fundo um PNG
  com área transparente sairia preto.
*/
export async function paraJpeg(file: File, qualidade = 0.92): Promise<File> {
  if (file.type === "image/jpeg") return file;
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas indisponível para converter a imagem");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);

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
