const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const ensureAuthenticated = require('../middlewares/authMiddleware');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

// Adiciona multer para processar FormData na rota específica
const processFormData = multer().none(); // Para processar FormData sem arquivos

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

// Armazena o estado dos processamentos ativos
const activeProcesses = {};

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

router.post('/phelps/processar', ensureAuthenticated, processFormData, async (req, res) => {
  const mapeamento = req.body;
  const filePath = tempUploads[req.sessionID];
  const url = process.env.PHELPS_FORM_URL;

  // DEBUG INICIAL - MOSTRA TUDO QUE CHEGOU
  console.log('=== DEBUG PHELPS PROCESSAR ===');
  console.log('req.body completo:', req.body);
  console.log('req.sessionID:', req.sessionID);
  console.log('filePath:', filePath);
  console.log('tempUploads:', tempUploads);
  console.log('Mapeamento recebido:', mapeamento);
  console.log('Tipo do mapeamento:', typeof mapeamento);
  console.log('Keys do mapeamento:', Object.keys(mapeamento || {}));
  console.log('=== FIM DEBUG INICIAL ===');

  // PARAR AQUI SE MAPEAMENTO ESTIVER VAZIO
  if (!mapeamento || Object.keys(mapeamento).length === 0) {
    console.log('ERRO: Mapeamento vazio, interrompendo processamento');
    return res.status(400).json({
      status: 'erro',
      mensagem: 'Mapeamento não foi enviado pelo frontend'
    });
  }

  if (!filePath) {
    return res.status(400).json({
      status: 'erro',
      mensagem: 'Arquivo da planilha não encontrado. Faça o upload novamente.'
    });
  }

  // DEBUG: Verifica se arquivo existe
  if (!fs.existsSync(filePath)) {
    return res.status(400).json({
      status: 'erro',
      mensagem: 'Arquivo da planilha não existe no sistema de arquivos.'
    });
  }

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
  
  // DEBUG: Logs para verificar dados
  console.log('Total de linhas na planilha:', data.length);
  console.log('Primeira linha de dados:', data[0]);
  console.log('Colunas disponíveis:', Object.keys(data[0] || {}));

  // ADICIONA DEBUG DO MAPEAMENTO ESPECÍFICO
  console.log('Mapeamento nome_completo:', mapeamento['nome_completo']);
  console.log('Valor na primeira linha:', data[0] && data[0][mapeamento['nome_completo']]);

  if (!data || data.length === 0) {
    return res.status(400).json({
      status: 'erro',
      mensagem: 'A planilha não contém dados ou está vazia.'
    });
  }

  const resultados = [];
  const executionId = Date.now() + Math.random();
  
  // Armazena o processo ativo
  activeProcesses[executionId] = {
    sessionId: req.sessionID,
    total: data.length,
    processadas: 0,
    status: 'processando',
    resultados: []
  };

  console.log(`[${executionId}] Iniciando processamento Phelps de ${data.length} linhas`);

  // Retorna imediatamente com o ID do processo
  res.json({ 
    status: 'iniciado', 
    executionId,
    total: data.length,
    mensagem: 'Processamento iniciado em background'
  });

  // Processamento em background
  (async () => {
    try {
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
          mensagem: 'Chromium/Chrome não encontrado no ambiente.'
        });
      }

      const browser = await puppeteer.launch({
        headless: true, // Sim, isso acelera muito!
        executablePath,
        timeout: 30000, // Reduzido de 60000
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        defaultViewport: { width: 1280, height: 720 }, // Viewport menor
      });

      const page = await browser.newPage();
      
      // Otimizações de performance
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (req.resourceType() === 'stylesheet' || req.resourceType() === 'image' || req.resourceType() === 'font') {
          req.abort(); // Bloqueia CSS, imagens e fontes desnecessárias
        } else {
          req.continue();
        }
      });

      let linha = 2;

      for (const row of data) {
        // Verifica se foi solicitado para parar
        if (!activeProcesses[executionId] || activeProcesses[executionId].status === 'parado') {
          console.log(`[${executionId}] Processamento interrompido pelo usuário na linha ${linha}`);
          break;
        }

        try {
          const colunaNome = mapeamento['nome_completo'];
          const nomeAtual = row[colunaNome] || '';
          
          console.log(`[${executionId}] Processando linha ${linha}: ${nomeAtual}`);

          if (!nomeAtual || !colunaNome) {
            resultados.push({
              linha,
              nome: 'Mapeamento inválido',
              status: 'erro',
              mensagem: `Mapeamento inválido - coluna: "${colunaNome}", valor: "${nomeAtual}"`
            });
            linha++;
            continue;
          }

          // Timeout menor para navegação
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

          // Preenchimento mais rápido
          console.log(`[${executionId}] Linha ${linha} - Preenchendo campos...`);
          for (const campo of camposFormularioPhelps) {
            let valor = row[mapeamento[campo.name]] || '';
            
            if (!valor) {
              if (campo.name === 'estado') valor = 'AL'; // Estado padrão baseado na planilha
            }

            if (typeof valor !== 'string') valor = String(valor);

            const selectExists = await page.$(`select[name="${campo.name}"]`);
            if (selectExists) {
              try {
                await page.select(`select[name="${campo.name}"]`, valor);
              } catch (e) {
                console.warn(`[${executionId}] Erro ao selecionar "${valor}" no select "${campo.name}"`);
              }
            } else {
              const inputExists = await page.$(`input[name="${campo.name}"]`);
              if (inputExists && valor) {
                await page.evaluate((name, val) => {
                  const input = document.querySelector(`input[name="${name}"]`);
                  if (input) {
                    input.value = val;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }, campo.name, valor);
              }
            }
          }

          // Marca termos mais rápido
          const termos = await page.$('input[type="checkbox"]#terms');
          if (termos) {
            await page.evaluate(() => {
              const checkbox = document.querySelector('input[type="checkbox"]#terms');
              if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
              }
            });
          }

          console.log(`[${executionId}] Linha ${linha} - Submetendo formulário...`);
          await page.click('input[type="submit"]');
          
          // Aguarda menos tempo
          await page.waitForTimeout(3000); // Reduzido de 8000

          // Verificação de erros mais rápida
          let erroMsg = '';
          
          const errorElements = await page.$$eval([
            '.nome_invalido:not(.d-none)',
            '.celular_invalido:not(.d-none)',
            '.text-danger:not(.d-none)',
            'p.celular_invalido.text-danger',
            'p.nome_invalido.text-danger'
          ].join(','), elements => 
            elements.map(el => el.textContent.trim()).filter(text => text.length > 0)
          );
          
          erroMsg = errorElements.join(' ').trim();

          // Verificação de redirecionamento
          const currentUrl = page.url();
          const wasRedirected = currentUrl !== url;
          
          if (erroMsg) {
            resultados.push({
              linha,
              nome: nomeAtual,
              status: 'erro',
              mensagem: erroMsg
            });
          } else if (wasRedirected) {
            resultados.push({
              linha,
              nome: nomeAtual,
              status: 'sucesso',
              mensagem: 'Cadastrado com sucesso'
            });
          } else {
            // Aguarda um pouco menos para casos lentos
            await page.waitForTimeout(2000); // Reduzido de 5000
            const finalUrl = page.url();
            if (finalUrl !== url) {
              resultados.push({
                linha,
                nome: nomeAtual,
                status: 'sucesso',
                mensagem: 'Cadastrado com sucesso'
              });
            } else {
              resultados.push({
                linha,
                nome: nomeAtual,
                status: 'erro',
                mensagem: 'Formulário não respondeu adequadamente'
              });
            }
          }

          // Pausa menor entre cadastros
          await page.waitForTimeout(500); // Reduzido de 1000

          // Atualiza progresso
          activeProcesses[executionId].processadas = linha - 1;
          activeProcesses[executionId].resultados = [...resultados];

        } catch (err) {
          console.log(`[${executionId}] Linha ${linha} - ERRO EXCEPTION: ${err.message}`);
          resultados.push({
            linha,
            nome: row[mapeamento['nome_completo']] || 'Nome não encontrado',
            status: 'erro',
            mensagem: err.message
          });
        }
        linha++;

        // Atualiza progresso aqui também
        activeProcesses[executionId].processadas = linha - 2;
        activeProcesses[executionId].resultados = [...resultados];
      }

      await browser.close();
      fs.unlinkSync(filePath);
      delete tempUploads[req.sessionID];

      // Finaliza o processo
      if (activeProcesses[executionId]) {
        activeProcesses[executionId].status = 'finalizado';
        activeProcesses[executionId].processadas = data.length;
        activeProcesses[executionId].resultados = resultados;
      }

      console.log(`[${executionId}] Processamento Phelps finalizado`);
    } catch (err) {
      console.error('Erro geral no processamento:', err);
      if (activeProcesses[executionId]) {
        activeProcesses[executionId].status = 'erro';
        activeProcesses[executionId].erro = err.message;
      }
    }

  })();
});


