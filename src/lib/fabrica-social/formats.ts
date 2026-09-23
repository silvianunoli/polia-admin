/*
  Catálogo de formatos — réplica do catálogo interno do BestContent
  (dimensões e supportedPlatforms confirmados na análise do bundle).
*/

export type Platform =
  "instagram" | "facebook" | "linkedin" | "whatsapp" | "tiktok" | "youtube" | "twitter";

export interface ContentFormat {
  id: string;
  name: string;
  width: number;
  height: number;
  kind: "image" | "carousel" | "video" | "print";
  supportedPlatforms: Platform[];
}

export const FORMATS: ContentFormat[] = [
  {
    id: "post-portrait",
    name: "Post Retrato",
    width: 1080,
    height: 1350,
    kind: "image",
    supportedPlatforms: ["instagram", "facebook", "linkedin"],
  },
  {
    id: "carrossel-portrait",
    name: "Carrossel Retrato",
    width: 1080,
    height: 1350,
    kind: "carousel",
    supportedPlatforms: ["instagram", "linkedin"],
  },
  {
    id: "post-quadrado",
    name: "Post Quadrado",
    width: 1080,
    height: 1080,
    kind: "image",
    supportedPlatforms: ["instagram", "facebook", "linkedin", "whatsapp"],
  },
  {
    id: "carrossel-quadrado",
    name: "Carrossel Quadrado",
    width: 1080,
    height: 1080,
    kind: "carousel",
    supportedPlatforms: ["instagram", "linkedin"],
  },
  {
    id: "stories-unico",
    name: "Story Único",
    width: 1080,
    height: 1920,
    kind: "image",
    supportedPlatforms: ["instagram", "facebook", "whatsapp"],
  },
  {
    id: "stories-carrossel",
    name: "Stories em Sequência",
    width: 1080,
    height: 1920,
    kind: "carousel",
    supportedPlatforms: ["instagram", "whatsapp"],
  },
  {
    id: "reels",
    name: "Reels / Shorts",
    width: 1080,
    height: 1920,
    kind: "video",
    supportedPlatforms: ["instagram", "youtube", "tiktok"],
  },
  {
    id: "post-landscape",
    name: "Post Paisagem",
    width: 1200,
    height: 675,
    kind: "image",
    supportedPlatforms: ["twitter", "linkedin", "facebook"],
  },
  {
    id: "thumbnail",
    name: "Thumbnail",
    width: 1280,
    height: 720,
    kind: "image",
    supportedPlatforms: ["youtube"],
  },
  {
    id: "whatsapp-banner",
    name: "Banner WhatsApp",
    width: 1125,
    height: 600,
    kind: "image",
    supportedPlatforms: ["whatsapp"],
  },
  {
    id: "a4-portrait",
    name: "A4 Retrato",
    width: 1240,
    height: 1754,
    kind: "print",
    supportedPlatforms: [],
  },
  {
    id: "a4-landscape",
    name: "A4 Paisagem",
    width: 1754,
    height: 1240,
    kind: "print",
    supportedPlatforms: [],
  },
  {
    id: "outdoor-9x3",
    name: "Outdoor 9×3",
    width: 2400,
    height: 800,
    kind: "print",
    supportedPlatforms: [],
  },
];

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X / Twitter",
};
