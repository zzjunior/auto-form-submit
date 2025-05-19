FROM node:20-bookworm-slim

# Atualiza pacotes do sistema para reduzir vulnerabilidades
RUN apt-get update && apt-get upgrade -y && apt-get dist-upgrade -y && apt-get clean && rm -rf /var/lib/apt/lists/*

# Instala dependências do sistema para Chromium
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
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
    libglu1 \
    fonts-liberation \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Diretório da aplicação
WORKDIR /app

# Instala dependências do projeto
COPY package*.json ./
RUN npm ci

# Copia todo o código
COPY . .

# Expõe a porta padrão do Railway
EXPOSE 8080

CMD ["node", "app.js"]
