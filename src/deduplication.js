const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const LOG_PATH = path.join(__dirname, '..', 'data', 'tips_log.json');
const MAX_STORED_TIPS = 30;
const SIMILARITY_THRESHOLD = 0.4; // Jaccard similarity — above this = too similar

function loadLog() {
  if (!fs.existsSync(LOG_PATH)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(LOG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    logger.warn('לא ניתן לקרוא את קובץ הלוג — מתחיל מחדש עם רשימה ריקה');
    return [];
  }
}

function saveLog(tips) {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(LOG_PATH, JSON.stringify(tips, null, 2), 'utf-8');
}

function tokenize(text) {
  return new Set(
    text
      .replace(/[^\u0590-\u05FF\w\s]/g, '') // keep Hebrew and Latin chars
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
  );
}

function jaccardSimilarity(setA, setB) {
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function isTooSimilar(newTip, pastTips) {
  const newTokens = tokenize(newTip);
  for (const entry of pastTips) {
    const pastTokens = tokenize(entry.tip);
    const score = jaccardSimilarity(newTokens, pastTokens);
    if (score >= SIMILARITY_THRESHOLD) {
      logger.warn(`טיפ דומה מדי לטיפ מ-${entry.date} (similarity: ${score.toFixed(2)})`);
      return true;
    }
  }
  return false;
}

function recordTip(tip) {
  const log = loadLog();
  log.unshift({
    date: new Date().toLocaleDateString('he-IL', {
      timeZone: process.env.TIMEZONE || 'Asia/Jerusalem',
    }),
    timestamp: new Date().toISOString(),
    tip,
  });
  const trimmed = log.slice(0, MAX_STORED_TIPS);
  saveLog(trimmed);
  logger.info(`טיפ נשמר ברשומות. סה"כ רשומות: ${trimmed.length}`);
}

function checkDuplicate(tip) {
  const log = loadLog();
  return isTooSimilar(tip, log);
}

function getRecentTipTexts(count = 14) {
  const log = loadLog();
  return log.slice(0, count).map((entry) => entry.tip);
}

module.exports = { checkDuplicate, recordTip, getRecentTipTexts };
