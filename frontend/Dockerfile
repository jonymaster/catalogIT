FROM node:20-alpine

RUN adduser -D appuser

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN chown -R appuser:appuser /app

USER appuser

CMD ["npm", "run", "dev"]
