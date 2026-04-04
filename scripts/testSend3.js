require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { generateTip } = require('../src/tipGenerator');
const { sendMessageWithRetry } = require('../src/whatsapp');
const { recordTip } = require('../src/deduplication');
const logger = require('../src/logger');

const DELAY_MS = 5000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const chatId = process.env.TARGET_GROUP_CHAT_ID;
  if (!chatId) { console.error('TARGET_GROUP_CHAT_ID חסר ב-.env'); process.exit(1); }

  logger.info('=== שולח 3 טיפים לטסט ===');

  for (let i = 1; i <= 3; i++) {
    logger.info(`--- טיפ ${i}/3 ---`);
    const tip = await generateTip();
    console.log(`\nטיפ ${i}:\n${tip}\n`);
    const result = await sendMessageWithRetry(chatId, tip);
    if (result.success) {
      recordTip(tip);
      logger.info(`✅ טיפ ${i} נשלח בהצלחה`);
    } else {
      logger.error(`❌ טיפ ${i} נכשל: ${JSON.stringify(result.error)}`);
    }
    if (i < 3) {
      logger.info(`ממתין ${DELAY_MS / 1000} שניות לפני הטיפ הבא...`);
      await sleep(DELAY_MS);
    }
  }

  logger.info('=== סיום — 3 טיפים נשלחו ===');
})();
