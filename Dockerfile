# --- Etapa 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias e instalarlas
COPY package*.json ./
RUN npm ci

# Copiar el código fuente y compilar TypeScript a JavaScript
COPY . .
RUN npm run build

# --- Etapa 2: Producción ---
FROM node:20-alpine AS runner

WORKDIR /app

# Transporte HTTP (el servidor por defecto usa stdio, que no sirve en un contenedor)
ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    PORT=3000

# Instalar solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar la compilación desde la etapa anterior
COPY --from=builder /app/dist ./dist

# Ejecutar como usuario no root que trae la imagen oficial
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1

# Ejecutar el servidor MCP
CMD ["node", "dist/index.js"]
