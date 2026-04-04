const dotenvPath = require('path').join(__dirname, '..', '.env');
require('dotenv').config({ path: dotenvPath });
if (!process.env.ANTHROPIC_API_KEY) {
  const fs = require('fs');
  if (fs.existsSync(dotenvPath)) {
    const lines = fs.readFileSync(dotenvPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] = match[2].trim();
    }
  }
}

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { format } = require('date-fns-tz');
const logger = require('./logger');
const fallbackTips = require('../fallback/fallbackTips');
const { checkDuplicate, getRecentTipTexts, recordTip } = require('./deduplication');
const { getIsraelWeather } = require('./weather');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Seasons ───────────────────────────────────────────────────────────────────
function getIsraeliSeason(month) {
  if (month >= 12 || month <= 2) return 'חורף';
  if (month >= 3 && month <= 5) return 'אביב';
  if (month >= 6 && month <= 8) return 'קיץ';
  return 'סתיו';
}

// ── Time-based greeting ───────────────────────────────────────────────────────
function getGreeting(hour) {
  if (hour < 12) return 'בוקר טוב ☀️';
  if (hour < 17) return 'צהריים טובים ☀️';
  return 'ערב טוב 🌙';
}

// ── Growing conditions — rotated daily ───────────────────────────────────────
const GROWING_CONDITIONS = [
  'גינה פתוחה - שמש מלאה (6+ שעות)',
  'גינה פתוחה - חצי שמש / חצי צל',
  'גינה פתוחה - צל מלא',
  'אדניות בחוץ - מרפסת / גג / חצר',
  'אדניות בפנים - אור עקיף',
  'קרקע כבדה / חרסיתית',
  'קרקע קלה / חולית',
  'גינה אנכית / קירות ירוקים',
];
function getDayCondition() {
  return GROWING_CONDITIONS[randomInt(0, GROWING_CONDITIONS.length - 1)];
}

// ── Domain map ────────────────────────────────────────────────────────────────
const DOMAIN_MAP = [
  '', // 0 unused
  'קרקע ופיזיולוגיה של שורשים',           // 1-7
  'קרקע ופיזיולוגיה של שורשים',
  'קרקע ופיזיולוגיה של שורשים',
  'קרקע ופיזיולוגיה של שורשים',
  'קרקע ופיזיולוגיה של שורשים',
  'קרקע ופיזיולוגיה של שורשים',
  'קרקע ופיזיולוגיה של שורשים',
  'מזיקים ומחלות - זיהוי מוקדם ומניעה',  // 8-14
  'מזיקים ומחלות - זיהוי מוקדם ומניעה',
  'מזיקים ומחלות - זיהוי מוקדם ומניעה',
  'מזיקים ומחלות - זיהוי מוקדם ומניעה',
  'מזיקים ומחלות - זיהוי מוקדם ומניעה',
  'מזיקים ומחלות - זיהוי מוקדם ומניעה',
  'מזיקים ומחלות - זיהוי מוקדם ומניעה',
  'השקיה ויעילות מים בתנאי שינוי אקלים', // 15-21
  'השקיה ויעילות מים בתנאי שינוי אקלים',
  'השקיה ויעילות מים בתנאי שינוי אקלים',
  'השקיה ויעילות מים בתנאי שינוי אקלים',
  'השקיה ויעילות מים בתנאי שינוי אקלים',
  'השקיה ויעילות מים בתנאי שינוי אקלים',
  'השקיה ויעילות מים בתנאי שינוי אקלים',
  'דישון טבעי וביולוגי',                  // 22-28
  'דישון טבעי וביולוגי',
  'דישון טבעי וביולוגי',
  'דישון טבעי וביולוגי',
  'דישון טבעי וביולוגי',
  'דישון טבעי וביולוגי',
  'דישון טבעי וביולוגי',
  'תכנון מיקרו-אקלים (צל, חום, רוח)',    // 29-35
  'תכנון מיקרו-אקלים (צל, חום, רוח)',
  'תכנון מיקרו-אקלים (צל, חום, רוח)',
  'תכנון מיקרו-אקלים (צל, חום, רוח)',
  'תכנון מיקרו-אקלים (צל, חום, רוח)',
  'תכנון מיקרו-אקלים (צל, חום, רוח)',
  'תכנון מיקרו-אקלים (צל, חום, רוח)',
  'גידול בכלים ואדניות',                  // 36-42
  'גידול בכלים ואדניות',
  'גידול בכלים ואדניות',
  'גידול בכלים ואדניות',
  'גידול בכלים ואדניות',
  'גידול בכלים ואדניות',
  'גידול בכלים ואדניות',
  'צמחי מאכל עונתיים - טכניקות מתקדמות', // 43-50
  'צמחי מאכל עונתיים - טכניקות מתקדמות',
  'צמחי מאכל עונתיים - טכניקות מתקדמות',
  'צמחי מאכל עונתיים - טכניקות מתקדמות',
  'צמחי מאכל עונתיים - טכניקות מתקדמות',
  'צמחי מאכל עונתיים - טכניקות מתקדמות',
  'צמחי מאכל עונתיים - טכניקות מתקדמות',
  'צמחי מאכל עונתיים - טכניקות מתקדמות',
];

