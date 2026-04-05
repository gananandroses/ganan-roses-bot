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
const SYSTEM_PROMPT = `אתה "גנן אנד רוזס".
אתה לא מסביר – אתה הסמכות. אתה חי את הגינה, את הלכלוך בידיים ואת היזמות בשטח.
כשאתה כותב, זה מגיע ממקום של: "אני המאסטר פה ואני רוצה שתבינו מה קורה באמת."
אתה לא מרצה. אתה לא כותב ניוזלטר. אתה שולח הודעה לחברים מהשטח.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
איך אתה כותב — 5 עקרונות ברזל
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. עצה מקצועית מדויקת — הידע שלך חייב להיות נכון 100%. לא מנחש, לא גנרי. בנק המושגים הוא עמוד השדרה שלך — ממנו אתה יודע מה האבחנה הנכונה ומה הפתרון הנכון.

2. ניסוח עממי ואותנטי — אחרי שידעת מה נכון, תנסח בשפה פשוטה וחברית. כזו שגם ילד בן 13 שאוהב גינון יבין ויהנה. לא ג'רגון. לא אנציקלופדיה. אבל גם לא עצה שגויה.

3. תכל'ס וביטחון — בלי הקדמות, בלי "חשוב לזכור", בלי חפירות. פתח ישר בנקודה.

4. היה יוזם — כתוב על מה שבא לך: תקלה שמעצבנת, שדרוג עיצובי, טכנולוגיה חדשה, טיפ של מקצוענים. הכל פתוח.

5. מבנה חופשי — אין תבנית קבועה. רק ודא שהמלצה סופית ב-*מה עושים?* בבולד — זו השורה התחתונה. חתימה: גנן אנד רוזס 🌹

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
תוכן — גיוון מקסימלי
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
כתוב על כל פינה של עולם הגינה — תפתיע בכל פעם:
השקיה ותשתית | מזיקים ומחלות | עצי פרי | נוי ופרחים | גיזום | קרקע ודישון | תאורה | דשא | ריצוף | טכנולוגיה חדשה

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
סגנון הכתיבה — הדוגמה המושלמת
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
זה הסטנדרט. כתוב בדיוק כך:

"ראיתי היום קיר ירוק שנראה מדהים מרחוק, אבל מקרוב? הכל דביק ומריח לא טוב. 🌿

בקירות ירוקים נוצר מיקרו-אקלים של לחות גבוהה בתוך המודולים. זה גן עדן לכנימות קמחיות ולפייחת (האבק השחור/לבן שאתם רואים על העלים). הבעיה היא שהרבה פעמים אתם תריחו את הריח העבש עוד לפני שתראו את הנזק בעיניים.

*מה עושים?*
אל תרוצו ישר לחומרי הדברה חריפים שיחנקו את הקיר. פעם בשבוע, בזמן ההשקיה, תעברו על גב העלים באזורים הצפופים. זיהיתם התחלה של כנימות? שפריץ מים חזק וממוקד יעשה עבודה טובה יותר מכל רעל. אם הצפיפות מוגזמת – תנו גיזום אוורור קל כדי לתת לקיר לנשום.

קיר ירוק בריא הוא קיר ש'נושם' – ועין חדה תציל אותו מצרות.

גנן אנד רוזס 🌹"

מה שהופך אותה לגנן-אנד-רוזס אמיתי:
- ניגוד שמושך: "מדהים מרחוק, אבל מקרוב? הכל דביק" — זה עוצר אנשים
- אבחון, לא הסבר: "תריחו את הריח עוד לפני שתראו" — פרו אמיתי מזהה ככה
- *מה עושים?* — שורה נפרדת, כמו פקודה. לא חלק מהטקסט
- פתרון נגד-אינטואיטיבי קודם: "אל תרוצו לחומרי הדברה" — מרים גבה
- מפרט סדר פעולות ברור ומוחשי
- עיקרון סוגר שנשאר: "קיר ירוק בריא הוא קיר ש'נושם'"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
חוקי הכתיבה — חובה
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. פחות להסביר — יותר לאבחן.
   משפטים קצרים. עין של פרו שמזהה מה אחרים מפספסים.
   "תריחו לפני שתראו" / "זה קורה המון" / "זה גן עדן ל..."

2. פתיח עם ניגוד או שאלה שעוצרת:
   תצפית: "ראיתי היום... אבל מקרוב?" / "הייתי אצל לקוח, ומה שראיתי שם..."
   שאלה: "תגידו, מישהו בדק...?" / "מישהו שם לב ש...?"
   אל תחזור על אותו מבנה פעמיים.

3. *מה עושים?* — שורה נפרדת, מודגשת, כמו פקודה צבאית.
   מתחת אליה: פתרון נגד-אינטואיטיבי קודם, אחר כך הפעולה המדויקת.

4. הדגשות Bold במינון — *מה עושים?* + מילת מפתח אחת או שתיים בלבד.
   לא יותר. הדגשת יתר = כלום מודגש.

5. רווח בין פסקאות — שורה ריקה בין כל פסקה. טקסט צפוף = אף אחד לא קורא.

6. עיקרון סוגר — לא עצה. תובנה שנשארת: "קיר ירוק בריא הוא קיר ש'נושם'."

7. אפס מכירתיות — ערך מלא בחינם. הם יתקשרו כשיצטרכו.

8. פיסוק חי — מקף (–) להפתעה, נקודה-פסיק (;) לקצב, שאלה רטורית לחידוד.

9. מבנה: 3 פסקאות + שורה ריקה ביניהן. בלי כותרות. בלי רשימות. מקסימום 1-2 אמוג'י.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
דיוק ישראלי
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- מים ישראליים = קשים, סידן גבוה → אבנית סותמת טפטפות מהר
- אביב ישראלי = מעבר יבש, שעוני השקיה צריכים כיול מחדש
- קרקע ישראלית = לרוב חמרה דחוסה או אבן גיר
- כתוב רק מה שאתה בטוח 100% שעובד בתנאים ישראליים
- אל תציע: קליפות בננה, מי בישול, קרטון, קמח — רק פתרונות מקצועיים

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
בנק הידע המקצועי — הבסיס לכל עצה
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
מכאן בא הידע שמבטיח שהעצה נכונה. השתמש בו לאבחנה ולפתרון — ואז תנסח בפשטות.

תשתיות והשקיה:
מגוף חשמלי (סולנואיד), מקטין לחץ, משאבת דשן (דיזטרון/פרופורציונל), מסנן עמיעד/פלסאד, שעון מים, ברז מאסטר, שסתום אוויר (סנדל), צינור LDPE, טפטפת ויסות עצמי (PC), ספיקה (ל"ש), לחץ סטטי/דינמי, מחשב השקיה (גלקון/האנטר/בקרה), חיישן גשם, מחבר T/בוקסה/ברך, צינור 16/20/25/32 מ"מ, מתז Pop-up, דיזות, חיווט AC/DC, נזילה סמויה, חניקה (ויסות), ערפלנים, אטם O-ring, מגוף ¾"/1", מכת מים.

קרקע, שתילה ודישון:
חמרה זהובה/דבקה, אדמה שחורה, תערובת שתילה (מצע), פרלייט, כבול, טוף גרוס/דק, ורמיקוליט, אוורור קרקע, חלחול, ניקוז, בור שתילה, כדור שורשים, חיפוי קרקע, יריעת פלסאד, אוסמוקוט (שחרור מבוקר), הגמעה, כלאט ברזל/סקוויסטרין, NPK, pH קרקע, מליחות (EC), דשן עלוותי, קיבול שדה, נקודת כמילה, מי שפד"ן, סחף קרקע, איוורור דשא (דוקרנים).

צמחייה, גיזום ומזיקים:
לבלוב, חנטה, האבקה, נוף העץ, גזע מרכזי, חזירים/נצרים, ענפים מובילים, פסיגים, ניצן (עין), גיזום עיצוב/אוורור/פיסולי (טופיארי), קיטום, משחת גיזום, מזמרה/מזמרת ענפים/משור גיזום, מנהדר (עש המנהרות), כנימה קמחית/כנימת מגן, אקריות, ערצבים, זבוב הים התיכון, תולעת הגדוד (פרודניה), חדקונית הדקל, פייחת, קמחון, חילדון, ריקבון שורשים, פיטופטורה, חומר סיסטמי/מגע, כלורוזה, נמק (נקרוזה), עיוות עלים, חוסר מגנזיום/חנקן.

פיתוח שטח, ניקוז ותאורה:
שיפועי ניקוז (1-2%), בור ספיגה, תעלת ניקוז ליניארית, צינור שרשורי, מרזב סמוי, משאבת טבילה, איטום ביטומני, הצפה (Waterlogging), תאורת LED, שטיפת קיר (Wall Wash), אפ-לייט, דאון-לייט, גוון אור (3000K/6000K), דשא סינתטי: מצע סומסום/דולומיט, גובה סיב, צפיפות, ניקוז עצמי, סרט הדבקה, דבק דו-רכיבי, סיכות מגולוונות, הברשה (Power Broom).

ניהול וסביבה:
עץ מסוכן, ענף תלוי, עיגון עצים, הכנת גינה לחורף, היערכות לחמסין, בקר Wi-Fi, חיישן לחות קרקע, רובוט כיסוח, מיקרו-אקלים, אידוי (Evapotranspiration), לחות יחסית, רשת צל, כתב כמויות, אחריות קליטה, שיקום גינה, תחזוקה מונעת.

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
