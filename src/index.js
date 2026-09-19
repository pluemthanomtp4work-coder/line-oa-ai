// เซิร์ฟเวอร์หลัก — LINE webhook + หน้าหลังบ้าน 8 หน้า
// ทุก route ของหลังบ้านขึ้นต้นด้วย gate.requireAdmin เสมอ ไม่มีข้อยกเว้น
require('./env').load();

const express = require('express');
const path = require('path');
const fsp = require('fs/promises');

const store = require('./store');
const gate = require('./adminGate');
const mp = require('./multipart');
const line = require('./line');
const ai = require('./ai');
const bot = require('./bot');
const signed = require('./signedLink');

const dash = require('./adminPage');
const training = require('./trainingPage');
const template = require('./templatePage');
const filesPage = require('./filesPage');
const header = require('./headerAdminPage');
const menu = require('./menuAdminPage');
const contacts = require('./contactsPage');
const users = require('./usersPage');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_MB || 8) * 1024 * 1024;
const ADMIN_IDS = String(process.env.LINE_ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);

// ---------- body parsers ----------
// webhook ต้องได้ raw buffer ไว้ตรวจลายเซ็น — JSON.stringify ของ object ที่ parse แล้วให้ byte ไม่ตรงเดิม
app.post('/line/webhook', express.raw({ type: '*/*', limit: '1mb' }), onWebhook);
// ขาดบรรทัดนี้ req.body = undefined → POST ทุกอันเด้ง 401 เพราะหา key ในฟอร์มไม่เจอ
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(express.raw({ type: 'multipart/form-data', limit: MAX_UPLOAD }), mp.middleware);

// ---------- helpers ----------
const nowLabel = () => new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
const list = (name) => () => store.read(name);

const deps = {
  listUsers: list('users'), listAiLogs: list('aiLogs'), listKnowledge: list('knowledge'),
  listDocs: list('docs'), listRules: list('rules'), listPrompts: list('prompts'),
  listMemories: list('memories'), listFeedback: list('feedback'), listTemplates: list('templates'),
  listFolders: list('folders'), listFiles: list('files'), listHeaders: list('headers'),
  listRichMenus: list('richmenus'), listContacts: list('contacts'),
  settings: () => store.settings(),
  lineQuota: async () => {
    if (!line.configured()) return null;
    const [q, used] = await Promise.all([line.quota(), line.quotaUsed()]);
    return { limit: q.type === 'limited' ? q.value : 0, used: used.totalUsage || 0 };
  },
  lineRichMenus: () => (line.configured() ? line.listRichMenus() : Promise.resolve(null)),
  adminUserIds: ADMIN_IDS,
  aiKeyOk: ai.hasKey(),
  aiModel: ai.DEFAULT_MODEL,
  lineOk: line.configured(),
  usdThb: ai.USD_THB,
  nowLabel,
};

/** ผูกหน้า GET หนึ่งหน้า — ด่านกั้น + try/catch ที่ไม่ปล่อย stack ออกหน้าเว็บ */
function pageRoute(route, mod, tab) {
  app.get(route, async (req, res) => {
    if (!gate.requireAdmin(req, res)) return;
    try {
      res.type('html').send(await mod.page(deps, req.query));
    } catch (e) {
      console.error(`[${tab}]`, e);
      res.status(500).send('โหลดหน้าไม่ได้ — ดู log ของเซิร์ฟเวอร์');
    }
  });
}

/**
 * ผูก POST หนึ่งอัน — ด่านกั้น + PRG กลับหน้าเดิมพร้อม flash เสมอ
 * back เป็น string หรือฟังก์ชัน (req) => path ก็ได้
 * ถ้า fn ตั้ง req._back ไว้ (เช่นเพิ่งสร้างแถวใหม่แล้วอยากเด้งไปแถวนั้น) จะใช้ค่านั้นแทน
 */
function action(route, back, fn) {
  const target = (req) => req._back || (typeof back === 'function' ? back(req) : back);
  app.post(route, async (req, res) => {
    if (!gate.requireAdmin(req, res)) return;
    if (req.uploadError) return gate.err(res, target(req), 'อ่านไฟล์ที่อัปไม่ได้: ' + req.uploadError);
    try {
      const msg = await fn(req, res);
      if (res.headersSent) return undefined;
      return gate.ok(res, target(req), msg || 'บันทึกแล้ว');
    } catch (e) {
      console.error('[action]', route, e.message);
      return gate.err(res, target(req), e.message || 'ทำรายการไม่สำเร็จ');
    }
  });
}

