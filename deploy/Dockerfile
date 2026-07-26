# --- build stage: compile the Svelte + Vite + TypeScript client ---
FROM node:22-alpine AS build

WORKDIR /build

# Install dependencies against the lockfile first (better layer caching).
COPY package.json package-lock.json ./
RUN npm ci

# Config + sources needed for the Vite build.
COPY tsconfig.json svelte.config.mjs vite.config.mts ./
COPY src ./src

RUN npm run build

# --- runtime stage: plain Node server, no npm dependencies ---
FROM node:22-alpine

WORKDIR /app

# The API server (Node built-ins only), the shared seed JSON it reads for
# /api/reset, and the built client assets from the build stage.
COPY src/server/server.js ./
COPY src/shared ./shared
COPY --from=build /build/dist/public ./public

ENV NODE_ENV=production
ENV APP_ROOT=/app
ENV HOST=0.0.0.0
ENV PORT=5173
ENV PUBLIC_ROOT=/app/public
ENV SHARED_DATA_PATH=/app/shared/budget-data.json

EXPOSE 5173
EXPOSE 5443

CMD ["node", "server.js"]
