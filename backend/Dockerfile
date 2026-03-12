# Carelife バックエンド — Cloud Run 用
FROM node:20-bookworm-slim

# ffmpeg（音声変換で使用）
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]
