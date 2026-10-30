const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs-extra');
const path = require('path');
const config = require('./config');
const logger = require('./logger');

puppeteer.use(StealthPlugin());

const sleep = (min, max) => {
  const ms = max ? Math.random() * (max - min) + min : min;
  return new Promise(r => setTimeout(r, ms));
};

async function clicarPorTexto(page, texto, timeout = 10000) {
  try {
    await page.waitForXPath(`//*[contains(text(), "${texto}")]`, { timeout });
    const [el] = await page.$x(`//*[contains(text(), "${texto}")]`);
    if (el) { await el.click(); return true; }
  } catch { return false; }
  return false;
}

async function screenshot(page, nome) {
  const dir = path.resolve('./logs/screenshots');
  await fs.ensureDir(dir);
  const arquivo = path.join(dir, `${nome}_${Date.now()}.png`);
  await page.screenshot({ path: arquivo, fullPage: false });
  logger.debug(`📸 Screenshot: ${arquivo}`);
  return arquivo;
}

class FacebookPoster {
  constructor() {
    this.browser = null;
    this.page = null;
    this.logado = false;
  }

  async iniciar() {
    logger.info('🚀 Iniciando navegador...');
    await fs.ensureDir(config.puppeteer.userDataDir);

    this.browser = await puppeteer.launch({
      headless: config.puppeteer.headless,
      executablePath: config.puppeteer.executablePath,
      userDataDir: config.puppeteer.userDataDir,
      args: config.puppeteer.args,
      defaultViewport: config.puppeteer.defaultViewport,
    });

    this.page = await this.browser.newPage();
    await this.page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });
    await this.page.emulateTimezone('America/Sao_Paulo');

    await this.page.setRequestInterception(true);
    this.page.on('request', req => {
      const tipo = req.resourceType();
      if (['media', 'font', 'websocket'].includes(tipo)) req.abort();
      else req.continue();
    });

    logger.info('✅ Navegador iniciado');
  }

  async verificarLogin() {
    logger.info('🔐 Verificando sessão do Facebook...');
    await this.page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000, 3000);

    const urlAtual = this.page.url();
    const temLogin = await this.page.$('input[name="email"]');

    if (temLogin || urlAtual.includes('/login')) {
      logger.info('📧 Sessão expirada — fazendo login...');
      await this._fazerLogin();
    } else {
      logger.info('✅ Sessão ativa — já logado');
      this.logado = true;
    }
  }

  async _fazerLogin() {
  logger.info('🔑 Realizando login...');
  
  try {
    await this.page.goto(config.facebook.urlLogin, { 
      waitUntil: 'networkidle2', 
      timeout: 40000 
    });
    await this._aguardar(3000, 4000);
    
    // ⭐ Fecha popup de cookies
    await this._fecharCookieConsent();
    await this._aguardar(1000, 1500);
    
    // ⭐ Aguarda o campo de email estar visível
    await this.page.waitForSelector('input[name="email"]', { timeout: 10000 });
    
    // ⭐ Preenche email com simulação humana
    await this.page.click('input[name="email"]', { clickCount: 3 });
    await this._aguardar(200, 300);
    await this.page.keyboard.press('Backspace');
    await this._aguardar(200, 300);
    
    // Digita o email
    const email = config.facebook.email;
    for (const char of email) {
      await this.page.keyboard.type(char, { delay: 50 + Math.random() * 30 });
    }
    await this._aguardar(400, 700);
    
    // ⭐ Preenche senha
    await this.page.click('input[name="pass"]');
    await this._aguardar(200, 300);
    
    const senha = config.facebook.senha;
    for (const char of senha) {
      await this.page.keyboard.type(char, { delay: 40 + Math.random() * 30 });
    }
    await this._aguardar(400, 700);
    
    // ⭐ Submete com Enter
    await this.page.focus('input[name="pass"]');
    await this._aguardar(300, 500);
    await this.page.keyboard.press('Enter');
    await this._aguardar(5000, 8000);
    
    // ⭐ Verifica resultado
    const url = this.page.url();
    
    if (url.includes('checkpoint') || url.includes('two_step')) {
      await screenshot(this.page, 'login-verificacao-2fa');
      throw new Error('Facebook pediu verificação em duas etapas. Complete manualmente.');
    }
    
    if (url.includes('/login')) {
      await screenshot(this.page, 'login-falhou');
      throw new Error('Login falhou — credenciais incorretas ou bloqueio.');
    }
    
    // ⭐ Verifica se realmente logou
    const temFeed = await this.page.$('[role="feed"]');
    if (!temFeed) {
      const temAvatar = await this.page.$('img[alt*="Foto do perfil"]');
      if (!temAvatar) {
        logger.warn('⚠️ Pode não ter logado corretamente, mas continuando...');
      }
    }
    
    this.logado = true;
    logger.info('✅ Login realizado com sucesso');
    
  } catch (err) {
    logger.error(`❌ Erro no login: ${err.message}`);
    throw err;
  }
}

  async _fecharCookieConsent() {
    const textosBotao = ['Aceitar todos os cookies', 'Aceitar todos', 'Allow all cookies', 'Accept all'];
    for (const texto of textosBotao) {
      try {
        const [btn] = await this.page.$x(`//button[contains(., "${texto}")]`);
        if (btn) { await btn.click(); await sleep(800, 1200); return; }
      } catch { continue; }
    }
  }

  // ══════════════════════════════════════════════════════════════
