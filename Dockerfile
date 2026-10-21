# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder

WORKDIR /app

# Instala dependências do sistema necessárias para compilação nativa
RUN apk add --no-cache libc6-compat

# Copia manifestos de dependência
COPY package.json package-lock.json ./

# Instalação estrita de dependências
RUN npm ci

# Copia código-fonte da aplicação
COPY . .

# Compila o projeto em modo produção
RUN npm run build

# Stage de execução enxuto
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Cria usuário não-root para segurança operacional
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 applet

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

USER applet

EXPOSE 3000

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "3000"]
