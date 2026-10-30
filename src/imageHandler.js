const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

class ImageHandler {
  constructor() {
    fs.ensureDirSync(config.postagem.tempImagesDir);
  }

  // ⭐ EXPANDE ATALHOS NUMERADOS
  async _expandirAtalhos(imagensStr) {
    if (!imagensStr || !imagensStr.trim()) return imagensStr;
    
    const atalhoRegex = /^(.+):(\d+)$/;
    const partes = imagensStr.split('|');
    const expandidas = [];
    
    for (const parte of partes) {
      const match = parte.trim().match(atalhoRegex);
      if (match) {
        let nomeBase = match[1].trim();
        const quantidade = parseInt(match[2]);
        
        logger.debug(`  🔄 Expandindo atalho: ${parte} → ${quantidade} imagens`);
        
        for (let i = 1; i <= quantidade; i++) {
          let nomeLimpo = nomeBase.replace(/\(\d+\)$/, '').trim();
          expandidas.push(`${nomeLimpo}${i}`);
        }
      } else {
        expandidas.push(parte);
      }
    }
    
    return expandidas.join('|');
  }

  // ⭐ BUSCA ARQUIVO IGNORANDO EXTENSÃO
  async _buscarArquivoSemExtensao(nomeBase) {
    const pastaBase = config.postagem.imagensBaseDir;
    if (!pastaBase) return null;
    
    let nomeLimpo = nomeBase;
    const extAtual = path.extname(nomeBase);
    if (extAtual) {
      nomeLimpo = nomeBase.replace(extAtual, '');
    }
    
    const variacoes = [
      nomeLimpo,
      nomeLimpo.replace(/\((\d+)\)/, '$1'),
      nomeLimpo.replace(/\((\d+)\)/, ' $1'),
      nomeLimpo.replace(/\((\d+)\)/, '_$1'),
      nomeLimpo.replace(/\s+\((\d+)\)/, '_$1'),
      nomeLimpo.replace(/\s+/, '_'),
    ];
    
    const variacoesUnicas = [...new Set(variacoes)];
    const extensoes = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    
    for (const variacao of variacoesUnicas) {
      for (const ext of extensoes) {
        const caminho = path.join(pastaBase, `${variacao}${ext}`);
        if (await fs.pathExists(caminho)) {
          logger.debug(`  🔍 Encontrado: ${variacao}${ext}`);
          return caminho;
        }
      }
    }
    
    const caminhoOriginal = path.join(pastaBase, nomeBase);
    if (await fs.pathExists(caminhoOriginal)) {
      return caminhoOriginal;
    }
    
    return null;
  }

  // ⭐ GERAR NOME ÚNICO PARA ARQUIVO LOCAL
  _gerarNomeLocal(url, index = 0) {
    // Extrai ID da URL do Facebook
    const matchId = url.match(/(\d+_\d+)/);
    const data = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    if (matchId) {
      return `${data}_${matchId[1]}.jpg`;
    }
    
    // Se não tem ID, usa timestamp
    return `${data}_img_${Date.now()}_${index}.jpg`;
  }

