const logger = require('./logger');

const MOOD_PROMPTS = {
  surprised: 'eyes wide open in surprise, jaw slightly dropped, eyebrows raised high, shocked expression',
  investigating: 'squinting eyes focused and curious, leaning forward slightly, one hand on chin thinking, detective-like expression',
  happy: 'big warm smile, eyes crinkled with joy, relaxed confident posture, thumbs up gesture',
  proud: 'arms crossed confidently, slight smirk, chest out, proud authoritative look',
  worried: 'furrowed brows, slightly frowning, concerned eyes, hand on forehead',
  angry: 'furrowed brows, tight jaw, intense serious stare, slightly clenched fist',
  excited: 'huge grin, bright wide eyes, energetic leaning forward, enthusiastic expression',
  shocked: 'mouth wide open, eyes huge, hands slightly raised in disbelief',
  explaining: 'one finger raised making a point, confident smile, direct eye contact, teaching pose',
  warning: 'serious firm look, one finger pointing, raised eyebrow, cautionary expression',
};

function getMoodFromTip(tipText) {
  const text = tipText.toLowerCase();
  if (text.includes('זהירות') || text.includes('שימו לב') || text.includes('אל תעשו') || text.includes('מסוכן')) return 'warning';
  if (text.includes('מדהים') || text.includes('מושלם') || text.includes('מעולה')) return 'excited';
  if (text.includes('?') && (text.includes('מישהו') || text.includes('שמתם לב'))) return 'investigating';
  if (text.includes('לא ידעתם') || text.includes('בשוק') || text.includes('מופתע')) return 'shocked';
  if (text.includes('גאה') || text.includes('הצלחה') || text.includes('עבד')) return 'proud';
  if (text.includes('בעיה') || text.includes('נזק') || text.includes('מת') || text.includes('מצהיב')) return 'worried';
  if (text.includes('!') && (text.includes('עכשיו') || text.includes('מיד'))) return 'explaining';
  const moods = Object.keys(MOOD_PROMPTS);
  return moods[Math.floor(Math.random() * moods.length)];
}

async function generateCharacterImage(tipText, apiKey) {
  const mood = getMoodFromTip(tipText);
  const moodDesc = MOOD_PROMPTS[mood] || MOOD_PROMPTS.explaining;

  const prompt = `Cartoon illustration character: muscular Israeli male gardener, wearing blue denim overalls, red undershirt, brown cowboy hat, gardening gloves, detailed tattoo sleeve on left arm, holding a small watering can. Style: bold comic book illustration with clean lines, vibrant colors, similar to a brand mascot. Expression: ${moodDesc}. Surrounded by a few red roses. White background. Full body portrait, centered. No text, no watermarks.`;

  logger.info(`מייצר דמות | הבעה: ${mood}`);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      logger.warn(`שגיאה בייצור דמות: ${JSON.stringify(data.error || data)}`);
      return null;
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imagePart) {
      logger.warn('דמות לא הוחזרה מ-Gemini');
      return null;
    }

    const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    logger.info(`דמות נוצרה | הבעה: ${mood} | גודל: ${Math.round(buffer.length / 1024)}KB`);
    return { buffer, mimeType, mood };
  } catch (err) {
    logger.warn(`שגיאה בייצור דמות: ${err.message}`);
    return null;
  }
}

module.exports = { generateCharacterImage, getMoodFromTip };
