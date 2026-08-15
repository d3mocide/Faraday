# Build stage. Debian-based (not alpine): alpine's musl libc has a well-documented incompatibility
# with QEMU's ARM64 user-mode emulation (used by docker/setup-qemu-action for the arm64 leg of this
# multi-arch build) that crashes node with "Illegal instruction" partway through npm ci. Only the
# build stage is affected -- this is a multi-stage build, so the final runtime image below is still
# the small caddy:2-alpine stage; only static files get copied out of this one.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG APP_VERSION
ENV VITE_APP_VERSION=${APP_VERSION}
RUN npm run build

# Serve stage — static files only
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
