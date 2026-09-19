// ชั้นคุยกับ Supabase — PostgREST + Storage ผ่าน fetch ล้วน ไม่ใช้ SDK
// ใช้ service_role key เท่านั้น: มัน bypass RLS ซึ่งเป็นเหตุผลที่ตารางทั้งหมดเปิด RLS
// แบบไม่มี policy ได้ (publishable key จึงอ่านอะไรไม่ได้เลยแม้หลุดออกไป)
//
// ⚠️ service_role key ห้ามโผล่ฝั่ง browser เด็ดขาด ไฟล์นี้ต้องถูกเรียกจากฝั่งเซิร์ฟเวอร์เท่านั้น

const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** SUPABASE_URL ที่คนวางมามักมี /rest/v1/ ติดมาด้วย — ตัดออกให้เหลือ origin เพื่อเอาไปต่อ /storage ได้ */
function origin() {
  const raw = String(process.env.SUPABASE_URL || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
}

const configured = () => Boolean(origin() && KEY());

function headers(extra) {
  return {
    apikey: KEY(),
    authorization: 'Bearer ' + KEY(),
    ...extra,
  };
}

/**
 * ยิง PostgREST — คืน array เสมอ (หรือ [] เมื่อไม่ขอ representation กลับมา)
 * โยน error เมื่อสถานะไม่ 2xx: หน้าเว็บจับไปแสดง "ยังอ่านข้อมูลไม่ได้"
 * ซึ่งครอบทั้งกรณีตารางยังไม่ถูกสร้าง และกรณี Supabase ล่ม — ทั้งสองอย่างคือ "ยังใช้ไม่ได้ตอนนี้"
 */
async function rest(path, opts = {}) {
  if (!configured()) throw new Error('ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${origin()}/rest/v1/${path}`, {
    method: opts.method || 'GET',
    headers: headers({
      'content-type': 'application/json',
      prefer: opts.prefer || 'return=representation',
      ...(opts.headers || {}),
    }),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  if (!res.ok) {
    const e = new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    e.status = res.status;
    // 409 = ชน unique index (เช่น lineUserId ซ้ำ) — ฝั่ง upsert ต้องแยกเคสนี้ออกจาก error จริง
    e.conflict = res.status === 409;
    throw e;
  }
  if (!text) return [];
  const json = JSON.parse(text);
  return Array.isArray(json) ? json : [json];
}

// ---------- Storage ----------
const BUCKET = process.env.SUPABASE_BUCKET || 'uploads';

async function upload(path, buf, mime) {
  const res = await fetch(`${origin()}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
    method: 'POST',
    headers: headers({ 'content-type': mime || 'application/octet-stream', 'x-upsert': 'true' }),
    body: buf,
  });
  if (!res.ok) throw new Error(`Storage upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return path;
}

async function download(path) {
  const res = await fetch(`${origin()}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, { headers: headers() });
  if (!res.ok) throw new Error(`Storage download ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function removeObject(path) {
  const res = await fetch(`${origin()}/storage/v1/object/${BUCKET}/${encodeURI(path)}`, {
    method: 'DELETE', headers: headers(),
  });
  // 404 = ไฟล์หายไปก่อนแล้ว ถือว่าสำเร็จ ไม่ต้องทำให้การลบแถวล้มตาม
  if (!res.ok && res.status !== 404) throw new Error(`Storage delete ${res.status}`);
}

module.exports = { rest, upload, download, removeObject, configured, origin, BUCKET };
