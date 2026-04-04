const logger = require('./logger');

async function generateGardenImage({ imagePrompt, imageNegativePrompt }) {
  if (!imagePrompt) {
    logger.warn('לא התקבל פרומפט לתמונה');
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('GEMINI_API_KEY לא הוגדר');
    return null;
  }

  // Gemini doesn't support a separate negative_prompt field — weave it into the prompt
  const fullPrompt = imageNegativePrompt
    ? `${imagePrompt}. Do NOT include: ${imageNegativePrompt}`
    : imagePrompt;

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
