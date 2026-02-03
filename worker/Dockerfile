FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY wrangler.toml ./
COPY src ./src
COPY start.sh ./start.sh
RUN chmod +x ./start.sh

EXPOSE 8787

CMD ["./start.sh"]
