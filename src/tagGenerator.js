const logger = require('./logger');
const config = require('./config');

class TagGenerator {
  
  // ⭐ Mapeamento por tipo de imóvel (FOCADO EM CONVERSÃO)
  static get TIPOS_CONFIG() {
    return {
      kitnet: {
        base: [
          'kitnet com entrada parcelada',
          'kitnet financiada pela caixa',
          'kitnet minha casa minha vida',
          'kitnet com subsídio do governo',
          'kitnet sem entrada',
          'kitnet com parcelas baixas',
          'kitnet com documentação grátis',
          'kitnet com escritura grátis',
          'kitnet para primeiro imóvel',
          'kitnet para solteiro',
          'kitnet para universitário',
          'kitnet para casal',
          'sair do aluguel',
          'kitnet com baixo condomínio',
          'oportunidade única'
        ],
        moderno: ['kitnet moderna', 'kitnet nova'],
        localizacao: [
          'perto de faculdade',
          'perto de comércio',
          'bairro tranquilo'
        ],
        specs: [
          'kitnet 1 dormitório',
          'kitnet 1 banheiro',
          'kitnet compacta',
          'pronta para morar'
        ]
      },
      casa: {
        base: [
          'casa com entrada parcelada',
          'casa financiada pela caixa',
          'casa minha casa minha vida',
          'casa com subsídio do governo',
          'casa sem entrada',
          'casa com parcelas baixas',
          'casa com documentação grátis',
          'casa com escritura grátis',
          'casa para primeiro imóvel',
          'casa para família',
          'casa com quintal',
          'sair do aluguel',
          'casa para investimento',
          'oportunidade única',
          'financiamento aprovado'
        ],
        moderno: ['casa moderna', 'casa nova'],
        localizacao: [
          'bairro tranquilo',
          'perto de mercado',
          'perto de escola',
          'acesso fácil'
        ],
        specs: [
          'casa 1 dormitório',
          'casa 1 banheiro',
          'casa compacta',
          'casa econômica',
          'pronta para morar'
        ]
      },
      apartamento: {
        base: [
          'apartamento com entrada parcelada',
          'apartamento financiado pela caixa',
          'apartamento minha casa minha vida',
          'apartamento com subsídio do governo',
          'apartamento sem entrada',
          'apartamento com parcelas baixas',
          'apartamento com documentação grátis',
          'apartamento com escritura grátis',
          'apartamento para primeiro imóvel',
          'apartamento para casal',
          'sair do aluguel',
          'apartamento para investimento',
          'oportunidade única',
          'financiamento aprovado',
          'entrada facilitada'
        ],
        moderno: ['apartamento moderno', 'apartamento com vaga'],
        localizacao: [
          'apartamento bem localizado',
          'perto do comércio',
          'perto de transporte público',
          'bairro nobre'
        ],
        specs: [
          'apartamento 2 quartos',
          'apartamento com lazer',
          'pronto para morar'
        ]
      },
      terreno: {
        base: [
          'terreno com entrada parcelada',
          'terreno financiado pela caixa',
          'terreno com documentação grátis',
          'terreno para primeiro imóvel',
          'terreno para construir',
          'terreno residencial',
          'terreno plano',
          'terreno aprovado',
          'investimento terreno',
          'oportunidade única'
        ],
        localizacao: [
          'terreno bem localizado',
          'bairro em crescimento',
          'loteamento novo',
          'região valorizada'
        ],
        specs: [
          'terreno escriturado'
        ]
      },
      cobertura: {
        base: [
          'cobertura alto padrão',
          'apartamento cobertura',
          'cobertura com terraço',
          'cobertura com churrasqueira',
          'cobertura duplex',
          'cobertura com hidromassagem',
          'cobertura com vista panorâmica',
          'cobertura de luxo',
          'cobertura moderna',
          'oportunidade única'
        ],
        moderno: ['cobertura moderna', 'cobertura com vista panorâmica', 'cobertura de luxo'],
        localizacao: ['vista 360°', 'melhor andar', 'bairro nobre'],
        specs: ['cobertura 3 suítes', 'cobertura com piscina privativa']
      },
      sobrado: {
        base: [
          'sobrado com entrada parcelada',
          'sobrado financiado pela caixa',
          'sobrado com documentação grátis',
          'sobrado familiar',
          'sobrado espaçoso',
          'casa sobrado',
          'sobrado 2 andares',
          'sobrado com garagem',
          'oportunidade única'
        ],
        localizacao: ['sobrado bem localizado', 'bairro residencial'],
        specs: ['sobrado 3 quartos', 'sobrado com laje', 'sobrado com área gourmet']
      },
      comercial: {
        base: [
          'sala comercial com entrada parcelada',
          'sala comercial financiada',
          'sala com documentação grátis',
          'ponto comercial',
          'loja à venda',
          'sala para escritório',
          'espaço comercial',
          'ponto estratégico',
          'oportunidade única'
        ],
        localizacao: ['ponto estratégico', 'rua movimentada', 'centro'],
        specs: ['sala 50m²', 'boa vitrine', 'estacionamento']
      }
    };
  }

