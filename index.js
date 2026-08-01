const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const app = express();
app.use(express.json());

const CHANNEL_ACCESS_TOKEN = 'K3+LJHogXahamPbqJlxkJ5AdU2Wt3ffPrxFqKvlOjzphJU7ONze6jOM6+HJBFCzdmO7JcQD3NwHEySFq7kNB1JvsiHdiFDJ0LakKTfNdjCj1SyjZEDRz74AwqemxErACr/niKdR3BdMDHqwcgAOnMwdB04t89/1O/w1cDnyilFU=';
const OWNER_LINE_ID = 'U395eb50e0c0b7fea4479b360e536bcd9';
const SHEET_ID = '1zrLnIxwuHK-qL3p9fTd3hW0BHGYB8GGcvOVZ7JZjTxU';

const PRODUCT = {
  name: '夏秋豐收綜合禮盒',
  desc: '蛋黃酥不加蛋*4顆、秋日黃金蘋果酥*3顆、仲夏檸檬派對酥*3顆',
  originalPrice: 850,
  comboQty: 6,
  comboPrice: 4900,
  bulkUnit: 14
};

const CHINESE_NUM = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '十一': 11, '十二': 12, '十三': 13, '十四': 14,
  '十五': 15, '二十': 20, '二十八': 28, '四十二': 42
};

function getCurrentPrice() {
  const now = new Date(new Date().toLocaleString('en', { timeZone: 'Asia/Taipei' }));
  const m = now.getMonth() + 1;
  const d = now.getDate();
  if (m === 8 || (m === 9 && d <= 1)) {
    return { label: '超早鳥價（8/1–9/1）', price: Math.round(PRODUCT.originalPrice * 0.9) };
  }
  if (m === 9 && d >= 2 && d <= 10) {
    return { label: '早鳥價（9/2–9/10）', price: Math.round(PRODUCT.originalPrice * 0.95) };
  }
  return { label: '定價', price: PRODUCT.originalPrice };
}

function getBulkPrice() {
  const { label, price } = getCurrentPrice();
  return { label: `大宗${label}再享9折`, price: Math.round(price * 0.9) };
}

function calcShipping(subtotal) {
  const cvs = subtotal >= 2026 ? '超商免運 🎉' : `超商 $65`;
  const home = subtotal >= 4000 ? '宅配免運 🎉' : `宅配 $150`;
  return { cvs, home };
}

function calcBulkShipping(boxes) {
  if (boxes >= 3) return 0;
  if (boxes === 2) return 200;
  return 150;
}

function toNum(str) {
  const n = parseInt(str);
  if (!isNaN(n)) return n;
  return CHINESE_NUM[str] || 0;
}

function parseQuantity(text) {
  const t = text.trim();

  // N箱 / 一箱
  const boxMatch = t.match(/^(\d+|[一二三四五六七八九十]+(?:[一二三四五六七八九]+)?)\s*箱$/);
  if (boxMatch) {
    const n = toNum(boxMatch[1]);
    if (n > 0) return { qty: n * PRODUCT.bulkUnit, boxes: n, isBulk: true };
  }

  // N盒 / 一盒
  const unitMatch = t.match(/^(\d+|[一二三四五六七八九十]+(?:[一二三四五六七八九]+)?)\s*盒$/);
  if (unitMatch) {
    const n = toNum(unitMatch[1]);
    if (n > 0) {
      const isBulk = n >= PRODUCT.bulkUnit && n % PRODUCT.bulkUnit === 0;
      const boxes = isBulk ? n / PRODUCT.bulkUnit : null;
      return { qty: n, boxes, isBulk };
    }
  }

  return null;
}

