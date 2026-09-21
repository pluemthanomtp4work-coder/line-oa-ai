// smoke test หน้าหลังบ้าน — ยิงจริงผ่าน HTTP ไม่ต้องมี DB ไม่ต้องต่อเน็ต
// รัน: npm test
//
// ต้องตั้ง env ให้ครบ "ก่อน" require ไฟล์ใน src/ เพราะ adminGate/store อ่านค่าตอนโหลดโมดูล
process.env.ADMIN_KEY = 'test-key-123';
// บังคับให้ store ใช้ driver memory — ถ้าปล่อยว่าง env.js จะเติมค่าจาก .env แล้วเทสต์จะไป
// อ่าน/เขียน Supabase จริงของโปรเจกต์ ซึ่งทั้งช้า ทั้งเสี่ยงไปลบข้อมูลจริงทิ้ง
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
// ตั้งเป็นค่าว่าง ไม่ใช่ delete — env.js จะเติมค่าจาก .env ให้เฉพาะคีย์ที่ "ไม่มีใน process.env"
// ถ้า delete ทิ้ง พอเครื่องไหนมี .env ที่ใส่คีย์ LINE จริง เทสต์จะกลายเป็นคนละเคสทันที
// (เคยแตกมาแล้ว: คาด 503 "ยังไม่ได้ตั้งค่า" แต่ได้ 401 "ลายเซ็นผิด")
process.env.LINE_CHANNEL_SECRET = '';
process.env.LINE_CHANNEL_ACCESS_TOKEN = '';
process.env.GEMINI_API_KEY = '';       // กันเทสต์เผลอยิง API จริงแล้วเสียเงิน
process.env.LINE_ADMIN_USER_IDS = 'Uadmin0000';

const store = require('../src/store');
const app = require('../src/index');

