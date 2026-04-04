/**
 * testPollFlow.js — מדמה תוצאות סקר ובודק שהטיפ הבא נבנה לפי הנושא המנצח
 * שימוש: node scripts/testPollFlow.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { sendDailyTip } = require('../src/scheduler');
const logger = require('../src/logger');

const POLL_STATE_PATH = path.join(__dirname, '..', 'data', 'poll_state.json');

// ── שמור מצב סקר מדומה — אפשרות 2 מנצחת ──────────────────────────────────
const simulatedPoll = {
  date: new Date().toISOString(),
  options: [
    'איך להציל עץ תפוז שעליו מתחילים להצהיב?',
    'מה הסוד להרבות ורדים מגבעולים חתוכים?',
    'איך בונים גינת מרפסת שמחזיקה מעמד בקיץ ישראלי?',
    'מתי הזמן הנכון לגזום עץ זית בגינת בית?',
  ],
};

// הדמיית 3 הצבעות לאפשרות 2 (אינדקס 1)
simulatedPoll._simulatedVotes = [0, 3, 1, 0]; // option 2 wins

fs.writeFileSync(POLL_STATE_PATH, JSON.stringify(simulatedPoll, null, 2));
logger.info('✅ מצב סקר מדומה נשמר');
logger.info(`נושא מנצח צפוי: "${simulatedPoll.options[1]}" (3 הצבעות)`);
logger.info('');
logger.info('מריץ pipeline מלא — הטיפ אמור להתמקד בהרבאת ורדים מגבעולים...');
logger.info('');

// Override drainAndTallyVotes to return simulated votes without hitting Green API
// We do this by writing the votes directly into the state file
const state = JSON.parse(fs.readFileSync(POLL_STATE_PATH, 'utf-8'));

// Patch pollManager to use simulated votes
const pollManager = require('../src/pollManager');
const originalGetWinner = pollManager.getWinningTopic.toString();

// Monkey-patch for this test only
pollManager.getWinningTopic = async function () {
  const votes = simulatedPoll._simulatedVotes;
  const maxVotes = Math.max(...votes);
  const winnerIdx = votes.indexOf(maxVotes);
  const winner = simulatedPoll.options[winnerIdx];
  logger.info(`[TEST] נושא מנצח מסומלץ: "${winner}" (${maxVotes} הצבעות)`);
  return winner;
};

(async () => {
  await sendDailyTip();
})();
