FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY scripts ./scripts

ENV NODE_ENV=production
ENV UPDATE_INTERVAL_SECONDS=1800

CMD ["node", "scripts/vps-loop.mjs"]
