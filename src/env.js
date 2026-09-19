// โหลด .env เอง — เล็กเกินกว่าจะลง dependency เพิ่ม
// กฎ: ค่าที่ตั้งไว้ใน environment จริงอยู่แล้วชนะเสมอ (เช่นบน production ที่ตั้งผ่าน panel)
const fs = require('fs');
const path = require('path');

function load(file) {
  const p = file || path.join(__dirname, '..', '.env');
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return false; }
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    const key = s.slice(0, i).trim();
    let val = s.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
  return true;
}

module.exports = { load };
