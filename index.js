require('dotenv').config();
const logger = require('./src/logger');
const { startScheduler } = require('./src/scheduler');

// Validate required env vars on startup
const REQUIRED_VARS = [
  'GEMINI_API_KEY',
  'GREEN_API_INSTANCE_ID',
  'GREEN_API_TOKEN',
  'TARGET_GROUP_CHAT_ID',
];

const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  logger.error(`משתני סביבה חסרים: ${missing.join(', ')}`);
  logger.error('יוצא. אנא מלא את קובץ ה-.env ונסה שוב.');
  process.exit(1);
}

logger.info('🌹 גנן אנד רוזס WhatsApp Bot — מתחיל...');
logger.info(`Node.js version: ${process.version}`);
logger.info(`Timezone: ${process.env.TIMEZONE || 'Asia/Jerusalem'}`);

startScheduler();

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('קיבלתי SIGINT — מכבה בוט בצורה מסודרת');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('קיבלתי SIGTERM — מכבה בוט בצורה מסודרת');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error(`שגיאה לא נתפסת: ${err.message}\n${err.stack}`);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Promise rejection לא טופל: ${reason}`);
});
