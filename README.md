# CubeOS

Terminal web (SMP de Minecraft) com estética preto + laranja (#ff7a1a). Jogadores fazem login e usam um "computador" no navegador; staff tem painel extra.

## Stack

- Front: HTML/CSS/JS puro (visual mantido do layout original)
- Back: Node.js + Express + Socket.IO
- Banco: SQLite via Prisma (troque por PostgreSQL alterando `DATABASE_URL`)
- Segurança: bcrypt, JWT em cookie httpOnly, rate limit, CSRF, helmet, validação com zod

## Instalação

```bash
cd cubeos
npm install
cp .env.example .env   # no Windows: copy .env.example .env
# edite .env (JWT_SECRET, STAFF_TEAM_CODE, etc.)
npx prisma db push
npm run db:seed
npm start
```

Acesse http://localhost:3000

Credenciais iniciais (seed):
- Staff: usuário `admin`, senha `admin123`, código da equipe = valor de `STAFF_TEAM_CODE` (padrão `CUBO-STAFF-2026`)
- Convite de exemplo: `CUBO-INVITE-001`

## Variáveis de ambiente (.env)

| Variável | Descrição |
|---|---|
| DATABASE_URL | `file:./dev.db` (SQLite) |
| JWT_SECRET | segredo longo para JWT |
| STAFF_TEAM_CODE | código da equipe para login staff |
| PORT | porta (3000) |
| NODE_ENV | development/production |
| UPLOAD_DIR | pasta de uploads |
| MAX_UPLOAD_MB | limite de upload (5) |
| MAP_URL | URL do Dynmap/BlueMap (iframe) |

## Estrutura de pastas

```
cubeos/
├── package.json
├── .env / .env.example
├── prisma/schema.prisma, seed.js
├── src/
│   ├── server.js
│   ├── config.js, db.js
│   ├── middleware/ (auth, rateLimit, csrf)
│   ├── routes/ (auth, staffAuth, users, messages, games, rules, files, staff, settings, announcements, reports, map)
│   ├── sockets/chat.js
│   └── utils/sanitize.js
└── public/
    ├── index.html
    ├── js/app.js
    └── uploads/
```

## Rotas da API

### Auth jogador
- POST /api/auth/register-request
- POST /api/auth/login
- POST /api/auth/logout
- GET  /api/auth/me

### Auth staff
- POST /api/staff/auth/login
- POST /api/staff/auth/logout
- GET  /api/staff/auth/me

### Usuário
- GET  /api/users/me
- PUT  /api/users/me
- POST /api/users/change-password
- GET  /api/users/ranking
- GET  /api/users/:nick/profile
- GET  /api/users/skin/:nick

### Mensagens
- GET  /api/messages/channels
- GET  /api/messages/history?channel=
- POST /api/messages
- DELETE /api/messages/:id (staff)

### Jogos
- GET  /api/games/ranking
- GET  /api/games/quiz
- POST /api/games/quiz/answer
- GET  /api/games/raffle
- GET  /api/games/minerador
- POST /api/games/minerador/click

### Regras / Mapa / Arquivos / Config
- GET  /api/rules
- GET  /api/map/config
- GET  /api/files
- POST /api/files/upload
- DELETE /api/files/:id
- GET  /api/settings
- PUT  /api/settings
- GET  /api/announcements
- POST /api/reports

### Staff (protegidas por papel)
- GET  /api/staff/stats
- GET  /api/staff/players?search=
- POST /api/staff/players/:id/warn
- POST /api/staff/players/:id/ban
- POST /api/staff/players/:id/unban
- GET  /api/staff/access-requests
- POST /api/staff/access-requests/:id/approve
- POST /api/staff/access-requests/:id/reject
- GET  /api/staff/reports
- POST /api/staff/reports/:id/resolve
- GET/POST/PUT/DELETE /api/staff/rules
- GET/POST/DELETE /api/staff/quiz
- GET/POST/DELETE /api/staff/announcements
- GET  /api/staff/audit-logs
- POST /api/staff/invite-codes

## Deploy (100% online)

### Opção A — Docker (VPS ou qualquer servidor)
```bash
docker compose up -d --build
```
Sobe Postgres + app com restart automático. Edite `docker-compose.yml` (JWT_SECRET, STAFF_TEAM_CODE, MAP_URL).

### Opção B — VPS (Ubuntu) com PM2
```bash
# instalar Node 20, Postgres, nginx
npm i -g pm2
cp .env.example .env  # configure DATABASE_URL para Postgres
npx prisma db push
npm run db:seed
pm2 start src/server.js --name cubeos
pm2 startup && pm2 save
```
Nginx reverse proxy para a porta 3000 com HTTPS (Let's Encrypt).

### Opção C — Render/Railway
Use o Dockerfile. Configure as variáveis de ambiente no painel. Para 100% uptime, use plano pago (sem sleep).

## WebSocket

Socket.IO em `/`. Eventos: `join`, `message`, `typing`, `presence`.

## Segurança

- Senhas com bcrypt.
- JWT em cookie httpOnly, SameSite=strict.
- Rate limit em /api/auth e /api/staff/auth.
- CSRF via token double-submit.
- Validação com zod + sanitize-html.
- Permissões checadas no servidor por papel.
- Upload limitado por tipo e tamanho.
