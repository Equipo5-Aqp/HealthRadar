# ============================================================
# Etapas:
#   1. deps    → instala dependencias de producción
#   2. builder → compila el proyecto Next.js
#   3. runner  → imagen mínima Alpine con solo los artefactos necesarios
# ============================================================

# ── Etapa 1: deps ────────────────────────────────────────────
# Instala SOLO las dependencias declaradas en package.json.
# Al separarlo del build, Docker puede cachear esta capa si
# package.json no cambia, acelerando rebuilds posteriores.
FROM node:20-alpine AS deps

# libc6-compat es necesario para compatibilidad de binarios en Alpine
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copiar solo los manifests primero para aprovechar la caché de capas
COPY package.json package-lock.json ./

# Instala dependencias de producción y desarrollo (necesarias para el build)
RUN npm ci --frozen-lockfile


# ── Etapa 2: builder ─────────────────────────────────────────
# Tiene acceso a node_modules de la etapa anterior y al código fuente.
# Ejecuta `next build` que, con output: 'standalone', genera
# .next/standalone/ — un servidor Node.js autocontenido.
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar dependencias instaladas en la etapa anterior
COPY --from=deps /app/node_modules ./node_modules

# Copiar todo el código fuente
COPY . .

# Variables de entorno requeridas para el build de Next.js
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# ── Etapa 3: runner ──────────────────────────────────────────
# Imagen final mínima. Solo contiene:
#   - .next/standalone/   → servidor Node.js con deps de prod embebidas
#   - .next/static/       → assets estáticos (CSS, JS del cliente)
#   - public/             → archivos públicos (si existieran)
# No contiene: código fuente, node_modules completos, ni herramientas de build.
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Usar el puerto estándar; puede sobreescribirse en docker-compose
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Herramienta para el HEALTHCHECK del docker-compose
RUN apk add --no-cache wget

# Crear usuario no-root para mayor seguridad (ADR-008)
RUN addgroup --system --gid 1001 nodejs && \
  adduser  --system --uid 1001 nextjs

# Copiar artefactos de build desde la etapa builder
# standalone/ ya incluye un server.js y las deps de producción necesarias
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copiar carpeta public si existe (Next.js la sirve desde standalone)
# La instrucción no falla si la carpeta no existe gracias al wildcard
COPY --from=builder --chown=nextjs:nodejs /app/public* ./public/

# Cambiar a usuario no-root
USER nextjs

EXPOSE 3000

# Healthcheck interno del contenedor
# wget más liviano que curl en Alpine
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

# Arranque: Next.js standalone genera server.js en la raíz de standalone/
CMD ["node", "server.js"]