const sharp = require('sharp');
const logger = require('./logger');

/**
 * Merges garden image (left/background) with character image (right side).
 * Returns a buffer of the merged image.
 */
async function mergeImages(gardenBuffer, characterBuffer) {
  try {
    // Get metadata of both images
    const gardenMeta = await sharp(gardenBuffer).metadata();
    const charMeta = await sharp(characterBuffer).metadata();

    const targetHeight = gardenMeta.height || 1024;
    const targetWidth = gardenMeta.width || 1024;

    // Resize character to ~40% of the garden image height, keep aspect ratio
    const charHeight = Math.round(targetHeight * 0.5);
    const charWidth = Math.round((charMeta.width / charMeta.height) * charHeight);

    const resizedChar = await sharp(characterBuffer)
      .resize(charWidth, charHeight, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();

    // Position: bottom-right corner with small margin
    const margin = 16;
    const left = targetWidth - charWidth - margin;
    const top = targetHeight - charHeight - margin;

    // Composite character over garden image
    const merged = await sharp(gardenBuffer)
      .composite([
        {
          input: resizedChar,
          left: Math.max(0, left),
          top: Math.max(0, top),
          blend: 'over',
        },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    logger.info(`תמונות מוזגו | גינה: ${targetWidth}x${targetHeight} | דמות: ${charWidth}x${charHeight}`);
    return merged;
  } catch (err) {
    logger.warn(`שגיאה במיזוג תמונות: ${err.message} — שולח תמונת גינה בלבד`);
    return gardenBuffer;
  }
}

module.exports = { mergeImages };
