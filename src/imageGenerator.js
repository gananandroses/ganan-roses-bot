const logger = require('./logger');

// Detect mood from tip text
function detectMood(tipText) {
  if (!tipText) return 'explaining';
  const t = tipText;
  if (t.includes('זהירות') || t.includes('אל תעשו') || t.includes('מסוכן')) return 'warning';
  if (t.includes('מדהים') || t.includes('מושלם') || t.includes('מעולה')) return 'excited';
  if (t.includes('?') && (t.includes('מישהו') || t.includes('שמתם לב'))) return 'investigating';
  if (t.includes('בשוק') || t.includes('מופתע') || t.includes('לא ידעתם')) return 'shocked';
  if (t.includes('בעיה') || t.includes('נזק') || t.includes('מצהיב') || t.includes('מת')) return 'worried';
  if (t.includes('!')) return 'proud';
  return 'explaining';
}

const MOOD_EXPRESSIONS = {
  warning:      'raising one finger in a firm warning, serious face, raised eyebrow',
  excited:      'big enthusiastic grin, bright eyes, energetic thumbs up',
  investigating:'leaning forward curiously, squinting eyes, hand on chin thinking',
  shocked:      'mouth wide open, eyes huge, hands raised in disbelief',
  worried:      'furrowed brow, concerned frown, hand on forehead',
  proud:        'arms crossed confidently, slight smirk, chest out',
  explaining:   'one finger raised making a point, confident smile, teaching pose',
};

async function generateGardenImage({ imagePrompt, imageNegativePrompt, tipText }) {
  if (!imagePrompt) {
    logger.warn('לא התקבל פרומפט לתמונה');
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('GEMINI_API_KEY לא הוגדר');
    return null;
  }

  // Build character overlay description
  const mood = detectMood(tipText || '');
  const expression = MOOD_EXPRESSIONS[mood] || MOOD_EXPRESSIONS.explaining;
  const characterDesc = `In the bottom-right corner of the image, add a cartoon illustration inset of a muscular male gardener brand mascot: blue denim overalls, red undershirt, brown cowboy hat, tattoo sleeve on left arm, holding a small watering can, surrounded by red roses, comic book illustration style, ${expression}. The mascot inset should be clearly visible but not cover the main scene. Style: brand mascot cartoon overlaid on the photorealistic garden scene.`;

  // Gemini doesn't support a separate negative_prompt field — weave it into the prompt
  const fullPrompt = `${imagePrompt}. ${characterDesc}${imageNegativePrompt ? `. Do NOT include: ${imageNegativePrompt}` : ''}`;
  logger.info(`מייצר תמונה | הבעת דמות: ${mood} | פרומפט: ${imagePrompt.slice(0, 80)}...`);

  logger.info(`מייצר תמונה | פרומפט: ${imagePrompt.slice(0, 100)}...`);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(`${data.error.code}: ${data.error.message}`);
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData);

    if (!imagePart) {
      throw new Error('לא התקבלה תמונה מ-Gemini');
    }

    const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
    const mimeType = imagePart.inlineData.mimeType || 'image/jpeg';

    logger.info(`תמונה נוצרה | סוג: ${mimeType} | גודל: ${(buffer.length / 1024).toFixed(0)}KB`);
    return { buffer, mimeType };
  } catch (err) {
    logger.warn(`יצירת תמונה נכשלה: ${err.message}`);
    return null;
  }
}

module.exports = { generateGardenImage };
