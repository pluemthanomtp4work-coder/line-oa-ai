// LINE Messaging API — ตรวจลายเซ็น webhook, ตอบข้อความ, ดึงโปรไฟล์, อัปโหลด rich menu
// ไม่ใช้ @line/bot-sdk เพื่อให้ dependency เหลือ express ตัวเดียว (fetch มาในตัวของ Node 18+)
const crypto = require('crypto');
const store = require('./store');
const bot = require('./bot');

const API = 'https://api.line.me/v2/bot';
const DATA_API = 'https://api-data.line.me/v2/bot';
const token = () => process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const secret = () => process.env.LINE_CHANNEL_SECRET || '';
const configured = () => Boolean(token() && secret());

/**
 * ตรวจลายเซ็น x-line-signature — ต้องใช้ raw body (Buffer) ไม่ใช่ object ที่ parse แล้ว
 * JSON.stringify(req.body) ให้ byte ไม่ตรงของเดิม แล้วลายเซ็นไม่ผ่านแบบหาสาเหตุไม่เจอ
 * timingSafeEqual โยน error ถ้าความยาวไม่เท่า → ต้องเช็ค length ก่อนทุกครั้ง
 */
function verify(rawBody, signature) {
  if (!secret()) return false;
  const expect = crypto.createHmac('sha256', secret()).update(rawBody).digest('base64');
  const a = Buffer.from(expect);
  const b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function call(path, body, method = 'POST', base = API) {
  const res = await fetch(base + path, {
    method,
    headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LINE ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

const replyText = (replyToken, text) =>
  call('/message/reply', { replyToken, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] });
const pushText = (to, text) =>
  call('/message/push', { to, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] });
const profile = (userId) => call('/profile/' + encodeURIComponent(userId), undefined, 'GET');
const quota = () => call('/message/quota', undefined, 'GET');
const quotaUsed = () => call('/message/quota/consumption', undefined, 'GET');

// ---------- rich menu ----------
const listRichMenus = () => call('/richmenu/list', undefined, 'GET');
const createRichMenu = (obj) => call('/richmenu', obj);
const deleteRichMenu = (id) => call('/richmenu/' + encodeURIComponent(id), undefined, 'DELETE');
const setDefaultRichMenu = (id) => call('/user/all/richmenu/' + encodeURIComponent(id), undefined, 'POST');

// รูป rich menu ต้องเป็น image/png หรือ jpeg และขนาดต้องตรงสเปกเป๊ะ (2500x1686 หรือ 2500x843)
// ไม่งั้น LINE ปฏิเสธทั้งชุด แล้วเมนูที่สร้างไว้จะค้างเป็นเมนูเปล่า
async function uploadRichMenuImage(id, buf, mime) {
  const res = await fetch(`${DATA_API}/richmenu/${encodeURIComponent(id)}/content`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token(), 'content-type': mime || 'image/png' },
    body: buf,
  });
  if (!res.ok) throw new Error(`LINE upload ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/**
 * ดึง/สร้างผู้ใช้ในตารางของเรา — "ผู้ใช้ทั้งหมด" ในหน้า Dashboard นับจากตารางนี้เท่านั้น
 * (นับจาก aiLogs จะได้แค่คนที่คุยในช่วงนั้น ไม่ใช่คนที่แอดบอทไว้ทั้งหมด)
 */
async function touchUser(userId) {
  const now = new Date().toISOString();
  const users = await store.read('users').catch(() => []);
  const found = users.find((u) => u.lineUserId === userId);
  if (found) {
    await store.update('users', found.id, { lastSeen: now });
    return { ...found, lastSeen: now };
  }
  let name = userId.slice(0, 8);
  let picture = null;
  try { const p = await profile(userId); name = p.displayName || name; picture = p.pictureUrl || null; }
  catch (e) { /* โปรไฟล์ดึงไม่ได้ (ยังไม่ได้เพิ่มเพื่อน/บล็อก) — ยังสร้างผู้ใช้ต่อได้ */ }
  return store.upsertBy('users', 'lineUserId', userId, {
    displayName: name, pictureUrl: picture, role: 'guest',
    perms: { chat: true, files: false, image: false }, blocked: false, lastSeen: now,
  });
}

/** จัดการ webhook หนึ่งก้อน — ต้องไม่ throw ออกไป ไม่งั้น LINE จะรีลองซ้ำๆ */
async function handleEvents(events) {
  for (const ev of events || []) {
    try {
      const userId = ev.source && ev.source.userId;
      if (!userId) continue;
      const user = await touchUser(userId);

      if (ev.type === 'follow') {
        await replyText(ev.replyToken, 'สวัสดีครับ 🙏 ถามอะไรก็ได้เลยครับ');
        continue;
      }
      if (ev.type === 'unfollow') { await store.update('users', user.id, { blocked: true }); continue; }
      if (ev.type !== 'message' || ev.message.type !== 'text') continue;

      if (user.blocked) continue;                          // ถูกบล็อกจากหน้า admin = ไม่ตอบ ไม่เสียเงิน
      if (user.perms && user.perms.chat === false) {
        await replyText(ev.replyToken, 'บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งานแชทครับ');
        continue;
      }

      const out = await bot.reply(ev.message.text, { userId, feature: 'chat' });
      if (out.text) await replyText(ev.replyToken, out.text);
    } catch (e) {
      console.error('[line] event error:', e.message);
      try { if (ev.replyToken) await replyText(ev.replyToken, 'ระบบขัดข้องชั่วคราวครับ ลองใหม่อีกครั้ง'); }
      catch (_) { /* reply token หมดอายุแล้ว ปล่อยผ่าน */ }
    }
  }
}

module.exports = {
  verify, configured, handleEvents, replyText, pushText, profile, quota, quotaUsed,
  listRichMenus, createRichMenu, deleteRichMenu, setDefaultRichMenu, uploadRichMenuImage, touchUser,
};
