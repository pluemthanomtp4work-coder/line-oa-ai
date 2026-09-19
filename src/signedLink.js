// ลิงก์เปิดไฟล์แบบเซ็นชื่อ + หมดอายุเอง
// ห้ามใช้ URL ที่เดา id ได้ตรงๆ — ไฟล์ในคลังเป็นของผู้ใช้ ลิงก์ที่ไม่หมดอายุหลุดครั้งเดียวคือหลุดตลอด
// ใช้ secret แยกจาก ADMIN_KEY ได้ (FILE_SIGN_SECRET) ถ้าไม่ตั้งจะถอยไปใช้ ADMIN_KEY
const crypto = require('crypto');

const secret = () => process.env.FILE_SIGN_SECRET || process.env.ADMIN_KEY || '';
const TTL_MS = Number(process.env.FILE_LINK_TTL_MIN || 15) * 60 * 1000;

function sign(id, exp) {
  return crypto.createHmac('sha256', secret()).update(`${id}.${exp}`).digest('base64url');
}

/** สร้างลิงก์ — อายุสั้น (ค่าเริ่มต้น 15 นาที) พอให้กดเปิดจากหน้า admin */
function urlFor(id) {
  const exp = Date.now() + TTL_MS;
  return `/files/open/${encodeURIComponent(id)}?exp=${exp}&sig=${sign(id, exp)}`;
}

/** ตรวจลิงก์ — timingSafeEqual ต้องเช็คความยาวก่อน ไม่งั้นมันโยน error ทิ้ง */
function verify(id, exp, sig) {
  if (!secret()) return false;
  const n = Number(exp);
  if (!n || n < Date.now()) return false;
  const a = Buffer.from(sign(id, n));
  const b = Buffer.from(String(sig || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { urlFor, verify, TTL_MS };
