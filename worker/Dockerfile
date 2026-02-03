FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install

COPY wrangler.toml ./
COPY src ./src

EXPOSE 8787

CMD ["npm", "run", "dev", "--", "--ip", "0.0.0.0", "--port", "8787"]