// Nova rota para verificar progresso
router.get('/phelps/progresso/:executionId', ensureAuthenticated, (req, res) => {
  const { executionId } = req.params;
  const processo = activeProcesses[executionId];
  
  if (!processo) {
    return res.json({ status: 'nao_encontrado' });
  }
  
  const progresso = Math.round((processo.processadas / processo.total) * 100);
  
  res.json({
    status: processo.status,
    progresso,
    processadas: processo.processadas,
    total: processo.total,
    resultados: processo.resultados,
    erro: processo.erro
  });
});

// Nova rota para parar processamento
router.post('/phelps/parar/:executionId', ensureAuthenticated, (req, res) => {
  const { executionId } = req.params;
  
  if (activeProcesses[executionId]) {
    activeProcesses[executionId].status = 'parado';
    console.log(`[${executionId}] Processamento interrompido pelo usuário`);
    res.json({ status: 'parado' });
  } else {
    res.json({ status: 'nao_encontrado' });
  }
});

// Limpa processos antigos (opcional)
setInterval(() => {
  const agora = Date.now();
  Object.keys(activeProcesses).forEach(id => {
    const processo = activeProcesses[id];
    if (agora - parseInt(id.split('.')[0]) > 3600000) { // 1 hora
      delete activeProcesses[id];
    }
  });
}, 300000); // Limpa a cada 5 minutos

module.exports = router;
