const logger = require('./logger');
const config = require('./config');

class DescriptionGenerator {
  
  static get EMOJIS() {
    return {
      casa: '🏡',
      apartamento: '🏢',
      kitnet: '🏠',
      terreno: '📐',
      cobertura: '🏛️',
      sobrado: '🏘️',
      comercial: '🏪',
      padrao: '✨'
    };
  }

  static get BENEFICIOS() {
    return {
      venda: [
        '✅ Entrada parcelada com a construtora',
        '✅ Financiamento aprovado pela Caixa'
      ],
      aluguel: [
        '✅ Aluguel sem fiador',
        '✅ Seguro fiança incluso',
        '✅ Entrada reduzida',
        '✅ Contrato flexível'
      ]
    };
  }

  static get CARACTERISTICAS() {
    return {
      casa: [
        '🌳 Área externa com quintal',
        '🚗 Garagem'
      ],
      apartamento: [
        '🅿️ Vaga de garagem'
      ],
      kitnet: [
        '🔑 Pronto para morar',
        '💰 Baixo custo de condomínio'
      ],
      terreno: [
        '📐 Terreno plano aprovado',
        '📍 Ótima localização'
      ]
    };
  }

  static _formatarQuantidade(numero, singular, plural) {
    const num = parseInt(numero);
    if (num === 1) return `${num} ${singular}`;
    return `${num} ${plural}`;
  }

  static get TEMPLATE() {
    return {
      templateSimples: [
        '{tituloPrincipal}',
        '',
        '{condicoesComerciais}',
        '',
        '{diferenciais}',
        '',
        '{localizacao}'
      ]
    };
  }

  static gerarDescricao(imovel, opcoes = {}) {
    const tipo = (imovel.tipo || 'casa').toLowerCase();
    const operacao = (imovel.operacao || 'venda').toLowerCase();
    const emoji = this.EMOJIS[tipo] || this.EMOJIS.padrao;
    
    const tituloPrincipal = this._gerarTituloPrincipal(imovel, emoji, operacao);
    const diferenciais = this._gerarDiferenciais(imovel, tipo);
    const localizacao = this._gerarLocalizacao(imovel);
    const condicoesComerciais = this._gerarCondicoesComerciais(imovel, operacao);
    
    let descricao = this.TEMPLATE.templateSimples.join('\n');
    
    descricao = descricao
      .replace('{tituloPrincipal}', tituloPrincipal)
      .replace('{diferenciais}', diferenciais)
      .replace('{localizacao}', localizacao)
      .replace('{condicoesComerciais}', condicoesComerciais);
    
    descricao = descricao.replace(/\n{3,}/g, '\n\n').trim();
    
    return descricao;
  }
  
  static _gerarTituloPrincipal(imovel, emoji, operacao) {
    const tipo = imovel.tipo;
    const quartos = imovel.quartos ? this._formatarQuantidade(imovel.quartos, 'Quarto', 'Quartos') : '';
    const local = imovel.localizacao?.split(',')[0] || '';
    
    let titulo = `${emoji} ${tipo}`;
    if (quartos) titulo += ` ${quartos}`;
    if (local) titulo += ` - ${local}`;
    
    return titulo.trim();
  }
  
  static _gerarDiferenciais(imovel, tipo) {
    const diferenciais = [];
    diferenciais.push(`✨ ${imovel.tipo} com acabamento completo`);
    
    if (imovel.quartos && parseInt(imovel.quartos) > 0) {
      diferenciais.push(`🛏️ ${this._formatarQuantidade(imovel.quartos, 'quarto', 'quartos')}`);
    }
    if (imovel.banheiros && parseInt(imovel.banheiros) > 0) {
      diferenciais.push(`🚿 ${this._formatarQuantidade(imovel.banheiros, 'banheiro', 'banheiros')}`);
    }
    if (imovel.area && parseInt(imovel.area) > 0) {
      diferenciais.push(`📐 ${imovel.area} m² de área útil`);
    }
    
    if (diferenciais.length <= 1) {
      diferenciais.push('📍 Excelente localização');
    }
    
    return diferenciais.join('\n');
  }
  
  static _gerarLocalizacao(imovel) {
    if (!imovel.localizacao) return '📍 Localização privilegiada';
    
    const partes = imovel.localizacao.split(',');
    const bairro = partes[0]?.trim() || '';
    const cidade = partes[1]?.trim() || 'Sorocaba';
    
    return `📍 ${bairro} - ${cidade}/SP`;
  }
  
  static _gerarCondicoesComerciais(imovel, operacao) {
    const preco = parseFloat(imovel.preco) || 0;
    const condicoes = [];
    
    if (operacao === 'venda') {
      condicoes.push('💰 Financiamento disponível pela Caixa');
      
      if (preco <= 600000 && preco > 0) {
        condicoes.push('🏠 Minha Casa Minha Vida');
        condicoes.push('💵 Subsídio do governo disponível');
      }
      
      condicoes.push('✅ Entrada parcelada com a construtora');
      
      if (imovel.documentacaoGratis && imovel.documentacaoGratis.toLowerCase() === 'sim') {
        condicoes.push('📄 Documentação gratuita (escritura e registro)');
      }
      
      if (preco > 600000) {
        condicoes.push('💎 Financiamento especial para alto padrão');
      }
      
    } else {
      condicoes.push('🔑 Aluguel sem fiador');
      condicoes.push('✅ Entrada reduzida');
      condicoes.push('📋 Contrato flexível');
    }
    
    return condicoes.join('\n');
  }
  
  // ⭐ COMBINA DESCRIÇÃO COM WHATSAPP E CRECI DA CONTA ATIVA
  static combinarDescricoes(imovel, descricaoManual = '') {
    // ⭐ PEGA O WHATSAPP E CRECI DA CONTA ATIVA
    let contato = '';
    let creci = '';
    
    // Tenta pegar da conta ativa
    const contaId = config.facebook.contaAtiva || 1;
    const conta = config.facebook.contas[contaId];
    
    if (conta) {
      contato = conta.whatsapp || '';
      creci = conta.creci || '';
    }
    
    // Se não tem na conta, usa o genérico
    if (!contato) contato = config.facebook.whatsapp || '';
    if (!creci) creci = config.facebook.creci || '';
    
    // Se tem descrição manual
    if (descricaoManual && descricaoManual.trim()) {
      let resultado = descricaoManual.trim();
      
      // Se NÃO tem contato na descrição, adiciona
      if (!resultado.includes('📲') && contato) {
        resultado += `\n\n📲 ${contato}`;
      }
      
      // Se NÃO tem CRECI na descrição, adiciona
      if (!resultado.includes('CRECI') && creci) {
        resultado += `\n✒️ ${creci}`;
      }
      
      return resultado;
    }
    
    // Descrição gerada automaticamente
    const descricaoGerada = this.gerarDescricao(imovel);
    let resultado = descricaoGerada;
    
    // Adiciona contato se tiver
    if (contato) {
      resultado += `\n\n📲 ${contato}`;
    }
    
    // Adiciona CRECI se tiver
    if (creci) {
      resultado += `\n✒️ ${creci}`;
    }
    
    return resultado;
  }
}

module.exports = DescriptionGenerator;