  // Substitua o método _salvarImagemLocal por este:
async _salvarImagemLocal(url, page = null) {
  const pastaBase = config.postagem.imagensBaseDir;
  if (!pastaBase) return null;
  
  const nomeLocal = this._gerarNomeLocal(url);
  const caminhoLocal = path.join(pastaBase, nomeLocal);
  
  if (await fs.pathExists(caminhoLocal)) {
    logger.debug(`📁 Imagem já existe localmente: ${nomeLocal}`);
    return caminhoLocal;
  }
  
  let buffer;
  let contentType = 'image/jpeg';
  
  try {
    // ⭐ Tenta baixar via Puppeteer com cookies (mais confiável para Facebook)
    if (page) {
      try {
        const result = await page.evaluate(async (imgUrl) => {
          const response = await fetch(imgUrl, { 
            credentials: 'include',
            headers: {
              'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
              'Cache-Control': 'no-cache'
            }
          });
          if (!response.ok) return null;
          const buffer = await response.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return {
            data: btoa(binary),
            contentType: response.headers.get('content-type') || 'image/jpeg'
          };
        }, url);
        
        if (result) {
          buffer = Buffer.from(result.data, 'base64');
          contentType = result.contentType;
          logger.debug(`✅ Baixado via Puppeteer: ${url.substring(0, 60)}...`);
        }
      } catch (e) {
        logger.debug(`⚠️ Puppeteer fetch falhou, tentando axios...`);
      }
    }
    
    // Fallback: axios com headers aprimorados
    if (!buffer) {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://www.facebook.com/',
        },
      });
      buffer = response.data;
      contentType = response.headers['content-type'] || 'image/jpeg';
      logger.debug(`✅ Baixado via Axios: ${url.substring(0, 60)}...`);
    }
    
    let ext = '.jpg';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('gif')) ext = '.gif';
    else if (contentType.includes('webp')) ext = '.webp';
    
    const nomeComExt = nomeLocal.replace(/\.jpg$/, ext);
    const caminhoFinal = path.join(pastaBase, nomeComExt);
    
    await fs.writeFile(caminhoFinal, buffer);
    logger.info(`💾 Imagem salva: ${nomeComExt}`);
    return caminhoFinal;
    
  } catch (err) {
    logger.warn(`⚠️ Erro ao salvar imagem: ${err.message}`);
    return null;
  }
}

  // ⭐ PROCESSAMENTO PRINCIPAL (COM CACHE LOCAL)
  async processarImagens(imagensStr, page = null) {
    if (!imagensStr || !imagensStr.trim()) return [];

    // 1. Expandir atalhos
    const imagensExpandido = await this._expandirAtalhos(imagensStr);
    
    // 2. Separar por pipe
    let lista;
    if (imagensExpandido.includes('|')) {
      lista = imagensExpandido.split('|').map(s => s.trim()).filter(Boolean);
    } else if (imagensExpandido.includes(',')) {
      lista = imagensExpandido.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      lista = [imagensExpandido.trim()];
    }

    // 3. Remover duplicatas
    lista = [...new Set(lista)];

    const arquivos = [];
    const urlsProcessadas = [];

    for (const img of lista) {
      try {
        if (!img || img.length < 5) continue;
        
        const isUrl = img.startsWith('http://') || img.startsWith('https://');
        let caminho;
        
        if (isUrl) {
          // ⭐ TENTA SALVAR LOCALMENTE PRIMEIRO (evita expiração)
          const caminhoLocal = await this._salvarImagemLocal(img, page);
          if (caminhoLocal) {
            caminho = caminhoLocal;
            urlsProcessadas.push(img);
          } else {
            // Fallback: baixa temporariamente
            caminho = await this._baixarUrl(img);
          }
        } else {
          caminho = await this._resolverLocal(img);
        }
        
        if (caminho) {
          arquivos.push(caminho);
          logger.debug(`  ✅ Imagem carregada: ${path.basename(caminho)}`);
        }
      } catch (err) {
        logger.warn(`⚠️ Imagem ignorada: ${err.message}`);
      }
    }

    if (urlsProcessadas.length > 0) {
      logger.info(`💾 ${urlsProcessadas.length} URL(s) baixadas e salvas permanentemente em: ${config.postagem.imagensBaseDir}`);
    }

    logger.info(`🖼️  ${arquivos.length}/${lista.length} imagens processadas`);
    return arquivos;
  }

  // ⭐ CONVERTE URL DO GOOGLE DRIVE PARA LINK DE DOWNLOAD DIRETO
  _converterUrlGoogleDrive(url) {
    const matchView = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    if (matchView) {
      return `https://drive.google.com/uc?export=download&id=${matchView[1]}`;
    }
    const matchOpen = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
    if (matchOpen) {
      return `https://drive.google.com/uc?export=download&id=${matchOpen[1]}`;
    }
    return url;
  }

  // ⭐ BAIXAR URL (FALLBACK)
  async _baixarUrl(url) {
    try {
      logger.debug(`⬇️ Baixando URL...`);

      const urlFinal = this._converterUrlGoogleDrive(url);

      const response = await axios.get(urlFinal, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxRedirects: 10,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
      });

      let ext = '.jpg';
      const contentType = response.headers['content-type'];
      if (contentType) {
        if (contentType.includes('png')) ext = '.png';
        else if (contentType.includes('gif')) ext = '.gif';
        else if (contentType.includes('webp')) ext = '.webp';
      }

      const nomeArquivo = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      const destino = path.join(config.postagem.tempImagesDir, nomeArquivo);

      await fs.writeFile(destino, response.data);
      logger.debug(`⬇️ URL baixada: ${nomeArquivo}`);
      return destino;
      
    } catch (err) {
      throw new Error(`Falha ao baixar URL: ${err.message}`);
    }
  }

  // ⭐ RESOLVER IMAGEM LOCAL
  async _resolverLocal(caminho) {
    let caminhoFinal = null;
    const pastaBase = config.postagem.imagensBaseDir;

    if (path.isAbsolute(caminho) && await fs.pathExists(caminho)) {
      caminhoFinal = caminho;
    } else if (pastaBase) {
      const caminhoExato = path.join(pastaBase, caminho);
      if (await fs.pathExists(caminhoExato)) {
        caminhoFinal = caminhoExato;
      } else {
        const encontrado = await this._buscarArquivoSemExtensao(caminho);
        if (encontrado) caminhoFinal = encontrado;
      }
    }
    
    if (!caminhoFinal && await fs.pathExists(caminho)) {
      caminhoFinal = caminho;
    }

    if (!caminhoFinal) {
      throw new Error(`Arquivo não encontrado: ${caminho}`);
    }

    const ext = path.extname(caminhoFinal).toLowerCase();
    const nomeBase = path.basename(caminhoFinal, ext)
      .replace(/[()[\]{}<>$%&*!@#\s]/g, '_')
      .slice(0, 50);
    const nomeArquivo = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const destino = path.join(config.postagem.tempImagesDir, nomeArquivo);

    await fs.copy(caminhoFinal, destino);
    logger.debug(`📁 ${path.basename(caminhoFinal)} → ${nomeArquivo}`);
    return destino;
  }

  // ⭐ LIMPEZA
  async limparTempForcado() {
    try {
      if (!await fs.pathExists(config.postagem.tempImagesDir)) return;
      
      const arquivos = await fs.readdir(config.postagem.tempImagesDir);
      let removidos = 0;
      
      for (const arq of arquivos) {
        await fs.remove(path.join(config.postagem.tempImagesDir, arq));
        removidos++;
      }
      
      if (removidos > 0) {
        logger.info(`🧹 Pasta temp limpa: ${removidos} arquivo(s)`);
      }
    } catch (err) {
      logger.warn('Erro ao limpar temp: ' + err.message);
    }
  }
}

module.exports = new ImageHandler();