// Gera um vídeo .y4m (formato aceito pela câmera falsa do Chromium) mostrando um QR Code.
import fs from "node:fs";
import QRCode from "qrcode";

export async function writeQrVideo(text, path, { width = 640, height = 480, frames = 10 } = {}) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "Q" });
  const n = qr.modules.size;
  const margin = 4;
  const scale = Math.floor(Math.min(width, height) * 0.8 / (n + margin * 2));
  const total = (n + margin * 2) * scale;
  const ox = Math.floor((width - total) / 2);
  const oy = Math.floor((height - total) / 2);
  const Y = Buffer.alloc(width * height, 235);
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.modules.get(r, c))
        for (let y = 0; y < scale; y++)
          Y.fill(16, (oy + (r + margin) * scale + y) * width + ox + (c + margin) * scale, (oy + (r + margin) * scale + y) * width + ox + (c + margin + 1) * scale);
  const UV = Buffer.alloc((width / 2) * (height / 2), 128);
  const parts = [Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < frames; f++) parts.push(Buffer.from("FRAME\n"), Y, UV, UV);
  fs.writeFileSync(path, Buffer.concat(parts));
}
