const logger = require('./logger');

class PriceEditor {
  constructor(page) {
    this.page = page;
  }

  async reduzirPrecos(valorAlvo = 10, paginaUrl = 'https://www.facebook.com/marketplace/you/selling') {
    logger.info(`💰 Iniciando redução de preços para anúncios com valor R$ ${valorAlvo}`);
    
    try {
      await this.page.goto(paginaUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await this._aguardar(4000, 6000);
      
      await this._fecharModais();
      
      let anuncios = await this._buscarAnunciosPorPreco(valorAlvo);
      
      let scrollCount = 0;
      const maxScrolls = 3;
      
      while (anuncios.length === 0 && scrollCount < maxScrolls) {
        await this.page.evaluate(() => window.scrollBy(0, 500));
        await this._aguardar(1500, 2000);
        anuncios = await this._buscarAnunciosPorPreco(valorAlvo);
        scrollCount++;
      }
      
      if (anuncios.length === 0) {
        logger.info(`📭 Nenhum anúncio encontrado com o valor R$ ${valorAlvo}`);
        return { sucesso: true, alterados: 0, mensagem: `Nenhum anúncio com R$ ${valorAlvo}` };
      }
      
      // Remove duplicatas pelo título
      const anunciosUnicos = [];
      const titulosVistos = new Set();
      for (const anuncio of anuncios) {
        if (!titulosVistos.has(anuncio.titulo)) {
          titulosVistos.add(anuncio.titulo);
          anunciosUnicos.push(anuncio);
        }
      }
      
      logger.info(`📦 Encontrados ${anunciosUnicos.length} anúncios únicos com R$ ${valorAlvo}`);
      
      let alterados = 0;
      for (let i = 0; i < anunciosUnicos.length; i++) {
        const anuncio = anunciosUnicos[i];
        const novoPreco = this._calcularNovoPreco(valorAlvo);
        
        // Recarrega a página a cada 3 anúncios
        if (i > 0 && i % 3 === 0) {
          logger.info(`  🔄 Recarregando página...`);
          await this.page.reload({ waitUntil: 'networkidle2' });
          await this._aguardar(3000, 4000);
          // Re-busca os índices após recarregar
          anuncios = await this._buscarAnunciosPorPreco(valorAlvo);
        }
        
        const editado = await this._editarPrecoAnuncio(anuncio, novoPreco, i);
        if (editado) alterados++;
        await this._aguardar(3000, 5000);
      }
      
      const novoPreco = this._calcularNovoPreco(valorAlvo);
      logger.info(`✅ Redução concluída: ${alterados}/${anunciosUnicos.length} anúncios alterados para R$ ${novoPreco}`);
      return { sucesso: true, alterados, mensagem: `${alterados} anúncios alterados para R$ ${novoPreco}` };
      
    } catch (err) {
      logger.error(`❌ Erro na redução de preços: ${err.message}`);
      return { sucesso: false, erro: err.message };
    }
  }
  
  async _buscarAnunciosPorPreco(valorAlvo) {
    const textoValor = `R$${valorAlvo}`;
    
    const anuncios = await this.page.evaluate((valor, textoValor) => {
      const resultados = [];
      
      // Procura todos os cards de anúncio
      const cards = Array.from(document.querySelectorAll('[role="article"], div[class*="x1yztbdb"], div[class*="x78zum5"]'));
      
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const texto = card.innerText || '';
        
        if (texto.includes(textoValor)) {
          // Tenta encontrar o título
          const tituloEl = card.querySelector('span[dir="auto"], h2, h3, strong');
          const titulo = tituloEl ? tituloEl.innerText : `Anúncio ${i + 1}`;
          
          resultados.push({
            index: i,
            titulo: titulo.substring(0, 60)
          });
        }
      }
      
      return resultados;
    }, valorAlvo, textoValor);
    
    return anuncios;
  }
  
