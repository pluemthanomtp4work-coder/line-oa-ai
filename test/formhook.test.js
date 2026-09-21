// เทสต์การรับคำตอบ Google Form + สรุปรายวัน — driver memory, LINE ปลอม ไม่ส่งข้อความจริง ไม่เสียโควต้า
process.env.ADMIN_KEY = 'test-key-123';
process.env.SUPABASE_URL = '';                 // บังคับ driver memory ห้ามแตะฐานข้อมูลจริง
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.FORM_HOOK_SECRET = 'form-secret-abc';
process.env.LINE_ADMIN_USER_IDS = 'Uadmin1';
process.env.LINE_CHANNEL_SECRET = 'x';         // ให้ line.configured() เป็นจริง แต่ push ถูกแทนด้วยตัวปลอม
process.env.LINE_CHANNEL_ACCESS_TOKEN = 'x';

const store = require('../src/store');
const line = require('../src/line');
const formHook = require('../src/formHook');
const app = require('../src/index');

let pass = 0; let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('PASS ' + name); }
  else { fail += 1; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

// LINE ปลอม — จดว่าถูกเรียกกี่ครั้ง และสั่งให้ล้มหรือโควต้าเต็มได้
const pushed = [];
let pushFails = false;
let quotaLeft = 300;
line.pushText = async (to, text) => { if (pushFails) throw new Error('LINE 500'); pushed.push({ to, text }); };
line.quota = async () => ({ type: 'limited', value: 300 });
line.quotaUsed = async () => ({ totalUsage: 300 - quotaLeft });

const srv = app.listen(0);
const base = () => 'http://127.0.0.1:' + srv.address().port;
const hook = (body, secret = 'form-secret-abc') => fetch(base() + '/hooks/google-form', {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(secret == null ? {} : { 'x-form-secret': secret }) },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));

const sample = (id, extra = {}) => ({
  responseId: id, formId: 'f1', formTitle: 'ลงทะเบียนสัมมนา', submittedAt: '2026-09-21T03:00:00Z',
  answers: [{ q: 'ชื่อ', a: 'สมชาย' }, { q: 'ที่นั่ง', a: ['เช้า', 'บ่าย'] }], ...extra,
});
const pending = async () => (await store.read('formSubmissions')).filter((r) => r.notified !== true);

