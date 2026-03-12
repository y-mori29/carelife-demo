# Carelife LINE Bot — Cloud Run 用
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production
EXPOSE 8080

# Cloud Run は PORT を設定する（既定 8080）
CMD ["node", "server.js"]
