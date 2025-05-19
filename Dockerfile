FROM node:20-bookworm-slim

# Atualiza pacotes do sistema para reduzir vulnerabilidades
RUN apt-get update && apt-get upgrade -y && apt-get dist-upgrade -y && apt-get clean && rm -rf /var/lib/apt/lists/*

# Instala apenas o Chromium e libs essenciais
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxss1 \
    libgtk-3-0 \
    libxshmfence1 \
    fonts-liberation \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Garante permissões corretas
RUN mkdir -p /app && chown -R node:node /app
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# Diretório da aplicação
WORKDIR /app

# Variáveis de ambiente para Chromium rodar em Docker
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_BIN=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# Se seu app usa Puppeteer, adicione flags para rodar sem sandbox
ENV PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox"

# Instala só dependências de produção
COPY package*.json ./
RUN npm ci --only=production

# Copia todo o código
COPY . .

# Expõe a porta padrão do Railway
EXPOSE 8080

CMD ["node", "app.js"]
