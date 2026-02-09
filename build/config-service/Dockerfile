FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Instalar curl y docker CLI para poder reiniciar contenedores
RUN apk add --no-cache curl docker-cli

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
EXPOSE 3001

CMD ["node", "server.js"]
