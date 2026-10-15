# Plaquinhas: QR Codes dinâmicos para plaquinhas NFC

Cada plaquinha recebe um endereço permanente (`https://seudominio.com.br/r/AbC23xYz`). O QR Code e a tag NFC gravam esse endereço. No painel você troca o destino (avaliação do Google, WhatsApp, Instagram…) e a mesma plaquinha física passa a abrir o novo link, sem reimprimir.

## Fluxo com lotes em branco

1. **Lotes → Gerar lote**: escolha a quantidade (até 200). Cada plaquinha recebe um QR Code único, ainda sem link.
2. Na folha do lote, **Imprimir / salvar PDF** e mande para a gráfica. O código de 8 caracteres embaixo de cada QR é opcional.
3. Na instalação, com o painel aberto no celular: escaneie a plaquinha com a câmera do celular **ou** use **Escanear** dentro do painel. Plaquinha em branco abre direto a tela “Defina o link”.
4. Cole o link, informe o cliente e **Salvar e ativar**. Para trocar depois, escaneie pelo **Escanear** do painel (a câmera comum abre o link do cliente).

Visitantes que escanearem uma plaquinha em branco veem “Plaquinha ainda não ativada”, sem nenhum dado interno.

## Clientes revendedores

Quem compra plaquinhas para revender ganha um acesso próprio, que só serve para escanear e trocar o link das plaquinhas dele.

1. **Clientes → Novo cliente**: nome, e-mail e senha (gerada automaticamente, mínimo 8 caracteres). Copie o texto de acesso e envie ao cliente.
2. Na página do cliente, **Entregar lote**: todas as plaquinhas do lote passam a ser dele. Plaquinhas que já são de outro cliente não mudam. Para uma plaquinha avulsa, abra a plaquinha e escolha o cliente.
3. O cliente entra pelo mesmo endereço (`/login`), vê só as plaquinhas dele, toca em **Escanear plaquinha** e define ou troca o link. Ele também pode escanear com a câmera comum do celular se estiver logado: plaquinha em branco dele abre direto a tela de definir o link.

O que o cliente **não** consegue: ver plaquinhas de outros ou suas, criar plaquinhas, gerar lotes, ativar/desativar, excluir, ver observações internas ou acessar `/api/plates` e `/api/clients` (403). Plaquinha de outra pessoa responde como inexistente (404).

No seu painel você vê, no histórico, quem fez cada troca. **Bloquear acesso** desconecta o cliente na hora; **Gerar nova senha** derruba as sessões dele; **Excluir cliente** apaga o acesso e as plaquinhas continuam funcionando, voltando a ser só suas.

## Arquitetura

Um único serviço Node.js:

- **Express 5 + TypeScript**: API do painel (`/api/*`), rota pública `/r/:code`, `/health` e os arquivos do painel já compilados.
- **React 19 + Vite + Tailwind 4 + Lucide**: painel administrativo (em `web/`).
- **PostgreSQL + Prisma 6.19**: dados e migrations (`prisma/`).
- **Zod** para validação; **qrcode** para PNG e SVG; **helmet** e **express-rate-limit** para segurança.
- **Dockerfile** usado pelo Railway (`railway.json`).

```
server/src/
  routes/clients.ts    contas de clientes revendedores (só o dono)
  routes/me.ts         área do cliente: só as plaquinhas dele
  app.ts               montagem do Express (segurança, rotas, frontend)
  index.ts             inicialização, criação do 1º admin, desligamento gracioso
  routes/redirect.ts   GET /r/:code (público)
  routes/plates.ts     CRUD, histórico e QR Codes (privado)
  routes/auth.ts       login, sessão, logout
  lib/                 sessão, senha (scrypt), URL, código aleatório, QR
  scripts/set-admin.ts criar admin / redefinir senha
web/src/               painel React
prisma/                schema e migrations
tests/                 testes de API/integração (Vitest + PostgreSQL real)
e2e/run.mjs            teste de ponta a ponta no navegador (Chromium)
```

