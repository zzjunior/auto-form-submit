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

  try {
    // Detecta caminho do Chromium automaticamente
    const chromiumPaths = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable'
    ];

    const executablePath = chromiumPaths.find(p => fs.existsSync(p));
    if (!executablePath) {
      console.error('Chromium não encontrado.');
      return res.status(500).send('Chromium não encontrado no ambiente.');
    }

    const browser = await puppeteer.launch({
      headless: true,
      executablePath,
      timeout: 60000,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: null,
    });

    const page = await browser.newPage();

    for (const row of data) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        const nome = row['Nome completo do vendedor'] || 'Não Informado';
        const cpf = row['CPF (sem pontos)'] || '';
        const email = row['Email (opcional)'] || `${nome.toLowerCase().replace(/\s+/g, '.')}@exemplo.com`;
        const telefone = row['WhatsApp de vendas (sem pontos, com DDD e com dígito 9)'] || '';
        const nomeGuerra = row['Nome divulgação'] || nome;
        const senha = '123456';

        await page.type('input[name="name"]', nome, { delay: 50 });
        await page.type('input[name="document"]', cpf, { delay: 50 });
        await page.type('input[name="email"]', email, { delay: 50 });
        await page.type('input[name="phone"]', telefone, { delay: 50 });
        await page.type('input[name="nickname"]', nomeGuerra, { delay: 50 });
        await page.type('input[name="password"]', senha, { delay: 50 });
        await page.type('input[name="confirm_password"]', senha, { delay: 50 });

        await page.click('button[class="btn btn-success"]');
        await page.waitForTimeout(2000);

      } catch (err) {
        console.error(`Erro processando ${row['Nome completo do vendedor']}:`, err);
        continue;
      }
    }

    await browser.close();
    fs.unlinkSync(filePath);

    res.send('Processo concluído com sucesso!');
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro no processamento.');
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
