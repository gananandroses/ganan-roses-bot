const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.jpeg');

function getMoodContext(tipText) {
  if (!tipText) return 'calm and focused, working in the garden';
  const t = tipText;
  if (t.includes('זהירות') || t.includes('אל ת') || t.includes('מסוכן')) return 'alarmed, pointing at the problem with a serious face and raised eyebrow';
  if (t.includes('?') && (t.includes('מישהו') || t.includes('שמתם לב'))) return 'crouching curiously, examining closely with squinted eyes and hand on chin';
  if (t.includes('בעיה') || t.includes('נזק') || t.includes('מצהיב') || t.includes('מת')) return 'concerned and worried, frowning and shaking head slightly';
  if (t.includes('מדהים') || t.includes('מושלם') || t.includes('עבד')) return 'smiling proudly, giving a big thumbs up';
  if (t.includes('!')) return 'confidently explaining, pointing upward with one finger';
  return 'calm and engaged, naturally interacting with the garden';
}

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

  const mood = getMoodContext(tipText || '');

  // Build request parts — include logo as reference image if available
  const textPrompt = `The first image is a reference character design — a cartoon gardener mascot.
Recreate ONLY the character himself (not the roses, not the logo frame, not any text) as a living 3D animated figure in Pixar/Disney style.
Faithfully match: his muscular build, the blue denim overalls with one strap, red undershirt, brown wide-brim hat, detailed tattoo sleeve on his left arm, green gardening gloves, and his face.
Do NOT include roses on or around the character. The roses belong to the logo, not to the character himself.
Place him naturally and fully inside this garden scene: ${imagePrompt}
His expression and body language: ${mood}.
He should feel alive, 3D, and part of the scene — interacting with the environment shown.
No text, no watermarks, no roses around the character.${imageNegativePrompt ? ` Also avoid: ${imageNegativePrompt}.` : ''}`;

  const parts = [];

  if (fs.existsSync(LOGO_PATH)) {
    const logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: logoBase64 } });
    logger.info('לוגו נטען כ-reference');
  }
  parts.push({ text: textPrompt });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      throw new Error(`${data.error.code}: ${data.error.message}`);
    }

    const responseParts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = responseParts.find((p) => p.inlineData);

    if (!imagePart) {
      throw new Error('לא התקבלה תמונה מ-Gemini');
    }

    const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    logger.info(`תמונה נוצרה | סוג: ${mimeType} | גודל: ${Math.round(buffer.length / 1024)}KB`);
    return { buffer, mimeType };

  } catch (err) {
    logger.warn(`יצירת תמונה נכשלה: ${err.message}`);
    return null;
  }
}

module.exports = { generateGardenImage };
