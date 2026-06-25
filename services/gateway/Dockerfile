FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache bash curl
COPY package.json ./
RUN npm install --production
# Install onchainos CLI for Agentic Wallet
RUN curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/v3.3.14/install.sh | bash
ENV PATH="/root/.local/bin:${PATH}"
COPY src/ ./src/
EXPOSE 3100
CMD ["node", "src/index.js"]
