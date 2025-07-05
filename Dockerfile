# Use a multi-stage build to keep the final image small
FROM node:22-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package configuration files
COPY package.json package-lock.json ./
COPY tsconfig.json ./

# Copy packages directory for workspace dependencies
COPY packages/ ./packages/

# Install dependencies
RUN npm install

# Copy the source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Use a slim base image for the final image
FROM node:22-alpine

# Set the working directory
WORKDIR /app

# Copy the built application from the builder stage
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/node_modules/ ./node_modules/
COPY --from=builder /app/package.json ./

# Run the application as a non-root user
USER node

# Set the entrypoint
ENTRYPOINT ["node", "dist/index.mjs"]