# Pinned (not the floating node:20 tag): sharp 0.35.x requires Node >=20.9.0.
# 20.20.2 is the same image the floating 20-bookworm-slim tag resolved to
# when pinned (sha256:2cf067cf...). Bump deliberately, never implicitly.
FROM node:20.20.2-bookworm-slim

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
