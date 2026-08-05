FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG EXPO_PUBLIC_MYMANGA_API_URL=/api
ENV NODE_ENV=production
ENV EXPO_PUBLIC_MYMANGA_API_URL=${EXPO_PUBLIC_MYMANGA_API_URL}
RUN test -n "$EXPO_PUBLIC_MYMANGA_API_URL" && npm run export:web

FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
