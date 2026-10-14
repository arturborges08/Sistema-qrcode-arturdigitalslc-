import type { Response } from "express";

// Páginas públicas estáticas. Nenhum dado do banco é interpolado aqui.
const PAGES = {
  notFound: {
    title: "Link não encontrado",
    body: "Este QR Code ou etiqueta NFC não está associado a nenhum endereço. Verifique se o código foi lido por completo ou fale com o estabelecimento.",
  },
  inactive: {
    title: "Link temporariamente indisponível",
    body: "Esta plaquinha está desativada no momento. Se você é o responsável pelo estabelecimento, entre em contato com o fornecedor da plaquinha.",
  },
  error: {
    title: "Não foi possível abrir o link",
    body: "Ocorreu um erro temporário. Tente ler o código novamente em alguns instantes.",
  },
} as const;

export type PageKind = keyof typeof PAGES;

const CSS = `
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f6f6f4;color:#1c1c1a;display:flex;align-items:center;justify-content:center;padding:24px}
main{max-width:420px;background:#fff;border:1px solid #e4e4e0;border-radius:14px;padding:32px 28px;text-align:center}
.icon{width:44px;height:44px;border-radius:50%;background:#f0efeb;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:22px;color:#6b6b66}
h1{font-size:19px;margin:0 0 10px;font-weight:600}p{margin:0;color:#5a5a55;line-height:1.55;font-size:15px}
`;

export function sendPage(res: Response, status: number, kind: PageKind) {
  const p = PAGES[kind];
  res
    .status(status)
    .set({
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    })
    .send(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${p.title}</title><style>${CSS}</style></head><body><main><div class="icon" aria-hidden="true">!</div><h1>${p.title}</h1><p>${p.body}</p></main></body></html>`,
    );
}
