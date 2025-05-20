const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const ensureAuthenticated = require('../middlewares/authMiddleware');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

const camposFormularioPhelps = [
  { name: 'nome_completo', label: 'Seu Nome completo' },
  { name: 'CPF', label: 'Seu CPF' },
  { name: 'name', label: 'Nome no site' },
  { name: 'slug', label: 'URL do Site' },
  { name: 'loja', label: 'Sua Concessionaria' },
  { name: 'estado', label: 'Seu Estado' },
  { name: 'cidade', label: 'Sua Cidade' },
  { name: 'celular', label: 'WhatsApp' },
  { name: 'instagram', label: 'Seu instagram' },
  // Adicione outros campos fixos conforme necessário
];

const tempUploads = {};

router.get('/phelps', ensureAuthenticated, (req, res) => {
  res.render('phelps-upload');
});

router.post('/phelps/upload', ensureAuthenticated, upload.single('planilha'), (req, res) => {
  const filePath = req.file.path;
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
  const colunas = data[0];

  tempUploads[req.sessionID] = filePath;

  res.render('phelps-mapeamento', { colunas, camposFormulario: camposFormularioPhelps });
});

router.post('/phelps/processar', ensureAuthenticated, async (req, res) => {
  const mapeamento = req.body;
  const filePath = tempUploads[req.sessionID];
  const url = process.env.PHELPS_FORM_URL; // Use a variável do .env

  if (!filePath) {
    return res.status(400).send('Arquivo da planilha não encontrado. Faça o upload novamente.');
  }

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  try {
    // Utilize o mesmo bloco de detecção de Chromium do app.js para manter o padrão:
    const chromiumPaths = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium/chromium',
      '/usr/bin/chromium-browser/chromium-browser',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // executável do Chrome no Windows
      'C:/Program Files/Google/Chrome/Application/chrome.exe' // também aceita barra normal
    ];

    // DEBUG: Mostra quais caminhos existem no ambiente
    const foundPaths = chromiumPaths.filter(p => fs.existsSync(p));
    console.log('Caminhos encontrados para Chromium/Chrome:', foundPaths);

    const executablePath = foundPaths[0];
    if (!executablePath) {
      console.error('Chromium/Chrome não encontrado. Caminhos verificados:', chromiumPaths);
      return res.status(500).send(
        'Chromium/Chrome não encontrado no ambiente.<br>' +
        'Caminhos verificados: ' + chromiumPaths.join(', ') + '<br>' +
        'Verifique se o navegador está instalado e se o caminho está correto.<br>' +
        'Se estiver rodando local, instale o Chrome ou Chromium e ajuste o caminho manualmente.'
      );
    }

    const browser = await puppeteer.launch({
      headless: false, // <-- Altere para false para ver o navegador abrindo
      executablePath,
      timeout: 60000,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: null,
    });

    const page = await browser.newPage();

    for (const row of data) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        for (const campo of camposFormularioPhelps) {
          let valor = row[mapeamento[campo.name]];
          // Se não houver valor na planilha, use o padrão do formulário
          if (valor === undefined || valor === null || valor === '') {
            // Defina padrões para campos específicos
            if (campo.name === 'estado') valor = 'SP'; // exemplo: padrão São Paulo
            if (campo.name === 'fonte_pagamento') valor = '1'; // padrão: Vendedor
            if (campo.name === 'mostrar_valor_credito') valor = '1'; // padrão: Sim
            // Para checkbox de termos, pode marcar via JS depois
          }

          // Verifica se é select ou input
          const selectExists = await page.$(`select[name="${campo.name}"]`);
          if (selectExists) {
            try {
              const options = await page.$$eval(`select[name="${campo.name}"] option`, opts =>
                opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
              );
              let selected = false;
              for (const opt of options) {
                if (
                  (valor && opt.value === valor) ||
                  (valor && opt.text.toLowerCase() === String(valor).toLowerCase())
                ) {
                  await page.select(`select[name="${campo.name}"]`, opt.value);
                  selected = true;
                  break;
                }
              }
              if (!selected) {
                // Se não encontrou, apenas não seleciona nada (fica o padrão do formulário)
                console.warn(`Valor "${valor}" não encontrado no select "${campo.name}"`);
              }
            } catch (e) {
              console.warn(`Erro ao selecionar "${valor}" no select "${campo.name}":`, e);
            }
          } else {
            const inputExists = await page.$(`input[name="${campo.name}"]`);
            if (inputExists) {
              // Garante que valor é string para evitar erro de "text is not iterable"
              if (typeof valor !== 'string') valor = valor !== undefined && valor !== null ? String(valor) : '';
              await page.type(`input[name="${campo.name}"]`, valor, { delay: 50 });
            } else {
              console.warn(`Campo não encontrado no formulário: ${campo.name}`);
            }
          }
        }

        // Aceite de termos (checkbox)
        const termos = await page.$('input[type="checkbox"][name="terms"],input[type="checkbox"]#terms');
        if (termos) {
          const checked = await (await termos.getProperty('checked')).jsonValue();
          if (!checked) await termos.click();
        }

        await page.click('input[type="submit"],button[type="submit"]');
        await page.waitForTimeout(2000);

      } catch (err) {
        console.error(`Erro processando linha:`, err);
        continue;
      }
    }

    await browser.close();
    fs.unlinkSync(filePath);
    delete tempUploads[req.sessionID];

    res.send('Processo do novo modelo concluído com sucesso!');
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro no processamento do novo modelo.');
  }
});

module.exports = router;
