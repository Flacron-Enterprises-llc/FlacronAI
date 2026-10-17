# Node 24 "Krypton" Active LTS (security support until 2028-04-30, per the
# official nodejs/Release schedule); Node 20 reached end of life 2026-04-30.
# Pinned by version AND multi-arch index digest (verified on Docker Hub,
# 2026-09-24) so a build can never silently pick up a different image.
# Bump deliberately; sharp 0.35.x itself requires Node >=20.9.0.
FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

WORKDIR /app

# Apply Debian security updates published after the pinned base image was
# built (e.g. perl-base CVE-2026-13221 / -42496 / -8376, fixed in deb12u4).
# The CI image scan fails the deploy on any fixable CRITICAL.
RUN apt-get update \
    && apt-get upgrade -y --no-install-recommends \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN mkdir -p /app/uploads \
    && chown -R node:node /app

USER node

# Git commit this image was built from; reported by GET /health so every
# cloud (AWS, Azure, IBM) can be verified to run the same release.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

EXPOSE 3000

CMD ["node", "server.js"]
