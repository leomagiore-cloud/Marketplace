require('dotenv').config();
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const cron = require('node-cron');

// ── Importa os módulos existentes ─────────────────────────────
const config     = require('./src/config');
const logger     = require('./src/logger');
const sheets     = require('./src/sheets');
const imageHandler = require('./src/imageHandler');
const FacebookPoster = require('./src/poster');

let mainWindow = null;
let tray = null;
let schedulerAtivo = false;
let postando = false;
let cronJobs = [];
let logs = [];

// ── Redireciona o logger para o painel ────────────────────────
const logOriginal = logger.info.bind(logger);
logger.info = (msg, meta) => {
  logOriginal(msg, meta);
  adicionarLog('info', String(msg));
};
logger.warn = (...args) => { adicionarLog('warn', String(args[0])); };
logger.error = (...args) => { adicionarLog('error', String(args[0])); };

function adicionarLog(nivel, msg) {
  const linha = { nivel, msg, ts: new Date().toLocaleTimeString('pt-BR') };
  logs.unshift(linha);
  if (logs.length > 200) logs.pop();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', linha);
  }
}

// ── Cria a janela principal ───────────────────────────────────
function criarJanela() {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 620,
    minWidth: 700,
    minHeight: 500,
    frame: false,
    transparent: false,
    backgroundColor: '#0f1117',
    icon: path.join(__dirname, 'ui/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'electron-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'ui/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Envia logs existentes
    mainWindow.webContents.send('logs-iniciais', logs);
    atualizarStatus();
  });

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide(); // minimiza para a bandeja em vez de fechar
  });
}

// ── Ícone na bandeja do sistema ───────────────────────────────
function criarTray() {
  // Ícone simples gerado como PNG base64 (16x16 verde)
  const iconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADUSURBVDiNpZMxCsIwFIa/pLQOBQcPICIepYMHcHDwAh7Ao7i5iYuCiHgAN8FBcHN0cRAcKhRpKW1fhxRSk5ekDz5C8v6XvJeEMBFCCCGEEEKI/8zMDBEREREREf+ZmdkDMDMzQ0RERERExH9mZvYAzMzMEBERERERf5iZ2QMwMzNDREREREREYWZmD8DMzAwRERERERFhZmYPwMzMDBERERERERFmZmYPwMzMDBERERER/zMzswdgZmaGiIiIiIiI/8zM7AGYmZkhIiIiIiIi4jMzswdgZmaGiIiIiIiIiIiIiIiIiIiIiIiIiIiIiA==';

  try {
    const img = nativeImage.createFromDataURL(iconBase64);
    tray = new Tray(img);
  } catch {
    tray = new Tray(nativeImage.createEmpty());
  }

  tray.setToolTip('Magiore Marketplace Poster');
  atualizarMenuTray();

  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.hide();
    else { mainWindow.show(); mainWindow.focus(); }
  });
}

