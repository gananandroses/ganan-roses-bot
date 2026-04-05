// Usage: node scripts/testTopic.js "גיזום מנגו"
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
if (!process.env.GEMINI_API_KEY) {
  const fs = require('fs'), path = require('path');
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([^#=]+)=([^#]*)$/);
      if (match) process.env[match[1].trim()] = match[2].trim();
    }
  }
}

const { generateTipAndPoll } = require('../src/tipGenerator');
const { sendImageByBuffer, sendMessageWithRetry, sendNativePoll } = require('../src/whatsapp');
const { generateGardenImage } = require('../src/imageGenerator');
const { generateCharacterImage } = require('../src/characterGenerator');
const { mergeImages } = require('../src/imageMerger');
const { recordPoll } = require('../src/pollManager');
const { recordTip } = require('../src/deduplication');
const logger = require('../src/logger');

const TOPIC = process.argv[2] || null;
const chatId = process.env.TARGET_GROUP_CHAT_ID;

(async () => {
  const start = new Date().toISOString();
  logger.info(`=== טסט התחיל: ${start}${TOPIC ? ` | נושא: "${TOPIC}"` : ''} ===`);

  const { tipText, pollOptions, imagePrompt, imageNegativePrompt } =
    await generateTipAndPoll(TOPIC);

  const apiKey = process.env.GEMINI_API_KEY;
  const [imageData, characterData] = await Promise.all([
    generateGardenImage({ imagePrompt, imageNegativePrompt }),
    generateCharacterImage(tipText, apiKey),
  ]);

  if (imageData) {
    let finalBuffer = imageData.buffer;
    if (characterData) {
      finalBuffer = await mergeImages(imageData.buffer, characterData.buffer);
    }
    await sendImageByBuffer(chatId, finalBuffer, 'image/jpeg');
    await new Promise(r => setTimeout(r, 1500));
  }

  await sendMessageWithRetry(chatId, tipText);
  recordTip(tipText);

  if (pollOptions?.length === 4) {
    await new Promise(r => setTimeout(r, 1500));
    const pollResult = await sendNativePoll(
      chatId,
      '🗳️ מה הטיפ הבא?\nהנושא עם הכי הרבה תגובות - אותו נכסה מחר',
      pollOptions
    );
    if (pollResult.success) recordPoll(pollOptions);
  }

  logger.info(`=== טסט הסתיים: ${new Date().toISOString()} ===`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
