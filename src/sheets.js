const { google } = require('googleapis');
const config = require('./config');
const logger = require('./logger');
const TagGenerator = require('./tagGenerator');
const DescriptionGenerator = require('./descriptionGenerator');
const TitleGenerator = require('./titleGenerator');

class SheetsManager {
  constructor() {
    this.sheets = null;
    this.auth = null;
    this._cache = {};
    this._ultimaRequisicao = 0;
    this._salvando = false;
  }

  async inicializar() {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: config.sheets.credentialsPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.auth = await auth.getClient();
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
      logger.info('✅ Google Sheets conectado');
    } catch (err) {
      logger.error('Falha ao conectar Google Sheets: ' + err.message);
      throw err;
    }
  }

  async _aguardarQuota() {
    const agora = Date.now();
    const tempoDecorrido = agora - this._ultimaRequisicao;
    if (tempoDecorrido < 200) {
      await new Promise(r => setTimeout(r, 200 - tempoDecorrido));
    }
    this._ultimaRequisicao = Date.now();
  }

  // ⭐ Busca imóveis com status "pendente" ou vazio
  // contasIds pode ser um número único (compatibilidade) ou um array [1,2,3]
  // O imóvel entra na lista se PELO MENOS UMA das contas em contasIds ainda não postou nele.
  async buscarPendentes(limite = 5, contasIds = 1) {
    const contas = Array.isArray(contasIds) ? contasIds : [contasIds];
    try {
      await this._aguardarQuota();
      
      const range = `${config.sheets.aba}!A2:Z1000`;
      const res = await this.sheets.spreadsheets.values.get({
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
        const tipo = linha[letras.indexOf(col.tipo)] || '';
        
        if (!titulo && !tipo) {
          continue;
        }
        
        linhasComDados++;
        
        const idxStatusGeral = letras.indexOf(col.status);
        const statusGeral = (linha[idxStatusGeral] || '').toLowerCase().trim();
        
        if (statusGeral === 'erro' || statusGeral === 'pausado') {
          continue;
        }
        
        // ⭐ Verifica se a linha JÁ TEM rastreio por conta (alguma das colunas
        // Conta1/2/3 Status preenchida). Linhas antigas, de antes desse rastreio
        // existir, têm Status geral = 'postado' mas nenhuma coluna de conta
        // preenchida — nesse caso é um post legado e não deve ser reprocessado
        // pra nenhuma conta, mesmo que a coluna da conta selecionada esteja vazia.
        let temRastreioPorConta = false;
        for (const n of [1, 2, 3]) {
          const idxN = letras.indexOf(col[`conta${n}Status`] || '');
          if (idxN !== -1 && idxN < linha.length && (linha[idxN] || '').trim() !== '') {
            temRastreioPorConta = true;
            break;
          }
        }
        
        if (statusGeral === 'postado' && !temRastreioPorConta) {
          continue;
        }
        
        // ⭐ Verifica, dentre as contas selecionadas, quais ainda estão pendentes NESTA linha
        const contasPendentes = [];
        for (const contaId of contas) {
          const colunaStatusConta = `conta${contaId}Status`;
          const idxStatusConta = letras.indexOf(col[colunaStatusConta] || '');
          let statusConta = '';
          if (idxStatusConta !== -1 && idxStatusConta < linha.length) {
            statusConta = (linha[idxStatusConta] || '').toLowerCase().trim();
          }
          if (statusConta !== 'postado') {
            contasPendentes.push(contaId);
          }
        }
        
        // Se nenhuma das contas selecionadas está pendente, pula (já postou em todas)
        if (contasPendentes.length === 0) {
          continue;
        }
        
        const tituloOriginal = linha[letras.indexOf(col.titulo)] || '';
        const descricaoOriginal = linha[letras.indexOf(col.descricao)] || '';
        const etiquetasOriginal = linha[letras.indexOf(col.etiquetas)] || '';
        
        const imovel = {
          _linhaIdx: i + 2,
          id: linha[letras.indexOf(col.id)] || '',
          titulo: tituloOriginal,
          descricao: descricaoOriginal,
          preco: linha[letras.indexOf(col.preco)] || '0',
          tipo: linha[letras.indexOf(col.tipo)] || 'Casa',
          operacao: linha[letras.indexOf(col.operacao)] || 'Venda',
          quartos: linha[letras.indexOf(col.quartos)] || '',
          banheiros: linha[letras.indexOf(col.banheiros)] || '',
          area: linha[letras.indexOf(col.area)] || '',
          documentacaoGratis: linha[letras.indexOf(col.documentacaoGratis)] || 'nao',
          localizacao: linha[letras.indexOf(col.localizacao)] || '',
          etiquetas: etiquetasOriginal,
          imagens: linha[letras.indexOf(col.imagens)] || '',
          status: statusGeral,
          // ⭐ Só essas contas (subconjunto das selecionadas) devem ser postadas para esta linha
          contasPendentes
        };
        
        // ⭐⭐ USA O TITLE GENERATOR ORIGINAL ⭐⭐
        let novoTitulo = tituloOriginal;
        
        // Se não tem título ou é muito curto ou é "Novo Imóvel", gera
        if (!tituloOriginal || tituloOriginal.length < 10 || tituloOriginal.includes('Novo Imóvel')) {
          novoTitulo = TitleGenerator.gerarTituloInteligente(imovel);
          console.log(`  🔄 Gerando título para linha ${imovel._linhaIdx}: ${novoTitulo}`);
        }
        
        // Gera tags e descrição se necessário
        let novasTags = etiquetasOriginal;
        let novaDescricao = descricaoOriginal;
        
        if (!etiquetasOriginal || etiquetasOriginal.length < 10) {
          novasTags = TagGenerator.gerarTags(imovel);
        }
        
        if (!descricaoOriginal || descricaoOriginal.length < 20) {
          novaDescricao = DescriptionGenerator.combinarDescricoes(imovel, imovel.descricao);
        }
        
        // ⭐ SALVA NA PLANILHA
        if (novoTitulo !== tituloOriginal || novasTags !== etiquetasOriginal || novaDescricao !== descricaoOriginal) {
          await this.salvarDadosGerados(imovel._linhaIdx, {
            titulo: novoTitulo,
            descricao: novaDescricao,
            etiquetas: novasTags
          });
        }
        
        imovel.titulo = novoTitulo;
        imovel.etiquetas = novasTags;
        imovel.descricao = novaDescricao;
        
        pendentes.push(imovel);
        if (pendentes.length >= limite) break;
      }

      logger.info(`📋 ${pendentes.length} imóvel(is) pendente(s) para Conta(s) ${contas.join(',')} (${linhasComDados} linhas com dados)`);
      return pendentes;
      
    } catch (err) {
      logger.error(`❌ Erro ao buscar pendentes: ${err.message}`);
      return [];
    }
  }

  // ⭐ Os outros métodos permanecem os mesmos...
  async marcarPostadoConta(linhaIdx, contaId, link = '') {
    try {
      await this._aguardarQuota();
      
      const agora = new Date().toLocaleString('pt-BR');
      const col = config.sheets.colunas;
      const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      
      const colunaStatus = `conta${contaId}Status`;
      const colunaLink = `conta${contaId}Link`;
      const colunaData = `conta${contaId}Data`;
      
      const idxStatus = letras.indexOf(col[colunaStatus] || '');
      const idxLink = letras.indexOf(col[colunaLink] || '');
      const idxData = letras.indexOf(col[colunaData] || '');
      
      const updates = [];
      
      if (idxStatus !== -1) {
        updates.push({
          range: `${config.sheets.aba}!${letras[idxStatus]}${linhaIdx}`,
          values: [['postado']]
        });
      }
      
      if (idxLink !== -1 && link) {
        updates.push({
          range: `${config.sheets.aba}!${letras[idxLink]}${linhaIdx}`,
          values: [[link]]
        });
      }
      
      if (idxData !== -1) {
        updates.push({
          range: `${config.sheets.aba}!${letras[idxData]}${linhaIdx}`,
          values: [[agora]]
        });
      }
      
      if (updates.length === 0) {
        updates.push(
          { range: `${config.sheets.aba}!${col.status}${linhaIdx}`, values: [['postado']] },
          { range: `${config.sheets.aba}!${col.linkPostagem}${linhaIdx}`, values: [[link]] },
          { range: `${config.sheets.aba}!${col.dataPostagem}${linhaIdx}`, values: [[agora]] }
        );
      }
      
      if (updates.length > 0) {
        await this.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: config.sheets.sheetId,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: updates,
          },
        });
        logger.info(`📝 Linha ${linhaIdx} → Conta ${contaId} postado`);
      }
      
    } catch (err) {
      logger.warn(`⚠️ Erro ao marcar postado conta ${contaId}: ${err.message}`);
    }
  }

  async verificarTodasContasPostaram(linhaIdx, contasAtivas) {
    try {
      await this._aguardarQuota();
      
      const col = config.sheets.colunas;
      const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      
      const range = `${config.sheets.aba}!A${linhaIdx}:Z${linhaIdx}`;
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: config.sheets.sheetId,
        range,
      });
      
      const linha = res.data.values?.[0] || [];
      
      let todasPostaram = true;
      for (const contaId of contasAtivas) {
        const colunaStatus = `conta${contaId}Status`;
        const idx = letras.indexOf(col[colunaStatus] || '');
        if (idx !== -1) {
          const status = (linha[idx] || '').toLowerCase();
          if (status !== 'postado') {
            todasPostaram = false;
            break;
          }
        }
      }
      
      return todasPostaram;
      
    } catch (err) {
      logger.warn(`⚠️ Erro ao verificar contas: ${err.message}`);
      return false;
    }
  }

  async atualizarStatusGeral(linhaIdx, status, extras = {}) {
    try {
      await this._aguardarQuota();
      
      const { link = '', erro = '' } = extras;
      const agora = new Date().toLocaleString('pt-BR');
      const col = config.sheets.colunas;

      const updates = [
        { range: `${config.sheets.aba}!${col.status}${linhaIdx}`, values: [[status]] },
        { range: `${config.sheets.aba}!${col.dataPostagem}${linhaIdx}`, values: [[agora]] },
        { range: `${config.sheets.aba}!${col.linkPostagem}${linhaIdx}`, values: [[link]] },
      ];
      
      if (erro) {
        updates.push({
          range: `${config.sheets.aba}!${col.erro}${linhaIdx}`,
          values: [[erro]]
        });
      }

      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: config.sheets.sheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updates,
        },
      });

      logger.info(`📝 Linha ${linhaIdx} atualizada → ${status}`);
      
    } catch (err) {
      logger.warn(`⚠️ Erro ao atualizar status geral: ${err.message}`);
    }
  }

  async salvarDadosGerados(linhaIdx, dados) {
    if (this._salvando) {
      logger.debug(`⏳ Salvamento em andamento, ignorando linha ${linhaIdx}`);
      return;
    }
    
    this._salvando = true;
    
    try {
      const { titulo, descricao, etiquetas } = dados;
      const col = config.sheets.colunas;
      const updates = [];
      
      // Verifica cache
      const cacheKey = `${linhaIdx}`;
      const cached = this._cache[cacheKey];
      
      if (cached && cached.timestamp > Date.now() - 10000) {
        const tituloOk = !titulo || cached.titulo === titulo;
        const descOk = !descricao || cached.descricao === descricao;
        const tagsOk = !etiquetas || cached.etiquetas === etiquetas;
        if (tituloOk && descOk && tagsOk) {
          this._salvando = false;
          return;
        }
      }
      
      await this._aguardarQuota();
      
      const range = `${config.sheets.aba}!${col.titulo}${linhaIdx}:${col.etiquetas}${linhaIdx}`;
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: config.sheets.sheetId,
        range,
      });
      
      const valoresAtuais = res.data.values?.[0] || [];
      const tituloAtual = valoresAtuais[0] || '';
      const descricaoAtual = valoresAtuais[1] || '';
      const etiquetasAtual = valoresAtuais[2] || '';
      
      if (titulo && titulo !== tituloAtual) {
        updates.push({
          range: `${config.sheets.aba}!${col.titulo}${linhaIdx}`,
          values: [[titulo]]
        });
      }
      
      if (descricao && descricao !== descricaoAtual) {
        updates.push({
          range: `${config.sheets.aba}!${col.descricao}${linhaIdx}`,
          values: [[descricao]]
        });
      }
      
      if (etiquetas && etiquetas !== etiquetasAtual) {
        updates.push({
          range: `${config.sheets.aba}!${col.etiquetas}${linhaIdx}`,
          values: [[etiquetas]]
        });
      }
      
      this._cache[cacheKey] = {
        titulo: titulo || tituloAtual,
        descricao: descricao || descricaoAtual,
        etiquetas: etiquetas || etiquetasAtual,
        timestamp: Date.now()
      };
      
      if (updates.length > 0) {
        await this.sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: config.sheets.sheetId,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: updates,
          },
        });
        logger.debug(`📝 Linha ${linhaIdx}: ${updates.length} campo(s) atualizado(s)`);
      }
      
    } catch (err) {
      if (!err.message.includes('Quota exceeded')) {
        logger.warn(`⚠️ Erro ao salvar dados gerados: ${err.message}`);
      }
    } finally {
      this._salvando = false;
    }
  }

  // Compatibilidade
  async atualizarStatus(linhaIdx, status, extras = {}) {
    await this.atualizarStatusGeral(linhaIdx, status, extras);
  }

  async marcarPostado(linhaIdx, link = '') {
    await this.atualizarStatusGeral(linhaIdx, 'postado', { link });
  }

  async marcarErro(linhaIdx, mensagemErro) {
    await this.atualizarStatusGeral(linhaIdx, 'erro', { erro: mensagemErro });
  }

  async marcarPausado(linhaIdx) {
    await this.atualizarStatusGeral(linhaIdx, 'pausado');
  }
}

module.exports = new SheetsManager();