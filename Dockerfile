FROM node:22-alpine
WORKDIR /app
COPY server/package.json ./
RUN npm install --omit=dev
COPY server/server.js server/db.js ./
COPY public.html ./
CMD ["node","server.js"]
