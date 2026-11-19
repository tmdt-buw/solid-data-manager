# syntax=docker/dockerfile:1
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
ENV NPM_CONFIG_IGNORE_SCRIPTS=true
RUN npm ci

COPY . .

ARG PUBLIC_URL=/solid-data-manager
ENV PUBLIC_URL=$PUBLIC_URL

RUN npm run build:app

FROM nginx:1.30.7-alpine3.24@sha256:bef154735288bc38d99fac41ae63730684bcc661503673a04a0f9bc526ba8598
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3002

CMD ["nginx", "-g", "daemon off;"]
