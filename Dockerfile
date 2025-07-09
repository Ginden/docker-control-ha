FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./

COPY packages/ ./packages/

RUN npm ci

# Build the workspace package
WORKDIR /app/packages/docker-open-api
RUN npm run build

# Return to the root workdir
WORKDIR /app

COPY src/ ./src/

RUN npm run build

# Use a slim base image for the final image
FROM node:22-alpine

WORKDIR /app

# Define arguments for OpenContainers annotations
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION

# Apply OpenContainers annotations
LABEL org.opencontainers.image.created=${BUILD_DATE}
LABEL org.opencontainers.image.source="https://github.com/Ginden/docker-control-ha"
LABEL org.opencontainers.image.version=${VERSION}
LABEL org.opencontainers.image.revision=${VCS_REF}
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="Michał Wadas"
LABEL org.opencontainers.image.title="Docker Control for Home Assistant"
LABEL org.opencontainers.image.description="App to control Docker containers from Home Assistant"

COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/node_modules/ ./node_modules/
# TODO: this a workaround - how to fix it properly?
COPY --from=builder /app/packages/docker-open-api/ ./node_modules/@internal/docker-open-api/
COPY package.json ./

USER node

ENTRYPOINT ["npm", "start"]