function buildGeneralQuote(qty) {
  const origPrice  = PRODUCT.originalPrice;
  const earlyPrice = Math.round(origPrice * 0.9);   // 超早鳥 $765
  const birdPrice  = Math.round(origPrice * 0.95);  // 早鳥 $808

  const isCombo = qty === PRODUCT.comboQty;

  let priceBlock, shippingBlock, hint = '';

  if (isCombo) {
    const comboOrig  = PRODUCT.comboPrice;                      // $4,900
    const comboEarly = Math.round(comboOrig * 0.9);             // $4,410
    const comboBird  = Math.round(comboOrig * 0.95);            // $4,655
    const saving     = origPrice * qty - comboOrig;

    priceBlock =
      `原價：$${comboOrig}（省 $${saving}）\n` +
      `⭐ 超早鳥（8/1–9/1）：$${comboEarly}\n` +
      `⭐ 早鳥（9/2–9/10）：$${comboBird}`;
    shippingBlock = `🚚 宅配免運 🎉`;
  } else {
    const origTotal  = origPrice * qty;
    const earlyTotal = earlyPrice * qty;
    const birdTotal  = birdPrice * qty;

    priceBlock =
      `原價：$${origPrice}/盒　→ $${origTotal}\n` +
      `⭐ 超早鳥（8/1–9/1）：$${earlyPrice}/盒　→ $${earlyTotal}\n` +
      `⭐ 早鳥（9/2–9/10）：$${birdPrice}/盒　→ $${birdTotal}`;

    // 用超早鳥價估運費（最優情境）
    const { cvs, home } = calcShipping(earlyTotal);
    shippingBlock = `${cvs} ／ ${home}`;

    if (qty < PRODUCT.comboQty) {
      const comboEarly = Math.round(PRODUCT.comboPrice * 0.9);
      hint = `\n💡 6盒特惠 $${PRODUCT.comboPrice}（超早鳥 $${comboEarly}），宅配免運`;
    }
  }

  return `🎑 2026中秋禮盒報價\n${PRODUCT.name}\n─────────────\n數量：${qty} 盒\n\n${priceBlock}\n─────────────\n運費：${shippingBlock}${hint}\n─────────────\n後續由我們專人為您服務 🙏`;
}

function buildBulkQuote(qty, boxes) {
  const { label, price } = getBulkPrice();
  const subtotal = price * qty;
  const shipping = calcBulkShipping(boxes);
  const total = subtotal + shipping;
  const shippingText = shipping === 0 ? '免運 🎉' : `$${shipping}`;

  let hint = '';
  if (boxes === 1) hint = `\n💡 2箱運費 $100/箱，3箱以上免運`;
  else if (boxes === 2) hint = `\n💡 再+1箱即可免運，省 $200！`;

  return `🎑 大宗採購報價\n${PRODUCT.name}\n─────────────\n數量：${boxes} 箱（${qty} 盒）\n${label}：$${price}/盒\n小計：$${subtotal}\n運費：${shippingText}\n合計：$${total}${hint}\n─────────────\n後續由專人與您確認細節 🙏`;
}

const GENERAL_MSG = `一般訂購說明 🛍️

✅ 配送：7-11 / 全家 店到店
✅ 滿 $2,026 免運（未滿運費 $65）
✅ 滿 $1,000 可選貨到付款

━━━━━━━━━━━━

【2026中秋禮盒】
夏秋豐收綜合禮盒

蛋黃酥不加蛋 *4顆
秋日黃金蘋果酥 *3顆
仲夏檸檬派對酥 *3顆

原價：$850/盒

⭐ 超早鳥價（8/1–9/1）：$765/盒
⭐ 早鳥價（9/2–9/10）：$808/盒
🎁 6盒特惠價：$4,900（宅配免運）

━━━━━━━━━━━━

請告訴我們您需要的數量
（例如：4盒、5盒）😊`;

const BULK_MSG = `大宗採購說明 📦

✅ 整箱訂購，配送限中華郵政
✅ 超早鳥/早鳥價再享 9折

━━━━━━━━━━━━

【2026中秋禮盒】
夏秋豐收綜合禮盒

蛋黃酥不加蛋 *4顆
秋日黃金蘋果酥 *3顆
仲夏檸檬派對酥 *3顆

📦 箱規格：14盒／箱
⚠️ 需為整箱倍數，未達整箱無法成立

━━━━━━━━━━━━

💰 價格

超早鳥大宗（8/1–9/1）：$689/盒
早鳥大宗（9/2–9/10）：$727/盒
原價大宗：$765/盒

━━━━━━━━━━━━

🚚 運費

1箱 → $150
2箱 → $200（$100/箱）
3箱以上 → 免運 🎉

━━━━━━━━━━━━

請告訴我們您需要的箱數
（例如：1箱、2箱、3箱）😊`;