  // ⭐ Tags de benefícios (SEMPRE adicionar)
  static get BENEFICIOS_GERAIS() {
    return {
      financiamento: [
        'financiamento disponível pela caixa',
        'financiamento aprovado',
        'caixa econômica federal',
        'financiamento facilitado',
        'crédito aprovado'
      ],
      mcmv: [
        'minha casa minha vida',
        'subsídio minha casa minha vida',
        'subsídio do governo',
        'desconto do governo',
        'programa minha casa minha vida'
      ],
      entrada: [
        'entrada parcelada',
        'entrada facilitada',
        'sem entrada',
        'entrada zero reais',
        'entrada acessível',
        'parcelamento da entrada'
      ],
      parcelamento: [
        'parcelamento direto',
        'parcelamento sem juros',
        'parcelo no cartão',
        'parcelamento facilitado',
        'parcelas baixas',
        'compra facilitada'
      ],
      documentacao: [
        'documentação gratuita',
        'escritura grátis',
        'documentação inclusa',
        'taxa zero de cartório',
        'registro de imóvel grátis'
      ],
      vantagens: [
        'oportunidade única',
        'primeira oportunidade',
        'imperdível',
        'venda direta',
        'sem corretagem'
      ]
    };
  }

  // ⭐ Formata localização para tags
  static _formatarLocalizacao(localizacao) {
    if (!localizacao) return null;
    const bairro = localizacao.split(',')[0].trim().toLowerCase();
    const cidade = localizacao.includes('Sorocaba') ? 'sorocaba' : null;
    return { bairro, cidade };
  }

  // ⭐ Determina a Faixa do MCMV baseada no preço
  static _getFaixaMCMV(preco) {
    const valor = parseFloat(preco);
    if (valor <= 190000) return '1';
    if (valor <= 264000) return '2';
    if (valor <= 350000) return '3';
    if (valor <= 600000) return '4';
    return null;
  }

