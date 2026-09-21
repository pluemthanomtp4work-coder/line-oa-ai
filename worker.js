// จุดเข้าสำหรับ Cloudflare Workers
// Workers ไม่ได้รัน `node src/index.js` แต่เรียก fetch handler ที่ export ไว้
// httpServerHandler เป็นตัวต่อระหว่าง Node HTTP server (ที่ Express ต้องการ) กับ runtime ของ Workers
//
// รันได้เพราะสองอย่าง:
//   1. Workers รองรับ node:http แล้ว (compat date >= 2025-08-15, เปิดเป็นค่าเริ่มต้นตั้งแต่ 2026-08-04)
//   2. โค้ดนี้ไม่แตะไฟล์ระบบอีกแล้ว ข้อมูลทั้งหมดอยู่บน Supabase — Workers ไม่มีดิสก์ให้เขียน
import { httpServerHandler } from 'cloudflare:node';
import { waitUntil } from 'cloudflare:workers';
import app from './src/index.js';
import bg from './src/background.js';
import formHook from './src/formHook.js';

// ผูก waitUntil ก่อนรับรีเควสต์แรก — ไม่งั้นงานที่ webhook ส่งไปทำเบื้องหลัง
// (ให้ AI คิดคำตอบแล้ว reply กลับ LINE) จะถูก Workers ตัดทิ้งทันทีที่ตอบ 200
bg.setWaitUntil(waitUntil);

const PORT = 8787;

// ไม่เรียก store.init() ตรงนี้ — มันอ่านทั้ง 15 ตารางเพื่อตรวจสุขภาพ
// ถ้าทำตอนบูตจะกิน subrequest 15 ครั้งทุก cold start โดยไม่ได้ประโยชน์กับผู้ใช้
// หน้าเว็บแต่ละหน้ามี .catch ของตัวเองอยู่แล้ว ตารางพังจะขึ้นคำเตือนในหน้านั้นเอง
app.listen(PORT);

// เอกสารไม่ได้ระบุว่า httpServerHandler คืนค่าเป็นอะไร จึงรองรับทั้งสองแบบ
// และห่อเป็น object เองเพื่อเพิ่ม scheduled (cron) เข้าไปในตัวเดียวกันได้
const http = httpServerHandler({ port: PORT });
const fetchHandler = typeof http === 'function' ? http : http.fetch.bind(http);

export default {
  fetch: (request, env, ctx) => fetchHandler(request, env, ctx),

  // Cron Trigger (ตั้งใน wrangler.jsonc) — ส่งสรุป Google Form วันละครั้ง
  // ต้องผ่าน waitUntil ไม่งั้น invocation จบก่อนส่ง LINE เสร็จ แล้วสรุปหายเงียบๆ
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      formHook.digest({ source: 'cron' })
        .then((r) => console.log('[digest]', JSON.stringify({ ...r, text: undefined })))
        .catch((e) => console.error('[digest] ล้มเหลว:', e.message)),
    );
  },
};