function atualizarMenuTray() {
  const menu = Menu.buildFromTemplate([
    { label: '🏠 Magiore Marketplace', enabled: false },
    { type: 'separator' },
    {
      label: schedulerAtivo ? '⏹ Parar Agendamento' : '▶ Iniciar Agendamento',
      click: () => schedulerAtivo ? pararScheduler() : iniciarScheduler()
    },
    { label: '📤 Postar Agora', click: () => executarSessao(), enabled: !postando },
    { type: 'separator' },
    { label: '🪟 Abrir Painel', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: '❌ Fechar', click: () => { app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

// ── Status para o painel ──────────────────────────────────────
async function atualizarStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  let pendentes = 0;
  try {
    await sheets.inicializar();
    const lista = await sheets.buscarPendentes(100);
    pendentes = lista.length;
  } catch {}

  const proximasPostagens = [
    config.postagem.cron.horario1,
    config.postagem.cron.horario2,
    config.postagem.cron.horario3,
  ].map(expr => proximaExecucao(expr));

  mainWindow.webContents.send('status', {
    schedulerAtivo,
    postando,
    pendentes,
    proximasPostagens,
    horarios: [
      config.postagem.cron.horario1,
      config.postagem.cron.horario2,
      config.postagem.cron.horario3,
    ],
  });
}

function proximaExecucao(cronExpr) {
  try {
    // Cálculo simples do próximo horário baseado na expressão cron
    const partes = cronExpr.split(' ');
    const hora = parseInt(partes[1]);
    const min = parseInt(partes[0]);
    const agora = new Date();
    const proxima = new Date();
    proxima.setHours(hora, min, 0, 0);
    if (proxima <= agora) proxima.setDate(proxima.getDate() + 1);
    return proxima.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return cronExpr; }
}

// ── Sessão de postagem ────────────────────────────────────────
async function executarSessao() {
  if (postando) { adicionarLog('warn', 'Já há uma postagem em andamento'); return; }

  postando = true;
  atualizarMenuTray();
  atualizarStatus();
  adicionarLog('info', '═══ INICIANDO SESSÃO ═══');

  const poster = new FacebookPoster();
  try {
    await sheets.inicializar();
    const pendentes = await sheets.buscarPendentes(config.postagem.maxPorSessao);

    if (pendentes.length === 0) {
      adicionarLog('info', 'Nenhum imóvel pendente. Sessão encerrada.');
      return;
    }

    await poster.iniciar();
    await poster.verificarLogin();

    for (let i = 0; i < pendentes.length; i++) {
      const imovel = pendentes[i];
      adicionarLog('info', `[${i+1}/${pendentes.length}] ${imovel.titulo}`);

      const imagensLocais = await imageHandler.processarImagens(imovel.imagens);
      const resultado = await poster.postarImovel(imovel, imagensLocais);

      if (resultado.sucesso) {
        await sheets.marcarPostado(imovel._linhaIdx, resultado.link);
      } else {
        await sheets.marcarErro(imovel._linhaIdx, resultado.erro);
      }

      if (i < pendentes.length - 1) {
        const delay = config.postagem.delayEntrePostsMs + Math.random() * 20000;
        adicionarLog('info', `Aguardando ${Math.round(delay/1000)}s...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    await imageHandler.limparTemp();
    adicionarLog('info', '═══ SESSÃO CONCLUÍDA ═══');

  } catch (err) {
    adicionarLog('error', 'Erro na sessão: ' + err.message);
  } finally {
    await poster.fechar();
    postando = false;
    atualizarMenuTray();
    atualizarStatus();
  }
}

// ── Scheduler ─────────────────────────────────────────────────
function iniciarScheduler() {
  if (schedulerAtivo) return;

  const horarios = [
    config.postagem.cron.horario1,
    config.postagem.cron.horario2,
    config.postagem.cron.horario3,
  ];

  horarios.forEach((horario, i) => {
    if (!cron.validate(horario)) return;
    const job = cron.schedule(horario, () => {
      adicionarLog('info', `🔔 Cron disparou (Horário ${i+1})`);
      executarSessao();
    }, { timezone: 'America/Sao_Paulo' });
    cronJobs.push(job);
  });

  schedulerAtivo = true;
  adicionarLog('info', '▶ Agendamento iniciado');
  atualizarMenuTray();
  atualizarStatus();
}

function pararScheduler() {
  cronJobs.forEach(j => j.stop());
  cronJobs = [];
  schedulerAtivo = false;
  adicionarLog('info', '⏹ Agendamento parado');
  atualizarMenuTray();
  atualizarStatus();
}

// ── IPC: mensagens do painel ──────────────────────────────────
ipcMain.on('cmd', (_, cmd) => {
  if (cmd === 'iniciar')      iniciarScheduler();
  if (cmd === 'parar')        pararScheduler();
  if (cmd === 'postar-agora') executarSessao();
  if (cmd === 'fechar')       mainWindow.hide();
  if (cmd === 'minimizar')    mainWindow.minimize();
  if (cmd === 'refresh')      atualizarStatus();
  if (cmd === 'abrir-sheets')
    shell.openExternal('https://docs.google.com/spreadsheets/d/1JwZU3w4oYI-JClzEWsIzbDW9K5K8wCg9Fx7ucr45sik');
});

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(() => {
  criarJanela();
  criarTray();
  atualizarStatus();

  // Atualiza status a cada 30s
  setInterval(atualizarStatus, 30000);
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('before-quit', () => { pararScheduler(); });
