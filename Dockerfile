FROM node:22-alpine
WORKDIR /app
RUN apk add dumb-init
COPY package.json package-lock.json ./
RUN npm ci
COPY src src
COPY tsconfig.json ./
RUN npm run build
USER node
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.mjs"]