  // ⭐ Gera tags ultra específicas
  static gerarTags(imovel) {
    const tipo = (imovel.tipo || 'kitnet').toLowerCase();
    const operacao = (imovel.operacao || 'venda').toLowerCase();
    const preco = parseFloat(imovel.preco) || 0;
    const quartos = parseInt(imovel.quartos) || 0;
    const banheiros = parseInt(imovel.banheiros) || 0;
    const area = parseInt(imovel.area) || 0;
    
    const tipoConfig = this.TIPOS_CONFIG[tipo] || this.TIPOS_CONFIG.kitnet;
    const local = this._formatarLocalizacao(imovel.localizacao);
    const faixaMCMV = this._getFaixaMCMV(preco);
    
    const tags = new Set();

    // ========== 1. TAGS BASE DO TIPO (foco em condições) ==========
    tipoConfig.base.forEach(t => tags.add(t));
    tipoConfig.moderno?.slice(0, 2).forEach(t => tags.add(t));
    
    // ========== 2. TAGS COM LOCALIZAÇÃO ==========
    if (local) {
      if (local.bairro) {
        tags.add(`${tipo} ${local.bairro}`);
        tags.add(`imóvel em ${local.bairro}`);
        tags.add(`oportunidade ${local.bairro}`);
      }
      if (local.cidade) {
        tags.add(`${tipo} barato em ${local.cidade}`);
        tags.add(`${tipo} financiado caixa ${local.cidade}`);
        tags.add(`imóvel barato em ${local.cidade}`);
      }
    }
    
    // ========== 3. TAGS COM ESPECIFICAÇÕES ==========
    if (quartos > 0) {
      tags.add(`${tipo} ${quartos} dormitório${quartos > 1 ? 's' : ''}`);
      if (quartos === 1) tags.add(`${tipo} para solteiro`);
      if (quartos === 2) tags.add(`${tipo} para casal`);
      if (quartos >= 3) tags.add(`${tipo} para família`);
    }
    
    if (banheiros > 0) tags.add(`${tipo} ${banheiros} banheiro${banheiros > 1 ? 's' : ''}`);
    if (area > 0) tags.add(`${tipo} ${area}m²`);
    
    // ========== 4. TAGS DE LOCALIZAÇÃO ESPECÍFICA ==========
    tipoConfig.localizacao?.slice(0, 2).forEach(t => tags.add(t));
    
    // ========== 5. ⭐⭐⭐ TAGS DE FINANCIAMENTO ==========
    this.BENEFICIOS_GERAIS.financiamento.slice(0, 3).forEach(t => tags.add(t));
    
    // ========== 6. ⭐⭐⭐ TAGS MCMV E SUBSÍDIO ==========
    if (preco <= 600000 && preco > 0) {
      this.BENEFICIOS_GERAIS.mcmv.slice(0, 4).forEach(t => tags.add(t));
      
      // Tags de subsídio e desconto
      tags.add('subsídio do governo disponível');
      tags.add('desconto do governo');
      tags.add('benefício habitacional');
    }
    
    // ========== 7. ⭐⭐⭐ TAGS DE ENTRADA ==========
    this.BENEFICIOS_GERAIS.entrada.forEach(t => tags.add(t));
    
    // ========== 8. ⭐⭐⭐ TAGS DE PARCELAMENTO ==========
    this.BENEFICIOS_GERAIS.parcelamento.slice(0, 4).forEach(t => tags.add(t));
    
    // ========== 9. TAGS DE DOCUMENTAÇÃO ==========
    if (imovel.documentacaoGratis && imovel.documentacaoGratis.toLowerCase() === 'sim') {
      this.BENEFICIOS_GERAIS.documentacao.slice(0, 4).forEach(t => tags.add(t));
    }
    
    // ========== 10. TAGS DE VANTAGENS ==========
    this.BENEFICIOS_GERAIS.vantagens.slice(0, 3).forEach(t => tags.add(t));
    
    // ========== 11. BENEFÍCIOS ADICIONAIS ==========
    tags.add('sair do aluguel');
    tags.add('primeiro imóvel');
    tags.add('compre agora');
    
    if (tipo === 'kitnet') tags.add('kitnet para renda extra');
    if (tipo === 'casa') tags.add('casa para investimento');
    if (tipo === 'apartamento') tags.add('apartamento investimento');
    
    // ========== 12. LIMPEZA E FORMATAÇÃO ==========
    const tagsLimpos = Array.from(tags)
      .map(tag => tag.toLowerCase().trim())
      .filter(tag => tag.length > 0 && tag.length < 60)
      .slice(0, 20);
    
    logger.debug(`🏷️ ${tagsLimpos.length} tags geradas para ${tipo}`);
    return tagsLimpos.join(', ');
  }
  
  static combinarTags(imovel) {
    const tagsGeradas = this.gerarTags(imovel);
    const tagsManuais = imovel.etiquetas || '';
    
    if (!tagsManuais.trim()) return tagsGeradas;
    
    const todasTags = [...tagsManuais.split(',').map(t => t.trim()), ...tagsGeradas.split(',').map(t => t.trim())];
    const tagsUnicas = [...new Map(todasTags.map(tag => [tag.toLowerCase(), tag])).values()];
    
    return tagsUnicas.slice(0, 20).join(', ');
  }
}

module.exports = TagGenerator;