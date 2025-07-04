require('dotenv').config();
const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const authRoutes = require('./routes/auth');
const phelpsRoutes = require('./routes/phelps');
const ensureAuthenticated = require('./middlewares/authMiddleware');
const db = require('./db');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Adicione esta linha se não existir

// Configuração do store de sessão usando MySQL
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore 
}));

app.use(authRoutes);
app.use(phelpsRoutes);

app.get('/', ensureAuthenticated, (req, res) => {
  res.render('index');
});

// Adicione para progresso e parada do processamento do /process
const processStatus = {};

app.post('/process', ensureAuthenticated, upload.single('planilha'), async (req, res) => {
  const filePath = req.file.path;
  const url = req.body.url;

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  const resultados = [];
  const executionId = Date.now() + Math.random();
  processStatus[executionId] = {
    total: data.length,
    processadas: 0,
    status: 'processando',
    resultados: [],
    erro: null
  };

  console.log(`[${executionId}] Iniciando processamento de ${data.length} linhas`);

  // Retorna imediatamente para o frontend
  res.json({
    status: 'iniciado',
    executionId,
    total: data.length,
    mensagem: 'Processamento iniciado em background'
  });

  // Processamento em background
  (async () => {
    try {
      // Detecta caminho  (local e servidor)
      const chromiumPaths = [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium/chromium',
        '/usr/bin/chromium-browser/chromium-browser',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:/Program Files/Google/Chrome/Application/chrome.exe'
      ];

      const executablePath = chromiumPaths.find(p => fs.existsSync(p));
      if (!executablePath) {
        processStatus[executionId].status = 'erro';
        processStatus[executionId].mensagem = 'Chromium/Chrome não encontrado no ambiente.';
        return;
      }

      // nagador
      const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        timeout: 800000,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        defaultViewport: null,
      });

      const page = await browser.newPage();

      let linha = 2;
      let stopRequested = false;
      processStatus[executionId].status = 'processando';
      req.on('close', () => { stopRequested = true; processStatus[executionId].status = 'parado'; });

      for (const row of data) {
        if (stopRequested || processStatus[executionId].status === 'parado') break;
        const nomeAtual = row['Nome completo do vendedor'] || '';
        
        console.log(`[${executionId}] Processando linha ${linha}: ${nomeAtual}`);
        
        try {
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

          const nome = row['Nome completo do vendedor'] || 'Não Informado';
          const email = row['Email (opcional)'] || `${nome.toLowerCase().replace(/\s+/g, '.')}@exemplo.com`;
          const telefone = row['WhatsApp de vendas (sem pontos, com DDD e com dígito 9)'] || '';
          const nomeGuerra = row['Nome divulgação do vendedor (perfil do site)'] || nome;
          const senha = '123456';

          const safe = v => (v === undefined || v === null) ? '' : (typeof v === 'number' ? v.toString().padStart(11, '0') : String(v));
          const cpfRaw = row['CPF (sem pontos/sem carcateres especiais)'];
          const cpf = (cpfRaw === undefined || cpfRaw === null) ? '' : String(cpfRaw).padStart(11, '0');

          console.log(`[${executionId}] Linha ${linha} - Preenchendo campos...`);
          
          // Preenche os campos com mais tempo entre cada um
          await page.waitForSelector('input[name="name"]', { timeout: 10000 });
          await page.click('input[name="name"]', { clickCount: 3 }); // Seleciona tudo
          await page.type('input[name="name"]', safe(nome), { delay: 100 });
          await page.waitForTimeout(500);

          await page.click('input[name="document"]', { clickCount: 3 });
          await page.type('input[name="document"]', cpf, { delay: 100 });
          await page.waitForTimeout(500);

          await page.click('input[name="email"]', { clickCount: 3 });
          await page.type('input[name="email"]', safe(email), { delay: 100 });
          await page.waitForTimeout(500);

          await page.click('input[name="phone"]', { clickCount: 3 });
          await page.type('input[name="phone"]', safe(telefone), { delay: 100 });
          await page.waitForTimeout(500);

          await page.click('input[name="nickname"]', { clickCount: 3 });
          await page.type('input[name="nickname"]', safe(nomeGuerra), { delay: 100 });
          await page.waitForTimeout(500);

          await page.click('input[name="password"]', { clickCount: 3 });
          await page.type('input[name="password"]', safe(senha), { delay: 100 });
          await page.waitForTimeout(500);

          await page.click('input[name="confirm_password"]', { clickCount: 3 });
          await page.type('input[name="confirm_password"]', safe(senha), { delay: 100 });
          await page.waitForTimeout(1000);

          // Verifica se todos os campos foram preenchidos
          const camposPreenchidos = await page.evaluate(() => {
            const campos = {
              name: document.querySelector('input[name="name"]')?.value || '',
              document: document.querySelector('input[name="document"]')?.value || '',
              email: document.querySelector('input[name="email"]')?.value || '',
              phone: document.querySelector('input[name="phone"]')?.value || '',
              nickname: document.querySelector('input[name="nickname"]')?.value || '',
              password: document.querySelector('input[name="password"]')?.value || '',
              confirm_password: document.querySelector('input[name="confirm_password"]')?.value || ''
            };
            return campos;
          });

          console.log(`[${executionId}] Linha ${linha} - Campos preenchidos:`, camposPreenchidos);

          // Aguarda o botão aparecer antes de clicar
          await page.waitForSelector('button[class="btn btn-success"]', { timeout: 10000 });
          console.log(`[${executionId}] Linha ${linha} - Clicando no botão de submit...`);
          await page.click('button[class="btn btn-success"]');
          
          // Aguarda mais tempo para o processamento do servidor
          console.log(`[${executionId}] Linha ${linha} - Aguardando resposta do servidor (10s)...`);
          await page.waitForTimeout(10000);

          // Checa se há qualquer erro exibido - amplia a busca por erros
          let erroMsg = '';
          
          // Busca por diferentes tipos de mensagem de erro
          const errorSelectors = [
            'mark.text-danger',
            '.text-danger',
            '.alert-danger',
            '.error-message',
            '[class*="error"]',
            '[class*="danger"]'
          ];
          
          for (const selector of errorSelectors) {
            const elements = await page.$$(selector);
            if (elements && elements.length > 0) {
              for (const element of elements) {
                const msg = await page.evaluate(el => el.textContent, element);
                if (msg && msg.trim() && !erroMsg.includes(msg.trim())) {
                  erroMsg += msg.trim() + ' ';
                }
              }
            }
          }
          erroMsg = erroMsg.trim();

          // Filtra mensagens que não são erros de cadastro
          if (erroMsg.includes('offline') || erroMsg.includes('Clique aqui')) {
            erroMsg = ''; // Remove mensagens de status que não são erros
          }

          // Verifica URL atual para confirmar redirecionamento
          const currentUrl = page.url();
          const wasRedirected = currentUrl !== url;
          
          console.log(`[${executionId}] Linha ${linha} - URL atual: ${currentUrl}`);
          console.log(`[${executionId}] Linha ${linha} - Foi redirecionado: ${wasRedirected}`);
          console.log(`[${executionId}] Linha ${linha} - Erros encontrados: "${erroMsg}"`);
          
          // Se tem erro específico, considera erro
          if (erroMsg && !wasRedirected) { // <-- ALTERAÇÃO AQUI
            console.log(`[${executionId}] Linha ${linha} - ERRO: ${erroMsg}`);
            resultados.push({
              linha,
              nome,
              status: 'erro',
              mensagem: erroMsg
            });
          } 
          // Se foi redirecionado, considera sucesso
          else if (wasRedirected) {
            console.log(`[${executionId}] Linha ${linha} - SUCESSO - Redirecionado para: ${currentUrl}`);
            resultados.push({
              linha,
              nome,
              status: 'sucesso',
              mensagem: 'Cadastrado com sucesso'
            });
          }
          // Se não foi redirecionado e não tem erro, aguarda mais um pouco
          else {
            console.log(`[${executionId}] Linha ${linha} - ERRO: Não houve redirecionamento ou erro detectado`);
            resultados.push({
              linha,
              nome,
              status: 'erro',
              mensagem: 'Formulário não respondeu adequadamente (possível erro de rede ou servidor)'
            });
          }

          // Atualiza progresso
          processStatus[executionId].processadas = linha - 1;
          processStatus[executionId].resultados = [...resultados];

          // Pausa entre cadastros
          await page.waitForTimeout(2000);

        } catch (err) {
          console.log(`[${executionId}] Linha ${linha} - ERRO EXCEPTION: ${err.message}`);
          resultados.push({
            linha,
            nome: row['Nome completo do vendedor'] || '',
            status: 'erro',
            mensagem: err.message
          });
          processStatus[executionId].processadas = linha - 1;
          processStatus[executionId].resultados = [...resultados];
        }
        linha++;
      }

      processStatus[executionId].status = 'finalizado';
      processStatus[executionId].processadas = data.length;
      processStatus[executionId].resultados = resultados;

      console.log(`[${executionId}] Processamento finalizado`);
      await browser.close();
      fs.unlinkSync(filePath);

      // Não envia resposta aqui, já foi enviada acima
    } catch (err) {
      processStatus[executionId].status = 'erro';
      processStatus[executionId].erro = err.message;
      // Não envia resposta aqui, já foi enviada acima
    }
  })();
});

// Nova rota para progresso do processamento
app.get('/process/progresso/:executionId', ensureAuthenticated, (req, res) => {
  const { executionId } = req.params;
  const status = processStatus[executionId];
  if (!status) {
    return res.json({ status: 'nao_encontrado' });
  }
  const progresso = Math.round((status.processadas / status.total) * 100);
  res.json({
    status: status.status,
    progresso,
    processadas: status.processadas,
    total: status.total,
    resultados: status.resultados,
    erro: status.erro
  });
});

// Nova rota para parar processamento
app.post('/process/parar/:executionId', ensureAuthenticated, (req, res) => {
  const { executionId } = req.params;
  if (processStatus[executionId]) {
    processStatus[executionId].status = 'parado';
    res.json({ status: 'parado' });
  } else {
    res.json({ status: 'nao_encontrado' });
  }
});

// Limpa processos antigos (opcional)
setInterval(() => {
  const agora = Date.now();
  Object.keys(processStatus).forEach(id => {
    if (agora - parseInt(id.split('.')[0]) > 3600000) { // 1 hora
      delete processStatus[id];
    }
  });
}, 300000); // Limpa a cada 5 minutos

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
