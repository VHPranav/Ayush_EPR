FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/server.js server/db.js server/permissions.js server/bootstrap.js server/patient-links.js server/transaction.js server/validation.js server/migrations.js server/dispensing.js server/chart-safety.js server/uploads.js ./
COPY server/migrations ./migrations
COPY schema.sql /schema.sql
RUN mkdir -p /app/storage && chown -R node:node /app /schema.sql
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1
CMD ["node","server.js"]
