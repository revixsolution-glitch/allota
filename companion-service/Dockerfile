FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y ca-certificates git && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install

COPY src ./src

ENV PORT=10000
EXPOSE 10000

CMD ["npx", "tsx", "src/index.ts"]
