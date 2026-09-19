// หน้า /admin/header — ธีมหัวการ์ดที่บอทส่งใน LINE
// เลือกชนิดการ์ด → เลือกธีมสำเร็จหรืออัปรูปพื้นหลังเอง → พรีวิวการ์ดจริงข้างๆ ทันที
// ปุ่ม: ใช้กับการ์ดนี้ · ใช้กับทุกการ์ด · คืนค่าเดิม · ส่งทดสอบ
const u = require('./adminUi');
const gate = require('./adminGate');
const link = require('./signedLink');

// ชนิดการ์ดที่บอทส่งจริง — เพิ่มชนิดใหม่ที่นี่ที่เดียว
const CARD_TYPES = [
  ['answer', '💬 การ์ดคำตอบ', 'การ์ดที่ห่อคำตอบจาก AI'],
  ['welcome', '👋 การ์ดต้อนรับ', 'ส่งตอนมีคนแอดบอทใหม่'],
  ['file', '📎 การ์ดส่งไฟล์', 'ตอนบอทส่งไฟล์จากคลัง'],
  ['error', '⚠️ การ์ดแจ้งปัญหา', 'ตอนระบบขัดข้อง'],
];

// ธีมสำเร็จ — ไล่สีสองจุด + สีตัวอักษร
const THEMES = {
  blue: ['#5B8DF0', '#2D6CDF', '#fff', 'น้ำเงิน'],
  green: ['#3ED27A', '#06C755', '#fff', 'เขียว LINE'],
  purple: ['#9B7BFF', '#7C4DFF', '#fff', 'ม่วง'],
  sunset: ['#FFB36B', '#F3722C', '#fff', 'พระอาทิตย์ตก'],
  ink: ['#4A5262', '#1A1D23', '#fff', 'เทาเข้ม'],
  paper: ['#F4F6FA', '#E4E9F2', '#1A1D23', 'กระดาษ (ตัวอักษรเข้ม)'],
};
const DEFAULT_THEME = 'blue';

async function page(deps, query = {}) {
  const [headers, files] = await Promise.all([
    deps.listHeaders().catch(() => null),
    deps.listFiles().catch(() => []),
  ]);
  const rows = headers || [];
  const current = CARD_TYPES.some(([k]) => k === query.card) ? query.card : CARD_TYPES[0][0];
  const conf = rows.find((h) => h.cardType === current) || {};
  const bg = conf.bgFileId ? (files || []).find((f) => f.id === conf.bgFileId && !f.trashed) : null;

  return render({
    query, current,
    ready: Array.isArray(headers),
    conf: {
      theme: conf.theme || DEFAULT_THEME,
      title: conf.title || '',
      bgFileId: conf.bgFileId || '',
      bgUrl: bg ? link.urlFor(bg.id) : '',
      bgName: bg ? bg.name : (conf.bgFileId ? '(ไฟล์พื้นหลังถูกลบไปแล้ว)' : ''),
    },
    configured: CARD_TYPES.map(([k, label]) => ({
      key: k, label,
      theme: (rows.find((h) => h.cardType === k) || {}).theme || DEFAULT_THEME,
      custom: Boolean(rows.find((h) => h.cardType === k)),
    })),
    lineOk: Boolean(deps.lineOk),
    testTarget: deps.adminUserIds && deps.adminUserIds[0] ? deps.adminUserIds[0] : '',
    nowLabel: deps.nowLabel(),
  });
}

