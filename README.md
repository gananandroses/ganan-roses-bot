# 🌹 גנן אנד רוזס — WhatsApp Daily Tip Bot

בוט אוטומטי ששולח טיפ גינון יומי לקבוצת ווטסאפ בכל יום בשעה 11:00 (שעון ישראל).
הטיפ מיוצר על ידי Claude AI ומותאם לעונה ולאקלים הישראלי.

---

## מבנה הפרויקט

```
ganan-roses-bot/
├── .env.example          ← הגדרות נדרשות
├── .env                  ← הגדרות אישיות (לא מועלות ל-Git)
├── .gitignore
├── package.json
├── index.js              ← נקודת כניסה — מפעיל את המתזמן
├── ecosystem.config.js   ← הגדרות PM2
├── src/
│   ├── scheduler.js      ← לוגיקת תזמון
│   ├── tipGenerator.js   ← יצירת טיפ עם Claude API
│   ├── whatsapp.js       ← שליחת הודעות עם Green API
│   ├── logger.js         ← לוגים יומיים
│   └── deduplication.js  ← מניעת חזרת טיפים
├── data/
│   └── tips_log.json     ← נוצר אוטומטית
├── logs/                 ← נוצר אוטומטית
├── fallback/
│   └── fallbackTips.js   ← 10 טיפים גיבוי
└── scripts/
    └── testFull.js       ← בדיקת pipeline מלא
```

---

## שלב 1: קבלת credentials מ-Green API

1. היכנסו לאתר [green-api.com](https://green-api.com)
2. הירשמו לחשבון חינמי (200 הודעות/חודש לבדיקות)
3. לחצו על **"Create instance"** ובחרו **"Developer"** (חינמי)
4. סרקו את קוד ה-QR עם הווטסאפ שלכם (כמו WhatsApp Web)
5. לאחר החיבור, תקבלו:
   - `idInstance` — מספר הinstance שלכם
   - `apiTokenInstance` — הטוקן הסודי

---

## שלב 2: מציאת chatId של קבוצת ווטסאפ

### אפשרות א׳ — דרך ה-API של Green API:
```bash
curl "https://api.green-api.com/waInstance{YOUR_INSTANCE_ID}/getChats/{YOUR_TOKEN}"
```
חפשו בתוצאה את שם הקבוצה שלכם — ה-`id` שלה הוא ה-`chatId`.

### אפשרות ב׳ — דרך ה-Dashboard:
1. היכנסו לפאנל של Green API
2. לחצו על **"API"** ← **"getChats"**
3. לחצו **"Execute"**
4. מצאו את הקבוצה שלכם ברשימה וצלמו את ה-`id`

**פורמט chatId לקבוצה:** `972501234567-1234567890@g.us`
**פורמט chatId לאדם:** `972501234567@c.us`

---

## שלב 3: הגדרת קובץ .env

```bash
cp .env.example .env
```

פתחו את `.env` ומלאו:

```env
ANTHROPIC_API_KEY=sk-ant-...
GREEN_API_INSTANCE_ID=1234567890
GREEN_API_TOKEN=abc123def456...
TARGET_GROUP_CHAT_ID=972501234567-1234567890@g.us
OWNER_PHONE=972501234567@c.us
TIMEZONE=Asia/Jerusalem
LOG_LEVEL=info
```

---

## שלב 4: התקנת dependencies

```bash
cd ganan-roses-bot
npm install
```

---

## שלב 5: בדיקות

### בדיקת יצירת טיפ בלבד (ללא שליחה):
```bash
npm run test:tip
```

### בדיקת שליחת הודעה לווטסאפ (הודעת בדיקה):
```bash
npm run test:send
```

### בדיקת pipeline מלא — יוצר טיפ ושולח עכשיו:
```bash
npm run test:full
```

---

## שלב 6: הפעלה

### הפעלה רגילה (לבדיקות):
```bash
npm start
```

### הפעלה עם PM2 (מומלץ — רץ ברקע ומתחיל מחדש אוטומטית):

```bash
# התקנת PM2 (פעם אחת):
npm install -g pm2

# הפעלת הבוט:
pm2 start ecosystem.config.js

# הוספה לאתחול אוטומטי של המחשב:
pm2 startup
pm2 save

# פקודות שימושיות:
pm2 status                    # מצב הבוט
pm2 logs ganan-roses-bot      # לוגים בזמן אמת
pm2 restart ganan-roses-bot   # הפעלה מחדש
pm2 stop ganan-roses-bot      # עצירה
pm2 delete ganan-roses-bot    # מחיקה מ-PM2
```

---

## לוגים

- לוגים יומיים: `logs/YYYY-MM-DD.log`
- לוג PM2 output: `logs/pm2-out.log`
- לוג PM2 errors: `logs/pm2-error.log`
- רשומות טיפים: `data/tips_log.json`

---

## טיפים מוכנים (Fallback)

אם Claude API לא זמין, הבוט ישתמש ב-10 טיפים מוכנים מ-`fallback/fallbackTips.js`.

---

## דרישות מערכת

- Node.js 18 ומעלה
- חיבור לאינטרנט
- חשבון Green API פעיל עם WhatsApp מחובר
- מפתח Anthropic API

---

## הפעלה על שרת Ubuntu

```bash
# התקנת Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# שיכפול ורצה
git clone <your-repo>
cd ganan-roses-bot
npm install
cp .env.example .env
nano .env  # מלאו את הפרטים

# הפעלה עם PM2
npm install -g pm2
pm2 start ecosystem.config.js
pm2 startup systemd
pm2 save
```

---

_🌹 גנן אנד רוזס — טיפול מקצועי בגינות, עצי פרי, וגינות מרפסת_
