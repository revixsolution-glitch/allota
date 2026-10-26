FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src

ENV PORT=10000
EXPOSE 10000

CMD ["npx", "tsx", "src/index.ts"]