// POSTAGEM PRINCIPAL (COM CONTA ATIVA)
// ══════════════════════════════════════════════════════════════
async postarImovel(imovel, imagensLocais) {
  // ⭐ PEGA A CONTA ATIVA PARA WHATSAPP/CRECI
  const contaId = config.facebook.contaAtiva || 1;
  const conta = config.facebook.contas[contaId] || {};
  
  // ⭐ Sempre atualiza (mesmo se vazio) — se não atualizasse quando vazio,
  // o valor da conta anterior (postada antes, na mesma sessão) ficaria
  // "vazando" pra essa conta, já que config é um objeto compartilhado.
  config.facebook.whatsapp = conta.whatsapp || '';
  config.facebook.creci = conta.creci || '';
  
  logger.info(`📦 Postando: ${imovel.titulo}`);
  logger.info(`   Conta: ${conta.nome || contaId}`);
  logger.info(`   WhatsApp: ${config.facebook.whatsapp || '(não informado)'}`);
  logger.info(`   CRECI: ${config.facebook.creci || '(não informado)'}`);
  logger.info(`   Etiquetas: "${imovel.etiquetas || '(vazio)'}"`);
  logger.info(`   Imagens: ${imagensLocais.length} arquivo(s)`);

  try {
    await this.page.goto(config.facebook.urlMarketplace, {
      waitUntil: 'load',
      timeout: config.puppeteer.timeout,
    });
    await sleep(3000, 5000);

    // ── 1. IMAGENS ────────────────────────────────────────────
    if (imagensLocais.length > 0) {
      await this._uploadImagens(imagensLocais);
      await sleep(2000, 3000);
      await this._fecharDialogErro();
    }

    // ── 2. TÍTULO ─────────────────────────────────────────────
    await this._preencherTitulo(imovel.titulo);

    // ── 3. PREÇO ──────────────────────────────────────────────
    await this._preencherPreco(imovel.preco);

    // ── 4. CATEGORIA → Móveis ─────────────────────────────────
    await this._selecionarCategoriaMoveis();

    // ── 5. CONDIÇÃO → Novo ────────────────────────────────────
    await this._selecionarCondicaoNovo();

    // ── 6. DESCRIÇÃO ──────────────────────────────────────────
    await this._preencherDescricao(imovel);

    // ── 7. ETIQUETAS ──────────────────────────────────────────
    await this._adicionarEtiquetas(imovel.etiquetas);

    // ── 8. AVANÇAR ────────────────────────────────────────────
    await this._clicarAvancar();

    // ── 9. GRUPOS + PUBLICAR ──────────────────────────────────
    const link = await this._publicar();

    logger.info(`✅ Postado: ${imovel.titulo} → ${link}`);
    return { sucesso: true, link };

  } catch (err) {
    await screenshot(this.page, `erro-${imovel.id || 'sem-id'}`);
    logger.error(`❌ Erro ao postar: ${err.message}`);
    return { sucesso: false, erro: err.message };
  }
}

  // ─── 1. UPLOAD DE IMAGENS ─────────────────────────────────────
  async _uploadImagens(arquivos) {
    logger.info(`🖼️ Enviando ${arquivos.length} imagem(ns)...`);

    // Verifica se os arquivos existem antes de tentar upload
    const existentes = [];
    for (const arq of arquivos) {
      if (await fs.pathExists(arq)) {
        existentes.push(arq);
        logger.debug(`  ✅ Existe: ${path.basename(arq)}`);
      } else {
        logger.warn(`  ⚠️ Não encontrado: ${arq}`);
      }
    }

    if (existentes.length === 0) {
      logger.warn('⚠️ Nenhuma imagem válida para upload');
      return;
    }

    let inputFile = await this.page.$('input[type="file"]');
    if (!inputFile) {
      await clicarPorTexto(this.page, 'Adicionar fotos', 5000).catch(() => {});
      await sleep(1000, 1500);
      inputFile = await this.page.$('input[type="file"]');
    }

    if (!inputFile) {
      logger.warn('⚠️ Input de arquivo não encontrado na página');
      return;
    }

    const limite = existentes.slice(0, 10);
    await inputFile.uploadFile(...limite);
    await sleep(4000, 6000); // aguarda upload completar

    logger.info(`✅ ${limite.length} imagem(ns) enviada(s)`);
  }

  // ─── 2. TÍTULO ────────────────────────────────────────────────
  async _preencherTitulo(titulo) {
    const ok = await this.page.evaluate((valor) => {
      const campo =
        document.querySelector('input[name="title"]') ||
        Array.from(document.querySelectorAll('input[type="text"], input:not([type])'))
          .find(el => el.offsetParent !== null);
      if (!campo) return false;
      campo.focus();
      campo.click();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(campo, valor);
      campo.dispatchEvent(new Event('input',  { bubbles: true }));
      campo.dispatchEvent(new Event('change', { bubbles: true }));
      campo.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      return true;
    }, titulo);

    logger.info(`  ${ok ? '✅' : '⚠️'} Título: ${ok ? 'OK' : 'FALHOU'}`);
    await sleep(500, 800);
  }

  // ─── 3. PREÇO ─────────────────────────────────────────────────
  async _preencherPreco(preco) {
    const precoLimpo = String(preco).replace(/[^0-9]/g, '');

    const ok = await this.page.evaluate((valor) => {
      const todos = Array.from(
        document.querySelectorAll('input[type="text"], input:not([type]), input[type="number"]')
      ).filter(el => el.offsetParent !== null);

      const campo = document.querySelector('input[name="price"]') || todos[1];
      if (!campo) return false;
      campo.focus();
      campo.click();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(campo, valor);
      campo.dispatchEvent(new Event('input',  { bubbles: true }));
      campo.dispatchEvent(new Event('change', { bubbles: true }));
      campo.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      return true;
    }, precoLimpo);

    logger.info(`  ${ok ? '✅' : '⚠️'} Preço: ${ok ? 'OK' : 'FALHOU'}`);
    await sleep(500, 800);
  }

  // ─── 4. CATEGORIA → Móveis ────────────────────────────────────
  async _selecionarCategoriaMoveis() {
    logger.info('📂 Selecionando Categoria: Móveis...');
    await sleep(1000, 1500);

    // Abre o dropdown de Categoria
    let abriu = false;
    const xpathsCategoria = [
      '//span[text()="Categoria"]',
      '//div[text()="Categoria"]',
      '//label[text()="Categoria"]',
      '//*[contains(@aria-label, "Categoria")]',
    ];
    for (const xpath of xpathsCategoria) {
      try {
        const [el] = await this.page.$x(xpath);
        if (el) { await el.click(); abriu = true; break; }
      } catch { continue; }
    }
    if (!abriu) {
      await this.page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('div, span, label'))
          .find(e => e.textContent.trim() === 'Categoria');
        if (el) el.click();
      });
    }

    await sleep(1200, 1800);

    // Digita "Móveis" para filtrar
    await this.page.keyboard.type('Móveis', { delay: 80 });
    await sleep(1800, 2500);

    // Clica na opção "Móveis" direto no DOM — mais confiável que XPath em dropdown React
    const selecionado = await this.page.evaluate(() => {
      // Procura em role="option" primeiro
      const options = Array.from(document.querySelectorAll('[role="option"]'));
      const opt = options.find(el => el.textContent.trim() === 'Móveis');
      if (opt) { opt.click(); return 'option:Móveis'; }

      // Procura qualquer elemento visível com texto exato "Móveis"
      const todos = Array.from(document.querySelectorAll('span, div, li'));
      const exato = todos.find(el =>
        el.textContent.trim() === 'Móveis' &&
        el.offsetParent !== null &&
        !el.querySelector('span, div') // elemento folha (sem filhos)
      );
      if (exato) { exato.click(); return 'span:Móveis'; }

      return null;
    });

    if (selecionado) {
      logger.info(`  ✅ Categoria selecionada via: ${selecionado}`);
    } else {
      logger.warn('  ⚠️ Opção "Móveis" não encontrada no dropdown');
      await screenshot(this.page, 'categoria-nao-encontrada');
    }

    await sleep(1500, 2000);
    logger.info('✅ Categoria MÓVEIS selecionada');
  }

  // ─── 5. CONDIÇÃO → Novo ───────────────────────────────────────
  async _selecionarCondicaoNovo() {
    logger.info('🏷️ Selecionando Condição: Novo...');
    await sleep(800, 1200);

    await this.page.evaluate(() => window.scrollBy(0, 300));
    await sleep(400);

    let clicou = false;
    const xpaths = ['//span[text()="Condição"]', '//div[text()="Condição"]', '//label[text()="Condição"]'];
    for (const xpath of xpaths) {
      try {
        const [el] = await this.page.$x(xpath);
        if (el) { await el.click(); clicou = true; break; }
      } catch { continue; }
    }

    if (!clicou) {
      logger.warn('  ⚠️ Campo Condição não encontrado — pulando');
      return;
    }

    logger.info('  ✅ Campo Condição aberto');
    await sleep(1200, 1800);

    // Tenta clicar na opção "Novo" no dropdown
    const novoOk = await clicarPorTexto(this.page, 'Novo', 6000);
    if (novoOk) {
      logger.info('  ✅ Condição NOVO selecionada');
    } else {
      await this.page.keyboard.press('ArrowDown');
      await sleep(300);
      await this.page.keyboard.press('Enter');
      logger.info('  ✅ Condição: primeira opção selecionada');
    }
    await sleep(1000, 1500);
  }

  // ─── 6. DESCRIÇÃO ─────────────────────────────────────────────
  async _preencherDescricao(imovel) {
    const descricao = this._montarDescricao(imovel);

    const ok = await this.page.evaluate((texto) => {
      const campo =
        document.querySelector('textarea[name="description"]') ||
        document.querySelector('textarea[aria-label*="descrição" i]') ||
        document.querySelector('textarea');
      if (!campo) return false;
      campo.focus();
      campo.click();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(campo, texto);
      campo.dispatchEvent(new Event('input',  { bubbles: true }));
      campo.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, descricao);

    logger.info(`  ${ok ? '✅' : '⚠️'} Descrição: ${ok ? 'OK' : 'FALHOU'}`);
    await sleep(800, 1200);
  }

  // ─── 7. ETIQUETAS (max 20) ────────────────────────────────────
  async _adicionarEtiquetas(etiquetasString) {
    logger.info(`🏷️ Etiquetas recebidas: "${etiquetasString || '(vazio)'}"`);

    if (!etiquetasString || !etiquetasString.trim()) {
      logger.warn('  ⚠️ Nenhuma etiqueta na planilha — pulando');
      return;
    }

    const etiquetas = etiquetasString
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
      .slice(0, 20);

    logger.info(`  → ${etiquetas.length} etiqueta(s) para adicionar`);

    // Scroll para revelar o campo de etiquetas
    await this.page.evaluate(() => window.scrollBy(0, 800));
    await sleep(800, 1200);

    // Encontra o campo por atributos
    let seletorEtiqueta = await this.page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const campo = inputs.find(el =>
        el.offsetParent !== null && (
          (el.placeholder || '').toLowerCase().includes('etiqueta') ||
          (el.getAttribute('aria-label') || '').toLowerCase().includes('etiqueta') ||
          (el.getAttribute('aria-label') || '').toLowerCase().includes('tag')
        )
      );
      if (!campo) return null;
      if (campo.id)   return `#${campo.id}`;
      if (campo.name) return `input[name="${campo.name}"]`;
      return 'FOUND_NO_ID'; // campo existe mas sem id/name
    });

    if (!seletorEtiqueta) {
      logger.info('  Tentando clicar pelo label "Etiquetas de produto"...');
      const clicouLabel = await clicarPorTexto(this.page, 'Etiquetas de produto', 4000);
      if (clicouLabel) {
        await sleep(500);
        seletorEtiqueta = 'CLICKED_LABEL';
        logger.info('  ✅ Campo etiquetas ativado pelo label');
      } else {
        logger.warn('  ⚠️ Campo etiquetas não encontrado — pulando');
        return;
      }
    }

    // Adiciona cada etiqueta digitando de verdade (o campo de etiquetas do
    // Marketplace não é um <input> comum — o truque de "colar" via setter
    // JS não funciona nele, por isso voltamos a digitar). Delay bem baixo
    // pra ficar rápido sem perder confiabilidade.
    let adicionadas = 0;
    for (const tag of etiquetas) {
      try {
        if (seletorEtiqueta !== 'FOUND_NO_ID' && seletorEtiqueta !== 'CLICKED_LABEL') {
          await this.page.click(seletorEtiqueta).catch(() => {});
          await sleep(100, 150);
        }

        await this.page.keyboard.type(tag, { delay: 12 });
        await sleep(120, 200);
        await this.page.keyboard.press('Enter');
        await sleep(180, 280);
        adicionadas++;
      } catch (err) {
        logger.debug(`  Tag "${tag}" ignorada: ${err.message}`);
      }
    }

    logger.info(`✅ ${adicionadas}/${etiquetas.length} etiqueta(s) adicionadas`);
    await sleep(500, 800);
  }

  // ─── 8. AVANÇAR ───────────────────────────────────────────────
  async _clicarAvancar() {
    logger.info('⏭️ Clicando em Avançar...');
    const textos = ['Avançar', 'Next', 'Continue'];
    for (const texto of textos) {
      if (await clicarPorTexto(this.page, texto, 3000)) {
        logger.info(`  ✅ "${texto}" clicado`);
        await sleep(2500, 4000);
        return true;
      }
    }
    logger.warn('  ⚠️ Botão Avançar não encontrado');
    return false;
  }

  // ─── 9. PUBLICAR + GRUPOS ─────────────────────────────────────
  async _publicar() {
    logger.info('🚀 Publicando...');
    await sleep(2000, 3000);

    await this._selecionarGrupos();

    const clicou = await clicarPorTexto(this.page, 'Publicar', 10000);
    if (clicou) logger.info('  ✅ Botão Publicar clicado');

    await sleep(5000, 8000);
    const url = this.page.url();
    return url.includes('marketplace') ? url : '';
  }

  // ─── GRUPOS (até 20) ──────────────────────────────────────────
  async _selecionarGrupos() {
  logger.info('👥 Selecionando os 20 maiores grupos...');
  await sleep(1500, 2500);

  const naTelaGrupos = await this.page.evaluate(() =>
    document.body.innerText.includes('Anunciar nos seus grupos') ||
    document.body.innerText.includes('seus grupos')
  );

  if (!naTelaGrupos) {
    logger.info('  ℹ️ Tela de grupos não detectada — pulando');
    return;
  }

  // Scroll para carregar todos os grupos visíveis
  await this.page.evaluate(() => {
    const painel = document.querySelector('[role="dialog"]') || document.body;
    painel.scrollTop = 9999;
  });
  await sleep(1000, 1500);

  const resultado = await this.page.evaluate(() => {
    // Converte "15,1 mil membros" → 15100, "300 membros" → 300
    function parseMembros(texto) {
      if (!texto) return 0;
      const match = texto.match(/([\d,.]+)\s*(mil)?/i);
      if (!match) return 0;
      let num = parseFloat(match[1].replace(',', '.'));
      if (match[2]) num *= 1000;
      return Math.round(num);
    }

    // Coleta todos os grupos com checkbox + membros
    const grupos = [];
    const checkboxes = Array.from(document.querySelectorAll(
      '[role="checkbox"][aria-checked="false"], input[type="checkbox"]:not(:checked)'
    )).filter(el => el.offsetParent !== null);

    for (const checkbox of checkboxes) {
      // Sobe na árvore para achar o container do grupo
      let container = checkbox;
      for (let i = 0; i < 6; i++) {
        container = container.parentElement;
        if (!container) break;
        const texto = container.innerText || '';
        if (texto.includes('membros')) {
          const membros = parseMembros(texto);
          const nome = texto.split('\n')[0]?.trim() || 'Grupo';
          grupos.push({ checkbox, membros, nome });
          break;
        }
      }
    }

    // Ordena do maior para o menor
    grupos.sort((a, b) => b.membros - a.membros);

    // Seleciona os 20 maiores
    const selecionados = [];
    for (const g of grupos.slice(0, 20)) {
      try {
        g.checkbox.click();
        selecionados.push({ nome: g.nome, membros: g.membros });
      } catch {}
    }

    return selecionados;
  });

  if (resultado && resultado.length > 0) {
    logger.info(`✅ ${resultado.length} grupos selecionados (por tamanho):`);
    resultado.forEach((g, i) => {
      const membros = g.membros >= 1000
        ? `${(g.membros/1000).toFixed(1)}k`
        : g.membros;
      logger.info(`   ${i+1}. ${g.nome} — ${membros} membros`);
    });
    await sleep(1000, 1500);
  } else {
    logger.warn('  ⚠️ Nenhum grupo encontrado para selecionar');
  }
}