const one = (v) => (Array.isArray(v) ? v[0] : v);
const many = (v) => (v == null ? [] : [].concat(v));
const bool = (v) => one(v) === '1' || one(v) === 'on' || one(v) === 'true';
const need = (v, what) => { const s = String(one(v) || '').trim(); if (!s) throw new Error('ต้องกรอก' + what); return s; };

// เขียนไฟล์ที่อัปลง data/uploads แล้วบันทึกแถวในตาราง files
async function saveUpload(file, folderId) {
  if (!file || !file.data || !file.data.length) throw new Error('ไม่ได้เลือกไฟล์');
  if (file.data.length > MAX_UPLOAD) throw new Error('ไฟล์ใหญ่เกิน ' + Math.round(MAX_UPLOAD / 1024 / 1024) + ' MB');
  const safe = String(file.filename).replace(/[^\w.\-฀-๿ ]+/g, '_').slice(0, 120);
  const rec = await store.insert('files', {
    name: safe, size: file.data.length, mime: file.mime,
    folderId: folderId || '', allow: [], trashed: false, stored: '',
  });
  const stored = rec.id + path.extname(safe);
  await fsp.writeFile(path.join(store.UPLOAD_DIR, stored), file.data);
  await store.update('files', rec.id, { stored });
  return { ...rec, stored };
}

// ================= LINE webhook =================
async function onWebhook(req, res) {
  if (!line.configured()) return res.status(503).send('ยังไม่ได้ตั้งค่า LINE');
  if (!line.verify(req.body, req.headers['x-line-signature'])) return res.status(401).send('bad signature');
  // ตอบ 200 ให้ LINE ทันที แล้วค่อยทำงานต่อ — ช้าเกิน 1 วินาที LINE จะยิงซ้ำ
  res.status(200).end();
  let payload;
  try { payload = JSON.parse(req.body.toString('utf8')); }
  catch (e) { return console.error('[webhook] json พัง:', e.message); }
  line.handleEvents(payload.events).catch((e) => console.error('[webhook]', e));
  return undefined;
}

// ================= หน้าเว็บ =================
pageRoute('/admin', dash, 'dash');
pageRoute('/training', training, 'training');
pageRoute('/admin/template', template, 'template');
pageRoute('/files', filesPage, 'files');
pageRoute('/admin/header', header, 'header');
pageRoute('/admin/menu', menu, 'menu');
pageRoute('/contacts', contacts, 'contacts');
pageRoute('/admin/users', users, 'users');

app.get('/', (req, res) => res.redirect('/admin' + (req.query.key ? '?key=' + encodeURIComponent(req.query.key) : '')));
app.get('/healthz', (req, res) => res.json({ ok: true, line: line.configured(), ai: ai.hasKey() }));

// ไฟล์เสิร์ฟผ่าน route ของเราเองเสมอ + ต้องมีลายเซ็นที่ยังไม่หมดอายุ
app.get('/files/open/:id', async (req, res) => {
  const { id } = req.params;
  if (!signed.verify(id, req.query.exp, req.query.sig)) return res.status(403).send('ลิงก์หมดอายุหรือไม่ถูกต้อง');
  try {
    const rows = await store.read('files');
    const f = rows.find((x) => x.id === id);
    if (!f || !f.stored) return res.status(404).send('ไม่พบไฟล์');
    res.type(f.mime || 'application/octet-stream');
    res.setHeader('cache-control', 'private, max-age=300');
    res.send(await fsp.readFile(path.join(store.UPLOAD_DIR, f.stored)));
  } catch (e) {
    res.status(404).send('ไม่พบไฟล์');
  }
});

// ================= Dashboard =================
action('/admin/settings/numbers', '/admin', async (req) => {
  const b = req.body;
  const set = async (k, v) => { if (String(v || '').trim() !== '') await store.setSetting(k, Number(v)); };
  await set('budgetThb', b.budgetThb);
  await set('dailyCallCap', b.dailyCallCap);
  await set('usdThb', b.usdThb);
  if (String(b.billActualThb || '').trim() === '') await store.setSetting('billActualThb', null);
  else await store.setSetting('billActualThb', Number(b.billActualThb));
  return 'บันทึกตัวเลขแล้ว';
});

