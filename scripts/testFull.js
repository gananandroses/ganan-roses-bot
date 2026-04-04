/**
 * testFull.js — runs the full pipeline once immediately (no waiting for 11 AM)
 * Usage: node scripts/testFull.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const logger = require('../src/logger');
const { sendDailyTip } = require('../src/scheduler');

(async () => {
  logger.info('=== בדיקת pipeline מלא ===');
  try {
    await sendDailyTip();
    logger.info('=== בדיקה הסתיימה בהצלחה ===');
  } catch (err) {
    logger.error(`בדיקה נכשלה: ${err.message}`);
    process.exit(1);
  }
})();
