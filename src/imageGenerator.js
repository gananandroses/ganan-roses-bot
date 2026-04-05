const logger = require('./logger');

// Character description — always the same person, rendered in 3D inside the scene
const CHARACTER_DESC = `In the scene, include a photorealistic 3D rendered male character who is the gardener: muscular build, Middle Eastern appearance, short dark hair, trimmed beard, full tattoo sleeve on his left arm, wearing blue denim overalls with one strap, red undershirt, brown wide-brim hat, green gardening gloves. He should feel like a real person physically present inside the scene — not a logo, not a cartoon, not a sticker. He is interacting naturally with the garden environment shown in the scene (touching the plant, inspecting the soil, holding a tool, reacting to what he sees). His facial expression and body language match the mood of the scene. Mediterranean skin tone, confident posture.`;

function getMoodContext(tipText) {
  if (!tipText) return '';
  const t = tipText;
  if (t.includes('זהירות') || t.includes('אל ת') || t.includes('מסוכן')) return 'He looks alarmed, pointing at the problem with a serious face.';
  if (t.includes('?') && (t.includes('מישהו') || t.includes('שמתם לב'))) return 'He is crouching down, closely examining the plant with a curious investigative expression.';
  if (t.includes('בעיה') || t.includes('נזק') || t.includes('מצהיב') || t.includes('מת')) return 'He looks concerned, frowning at what he sees, shaking his head slightly.';
  if (t.includes('מדהים') || t.includes('מושלם') || t.includes('עבד')) return 'He is smiling proudly, giving a thumbs up.';
  if (t.includes('!')) return 'He is confidently explaining something, pointing with one finger raised.';
  return 'He is calmly working in the garden, focused on the task.';
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

  const moodContext = getMoodContext(tipText || '');
  const fullPrompt = `${imagePrompt}. ${CHARACTER_DESC} ${moodContext}${imageNegativePrompt ? ` Do NOT include: ${imageNegativePrompt}, cartoon, logo, sticker, flat illustration` : ' Do NOT include: cartoon, logo, sticker, flat illustration'}`;

  logger.info(`מייצר תמונה עם דמות | פרומפט: ${imagePrompt.slice(0, 80)}...`);

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
    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    logger.info(`תמונה נוצרה | סוג: ${mimeType} | גודל: ${Math.round(buffer.length / 1024)}KB`);
    return { buffer, mimeType };

  } catch (err) {
    logger.warn(`יצירת תמונה נכשלה: ${err.message}`);
    return null;
  }
}

module.exports = { generateGardenImage };