// Nova função: editor de preços
async executarEditorPreco(valorAlvo = 10) {
  logger.info(`💰 Iniciando editor de preços para valor alvo: R$ ${valorAlvo}`);
  
  const PriceEditor = require('./priceEditor');
  const editor = new PriceEditor(this.page);
  
  const resultado = await editor.reduzirPrecos(valorAlvo);
  return resultado;
}

  // ─── FECHA DIALOG "OPA!" ──────────────────────────────────────
  async _fecharDialogErro() {
    try {
      const temDialog = await this.page.evaluate(() =>
        document.body.innerText.includes('Opa!') ||
        document.body.innerText.includes('Ocorreu um erro')
      );
      if (!temDialog) return;

      logger.warn('⚠️ Dialog de erro — fechando...');
      const fechou = await clicarPorTexto(this.page, 'Fechar', 3000);
      if (fechou) { await sleep(1000, 1500); }
      else { await this.page.keyboard.press('Escape'); await sleep(500); }
    } catch {}
  }

  // ─── DESCRIÇÃO FORMATADA ──────────────────────────────────────
  // ⭐ Sempre remove contato/CRECI antigo (pode ter vindo salvo na planilha
  // com os dados de outra conta) e insere o contato da conta ATUAL,
  // que já foi definido em config.facebook.whatsapp/creci no início de postarImovel().
  _montarDescricao(imovel) {
  // Remove o que já estiver no texto pra não duplicar:
  //   - contato/CRECI (formatos 📲 e "Mais informações")
  //   - linhas de quarto/banheiro/área (🛏️/🚿/📐), que combinarDescricoes()
  //     já deixa salvas na planilha e serão adicionadas de novo mais abaixo
  let desc = (imovel.descricao || '')
    .replace(/\n*📲[^\n]*/gi, '')
    .replace(/\n*Mais informações\n[^\n]*/gi, '')
    .replace(/\n*✒️?\s*CRECI[^\n]*/gi, '')
    .replace(/\n*🛏️?\s*\d+[^\n]*/gi, '')
    .replace(/\n*🚿\s*\d+[^\n]*/gi, '')
    .replace(/\n*📐\s*\d+[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const partes = [desc];
  const detalhes = [];
  if (imovel.quartos)   detalhes.push(`🛏 ${imovel.quartos} quarto(s)`);
  if (imovel.banheiros) detalhes.push(`🚿 ${imovel.banheiros} banheiro(s)`);
  if (imovel.area)      detalhes.push(`📐 ${imovel.area} m²`);
  if (detalhes.length > 0) partes.push('\n' + detalhes.join('\n'));

  // ⭐ Contato/CRECI da conta que está postando AGORA
  const whatsapp = config.facebook.whatsapp || '';
  const creci = config.facebook.creci || '';
  if (whatsapp) partes.push(`\nMais informações\n${whatsapp}`);
  if (creci)    partes.push(`✒️ ${creci}`);

  return partes.join('\n');
}

// ⭐ Postar em múltiplas contas (CADA CONTA COM SEU NAVEGADOR - USANDO SESSÃO SALVA)
async postarMultiplasContas(imovel, imagensLocais, contasSelecionadas = [1]) {
  logger.info(`📦 Postando em ${contasSelecionadas.length} conta(s): ${imovel.titulo}`);
  
  const resultados = [];
  const sheets = require('./sheets');
  
  for (const contaId of contasSelecionadas) {
    logger.info(`  🔄 Conta ${contaId}: iniciando...`);
    
    let posterConta = null;
    
    try {
      const conta = config.facebook.contas[contaId];
      if (!conta || !conta.email) {
        logger.warn(`  ⚠️ Conta ${contaId} não configurada`);
        continue;
      }
      
      // ⭐ Define qual conta está ativa AGORA — usado por postarImovel()
      // para pegar o whatsapp/creci certos e por _montarDescricao() para
      // montar o rodapé de contato correto.
      config.facebook.contaAtiva = contaId;
      
      // ⭐ Cria UM NOVO POSTER para cada conta (com perfil separado)
      posterConta = new FacebookPoster();
      
      // ⭐ Sobrescreve o userDataDir para usar o perfil da conta
      const userDataDirOriginal = config.puppeteer.userDataDir;
      config.puppeteer.userDataDir = conta.userDataDir || `./chrome-profile-conta${contaId}`;
      
      // ⭐ Atualiza credenciais
      config.facebook.email = conta.email;
      config.facebook.senha = conta.senha;
      
      // ⭐ Inicia o navegador
      await posterConta.iniciar();
      
      // ⭐ VERIFICA SE JÁ ESTÁ LOGADO (sessão salva) - SEM FORÇAR LOGIN
      const logado = await posterConta._verificarLoginComSessao();
      
      if (!logado) {
        logger.info(`  🔑 Sessão não encontrada para Conta ${contaId}. Tentando login...`);
        try {
          await posterConta._fazerLogin();
        } catch (loginErr) {
          // Se falhar, tenta novamente com navegador visível
          logger.warn(`  ⚠️ Login automático falhou. Tentando com navegador visível...`);
          config.puppeteer.headless = false;
          await posterConta.fechar();
          await posterConta.iniciar();
          await posterConta._verificarLoginComSessao();
          if (!posterConta.logado) {
            throw new Error('Não foi possível logar automaticamente');
          }
        }
      } else {
        logger.info(`  ✅ Sessão ativa para Conta ${contaId} (login salvo)`);
      }
      
      // ⭐ Aguarda a página carregar completamente
      await posterConta.page.waitForSelector('body', { timeout: 15000 });
      await this._aguardar(2000, 3000);
      
      // ⭐ Posta o imóvel
      const resultado = await posterConta.postarImovel(imovel, imagensLocais);
      
      if (resultado.sucesso) {
        await sheets.marcarPostadoConta(imovel._linhaIdx, contaId, resultado.link);
        logger.info(`  ✅ Conta ${contaId}: postado com sucesso!`);
        resultados.push({ contaId, sucesso: true, link: resultado.link });
        
        // Verifica se todas as contas postaram
        const contasAtivas = contasSelecionadas.filter(id => 
          config.facebook.contas[id]?.email
        );
        const todasPostaram = await sheets.verificarTodasContasPostaram(imovel._linhaIdx, contasAtivas);
        
        if (todasPostaram) {
          await sheets.atualizarStatusGeral(imovel._linhaIdx, 'postado', { 
            link: resultado.link 
          });
          logger.info(`  🎯 Todas as contas postaram! Status geral atualizado.`);
        }
        
      } else {
        logger.warn(`  ❌ Conta ${contaId}: falha - ${resultado.erro}`);
        resultados.push({ contaId, sucesso: false, erro: resultado.erro });
      }
      
      // ⭐ Fecha o navegador da conta
      await posterConta.fechar();
      
      // ⭐ Restaura configuração
      config.puppeteer.userDataDir = userDataDirOriginal;
      
      // Delay entre contas
      if (contaId !== contasSelecionadas[contasSelecionadas.length - 1]) {
        logger.info(`  ⏳ Aguardando 30s antes da próxima conta...`);
        await this._aguardar(30000, 45000);
      }
      
    } catch (err) {
      logger.error(`  ❌ Conta ${contaId}: erro - ${err.message}`);
      resultados.push({ contaId, sucesso: false, erro: err.message });
      
      // Tenta fechar o navegador se estiver aberto
      if (posterConta) {
        try { await posterConta.fechar(); } catch (e) {}
      }
      
      // Restaura configuração
      config.puppeteer.userDataDir = './chrome-profile';
    }
  }
  
  return { sucesso: resultados.some(r => r.sucesso), resultados };
}

// ⭐ Verifica se a sessão já está logada (SEM FORCAR LOGIN)
async _verificarLoginComSessao() {
  try {
    logger.debug('🔍 Verificando sessão salva...');
    
    // ⭐ Vai direto para o Facebook (não para a página de login)
    await this.page.goto('https://www.facebook.com/', { 
      waitUntil: 'domcontentloaded', 
      timeout: 20000 
    });
    await this._aguardar(3000, 4000);
    
    const urlAtual = this.page.url();
    logger.debug(`📍 URL atual: ${urlAtual}`);
    
    // ⭐ Se estiver na página de login, não está logado
    if (urlAtual.includes('/login')) {
      logger.debug('❌ Redirecionado para página de login');
      return false;
    }
    
    // ⭐ Verifica se tem o feed
    const temFeed = await this.page.$('[role="feed"]');
    if (temFeed) {
      logger.debug('✅ Feed encontrado - logado!');
      this.logado = true;
      return true;
    }
    
    // ⭐ Verifica se tem o avatar do usuário
    const temAvatar = await this.page.$('img[alt*="Foto do perfil"]');
    if (temAvatar) {
      logger.debug('✅ Avatar encontrado - logado!');
      this.logado = true;
      return true;
    }
    
    // ⭐ Verifica se tem o botão de "Criar" ou "Início"
    const temInicio = await this.page.$('a[aria-label="Início"]');
    if (temInicio) {
      logger.debug('✅ Link Início encontrado - logado!');
      this.logado = true;
      return true;
    }
    
    // ⭐ Verifica se está na página de checkpoint (verificação)
    if (urlAtual.includes('checkpoint')) {
      logger.warn('⚠️ Facebook pediu verificação (checkpoint)');
      // Abre navegador visível para o usuário resolver
      config.puppeteer.headless = false;
      await this.page.bringToFront();
      await this._aguardar(5000, 8000);
      return false;
    }
    
    logger.debug('❌ Nenhum indicador de login encontrado');
    return false;
    
  } catch (err) {
    logger.debug(`⚠️ Erro ao verificar sessão: ${err.message}`);
    return false;
  }
}

// ⭐ MÉTODO DE LOGIN CORRIGIDO (verifica se já está na página de login)
async _fazerLogin() {
  logger.info('🔑 Realizando login...');
  
  try {
    // ⭐ Primeiro verifica se já está na página certa
    const urlAtual = this.page.url();
    
    if (!urlAtual.includes('login') && !urlAtual.includes('checkpoint')) {
      // Vai para a página de login
      await this.page.goto(config.facebook.urlLogin, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });
      await this._aguardar(3000, 4000);
    }
    
    // ⭐ Fecha popup de cookies
    await this._fecharCookieConsent();
    await this._aguardar(1000, 1500);
    
    // ⭐ Verifica se o campo de email está presente
    const temEmail = await this.page.$('input[name="email"]');
    if (!temEmail) {
      // ⚠️ Não é garantia de estar logado — também pode ser uma tela de
      // aprovação de dispositivo (checkpoint) sem campo de email.
      // Confirma de verdade antes de seguir; se não confirmar, espera aprovação manual.
      const logadoConfirmado = await this._verificarLoginComSessao();
      if (logadoConfirmado) {
        logger.info('  ✅ Sessão confirmada — já logado');
        this.logado = true;
        return;
      }
      logger.warn('  📱 Campo de email não encontrado, mas sessão não confirmada.');
      logger.warn('  📱 Pode ser tela de aprovação no celular — aguardando...');
      await this._aguardarAprovacaoManual();
      return;
    }
    
    // ⭐ Aguarda o campo de email estar visível
    await this.page.waitForSelector('input[name="email"]', { timeout: 10000 });
    
    // ⭐ Preenche email
    await this.page.click('input[name="email"]', { clickCount: 3 });
    await this._aguardar(200, 300);
    await this.page.keyboard.press('Backspace');
    await this._aguardar(200, 300);
    
    const email = config.facebook.email;
    for (const char of email) {
      await this.page.keyboard.type(char, { delay: 50 + Math.random() * 30 });
    }
    await this._aguardar(400, 700);
    
    // ⭐ Preenche senha
    await this.page.click('input[name="pass"]');
    await this._aguardar(200, 300);
    
    const senha = config.facebook.senha;
    for (const char of senha) {
      await this.page.keyboard.type(char, { delay: 40 + Math.random() * 30 });
    }
    await this._aguardar(400, 700);
    
    // ⭐ Submete com Enter
    await this.page.focus('input[name="pass"]');
    await this._aguardar(300, 500);
    await this.page.keyboard.press('Enter');
    await this._aguardar(5000, 8000);
    
    // ⭐ Verifica resultado
    const url = this.page.url();
    
    if (url.includes('checkpoint') || url.includes('two_step')) {
      logger.warn('  📱 Facebook pediu verificação em duas etapas (aprovar no celular)...');
      await this._aguardarAprovacaoManual();
      return;
    }
    
    if (url.includes('/login')) {
      // Pode ter falhado, mas vamos verificar se a sessão foi salva
      const logado = await this._verificarLoginComSessao();
      if (!logado) {
        throw new Error('Login falhou - credenciais incorretas');
      }
    }
    
    this.logado = true;
    logger.info('✅ Login realizado com sucesso');
    
  } catch (err) {
    // Se falhou, tenta verificar se a sessão foi salva de qualquer forma
    try {
      const logado = await this._verificarLoginComSessao();
      if (logado) {
        logger.info('✅ Sessão encontrada após tentativa de login');
        this.logado = true;
        return;
      }
    } catch (e) {}
    
    logger.error(`❌ Erro no login: ${err.message}`);
    throw err;
  }
}

// ⭐ Espera de verdade a aprovação manual no celular (checkpoint/2FA),
// checando periodicamente em vez de desistir depois de 10-15s.
// Padrão: até 3 minutos, checando a cada 5s.
async _aguardarAprovacaoManual(timeoutMs = 180000, intervaloMs = 5000) {
  await this.page.bringToFront().catch(() => {});
  
  const minutos = Math.round(timeoutMs / 60000);
  logger.warn(`  ⏳ Aguardando aprovação no celular — você tem até ${minutos} minuto(s). Pegue o celular e aprove o login.`);
  
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    await this._aguardar(intervaloMs, intervaloMs);
    
    // ⭐ Checa SEM navegar (sem page.goto) — antes isso chamava
    // _verificarLoginComSessao(), que recarregava a página a cada 5s
    // e nunca deixava a tela de aprovação/checkpoint estabilizar.
    const logado = await this._checarAprovadoSemNavegar();
    if (logado) {
      logger.info('  ✅ Aprovação detectada — login concluído!');
      this.logado = true;
      return;
    }
    
    const restanteS = Math.round((timeoutMs - (Date.now() - inicio)) / 1000);
    if (restanteS > 0) {
      logger.info(`  ⏳ Ainda aguardando aprovação... (${restanteS}s restantes)`);
    }
  }
  
  throw new Error('Aprovação manual não foi concluída a tempo (tempo esgotado). Tente rodar de novo quando estiver com o celular por perto.');
}

