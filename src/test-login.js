/**
 * Teste de Login — rode antes de usar o sistema completo
 * npm run testar          → login automático
 * npm run testar-manual   → abre o navegador para você logar manualmente
 */
require('dotenv').config();
const FacebookPoster = require('./poster');
const logger = require('./logger');

logger.level = 'debug';

const modoManual = process.argv.includes('--manual');

// Valida variáveis obrigatórias
const erros = [];
if (!process.env.FB_EMAIL)  erros.push('FB_EMAIL não definido no .env');
if (!process.env.FB_SENHA)  erros.push('FB_SENHA não definido no .env');
if (!process.env.SHEET_ID || process.env.SHEET_ID === '1aBcDeFgHiJkLmNoPqRsTuVwXyZ')
  erros.push('SHEET_ID ainda está com o valor de exemplo no .env');

if (erros.length > 0) {
  console.error('\n❌ VARIÁVEIS NÃO CONFIGURADAS NO .env:\n');
  erros.forEach(e => console.error('  • ' + e));
  process.exit(1);
}

async function loginManual(poster) {
  logger.info('🖐️  MODO MANUAL — O navegador vai abrir no Facebook.');
  logger.info('   1. Faça login normalmente no navegador');
  logger.info('   2. Após entrar no feed, volte aqui e pressione ENTER\n');

  await poster.iniciar();

  // Abre direto no FB
  await poster.page.goto('https://www.facebook.com/login', { waitUntil: 'load' });

  // Espera o usuário pressionar Enter no terminal
  await new Promise(resolve => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      resolve();
    });
    process.stdout.write('   ⏳ Aguardando... (pressione ENTER após fazer login no navegador)\n');
  });

  const url = poster.page.url();
  if (url.includes('/login') || url.includes('checkpoint')) {
    throw new Error('Ainda na tela de login — certifique-se de ter completado o login antes de pressionar Enter');
  }

  logger.info('\n✅ Sessão salva! Agora pode fechar e usar npm start.');
}

async function loginAutomatico(poster) {
  logger.info(`  📧 Email: ${process.env.FB_EMAIL}`);
  logger.info(`  🔑 Senha: ${'*'.repeat(process.env.FB_SENHA.length)}\n`);
  await poster.iniciar();
  await poster.verificarLogin();
  logger.info('\n✅ Login OK! Sessão salva no chrome-profile.');
}

(async () => {
  logger.info(modoManual ? '🖐️  MODO MANUAL\n' : '🤖 MODO AUTOMÁTICO\n');
  const poster = new FacebookPoster();

  try {
    if (modoManual) {
      await loginManual(poster);
    } else {
      await loginAutomatico(poster);
    }
    await new Promise(r => setTimeout(r, 3000));
  } catch (err) {
    logger.error('❌ Falha: ' + err.message);
    if (!modoManual) {
      logger.info('\n💡 Se o login automático continuar falhando, use:');
      logger.info('   npm run testar-manual');
      logger.info('   (abre o navegador para você logar manualmente)');
    }
  } finally {
    await poster.fechar();
  }
})();