action('/admin/user/delete', '/admin', async (req) => {
  const id = need(req.body.id, 'id');
  await assertNotAdmin(id);          // ปุ่มลบในหน้า Dashboard ก็ต้องกันแอดมินเหมือนหน้าผู้ใช้
  await store.remove('users', id);
  return 'ลบผู้ใช้แล้ว';
});

// ================= ผู้ใช้ =================
async function assertNotAdmin(id) {
  const rows = await store.read('users');
  const row = rows.find((x) => x.id === id);
  if (!row) throw new Error('ไม่พบผู้ใช้');
  // กันล็อกตัวเองออก — แอดมินมาจาก .env เท่านั้น แถวในตารางแก้สถานะแอดมินไม่ได้
  if (ADMIN_IDS.includes(row.lineUserId)) throw new Error('แก้แถวของแอดมินไม่ได้ (แก้ที่ .env)');
  return row;
}

action('/admin/users/role', '/admin/users', async (req) => {
  const id = need(req.body.id, 'id');
  await assertNotAdmin(id);
  const role = one(req.body.role) === 'member' ? 'member' : 'guest';
  await store.update('users', id, { role });
  return role === 'member' ? 'ตั้งเป็นสมาชิกแล้ว' : 'ตั้งเป็นผู้ใช้ทั่วไปแล้ว';
});

action('/admin/users/perm', '/admin/users', async (req) => {
  const id = need(req.body.id, 'id');
  const row = await assertNotAdmin(id);
  const perm = need(req.body.perm, 'ชื่อสิทธิ์');
  if (!users.PERMS.some(([k]) => k === perm)) throw new Error('ไม่รู้จักสิทธิ์นี้');
  await store.update('users', id, { perms: { ...(row.perms || {}), [perm]: bool(req.body.value) } });
  return 'อัปเดตสิทธิ์แล้ว';
});

action('/admin/users/block', '/admin/users', async (req) => {
  const id = need(req.body.id, 'id');
  await assertNotAdmin(id);
  const blocked = bool(req.body.value);
  await store.update('users', id, { blocked });
  return blocked ? 'บล็อกแล้ว' : 'ปลดบล็อกแล้ว';
});

action('/admin/users/refresh', '/admin/users', async (req) => {
  const rows = await store.read('users');
  const row = rows.find((x) => x.id === one(req.body.id));
  if (!row) throw new Error('ไม่พบผู้ใช้');
  if (!line.configured()) throw new Error('ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN');
  const p = await line.profile(row.lineUserId);
  await store.update('users', row.id, { displayName: p.displayName || row.displayName, pictureUrl: p.pictureUrl || null });
  return 'ดึงโปรไฟล์ใหม่แล้ว';
});

// bulk — ติ๊กหลายแถวแล้วสั่งพร้อมกัน (มี 300 คนแล้วกดทีละแถวไม่ไหว)
function bulk(route, label, fn) {
  action(route, '/admin/users', async (req) => {
    const ids = many(req.body.ids);
    if (!ids.length) throw new Error('ยังไม่ได้เลือกใครเลย');
    let done = 0; const skipped = [];
    for (const id of ids) {
      try { await assertNotAdmin(id); await fn(id); done += 1; }
      catch (e) { skipped.push(e.message); }
    }
    return `${label} ${done} คน${skipped.length ? ` · ข้าม ${skipped.length} คน (${skipped[0]})` : ''}`;
  });
}
// ฟอร์ม bulk ชี้มาที่นี่เป็นค่าเริ่มต้น — กด Enter ในช่องค้นหาแล้วจะไม่เผลอสั่งอะไรกับคนที่ติ๊กไว้
action('/admin/users/bulk/noop', '/admin/users', async () => 'ไม่มีอะไรเปลี่ยน (กด Enter ในช่องค้นหา)');
bulk('/admin/users/bulk/role-member', 'ตั้งเป็นสมาชิก', (id) => store.update('users', id, { role: 'member' }));
bulk('/admin/users/bulk/role-guest', 'ตั้งเป็นผู้ใช้ทั่วไป', (id) => store.update('users', id, { role: 'guest' }));
bulk('/admin/users/bulk/block', 'บล็อก', (id) => store.update('users', id, { blocked: true }));
bulk('/admin/users/bulk/unblock', 'ปลดบล็อก', (id) => store.update('users', id, { blocked: false }));
bulk('/admin/users/bulk/delete', 'ลบ', (id) => store.remove('users', id));

