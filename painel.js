const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs-extra');
const notifier = require('node-notifier');

const isDev = !app.isPackaged;
let mainWindow;
let processoAtivo = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    title: 'Magiore Marketplace Poster',
    show: false,
    frame: false,
    resizable: true,
    minWidth: 1024,
    minHeight: 768
  });

  mainWindow.loadFile(path.join(__dirname, 'views', 'painel.html'));
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    setTimeout(async () => {
      console.log('🔄 Iniciando processos automáticos...');
      
      // ⭐ Gera títulos/descrições e baixa imagens
      await atualizarDadosCompletos();
      
      if (mainWindow) {
        mainWindow.webContents.send('atualizar-painel');
      }
    }, 3000);
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function getAppPath() {
  return isDev ? __dirname : process.resourcesPath;
}

function enviarNotificacao(titulo, mensagem) {
  notifier.notify({
    title: titulo,
    message: mensagem,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    sound: true
  });
}

// ============================================================
// ⭐ ATUALIZAÇÃO COMPLETA (GERA DADOS + BAIXA IMAGENS)
// ============================================================

async function atualizarDadosCompletos() {
  console.log('🔄 Atualizando dados completos...');
  
  try {
    // 1. Busca pendentes e gera dados
    const sheetsInstance = await getSheets();
    const pendentes = await sheetsInstance.buscarPendentes(100, 1);
    
    let gerados = 0;
    if (pendentes.length > 0) {
      // Os dados já foram gerados dentro do buscarPendentes
      for (const imovel of pendentes) {
        if (imovel.titulo && imovel.titulo.length > 10 && 
            imovel.descricao && imovel.descricao.length > 20) {
          gerados++;
        }
      }
      console.log(`📝 ${gerados} imóvel(is) atualizado(s) com título/descrição/tags`);
    }
    
    // 2. Baixa imagens
    const resultadoImagens = await baixarImagensPendentes();
    
    return {
      success: true,
      gerados: gerados,
      imagens: resultadoImagens.baixadas || 0,
      mensagem: `📝 ${gerados} títulos gerados, 📥 ${resultadoImagens.baixadas || 0} imagens baixadas`
    };
    
  } catch (err) {
    console.error('Erro ao atualizar dados:', err);
    return { success: false, error: err.message };
  }
}

ipcMain.handle('atualizar-dados-completos', async () => {
  return await atualizarDadosCompletos();
});

// ============================================================
// DOWNLOAD DE IMAGENS PENDENTES
// ============================================================

async function baixarImagensPendentes() {
  try {
    console.log('📥 Verificando imagens pendentes para download...');
    
    const sheetsInstance = await getSheets();
    const pendentes = await sheetsInstance.buscarPendentes(100, 1);
    
    if (pendentes.length === 0) {
      console.log('📭 Nenhum imóvel pendente encontrado');
      return { success: true, mensagem: 'Nenhum imóvel pendente', baixadas: 0 };
    }
    
    const ImageHandler = require('./src/imageHandler');
    const config = require('./src/config');
    let totalImagens = 0;
    let baixadas = 0;
    let jaExistentes = 0;

    let posterTemp = null;
    let pageAutenticada = null;
    try {
      const FacebookPoster = require('./src/poster');
      posterTemp = new FacebookPoster();
      await posterTemp.iniciar();
      pageAutenticada = posterTemp.page;
      console.log('  🔐 Sessão do Facebook aberta para pré-download de imagens');
    } catch (e) {
      console.warn('  ⚠️ Não foi possível abrir sessão do Facebook para pré-download:', e.message);
    }

    try {
      for (const imovel of pendentes) {
        if (!imovel.imagens) continue;

        const urls = imovel.imagens.split('|').filter(u => u.trim().startsWith('http'));
        totalImagens += urls.length;

        for (const url of urls) {
          const matchId = url.match(/(\d+_\d+)/);
          if (matchId) {
            const pastaFotos = config.postagem.imagensBaseDir || 'D:\\Imóveis\\Fotos';
            const arquivosExistentes = await fs.readdir(pastaFotos).catch(() => []);
            const jaExiste = arquivosExistentes.some(f => f.includes(matchId[1]));
            if (jaExiste) {
              jaExistentes++;
              continue;
            }
          }

          console.log(`  📥 Baixando: ${url.substring(0, 80)}...`);
          const resultado = await ImageHandler._salvarImagemLocal(url, pageAutenticada);
          if (resultado) baixadas++;
        }
      }
    } finally {
      if (posterTemp) {
        await posterTemp.fechar().catch(() => {});
      }
    }
    
    const mensagem = `📥 ${baixadas} imagens baixadas, ${jaExistentes} já existiam (${totalImagens} total)`;
    console.log(mensagem);
    
    if (mainWindow) {
      mainWindow.webContents.send('download-imagens-resultado', { success: true, mensagem });
    }
    
    return { success: true, baixadas, jaExistentes, total: totalImagens };
    
  } catch (err) {
    console.error('Erro ao baixar imagens:', err);
    return { success: false, error: err.message, baixadas: 0 };
  }
}

ipcMain.handle('baixar-imagens-pendentes', async () => {
  return await baixarImagensPendentes();
});

