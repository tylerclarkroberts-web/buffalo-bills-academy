# One container = the whole app (API + timers + built web app). Data lives on a mounted volume at /data.
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx vite build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data STATIC_DIR=/app/dist
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/ server/
COPY --from=build /app/dist dist/
EXPOSE 8080
CMD ["node", "server/index.js"]
