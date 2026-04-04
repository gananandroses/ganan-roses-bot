require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

const RETRY_DELAY_MS = 60_000; // 60 seconds

function buildUrl(path) {
  const instanceId = process.env.GREEN_API_INSTANCE_ID;
  const token = process.env.GREEN_API_TOKEN;
  return `https://api.green-api.com/waInstance${instanceId}/${path}/${token}`;
}

async function sendMessage(chatId, message) {
  const url = buildUrl('sendMessage');
  const payload = { chatId, message };

  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15_000,
    });
    logger.info(`הודעה נשלחה בהצלחה ל-${chatId} | idMessage: ${response.data?.idMessage}`);
    return { success: true, data: response.data };
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data || err.message;
    logger.error(`שגיאה בשליחת הודעה (status: ${status}): ${JSON.stringify(detail)}`);
    return { success: false, error: detail };
  }
}

async function sendMessageWithRetry(chatId, message) {
  const result = await sendMessage(chatId, message);
  if (result.success) return result;

  logger.warn(`שליחה נכשלה — מנסה שוב בעוד ${RETRY_DELAY_MS / 1000} שניות...`);
  await sleep(RETRY_DELAY_MS);

  const retry = await sendMessage(chatId, message);
  if (retry.success) {
    logger.info('ניסיון שני הצליח');
    return retry;
  }

  logger.error('שני ניסיונות שליחה נכשלו');
  return retry;
}

async function sendErrorAlert(message) {
  const ownerPhone = process.env.OWNER_PHONE;
  if (!ownerPhone) {
    logger.warn('OWNER_PHONE לא הוגדר — לא ניתן לשלוח התראת שגיאה');
    return;
  }
  logger.info(`שולח התראת שגיאה ל-${ownerPhone}`);
  await sendMessage(ownerPhone, `⚠️ *גנן אנד רוזס בוט — שגיאה*\n\n${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Extract 4 option strings from the poll text Claude generated
function parsePollOptions(pollText) {
  const lines = pollText.split('\n');
  const options = [];
  for (const line of lines) {
    const match = line.match(/[1-4]️⃣\s*(.+)/);
    if (match) options.push(match[1].trim());
  }
  return options.slice(0, 4);
}

// Send a native WhatsApp poll (interactive, tap-to-vote)
async function sendNativePoll(chatId, question, options) {
  const url = buildUrl('sendPoll');
  const payload = {
    chatId,
    message: question,
    options: options.map((o) => ({ optionName: o })),
    multipleAnswers: false,
  };

  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15_000,
    });
    logger.info(`סקר נשלח בהצלחה ל-${chatId} | idMessage: ${response.data?.idMessage}`);
    return { success: true, data: response.data };
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data || err.message;
    logger.error(`שגיאה בשליחת סקר (status: ${status}): ${JSON.stringify(detail)}`);
    return { success: false, error: detail };
  }
}

// Send an image by URL to a WhatsApp chat
async function sendImageByUrl(chatId, imageUrl, caption = '') {
  const url = buildUrl('sendFileByUrl');
  const payload = { chatId, urlFile: imageUrl, fileName: 'tip-image.jpg', caption };
  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20_000,
    });
    logger.info(`תמונה נשלחה בהצלחה ל-${chatId} | idMessage: ${response.data?.idMessage}`);
    return { success: true, data: response.data };
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data || err.message;
    logger.error(`שגיאה בשליחת תמונה (status: ${status}): ${JSON.stringify(detail)}`);
    return { success: false, error: detail };
  }
}

// Send an image from a Buffer (e.g. from Gemini inline data) via multipart upload
async function sendImageByBuffer(chatId, imageBuffer, mimeType = 'image/jpeg', caption = '') {
  const FormData = require('form-data');
  const url = buildUrl('sendFileByUpload');
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const form = new FormData();
  form.append('chatId', chatId);
  if (caption) form.append('caption', caption);
  form.append('file', imageBuffer, {
    filename: `tip-image.${ext}`,
    contentType: mimeType,
  });
  try {
    const response = await axios.post(url, form, {
      headers: form.getHeaders(),
      timeout: 30_000,
    });
    logger.info(`תמונה נשלחה בהצלחה ל-${chatId} | idMessage: ${response.data?.idMessage}`);
    return { success: true, data: response.data };
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data || err.message;
    logger.error(`שגיאה בשליחת תמונה (status: ${status}): ${JSON.stringify(detail)}`);
    return { success: false, error: detail };
  }
}

module.exports = { sendMessage, sendMessageWithRetry, sendErrorAlert, sendNativePoll, parsePollOptions, sendImageByUrl, sendImageByBuffer };

// Allow running directly for testing: node src/whatsapp.js
if (require.main === module) {
  const testChatId = process.env.TARGET_GROUP_CHAT_ID;
  if (!testChatId) {
    console.error('הגדר TARGET_GROUP_CHAT_ID ב-.env לפני הרצת הבדיקה');
    process.exit(1);
  }
  sendMessageWithRetry(testChatId, '✅ בדיקת חיבור — גנן אנד רוזס בוט פעיל 🌹').then(
    (result) => {
      if (result.success) {
        console.log('הודעת בדיקה נשלחה בהצלחה!');
      } else {
        console.error('שליחה נכשלה:', result.error);
        process.exit(1);
      }
    }
  );
}
