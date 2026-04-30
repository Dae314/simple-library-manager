FROM node:24-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS production

RUN apk add --no-cache postgresql17-client

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/build ./build
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/drizzle ./drizzle
RUN npm ci --omit=dev

EXPOSE 3000
CMD ["node", "server.js"]
