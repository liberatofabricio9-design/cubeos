FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN cp prisma/schema.postgres.prisma prisma/schema.prisma && npx prisma generate
COPY . .
RUN mkdir -p /app/public/uploads
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push && node prisma/seed.js && node src/server.js"]
