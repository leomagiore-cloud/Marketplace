const logger = require('./logger');

class TitleGenerator {
  
  static get EMOJIS() {
    return {
      casa: ['🏡', '🏠', '🏘️'],
      apartamento: ['🏢', '🏙️', '🏬'],
      kitnet: ['🏠', '🏚️', '🏡'],
      terreno: ['📐', '📍', '🗺️'],
      cobertura: ['🏛️', '🏢', '🏙️'],
      sobrado: ['🏘️', '🏠', '🏡'],
      comercial: ['🏪', '🏬', '🏢'],
      padrao: ['✨', '⭐', '🌟']
    };
  }

  static _escolherAleatorio(lista) {
    if (!lista || lista.length === 0) return '';
    return lista[Math.floor(Math.random() * lista.length)];
  }

  static _formatarQuartos(quantidade) {
    const num = parseInt(quantidade);
    if (num === 1) return '1 Quarto';
    return `${num} Quartos`;
  }

  static gerarTitulo(imovel) {
    const tipo = (imovel.tipo || 'casa').toLowerCase();
    const emojis = this.EMOJIS[tipo] || this.EMOJIS.padrao;
    const emoji = this._escolherAleatorio(emojis);
    
    const quartos = imovel.quartos ? this._formatarQuartos(imovel.quartos) : '';
    const local = imovel.localizacao?.split(',')[0]?.trim() || '';
    const operacao = (imovel.operacao || 'venda').toLowerCase();
    
    // ⭐ MONTA TÍTULO COM AS INFORMAÇÕES DA PLANILHA
    let titulo = `${emoji} ${imovel.tipo}`;
    
    if (quartos) {
      titulo += ` ${quartos}`;
    }
    
    if (local) {
      titulo += ` - ${local}`;
    }
    
    // ⭐ ADICIONA PRONTO PARA MORAR OU PARA ALUGAR
    titulo += operacao === 'venda' ? ' - Pronto Para Morar' : ' - Para Alugar';
    
    // ⭐ SE NÃO TEM LOCALIZAÇÃO, USA UM GANCHO
    if (!local && titulo.length < 15) {
      const ganchos = {
        casa: ['Documentação Grátis', 'Entrada Facilitada', 'Oportunidade Única'],
        apartamento: ['Documentação Grátis', 'Entrada Facilitada', 'Localização Privilegiada'],
        kitnet: ['Documentação Grátis', 'Saia do Aluguel', 'Economia'],
        terreno: ['Documentação Grátis', 'Financiamento Disponível', 'Valorização']
      };
      const listaGanchos = ganchos[tipo] || ganchos.casa;
      const gancho = this._escolherAleatorio(listaGanchos);
      titulo = `${emoji} ${imovel.tipo}${quartos ? ` ${quartos}` : ''} - ${gancho}`;
    }
    
    // ⭐ GARANTE QUE NUNCA TENHA "Novo Imóvel"
    if (titulo.includes('Novo Imóvel')) {
      const ganchos = {
        casa: ['Oportunidade Única', 'Documentação Grátis', 'Entrada Facilitada'],
        apartamento: ['Oportunidade Única', 'Documentação Grátis', 'Localização Privilegiada'],
        kitnet: ['Oportunidade Única', 'Documentação Grátis', 'Saia do Aluguel']
      };
      const listaGanchos = ganchos[tipo] || ganchos.casa;
      titulo = `${emoji} ${imovel.tipo} - ${this._escolherAleatorio(listaGanchos)}`;
    }
    
    if (titulo.length > 100) {
      titulo = titulo.substring(0, 97) + '...';
    }
    
    logger.debug(`📝 Título gerado: ${titulo}`);
    return titulo;
  }
  
  static gerarTituloInteligente(imovel) {
    // ⭐ Se já tem título e é bom, mantém
    if (imovel.titulo && imovel.titulo.trim().length > 20 && !imovel.titulo.includes('Novo Imóvel')) {
      return imovel.titulo;
    }
    
    // ⭐ Se tem título curto ou genérico, gera do zero
    if (!imovel.titulo || imovel.titulo.length < 15 || imovel.titulo.includes('Novo Imóvel')) {
      return this.gerarTitulo(imovel);
    }
    
    return imovel.titulo;
  }
}

module.exports = TitleGenerator;