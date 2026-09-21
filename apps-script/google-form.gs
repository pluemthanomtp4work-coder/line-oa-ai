/**
 * ส่งคำตอบ Google Form ไปให้บอท LINE เก็บไว้ แล้วบอทจะสรุปแจ้งแอดมินวันละครั้ง (08:00 น.)
 *
 * ── วิธีติดตั้ง (ครั้งเดียว) ─────────────────────────────────────────────
 * 1. เปิด Google Form → เมนู ⋮ (มุมขวาบน) → "Apps Script"
 * 2. ลบโค้ดเดิมใน Code.gs ทิ้ง แล้ววางไฟล์นี้ทั้งหมด → กด 💾 บันทึก
 * 3. ⚙️ Project Settings (แถบซ้าย) → Script Properties → Add script property
 *      Property : FORM_HOOK_SECRET
 *      Value    : (ค่าในไฟล์ line-oa-ai-production-keys.txt)
 *    ⚠️ ห้ามวางรหัสลงในโค้ด — คนที่มีสิทธิ์แก้ไขฟอร์มเปิดอ่านโค้ดได้ทุกคน
 * 4. กลับมาที่ Editor → เลือกฟังก์ชัน `setup` ในแถบบน → กด ▶ Run
 *    → Google จะขออนุญาต กด Review permissions → เลือกบัญชี → Allow
 *    (ขอสิทธิ์ 2 อย่าง: อ่านฟอร์มนี้ และส่งข้อมูลออกไปยัง URL ของบอท)
 * 5. เลือกฟังก์ชัน `testSend` → ▶ Run → ดู Execution log ต้องขึ้น "สำเร็จ"
 *    แล้วเปิดหน้า Dashboard ของบอท แผง "📝 Google Form" จะมีรายการทดสอบ 1 แถว
 *
 * ถ้าส่งไม่สำเร็จตอนมีคนกรอกจริง Google จะส่งอีเมลแจ้งเจ้าของสคริปต์ให้เอง
 * ────────────────────────────────────────────────────────────────────────
 */

const WEBHOOK_URL = 'https://line-oa-ai.pluemthanomtp4work.workers.dev/hooks/google-form';

/** ติดตั้ง trigger — รันซ้ำได้ ไม่สร้างซ้อน */
function setup() {
  const form = FormApp.getActiveForm();
  const already = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'onFormSubmit');
  if (!already) ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
  if (!secret_()) throw new Error('ยังไม่ได้ตั้ง FORM_HOOK_SECRET ใน Script Properties (ดูขั้นที่ 3)');
  Logger.log(already ? 'มี trigger อยู่แล้ว ไม่ได้สร้างซ้ำ' : 'ติดตั้ง trigger เรียบร้อย');
}

/** ทำงานเองทุกครั้งที่มีคนกดส่งฟอร์ม */
function onFormSubmit(e) {
  const form = FormApp.getActiveForm();
  const r = e.response;
  send_({
    formId: form.getId(),
    formTitle: form.getTitle(),
    responseId: r.getId(),                       // บอทใช้กันแจ้งซ้ำ ถ้าสคริปต์ส่งซ้ำ
    submittedAt: r.getTimestamp().toISOString(),
    respondent: r.getRespondentEmail() || '',    // ว่างถ้าฟอร์มไม่ได้เก็บอีเมล
    answers: r.getItemResponses().map((ir) => ({
      q: ir.getItem().getTitle(),
      a: answerText_(ir.getResponse()),
    })),
  });
}

/** ส่งข้อมูลทดสอบ 1 รายการ — ใช้ตรวจว่าต่อกับบอทได้ ไม่ต้องไปกรอกฟอร์มจริง */
function testSend() {
  const form = FormApp.getActiveForm();
  const out = send_({
    formId: form.getId(),
    formTitle: form.getTitle() + ' (ทดสอบ)',
    responseId: 'test-' + Date.now(),
    submittedAt: new Date().toISOString(),
    respondent: '',
    answers: [{ q: 'ทดสอบการเชื่อมต่อ', a: 'ส่งจาก Apps Script สำเร็จ' }],
  });
  Logger.log('สำเร็จ: ' + JSON.stringify(out));
}

// ---------- ภายใน ----------
function secret_() {
  return PropertiesService.getScriptProperties().getProperty('FORM_HOOK_SECRET');
}

// คำตอบแบบ checkbox/grid เป็น array — แปลงเป็นข้อความเดียวให้อ่านได้ใน LINE
function answerText_(v) {
  if (Array.isArray(v)) return v.map((x) => (Array.isArray(x) ? x.join('/') : x)).join(', ');
  return v == null ? '' : String(v);
}

function send_(payload) {
  const s = secret_();
  if (!s) throw new Error('ยังไม่ได้ตั้ง FORM_HOOK_SECRET ใน Script Properties');
  const res = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-form-secret': s },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,                    // อ่านข้อความ error จากบอทได้ แทนที่จะได้แค่ "Exception"
  });
  const code = res.getResponseCode();
  // โยน error ถ้าไม่สำเร็จ — Google จะส่งอีเมลแจ้งเจ้าของสคริปต์ ไม่เงียบหาย
  if (code !== 200) throw new Error('บอทตอบ ' + code + ': ' + res.getContentText().slice(0, 300));
  return JSON.parse(res.getContentText());
}
