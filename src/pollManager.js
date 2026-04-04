require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./logger');

const POLL_STATE_PATH = path.join(__dirname, '..', 'data', 'poll_state.json');

function buildUrl(endpoint) {
  const id = process.env.GREEN_API_INSTANCE_ID;
  const token = process.env.GREEN_API_TOKEN;
  return `https://api.green-api.com/waInstance${id}/${endpoint}/${token}`;
}

// ── Save / load poll state ────────────────────────────────────────────────────
function savePollState(state) {
  const dir = path.dirname(POLL_STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(POLL_STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
  logger.info('מצב סקר נשמר');
}

function loadPollState() {
  if (!fs.existsSync(POLL_STATE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(POLL_STATE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

// ── Drain notification queue + tally votes ────────────────────────────────────
async function drainAndTallyVotes(pollState) {
  // votes[i] = count for option index i (0-based)
  const votes = [0, 0, 0, 0];
  let drained = 0;

  logger.info('סורק הודעות נכנסות לתוצאות הסקר...');

  // Pull up to 100 notifications from the queue
  for (let i = 0; i < 100; i++) {
    let resp;
    try {
      resp = await axios.get(buildUrl('receiveNotification'), { timeout: 10_000 });
    } catch {
      break;
    }

    const body = resp.data?.body;
    if (!body) break; // queue empty

    const receiptId = resp.data.receiptId;
    const type = body.typeWebhook;

    // WhatsApp native poll vote
    if (type === 'pollUpdateMessage') {
      const votes_data = body.messageData?.pollMessageData?.votes || [];
      votes_data.forEach((v) => {
        const idx = (v.optionVoters?.length > 0) ? v.optionId : -1;
        if (idx >= 0 && idx < 4) votes[idx]++;
      });
    }

    // Text reply: someone sent "1", "2", "3", or "4"
    if (type === 'incomingMessageReceived' && pollState) {
      const text = (body.messageData?.textMessageData?.textMessage || '').trim();
      const num = parseInt(text, 10);
      if (num >= 1 && num <= 4) votes[num - 1]++;
    }

    // Delete processed notification
    try {
      await axios.delete(buildUrl(`deleteNotification/${receiptId}`), { timeout: 5_000 });
    } catch { /* ignore */ }

    drained++;
  }

  logger.info(`עובדו ${drained} התראות | תוצאות: ${votes.join(' / ')}`);
  return votes;
}

// ── Get winning topic from yesterday's poll ───────────────────────────────────
async function getWinningTopic() {
  const state = loadPollState();
  if (!state || !state.options || !state.date) return null;

  // Only use polls from the last 24 hours
  const pollAge = Date.now() - new Date(state.date).getTime();
  if (pollAge > 24 * 60 * 60 * 1000) {
    logger.info('הסקר ישן מדי (מעל 24 שעות) — מייצר טיפ חופשי');
    return null;
  }

  const votes = await drainAndTallyVotes(state);
  const maxVotes = Math.max(...votes);

  if (maxVotes === 0) {
    logger.info('אף אחד לא הצביע — מייצר טיפ חופשי');
    return null;
  }

  const winnerIdx = votes.indexOf(maxVotes);
  const winner = state.options[winnerIdx];
  logger.info(`נושא מנצח: "${winner}" (${maxVotes} הצבעות)`);
  return winner;
}

// ── Save poll after sending ───────────────────────────────────────────────────
function recordPoll(options) {
  savePollState({
    date: new Date().toISOString(),
    options, // array of 4 strings
  });
}

module.exports = { getWinningTopic, recordPoll, loadPollState };
