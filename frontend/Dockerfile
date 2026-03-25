FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ARG DATABASE_URL=postgresql://postgres:postgres@postgres:5432/messenger_stage1?schema=public
ARG SESSION_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
ARG SESSION_COOKIE_SECURE=false
ARG OPENAI_API_KEY=

ENV DATABASE_URL=$DATABASE_URL
ENV SESSION_SECRET=$SESSION_SECRET
ENV SESSION_COOKIE_SECURE=$SESSION_COOKIE_SECURE
ENV OPENAI_API_KEY=$OPENAI_API_KEY

COPY package*.json ./
COPY prisma ./prisma
COPY scripts ./scripts

RUN npm ci
RUN npm run prisma:generate

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
