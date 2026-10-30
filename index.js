require('dotenv').config();
const cron = require('node-cron');
const config = require('./src/config');
const logger = require('./src/logger');
const sheets = require('./src/sheets');
const imageHandler = require('./src/imageHandler');
const FacebookPoster = require('./src/poster');

// ⭐ Lê o argumento --contas=1,2 (enviado pelo painel) se existir
function obterContasSelecionadasViaArgumento() {
  const arg = process.argv.find(a => a.startsWith('--contas='));
  if (!arg) return null;
  const contas = arg
    .replace('--contas=', '')
    .split(',')
    .map(n => parseInt(n.trim(), 10))
    .filter(n => !isNaN(n));
  return contas.length > 0 ? contas : null;
}

// ──────────────────────────────────────────────────────────────
// SESSÃO DE POSTAGEM PRINCIPAL
// ──────────────────────────────────────────────────────────────
async function executarSessao() {
  const inicio = Date.now();
  logger.info('═══════════════════════════════════════════════════');
  logger.info(`▶ INICIANDO SESSÃO — ${new Date().toLocaleString('pt-BR')}`);
  logger.info('═══════════════════════════════════════════════════');

  let poster = null;

  try {
    // 1. Conecta Google Sheets
    await sheets.inicializar();

    // 2. Busca contas ativas
    // ⭐ Se o painel selecionou contas específicas (--contas=1,2), usa essas.
    //    Senão, cai no comportamento antigo: todas as contas com ATIVA=true no .env
    const contasSelecionadas = obterContasSelecionadasViaArgumento();

    let contasAtivas;
    if (contasSelecionadas) {
      contasAtivas = contasSelecionadas.filter(id => {
        const conta = config.facebook.contas[id];
        return conta && conta.email && conta.senha;
      });
      logger.info(`👥 Contas selecionadas no painel: ${contasAtivas.join(', ')}`);
    } else {
      contasAtivas = Object.keys(config.facebook.contas).filter(id => {
        const conta = config.facebook.contas[id];
        return conta.ativa && conta.email && conta.senha;
      }).map(Number);
      logger.info(`👥 Contas ativas (via .env, nenhuma seleção recebida do painel): ${contasAtivas.join(', ')}`);
    }

    if (contasAtivas.length === 0) {
      contasAtivas.push(1);
    }

    logger.info(`👥 Contas ativas: ${contasAtivas.join(', ')}`);

    // 3. Busca imóveis pendentes (apenas UMA vez)
    const pendentes = await sheets.buscarPendentes(config.postagem.maxPorSessao, contasAtivas);
    if (pendentes.length === 0) {
      logger.info('📭 Nenhum imóvel pendente. Sessão encerrada.');
      return;
    }

    logger.info(`📋 ${pendentes.length} imóvel(is) pendente(s) encontrado(s)`);

    // 4. Inicia navegador UMA VEZ (para baixar imagens com cookies)
    poster = new FacebookPoster();
    await poster.iniciar();
    await poster.verificarLogin();

    let postados = 0;
    let erros = 0;

    // 5. Processa cada imóvel
    // Dentro do loop de processamento
for (let i = 0; i < pendentes.length; i++) {
  const imovel = pendentes[i];
  
  // ⭐ Verifica o status geral (coluna N)
  if (imovel.status && imovel.status.toLowerCase() === 'pausado') {
    logger.info(`\n⏭️ [${i + 1}/${pendentes.length}] Pulando (pausado): ${imovel.titulo}`);
    continue;
  }
  
  if (imovel.status && imovel.status.toLowerCase() === 'postado') {
    logger.info(`\n⏭️ [${i + 1}/${pendentes.length}] Pulando (já postado): ${imovel.titulo}`);
    continue;
  }
  
  if (imovel.status && imovel.status.toLowerCase() === 'erro') {
    logger.info(`\n⏭️ [${i + 1}/${pendentes.length}] Pulando (erro): ${imovel.titulo}`);
    continue;
  }

  logger.info(`\n[${i + 1}/${pendentes.length}] Processando: ${imovel.titulo}`);

      // Processa imagens (usa a página do poster para baixar com cookies)
      const imagensLocais = await imageHandler.processarImagens(imovel.imagens, poster.page);

      // Se não tem imagens, pula
      if (imagensLocais.length === 0 && imovel.imagens) {
        logger.warn(`⚠️ Nenhuma imagem disponível para: ${imovel.titulo}`);
        await sheets.marcarErro(imovel._linhaIdx, 'Sem imagens disponíveis (URLs expiradas)');
        erros++;
        continue;
      }

      // Posta em múltiplas contas
      const resultado = await poster.postarMultiplasContas(imovel, imagensLocais, imovel.contasPendentes || contasAtivas);

      if (resultado.sucesso) {
        postados++;
      } else {
        const algumSucesso = resultado.resultados?.some(r => r.sucesso);
        if (!algumSucesso) {
          erros++;
          await sheets.marcarErro(imovel._linhaIdx, resultado.resultados?.[0]?.erro || 'Falha em todas as contas');
        } else {
          postados++;
        }
      }

      // Delay entre imóveis
      if (i < pendentes.length - 1) {
        const delayMs = config.postagem.delayEntrePostsMs + Math.random() * 30000;
        logger.info(`⏳ Aguardando ${Math.round(delayMs/1000)}s antes do próximo...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    await imageHandler.limparTempForcado();

    const duracao = Math.round((Date.now() - inicio) / 1000);
    logger.info('═══════════════════════════════════════════════════');
    logger.info(`✅ SESSÃO CONCLUÍDA em ${duracao}s — Postados: ${postados} | Erros: ${erros}`);
    logger.info('═══════════════════════════════════════════════════');

  } catch (err) {
    logger.error('ERRO CRÍTICO NA SESSÃO: ' + err.message);
    logger.error(err.stack);
    try {
      await imageHandler.limparTempForcado();
    } catch (e) {}
  } finally {
    if (poster) await poster.fechar();
  }
}

// ──────────────────────────────────────────────────────────────
// MODO --now
// ──────────────────────────────────────────────────────────────
if (process.argv.includes('--now')) {
  logger.info('⚡ Modo manual (--now): executando agora...');
  executarSessao().catch(err => {
    logger.error('Erro fatal: ' + err.message);
    process.exit(1);
  });
} else {
  logger.info('⏰ Scheduler iniciado. Aguardando horários configurados...');
  logger.info(`  Horário 1: ${config.postagem.cron.horario1}`);
  logger.info(`  Horário 2: ${config.postagem.cron.horario2}`);
  logger.info(`  Horário 3: ${config.postagem.cron.horario3}`);

  const horarios = [
    config.postagem.cron.horario1,
    config.postagem.cron.horario2,
    config.postagem.cron.horario3,
  ];

  horarios.forEach((horario, idx) => {
    if (!cron.validate(horario)) {
      logger.error(`❌ CRON inválido para Horário ${idx + 1}: "${horario}"`);
      return;
    }

    cron.schedule(horario, () => {
      logger.info(`🔔 Cron disparou (Horário ${idx + 1}): ${horario}`);
      executarSessao().catch(err => logger.error('Erro no cron: ' + err.message));
    }, {
      timezone: 'America/Sao_Paulo',
    });
  });

  logger.info('\n💡 Para postar agora: npm run post-agora');
  logger.info('💡 Para testar login: npm run testar\n');
}