async function appendToSheet(row) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: '工作表1!A:H',
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] }
    });
  } catch (err) {
    console.error('❌ Sheet 寫入失敗：', err.message);
  }
}

async function lineReply(replyToken, text) {
  await axios.post('https://api.line.me/v2/bot/message/reply',
    { replyToken, messages: [{ type: 'text', text }] },
    { headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
  );
}

async function lineReplyMulti(replyToken, texts) {
  await axios.post('https://api.line.me/v2/bot/message/reply',
    { replyToken, messages: texts.map(text => ({ type: 'text', text })) },
    { headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
  );
}

async function lineReplyWithButtons(replyToken, text, buttons) {
  await axios.post('https://api.line.me/v2/bot/message/reply',
    {
      replyToken,
      messages: [{
        type: 'text',
        text,
        quickReply: {
          items: buttons.map(({ label, value }) => ({
            type: 'action',
            action: { type: 'message', label, text: value }
          }))
        }
      }]
    },
    { headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
  );
}

async function linePush(to, text) {
  await axios.post('https://api.line.me/v2/bot/message/push',
    { to, messages: [{ type: 'text', text }] },
    { headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
  );
}

// ── 狀態管理 ──────────────────────────────────────
const sessions = new Map();
const SESSION_TIMEOUT = 30 * 60 * 1000;

function getSession(userId) {
  const s = sessions.get(userId);
  if (!s) return null;
  if (Date.now() - s.updatedAt > SESSION_TIMEOUT) { sessions.delete(userId); return null; }
  return s;
}
function setSession(userId, data) {
  sessions.set(userId, { ...data, updatedAt: Date.now() });
}

const CONFIRM_WORDS = /^(確認|對|會|是|yes)$/i;
const DATES = { '超商 9/1–9/6': '9/1–9/6', '超商 9/7–9/13': '9/7–9/13', '超商 9/14–9/21': '9/14–9/21',
                '宅配 9/1–9/6': '9/1–9/6', '宅配 9/7–9/13': '9/7–9/13', '宅配 9/14–9/21': '9/14–9/21' };

const CONFIRM_QUESTION = `確認訂單嗎？\n（回覆：確認 ／ 對 ／ 會 ／ 是 ／ Yes）`;

const DELIVERY_BUTTONS = [
  { label: '超商（7-11／全家）$65', value: '超商' },
  { label: '宅配（中華郵政）$150',  value: '宅配' }
];

// CONFIRM 狀態：等客人說確認
async function stepConfirm(text, userId, replyToken, session) {
  const parsed = parseQuantity(text);
  if (parsed) {
    const { qty, boxes, isBulk } = parsed;
    const msg = isBulk ? buildBulkQuote(qty, boxes) : buildGeneralQuote(qty);
    setSession(userId, { state: 'CONFIRM', qty, boxes, isBulk });
    await lineReplyMulti(replyToken, [msg, CONFIRM_QUESTION]);
    return;
  }
  if (!CONFIRM_WORDS.test(text)) return;
  setSession(userId, { ...session, state: 'DELIVERY' });
  await lineReplyWithButtons(replyToken, '請選擇配送方式 🚚', DELIVERY_BUTTONS);
}

// DELIVERY 狀態：客人點按鈕選配送
async function stepDelivery(text, userId, replyToken, session) {
  let deliveryType;
  if (text.includes('超商')) deliveryType = '超商';
  else if (text.includes('宅配')) deliveryType = '宅配';
  else { await lineReplyWithButtons(replyToken, '請選擇配送方式 😊', DELIVERY_BUTTONS); return; }

  setSession(userId, { ...session, state: 'DATE', deliveryType });

  const freeNote = deliveryType === '超商' ? '（滿$2,026免運）' : '（滿$4,000免運）';
  await lineReplyWithButtons(replyToken,
    `配送：${deliveryType} ✅\n\n請選擇出貨日期 📦`,
    [
      { label: '9/1–9/6',   value: `${deliveryType} 9/1–9/6` },
      { label: '9/7–9/13',  value: `${deliveryType} 9/7–9/13` },
      { label: '9/14–9/21', value: `${deliveryType} 9/14–9/21` }
    ]
  );
}

// DATE 狀態：客人點按鈕選日期
async function stepDate(text, userId, replyToken, session) {
  const dateChoice = DATES[text];
  if (!dateChoice) {
    await lineReplyWithButtons(replyToken, '請選擇出貨日期 😊', [
      { label: '9/1–9/6',   value: `${session.deliveryType} 9/1–9/6` },
      { label: '9/7–9/13',  value: `${session.deliveryType} 9/7–9/13` },
      { label: '9/14–9/21', value: `${session.deliveryType} 9/14–9/21` }
    ]);
    return;
  }

  setSession(userId, { ...session, state: 'INFO', dateChoice });
  const infoPrompt = session.deliveryType === '超商'
    ? `出貨日期：${dateChoice} ✅\n\n超商資訊\n─────────────\n姓名：\n電話：\n超商店名：（請註明全家或 7-11）`
    : `出貨日期：${dateChoice} ✅\n\n郵寄資訊\n─────────────\n姓名：\n電話：\n住址：`;
  await lineReply(replyToken, infoPrompt);
}

// INFO 狀態：解析收件資料 → 寫入 Sheet
async function stepInfo(text, userId, replyToken, session) {
  const info = {};
  for (const line of text.split('\n')) {
    const t = line.trim();
    const val = t.replace(/.*[：:]\s*/, '').trim();
    if (/姓名/.test(t))        info.name = val;
    if (/電話/.test(t))        info.phone = val;
    if (/超商店名|住址/.test(t)) info.location = val;
  }

  const missing = [];
  if (!info.name)     missing.push('姓名');
  if (!info.phone)    missing.push('電話');
  if (!info.location) missing.push(session.deliveryType === '超商' ? '超商店名' : '住址');

  if (missing.length > 0) {
    await lineReply(replyToken, `以下欄位未填，請補充 😊\n\n${missing.map(m => `• ${m}`).join('\n')}`);
    return;
  }

  const { qty, isBulk, deliveryType, dateChoice } = session;
  const time = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

  await appendToSheet([time, isBulk ? '大宗' : '一般', `${qty}盒`, deliveryType, dateChoice, info.name, info.phone, info.location]);

  await linePush(OWNER_LINE_ID,
    `🔔 新訂單！請確認金額\n━━━━━━━━━━━━\n` +
    `數量：${qty}盒\n配送：${deliveryType}\n出貨：${dateChoice}\n` +
    `收件：${info.name}　${info.phone}\n地址/門市：${info.location}\n━━━━━━━━━━━━\n` +
    `⚠️ 請確認最終金額（含運費）後聯繫客人`
  );

  await lineReply(replyToken,
    `✅ 訂單已收到！\n\n數量：${qty}盒\n配送：${deliveryType}\n出貨日期：${dateChoice}\n收件人：${info.name}\n\n` +
    `我們將確認最終金額（含運費）後與您聯繫 🙏`
  );

  sessions.delete(userId);
}

// ── Webhook ───────────────────────────────────────
app.get('/', (req, res) => res.send('vEGGzoo Mid-Autumn Bot is running!'));

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const events = req.body.events || [];
  for (const event of events) {
    if (event.type !== 'message' || event.message.type !== 'text') continue;
    const text = event.message.text.trim();
    const userId = event.source.userId;
    const replyToken = event.replyToken;

    try {
      const session = getSession(userId);

      if (session?.state === 'CONFIRM')  { await stepConfirm(text, userId, replyToken, session); continue; }
      if (session?.state === 'DELIVERY') { await stepDelivery(text, userId, replyToken, session); continue; }
      if (session?.state === 'DATE')     { await stepDate(text, userId, replyToken, session); continue; }
      if (session?.state === 'INFO')     { await stepInfo(text, userId, replyToken, session); continue; }

      // 預設：解析數量 → 報價 + 問確認
      const parsed = parseQuantity(text);
      if (!parsed) continue;

      const { qty, boxes, isBulk } = parsed;
      const msg = isBulk ? buildBulkQuote(qty, boxes) : buildGeneralQuote(qty);
      setSession(userId, { state: 'CONFIRM', qty, boxes, isBulk });

      await lineReplyMulti(replyToken, [msg, CONFIRM_QUESTION]);
      await linePush(OWNER_LINE_ID, `🔔 自動報價\n${isBulk ? `${boxes}箱（${qty}盒）` : `${qty}盒`}\n已發送給客人`);

    } catch (e) { console.error(e); }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
