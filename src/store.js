// ชั้นข้อมูล — เก็บเป็นไฟล์ JSON ใน data/ (ไฟล์ละคอลเลกชัน) ไม่ต้องติดตั้ง DB
// เปลี่ยนไปใช้ Postgres/SQLite ทีหลังได้ โดยแก้แค่ไฟล์นี้ — หน้า admin เรียกผ่านฟังก์ชันข้างล่างเท่านั้น
//
// กฎสำคัญสองข้อที่หน้า admin พึ่งพา:
//   1. read() ของคอลเลกชันที่ "ไฟล์ยังไม่มี" ต้อง throw → deps จะ .catch(() => null)
//      แล้ว render ขึ้น "ยังอ่านข้อมูลไม่ได้" ต่างจากคอลเลกชันที่มีไฟล์แต่ว่าง ([] = ว่างจริง)
//   2. เขียนต้องเป็น atomic (tmp → rename) ไม่งั้นไฟฟ้าดับกลางเขียนแล้วไฟล์พังทั้งก้อน
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const COLLECTIONS = [
  'users', 'aiLogs', 'knowledge', 'docs', 'rules', 'prompts', 'memories',
  'feedback', 'templates', 'folders', 'files', 'headers', 'richmenus', 'contacts', 'settings',
];

const newId = () => crypto.randomBytes(8).toString('hex');
const file = (name) => path.join(DATA_DIR, name + '.json');

// คิวเขียนต่อไฟล์ — กันสองรีเควสต์เขียนคอลเลกชันเดียวกันพร้อมกันแล้วทับกันหาย
const queues = new Map();
function serialize(name, fn) {
  const prev = queues.get(name) || Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(name, next.catch(() => {}));
  return next;
}

async function read(name) {
  // ไม่ catch ENOENT ตรงนี้ — ให้ throw ขึ้นไปเพื่อแยก "ยังไม่ init" ออกจาก "ว่าง"
  const raw = await fsp.readFile(file(name), 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeAll(name, rows) {
  const tmp = file(name) + '.' + process.pid + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(rows, null, 2), 'utf8');
  await fsp.rename(tmp, file(name));   // rename เป็น atomic บน volume เดียวกัน
  return rows;
}

const mutate = (name, fn) => serialize(name, async () => {
  const rows = await read(name);
  const out = await fn(rows);
  await writeAll(name, rows);
  return out;
});

async function insert(name, row) {
  const rec = { id: newId(), createdAt: new Date().toISOString(), ...row };
  await mutate(name, (rows) => { rows.push(rec); });
  return rec;
}
async function update(name, id, patch) {
  return mutate(name, (rows) => {
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('ไม่พบรายการ id=' + id);
    rows[i] = { ...rows[i], ...patch, updatedAt: new Date().toISOString() };
    return rows[i];
  });
}
async function remove(name, id) {
  return mutate(name, (rows) => {
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('ไม่พบรายการ id=' + id);
    return rows.splice(i, 1)[0];
  });
}
async function upsertBy(name, keyField, keyValue, patch) {
  return mutate(name, (rows) => {
    const i = rows.findIndex((r) => r[keyField] === keyValue);
    if (i < 0) {
      const rec = { id: newId(), createdAt: new Date().toISOString(), [keyField]: keyValue, ...patch };
      rows.push(rec);
      return rec;
    }
    rows[i] = { ...rows[i], ...patch, updatedAt: new Date().toISOString() };
    return rows[i];
  });
}

// ---------- settings (key/value) ----------
async function settings() {
  const rows = await read('settings');
  return rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {});
}
const setSetting = (key, value) => upsertBy('settings', 'key', key, { value });

// ---------- init ----------
async function init() {
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  const made = [];
  for (const name of COLLECTIONS) {
    if (!fs.existsSync(file(name))) { await writeAll(name, []); made.push(name); }
  }
  return made;
}

module.exports = {
  DATA_DIR, UPLOAD_DIR, COLLECTIONS,
  newId, read, writeAll, insert, update, remove, upsertBy, mutate,
  settings, setSetting, init,
};
