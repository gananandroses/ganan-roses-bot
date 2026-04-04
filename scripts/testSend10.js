require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sendMessageWithRetry } = require('../src/whatsapp');
const fallbackTips = require('../fallback/fallbackTips');
const logger = require('../src/logger');

const DELAY_MS = 4000; // 4 seconds between messages

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const chatId = process.env.TARGET_GROUP_CHAT_ID;
  if (!chatId) {
    console.error('TARGET_GROUP_CHAT_ID לא מוגדר ב-.env');
    process.exit(1);
  }

  logger.info('=== שולח 10 טיפים לטסט ===');

  for (let i = 0; i < fallbackTips.length; i++) {
    const tip = fallbackTips[i];
    logger.info(`--- שולח טיפ ${i + 1}/10 ---`);
    console.log(`\nטיפ ${i + 1}:\n${tip}\n`);

    const result = await sendMessageWithRetry(chatId, tip);
    if (result.success) {
      logger.info(`טיפ ${i + 1} נשלח בהצלחה`);
    } else {
      logger.error(`טיפ ${i + 1} נכשל: ${JSON.stringify(result.error)}`);
    }

    if (i < fallbackTips.length - 1) await sleep(DELAY_MS);
  }

  logger.info('=== סיום — 10 טיפים נשלחו ===');
})();
