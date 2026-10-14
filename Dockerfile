# syntax=docker/dockerfile:1

# ---------- Build ----------
FROM node:22-bookworm AS build
WORKDIR /app
ENV PRISMA_HIDE_UPDATE_MESSAGE=1 NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
COPY package.json package-lock.json ./
COPY prisma ./prisma
# O segredo opcional "ca" só existe em ambientes de build atrás de proxy corporativo; no Railway é ignorado.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- Runtime ----------
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PRISMA_HIDE_UPDATE_MESSAGE=1 NPM_CONFIG_UPDATE_NOTIFIER=false
# A imagem slim não traz OpenSSL, exigido pelos binários do Prisma. Copiamos as bibliotecas da
# imagem de build (mesma base Debian bookworm) em vez de depender do apt durante o build.
COPY --from=build /usr/lib/x86_64-linux-gnu/libssl.so.3 /usr/lib/x86_64-linux-gnu/libcrypto.so.3 /usr/lib/x86_64-linux-gnu/
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
