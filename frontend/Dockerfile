# Carelife フロントエンド — Cloud Run 用（ビルド時に API URL を埋め込み）
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

# ビルド時にバックエンドの URL を指定（Cloud Run デプロイ時に --build-arg で渡す）
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY . .
RUN npm run build

# 本番用: 静的ファイルを配信
FROM node:20-alpine

WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
EXPOSE 8080

# Cloud Run が PORT を設定する
CMD ["sh", "-c", "serve -s dist -l ${PORT:-8080}"]
