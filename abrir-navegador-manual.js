/**
 * abrir-navegador-manual.js
 *
 * Abre um navegador com o PERFIL de uma conta específica (mesmo perfil
 * usado na hora de postar), pra você logar manualmente com calma —
 * digitar senha, aprovar no celular, resolver captcha, o que precisar.
 *
 * A sessão fica salva na pasta de perfil da conta (ex: chrome-profile-conta2),
 * então depois de logar aqui uma vez, a automação normal (painel/index.js)
 * já encontra a sessão pronta e não precisa mais logar sozinha.
 *
 * COMO USAR:
 *   node abrir-navegador-manual.js 2
 *   (o número é o ID da conta: 1, 2 ou 3 — igual está no .env)
 *
 * O navegador fica aberto até você fechar a janela manualmente.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const fs = require('fs-extra');
const config = require('./src/config');

async function main() {
  const contaId = process.argv[2];

  if (!contaId || !config.facebook.contas[contaId]) {
    console.error('❌ Uso: node abrir-navegador-manual.js <numero-da-conta>');
    console.error('   Exemplo: node abrir-navegador-manual.js 2');
    console.error('   Contas configuradas: ' + Object.keys(config.facebook.contas).join(', '));
    process.exit(1);
  }

  const conta = config.facebook.contas[contaId];
  const userDataDir = conta.userDataDir || `./chrome-profile-conta${contaId}`;

  console.log(`🔑 Abrindo navegador para a Conta ${contaId} (${conta.nome})...`);
  console.log(`📁 Perfil: ${userDataDir}`);

  await fs.ensureDir(userDataDir);

  const browser = await puppeteer.launch({
    headless: false, // sempre visível aqui, mesmo que o .env tenha HEADLESS=true
    executablePath: config.puppeteer.executablePath,
    userDataDir,
    args: config.puppeteer.args,
    defaultViewport: config.puppeteer.defaultViewport,
  });

  const paginas = await browser.pages();
  const page = paginas[0] || (await browser.newPage());

  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });

  console.log('');
  console.log('✅ Navegador aberto. Faça o login manualmente na janela do Chrome:');
  console.log('   - Digite email/senha se pedir');
  console.log('   - Aprove no celular se pedir verificação em duas etapas');
  console.log('   - Resolva captcha se aparecer');
  console.log('');
  console.log('Quando terminar e a página do Facebook estiver carregada normalmente,');
  console.log('pode simplesmente FECHAR a janela do navegador — a sessão já estará salva.');
  console.log('');

  // Mantém o script rodando até o navegador ser fechado manualmente
  browser.on('disconnected', () => {
    console.log('🔒 Navegador fechado. Sessão salva em: ' + userDataDir);
    process.exit(0);
  });
}

main().catch(err => {
  console.error('❌ Erro: ' + err.message);
  process.exit(1);
});