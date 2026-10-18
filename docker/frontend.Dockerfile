# syntax=docker/dockerfile:1
#
# FinCore web: the Vite build served by an unprivileged nginx, which also
# proxies /api to the API container — one origin for the browser, so the
# session cookie and the CSRF origin check work without cross-site settings.

ARG NODE_IMAGE=node:20.20.2-bookworm-slim
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.6-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json \
     tailwind.config.ts postcss.config.cjs playwright.config.ts ./
COPY public ./public
COPY src ./src
# The real API, same origin. Never the mock layer in this image.
ENV VITE_API_BASE_URL=/api \
    VITE_ENABLE_MOCKS=false
RUN npm run build

FROM ${NGINX_IMAGE} AS runtime
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