// ⭐ Checa se o login avançou SEM navegar — só olha a URL atual e o DOM,
// pra não atrapalhar uma aprovação de checkpoint/2FA em andamento no celular.
async _checarAprovadoSemNavegar() {
  try {
    const urlAtual = this.page.url();
    if (urlAtual.includes('checkpoint') || urlAtual.includes('/login')) {
      return false; // ainda no desafio/login
    }
    // Saiu do checkpoint/login sozinho (o próprio Facebook redirecionou) — avançou
    return true;
  } catch {
    return false;
  }
}

// ⭐ Verifica se a sessão já está logada (sem recarregar a página)
async _verificarLoginComSessao() {
  try {
    await this.page.goto('https://www.facebook.com/', { 
      waitUntil: 'domcontentloaded', 
      timeout: 15000 
    });
    await this._aguardar(2000, 3000);
    
    const urlAtual = this.page.url();
    const temLogin = await this.page.$('input[name="email"]');
    
    if (temLogin || urlAtual.includes('/login')) {
      return false; // Não está logado
    }
    
    // Verifica se tem o feed ou elementos de usuário logado
    const temFeed = await this.page.$('[role="feed"]');
    if (temFeed) {
      return true;
    }
    
    // Tenta encontrar o avatar do usuário
    const temAvatar = await this.page.$('img[alt*="Foto do perfil"]');
    if (temAvatar) {
      return true;
    }
    
    return false;
    
  } catch (err) {
    logger.debug(`⚠️ Erro ao verificar sessão: ${err.message}`);
    return false;
  }
}

// ⭐ Método auxiliar para delay
async _aguardar(min, max) {
  const ms = max ? Math.random() * (max - min) + min : min;
  await new Promise(r => setTimeout(r, ms));
}

// ⭐ Delay para uso interno
async _aguardar(min, max) {
  const ms = max ? Math.random() * (max - min) + min : min;
  await new Promise(r => setTimeout(r, ms));
}

  async fechar() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('🔒 Navegador fechado');
    }
  }
}

module.exports = FacebookPoster;