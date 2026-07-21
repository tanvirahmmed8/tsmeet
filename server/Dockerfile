FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node server/package.json server/package-lock.json ./
RUN npm ci
COPY --chown=node:node server/ ./
USER node
EXPOSE 3002
CMD ["npm", "start"]
