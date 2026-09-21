// รับคำตอบจาก Google Form (ผ่าน Apps Script) แล้วสรุปแจ้งแอดมินทาง LINE วันละครั้ง
//
// ทำไมสรุปรายวัน ไม่แจ้งทุกครั้ง: OA นี้ส่ง push ได้เดือนละ 300 ข้อความ นับตามจำนวนผู้รับ
// แจ้งทุกครั้ง = ฟอร์ม 300 ครั้งก็หมดโควต้า แล้วฟีเจอร์อื่นที่ต้อง push (ส่งทดสอบหัวการ์ด ฯลฯ) ใช้ไม่ได้
// สรุปรายวัน = แอดมินละ 1 ข้อความต่อวันไม่ว่ามีคนกรอกกี่ครั้ง (~30 ข้อความต่อเดือนต่อแอดมิน)
// ส่วนการตอบแชทผู้ใช้เป็น reply ไม่นับโควต้านี้
const crypto = require('crypto');
const store = require('./store');
const line = require('./line');

// trim — เจอจริง: ตั้ง secret ด้วย `"ค่า" | wrangler secret put` ใน PowerShell 5.1 ได้ \r ติดท้าย
// แล้วรหัสที่ถูกต้องโดน 401 ทุกครั้ง รหัส base64url ไม่มีช่องว่างอยู่แล้ว ตัดทิ้งจึงไม่เสียอะไร
const secret = () => String(process.env.FORM_HOOK_SECRET || '').trim();
const configured = () => Boolean(secret());
const admins = () => String(process.env.LINE_ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

// เทียบแบบ constant-time + เช็คความยาวก่อน (timingSafeEqual โยน error ถ้ายาวไม่เท่ากัน)
function sameSecret(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(secret());
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

const LIMIT = { title: 200, question: 200, answer: 2000, items: 60 };
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

/** ตรวจ + ตัดขนาด payload — ข้อมูลมาจากคนนอก (ผู้กรอกฟอร์ม) ห้ามเชื่อรูปร่างหรือความยาว */
function clean(p) {
  if (!p || typeof p !== 'object') throw bad('payload ต้องเป็น JSON object');
  const responseId = String(p.responseId || '').trim();
  if (!responseId || responseId.length > 200) throw bad('ต้องมี responseId');
  if (!Array.isArray(p.answers)) throw bad('answers ต้องเป็น array');
  const at = new Date(p.submittedAt || Date.now());
  return {
    responseId,
    formId: String(p.formId || '').slice(0, 200),
    formTitle: String(p.formTitle || 'Google Form').slice(0, LIMIT.title),
    respondent: String(p.respondent || '').slice(0, 200),
    submittedAt: Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString(),
    answers: p.answers.slice(0, LIMIT.items).map((x) => ({
      q: String((x && x.q) || '').slice(0, LIMIT.question),
      a: Array.isArray(x && x.a) ? x.a.join(', ').slice(0, LIMIT.answer) : String((x && x.a) ?? '').slice(0, LIMIT.answer),
    })),
  };
}

/** เก็บคำตอบหนึ่งชุด — ส่งซ้ำด้วย responseId เดิมจะไม่เก็บซ้ำ (Apps Script retry ได้เมื่อเน็ตสะดุด) */
async function receive(payload) {
  const rec = clean(payload);
  if (await store.findBy('formSubmissions', 'responseId', rec.responseId)) return { status: 'duplicate' };
  try {
    const row = await store.insert('formSubmissions', { ...rec, notified: false });
    return { status: 'stored', id: row.id };
  } catch (e) {
    // ชน unique index = อีกรีเควสต์ที่ส่งซ้ำพร้อมกันเก็บไปก่อนเสี้ยววินาที ไม่ใช่ error จริง
    if (e.conflict) return { status: 'duplicate' };
    throw e;
  }
}

const tz = { timeZone: 'Asia/Bangkok' };
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/**
 * สร้างข้อความสรุป — ข้อความ LINE ยาวได้ 5000 ตัว เผื่อไว้ที่ 4800
 * ถ้าเกิน ตัดท้ายแล้วบอกจำนวนที่เหลือ ไม่ปล่อยให้ push พังทั้งก้อนเพราะยาวเกิน
 */
function formatDigest(rows, max = 4800) {
  const sorted = [...rows].sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)));
  const head = `📝 สรุปคำตอบ Google Form — ${sorted.length} รายการใหม่`;
  const blocks = sorted.map((r) => {
    const when = new Date(r.submittedAt).toLocaleString('th-TH', { ...tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const lines = (r.answers || []).slice(0, 4).map((x) => `   ${clip(x.q, 30)}: ${clip(x.a, 60)}`);
    const more = (r.answers || []).length > 4 ? `   …อีก ${(r.answers || []).length - 4} ข้อ` : '';
    return [`• ${when} · ${clip(r.formTitle, 40)}`, ...lines, more].filter(Boolean).join('\n');
  });
  let out = head;
  let used = 0;
  for (const b of blocks) {
    const tail = `\n\n…และอีก ${blocks.length - used} รายการ ดูครบได้ที่หน้าหลังบ้าน`;
    if ((out + '\n\n' + b).length + tail.length > max) { out += tail; return out; }
    out += '\n\n' + b;
    used += 1;
  }
  return out;
}

/**
 * ส่งสรุปรายการที่ยังไม่ได้แจ้งไปหาแอดมินทุกคน
 * ทำเครื่องหมาย notified เฉพาะเมื่อส่งถึงแอดมินครบทุกคน — ส่งไม่ครบรอบนี้ พรุ่งนี้ส่งใหม่ ข้อมูลไม่หาย
 * dryRun: สร้างข้อความให้ดูเฉยๆ ไม่ส่ง ไม่แตะโควต้า
 */
async function digest({ dryRun = false } = {}) {
  const pending = (await store.read('formSubmissions')).filter((r) => r.notified !== true);
  if (!pending.length) return { sent: 0, items: 0, reason: 'ไม่มีคำตอบใหม่ ไม่ได้ส่ง (ไม่เสียโควต้า)' };

  const to = admins();
  const text = formatDigest(pending);
  if (dryRun) return { dryRun: true, items: pending.length, recipients: to.length, text };
  if (!to.length) return { sent: 0, items: pending.length, reason: 'ยังไม่ได้ตั้ง LINE_ADMIN_USER_IDS' };
  if (!line.configured()) return { sent: 0, items: pending.length, reason: 'ยังไม่ได้ตั้งค่า LINE' };

  // เช็คโควต้าก่อนส่ง — ไม่พอก็ไม่ส่ง ไม่ทำเครื่องหมาย พรุ่งนี้ลองใหม่
  const [q, used] = await Promise.all([line.quota(), line.quotaUsed()]);
  if (q.type === 'limited' && (Number(q.value) - Number(used.totalUsage || 0)) < to.length) {
    return { sent: 0, items: pending.length, reason: `โควต้าเหลือไม่พอ (${q.value - used.totalUsage}/${q.value})` };
  }

  let sent = 0;
  const errors = [];
  for (const u of to) {
    try { await line.pushText(u, text); sent += 1; } catch (e) { errors.push(e.message); }
  }
  if (sent === to.length) {
    const now = new Date().toISOString();
    for (const r of pending) await store.update('formSubmissions', r.id, { notified: true, notifiedAt: now });
    await store.setSetting('formDigestAt', now);
  }
  return { sent, recipients: to.length, items: pending.length, errors };
}

module.exports = { configured, sameSecret, clean, receive, formatDigest, digest, admins };
