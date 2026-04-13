FROM node:20-alpine AS builder

WORKDIR /app

# `postinstall` runs `scripts/copy-dice-three-assets.mjs`; it must exist before `npm install`.
COPY package*.json ./
COPY scripts/copy-dice-three-assets.mjs ./scripts/copy-dice-three-assets.mjs
RUN npm install

COPY . .

# `postinstall` already ran before this COPY; re-copy so `public/dice-three` is present after the tree sync.
RUN node scripts/copy-dice-three-assets.mjs

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ---- Production: serve with nginx ----
FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html

# Serves static files on 4173
# Proxies /api/* → backend:3001 internally (no external hop needed)
RUN printf 'server {\n\
    listen 4173;\n\
    root /usr/share/nginx/html;\n\
\n\
    # SPA routing — send all non-file requests to index.html\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    # Proxy API calls to the backend container on the internal Docker network\n\
    location /api/ {\n\
        proxy_pass         http://backend:3001/api/;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header   Host $host;\n\
        proxy_set_header   X-Real-IP $remote_addr;\n\
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_connect_timeout 75s;\n\
        proxy_send_timeout    1800s;\n\
        proxy_read_timeout    1800s;\n\
        proxy_buffering       off;\n\
        proxy_cache           off;\n\
        chunked_transfer_encoding on;\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 4173
CMD ["nginx", "-g", "daemon off;"]
