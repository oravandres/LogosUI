# syntax=docker/dockerfile:1
# Build stage runs on the native host platform for speed; the produced bundle is
# pure static JS/CSS/HTML and is architecture-independent, so the runtime image
# is the only stage that needs to be multi-arch.
FROM --platform=$BUILDPLATFORM node:22.12-alpine AS builder

WORKDIR /src

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# VITE_LOGOS_API_BASE_URL is baked into the bundle at build time and validated
# by vite.config.ts. Default targets the MiMi cluster ingress so the same host
# serves the API and the UI (no CORS in production).
ARG VITE_LOGOS_API_BASE_URL=https://logos.mimi.local
ENV VITE_LOGOS_API_BASE_URL=${VITE_LOGOS_API_BASE_URL}
RUN npm run build

# Runtime stage: unprivileged nginx (UID 101) listening on 8080. Compatible
# with the cluster's restricted PodSecurity baseline; pinned to a specific
# patch tag rather than a floating mainline alias so reschedules are
# deterministic.
FROM nginxinc/nginx-unprivileged:1.29.4-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /src/dist /usr/share/nginx/html

EXPOSE 8080
