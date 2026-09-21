// ด่านกั้นหน้า admin ด้วย ?key= (เบา ไม่ใช่ auth จริง) + ตัวช่วย redirect กลับพร้อม flash
// GET  → key มาทาง query   POST → key มาทาง body (hidden input)
// ADMIN_KEY อ่านจาก env เท่านั้น ห้าม hardcode ในโค้ด

// trim — ตั้ง secret ผ่าน PowerShell pipe (`"ค่า" | wrangler secret put`) ได้ \r ติดท้ายมาแบบมองไม่เห็น
// ถ้าไม่ตัด คีย์ที่ถูกต้องจะโดน 401 ตลอด = ล็อกตัวเองออกจากหน้าหลังบ้าน (เจอจริงกับ FORM_HOOK_SECRET)
const ADMIN_KEY = String(process.env.ADMIN_KEY || '').trim();

// เทียบแบบ constant-time กันเดาคีย์ทีละตัวอักษรจากเวลาตอบ
const crypto = require('crypto');
function sameKey(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(ADMIN_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ใช้เป็น middleware หรือเรียกตรงก็ได้ — คืน true = ผ่าน
function requireAdmin(req, res) {
  if (!ADMIN_KEY) { res.status(503).send('ยังไม่ได้ตั้ง ADMIN_KEY ใน .env'); return false; }
  const key = (req.query && req.query.key) || (req.body && req.body.key);
  if (!sameKey(key)) { res.status(401).send('unauthorized — ใส่ ?key=... ให้ถูก'); return false; }
  return true;
}

// ปุ่ม/ฟอร์ม POST ทุกอันต้องพก key ไปด้วย ไม่งั้นกดแล้วเด้ง 401
const keyInput = () => `<input type="hidden" name="key" value="${String(ADMIN_KEY).replace(/"/g, '&quot;')}">`;

// PRG: POST แล้วเด้งกลับหน้าเดิมพร้อมข้อความ (กัน refresh แล้วส่งซ้ำ)
// path ที่มี query อยู่แล้ว (เช่น /admin/header?card=welcome) ต้องต่อด้วย & ไม่ใช่ ?
// ไม่งั้นได้ URL สอง ? แล้ว key หลุด → เด้ง 401 ทันทีหลังบันทึกสำเร็จ
const back = (res, path, q = '') => {
  const sep = String(path).includes('?') ? '&' : '?';
  return res.redirect(`${path}${sep}key=${encodeURIComponent(ADMIN_KEY)}${q ? '&' + q : ''}`);
};
const ok = (res, path, msg) => back(res, path, 'ok=' + encodeURIComponent(msg));
const err = (res, path, msg) => back(res, path, 'err=' + encodeURIComponent(msg));

// แถบ flash อ่านจาก query — วางบนสุดของเนื้อหา
function flashHtml(query, esc) {
  if (query.ok) return `<div class="flash fok">✅ ${esc(query.ok)}</div>`;
  if (query.err) return `<div class="flash ferr">⚠️ ${esc(query.err)}</div>`;
  return '';
}

module.exports = { ADMIN_KEY, requireAdmin, keyInput, back, ok, err, flashHtml };
