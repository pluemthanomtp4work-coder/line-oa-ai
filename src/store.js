// ชั้นข้อมูล — มีสอง driver เลือกอัตโนมัติจาก env
//   • supabase : ใช้เมื่อตั้ง SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (โหมดจริง)
//   • memory   : ใช้เมื่อไม่ได้ตั้ง — ข้อมูลอยู่ใน RAM หายเมื่อปิดโปรเซส (เทสต์/ลองเล่น)
//
// ทำไมไม่เก็บไฟล์ JSON บนดิสก์อีกแล้ว: โฮสต์อย่าง Render/Railway/Fly ไฟล์ระบบเป็น ephemeral
// ทุกครั้งที่ deploy ใหม่หรือ container รีสตาร์ต ไฟล์หายหมด ซึ่งบนเครื่อง dev จะไม่มีวันเจอ
//
// รูปตาราง: ส่วนใหญ่เป็น id + jsonb เพราะโค้ดหน้าเว็บอ่านทั้งคอลเลกชันแล้วกรองใน JS อยู่แล้ว
// ยกเว้น knowledge ที่ผูกกับตาราง context ซึ่งเป็นคอลัมน์จริง (เป็นตารางที่ตั้งใจให้คนนอกอ่านเข้าใจ)
const crypto = require('crypto');
const sb = require('./supabase');

const COLLECTIONS = [
  'users', 'aiLogs', 'knowledge', 'docs', 'rules', 'prompts', 'memories',
  'feedback', 'templates', 'folders', 'files', 'headers', 'richmenus', 'contacts', 'settings',
  'formSubmissions',
];

const TABLE = {
  users: 'users', aiLogs: 'ai_logs', knowledge: 'context', docs: 'docs', rules: 'rules',
  prompts: 'prompts', memories: 'memories', feedback: 'feedback', templates: 'templates',
  folders: 'folders', files: 'files', headers: 'headers', richmenus: 'richmenus',
  contacts: 'contacts', settings: 'settings', formSubmissions: 'form_submissions',
};

// context เก็บเป็นคอลัมน์จริง จึงต้องมีตัวแปลงชื่อฟิลด์ระหว่างโค้ด (body/docId) กับตาราง (content/doc_id)
const CONTEXT_COL = { title: 'title', body: 'content', enabled: 'enabled', source: 'source', docId: 'doc_id', tags: 'tags' };

const newId = () => crypto.randomUUID();
const isContext = (name) => name === 'knowledge';

function encode(name, doc) {
  const { id, createdAt, updatedAt, ...rest } = doc || {};
  if (!isContext(name)) return { data: rest };
  const out = {};
  for (const [k, v] of Object.entries(rest)) if (CONTEXT_COL[k]) out[CONTEXT_COL[k]] = v;
  return out;
}

function decode(name, row) {
  const common = { id: row.id, createdAt: row.created_at, updatedAt: row.updated_at };
  if (!isContext(name)) return { ...common, ...(row.data || {}) };
  return {
    ...common,
    title: row.title, body: row.content, enabled: row.enabled,
    source: row.source, docId: row.doc_id, tags: row.tags || [],
  };
}

/** ชื่อคอลัมน์สำหรับ filter — jsonb ต้องยิงผ่าน data->>field และค่าที่ได้เป็น string เสมอ */
function filterExpr(name, field, value) {
  const v = typeof value === 'boolean' ? String(value) : String(value);
  if (isContext(name)) return `${CONTEXT_COL[field] || field}=eq.${encodeURIComponent(v)}`;
  return `data->>${field}=eq.${encodeURIComponent(v)}`;
}

