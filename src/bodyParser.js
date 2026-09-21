// อ่าน body เอง แทน express.json/urlencoded/raw
//
// ทำไมไม่ใช้ของ Express: express/lib/express.js อ่าน getter ของ body-parser ตั้งแต่ตอน require
// (บรรทัด 78-83) ซึ่งลาก raw-body -> iconv-lite เข้ามา แล้ว iconv-lite พังตอน bundle เข้า
// Cloudflare Workers ด้วย "require_streams(...) is not a function"
// เราใช้แค่ urlencoded กับ raw ซึ่งเขียนเองสั้นกว่าที่คิด และตัด dependency สองชั้นออกไปเลย
//
// ผลพลอยได้: multipart กับ webhook ได้ Buffer ดิบเหมือนเดิม ไม่ต้องมี middleware แยกสามชุด

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const fail = (err) => { if (!done) { done = true; reject(err); } };
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      // ตัดตั้งแต่ตอนรับ ไม่ใช่ตอน parse — ไม่งั้นไฟล์ 500MB กินแรมไปแล้วก่อนจะรู้ตัว
      if (size > limit) {
        fail(Object.assign(new Error('ข้อมูลที่ส่งมาใหญ่เกินกำหนด'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', fail);
  });
}

/** urlencoded -> object ชื่อซ้ำเก็บเป็น array เหมือนที่ express ทำ (checkbox หลายตัวพึ่งพฤติกรรมนี้) */
function parseUrlencoded(buf) {
  const out = {};
  for (const [k, v] of new URLSearchParams(buf.toString('utf8'))) {
    // กัน prototype pollution จากฟอร์มที่ส่ง __proto__ เข้ามา
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (Object.prototype.hasOwnProperty.call(out, k)) out[k] = [].concat(out[k], v);
    else out[k] = v;
  }
  return out;
}

function middleware(limits) {
  const form = Number(limits.form);
  const upload = Number(limits.upload);
  return async (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') { req.body = {}; return next(); }
    const type = String(req.headers['content-type'] || '');
    const isForm = type.includes('application/x-www-form-urlencoded');
    const isMulti = type.includes('multipart/form-data');
    try {
      const raw = await readBody(req, isMulti ? upload : form);
      req.rawBody = raw;
      // multipart ส่งต่อเป็น Buffer ให้ multipart.js, webhook ก็ต้องได้ Buffer ดิบไปตรวจลายเซ็น
      req.body = isForm ? parseUrlencoded(raw) : raw;
      return next();
    } catch (e) {
      const code = e.status === 413 ? 413 : 400;
      return res.status(code).send(e.message || 'อ่านข้อมูลที่ส่งมาไม่ได้');
    }
  };
}

module.exports = { middleware, readBody, parseUrlencoded };
