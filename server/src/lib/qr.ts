import QRCode from "qrcode";

// Nível Q (~25% de redundância): tolera riscos e reflexos no acrílico, mantendo o código pouco denso
// porque o endereço permanente é curto. Margem de 4 módulos = zona de silêncio recomendada pela norma.
const BASE = {
  errorCorrectionLevel: "Q" as const,
  margin: 4,
  color: { dark: "#000000", light: "#ffffff" },
};

export const PNG_SIZES = { screen: 1024, print: 3000 } as const;

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { ...BASE, type: "svg" });
}

export function qrPng(text: string, width: number): Promise<Buffer> {
  return QRCode.toBuffer(text, { ...BASE, type: "png", width });
}