// ============================================================
// SHEETS
// ============================================================

let sheets = null;

async function getSheets() {
  if (!sheets) {
    const sheetsModule = require('./src/sheets');
    sheets = sheetsModule;
    await sheets.inicializar();
  }
  return sheets;
}

ipcMain.handle('get-stats', async () => {
  try {
    const sheetsInstance = await getSheets();
    const config = require('./src/config');
    
    const range = `${config.sheets.aba}!A2:Z1000`;
    const res = await sheetsInstance.sheets.spreadsheets.values.get({
      spreadsheetId: config.sheets.sheetId,
      range,
    });
    
    const linhas = res.data.values || [];
    const col = config.sheets.colunas;
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    let pendentes = 0, postados = 0, erros = 0, pausados = 0;
    let linhasComDados = 0;
    
    for (const linha of linhas) {
      const titulo = linha[letras.indexOf(col.titulo)] || '';
      if (!titulo) continue;
      
      linhasComDados++;
      const status = (linha[letras.indexOf(col.status)] || '').toLowerCase().trim();
      
      if (status === 'pendente' || status === '') pendentes++;
      else if (status === 'postado') postados++;
      else if (status === 'erro') erros++;
      else if (status === 'pausado') pausados++;
    }
    
    return { pendentes, postados, erros, pausados, total: linhasComDados };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('get-pendentes', async () => {
  try {
    const sheetsInstance = await getSheets();
    const config = require('./src/config');
    
    const range = `${config.sheets.aba}!A2:Z1000`;
    const res = await sheetsInstance.sheets.spreadsheets.values.get({
      spreadsheetId: config.sheets.sheetId,
      range,
    });
    
    const linhas = res.data.values || [];
    const col = config.sheets.colunas;
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    const pendentes = [];
    let linhasComDados = 0;
    
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      
      const titulo = linha[letras.indexOf(col.titulo)] || '';
      if (!titulo) continue;
      
      linhasComDados++;
      
      const statusGeral = (linha[letras.indexOf(col.status)] || '').toLowerCase().trim();
      
      if (statusGeral === 'postado' || statusGeral === 'erro' || statusGeral === 'pausado') {
        continue;
      }
      
      const idxStatusConta1 = letras.indexOf(col.conta1Status || 'R');
      let statusConta1 = '';
      if (idxStatusConta1 !== -1 && idxStatusConta1 < linha.length) {
        statusConta1 = (linha[idxStatusConta1] || '').toLowerCase().trim();
      }
      
      if (statusConta1 === 'postado') {
        continue;
      }
      
      pendentes.push({
        _linhaIdx: i + 2,
        id: linha[letras.indexOf(col.id)] || '',
        titulo: titulo,
        descricao: linha[letras.indexOf(col.descricao)] || '',
        preco: linha[letras.indexOf(col.preco)] || '0',
        tipo: linha[letras.indexOf(col.tipo)] || 'Casa',
        operacao: linha[letras.indexOf(col.operacao)] || 'Venda',
        quartos: linha[letras.indexOf(col.quartos)] || '',
        banheiros: linha[letras.indexOf(col.banheiros)] || '',
        area: linha[letras.indexOf(col.area)] || '',
        localizacao: linha[letras.indexOf(col.localizacao)] || '',
        etiquetas: linha[letras.indexOf(col.etiquetas)] || '',
        imagens: linha[letras.indexOf(col.imagens)] || '',
        status: statusGeral
      });
    }
    
    console.log(`📋 ${pendentes.length} imóveis pendentes (${linhasComDados} linhas com dados)`);
    return pendentes;
    
  } catch (err) {
    console.error('Erro ao buscar pendentes:', err);
    return { error: err.message };
  }
});

ipcMain.handle('get-ultimos', async () => {
  try {
    const sheetsInstance = await getSheets();
    const config = require('./src/config');
    
    const range = `${config.sheets.aba}!A2:Z1000`;
    const res = await sheetsInstance.sheets.spreadsheets.values.get({
      spreadsheetId: config.sheets.sheetId,
      range,
    });
    
    const linhas = res.data.values || [];
    const col = config.sheets.colunas;
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    const ultimos = [];
    for (let i = linhas.length - 1; i >= 0 && ultimos.length < 20; i--) {
      const linha = linhas[i];
      const titulo = linha[letras.indexOf(col.titulo)] || '';
      if (!titulo) continue;
      
      const status = (linha[letras.indexOf(col.status)] || '').toLowerCase();
      if (status === 'postado') {
        ultimos.push({
          titulo: titulo,
          data: linha[letras.indexOf(col.dataPostagem)] || '',
          link: linha[letras.indexOf(col.linkPostagem)] || '',
          preco: linha[letras.indexOf(col.preco)] || '0'
        });
      }
    }
    return ultimos;
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('get-todos-imoveis', async () => {
  try {
    const sheetsInstance = await getSheets();
    const config = require('./src/config');
    
    const range = `${config.sheets.aba}!A2:Z1000`;
    const res = await sheetsInstance.sheets.spreadsheets.values.get({
      spreadsheetId: config.sheets.sheetId,
      range,
    });
    
    const linhas = res.data.values || [];
    const col = config.sheets.colunas;
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    
    const imoveis = [];
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const titulo = linha[letras.indexOf(col.titulo)] || '';
      if (!titulo) continue;
      
      imoveis.push({
        id: linha[letras.indexOf(col.id)] || '',
        titulo: titulo,
        preco: linha[letras.indexOf(col.preco)] || '0',
        tipo: linha[letras.indexOf(col.tipo)] || '',
        status: linha[letras.indexOf(col.status)] || '',
        dataPostagem: linha[letras.indexOf(col.dataPostagem)] || '',
        link: linha[letras.indexOf(col.linkPostagem)] || ''
      });
    }
    return imoveis;
  } catch (err) {
    return { error: err.message };
  }
});

// ============================================================
// POSTAGEM
// ============================================================

ipcMain.handle('executar-postagem', async (event, contasSelecionadas) => {
  console.log('📢 executar-postagem chamado', contasSelecionadas);
  try {
    const appPath = getAppPath();
    const scriptPath = path.join(appPath, 'index.js');
    
    console.log(`📢 Script path: ${scriptPath}`);
    
    if (processoAtivo) {
      return { success: false, error: 'Já existe uma postagem em andamento' };
    }
    
    // ⭐ Repassa as contas marcadas no painel pro index.js via argumento --contas=1,2
    const argsContas = Array.isArray(contasSelecionadas) && contasSelecionadas.length > 0
      ? `--contas=${contasSelecionadas.join(',')}`
      : '';

    processoAtivo = exec(`node "${scriptPath}" --now ${argsContas}`.trim(), { cwd: appPath });
    
    processoAtivo.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
      mainWindow.webContents.send('postagem-output', data.toString());
      if (data.includes('✅ Postado')) {
        enviarNotificacao('Sucesso!', 'Anúncio postado com sucesso!');
      }
    });
    
    processoAtivo.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
      mainWindow.webContents.send('postagem-output', `ERRO: ${data}`);
    });
    
    processoAtivo.on('close', (code) => {
      console.log(`📢 Processo finalizado com código: ${code}`);
      if (code === 0) {
        mainWindow.webContents.send('postagem-resultado', { success: true });
        enviarNotificacao('Concluído', 'Sessão de postagem finalizada!');
      } else {
        mainWindow.webContents.send('postagem-resultado', { success: false, error: `Código ${code}` });
      }
      processoAtivo = null;
    });
    
    return { success: true };
  } catch (err) {
    console.error(`📢 Erro: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('parar-postagem', async () => {
  try {
    if (processoAtivo) {
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${processoAtivo.pid} /T /F`);
      } else {
        processoAtivo.kill('SIGINT');
      }
      processoAtivo = null;
      return { success: true };
    }
    return { success: false, error: 'Nenhuma postagem ativa' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ============================================================
// REDUÇÃO DE PREÇOS
// ============================================================

ipcMain.handle('executar-reducao-preco', async (event, valorAlvo) => {
  try {
    const FacebookPoster = require('./src/poster');
    const poster = new FacebookPoster();
    await poster.iniciar();
    await poster.verificarLogin();
    
    const resultado = await poster.executarEditorPreco(valorAlvo);
    await poster.fechar();
    
    return resultado;
  } catch (err) {
    console.error('Erro:', err);
    return { success: false, error: err.message };
  }
});

// ============================================================
// JANELA
// ============================================================

ipcMain.handle('fechar-aplicacao', async () => {
  if (processoAtivo) {
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${processoAtivo.pid} /T /F`);
    } else {
      processoAtivo.kill('SIGINT');
    }
  }
  if (mainWindow) mainWindow.close();
  app.quit();
});

ipcMain.handle('minimizar-janela', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximizar-janela', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

// ============================================================
// UTILITÁRIOS
// ============================================================

ipcMain.handle('abrir-link', async (event, link) => {
  if (link) await shell.openExternal(link);
});

ipcMain.handle('abrir-pasta', async () => {
  try {
    const config = require('./src/config');
    const pasta = config.postagem.imagensBaseDir || 'D:\\Imóveis\\Fotos';
    await shell.openPath(pasta);
  } catch (err) {
    console.error(err);
  }
});

ipcMain.handle('abrir-planilha', async () => {
  try {
    const config = require('./src/config');
    await shell.openExternal(`https://docs.google.com/spreadsheets/d/${config.sheets.sheetId}`);
  } catch (err) {
    console.error(err);
  }
});

ipcMain.handle('abrir-logs', async () => {
  try {
    const logsPath = path.join(__dirname, 'logs');
    await fs.ensureDir(logsPath);
    await shell.openPath(logsPath);
  } catch (err) {
    console.error(err);
  }
});

ipcMain.handle('limpar-logs', async () => {
  try {
    const logsPath = path.join(__dirname, 'logs');
    if (await fs.pathExists(logsPath)) {
      await fs.emptyDir(logsPath);
      return { success: true };
    }
    return { success: false };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-version', () => {
  try {
    return require('./package.json').version;
  } catch {
    return '1.0.0';
  }
});