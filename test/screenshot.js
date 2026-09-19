// ถ่ายภาพหน้าจริงทั้ง 8 หน้าด้วย Chrome ที่มีในเครื่อง — เทสต์ผ่านหมดแต่หน้าเบี้ยวได้
// รัน: npm run shot   → ได้ไฟล์ใน test/out/*.png
// เรียก render() ตรงๆ ด้วยข้อมูลปลอม ไม่ต้องรันเซิร์ฟเวอร์ ไม่ต้องมีข้อมูลจริง
process.env.ADMIN_KEY = process.env.ADMIN_KEY || 'shot-key';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, 'out');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.CHROME_PATH,
].filter(Boolean).find((p) => fs.existsSync(p));

const now = '19 ก.ย. 69 10:00';
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));

// ข้อมูลปลอมของแต่ละหน้า — ใส่ค่ามากพอให้เห็นทั้งตารางยาว กราฟ และการ์ดครบ
const CASES = {
  dashboard: () => require('../src/adminPage').render({
    query: { ok: 'บันทึกแล้ว' }, usersReady: true, logsReady: true,
    totalUsers: 370, activeUsers: 183, calls: 1204, failed: 7, todayCalls: 64,
    thb: 418.22, todayThb: 22.4, rate: 36.5, budgetThb: 1000, billActualThb: 455.1, dailyCallCap: 200,
    aiKeyOk: true, aiModel: 'claude-opus-5', lineOk: true, lineQuota: { limit: 1000, used: 612 },
    days: many(14, (i) => ({ label: String(6 + i), value: 20 + ((i * 37) % 90) })),
    features: [{ label: 'chat', value: 880 }, { label: 'ทดลองแชท', value: 210 }, { label: 'image', value: 114 }],
    rows: many(22, (i) => ({ id: 'u' + i, name: 'ผู้ใช้ทดสอบ ' + i, role: i % 3 ? 'guest' : 'member', blocked: i === 4, calls: 120 - i * 4, thb: 20 - i * 0.7, last: '2026-09-1' + (i % 9) + ' 10:00' })),
    recent: many(8, (i) => ({ when: '09-19 1' + i + ':00', feature: 'chat', model: 'claude-opus-5', q: 'เวลาทำการกี่โมง', ok: i !== 3, err: 'timeout', thb: 0.42 })),
    nowLabel: now,
  }),
  users: () => require('../src/usersPage').render({
    query: {}, ready: true, adminCount: 1,
    rows: many(20, (i) => ({
      id: 'u' + i, lineUserId: 'Uabcdef' + i, name: 'ผู้ใช้ทดสอบ ' + i, picture: '',
      role: i % 3 ? 'guest' : 'member', blocked: i === 5, isAdmin: i === 0,
      perms: { chat: i % 2 === 0, files: i % 4 === 0, image: false },
      calls: 90 - i * 3, lastSeen: '2026-09-1' + (i % 9) + ' 09:30',
    })),
    nowLabel: now,
  }),
  training: () => require('../src/trainingPage').render({
    query: {}, ready: { knowledge: true, docs: true, rules: true, prompts: true, memories: true, feedback: true },
    knowledge: many(14, (i) => ({ id: 'k' + i, title: 'หัวข้อความรู้ ' + i, body: 'เนื้อหาตัวอย่างของความรู้ข้อที่ ' + i + ' ที่ยาวพอจะถูกตัดท้าย', enabled: i % 4 !== 0, source: i % 3 ? 'manual' : 'doc' })),
    docs: [{ id: 'd1', name: 'คู่มือพนักงาน.md', size: 82000, status: 'imported', items: 12, note: 'แปลงเป็นความรู้ 12 ข้อ' }],
    rules: [{ id: 'r1', keywords: ['ราคา', 'กี่บาท'], action: 'handoff', reply: 'เดี๋ยวเจ้าหน้าที่ติดต่อกลับครับ', enabled: true }],
    prompts: [{ id: 'p1', name: 'สุภาพทางการ', body: 'ตอบสุภาพ ลงท้ายด้วยครับ', active: true }],
    memories: [{ id: 'm1', scope: 'global', text: 'บริษัทหยุดวันเสาร์-อาทิตย์', enabled: true }],
    feedback: [{ id: 'f1', question: 'ส่งของกี่วันถึง', answer: 'ไม่แน่ใจครับ' }],
    tryQ: 'เวลาทำการกี่โมง', tryA: 'จันทร์–ศุกร์ 8:30–17:00 ครับ', tryVia: 'ai',
    nowLabel: now,
  }),
  contacts: () => require('../src/contactsPage').render({
    query: {}, ready: true, named: 6,
    rows: many(18, (i) => ({ lineUserId: 'Uabcdef01234' + i, displayName: 'LINE Name ' + i, picture: '', alias: i < 6 ? 'คุณสมชาย ' + i : '', note: i < 6 ? 'ลูกค้าประจำ' : '', contactId: i < 6 ? 'c' + i : '', lastSeen: '2026-09-1' + (i % 9) + ' 08:00' })),
    nowLabel: now,
  }),
  files: () => require('../src/filesPage').render({
    query: {}, showTrash: false, current: 'f1', ready: true, ttlMin: 15,
    folders: [{ id: 'f1', name: 'เอกสารทั่วไป', count: 6 }, { id: 'f2', name: 'รูปภาพ', count: 3 }],
    users: many(4, (i) => ({ id: 'U' + i, name: 'ผู้ใช้ ' + i })),
    files: many(6, (i) => ({ id: 'x' + i, name: 'ไฟล์ตัวอย่าง-' + i + (i % 2 ? '.pdf' : '.png'), size: 120000 + i * 1000, mime: i % 2 ? 'application/pdf' : 'image/png', folderId: 'f1', allow: [], isImage: i % 2 === 0, isPdf: i % 2 === 1, url: '#', when: '2026-09-19 10:00' })),
    totalBytes: 9_400_000, trashCount: 2, nowLabel: now,
  }),
  header: () => require('../src/headerAdminPage').render({
    query: {}, current: 'answer', ready: true,
    conf: { theme: 'blue', title: 'คำตอบจากผู้ช่วย', bgFileId: '', bgUrl: '', bgName: '' },
    configured: require('../src/headerAdminPage').CARD_TYPES.map(([key, label]) => ({ key, label, theme: 'blue', custom: true })),
    lineOk: true, testTarget: 'Uadmin0000', nowLabel: now,
  }),
  menu: () => require('../src/menuAdminPage').render({
    query: {}, ready: true, lineOk: true, liveCount: 1,
    menus: [{ id: 'm1', name: 'เมนูหลัก', size: 'large', buttons: 6, published: true, lineRichMenuId: 'richmenu-x', when: '2026-09-19 10:00' }],
    draft: { id: 'm1', name: 'เมนูหลัก', size: 'large', cols: 3, buttons: require('../src/menuAdminPage').defaultButtons() },
    nowLabel: now,
  }),
  template: () => require('../src/templatePage').render({
    query: {}, ready: true, lineOk: true, aiOk: true, testTarget: 'Uadmin0000',
    templates: [{ id: 't1', name: 'ใบประกาศ', boxes: 3, when: '2026-09-19 10:00', active: true }],
    cur: {
      id: 't1', name: 'ใบประกาศ', bgFileId: 'x', bgUrl: '', bgMissing: false,
      boxes: [{ text: 'ชื่อผู้รับ', x: 0.15, y: 0.4, w: 0.6, size: 0.08, color: '#1A1D23', align: 'center', shadow: false }],
    },
    nowLabel: now,
  }),
};

fs.mkdirSync(OUT, { recursive: true });
let made = 0;
for (const [name, build] of Object.entries(CASES)) {
  const html = build();
  const file = path.join(OUT, name + '.html');
  fs.writeFileSync(file, html, 'utf8');
  made += 1;
  if (!CHROME) continue;
  try {
    execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--window-size=1280,1600',
      '--screenshot=' + path.join(OUT, name + '.png'),
      'file:///' + file.replace(/\\/g, '/'),
    ], { stdio: 'ignore', timeout: 40000 });
    console.log('📸 ' + name + '.png');
  } catch (e) {
    console.warn('ถ่ายภาพ ' + name + ' ไม่สำเร็จ: ' + e.message);
  }
}
console.log(`\nเขียน HTML ${made} หน้าไว้ที่ ${OUT}`);
if (!CHROME) console.log('ไม่พบ Chrome ในเครื่อง — เปิดไฟล์ .html ในเบราว์เซอร์เองได้เลย (ตั้ง CHROME_PATH เพื่อให้ถ่ายภาพอัตโนมัติ)');