### Decisões importantes

- **Identificador**: 8 caracteres aleatórios (CSPRNG) de um alfabeto de 57 símbolos sem caracteres ambíguos (sem `0 O 1 I l`), cerca de 1,1 × 10¹⁴ combinações. Os IDs internos são UUID e nunca aparecem no QR Code.
- **Endereço permanente imutável**: a API rejeita qualquer campo `code` e um trigger no PostgreSQL recusa `UPDATE` do código, mesmo via SQL direto.
- **Redirecionamento**: `302` com `Cache-Control: no-store`. O destino vem somente do banco; query string e caminho extra são ignorados (sem redirecionamento aberto). Inativo: página `410`; inexistente: página `404`. Nenhum dado interno aparece nessas páginas.
- **URLs aceitas**: somente `http://` e `https://` absolutas, sem usuário/senha embutidos, sem espaços, até 2048 caracteres. O banco tem uma `CHECK` que reforça o esquema. Validar a URL não garante que o site de destino é seguro: o sistema apenas direciona para o link cadastrado.
- **Sessão**: token aleatório de 256 bits em cookie `HttpOnly`, `SameSite=Lax`, `Secure` e prefixo `__Host-` em produção. O banco guarda só o hash SHA-256 do token. Expira em 12 h (configurável).
- **CSRF**: toda requisição que altera dados exige o cabeçalho `X-CSRF-Token` vinculado à sessão; o login só aceita JSON.
- **Senha**: scrypt (N=2¹⁵, r=8, p=1), mínimo 12 caracteres. Mesmo tempo de resposta para e-mail inexistente.
- **Limites**: 10 logins errados por IP a cada 15 min; 300 req/min por IP na API; 120 req/min por IP em `/r/`. Os contadores ficam em memória (adequado para 1 instância; com várias réplicas use um store compartilhado).
- **QR Code**: correção de erro nível Q (~25%), margem de 4 módulos, preto sobre branco, sem logotipo. PNG 1024 px (tela), PNG 3000 px (impressão) e SVG vetorial. Baixar de novo gera exatamente o mesmo arquivo.

## Desenvolvimento local

Requisitos: Node 22 e PostgreSQL 14+.

```bash
cp .env.example .env          # ajuste DATABASE_URL e a senha do admin
npm install
npx prisma migrate deploy     # cria as tabelas
npm run dev                   # API em :3000 e painel em http://localhost:5173
```

## Testes

```bash
# Testes de API e integração: usam um banco separado cujo nome precisa conter "test".
createdb qrdin_test
TEST_DATABASE_URL=postgresql://usuario:senha@127.0.0.1:5432/qrdin_test npm test

# Ponta a ponta no navegador (usa o DATABASE_URL do .env e o Chromium do Playwright)
npm run build && CHROMIUM_PATH=/caminho/do/chromium npm run test:e2e
```

`npm test` compila o projeto antes, porque o teste de reinicialização sobe o build de produção como processo real, derruba e sobe de novo.

| # | Requisito | Onde |
|---|-----------|------|
| 1 | Cadastro | `tests/plates.test.ts` › 1 |
| 2 | QR Code com o endereço permanente (PNG decodificado) | › 2 |
| 3 | Redirecionamento | › 3 |
| 4 | Troca de destino sem mudar o identificador | › 4 |
| 5 | Persistência no PostgreSQL | › 5 |
| 6 | Bloqueio sem login, CSRF, sessão expirada | `tests/auth.test.ts` › 6 |
| 7 | URLs inválidas (`javascript:`, `data:`…) | › 7 |
| 8 | Códigos inexistentes | › 8 |
| 9 | Registros inativos | › 9 |
| 10 | Redirecionamento aberto | › 10 |
| 11 | Funcionamento após reinicialização | `tests/restart.test.ts` |

## Implantação no Railway

