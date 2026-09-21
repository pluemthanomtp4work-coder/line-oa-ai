// เทสต์งบเวลาของ ai.callWithRetry — จำลอง Gemini ด้วย fetch ปลอม ไม่ยิงเน็ตจริง ไม่เสียเงิน
// กันบั๊กเดิมกลับมา: fetch ไม่มี timeout → ตัวหลักค้าง 40 วิ x 3 รอบ = 129 วิ บน production
// ซึ่งเกินเพดาน 30 วิของ waitUntil บน Workers → ผู้ใช้ LINE ไม่ได้คำตอบเลย
process.env.AI_BUDGET_MS = '3000';     // ย่อเวลาลงให้เทสต์เร็ว สัดส่วนเดียวกับของจริง (20s / 9s)
process.env.AI_ATTEMPT_MS = '1000';
process.env.AI_MODEL = 'primary';
process.env.AI_MODEL_FALLBACK = 'backup';
process.env.GEMINI_API_KEY = 'test';

const ai = require('../src/ai');

let pass = 0; let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('PASS ' + name); }
  else { fail += 1; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

const OK = { candidates: [{ content: { parts: [{ text: 'ตอบแล้ว' }] }, finishReason: 'STOP' }], usageMetadata: {} };
const reply = (status, body) => Promise.resolve(new Response(JSON.stringify(body), { status }));
// ค้างจนกว่าจะโดน abort — แบบเดียวกับ Gemini ที่ไม่ยอมตอบกลับ
const hang = (signal) => new Promise((_, reject) => {
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

// behaviour[ชื่อโมเดล] = ฟังก์ชันที่คืน Response หรือ 'hang'
function stub(behaviour) {
  const calls = [];
  global.fetch = (url, opts) => {
    const model = decodeURIComponent(url.split('/models/')[1].split(':')[0]);
    calls.push(model);
    const b = behaviour[model];
    return b === 'hang' ? hang(opts.signal) : b();
  };
  return calls;
}
const timed = async (fn) => {
  const t = Date.now();
  try { return { v: await fn(), ms: Date.now() - t }; } catch (e) { return { e, ms: Date.now() - t }; }
};

// AbortSignal.timeout() ใช้ timer แบบ unref ซึ่งไม่ยื้อ event loop — ถ้าไม่มีอะไรค้างไว้
// Node จะปิดโปรเซสทิ้งเงียบๆ ก่อน timeout ดัง (เจอจริง: เทสต์หยุดหลังข้อแรกแบบไม่มี error)
// บน production ไม่โดนเพราะเซิร์ฟเวอร์เปิด socket ค้างไว้ตลอด
const keepAlive = setInterval(() => {}, 1000);

(async () => {
  let calls = stub({ primary: () => reply(200, OK), backup: () => reply(200, OK) });
  let r = await timed(() => ai.callWithRetry('primary', {}));
  check('ตัวหลักตอบปกติ -> ใช้ตัวหลัก 1 ครั้ง', r.v && r.v.usedModel === 'primary' && calls.length === 1);

  calls = stub({ primary: 'hang', backup: () => reply(200, OK) });
  r = await timed(() => ai.callWithRetry('primary', {}));
  check('ตัวหลักค้าง -> ตัดที่ timeout แล้วไปตัวสำรอง', r.v && r.v.usedModel === 'backup', JSON.stringify(calls));
  check('  ...ใช้เวลาแค่ราว 1 attempt ไม่ใช่รอค้างไปตลอด', r.ms < 1800, r.ms + 'ms');
  check('  ...บันทึกว่าลองไป 2 ครั้ง', r.v && r.v.attempts === 2);

  calls = stub({ primary: () => reply(503, { error: 'high demand' }), backup: () => reply(200, OK) });
  r = await timed(() => ai.callWithRetry('primary', {}));
  check('ตัวหลัก 503 -> ไปตัวสำรองทันที', r.v && r.v.usedModel === 'backup' && r.ms < 500, r.ms + 'ms');

  calls = stub({ primary: 'hang', backup: 'hang' });
  r = await timed(() => ai.callWithRetry('primary', {}));
  check('ค้างทุกตัว -> ยอมแพ้ภายในงบเวลา ไม่ค้างตลอดไป', r.e && r.ms <= 3000 + 300, r.ms + 'ms');
  check('  ...error บอกจำนวนครั้งที่ลอง', r.e && r.e.attempts >= 2, String(r.e && r.e.attempts));

  calls = stub({ primary: () => reply(400, { error: 'bad key' }), backup: () => reply(200, OK) });
  r = await timed(() => ai.callWithRetry('primary', {}));
  check('400 (ผิดที่เรา) -> โยนทันที ไม่เผาเวลา retry', r.e && calls.length === 1, JSON.stringify(calls));

  clearInterval(keepAlive);
  console.log('\nRESULT ' + pass + ' passed / ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