(async () => {
  await new Promise((r) => srv.once('listening', r));

  // ---- ด่านกั้น ----
  check('ไม่มีรหัสลับ -> 401', (await hook(sample('a'), null)).status === 401);
  check('รหัสลับผิด -> 401', (await hook(sample('a'), 'wrong')).status === 401);
  check('รหัสลับยาวกว่า -> 401 (ไม่ throw)', (await hook(sample('a'), 'form-secret-abc-x')).status === 401);
  check('body ไม่ใช่ JSON -> 400', (await hook('not json')).status === 400);

  // secret ที่ตั้งผ่าน PowerShell pipe ได้ \r\n ติดท้ายมาแบบมองไม่เห็น — รหัสที่ถูกต้องต้องยังผ่าน
  process.env.FORM_HOOK_SECRET = 'form-secret-abc\r\n';
  const crlf = await hook(sample('crlf-probe'));
  check('secret บนเซิร์ฟเวอร์มี \\r\\n ติดท้าย -> รหัสถูกยังผ่าน (เคยโดน 401 บน production)', crlf.status === 200, 'got ' + crlf.status);
  process.env.FORM_HOOK_SECRET = 'form-secret-abc';
  await store.deleteWhere('formSubmissions', { field: 'responseId', eq: 'crlf-probe' });
  check('ไม่มี responseId -> 400', (await hook(sample(''))).status === 400);

  // ---- รับข้อมูล + กันซ้ำ ----
  let r = await hook(sample('resp-1'));
  check('ข้อมูลถูก -> 200 stored', r.status === 200 && r.json.status === 'stored', JSON.stringify(r.json));
  r = await hook(sample('resp-1'));
  check('ส่งซ้ำ responseId เดิม -> 200 duplicate', r.status === 200 && r.json.status === 'duplicate');
  check('  ...เก็บไว้แค่แถวเดียว', (await store.read('formSubmissions')).length === 1);
  const saved = (await store.read('formSubmissions'))[0];
  check('คำตอบแบบ checkbox (array) ถูกรวมเป็นข้อความ', saved.answers[1].a === 'เช้า, บ่าย', saved.answers[1].a);

  // ---- สรุป: ไม่มีของใหม่ = ไม่ส่ง ----
  await store.update('formSubmissions', saved.id, { notified: true });
  let d = await formHook.digest();
  check('ไม่มีคำตอบใหม่ -> ไม่ push เลย (ไม่เสียโควต้า)', d.sent === 0 && pushed.length === 0, JSON.stringify(d));
  await store.update('formSubmissions', saved.id, { notified: false });

  // ---- สรุป: push ล้ม = ห้ามทำเครื่องหมาย ----
  pushFails = true;
  d = await formHook.digest();
  check('push ล้ม -> ไม่ทำเครื่องหมายว่าส่งแล้ว (พรุ่งนี้ส่งใหม่ ข้อมูลไม่หาย)', (await pending()).length === 1 && d.errors.length === 1);
  pushFails = false;

  // ---- สรุป: โควต้าไม่พอ = ไม่ส่ง ----
  quotaLeft = 0;
  d = await formHook.digest();
  check('โควต้าเต็ม -> ไม่ push และไม่ทำเครื่องหมาย', pushed.length === 0 && (await pending()).length === 1, JSON.stringify(d));
  quotaLeft = 300;

  // ---- สรุป: ปกติ ----
  await hook(sample('resp-2', { formTitle: 'แบบสอบถามความพึงพอใจ' }));
  d = await formHook.digest();
  check('ส่งสรุปถึงแอดมิน 1 ข้อความ (รวม 2 รายการในข้อความเดียว)', pushed.length === 1 && d.items === 2 && pushed[0].to === 'Uadmin1', JSON.stringify(d));
  check('  ...ข้อความมีทั้งสองฟอร์ม', pushed[0].text.includes('ลงทะเบียนสัมมนา') && pushed[0].text.includes('แบบสอบถามความพึงพอใจ'));
  check('  ...ทำเครื่องหมายครบทุกแถว', (await pending()).length === 0);
  check('  ...บันทึกเวลาส่งล่าสุด', Boolean((await store.settings()).formDigestAt));
  d = await formHook.digest();
  check('สรุปรอบถัดไปไม่ส่งรายการเดิมซ้ำ', pushed.length === 1 && d.sent === 0);

  // ---- ข้อความยาวเกิน ต้องตัด ไม่ใช่ปล่อยให้ push พัง ----
  const many = Array.from({ length: 200 }, (_, i) => ({ ...formHook.clean(sample('m' + i)), notified: false }));
  const text = formHook.formatDigest(many);
  check('คำตอบ 200 รายการ -> ข้อความไม่เกินขีดจำกัดของ LINE', text.length <= 4800, text.length + ' ตัวอักษร');
  check('  ...บอกว่ายังเหลืออีกกี่รายการ', /และอีก \d+ รายการ/.test(text));

  // ---- หน้า Dashboard: ค่าจากคนกรอกฟอร์มต้องถูก escape ----
  await hook(sample('xss', { formTitle: '<img src=x onerror=alert(1)>' }));
  const html = await (await fetch(base() + '/admin?key=test-key-123')).text();
  check('ชื่อฟอร์มที่มี HTML ถูก escape ใน Dashboard', !html.includes('<img src=x onerror') && html.includes('&lt;img src=x'));
  check('Dashboard แสดงแผง Google Form + ปุ่มส่งสรุป', html.includes('📝 Google Form') && html.includes('/admin/forms/digest'));

  // ---- ปุ่มส่งสรุปต้องผ่านด่าน ADMIN_KEY ----
  const noKey = await fetch(base() + '/admin/forms/digest', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'key=nope' });
  check('ปุ่มส่งสรุปไม่มี ADMIN_KEY -> 401', noKey.status === 401);

  // ================= คำสั่ง "สรุปฟอร์ม" ในแชท LINE =================
  // line.js เรียก replyText/profile เป็นฟังก์ชันภายในไฟล์ ไม่ผ่าน module.exports
  // ดักที่ line.pushText แบบข้างบนจึงไม่โดน ต้องดักที่ fetch ไป api.line.me แทน
  const realFetch = global.fetch;
  const replies = [];
  let replyFails = false;
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (!u.startsWith('https://api.line.me/')) return realFetch(url, opts);
    if (u.includes('/profile/')) return new Response(JSON.stringify({ displayName: 'ผู้ทดสอบ' }), { status: 200 });
    if (u.endsWith('/message/reply')) {
      if (replyFails) return new Response('{"message":"boom"}', { status: 500 });
      replies.push(JSON.parse(opts.body).messages[0].text);
      return new Response('{}', { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
  const say = (userId, text) => line.handleEvents([{
    type: 'message', replyToken: 'rt-' + Math.random(), source: { type: 'user', userId }, message: { type: 'text', text },
  }]);
  const pendingNow = async () => (await pending()).length;

  await hook(sample('chat-1', { formTitle: 'ฟอร์มสำหรับทดสอบแชท' }));
  // เทียบกับค่าที่วัดจริง ไม่ fix เป็น 1 — เทสต์ XSS ข้างบนทิ้งรายการรอสรุปไว้ก่อนแล้ว (เคยทำให้ 3 ข้อ fail ผิดๆ)
  const baseline = await pendingNow();
  replies.length = 0;
  await say('Ustranger', 'สรุปฟอร์ม');
  check('คนที่ไม่ใช่แอดมินพิมพ์ "สรุปฟอร์ม" -> ไม่เห็นข้อมูลฟอร์ม', !replies.some((t) => t.includes('สรุปคำตอบ')), JSON.stringify(replies));
  check('  ...และรายการยังรอสรุปอยู่', (await pendingNow()) === baseline);

  replies.length = 0;
  await say('Uadmin1', 'ช่วยอธิบายวิธีสรุปฟอร์มหน่อย');
  check('แอดมินถามประโยคที่มีคำนี้อยู่ -> ไม่ถูกดักเป็นคำสั่ง', !replies.some((t) => t.includes('สรุปคำตอบ')) && (await pendingNow()) === baseline);

  replyFails = true;
  replies.length = 0;
  await say('Uadmin1', 'สรุปฟอร์ม');
  check('reply ล้ม -> ไม่ทำเครื่องหมาย (รอบ 08:00 ยังส่งให้)', (await pendingNow()) === baseline);
  replyFails = false;

  replies.length = 0;
  const pushesBefore = pushed.length;
  await say('Uadmin1', ' /สรุป ฟอร์ม ');
  check('แอดมินพิมพ์ " /สรุป ฟอร์ม " -> ได้สรุปกลับในแชท', replies.length === 1 && replies[0].includes('ฟอร์มสำหรับทดสอบแชท'), JSON.stringify(replies));
  check('  ...ตอบด้วย reply ไม่ใช้ push (ไม่เสียโควต้า)', pushed.length === pushesBefore);
  check('  ...ทำเครื่องหมายว่าสรุปแล้ว รอบ 08:00 ไม่ส่งซ้ำ', (await pendingNow()) === 0);

  replies.length = 0;
  await say('Uadmin1', 'ส่งสรุปตอนนี้');
  check('ไม่มีของใหม่ -> ตอบว่ายังไม่มีคำตอบใหม่ (คำที่แอดมินเคยพิมพ์จริงก็ใช้ได้)', replies.length === 1 && replies[0].includes('ยังไม่มีคำตอบฟอร์มใหม่'), JSON.stringify(replies));
  global.fetch = realFetch;

  console.log('\nRESULT ' + pass + ' passed / ' + fail + ' failed');
  srv.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