// ================= driver: supabase =================
const supabaseDriver = {
  name: 'supabase',

  async read(name) {
    const rows = await sb.rest(`${TABLE[name]}?select=*&order=created_at.asc`);
    return rows.map((r) => decode(name, r));
  },

  async insert(name, row) {
    const [out] = await sb.rest(TABLE[name], { method: 'POST', body: encode(name, row) });
    return decode(name, out);
  },

  async update(name, id, patch) {
    // jsonb: ส่ง data ทั้งก้อนไม่ได้ เพราะจะทับฟิลด์อื่นที่ไม่ได้แก้ → อ่านของเดิมมา merge ก่อน
    if (!isContext(name)) {
      const [cur] = await sb.rest(`${TABLE[name]}?id=eq.${encodeURIComponent(id)}&select=*`);
      if (!cur) throw new Error('ไม่พบรายการ');
      const merged = { ...(cur.data || {}), ...patch };
      delete merged.id; delete merged.createdAt; delete merged.updatedAt;
      const [out] = await sb.rest(`${TABLE[name]}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { data: merged } });
      return decode(name, out);
    }
    const [out] = await sb.rest(`${TABLE[name]}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: encode(name, patch) });
    if (!out) throw new Error('ไม่พบรายการ');
    return decode(name, out);
  },

  async remove(name, id) {
    const [out] = await sb.rest(`${TABLE[name]}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!out) throw new Error('ไม่พบรายการ');
    return decode(name, out);
  },

  async get(name, id) {
    // id เป็นคอลัมน์จริง ไม่ได้อยู่ใน jsonb จึงยิงตรงไม่ผ่าน filterExpr
    const rows = await sb.rest(`${TABLE[name]}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
    return rows[0] ? decode(name, rows[0]) : null;
  },

  async findBy(name, field, value) {
    const rows = await sb.rest(`${TABLE[name]}?${filterExpr(name, field, value)}&select=*&limit=1`);
    return rows[0] ? decode(name, rows[0]) : null;
  },

  async upsertBy(name, field, value, patch) {
    const found = await this.findBy(name, field, value);
    if (found) return this.update(name, found.id, patch);
    try {
      return await this.insert(name, { [field]: value, ...patch });
    } catch (e) {
      // ชน unique index = มีอีกรีเควสต์แทรกเข้ามาสร้างไปแล้วเสี้ยววินาทีก่อน — อ่านใหม่แล้วอัปเดตแทน
      if (!e.conflict) throw e;
      const again = await this.findBy(name, field, value);
      if (!again) throw e;
      return this.update(name, again.id, patch);
    }
  },

  async updateWhere(name, where, patch) {
    const rows = await sb.rest(`${TABLE[name]}?${filterExpr(name, where.field, where.eq)}&select=id`);
    for (const r of rows) await this.update(name, r.id, patch);
    return rows.length;
  },

  async deleteWhere(name, where) {
    const rows = await sb.rest(`${TABLE[name]}?${filterExpr(name, where.field, where.eq)}`, { method: 'DELETE' });
    return rows.length;
  },

  putFile: (path, buf, mime) => sb.upload(path, buf, mime),
  getFile: (path) => sb.download(path),
  delFile: (path) => sb.removeObject(path),
};

// ================= driver: memory =================
const mem = new Map();
const bucket = (name) => {
  if (!mem.has(name)) mem.set(name, []);
  return mem.get(name);
};
const blobs = new Map();

const memoryDriver = {
  name: 'memory',

  async read(name) { return bucket(name).map((r) => ({ ...r })); },

  async insert(name, row) {
    const rec = { id: newId(), createdAt: new Date().toISOString(), ...row };
    bucket(name).push(rec);
    return { ...rec };
  },

  async update(name, id, patch) {
    const rows = bucket(name);
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('ไม่พบรายการ');
    rows[i] = { ...rows[i], ...patch, updatedAt: new Date().toISOString() };
    return { ...rows[i] };
  },

  async remove(name, id) {
    const rows = bucket(name);
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('ไม่พบรายการ');
    return rows.splice(i, 1)[0];
  },

  async get(name, id) {
    const hit = bucket(name).find((r) => r.id === id);
    return hit ? { ...hit } : null;
  },

  async findBy(name, field, value) {
    const hit = bucket(name).find((r) => String(r[field]) === String(value));
    return hit ? { ...hit } : null;
  },

  async upsertBy(name, field, value, patch) {
    const found = await this.findBy(name, field, value);
    if (found) return this.update(name, found.id, patch);
    return this.insert(name, { [field]: value, ...patch });
  },

  async updateWhere(name, where, patch) {
    const rows = bucket(name).filter((r) => String(r[where.field]) === String(where.eq));
    for (const r of rows) await this.update(name, r.id, patch);
    return rows.length;
  },

  async deleteWhere(name, where) {
    const rows = bucket(name);
    let n = 0;
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (String(rows[i][where.field]) === String(where.eq)) { rows.splice(i, 1); n += 1; }
    }
    return n;
  },

  async putFile(path, buf) { blobs.set(path, buf); return path; },
  async getFile(path) {
    if (!blobs.has(path)) throw new Error('ไม่พบไฟล์');
    return blobs.get(path);
  },
  async delFile(path) { blobs.delete(path); },
};

// ================= หน้าบ้านของโมดูล =================
// เลือก driver ตอนเรียกใช้ ไม่ใช่ตอนโหลดไฟล์ — เทสต์จะได้ตั้ง env ก่อนแล้วยัง require ไฟล์นี้ได้
const driver = () => (sb.configured() ? supabaseDriver : memoryDriver);

const read = (name) => driver().read(name);
const get = (name, id) => driver().get(name, id);
const insert = (name, row) => driver().insert(name, row);
const update = (name, id, patch) => driver().update(name, id, patch);
const remove = (name, id) => driver().remove(name, id);
const findBy = (name, f, v) => driver().findBy(name, f, v);
const upsertBy = (name, f, v, patch) => driver().upsertBy(name, f, v, patch);
const updateWhere = (name, where, patch) => driver().updateWhere(name, where, patch);
const deleteWhere = (name, where) => driver().deleteWhere(name, where);
const putFile = (p, b, m) => driver().putFile(p, b, m);
const getFile = (p) => driver().getFile(p);
const delFile = (p) => driver().delFile(p);

async function settings() {
  const rows = await read('settings');
  return rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {});
}
const setSetting = (key, value) => upsertBy('settings', 'key', key, { value });

/** ตรวจว่าทุกคอลเลกชันอ่านได้จริง — คืนรายชื่อตัวที่มีปัญหาพร้อมสาเหตุ */
async function init() {
  const d = driver();
  const broken = [];
  for (const name of COLLECTIONS) {
    try { await d.read(name); }
    catch (e) { broken.push(`${name} (${TABLE[name]}): ${e.message}`); }
  }
  return { driver: d.name, broken };
}

module.exports = {
  COLLECTIONS, TABLE, newId,
  read, get, insert, update, remove, findBy, upsertBy, updateWhere, deleteWhere,
  putFile, getFile, delFile,
  settings, setSetting, init,
  driverName: () => driver().name,
};
