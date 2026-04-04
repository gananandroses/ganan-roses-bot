const winston = require('winston');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const today = () => new Date().toISOString().slice(0, 10);

const dailyFileTransport = () =>
  new winston.transports.File({
    filename: path.join(logsDir, `${today()}.log`),
    format: winston.format.combine(
      winston.format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
      })
    ),
  });

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] [${level}] ${message}`;
        })
      ),
    }),
    dailyFileTransport(),
  ],
});

// Rotate file transport at midnight so each day gets its own file
setInterval(() => {
  logger.clear();
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] [${level}] ${message}`;
        })
      ),
    })
  );
  logger.add(dailyFileTransport());
}, 60 * 60 * 1000); // check every hour

module.exports = logger;
