require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const cron = require('node-cron');
const { format } = require('date-fns-tz');
const logger = require('./logger');
const { generateTipAndPoll } = require('./tipGenerator');
const { sendMessageWithRetry, sendErrorAlert, sendNativePoll, sendImageByBuffer } = require('./whatsapp');
const { generateGardenImage } = require('./imageGenerator');
const { recordTip } = require('./deduplication');
const { getWinningTopic, recordPoll } = require('./pollManager');

const TIMEZONE = process.env.TIMEZONE || 'Asia/Jerusalem';
const CRON_EXPRESSION = '0 9 * * *'; // 09:00 AM Israel time

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendDailyTip() {
  const now = new Date();
  const dateStr = format(now, 'dd/MM/yyyy HH:mm', { timeZone: TIMEZONE });
  logger.info(`=== הרצת בוט יומי | ${dateStr} ===`);

  const chatId = process.env.TARGET_GROUP_CHAT_ID;
  if (!chatId) {
    const msg = 'TARGET_GROUP_CHAT_ID לא הוגדר';
    logger.error(msg);
    await sendErrorAlert(msg);
    return;
  }

  // ── STEP 1: Read poll winner from yesterday ─────────────────────────────────
  let winningTopic = null;
  try {
    winningTopic = await getWinningTopic();
    if (winningTopic) logger.info(`נושא מנצח מאתמול: "${winningTopic}"`);
    else logger.info('אין נושא מנצח מאתמול — בוחר נושא אוטומטי');
  } catch (err) {
    logger.warn(`שגיאה בקריאת תוצאות סקר: ${err.message}`);
  }

  // ── STEP 2: Generate tip + poll + image prompts ─────────────────────────────
  let tipText, pollOptions, imagePrompt, imageNegativePrompt;
  try {
    ({ tipText, pollOptions, imagePrompt, imageNegativePrompt } =
      await generateTipAndPoll(winningTopic));
  } catch (err) {
    const msg = `שגיאה קריטית בייצור טיפ: ${err.message}`;
    logger.error(msg);
    await sendErrorAlert(msg);
    return;
  }

  // ── STEP 3: Generate + send image ───────────────────────────────────────────
  const imageData = await generateGardenImage({ imagePrompt, imageNegativePrompt });
  if (imageData) {
    await sendImageByBuffer(chatId, imageData.buffer, imageData.mimeType);
    await sleep(1500);
  } else {
    logger.warn('תמונה לא נוצרה — ממשיך בלי תמונה');
  }

  // ── STEP 4: Send tip text ───────────────────────────────────────────────────
  const tipResult = await sendMessageWithRetry(chatId, tipText);
  if (!tipResult.success) {
    await sendErrorAlert(`שליחת טיפ נכשלה: ${JSON.stringify(tipResult.error)}`);
    return;
  }
  recordTip(tipText);
  logger.info('טיפ נשלח ונרשם');

  // ── STEP 5: Send native poll ────────────────────────────────────────────────
  if (pollOptions && pollOptions.length === 4) {
    await sleep(1500);
    const pollResult = await sendNativePoll(
      chatId,
      '🗳️ מה הטיפ הבא?\nהנושא עם הכי הרבה תגובות - אותו נכסה מחר',
      pollOptions
    );
    if (pollResult.success) {
      recordPoll(pollOptions);
      logger.info(`סקר נשלח | ${pollOptions.join(' | ')}`);
    } else {
      logger.warn('שליחת סקר נכשלה');
    }
  } else {
    logger.warn(`pollOptions לא תקין (${pollOptions?.length || 0} אפשרויות)`);
  }

  logger.info('=== מחזור יומי הסתיים בהצלחה ===');
}

function startScheduler() {
  logger.info(`מתזמן: הבוט ירוץ לפי: ${CRON_EXPRESSION} (${TIMEZONE})`);
  cron.schedule(CRON_EXPRESSION, sendDailyTip, { timezone: TIMEZONE });
  logger.info('המתזמן פועל...');
}

module.exports = { startScheduler, sendDailyTip };
