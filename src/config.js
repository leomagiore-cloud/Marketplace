require('dotenv').config();
const path = require('path');

module.exports = {
  facebook: {
    email: process.env.FB_EMAIL,
    senha: process.env.FB_SENHA,
    urlMarketplace: 'https://www.facebook.com/marketplace/create/item',
    urlLogin: 'https://www.facebook.com/login',
    whatsapp: process.env.FB_WHATSAPP || '',
    creci: process.env.FB_CRECI || '',
    
    // ⭐ MÚLTIPLAS CONTAS (COM WHATSAPP E CRECI)
    contas: {
      1: {
        nome: process.env.FB_CONTA_1_NOME || 'Conta Principal',
        email: process.env.FB_CONTA_1_EMAIL || process.env.FB_EMAIL,
        senha: process.env.FB_CONTA_1_SENHA || process.env.FB_SENHA,
        userDataDir: process.env.FB_CONTA_1_CHROME || './chrome-profile-conta1',
        ativa: process.env.FB_CONTA_1_ATIVA === 'true',
        whatsapp: process.env.FB_CONTA_1_WHATSAPP || process.env.FB_WHATSAPP || '',
        creci: process.env.FB_CONTA_1_CRECI || process.env.FB_CRECI || ''
      },
      2: {
        nome: process.env.FB_CONTA_2_NOME || 'Conta Secundária',
        email: process.env.FB_CONTA_2_EMAIL || '',
        senha: process.env.FB_CONTA_2_SENHA || '',
        userDataDir: process.env.FB_CONTA_2_CHROME || './chrome-profile-conta2',
        ativa: process.env.FB_CONTA_2_ATIVA === 'true',
        whatsapp: process.env.FB_CONTA_2_WHATSAPP || process.env.FB_WHATSAPP || '',
        creci: process.env.FB_CONTA_2_CRECI || process.env.FB_CRECI || ''
      },
      3: {
        nome: process.env.FB_CONTA_3_NOME || 'Conta Terciária',
        email: process.env.FB_CONTA_3_EMAIL || '',
        senha: process.env.FB_CONTA_3_SENHA || '',
        userDataDir: process.env.FB_CONTA_3_CHROME || './chrome-profile-conta3',
        ativa: process.env.FB_CONTA_3_ATIVA === 'true',
        whatsapp: process.env.FB_CONTA_3_WHATSAPP || process.env.FB_WHATSAPP || '',
        creci: process.env.FB_CONTA_3_CRECI || process.env.FB_CRECI || ''
      }
    }
  },

  sheets: {
    sheetId: process.env.SHEET_ID,
    aba: process.env.SHEET_ABA || 'Imóveis',
    credentialsPath: path.resolve(process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json'),
    colunas: {
      id: 'A',
      titulo: 'B',
      descricao: 'C',
      preco: 'D',
      tipo: 'E',
      operacao: 'F',
      quartos: 'G',
      banheiros: 'H',
      area: 'I',
      documentacaoGratis: 'J',
      localizacao: 'K',
      etiquetas: 'L',
      imagens: 'M',
      status: 'N',
      dataPostagem: 'O',
      linkPostagem: 'P',
      erro: 'Q',
      conta1Status: 'R',
      conta1Link: 'S',
      conta1Data: 'T',
      conta2Status: 'U',
      conta2Link: 'V',
      conta2Data: 'W',
      conta3Status: 'X',
      conta3Link: 'Y',
      conta3Data: 'Z'
    }
  },

  postagem: {
    tempImagesDir: path.resolve(process.env.TEMP_IMAGES_DIR || './temp-images'),
    imagensBaseDir: process.env.IMAGENS_BASE_DIR || '',
    delayEntrePostsMs: (parseInt(process.env.DELAY_ENTRE_POSTS) || 120) * 1000,
    maxPorSessao: parseInt(process.env.MAX_POR_SESSAO) || 5,
    cron: {
      horario1: process.env.CRON_HORARIO_1 || '0 8 * * *',
      horario2: process.env.CRON_HORARIO_2 || '0 13 * * *',
      horario3: process.env.CRON_HORARIO_3 || '0 18 * * *',
    }
  },

  puppeteer: {
    userDataDir: path.resolve(process.env.CHROME_USER_DATA || './chrome-profile'),
    headless: process.env.HEADLESS === 'true',
    executablePath: process.env.CHROME_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1366,768',
      '--lang=pt-BR',
    ],
    defaultViewport: { width: 1366, height: 768 },
    timeout: 60000,
  },

  categoriasFB: {
    'Casa': 'Residencial à venda',
    'Apartamento': 'Residencial à venda',
    'Terreno': 'Terreno à venda',
    'Comercial': 'Comercial',
    'Cobertura': 'Residencial à venda',
    'Studio': 'Residencial à venda',
    'Kitnet': 'Residencial para alugar',
    'Aluguel': 'Residencial para alugar',
  }
};