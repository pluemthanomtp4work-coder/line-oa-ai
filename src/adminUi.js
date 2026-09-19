// ชิ้นส่วนที่ทุกหน้าใช้ร่วมกัน — esc, ตัวเลข, การ์ดสถิติ, แถบ progress, โครง HTML
// มีไว้เพราะมี 8 หน้า ถ้าก็อป esc/statCard ไปไว้ทุกไฟล์ วันหนึ่งจะแก้ไม่ครบแล้วเกิด XSS ในหน้าที่ลืม
// กฎเดิมยังอยู่: CSS เฉพาะหน้าส่งเข้ามาทาง opts.css แล้วมันจะถูกวางต่อจาก BASE_CSS (มาทีหลัง = ทับได้)
const ui = require('./uiTheme');
const nav = require('./adminNav');
const gate = require('./adminGate');

// ครอบทุกค่าที่มาจาก DB/ผู้ใช้ก่อนยัดลง HTML — ไม่มีข้อยกเว้น
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
// escape สำหรับค่าที่จะไปอยู่ใน <script> เป็น JSON — ปิดทาง </script> และ tag ซ้อน
function jsonScript(v) {
  return JSON.stringify(v == null ? null : v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}
const n = (v) => Number(v || 0).toLocaleString();
const money = (v) => Number(v || 0).toFixed(2);
const initials = (name) => esc(String(name || '?').trim().slice(0, 2).toUpperCase());

// เกณฑ์สี 60/85% ใช้ซ้ำทุกที่ (โควต้า/งบ/พื้นที่) — สีต้องแปลว่าอย่างเดียวกันทั้งระบบ
function levelColor(pct) {
  return pct >= 85 ? '#D64A40' : pct >= 60 ? '#F39C12' : '#06C755';
}
function bar(pct, color) {
  return `<div class="bar"><span style="width:${Math.max(2, Math.min(100, Number(pct) || 0))}%;background:${color || levelColor(pct)}"></span></div>`;
}
function statCard(icon, label, value, sub, accent) {
  return `<div class="stat">
    <div class="ic" style="background:${accent}1a;color:${accent}">${icon}</div>
    <div class="meta"><div class="lab">${esc(label)}</div><div class="val">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
  </div>`;
}
const pill = (text, tone) => `<span class="tag ${tone || ''}">${esc(text)}</span>`;

// ข้อความ confirm ของปุ่มลบ — \\n สอง backslash เพราะอยู่ใน template literal ชั้นนอกอีกที
// ถ้าเขียน \n เดียวจะได้ newline จริงกลาง attribute แล้ว HTML พัง
function confirmText(title, gone, kept) {
  const lose = gone.map((x) => '- ' + x).join('\\n');
  const keep = kept && kept.length ? '\\n\\nสิ่งที่ไม่หาย:\\n' + kept.map((x) => '- ' + x).join('\\n') : '';
  return `${title}\\n\\nสิ่งที่หาย:\\n${lose}${keep}\\n\\nกู้คืนไม่ได้`;
}

const SHARED_CSS = `
  .panels{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-bottom:16px;align-items:start}
  @media(max-width:760px){.panels{grid-template-columns:1fr}}
  .big{font-size:27px;font-weight:700;font-variant-numeric:tabular-nums}
  .big .u{font-size:15px;color:var(--muted);font-weight:500}
  .bar{height:8px;background:#EDF1F9;border-radius:99px;overflow:hidden;margin:9px 0 7px}
  .bar span{display:block;height:100%;border-radius:99px;transition:width .4s}
  .dim{color:var(--muted);font-size:12.5px}
  .empty{text-align:center;color:var(--muted);padding:28px}
  .who{display:flex;align-items:center;gap:10px}
  .av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#5B8DF0,#2D6CDF);color:#fff;display:grid;place-items:center;font-size:12px;font-weight:700;flex:0 0 auto;overflow:hidden}
  .av img{width:100%;height:100%;object-fit:cover}
  .nm{font-weight:600}
  .tag{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:999px;background:var(--line2);color:var(--muted);border:1px solid var(--line)}
  .tag.on{background:#E9F8F0;color:#0A7A40;border-color:#BCE8D1}
  .tag.off{background:#FCECEA;color:#B23128;border-color:#F2C7C2}
  .tag.warn{background:#FFF8EC;color:var(--amber);border-color:#F3E0B5}
  .tag.blue{background:var(--accent-weak);color:var(--blue2);border-color:#CBDCFA}
  .thbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .cnt{font-weight:500;font-size:12.5px;color:var(--muted);margin-left:6px}
  /* ต้องเขียน input[type=search].srch — แค่ .srch จะแพ้ selector input[type=search] ใน BASE_CSS แล้วกว้าง 100% ดันหัวตารางตก */
  input[type=search].srch{width:auto;min-width:220px;font-size:13px;padding:7px 12px}
  tr.hid,.gcard.hid{display:none}
  .morebar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--line)}
  .fold>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px}
  .fold>summary::-webkit-details-marker{display:none}
  .fold>summary::before{content:'▸';color:var(--muted);font-size:13px;transition:.15s}
  .fold[open]>summary::before{transform:rotate(90deg)}
  .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
  .frow{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;margin-top:12px}
  .frow>.grow{flex:1;min-width:180px}
  .fld{margin-bottom:10px}
  .fld>label{display:block;margin-bottom:4px}
  .tablescroll{overflow-x:auto}
  .inline{display:inline}
  .mini{padding:4px 10px;font-size:11.5px}
  /* ช่อง "จัดการ" ที่มีหลายปุ่ม — ใช้ flex ไม่ใช่ white-space:nowrap
     เพราะ <details> ฝืน display:inline ไม่ได้ในเบราว์เซอร์ แล้วปุ่มจะตกคนละบรรทัด */
  .acts{display:flex;gap:5px;justify-content:center;align-items:flex-start;flex-wrap:nowrap}
`;

/**
 * โครง HTML ของทุกหน้า — เรียงตามโครงบังคับ: hero+nav → flash → warn → เนื้อหา → footer
 * ห้ามใส่ refresh ในหน้าที่มีฟอร์มยาว (จะล้างสิ่งที่ผู้ใช้กำลังพิมพ์) → ต้องส่ง refresh มาเอง
 */
function shell(o) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${o.refresh ? `<meta http-equiv="refresh" content="${Number(o.refresh)}">` : ''}
<title>${esc(o.title)}</title>
${ui.FONT}
<style>
  ${ui.BASE_CSS}
  ${nav.CSS}
  ${SHARED_CSS}
  ${o.css || ''}
</style></head>
<body>
  <div class="hero"><div class="wrap"><div class="hbar">
    <div><h1>${o.h1}</h1><div class="hsub">${esc(o.hsub || '')}</div></div>
    ${o.pill || ''}
  </div>${nav.html(o.tab, gate.ADMIN_KEY)}</div></div>

  <div class="wrap lift">
    ${gate.flashHtml(o.query || {}, esc)}
    ${o.warn || ''}
    ${o.body}
    <footer>${o.footer || 'หน้านี้ล็อกด้วย ADMIN_KEY เท่านั้น (ไม่ใช่ระบบล็อกอินจริง) — อย่าวางข้อมูลที่หลุดไม่ได้ไว้ที่นี่'}</footer>
  </div>
  ${o.script ? `<script>${o.script}</script>` : ''}
</body></html>`;
}

// สคริปต์ตาราง: ย่อแถวเกิน TOP + ค้นหาฝั่ง browser
// กฎ: มีคำค้น = โชว์ทุกแถวที่ตรงเสมอ (ไม่งั้นค้นเจอแถวที่ 30 แล้วไม่ขึ้น) และซ่อนปุ่มกางตอนกำลังค้น
function tableScript(ids, top) {
  return `(function(){
  var rows=[].slice.call(document.querySelectorAll('#${ids.body} .urow'));
  var more=document.getElementById('${ids.more}'),cnt=document.getElementById('${ids.count}'),box=document.getElementById('${ids.search}');
  if(!rows.length)return;
  var TOP=${Number(top)},expanded=false;
  function draw(){
    var q=((box&&box.value)||'').trim().toLowerCase(),shown=0;
    rows.forEach(function(tr,i){
      var hit=!q||(tr.getAttribute('data-hay')||'').indexOf(q)!==-1;
      var show=hit&&(q||expanded||i<TOP);
      tr.classList.toggle('hid',!show); if(show)shown++;
    });
    if(cnt)cnt.textContent=q?('พบ '+shown+' รายการ'):(expanded?('แสดงครบ '+rows.length):('แสดง '+TOP+' อันดับแรก'));
    if(more)more.style.display=q?'none':'';
  }
  if(more)more.addEventListener('click',function(){expanded=!expanded;more.textContent=expanded?'ย่อกลับ':('แสดงทั้งหมด ('+rows.length+')');draw();});
  if(box)box.addEventListener('input',draw);
  draw();
})();`;
}

// แถบท้ายตาราง "แสดงทั้งหมด" — โชว์เฉพาะตอนแถวเกิน TOP
function moreBar(total, top, ids) {
  if (total <= top) return '';
  return `<div class="morebar">
    <button type="button" id="${ids.more}" class="btn gray">แสดงทั้งหมด (${n(total)})</button>
    <span id="${ids.count}" class="dim">แสดง ${top} อันดับแรก</span>
  </div>`;
}

// กราฟแท่ง — maxDay ต้อง Math.max(1,...) เสมอ ไม่งั้นวันที่ยังไม่มีข้อมูลจะหาร 0 ได้ NaN%
function barChart(points) {
  if (!points.length) return `<div class="dim">ยังไม่มีข้อมูล</div>`;
  const max = Math.max(1, ...points.map((p) => p.value));
  return `<div class="chart">${points.map((p) => `<div class="col" title="${esc(p.label)}: ${n(p.value)}">
    <div class="colbar" style="height:${Math.round((p.value / max) * 100)}%"></div>
    <div class="cap">${esc(p.label)}</div></div>`).join('')}</div>`;
}
const CHART_CSS = `
  .chart{display:flex;align-items:flex-end;gap:5px;height:130px;padding-top:8px}
  .col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:5px}
  .colbar{width:70%;min-height:3px;background:linear-gradient(180deg,#5B8DF0,#2D6CDF);border-radius:5px 5px 0 0;transition:height .4s}
  .col .cap{font-size:10px;color:var(--muted)}
`;

// ข้อความเตือนตอนแหล่งข้อมูลคืน null = ยังไม่ได้ตั้งค่า/ตารางยังไม่มี (ไม่ใช่ "มีตารางแต่ว่าง")
function notReady(what) {
  return `<div class="warn">⚠️ ยังอ่าน<b>${esc(what)}</b>ไม่ได้ — ตรวจว่ารัน <code>npm run init</code> แล้ว หรือไฟล์ข้อมูลใน <code>data/</code> ถูกลบไป (ส่วนอื่นของหน้ายังใช้ได้ปกติ)</div>`;
}

module.exports = {
  esc, jsonScript, n, money, initials, bar, levelColor, statCard, pill, confirmText,
  shell, tableScript, moreBar, barChart, notReady, SHARED_CSS, CHART_CSS,
};