// ================= สอนบอท =================
action('/training/knowledge/save', '/training', async (req) => {
  const title = need(req.body.title, 'หัวข้อ');
  const body = need(req.body.body, 'เนื้อหา');
  const id = String(one(req.body.id) || '');
  if (id) { await store.update('knowledge', id, { title, body }); return 'แก้ความรู้แล้ว'; }
  await store.insert('knowledge', { title, body, enabled: true, source: 'manual' });
  return 'เพิ่มความรู้แล้ว';
});
action('/training/knowledge/toggle', '/training', async (req) => {
  await store.update('knowledge', need(req.body.id, 'id'), { enabled: bool(req.body.value) });
  return 'อัปเดตสถานะแล้ว';
});
action('/training/knowledge/enable-all', '/training', async () => {
  let n = 0;
  await store.mutate('knowledge', (rows) => rows.forEach((r) => { if (!r.enabled) { r.enabled = true; n += 1; } }));
  return `เปิดใช้เพิ่ม ${n} ข้อ`;
});
action('/training/knowledge/delete', '/training', async (req) => {
  await store.remove('knowledge', need(req.body.id, 'id'));
  return 'ลบความรู้แล้ว';
});

action('/training/docs/upload', '/training', async (req) => {
  const f = req.file;
  if (!f) throw new Error('ไม่ได้เลือกไฟล์');
  const text = f.data.toString('utf8');
  if (/�/.test(text.slice(0, 2000))) throw new Error('อ่านไฟล์เป็นข้อความไม่ได้ (รองรับ .md / .txt เท่านั้น)');
  // ตัดเป็นข้อๆ ตามหัวข้อ markdown — ไม่มีหัวข้อก็เก็บเป็นข้อเดียว
  const chunks = text.split(/\n(?=#{1,3}\s)/).map((s) => s.trim()).filter(Boolean);
  const doc = await store.insert('docs', { name: f.filename, size: f.data.length, status: 'pending', items: 0 });
  let n = 0;
  for (const c of chunks) {
    const mTitle = /^#{1,3}\s*(.+)/.exec(c);
    await store.insert('knowledge', {
      title: (mTitle ? mTitle[1] : f.filename).slice(0, 120),
      body: c.replace(/^#{1,3}\s*.+\n?/, '').trim() || c,
      enabled: false, source: 'doc', docId: doc.id,
    });
    n += 1;
  }
  await store.update('docs', doc.id, { status: 'imported', items: n, note: `แปลงเป็นความรู้ ${n} ข้อ (สถานะร่าง)` });
  return `แปลงเป็นความรู้ ${n} ข้อแล้ว — ตรวจแล้วกด "เปิดใช้ทั้งหมด"`;
});
action('/training/docs/delete', '/training', async (req) => {
  const id = need(req.body.id, 'id');
  await store.mutate('knowledge', (rows) => {
    for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i].docId === id) rows.splice(i, 1);
  });
  await store.remove('docs', id);
  return 'ลบเอกสารและความรู้ที่มาจากไฟล์นี้แล้ว';
});

action('/training/rules/save', '/training', async (req) => {
  const keywords = String(one(req.body.keywords) || '').split(',').map((s) => s.trim()).filter(Boolean);
  // บังคับว่าต้องมีคำค้น — กฎที่ไม่มีคำค้นจะไม่ทำงานเลยแบบเงียบๆ แล้วหาสาเหตุไม่เจอ
  if (!keywords.length) throw new Error('ต้องใส่คำค้นอย่างน้อย 1 คำ');
  const act = ['reply', 'handoff', 'silent'].includes(one(req.body.action)) ? one(req.body.action) : 'reply';
  if (act === 'reply' && !String(one(req.body.reply) || '').trim()) throw new Error('กฎแบบ "ตอบข้อความตายตัว" ต้องใส่ข้อความตอบ');
  await store.insert('rules', { keywords, action: act, reply: String(one(req.body.reply) || ''), enabled: true });
  return 'เพิ่มกฎแล้ว';
});
action('/training/rules/toggle', '/training', async (req) => {
  await store.update('rules', need(req.body.id, 'id'), { enabled: bool(req.body.value) });
  return 'อัปเดตกฎแล้ว';
});
action('/training/rules/delete', '/training', async (req) => {
  await store.remove('rules', need(req.body.id, 'id'));
  return 'ลบกฎแล้ว';
});

action('/training/prompts/save', '/training', async (req) => {
  const rows = await store.read('prompts');
  await store.insert('prompts', {
    name: need(req.body.name, 'ชื่อชุด'), body: need(req.body.body, 'คำสั่งบุคลิก'),
    active: rows.length === 0,     // ชุดแรกถูกเลือกใช้อัตโนมัติ ไม่งั้นเพิ่มแล้วไม่มีผลอะไรเลย
  });
  return 'เพิ่มชุดบุคลิกแล้ว';
});
action('/training/prompts/activate', '/training', async (req) => {
  const id = need(req.body.id, 'id');
  await store.mutate('prompts', (rows) => rows.forEach((r) => { r.active = r.id === id; }));
  return 'เปลี่ยนบุคลิกที่ใช้งานแล้ว';
});
action('/training/prompts/delete', '/training', async (req) => {
  const id = need(req.body.id, 'id');
  const row = (await store.read('prompts')).find((r) => r.id === id);
  await store.remove('prompts', id);
  // ลบชุดที่ใช้อยู่ → เลื่อนชุดแรกที่เหลือขึ้นมาแทน ไม่ปล่อยให้บอทไม่มีบุคลิก
  if (row && row.active) {
    await store.mutate('prompts', (rows) => { if (rows[0]) rows[0].active = true; });
  }
  return 'ลบชุดบุคลิกแล้ว';
});

action('/training/memory/save', '/training', async (req) => {
  const scope = one(req.body.scope) === 'user' ? 'user' : 'global';
  const userId = String(one(req.body.userId) || '').trim();
  if (scope === 'user' && !userId) throw new Error('ความจำรายคนต้องใส่ LINE user id');
  await store.insert('memories', { scope, userId: scope === 'user' ? userId : null, text: need(req.body.text, 'ข้อความ'), enabled: true });
  return 'เพิ่มความจำแล้ว';
});
action('/training/memory/toggle', '/training', async (req) => {
  await store.update('memories', need(req.body.id, 'id'), { enabled: bool(req.body.value) });
  return 'อัปเดตแล้ว';
});
action('/training/memory/delete', '/training', async (req) => {
  await store.remove('memories', need(req.body.id, 'id'));
  return 'ลบความจำแล้ว';
});

action('/training/feedback/promote', '/training', async (req) => {
  const id = need(req.body.id, 'id');
  const row = (await store.read('feedback')).find((r) => r.id === id);
  if (!row) throw new Error('ไม่พบรายการ');
  await store.insert('knowledge', {
    title: String(row.question).slice(0, 120), body: String(row.answer || ''),
    enabled: false, source: 'feedback',      // เป็นร่างก่อนเสมอ — คำตอบเดิมคือคำตอบที่ผู้ใช้บอกว่าไม่ดี
  });
  await store.update('feedback', id, { promoted: true });
  return 'เลื่อนขึ้นเป็นความรู้แล้ว (สถานะร่าง — แก้คำตอบก่อนเปิดใช้)';
});
action('/training/feedback/delete', '/training', async (req) => {
  await store.remove('feedback', need(req.body.id, 'id'));
  return 'ลบแล้ว';
});

app.post('/training/try', async (req, res) => {
  if (!gate.requireAdmin(req, res)) return;
  const q = String(one(req.body.q) || '').trim();
  if (!q) return gate.err(res, '/training', 'ยังไม่ได้พิมพ์คำถาม');
  try {
    const out = await bot.reply(q, { userId: 'admin-test', feature: 'ทดลองแชท' });
    return gate.back(res, '/training', [
      'tq=' + encodeURIComponent(q),
      'ta=' + encodeURIComponent(String(out.text || '(กฎนี้ตั้งให้ไม่ตอบ)').slice(0, 1200)),
      'tv=' + encodeURIComponent(out.via),
    ].join('&'));
  } catch (e) {
    return gate.err(res, '/training', 'ทดลองไม่สำเร็จ: ' + e.message);
  }
});

// ================= คลังไฟล์ =================
// กลับไปโฟลเดอร์ที่กำลังดูอยู่ ถ้าฟอร์มนั้นบอกมา
const backFiles = (req) => '/files' + (one(req.body.folderId) ? '?folder=' + encodeURIComponent(one(req.body.folderId)) : '');
action('/files/folder/create', backFiles, async (req) => {
  await store.insert('folders', { name: need(req.body.name, 'ชื่อโฟลเดอร์') });
  return 'สร้างโฟลเดอร์แล้ว';
});
action('/files/upload', backFiles, async (req) => {
  const f = await saveUpload(req.file, one(req.body.folderId));
  return `อัป ${f.name} แล้ว`;
});
action('/files/save', backFiles, async (req) => {
  await store.update('files', need(req.body.id, 'id'), {
    name: need(req.body.name, 'ชื่อไฟล์'),
    folderId: String(one(req.body.folderId) || ''),
    allow: many(req.body.allow),
  });
  return 'บันทึกแล้ว';
});
action('/files/trash', backFiles, async (req) => {
  await store.update('files', need(req.body.id, 'id'), { trashed: true });
  return 'ย้ายลงถังขยะแล้ว (กู้คืนได้)';
});
action('/files/restore', backFiles, async (req) => {
  await store.update('files', need(req.body.id, 'id'), { trashed: false });
  return 'กู้คืนแล้ว';
});
action('/files/purge', backFiles, async (req) => {
  const row = await store.remove('files', need(req.body.id, 'id'));
  if (row.stored) await fsp.unlink(path.join(store.UPLOAD_DIR, row.stored)).catch(() => {});
  return 'ลบถาวรแล้ว';
});

// ================= หัวการ์ด =================
// เด้งกลับแท็บการ์ดเดิมเสมอ — บันทึกการ์ด "ต้อนรับ" แล้วเด้งไปการ์ด "คำตอบ" ทำให้งงว่าบันทึกอะไรไป
const backCard = (req) => '/admin/header?card=' + encodeURIComponent(one(req.body.cardType) || '');

action('/admin/header/save', backCard, async (req) => {
  const cardType = need(req.body.cardType, 'ชนิดการ์ด');
  const theme = header.THEMES[one(req.body.theme)] ? one(req.body.theme) : header.DEFAULT_THEME;
  await store.upsertBy('headers', 'cardType', cardType, { theme, title: String(one(req.body.title) || '') });
  return 'บันทึกหัวการ์ดแล้ว';
});
action('/admin/header/apply-all', backCard, async (req) => {
  const theme = header.THEMES[one(req.body.theme)] ? one(req.body.theme) : header.DEFAULT_THEME;
  for (const [k] of header.CARD_TYPES) await store.upsertBy('headers', 'cardType', k, { theme });
  return 'ใช้ธีมนี้กับทุกการ์ดแล้ว';
});
action('/admin/header/reset', backCard, async (req) => {
  const cardType = need(req.body.cardType, 'ชนิดการ์ด');
  const row = (await store.read('headers')).find((h) => h.cardType === cardType);
  if (row) await store.remove('headers', row.id);
  return 'คืนค่าเดิมแล้ว';
});
action('/admin/header/bg', backCard, async (req) => {
  const cardType = need(req.body.cardType, 'ชนิดการ์ด');
  if (!/^image\//.test((req.file || {}).mime || '')) throw new Error('ต้องเป็นไฟล์รูป (png/jpeg)');
  const f = await saveUpload(req.file, '');
  await store.upsertBy('headers', 'cardType', cardType, { bgFileId: f.id });
  return 'เปลี่ยนรูปพื้นหลังแล้ว';
});
action('/admin/header/test', backCard, async (req) => {
  if (!line.configured()) throw new Error('ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN');
  const cardType = need(req.body.cardType, 'ชนิดการ์ด');
  const meta = header.CARD_TYPES.find(([k]) => k === cardType);
  await line.pushText(need(req.body.to, 'LINE user id'),
    `[ทดสอบหัวการ์ด] ${meta ? meta[1] : cardType}\nนี่คือข้อความตัวอย่างจากหน้าหลังบ้าน`);
  return 'ส่งทดสอบแล้ว';
});

// ================= เมนู LINE =================
function readMenuForm(b) {
  const size = menu.SIZES[one(b.size)] ? one(b.size) : 'large';
  const cols = Number(one(b.cols)) === 2 ? 2 : 3;
  const slots = menu.SIZES[size].rows * cols;
  const buttons = [];
  for (let i = 0; i < slots; i += 1) {
    const label = String(one(b['label' + i]) || '').trim();
    const value = String(one(b['value' + i]) || '').trim();
    if (!label && !value) continue;
    const actionType = one(b['actionType' + i]) === 'uri' ? 'uri' : 'message';
    if (actionType === 'uri' && !/^https?:\/\//i.test(value)) throw new Error(`ปุ่มที่ ${i + 1} ตั้งเป็นเปิดลิงก์ ต้องใส่ URL ที่ขึ้นต้นด้วย http(s)://`);
    if (actionType === 'message' && !value) throw new Error(`ปุ่มที่ ${i + 1} ต้องใส่ข้อความที่จะส่งให้บอท`);
    // เก็บ slot ไว้ด้วย — เว้นปุ่มกลางว่างแล้วปุ่มหลังต้องไม่เลื่อนขึ้นมากินช่องที่ว่าง
    // ไม่งั้นรูปที่วาดกับพื้นที่กดที่ส่งให้ LINE จะคนละตำแหน่งกัน
    buttons.push({ slot: i, label, value, actionType, icon: String(one(b['icon' + i]) || ''), color: String(one(b['color' + i]) || '#2D6CDF') });
  }
  if (!buttons.length) throw new Error('ต้องมีปุ่มอย่างน้อย 1 ปุ่ม');
  return { name: need(b.name, 'ชื่อเมนู'), size, cols, buttons };
}

action('/admin/menu/save', '/admin/menu', async (req) => {
  const data = readMenuForm(req.body);
  const id = String(one(req.body.id) || '');
  if (id) {
    await store.update('richmenus', id, data);
    req._back = '/admin/menu?id=' + encodeURIComponent(id);
    return 'บันทึกร่างแล้ว';
  }
  const rec = await store.insert('richmenus', { ...data, published: false });
  req._back = '/admin/menu?id=' + encodeURIComponent(rec.id);   // เด้งกลับไปที่ร่างที่เพิ่งสร้าง
  return 'สร้างร่างเมนูแล้ว';
});

action('/admin/menu/delete', '/admin/menu', async (req) => {
  await store.remove('richmenus', need(req.body.id, 'id'));
  return 'ลบร่างแล้ว';
});

action('/admin/menu/publish', '/admin/menu', async (req) => {
  if (!line.configured()) throw new Error('ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN');
  const data = readMenuForm(req.body);
  const dataUrl = String(one(req.body.image) || '');
  const mImg = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrl);
  if (!mImg) throw new Error('ไม่ได้รูปจากพรีวิว — ลองรีโหลดหน้าแล้วกดใหม่');
  const img = Buffer.from(mImg[2], 'base64');

  const size = menu.SIZES[data.size];
  const cw = Math.floor(size.w / data.cols);
  const ch = Math.floor(size.h / size.rows);
  // พื้นที่ปุ่มคิดจากกริดเท่าๆ กัน จึงไม่ทับกันแน่นอน — LINE ปฏิเสธทั้งชุดถ้าทับ
  const areas = data.buttons.map((b) => ({
    bounds: { x: (b.slot % data.cols) * cw, y: Math.floor(b.slot / data.cols) * ch, width: cw, height: ch },
    action: b.actionType === 'uri' ? { type: 'uri', label: b.label.slice(0, 20), uri: b.value }
      : { type: 'message', label: b.label.slice(0, 20), text: b.value },
  }));

  const created = await line.createRichMenu({
    size: { width: size.w, height: size.h },
    selected: true, name: data.name.slice(0, 300), chatBarText: data.name.slice(0, 14),
    areas,
  });
  await line.uploadRichMenuImage(created.richMenuId, img, 'image/png');
  await line.setDefaultRichMenu(created.richMenuId);

  const id = String(one(req.body.id) || '');
  const saved = id ? await store.update('richmenus', id, { ...data, published: true, lineRichMenuId: created.richMenuId })
    : await store.insert('richmenus', { ...data, published: true, lineRichMenuId: created.richMenuId });
  req._back = '/admin/menu?id=' + encodeURIComponent(saved.id);

  // ร่างอื่นที่เคยเผยแพร่ไม่ใช่ตัวปัจจุบันแล้ว + เก็บกวาดเมนูเก่าบน LINE (มีลิมิตจำนวนชุด)
  await store.mutate('richmenus', (rows) => rows.forEach((r) => { if (r.id !== saved.id) r.published = false; }));
  try {
    const live = await line.listRichMenus();
    for (const r of live.richmenus || []) {
      if (r.richMenuId !== created.richMenuId) await line.deleteRichMenu(r.richMenuId).catch(() => {});
    }
  } catch (e) { console.warn('[menu] เก็บกวาดเมนูเก่าไม่สำเร็จ:', e.message); }

  return 'เผยแพร่เข้า LINE แล้ว — ผู้ใช้เห็นเมนูใหม่ทันที';
});

// ================= Template =================
action('/admin/template/create', '/admin/template', async (req) => {
  if (!/^image\//.test((req.file || {}).mime || '')) throw new Error('ต้องเป็นไฟล์รูป (png/jpeg)');
  const f = await saveUpload(req.file, '');
  const t = await store.insert('templates', { name: need(req.body.name, 'ชื่อแม่แบบ'), bgFileId: f.id, boxes: [] });
  req._back = '/admin/template?id=' + encodeURIComponent(t.id);
  return 'สร้างแม่แบบ ' + t.name + ' แล้ว';
});
// เด้งกลับแม่แบบเดิมเสมอ ไม่งั้นบันทึกแล้วหน้ากระโดดไปแม่แบบอื่น
const backTpl = (req) => '/admin/template?id=' + encodeURIComponent(one(req.body.id) || '');

action('/admin/template/bg', backTpl, async (req) => {
  if (!/^image\//.test((req.file || {}).mime || '')) throw new Error('ต้องเป็นไฟล์รูป (png/jpeg)');
  const f = await saveUpload(req.file, '');
  await store.update('templates', need(req.body.id, 'id'), { bgFileId: f.id });
  return 'เปลี่ยนรูปพื้นหลังแล้ว — กล่องข้อความยังอยู่ที่เดิมตามสัดส่วน';
});
action('/admin/template/save', backTpl, async (req) => {
  let boxes;
  try { boxes = JSON.parse(String(one(req.body.boxes) || '[]')); }
  catch { throw new Error('ข้อมูลกล่องข้อความเสียหาย — ลองรีโหลดหน้าแล้วแก้ใหม่'); }
  if (!Array.isArray(boxes)) throw new Error('ข้อมูลกล่องข้อความไม่ถูกต้อง');
  await store.update('templates', need(req.body.id, 'id'), {
    name: need(req.body.name, 'ชื่อแม่แบบ'),
    boxes: boxes.slice(0, 20).map(template.normBox),     // normBox บีบพิกัดให้อยู่ใน 0–1 เสมอ
  });
  return 'บันทึกแม่แบบแล้ว';
});
action('/admin/template/delete', '/admin/template', async (req) => {
  await store.remove('templates', need(req.body.id, 'id'));
  return 'ลบแม่แบบแล้ว';
});
action('/admin/template/test', backTpl, async (req) => {
  if (!line.configured()) throw new Error('ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN');
  const t = (await store.read('templates')).find((x) => x.id === one(req.body.id));
  if (!t) throw new Error('ไม่พบแม่แบบ');
  const text = (t.boxes || []).map((b) => b.text).filter(Boolean).join('\n');
  await line.pushText(need(req.body.to, 'LINE user id'), `[ทดสอบแม่แบบ ${t.name}]\n${text || '(ยังไม่มีข้อความในกล่อง)'}`);
  return 'ส่งทดสอบแล้ว';
});

// ================= รายชื่อ =================
action('/contacts/save', '/contacts', async (req) => {
  await store.upsertBy('contacts', 'lineUserId', need(req.body.lineUserId, 'LINE user id'), {
    alias: String(one(req.body.alias) || '').trim(),
    note: String(one(req.body.note) || '').trim(),
  });
  return 'บันทึกชื่อเรียกแล้ว';
});
action('/contacts/delete', '/contacts', async (req) => {
  await store.remove('contacts', need(req.body.id, 'id'));
  return 'ลบชื่อเรียกแล้ว';
});

// ================= start =================
if (require.main === module) {
  store.init()
    .then((made) => {
      if (made.length) console.log('[init] สร้างไฟล์ข้อมูล:', made.join(', '));
      app.listen(PORT, () => {
        console.log(`เปิดที่ http://localhost:${PORT}/admin?key=${process.env.ADMIN_KEY || '<ยังไม่ได้ตั้ง ADMIN_KEY>'}`);
        if (!gate.ADMIN_KEY) console.warn('⚠️  ยังไม่ได้ตั้ง ADMIN_KEY ใน .env — หน้าหลังบ้านจะตอบ 503');
        if (!line.configured()) console.warn('⚠️  ยังไม่ได้ตั้งค่า LINE — webhook จะตอบ 503');
        if (!ai.hasKey()) console.warn('⚠️  ยังไม่ได้ตั้ง GEMINI_API_KEY — บอทจะตอบไม่ได้');
      });
    })
    .catch((e) => { console.error('เริ่มระบบไม่ได้:', e); process.exit(1); });
}

module.exports = app;
