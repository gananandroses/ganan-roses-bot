const logger = require('./logger');
const { mergeWithLogo } = require('./imageMerger');

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

  const fullPrompt = imageNegativePrompt
    ? `${imagePrompt}. Do NOT include: ${imageNegativePrompt}`
    : imagePrompt;

  logger.info(`מייצר תמונה | פרומפט: ${imagePrompt.slice(0, 100)}...`);

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

    const gardenBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
    const gardenMime = imagePart.inlineData.mimeType || 'image/png';
    logger.info(`תמונת גינה נוצרה | סוג: ${gardenMime} | גודל: ${Math.round(gardenBuffer.length / 1024)}KB`);

    // Merge with Ganan & Roses logo
    const merged = await mergeWithLogo(gardenBuffer, apiKey);
    return merged;

  } catch (err) {
    logger.warn(`יצירת תמונה נכשלה: ${err.message}`);
    return null;
  }
}

module.exports = { generateGardenImage };