const KEY = 'test-key-123';
let pass = 0; let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('PASS ' + name); }
  else { fail += 1; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

const XSS = '<img src=x onerror=alert(1)>';

async function seed() {
  const { driver } = await store.init();
  if (driver !== 'memory') { console.error('หยุด: เทสต์ต้องรันบน driver memory เท่านั้น แต่ได้ ' + driver); process.exit(1); }
  // ผู้ใช้: 1 แอดมิน + 1 ชื่อเป็น payload XSS + อีก 20 คนเพื่อให้ตารางเกิน TOP_ROWS
  await store.insert('users', { lineUserId: 'Uadmin0000', displayName: 'แอดมิน', role: 'member', perms: { chat: true }, blocked: false, lastSeen: '2026-09-19T03:00:00Z' });
  await store.insert('users', { lineUserId: 'Uxss', displayName: XSS, role: 'guest', perms: {}, blocked: false, lastSeen: '2026-09-19T03:00:00Z' });
  for (let i = 0; i < 20; i += 1) {
    await store.insert('users', { lineUserId: 'U' + i, displayName: 'ผู้ใช้ ' + i, role: 'guest', perms: { chat: true }, blocked: false, lastSeen: '2026-09-1' + (i % 9) + 'T03:00:00Z' });
  }
  await store.insert('aiLogs', { userId: 'Uxss', feature: 'chat', model: 'claude-opus-5', ok: true, costUsd: 0.0123, question: XSS, createdAt: '2026-09-19T03:00:00Z' });
  await store.insert('aiLogs', { userId: 'U1', feature: 'chat', model: 'claude-opus-5', ok: false, error: 'ทดสอบ', costUsd: 0, createdAt: '2026-09-18T03:00:00Z' });
  await store.insert('knowledge', { title: XSS, body: 'เนื้อหาทดสอบ', enabled: true, source: 'manual' });
  await store.insert('rules', { keywords: ['ราคา'], action: 'reply', reply: 'สอบถามเจ้าหน้าที่ครับ', enabled: true });
  await store.insert('folders', { name: 'เอกสารทั่วไป' });
  await store.insert('contacts', { lineUserId: 'Uxss', alias: XSS, note: '' });
  await store.insert('richmenus', { name: 'เมนูหลัก', size: 'large', cols: 3, buttons: [{ label: 'ถาม', value: 'ถาม', actionType: 'message', color: '#2D6CDF', icon: '💬' }], published: false });
  await store.insert('templates', { name: 'ใบประกาศ', bgFileId: '', boxes: [{ text: XSS, x: 0.1, y: 0.2, w: 0.5, size: 0.06, color: '#FFFFFF', align: 'left' }] });
}

const PAGES = [
  ['/admin', 'dash'], ['/training', 'training'], ['/admin/template', 'template'],
  ['/files', 'files'], ['/admin/header', 'header'], ['/admin/menu', 'menu'],
  ['/contacts', 'contacts'], ['/admin/users', 'users'],
];

async function main() {
  await seed();
  const srv = app.listen(0);
  await new Promise((r) => srv.once('listening', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const get = (p) => fetch(base + p, { redirect: 'manual' });
  const post = (p, body) => fetch(base + p, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

  // ---- ด่านกั้น ----
  check('ไม่ใส่ key -> 401', (await get('/admin')).status === 401);
  check('key ผิด -> 401', (await get('/admin?key=wrong')).status === 401);
  check('key ยาวกว่า -> 401 (ไม่ throw)', (await get('/admin?key=test-key-1234')).status === 401);

  // ---- ทุกหน้าเปิดได้ + ไม่มี ${ ค้าง + nav พก key ----
  let allOk = true; let allNav = true; let noTpl = true; const bad = [];
  for (const [p] of PAGES) {
    const r = await get(p + '?key=' + KEY);
    const html = await r.text();
    if (r.status !== 200) { allOk = false; bad.push(p + '=' + r.status); }
    if (!html.includes('?key=' + KEY)) { allNav = false; bad.push(p + ' ไม่มี key ใน nav'); }
    if (html.includes('${')) { noTpl = false; bad.push(p + ' มี ${ ค้าง'); }
  }
  check('ทั้ง 8 หน้าเปิดได้ 200', allOk, bad.join(', '));
  check('ทุกหน้ามีลิงก์ nav ที่พก key', allNav, bad.join(', '));
  check('ไม่มี ${ ค้างใน output', noTpl, bad.join(', '));

  // ---- escape XSS ทุกหน้าที่แสดงค่าจาก DB ----
  const dashHtml = await (await get('/admin?key=' + KEY)).text();
  check('escape XSS (dashboard)', !dashHtml.includes('<img src=x onerror') && dashHtml.includes('&lt;img src=x'));
  const conHtml = await (await get('/contacts?key=' + KEY)).text();
  check('escape XSS (รายชื่อ)', !conHtml.includes('<img src=x onerror'));
  const trainHtml = await (await get('/training?key=' + KEY)).text();
  check('escape XSS (สอนบอท)', !trainHtml.includes('<img src=x onerror'));

  // ---- flash + ตารางย่อ + นับผู้ใช้จากตารางจริง ----
  const flashHtml = await (await get('/admin?key=' + KEY + '&ok=' + encodeURIComponent('บันทึกแล้ว'))).text();
  check('flash ok ขึ้น', flashHtml.includes('class="flash fok"'));
  check('ฟอร์ม POST มี hidden key', dashHtml.includes('name="key" value="' + KEY + '"'));
  check('ตารางย่อแถวเกิน 15', (dashHtml.match(/class="urow hid"/g) || []).length > 0);
  check('นับผู้ใช้จากตารางผู้ใช้ (22 คน) ไม่ใช่จาก log (2 คน)', dashHtml.includes('>22<'), 'ไม่พบเลข 22');

  // ---- แหล่งข้อมูลล่ม -> ยัง 200 + ขึ้นคำเตือน ----
  // จำลองด้วยการให้ read('users') โยน error เหมือนตอน Supabase ล่มหรือตารางยังไม่ถูกสร้าง
  const realRead = store.read;
  store.read = (name) => (name === 'users'
    ? Promise.reject(new Error('Supabase 503: upstream unavailable'))
    : realRead(name));
  const down = await get('/admin?key=' + KEY);
  const downHtml = await down.text();
  check('ข้อมูลล่ม -> ยัง 200', down.status === 200, 'got ' + down.status);
  check('ขึ้นคำเตือนว่ายังอ่านข้อมูลไม่ได้', downHtml.includes('class="warn"'));
  store.read = realRead;

  // ---- POST: PRG + ด่านกั้น ----
  let r = await post('/training/knowledge/save', 'key=' + KEY + '&title=หัวข้อทดสอบ&body=เนื้อหา');
  check('POST -> 302 กลับพร้อม flash ok', r.status === 302 && /ok=/.test(r.headers.get('location') || ''), r.status + ' ' + r.headers.get('location'));
  check('redirect พก key กลับไปด้วย', /[?&]key=/.test(r.headers.get('location') || ''));

  r = await post('/training/knowledge/save', 'key=nope&title=x&body=y');
  check('POST ไม่มี key -> 401', r.status === 401, 'got ' + r.status);

  // ---- กฎที่ไม่มีคำค้นต้องถูกปฏิเสธ (ไม่งั้นกฎจะ match ทุกข้อความเงียบๆ) ----
  r = await post('/training/rules/save', 'key=' + KEY + '&keywords=  ,  &action=reply&reply=ตอบ');
  check('กฎไม่มีคำค้น -> เด้งกลับพร้อม err', r.status === 302 && /err=/.test(r.headers.get('location') || ''));

  // ---- กันล็อกตัวเอง: แถวแอดมินแก้ไม่ได้ ----
  const admin = (await store.read('users')).find((x) => x.lineUserId === 'Uadmin0000');
  r = await post('/admin/users/block', 'key=' + KEY + '&id=' + admin.id + '&value=1');
  const loc = r.headers.get('location') || '';
  check('บล็อกแอดมินไม่ได้ (กันล็อกตัวเอง)', r.status === 302 && /err=/.test(loc), loc);
  check('แอดมินยังไม่ถูกบล็อกจริง', (await store.read('users')).find((x) => x.id === admin.id).blocked !== true);

  // ---- ลิงก์ไฟล์ต้องมีลายเซ็น ----
  r = await get('/files/open/ไม่มีจริง?exp=1&sig=x');
  check('ลิงก์ไฟล์ที่ลายเซ็นผิด -> 403', r.status === 403, 'got ' + r.status);

  // ---- webhook: ไม่มีลายเซ็น/ยังไม่ตั้งค่า -> ไม่ 200 ----
  r = await fetch(base + '/line/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check('webhook ที่ยังไม่ตั้งค่า -> 503', r.status === 503, 'got ' + r.status);

  // ---- webhook ที่ตั้งค่าแล้ว: ต้องไปถึงบรรทัดตรวจลายเซ็นจริง ----
  // เคสข้างบนตอบ 503 ก่อนถึงการตรวจลายเซ็นเสมอ เส้นทางนี้เลยไม่เคยถูกรัน
  // แล้วบั๊ก "multipart เขียนทับ body ของ webhook จน request ค้าง" ก็หลุดผ่านมาได้เพราะแบบนี้
  process.env.LINE_CHANNEL_SECRET = 'test-secret';
  process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
  const crypto = require('crypto');
  const hookBody = '{"destination":"Uxxxx","events":[]}';   // แบบเดียวกับที่ปุ่ม Verify ของ LINE ส่ง
  const sign = (b) => crypto.createHmac('sha256', 'test-secret').update(b).digest('base64');
  const hook = (b, sig) => fetch(base + '/line/webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-line-signature': sig }, body: b,
    signal: AbortSignal.timeout(5000),     // ค้างเกิน 5 วิ = บั๊กเดิมกลับมา ให้ fail ไม่ใช่รอไปตลอด
  }).then((x) => x.status).catch((e) => 'ค้าง/' + e.name);

  check('webhook ลายเซ็นถูก -> 200', (await hook(hookBody, sign(hookBody))) === 200);
  check('webhook ลายเซ็นผิด -> 401 (ไม่ค้าง)', (await hook(hookBody, 'AAAA')) === 401);
  check('webhook body ถูกแก้ -> 401', (await hook(hookBody.replace('xxxx', 'xxxy'), sign(hookBody))) === 401);
  process.env.LINE_CHANNEL_SECRET = '';
  process.env.LINE_CHANNEL_ACCESS_TOKEN = '';

  console.log('\nRESULT ' + pass + ' passed / ' + fail + ' failed');
  srv.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
