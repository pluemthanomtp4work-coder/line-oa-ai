// ตัวแยก multipart/form-data ขนาดเล็ก — ใช้แทน multer เพื่อไม่ต้องเพิ่ม dependency
// รับ Buffer ทั้งก้อน (ผ่าน express.raw) แล้วคืน { fields, files }
// พอสำหรับหน้าหลังบ้านที่อัปไฟล์ทีละไม่กี่ไฟล์ ไม่ได้ทำ streaming — ไฟล์ใหญ่กว่าลิมิตถูกปัดตั้งแต่ชั้น express
const CRLF = Buffer.from('\r\n');
const SEP = Buffer.from('\r\n\r\n');

function parse(buf, contentType) {
  const mm = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType || ''));
  if (!mm) throw new Error('ไม่พบ boundary ใน content-type');
  const boundary = Buffer.from('--' + (mm[1] || mm[2]).trim());

  const fields = Object.create(null);
  const files = [];
  let pos = buf.indexOf(boundary);
  if (pos < 0) throw new Error('รูปแบบ multipart ไม่ถูกต้อง');

  while (pos >= 0) {
    let start = pos + boundary.length;
    // จบก้อนเมื่อเจอ "--" ต่อท้าย boundary
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break;
    start += CRLF.length;                       // ข้าม \r\n หลัง boundary

    const headEnd = buf.indexOf(SEP, start);
    if (headEnd < 0) break;
    const head = buf.slice(start, headEnd).toString('utf8');
    const bodyStart = headEnd + SEP.length;

    const next = buf.indexOf(boundary, bodyStart);
    if (next < 0) break;
    const body = buf.slice(bodyStart, next - CRLF.length);   // ตัด \r\n ท้าย part

    const nameM = /name="([^"]*)"/i.exec(head);
    const fileM = /filename="([^"]*)"/i.exec(head);
    const typeM = /content-type:\s*([^\r\n]+)/i.exec(head);
    const name = nameM ? nameM[1] : '';

    if (fileM && fileM[1]) {
      files.push({ field: name, filename: fileM[1], mime: (typeM ? typeM[1].trim() : 'application/octet-stream'), data: body });
    } else if (name) {
      // ชื่อซ้ำ (เช่น checkbox หลายตัว) เก็บเป็น array เหมือนที่ express ทำ
      const v = body.toString('utf8');
      if (name in fields) fields[name] = [].concat(fields[name], v);
      else fields[name] = v;
    }
    pos = next;
  }
  return { fields, files };
}

/** middleware: ใช้กับ route ที่มี enctype="multipart/form-data" — ยัดผลลง req.body / req.files */
function middleware(req, res, next) {
  // ต้องเช็ค content-type ด้วย ไม่ใช่แค่ "body เป็น Buffer"
  // webhook ของ LINE ก็ได้ Buffer เหมือนกัน (JSON ดิบไว้ตรวจลายเซ็น) ถ้าไม่เช็คตรงนี้
  // middleware นี้จะเอา JSON ไป parse เป็น multipart พัง แล้วเขียนทับ req.body = {}
  // → createHmac().update({}) โยน error → request ค้างไม่มีวันตอบ (เคยเกิดจริง)
  const type = String(req.headers['content-type'] || '');
  if (!Buffer.isBuffer(req.body) || !type.includes('multipart/form-data')) return next();
  try {
    const out = parse(req.body, req.headers['content-type']);
    req.body = out.fields;
    req.files = out.files;
    req.file = out.files[0] || null;
  } catch (e) {
    req.body = {};
    req.files = [];
    req.uploadError = e.message;
  }
  next();
}

module.exports = { parse, middleware };
