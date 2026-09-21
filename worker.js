// จุดเข้าสำหรับ Cloudflare Workers
// Workers ไม่ได้รัน `node src/index.js` แต่เรียก fetch handler ที่ export ไว้
// httpServerHandler เป็นตัวต่อระหว่าง Node HTTP server (ที่ Express ต้องการ) กับ runtime ของ Workers
//
// รันได้เพราะสองอย่าง:
//   1. Workers รองรับ node:http แล้ว (compat date >= 2025-08-15, เปิดเป็นค่าเริ่มต้นตั้งแต่ 2026-08-04)
//   2. โค้ดนี้ไม่แตะไฟล์ระบบอีกแล้ว ข้อมูลทั้งหมดอยู่บน Supabase — Workers ไม่มีดิสก์ให้เขียน
import { httpServerHandler } from 'cloudflare:node';
import app from './src/index.js';

const PORT = 8787;

// ไม่เรียก store.init() ตรงนี้ — มันอ่านทั้ง 15 ตารางเพื่อตรวจสุขภาพ
// ถ้าทำตอนบูตจะกิน subrequest 15 ครั้งทุก cold start โดยไม่ได้ประโยชน์กับผู้ใช้
// หน้าเว็บแต่ละหน้ามี .catch ของตัวเองอยู่แล้ว ตารางพังจะขึ้นคำเตือนในหน้านั้นเอง
app.listen(PORT);

export default httpServerHandler({ port: PORT });