  async _editarPrecoAnuncio(anuncio, novoPreco, index) {
    try {
      logger.info(`  ✏️ [${index + 1}] Editando: ${anuncio.titulo} → R$ ${novoPreco}`);
      
      // Clica no card usando o índice
      const clicou = await this.page.evaluate((idx) => {
        const cards = Array.from(document.querySelectorAll('[role="article"], div[class*="x1yztbdb"], div[class*="x78zum5"]'));
        if (cards[idx]) {
          cards[idx].click();
          return true;
        }
        return false;
      }, anuncio.index);
      
      if (!clicou) {
        logger.warn('    ⚠️ Não foi possível clicar no card');
        return false;
      }
      
      await this._aguardar(3000, 4000);
      
      // Espera o modal abrir
      await this.page.waitForSelector('[role="dialog"], div[role="dialog"]', { timeout: 8000 }).catch(() => null);
      await this._aguardar(1000, 1500);
      
      // Procura e clica no botão de editar
      const editou = await this._clicarBotaoEditar();
      if (!editou) {
        logger.warn('    ⚠️ Botão editar não encontrado');
        await this._fecharModal();
        return false;
      }
      
      await this._aguardar(2000, 3000);
      
      // Altera o preço
      const precoAlterado = await this._alterarCampoPreco(novoPreco);
      if (!precoAlterado) {
        logger.warn('    ⚠️ Campo preço não encontrado');
        await this._fecharModal();
        return false;
      }
      
      await this._aguardar(1000, 1500);
      
      // Salva as alterações
      const salvou = await this._salvarAlteracoes();
      if (!salvou) {
        logger.warn('    ⚠️ Botão salvar não encontrado');
        await this._fecharModal();
        return false;
      }
      
      await this._aguardar(2000, 3000);
      await this._fecharModal();
      
      logger.info(`  ✅ Preço alterado para R$ ${novoPreco}`);
      return true;
      
    } catch (err) {
      logger.warn(`  ⚠️ Erro ao editar: ${err.message}`);
      await this._fecharModal().catch(() => {});
      return false;
    }
  }
  
  async _clicarBotaoEditar() {
    const clicou = await this.page.evaluate(() => {
      // Procura botão "Editar" ou "Editar classificado"
      const botoes = Array.from(document.querySelectorAll('[role="button"], button, div[role="button"]'));
      
      for (const btn of botoes) {
        const texto = btn.innerText || '';
        if (texto === 'Editar' || texto === 'Editar classificado' || texto === 'Edit') {
          btn.click();
          return true;
        }
      }
      
      // Procura ícone de lápis
      const svgs = Array.from(document.querySelectorAll('svg'));
      for (const svg of svgs) {
        const parent = svg.closest('[role="button"], button');
        if (parent && (svg.innerHTML.includes('pencil') || svg.innerHTML.includes('edit'))) {
          parent.click();
          return true;
        }
      }
      
      return false;
    });
    
    return clicou;
  }
  
  async _alterarCampoPreco(novoPreco) {
    const alterado = await this.page.evaluate((preco) => {
      // Procura o input de preço
      const inputs = Array.from(document.querySelectorAll('input'));
      
      const precoInput = inputs.find(el => 
        el.placeholder === 'Preço' ||
        el.placeholder === 'Price' ||
        el.name === 'price' ||
        el.type === 'number' ||
        (el.getAttribute('aria-label') || '').toLowerCase().includes('preço')
      );
      
      if (!precoInput) return false;
      
      // Limpa e preenche
      precoInput.focus();
      precoInput.select();
      precoInput.value = '';
      precoInput.value = preco.toString();
      precoInput.dispatchEvent(new Event('input', { bubbles: true }));
      precoInput.dispatchEvent(new Event('change', { bubbles: true }));
      
      return true;
    }, novoPreco);
    
    return alterado;
  }
  
  async _salvarAlteracoes() {
    const salvou = await this.page.evaluate(() => {
      const botoes = Array.from(document.querySelectorAll('[role="button"], button'));
      
      for (const btn of botoes) {
        const texto = btn.innerText || '';
        if (texto === 'Salvar' || texto === 'Publicar' || texto === 'Save' || texto === 'Publish') {
          btn.click();
          return true;
        }
      }
      return false;
    });
    
    return salvou;
  }
  
  async _fecharModal() {
    await this.page.evaluate(() => {
      // ESC
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      
      // Tenta clicar no X
      setTimeout(() => {
        const xBtn = document.querySelector('[aria-label="Fechar"], [aria-label="Close"]');
        if (xBtn) xBtn.click();
      }, 500);
    });
    await this._aguardar(1000, 1500);
  }
  
  async _fecharModais() {
    await this.page.evaluate(() => {
      const botoes = Array.from(document.querySelectorAll('[role="button"], button'));
      for (const btn of botoes) {
        const texto = btn.innerText || '';
        if (texto === 'Agora não' || texto === 'Not now' || texto === 'Fechar' || texto === 'Close') {
          btn.click();
        }
      }
    });
    await this._aguardar(500, 1000);
  }
  
  _calcularNovoPreco(valorAtual) {
    let novo = valorAtual - 1;
    if (novo < 1) novo = 10;
    return novo;
  }
  
  async _aguardar(min, max) {
    const ms = max ? Math.random() * (max - min) + min : min;
    await new Promise(r => setTimeout(r, ms));
  }
}

module.exports = PriceEditor;