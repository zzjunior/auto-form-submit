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

app.post('/process', ensureAuthenticated, upload.single('planilha'), async (req, res) => {
  const filePath = req.file.path;
  const url = req.body.url;

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  const resultados = [];

  try {
    // Detecta caminho do Chromium automaticamente (local e servidor)
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
      return res.status(500).json({
        status: 'erro',
        mensagem: 'Chromium/Chrome não encontrado no ambiente.',
        detalhes: chromiumPaths
      });
    }

    // Torna o navegador visível para depuração local
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
    req.on('close', () => { stopRequested = true; });

    // Evita duplicidade de logs: só loga se não for um reload do Node (ex: nodemon)
    let processandoSet = new Set();

    for (const row of data) {
      if (stopRequested) break;
      const nomeAtual = row['Nome completo do vendedor'] || '';
      const logKey = `${linha}:${nomeAtual}`;
      if (!processandoSet.has(logKey)) {
        console.log(`Processando linha ${linha}: ${nomeAtual}`);
        processandoSet.add(logKey);
      }
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        const nome = row['Nome completo do vendedor'] || 'Não Informado';
        const email = row['Email (opcional)'] || `${nome.toLowerCase().replace(/\s+/g, '.')}@exemplo.com`;
        const telefone = row['WhatsApp de vendas (sem pontos, com DDD e com dígito 9)'] || '';
        const nomeGuerra = row['Nome divulgação do vendedor (perfil do site)'] || nome;
        const senha = '123456';

        // Garante que todos os valores são string para evitar "text is not iterable"
        // e preserva zeros à esquerda do CPF
        const safe = v => (v === undefined || v === null) ? '' : (typeof v === 'number' ? v.toString().padStart(11, '0') : String(v));

        // Para CPF, sempre converte para string e mantém zeros à esquerda
        const cpfRaw = row['CPF (sem pontos/sem carcateres especiais)'];
        const cpf = (cpfRaw === undefined || cpfRaw === null) ? '' : String(cpfRaw).padStart(11, '0');

        await page.waitForSelector('input[name="name"]', { timeout: 10000 });
        await page.type('input[name="name"]', safe(nome), { delay: 50 });
        await page.type('input[name="document"]', cpf, { delay: 50 });
        await page.type('input[name="email"]', safe(email), { delay: 50 });
        await page.type('input[name="phone"]', safe(telefone), { delay: 50 });
        await page.type('input[name="nickname"]', safe(nomeGuerra), { delay: 50 });
        await page.type('input[name="password"]', safe(senha), { delay: 50 });
        await page.type('input[name="confirm_password"]', safe(senha), { delay: 50 });

        // Aguarda o botão aparecer antes de clicar
        await page.waitForSelector('button[class="btn btn-success"]', { timeout: 10000 });
        await page.click('button[class="btn btn-success"]');
        await page.waitForTimeout(2000);

        // Checa se há qualquer erro exibido em <mark class="text-danger">
        let erroMsg = '';
        const marks = await page.$$('mark.text-danger');
        if (marks && marks.length > 0) {
          for (const mark of marks) {
            const msg = await page.evaluate(el => el.textContent, mark);
            if (msg && msg.trim()) {
              erroMsg += msg.trim() + ' ';
            }
          }
          erroMsg = erroMsg.trim();
        }

        if (erroMsg) {
          resultados.push({
            linha,
            nome,
            status: 'erro',
            mensagem: erroMsg
          });
        } else {
          resultados.push({
            linha,
            nome,
            status: 'sucesso',
            mensagem: 'Cadastrado com sucesso'
          });
        }
      } catch (err) {
        resultados.push({
          linha,
          nome: row['Nome completo do vendedor'] || '',
          status: 'erro',
          mensagem: err.message
        });
      }
      linha++;
    }

    await browser.close();
    fs.unlinkSync(filePath);

    res.json({ status: 'ok', resultados });
  } catch (err) {
    res.status(500).json({
      status: 'erro',
      mensagem: err.message
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
