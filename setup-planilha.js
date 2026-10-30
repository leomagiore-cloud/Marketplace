/**
 * Setup da planilha "Imóveis Marketplace"
 * Execute UMA VEZ: node setup-planilha.js
 */
require('dotenv').config();
const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = '1JwZU3w4oYI-JClzEWsIzbDW9K5K8wCg9Fx7ucr45sik';
const ABA = 'Imóveis';

async function setup() {
  console.log('🔧 Configurando planilha "Imóveis Marketplace"...\n');

  // Auth
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  // ── 1. VERIFICAR / CRIAR ABA ─────────────────────────────────
  console.log('📋 Verificando aba...');
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const abas = spreadsheet.data.sheets.map(s => s.properties.title);

  let sheetId;

  if (!abas.includes(ABA)) {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title: ABA, gridProperties: { rowCount: 1000, columnCount: 16 } }
          }
        }]
      }
    });
    sheetId = res.data.replies[0].addSheet.properties.sheetId;
    console.log(`  ✅ Aba "${ABA}" criada`);
  } else {
    sheetId = spreadsheet.data.sheets.find(s => s.properties.title === ABA).properties.sheetId;
    console.log(`  ✅ Aba "${ABA}" encontrada`);
  }

  // ── 2. CABEÇALHOS ────────────────────────────────────────────
  console.log('📝 Inserindo cabeçalhos...');
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${ABA}!A1:P1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        'ID',
        'Título',
        'Descrição',
        'Preço (R$)',
        'Tipo',
        'Operação',
        'Quartos',
        'Banheiros',
        'Área (m²)',
        'Localização',
        'Tags',
        'Imagens',
        'Status',
        'Data Postagem',
        'Link',
        'Erro',
      ]]
    }
  });

  // ── 3. LINHA DE EXEMPLO ──────────────────────────────────────
  console.log('🏠 Inserindo imóvel de exemplo...');
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${ABA}!A2:P2`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        'IM001',
        'Casa 3 Quartos com Quintal - Jardim Paulistano Sorocaba',
        'Linda casa com 3 quartos, 2 banheiros, sala ampla, cozinha planejada e quintal grande. Próxima a escolas, mercados e transporte público. Excelente estado de conservação.',
        '450000',
        'Casa',
        'Venda',
        '3',
        '2',
        '120',
        'Sorocaba, SP',
        'casa, venda, sorocaba, jardim paulistano, 3 quartos, quintal',
        'D:\\Imóveis\\Fotos\\casa001_frente.jpg|D:\\Imóveis\\Fotos\\casa001_sala.jpg',
        'pendente',
        '',
        '',
        '',
      ]]
    }
  });

  // ── 4. FORMATAÇÃO ────────────────────────────────────────────
  console.log('🎨 Aplicando formatação...');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        // Cabeçalho: fundo verde escuro, texto branco, negrito
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 16 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.13, green: 0.37, blue: 0.22 },
                textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 11 },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE',
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
          }
        },
        // Linha de exemplo: fundo cinza claro
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 16 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.95, green: 0.97, blue: 0.95 },
              }
            },
            fields: 'userEnteredFormat(backgroundColor)',
          }
        },
        // Congelar linha 1 (cabeçalho)
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: 'gridProperties.frozenRowCount',
          }
        },
        // Larguras das colunas
        ...[ 
          { col: 0,  px: 70  },  // ID
          { col: 1,  px: 280 },  // Título
          { col: 2,  px: 320 },  // Descrição
          { col: 3,  px: 110 },  // Preço
          { col: 4,  px: 100 },  // Tipo
          { col: 5,  px: 90  },  // Operação
          { col: 6,  px: 80  },  // Quartos
          { col: 7,  px: 90  },  // Banheiros
          { col: 8,  px: 90  },  // Área
          { col: 9,  px: 160 },  // Localização
          { col: 10, px: 200 },  // Tags
          { col: 11, px: 240 },  // Imagens
          { col: 12, px: 100 },  // Status
          { col: 13, px: 140 },  // Data Postagem
          { col: 14, px: 200 },  // Link
          { col: 15, px: 200 },  // Erro
        ].map(({ col, px }) => ({
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 },
            properties: { pixelSize: px },
            fields: 'pixelSize',
          }
        })),
        // Altura da linha de cabeçalho
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
            properties: { pixelSize: 35 },
            fields: 'pixelSize',
          }
        },
        // Bordas na área de dados
        {
          updateBorders: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 100, startColumnIndex: 0, endColumnIndex: 16 },
            top:    { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
            bottom: { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
            left:   { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
            right:  { style: 'SOLID', color: { red: 0.8, green: 0.8, blue: 0.8 } },
            innerHorizontal: { style: 'SOLID', color: { red: 0.9, green: 0.9, blue: 0.9 } },
            innerVertical:   { style: 'SOLID', color: { red: 0.9, green: 0.9, blue: 0.9 } },
          }
        },
      ]
    }
  });

  // ── 5. VALIDAÇÃO DE DADOS (coluna Status) ────────────────────
  console.log('✅ Configurando validação da coluna Status...');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        // Dropdown para Status (coluna M = índice 12)
        {
          setDataValidation: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 12, endColumnIndex: 13 },
            rule: {
              condition: {
                type: 'ONE_OF_LIST',
                values: [
                  { userEnteredValue: 'pendente' },
                  { userEnteredValue: 'postado' },
                  { userEnteredValue: 'erro' },
                  { userEnteredValue: 'pausado' },
                ],
              },
              showCustomUi: true,
              strict: false,
            }
          }
        },
        // Dropdown para Tipo (coluna E = índice 4)
        {
          setDataValidation: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 4, endColumnIndex: 5 },
            rule: {
              condition: {
                type: 'ONE_OF_LIST',
                values: [
                  { userEnteredValue: 'Casa' },
                  { userEnteredValue: 'Apartamento' },
                  { userEnteredValue: 'Terreno' },
                  { userEnteredValue: 'Comercial' },
                  { userEnteredValue: 'Cobertura' },
                  { userEnteredValue: 'Studio' },
                  { userEnteredValue: 'Kitnet' },
                  { userEnteredValue: 'Chácara' },
                  { userEnteredValue: 'Galpão' },
                ],
              },
              showCustomUi: true,
              strict: false,
            }
          }
        },
        // Dropdown para Operação (coluna F = índice 5)
        {
          setDataValidation: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 5, endColumnIndex: 6 },
            rule: {
              condition: {
                type: 'ONE_OF_LIST',
                values: [
                  { userEnteredValue: 'Venda' },
                  { userEnteredValue: 'Aluguel' },
                ],
              },
              showCustomUi: true,
              strict: false,
            }
          }
        },
      ]
    }
  });

  // ── 6. FORMATAÇÃO CONDICIONAL (Status colorido) ─────────────
  console.log('🌈 Configurando cores por status...');
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        // pendente → amarelo
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 12, endColumnIndex: 13 }],
              booleanRule: {
                condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'pendente' }] },
                format: { backgroundColor: { red: 1.0, green: 0.95, blue: 0.6 } }
              }
            },
            index: 0
          }
        },
        // postado → verde
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 12, endColumnIndex: 13 }],
              booleanRule: {
                condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'postado' }] },
                format: { backgroundColor: { red: 0.7, green: 0.95, blue: 0.7 } }
              }
            },
            index: 1
          }
        },
        // erro → vermelho
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 12, endColumnIndex: 13 }],
              booleanRule: {
                condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'erro' }] },
                format: { backgroundColor: { red: 1.0, green: 0.7, blue: 0.7 } }
              }
            },
            index: 2
          }
        },
        // pausado → cinza
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 12, endColumnIndex: 13 }],
              booleanRule: {
                condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: 'pausado' }] },
                format: { backgroundColor: { red: 0.87, green: 0.87, blue: 0.87 } }
              }
            },
            index: 3
          }
        },
      ]
    }
  });

  console.log('\n═══════════════════════════════════════════════════');
  console.log('✅ PLANILHA CONFIGURADA COM SUCESSO!');
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('📊 O que foi criado:');
  console.log('  ✔ Aba "Imóveis" com 16 colunas');
  console.log('  ✔ Cabeçalhos formatados (verde)');
  console.log('  ✔ 1 imóvel de exemplo (linha 2)');
  console.log('  ✔ Dropdowns: Tipo, Operação, Status');
  console.log('  ✔ Cores automáticas por status');
  console.log('  ✔ Cabeçalho congelado');
  console.log('');
  console.log('🔗 Acesse:');
  console.log('  https://docs.google.com/spreadsheets/d/' + SHEET_ID);
  console.log('');
  console.log('📋 Próximos passos:');
  console.log('  1. Adicione seus imóveis a partir da linha 3');
  console.log('  2. Coluna "Status" = pendente para postar');
  console.log('  3. Execute: npm run testar');
  console.log('  4. Execute: npm start');
}

setup().catch(err => {
  console.error('\n❌ ERRO:', err.message);
  if (err.message.includes('credentials')) {
    console.log('\n💡 Verifique se o credentials.json está na pasta correta');
    console.log('   e se a service account tem acesso à planilha.');
  }
  process.exit(1);
});