// ── Wildcard words ────────────────────────────────────────────────────────────
const WILDCARD_WORDS = [
  'מיקרואורגניזמים','שכבות','ריח','שורשים','טמפרטורת קרקע',
  'לחות אוויר','צבע עלים','מחזור חיים','תחרות','סימביוזה',
  'רעילות','פולשני','עמידות','פרייה','ניקוז',
  'חיידקים','פטריות','חרקים מועילים','אבקה','זרעים',
  'גיזום','התרבות וגטטיבית','הרכבה','שינוי pH','מינרלים',
  'מולץ','קומפוסט','ביוצ\'אר','קליטה','הלם שתילה',
  'גדילה איטית','התפשטות','עונת מנוחה','הצצה','פריחה',
  'הבשלה','קציר','שימור','זנים עתיקים','הכלאות',
  'גידול אנכי','גינה אכילה','גינה בצל','גג ירוק','גינה בחלון',
  'מיכל ממוחזר','השקיה טפטוף','אולה','גשם מי גג','קומפוסט תולעים',
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `אתה "גנן אנד רוזס" – אוטוריטה בגינון ונוף בישראל.
אתה כותב הודעות וואטסאפ קצרות שמרגישות כאילו נשלחו מהשטח.
מקצוען, חברי וישיר. לא מרצה. לא כותב ניוזלטר.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
שיטת התוכן — גיוון מקסימלי
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
בכל הודעה — בחר נושא אחד מתוך עולם הגינון הענק.
אל תינעל על נושא אחד. תפתיע בכל פעם בזווית אחרת:

• השקיה ותשתית: מחשבי Galcon/Baccara, טפטפות, לחץ מים, נזילות נסתרות, פילטרים, אבנית
• בריאות הצמח ומזיקים: מנהדר (Citrus Leafminer), כנימות, חילדון/פיתיום בדשא, עלים מסתלסלים
• עצי פרי: תזמון גיזום, דישון עונתי, נשירת פרות, צרכי השקיה לפי מין
• נוי ופרחים: מה פורח עכשיו במשתלות, שמש מול צל, חלונות שתילה עונתיים
• תחזוקה: טכניקות גיזום, אוורור קרקע, סוגי מולצ' (טאף/שבבי עץ), ניהול חמרה ומצע שתילה
• תאורה ותשתיות חשמל חיצוניות, ריצוף, דשא סינתטי

כל הודעה צריכה לגעת בפינה אחרת של עולם הגינה.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
סגנון הכתיבה — הדוגמה הטובה ביותר
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
כתוב בדיוק כמו הדוגמה הזו — זה הסטנדרט:

"יצא לי לראות היום בגינה של לקוחה תופעה שחוזרת על עצמה המון – אדמה שהפכה פשוט ל*'בלוק'*.
כשאתם שותלים באדמה כבדה, במיוחד באזורים של חצי צל שבהם האדמה נשארת לחה יותר זמן, נוצרות עם השנים שכבות אטומות. השורשים פשוט נחנקים; הם נשארים רדודים למעלה כי המים וחומרי הדישון לא מצליחים לחלחל לעומק. התוצאה? הצמח הופך להיות רגיש לכל חמסין קטן כי אין לו 'עוגן' עמוק באדמה.
מה עושים? פעם בשנה-שנתיים, קחו קלשון ותנו לאדמה 'נשימה'. תנעצו אותו לעומק של 30-40 ס"מ מסביב לצמחים הוותיקים ופשוט תפתחו את הקרקע. אל תפחדו 'להכניס סכין' לאדמה – שבירת השכבות האלה מאפשרת לאוויר ולמים לרדת למטה, ומכריחה את השורשים להעמיק. צמח עם שורש עמוק הוא צמח חזק ששורד הכל.
גנן אנד רוזס 🌹"

מה שהופך אותה לטובה — חובה לשכפל:
- פתיח עם תצפית שטח ספציפית: "יצא לי לראות היום בגינה של לקוחה תופעה שחוזרת..."
- מונח מפתח מודגש: *'בלוק'* — מילה אחת שמסכמת הכל
- מנגנון הבעיה: מסביר למה זה קורה ומה התוצאה — לא רק מה לעשות
- "התוצאה?" — שאלה רטורית שמחדדת את הכאב
- "מה עושים?" — מעבר חד לפעולה
- מידות ספציפיות: "30-40 ס"מ"
- מטאפורות שטח: 'נשימה', 'עוגן', 'להכניס סכין'
- עידוד להעז: "אל תפחדו"
- עיקרון סוגר: "צמח עם שורש עמוק הוא צמח חזק ששורד הכל" — משפט שנשאר

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
חוקי הכתיבה — חובה
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. פתיח עם תצפית שטח — תמיד סצנה ספציפית מהיום:
   "יצא לי לראות היום..." / "הייתי הבוקר אצל לקוח ו..." / "נתקלתי בזה שלוש פעמים השבוע..."
   "עבדתי היום על גינה ו..." / "שאלה שחזרה אלי כמה פעמים בשבוע האחרון..."
   כל פתיח חייב להיות שונה — אל תחזור על אותו מבנה פעמיים.

2. מנגנון הבעיה לפני הפתרון — הסבר למה זה קורה ומה התוצאה, רק אחר כך מה לעשות.
   השתמש ב"התוצאה?" / "למה זה קורה?" כשאלות רטוריות שמחדדות.

3. מונח מפתח מודגש — *'בלוק'*, *'נחנק'*, *'להגמיע'* — מילה אחת שמסכמת הבעיה.

4. "מה עושים?" — מעבר חד לחלק הפעולה. פשוט, ברור, עם כלי ספציפי:
   קלשון / מזמרה / גלקון / אוסמוקוט / קונפידור / גפרית מרוססת.
   מידות ריאליות: "30-40 ס"מ", "2 דקות", "פעם בשנה-שנתיים".

5. עיקרון סוגר — משפט אחרון שנשאר: לא עצה, אלא תובנה.
   "צמח עם שורש עמוק הוא צמח חזק ששורד הכל."

6. פיסוק חי — נקודה-פסיק (;) לקצב, מקף (–) להפתעה, שאלה רטורית לחידוד.

7. בלי קלישאות — לא "זה יחסוך לכם כסף", לא "הידעת?", לא "חשוב לדעת".

8. מבנה: 3 פסקאות בדיוק. בלי כותרות. בלי רשימות ממוספרות. מקסימום 1-2 אמוג'י.
   מזג אוויר — הקשר שקט בלבד, לא מספרים.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
דיוק ישראלי
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- מים ישראליים = קשים, סידן גבוה → אבנית סותמת טפטפות מהר
- אביב ישראלי = מעבר יבש, שעוני השקיה צריכים כיול מחדש
- קרקע ישראלית = לרוב חמרה דחוסה או אבן גיר
- כתוב רק מה שאתה בטוח 100% שעובד בתנאים ישראליים
- אל תציע: קליפות בננה, מי בישול, קרטון, קמח — רק פתרונות מקצועיים

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMAGE PROMPT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Match the image EXACTLY to what the tip describes. Not a generic garden photo.

SHOT TYPE by subject:
- Drippers/irrigation → close-up macro of the exact component
- Soil/roots → extreme close-up macro
- Pest/disease on leaves → close-up macro showing the pest clearly
- Fruit tree or shrub → natural perspective, in-ground, full plant visible
- Lawn → ground-level wide shot
- Balcony/planters → wide angle, sun-bleached Israeli tiled balcony
- Hardscape/pavers → wide angle, Israeli outdoor setting

LIGHTING by time of day:
- 06-09 → soft golden morning light, dew drops visible
- 09-12 → bright Mediterranean sunlight
- 12-15 → harsh overhead sun, strong shadows
- 15-18 → warm golden afternoon light

Always: photorealistic, Israeli/Mediterranean aesthetic, no text, no watermarks.
Never: European style, tropical look, undersized pot for a large tree.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
בדיקה עצמית לפני פלט
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
☐ נשמע כמו גנן ישראלי אמיתי — לא בוט, לא ניוזלטר?
☐ פתיח שונה מהפעם הקודמת?
☐ פרט ספציפי שרק פרו ישים לב אליו?
☐ פיסוק תקין שיוצר קצב קריאה?
☐ בלי קלישאות, בלי כותרות, בלי רשימות?
☐ עד 3 פסקאות קצרות?
☐ התמונה תואמת בדיוק את מה שכתוב בטיפ?

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POLL OPTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4 אפשרויות לטיפ הבא. שאלות גינון ספציפיות ואמיתיות — לא נושאים מעורפלים.
טקסט בלבד. בלי אמוג'י. בלי מספרים. תחום שונה מהיום.
רע: "למה העלים נופלים" | טוב: "אבנית בטפטפות - איך לזהות לפני שהצמח מתייבש"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — strict JSON only, nothing else
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "tip": "FULL MESSAGE in Hebrew — flowing text, correct punctuation, ends with גנן אנד רוזס 🌹",
  "poll_options": ["...", "...", "...", "..."],
  "image_prompt": "Photorealistic [SHOT TYPE] of [exact subject in English], [specific detail], [Israeli/Mediterranean setting], [lighting], no text, no watermarks",
  "image_negative_prompt": "cartoon, illustration, text, watermark, European garden, tropical, generic stock photo, cluttered, blurry, unrealistic scale"
}

No intro. No explanation. Only valid JSON.`;

// ── Generate tip + poll + image prompts ───────────────────────────────────────
async function generateTipAndPoll(winningTopic = null, retryCount = 0) {
  const tz = process.env.TIMEZONE || 'Asia/Jerusalem';
  const now = new Date();
  const dateStr = format(now, 'dd/MM/yyyy', { timeZone: tz });
  const timeStr = format(now, 'HH:mm', { timeZone: tz });
  const month = parseInt(format(now, 'M', { timeZone: tz }), 10);
  const hour = parseInt(format(now, 'H', { timeZone: tz }), 10);
  const season = getIsraeliSeason(month);
  const condition = getDayCondition();
  const num1 = randomInt(1, 50);
  const num2 = randomInt(1, 8);
  const wildcard = WILDCARD_WORDS[randomInt(0, WILDCARD_WORDS.length - 1)];
  const greeting = getGreeting(hour);
  const domain = winningTopic ? 'נקבע לפי הנושא המנצח' : DOMAIN_MAP[Math.min(num1, 50)];

  // Real weather
  const weatherData = await getIsraelWeather();
  if (weatherData) {
    logger.info(`מזג אוויר: צפון ${weatherData.north}° | מרכז ${weatherData.center}° | דרום ${weatherData.south}° | מזרח ${weatherData.east}°`);
  }
  const weatherLine = weatherData
    ? `צפון ${weatherData.north}° | מרכז ${weatherData.center}° | דרום ${weatherData.south}° | מזרח ${weatherData.east}°`
    : 'נתונים לא זמינים';

  // Last 7 tips for deduplication
  const recentTips = getRecentTipTexts(7);
  const recentBlock = recentTips.length > 0
    ? `\nטיפים שנשלחו ב-7 הימים האחרונים - אסור לחזור עליהם:\n` +
      recentTips.map((t, i) => `${i + 1}. ${t.slice(0, 120)}...`).join('\n')
    : '';

  const userPrompt =
    `תאריך: ${dateStr}\n` +
    `שעה: ${timeStr}\n` +
    `עונה: ${season}\n` +
    `ברכה לשעה: ${greeting}\n` +
    `מזג אוויר היום: ${weatherLine}\n` +
    `סיד אקראי 1-50: ${num1} → דומיין: ${domain}\n` +
    `סיד אקראי 1-8: ${num2} → תנאי גידול: ${condition}\n` +
    `מילת וויילדקארד: ${wildcard}\n` +
    `נושא מנצח מסקר: ${winningTopic || 'none - בחר לפי הסיד האקראי'}` +
    recentBlock +
    '\n\nצור JSON לפי הפורמט המוגדר. אל תחזור על נושאים, צמחים, או זוויות מהרשימה.';

  logger.info(`מייצר טיפ | עונה: ${season} | תנאי: ${condition} | wildcard: ${wildcard}${winningTopic ? ` | נושא: ${winningTopic}` : ''}`);

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        maxOutputTokens: 8000,
        temperature: 1.0,
        responseMimeType: 'application/json',
      },
    });

    const raw = result.response.text().trim();

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch {
      logger.warn('JSON parsing נכשל — fallback');
      return { tipText: getRandomFallback(), pollOptions: [], imagePrompt: '', imageNegativePrompt: '' };
    }

    const tipText = parsed.tip || '';
    const pollOptions = parsed.poll_options || [];
    const imagePrompt = parsed.image_prompt || '';
    const imageNegativePrompt = parsed.image_negative_prompt || '';

    if (checkDuplicate(tipText)) {
      logger.warn('טיפ דומה מדי — מנסה שוב');
      if (retryCount < 2) return generateTipAndPoll(winningTopic, retryCount + 1);
      return { tipText: getRandomFallback(), pollOptions: [], imagePrompt: '', imageNegativePrompt: '' };
    }

    logger.info('טיפ ופול נוצרו בהצלחה');
    return { tipText, pollOptions, imagePrompt, imageNegativePrompt };
  } catch (err) {
    logger.error(`שגיאה ב-Gemini API: ${err.message}`);
    return { tipText: getRandomFallback(), pollOptions: [], imagePrompt: '', imageNegativePrompt: '' };
  }
}

// Legacy wrapper
async function generateTip() {
  const { tipText } = await generateTipAndPoll();
  return tipText;
}

function getRandomFallback() {
  logger.info('משתמש בטיפ fallback');
  return fallbackTips[Math.floor(Math.random() * fallbackTips.length)];
}

module.exports = { generateTip, generateTipAndPoll, getRandomFallback };

if (require.main === module) {
  (async () => {
    const { tipText, pollOptions, imagePrompt } = await generateTipAndPoll();
    console.log('\n--- טיפ ---\n', tipText);
    console.log('\n--- סקר ---\n', pollOptions);
    console.log('\n--- פרומפט תמונה ---\n', imagePrompt);
  })();
}
