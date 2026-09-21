// งานเบื้องหลังที่ทำหลังส่ง response ไปแล้ว — ใช้ได้ทั้งบน Node และ Cloudflare Workers
//
// ทำไมต้องมี: webhook ของ LINE ตอบ 200 ทันทีแล้วค่อยให้ AI คิดคำตอบทีหลัง
//   • บน Node  : โปรเซสอยู่ตลอด promise ที่ลอยอยู่ทำงานจนจบเอง
//   • บน Workers: invocation จบทันทีที่ส่ง response — promise ที่ไม่ได้ผูก waitUntil
//                 "อาจถูกยกเลิกและล้มเหลวแบบเงียบๆ" = บอทไม่ตอบผู้ใช้ และไม่มี error ให้เห็น
//
// worker.js จะเสียบ waitUntil ของ Workers เข้ามาผ่าน setWaitUntil() ตอนบูต
// ไฟล์นี้ require('cloudflare:workers') เองไม่ได้ เพราะโมดูลนั้นไม่มีบน Node
//
// ⚠️ waitUntil ต่อเวลาได้แค่ 30 วินาทีหลังส่ง response (รวมทุกงานในรีเควสต์เดียวกัน)
//    งานที่ส่งเข้ามาต้องจบภายในนั้น — ai.js จึงตั้งงบเวลาไว้ต่ำกว่านั้น
let hook = null;

function setWaitUntil(fn) { hook = typeof fn === 'function' ? fn : null; }

function background(task, label = 'background') {
  const p = Promise.resolve()
    .then(() => (typeof task === 'function' ? task() : task))
    // ห้ามให้ error หลุดเป็น unhandled rejection — บน Node 24 มันฆ่าทั้งโปรเซส
    .catch((e) => console.error(`[${label}]`, e && e.message ? e.message : e));
  if (hook) hook(p);
  return p;
}

const onWorkers = () => hook !== null;

module.exports = { background, setWaitUntil, onWorkers };