function render(m) {
  const K = encodeURIComponent(gate.ADMIN_KEY);
  const t = THEMES[m.conf.theme] || THEMES[DEFAULT_THEME];
  const meta = CARD_TYPES.find(([k]) => k === m.current) || CARD_TYPES[0];

  const tabs = `<div class="cardtabs">${m.configured.map((c) => `<a class="chip ${c.key === m.current ? 'active' : ''}" href="/admin/header?key=${K}&card=${encodeURIComponent(c.key)}">${u.esc(c.label)}</a>`).join('')}</div>`;

  // พรีวิว — วาดหัวการ์ดด้วย CSS ให้เหมือนที่ LINE จะแสดง (ไล่สี หรือรูปพื้นหลังที่อัปไว้)
  const preview = `<div class="panel" style="margin:0">
    <h3>👀 พรีวิว</h3>
    <div class="sub">หน้าตาของหัวการ์ดที่ผู้ใช้จะเห็นใน LINE</div>
    <div class="phone">
      <div class="bubble">
        <div class="chead" style="${m.conf.bgUrl
      ? `background-image:url('${u.esc(m.conf.bgUrl)}');background-size:cover;background-position:center;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.55)`
      : `background:linear-gradient(135deg,${t[0]},${t[1]});color:${t[2]}`}">
          ${u.esc(m.conf.title || meta[1].replace(/^\S+\s/, ''))}
        </div>
        <div class="cbody">
          <div style="font-weight:600;margin-bottom:4px">ตัวอย่างข้อความ</div>
          <div class="dim">เวลาทำการคือจันทร์–ศุกร์ 8:30–17:00 ครับ</div>
        </div>
      </div>
    </div>
  </div>`;

  const editor = `<div class="panel" style="margin:0">
    <h3>${u.esc(meta[1])}</h3>
    <div class="sub">${u.esc(meta[2])}</div>
    <form method="post" action="/admin/header/save">
      ${gate.keyInput()}<input type="hidden" name="cardType" value="${u.esc(m.current)}">
      <div class="fld"><label>ข้อความบนหัวการ์ด (เว้นว่าง = ใช้ชื่อชนิดการ์ด)</label>
        <input type="text" name="title" value="${u.esc(m.conf.title)}" placeholder="${u.esc(meta[1].replace(/^\S+\s/, ''))}" maxlength="40"></div>
      <div class="fld"><label>ธีมสี</label>
        <div class="swatches">${Object.entries(THEMES).map(([k, v]) => `<label class="sw${k === m.conf.theme && !m.conf.bgUrl ? ' on' : ''}">
          <input type="radio" name="theme" value="${k}"${k === m.conf.theme ? ' checked' : ''} style="width:auto;display:none">
          <span class="dot" style="background:linear-gradient(135deg,${v[0]},${v[1]})"></span>${u.esc(v[3])}</label>`).join('')}</div></div>
      <div class="btnrow">
        <button class="btn" type="submit">บันทึกการ์ดนี้</button>
        <button class="btn gray" type="submit" formaction="/admin/header/apply-all"
          onclick="return confirm('ใช้ธีมนี้กับทุกการ์ด?\\n\\nสิ่งที่หาย:\\n- ธีมที่ตั้งไว้เฉพาะของการ์ดอื่น\\n\\nสิ่งที่ไม่หาย:\\n- ข้อความบนหัวการ์ดของแต่ละการ์ด\\n- รูปพื้นหลังที่อัปไว้\\n\\nกู้คืนไม่ได้')">ใช้กับทุกการ์ด</button>
        <button class="btn ghost" type="submit" formaction="/admin/header/reset"
          onclick="return confirm('คืนค่าเดิมของการ์ดนี้?\\n\\nสิ่งที่หาย:\\n- ธีม ข้อความ และรูปพื้นหลังของการ์ดนี้\\n\\nกู้คืนไม่ได้')">คืนค่าเดิม</button>
      </div>
    </form>

    <form method="post" action="/admin/header/bg" enctype="multipart/form-data" style="margin-top:14px;border-top:1px solid var(--line);padding-top:14px">
      ${gate.keyInput()}<input type="hidden" name="cardType" value="${u.esc(m.current)}">
      <div class="fld"><label>รูปพื้นหลัง (ทับธีมสี — แนะนำ 1040×300 px)</label>
        <div class="frow" style="margin:0"><div class="grow"><input type="file" name="file" accept="image/png,image/jpeg" required></div>
        <button class="btn gray" type="submit">⬆️ อัป</button></div></div>
      ${m.conf.bgName ? `<div class="dim">ใช้อยู่: ${u.esc(m.conf.bgName)}</div>` : ''}
    </form>

    <form method="post" action="/admin/header/test" style="margin-top:14px;border-top:1px solid var(--line);padding-top:14px">
      ${gate.keyInput()}<input type="hidden" name="cardType" value="${u.esc(m.current)}">
      <div class="fld"><label>ส่งทดสอบไปที่ LINE user id</label>
        <div class="frow" style="margin:0"><div class="grow">
          <input type="text" name="to" value="${u.esc(m.testTarget)}" placeholder="Uxxxxxxxx" required></div>
        <button class="btn green" type="submit"${m.lineOk ? '' : ' disabled title="ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN"'}>📤 ส่งทดสอบ</button></div></div>
      ${m.lineOk ? '' : '<div class="dim">ต้องตั้ง LINE_CHANNEL_ACCESS_TOKEN ใน .env ก่อนจึงส่งได้</div>'}
    </form>
  </div>`;

  return u.shell({
    tab: 'header', title: 'หัวการ์ด', query: m.query,
    warn: m.ready ? '' : u.notReady('ค่าธีมหัวการ์ด'),
    h1: '🎨 หัวการ์ด',
    hsub: 'ธีมหัวการ์ดที่บอทส่งใน LINE — อัปเดต ' + m.nowLabel,
    css: `
      .cardtabs{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px}
      .split{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;align-items:start}
      .swatches{display:flex;gap:8px;flex-wrap:wrap}
      .sw{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:5px 12px 5px 6px;cursor:pointer}
      .sw:hover{border-color:var(--blue);color:var(--blue)}
      .sw .dot{width:20px;height:20px;border-radius:50%;display:inline-block}
      .sw:has(input:checked){border-color:var(--blue);color:var(--blue);background:var(--accent-weak)}
      .phone{background:#8CABD8;border-radius:var(--radius);padding:18px 14px;margin-top:12px}
      .bubble{max-width:300px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:var(--shadow-pop)}
      .chead{padding:22px 16px;font-size:15px;font-weight:700}
      .cbody{padding:13px 16px;font-size:13.5px}
    `,
    body: tabs + `<div class="split">${editor}${preview}</div>`,
    footer: 'พรีวิวเป็นการจำลองด้วย CSS — หน้าตาจริงใน LINE ต่างได้เล็กน้อยตามรุ่นแอป ให้กด "ส่งทดสอบ" ดูของจริงก่อนใช้ · รูปพื้นหลังทับธีมสีเสมอ ถ้าอยากกลับไปใช้สีให้กด "คืนค่าเดิม"',
  });
}

module.exports = { page, render, CARD_TYPES, THEMES, DEFAULT_THEME };
