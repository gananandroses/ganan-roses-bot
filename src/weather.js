const axios = require('axios');
const logger = require('./logger');

// Israeli regions: {name, lat, lon}
const REGIONS = {
  north:  { name: 'צפון',        lat: 32.80, lon: 35.00 }, // Haifa
  center: { name: 'מרכז',        lat: 32.09, lon: 34.78 }, // Tel Aviv
  south:  { name: 'דרום',        lat: 31.25, lon: 34.79 }, // Beer Sheva
  east:   { name: 'בקעה/ערבה',  lat: 32.50, lon: 35.50 }, // Beit She'an Valley
};

async function fetchTemp(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=Asia%2FJerusalem`;
  const res = await axios.get(url, { timeout: 8000 });
  return Math.round(res.data.current.temperature_2m);
}

async function getIsraelWeather() {
  try {
    const [north, center, south, east] = await Promise.all([
      fetchTemp(REGIONS.north.lat,  REGIONS.north.lon),
      fetchTemp(REGIONS.center.lat, REGIONS.center.lon),
      fetchTemp(REGIONS.south.lat,  REGIONS.south.lon),
      fetchTemp(REGIONS.east.lat,   REGIONS.east.lon),
    ]);
    logger.info(`מזג אוויר: צפון ${north}° | מרכז ${center}° | דרום ${south}° | מזרח ${east}°`);
    return { north, center, south, east };
  } catch (err) {
    logger.warn(`לא הצלחנו לקבל מזג אוויר: ${err.message}`);
    return null;
  }
}

module.exports = { getIsraelWeather };
