FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p /app/uploads \
    && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "server.js"]
