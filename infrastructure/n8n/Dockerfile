# ADR-012: Imagen n8n con @healthradar/core embebido
# La biblioteca de decisiones se ejecuta dentro del proceso Node.js de n8n (Δ RAM ≈ 0).
# No se añaden procesos ni contenedores adicionales al stack Docker Compose.
#
# Correcciones aplicadas:
#   - USER root para crear directorios, chown para que node pueda leer
#   - mkdir -p del scope @healthradar antes del symlink
#   - npm ci --omit=dev para instalar solo dependencias de producción

FROM n8nio/n8n:2.35.7

# Copiar la biblioteca de decisiones
USER root
COPY src/core/ /opt/healthradar-core/

# Instalar dependencias de producción (sin devDependencies)
RUN cd /opt/healthradar-core && npm ci --omit=dev

# Crear symlink para que require('@healthradar/core') funcione.
# mkdir -p del scope @healthradar/ es necesario para que el symlink no se rompa.
RUN mkdir -p /usr/local/lib/node_modules/@healthradar && \
    ln -s /opt/healthradar-core /usr/local/lib/node_modules/@healthradar/core && \
    chown -R node:node /opt/healthradar-core /usr/local/lib/node_modules/@healthradar

# Volver al usuario node (la imagen n8nio/n8n corre como node)
USER node

# Habilitar el require desde nodos Code de n8n (lista blanca)
ENV NODE_FUNCTION_ALLOW_EXTERNAL=@healthradar/core
