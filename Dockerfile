# ---------- 1. base stage: install ALL deps once ----------
FROM node:18-alpine AS base

WORKDIR /app

# bash is required by our startup.sh (App Runner uses /bin/sh by default otherwise)
RUN apk add --no-cache bash

# Copy manifests early for better layer caching
COPY package*.json ./

# Add cache-busting to handle dependency updates
RUN echo "Cache bust: $(date)" > /tmp/cache-bust.txt

# Install ALL deps (not --only=production).
# We need prisma CLI + devDeps available at runtime because startup.sh calls npx prisma.
# NOTE: package.json runs `postinstall: prisma generate`, but the Prisma schema
# isn't in the image yet (we only copied package*.json). We install deps without
# lifecycle scripts, then run prisma generate after copying the schema in build.
RUN npm ci --no-audit --no-fund --ignore-scripts && npm cache clean --force


# ---------- 2. development stage: for local dev / hot reload ----------
FROM node:18-alpine AS development

WORKDIR /app
RUN apk add --no-cache bash

COPY package*.json ./
RUN npm ci

COPY . .

# generate Prisma client for local dev
RUN npx prisma generate

EXPOSE 3000
CMD ["npm", "run", "start:dev"]


# ---------- 3. build stage: compile the app ----------
FROM base AS build

# Bring in the full source (ts, prisma schema, scripts, etc.)
COPY . .

# Generate Prisma client (ensures dist can import @prisma/client types)
RUN echo "Generating Prisma client during build..." && \
    npx prisma generate && \
    echo "Prisma client generation completed"

# Verify Prisma client was generated and show contents
RUN echo "Verifying Prisma client generation..." && \
    ls -la /app/node_modules/.prisma/client/ && \
    echo "Prisma client verification successful"

# Build NestJS -> dist/
RUN npm run build


# ---------- 4. production/runtime stage ----------
FROM node:18-alpine AS production

WORKDIR /app

# runtime needs bash for startup.sh
RUN apk add --no-cache bash

# create app dir owned by node (so node user can read/exec startup.sh etc.)
RUN chown -R node:node /app

# Copy node_modules (already installed with ALL deps in base)
COPY --from=base /app/node_modules ./node_modules

# Copy runtime artifacts
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY package*.json ./

# Ensure startup script is executable and fix permissions
RUN chmod +x /app/scripts/startup.sh && \
    chown -R node:node /app/node_modules && \
    chown -R node:node /app/prisma

EXPOSE 3000

# Drop privileges in runtime container
USER node

# App Runner entrypoint
CMD ["/app/scripts/startup.sh"]

