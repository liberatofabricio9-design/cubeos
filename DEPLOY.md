# Deploy CubeOS (100% online)

## Railway (mais fácil)

1. Crie repositório no GitHub e envie a pasta `cubeos`.
2. Acesse https://railway.app → Login com GitHub.
3. "New Project" → "Deploy from GitHub repo" → selecione o repo.
4. "New" → "Database" → "Add PostgreSQL".
5. No serviço do app → "Variables":
   - `DATABASE_URL` = (copie de Postgres → Variables → `DATABASE_URL`)
   - `JWT_SECRET` = (gere uma string longa)
   - `STAFF_TEAM_CODE` = `CUBO-STAFF-2026`
   - `NODE_ENV` = `production`
   - `MAP_URL` = (opcional, URL do Dynmap/BlueMap)
6. "Settings" → Start Command:
   `npx prisma db push && node prisma/seed.js && node src/server.js`
7. Railway gera domínio HTTPS automaticamente.
8. Use plano **Hobby (US$5/mês)** para não dormir.

## Render (alternativa)

1. https://render.com → "New" → "Blueprint" → conecte o repo (usa render.yaml).
2. Render cria Postgres + Web Service automaticamente.
3. Configure `DATABASE_URL` nas env vars do web service (Render injeta `DATABASE_URL` do banco).
4. Plano pago para uptime 100%.

## VPS (controle total)

Veja README.md seção Deploy.

## Pós-deploy

- Login staff: usuário `admin`, senha `admin123`, código `CUBO-STAFF-2026`
- Troque a senha do admin imediatamente.
- Convite de exemplo: `CUBO-INVITE-001`