O repositório já traz `Dockerfile` e `railway.json`. A cada deploy o Railway constrói a imagem pelo `Dockerfile`. Ao iniciar, o container roda `prisma migrate deploy` (aplica só migrations pendentes; seguro de repetir) e então sobe o servidor. Se a migration falhar, o servidor não sobe e o Railway não troca o tráfego, porque `/health` não responde.

### 1. Banco de dados

1. No projeto do Railway: **+ New → Database → PostgreSQL**.
2. Aguarde o serviço `Postgres` ficar ativo. Ele cria as variáveis de conexão sozinho.

### 2. Variáveis do serviço da aplicação

No serviço ligado ao repositório, aba **Variables**:

| Variável | Valor |
|----------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referência; conexão pela rede privada) |
| `APP_BASE_URL` | `https://seu-dominio-definitivo.com.br` (sem barra no final) |
| `NODE_ENV` | `production` (a imagem já define, mas pode deixar explícito) |
| `ADMIN_EMAIL` | seu e-mail de acesso |
| `ADMIN_PASSWORD` | senha longa e única (mín. 12 caracteres) |

Não defina `PORT`: o Railway injeta automaticamente e o servidor a respeita.

> **Atenção ao `APP_BASE_URL`.** É o que fica gravado em cada QR Code e tag NFC. Se você imprimir plaquinhas com o domínio provisório `*.up.railway.app` e depois mudar para o domínio próprio, as plaquinhas antigas continuam apontando para o domínio provisório. Configure o domínio definitivo **antes** de imprimir em produção.

### 3. Primeiro deploy e primeiro administrador

1. Faça o deploy (push no GitHub ou **Deploy** no painel).
2. Nos logs do serviço, confirme `admin_created_from_env` e `server_started`.
3. Abra o domínio e faça login.
4. **Remova `ADMIN_PASSWORD` das variáveis** depois do primeiro login. O administrador só é criado a partir delas quando ainda não existe nenhum; depois disso são ignoradas.

### 4. Domínio próprio e HTTPS

1. Serviço → **Settings → Networking → Custom Domain**, informe o domínio (ex.: `qr.seudominio.com.br`) e a porta que o Railway mostrar para o serviço.
2. No seu provedor de DNS, crie o registro `CNAME` indicado pelo Railway (para domínio raiz, use o tipo que o provedor suportar: CNAME flattening/ALIAS).
3. O certificado HTTPS é emitido automaticamente pelo Railway depois que o DNS propagar.
4. Atualize `APP_BASE_URL` para esse domínio e faça novo deploy.

Se usar Cloudflare com proxy laranja, deixe o SSL em modo **Full** e evite regras de cache em `/r/*`.

### 5. Redefinir a senha do administrador

Opção A, do seu computador (precisa de Node 22 e do repositório clonado): copie a `DATABASE_PUBLIC_URL` do serviço Postgres no Railway e rode

```bash
npm install
DATABASE_URL="<DATABASE_PUBLIC_URL>" npm run admin:set-password:dev -- voce@seudominio.com.br
```

A senha é pedida no terminal sem aparecer na tela. Todas as sessões abertas são encerradas.

Opção B (não testada): acessar o container pelo `railway ssh` e rodar `npm run admin:set-password -- voce@seudominio.com.br`.

### Backup

O sistema depende só do PostgreSQL. Ative backups no serviço Postgres do Railway ou faça `pg_dump` periódico com a `DATABASE_PUBLIC_URL`.

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|----------|-------------|--------|-----------|
| `DATABASE_URL` | sim | | Conexão PostgreSQL |
| `APP_BASE_URL` | sim | | Origem pública usada nos QR Codes. `https` obrigatório em produção |
| `PORT` | não | 3000 | Porta HTTP (o Railway define) |
| `NODE_ENV` | não | development | `production` liga cookies Secure, HSTS e exige https |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | só no 1º deploy | | Cria o primeiro administrador |
| `SESSION_TTL_HOURS` | não | 12 | Duração da sessão |
| `TRUST_PROXY` | não | 1 | Proxies reversos à frente do app (Railway = 1), usado para obter o IP real nos limites de requisição |
