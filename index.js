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
  comboQty: 5,
  comboPrice: 3700,
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
  return subtotal >= 2026 ? 0 : 65;
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

  // 純數字（1–99）→ 視為盒數
  const numOnly = t.match(/^(\d+)$/);
  if (numOnly) {
    const n = parseInt(numOnly[1]);
    if (n >= 1 && n <= 99) {
      const isBulk = n >= PRODUCT.bulkUnit && n % PRODUCT.bulkUnit === 0;
      return { qty: n, boxes: isBulk ? n / PRODUCT.bulkUnit : null, isBulk };
    }
  }

  return null;
}

function buildGeneralQuote(qty) {
  const { label, price } = getCurrentPrice();
  const isCombo = qty === PRODUCT.comboQty;
  const subtotal = isCombo ? PRODUCT.comboPrice : price * qty;
  const shipping = calcShipping(subtotal);
  const total = subtotal + shipping;
  const shippingText = shipping === 0 ? '免運 🎉' : `$${shipping}`;

  const priceRow = isCombo
    ? `5盒特惠價：$${PRODUCT.comboPrice}`
    : `${label}：$${price}/盒\n小計：$${subtotal}`;

  let hint = '';
  if (!isCombo && qty < PRODUCT.comboQty) {
    const saving = price * PRODUCT.comboQty - PRODUCT.comboPrice;
    hint = `\n💡 5盒特惠 $${PRODUCT.comboPrice}（比單買省 $${saving}）`;
  }

  return `🎑 2026中秋禮盒報價\n${PRODUCT.name}\n─────────────\n數量：${qty} 盒\n${priceRow}\n運費：${shippingText}\n合計：$${total}${hint}\n─────────────\n後續由我們專人為您服務 🙏`;
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
🎁 5盒特惠價：$3,700

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
      range: '工作表1!A:F',
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

async function linePush(to, text) {
  await axios.post('https://api.line.me/v2/bot/message/push',
    { to, messages: [{ type: 'text', text }] },
    { headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
  );
}

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
      const parsed = parseQuantity(text);
      if (!parsed) continue;

      const { qty, boxes, isBulk } = parsed;
      const msg = isBulk ? buildBulkQuote(qty, boxes) : buildGeneralQuote(qty);

      await lineReply(replyToken, msg);
      await linePush(OWNER_LINE_ID, `🔔 自動報價\n${isBulk ? `${boxes}箱（${qty}盒）` : `${qty}盒`}\n已發送給客人`);

      const time = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      await appendToSheet([time, isBulk ? '大宗' : '一般', qty, isBulk ? boxes : '', getCurrentPrice().price, '待人工確認']);

    } catch (e) { console.error(e); }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
