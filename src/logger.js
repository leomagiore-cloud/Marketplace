const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs-extra');

const logsDir = path.resolve('./logs');
fs.ensureDirSync(logsDir);

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      const emoji = { error: '❌', warn: '⚠️', info: 'ℹ️', debug: '🔍' }[level] || '';
      return `[${timestamp}] ${emoji} ${level.toUpperCase()}: ${stack || message}`;
    })
  ),
  transports: [
    new transports.Console({
      format: format.combine(format.colorize(), format.simple())
    }),
    new transports.File({
      filename: path.join(logsDir, 'erros.log'),
      level: 'error',
    }),
    new transports.File({
      filename: path.join(logsDir, 'postagens.log'),
    }),
  ],
});

module.exports = logger;
