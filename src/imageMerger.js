const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.jpeg');

async function mergeWithLogo(gardenBuffer, apiKey) {
  if (!fs.existsSync(LOGO_PATH)) {
    logger.warn('לוגו לא נמצא — שולח תמונת גינה בלבד');
    return { buffer: gardenBuffer, mimeType: 'image/png' };
  }

  const logoBase64 = fs.readFileSync(LOGO_PATH).toString('base64');
  const gardenBase64 = gardenBuffer.toString('base64');

  logger.info('ממזג תמונת גינה עם לוגו גנן אנד רוזס...');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `Take the first image (a garden scene) as the main background.
Place the second image (the Ganan & Roses mascot logo) in the bottom-right corner of the garden image.
The mascot should be sized at about 30-35% of the image height, clearly visible, keeping its original cartoon illustration style intact.
Do not distort or change the mascot character.
Blend the edges naturally with the garden background.
Output a single merged photorealistic + cartoon composite image.`
              },
              { inlineData: { mimeType: 'image/png', data: gardenBase64 } },
              { inlineData: { mimeType: 'image/jpeg', data: logoBase64 } }
            ]
          }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
        })
      }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(JSON.stringify(data.error || data));
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imagePart) {
      throw new Error('לא התקבלה תמונה ממוזגת');
    }

    const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
    const mimeType = imagePart.inlineData.mimeType || 'image/png';
    logger.info(`תמונה ממוזגת | גודל: ${Math.round(buffer.length / 1024)}KB`);
    return { buffer, mimeType };

  } catch (err) {
    logger.warn(`מיזוג נכשל: ${err.message} — שולח תמונת גינה בלבד`);
    return { buffer: gardenBuffer, mimeType: 'image/png' };
  }
}

module.exports = { mergeWithLogo };
