// หน้า /admin/menu — ออกแบบ rich menu ของ LINE แล้วเผยแพร่
// รูปวาดด้วย <canvas> ฝั่งเบราว์เซอร์ที่ขนาดจริงเป๊ะ แล้วส่ง dataURL มาให้เซิร์ฟเวอร์อัปเข้า LINE
// (ไม่ต้องลง library วาดรูปฝั่งเซิร์ฟเวอร์ — และได้เห็นของจริงก่อนกดเผยแพร่)
//
// กับดักที่กันไว้: ขนาดรูปต้องตรงสเปกเป๊ะ (2500×1686 หรือ 2500×843) และพื้นที่ปุ่มต้องไม่ทับกัน
// ไม่งั้น LINE ปฏิเสธทั้งชุด → พื้นที่ปุ่มจึงคิดจากกริดเท่ากันทุกช่อง ทับกันไม่ได้โดยโครงสร้าง
const u = require('./adminUi');
const gate = require('./adminGate');

const SIZES = {
  large: { w: 2500, h: 1686, rows: 2, label: 'ใหญ่ 2500×1686 (2 แถว)' },
  compact: { w: 2500, h: 843, rows: 1, label: 'เตี้ย 2500×843 (1 แถว)' },
};
const MAX_BUTTONS = 6;
const PALETTE = ['#2D6CDF', '#06C755', '#7C4DFF', '#F3722C', '#D64A40', '#1A1D23'];

async function page(deps, query = {}) {
  const [menus, live] = await Promise.all([
    deps.listRichMenus().catch(() => null),
    deps.lineRichMenus ? deps.lineRichMenus().catch(() => null) : Promise.resolve(null),
  ]);
  const rows = menus || [];
  const editing = query.id ? rows.find((r) => r.id === query.id) : null;
  const draft = editing || rows.find((r) => r.published) || rows[0] || null;

  return render({
    query,
    ready: Array.isArray(menus),
    lineOk: Boolean(deps.lineOk),
    liveCount: live && Array.isArray(live.richmenus) ? live.richmenus.length : null,
    menus: rows.slice().reverse().map((r) => ({
      id: r.id, name: r.name, size: r.size || 'large',
      buttons: (r.buttons || []).length, published: Boolean(r.published),
      lineRichMenuId: r.lineRichMenuId || '',
      when: String(r.updatedAt || r.createdAt || '').slice(0, 16).replace('T', ' '),
    })),
    draft: draft ? {
      id: draft.id, name: draft.name, size: draft.size || 'large',
      cols: Number(draft.cols || 3),
      buttons: draft.buttons || [],
    } : { id: '', name: 'เมนูหลัก', size: 'large', cols: 3, buttons: defaultButtons() },
    nowLabel: deps.nowLabel(),
  });
}

function defaultButtons() {
  return [
    { slot: 0, label: 'ถามบอท', color: '#2D6CDF', icon: '💬', actionType: 'message', value: 'ถามบอท' },
    { slot: 1, label: 'เวลาทำการ', color: '#06C755', icon: '🕒', actionType: 'message', value: 'เวลาทำการ' },
    { slot: 2, label: 'ติดต่อเรา', color: '#7C4DFF', icon: '📞', actionType: 'message', value: 'ติดต่อเรา' },
  ];
}

function render(m) {
  const K = encodeURIComponent(gate.ADMIN_KEY);
  const d = m.draft;
  const size = SIZES[d.size] || SIZES.large;
  const slots = size.rows * d.cols;

  const btnFields = Array.from({ length: MAX_BUTTONS }, (_, i) => {
    // หาปุ่มตาม slot ก่อน — ร่างที่เว้นช่องกลางว่างต้องกลับมาอยู่ช่องเดิม ไม่ใช่เลื่อนขึ้น
    // (ร่างเก่าที่บันทึกไว้ก่อนมี slot ถอยไปใช้ลำดับใน array ตามเดิม)
    const b = d.buttons.find((x) => x.slot === i) || (d.buttons.some((x) => x.slot != null) ? {} : d.buttons[i]) || {};
    const used = i < slots;
    return `<div class="bcard${used ? '' : ' off'}">
      <div class="bhead">ปุ่มที่ ${i + 1}${used ? '' : ' <span class="dim">(เกินจำนวนช่องของกริดนี้ — ไม่ถูกใช้)</span>'}</div>
      <div class="grid2">
        <div class="fld"><label>ไอคอน</label><input type="text" name="icon${i}" value="${u.esc(b.icon || '')}" maxlength="2" placeholder="💬"></div>
        <div class="fld"><label>ข้อความบนปุ่ม</label><input type="text" name="label${i}" value="${u.esc(b.label || '')}" maxlength="14" placeholder="ถามบอท"></div>
        <div class="fld"><label>สีปุ่ม</label>
          <select name="color${i}">${PALETTE.map((c) => `<option value="${c}"${(b.color || PALETTE[i % PALETTE.length]) === c ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="fld"><label>กดแล้วทำอะไร</label>
          <select name="actionType${i}">
            <option value="message"${b.actionType === 'uri' ? '' : ' selected'}>ส่งข้อความนี้ให้บอท</option>
            <option value="uri"${b.actionType === 'uri' ? ' selected' : ''}>เปิดลิงก์</option>
          </select></div>
      </div>
      <div class="fld"><label>ข้อความ / ลิงก์</label><input type="text" name="value${i}" value="${u.esc(b.value || '')}" placeholder="เวลาทำการ  หรือ  https://example.com"></div>
    </div>`;
  }).join('');

  const editor = `<div class="panel" style="margin:0">
    <h3>✏️ แก้เมนู</h3>
    <form method="post" action="/admin/menu/save" id="menuform">
      ${gate.keyInput()}
      <input type="hidden" name="id" value="${u.esc(d.id)}">
      <input type="hidden" name="image" id="imgdata">
      <div class="grid2">
        <div class="fld"><label>ชื่อเมนู (ผู้ใช้ไม่เห็น)</label><input type="text" name="name" value="${u.esc(d.name)}" required></div>
        <div class="fld"><label>ขนาด</label>
          <select name="size" id="size">${Object.entries(SIZES).map(([k, v]) => `<option value="${k}"${k === d.size ? ' selected' : ''}>${u.esc(v.label)}</option>`).join('')}</select></div>
        <div class="fld"><label>จำนวนช่องต่อแถว</label>
          <select name="cols" id="cols">${[2, 3].map((c) => `<option value="${c}"${c === d.cols ? ' selected' : ''}>${c} ช่อง</option>`).join('')}</select></div>
      </div>
      ${btnFields}
      <div class="btnrow">
        <button class="btn" type="submit">💾 บันทึกร่าง</button>
        <button class="btn green" type="submit" formaction="/admin/menu/publish"
          ${m.lineOk ? '' : 'disabled title="ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN"'}
          onclick="return confirm('เผยแพร่เมนูนี้ให้ผู้ใช้ทุกคน?\\n\\nสิ่งที่หาย:\\n- เมนูเดิมที่ผู้ใช้เห็นอยู่ (ถูกแทนที่ทันที)\\n\\nสิ่งที่ไม่หาย:\\n- ร่างเมนูอื่นในหน้านี้\\n- ประวัติแชทของผู้ใช้')">🚀 เผยแพร่เข้า LINE</button>
      </div>
      ${m.lineOk ? '' : '<div class="dim" style="margin-top:6px">ต้องตั้ง LINE_CHANNEL_ACCESS_TOKEN ใน .env ก่อนจึงเผยแพร่ได้ (บันทึกร่างได้ตามปกติ)</div>'}
    </form>
  </div>`;

  const preview = `<div class="stickycol">
    <div class="panel" style="margin:0">
      <h3>👀 พรีวิว</h3>
      <div class="sub">รูปที่จะอัปเข้า LINE ขนาดจริง <span id="dims">${size.w}×${size.h}</span> px</div>
      <div class="phone"><canvas id="cv" width="${size.w}" height="${size.h}"></canvas></div>
      <div class="dim" style="margin-top:8px">พื้นที่ปุ่มคิดจากกริดเท่าๆ กัน จึงไม่ทับกัน — LINE จะไม่ปฏิเสธเพราะเหตุนี้</div>
    </div>
  </div>`;

  const DEL = u.confirmText('ลบร่างเมนูนี้?', ['ชื่อ ปุ่ม และสีของร่างนี้'],
    ['เมนูที่เผยแพร่ไปแล้วใน LINE (ยังแสดงอยู่จนกว่าจะเผยแพร่ตัวใหม่ทับ)']);

  const list = `<div class="tablecard" style="margin-top:16px">
    <div class="th">🧩 ร่างเมนูทั้งหมด <span class="cnt">${u.n(m.menus.length)} ร่าง${m.liveCount == null ? '' : ` · บน LINE มี ${u.n(m.liveCount)} ชุด`}</span></div>
    <div class="tablescroll"><table>
      <thead><tr><th>ชื่อ</th><th>ขนาด</th><th class="num">ปุ่ม</th><th>สถานะ</th><th class="num">แก้ล่าสุด</th><th class="num">จัดการ</th></tr></thead>
      <tbody>${m.menus.length ? m.menus.map((r) => `<tr>
        <td class="nm">${u.esc(r.name)}</td>
        <td class="dim">${u.esc((SIZES[r.size] || SIZES.large).label)}</td>
        <td class="num">${u.n(r.buttons)}</td>
        <td>${r.published ? u.pill('เผยแพร่อยู่', 'on') : u.pill('ร่าง', '')}</td>
        <td class="num dim">${u.esc(r.when)}</td>
        <td class="num" style="white-space:nowrap">
          <a class="btn ghost mini" href="/admin/menu?key=${K}&id=${encodeURIComponent(r.id)}">แก้</a>
          <form method="post" action="/admin/menu/delete" class="inline" onsubmit="return confirm('${DEL}')">
            ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(r.id)}">
            <button class="btn danger mini" type="submit">🗑️</button></form></td></tr>`).join('')
      : `<tr><td colspan="6" class="empty">ยังไม่มีร่างเมนู — แก้ฟอร์มด้านบนแล้วกดบันทึก</td></tr>`}</tbody></table></div>
  </div>`;

  // สคริปต์วาด canvas — อ่านค่าจากฟอร์มสดๆ ทุกครั้งที่แก้ แล้วยัด dataURL ลง hidden input ตอน submit
  const script = `
  (function(){
    var SIZES=${u.jsonScript(SIZES)};
    var cv=document.getElementById('cv'),form=document.getElementById('menuform');
    if(!cv||!form)return;
    var ctx=cv.getContext('2d');
    function val(n){var e=form.elements[n];return e?e.value:'';}
    function conf(){
      var s=SIZES[val('size')]||SIZES.large, cols=parseInt(val('cols'),10)||3;
      var slots=s.rows*cols, btns=[];
      for(var i=0;i<slots;i++){
        btns.push({label:val('label'+i),icon:val('icon'+i),color:val('color'+i)||'#2D6CDF'});
      }
      return {s:s,cols:cols,btns:btns};
    }
    function draw(){
      var c=conf(),s=c.s;
      cv.width=s.w;cv.height=s.h;
      var dims=document.getElementById('dims'); if(dims)dims.textContent=s.w+'×'+s.h;
      var cw=s.w/c.cols, ch=s.h/s.rows, gap=10;
      ctx.clearRect(0,0,s.w,s.h);
      ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,s.w,s.h);
      c.btns.forEach(function(b,i){
        var col=i%c.cols,row=Math.floor(i/c.cols);
        var x=col*cw+gap,y=row*ch+gap,w=cw-gap*2,h=ch-gap*2;
        var empty=!b.label&&!b.icon;
        // มุมโค้งแบบวาดมือ — roundRect ไม่มีในเบราว์เซอร์เก่า
        var r=40;
        ctx.beginPath();
        ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
        ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
        // ช่องว่างต้องดูว่าง — ถ้าทาสีทึบเหมือนปุ่มจริง ผู้ใช้จะกดแล้วไม่มีอะไรเกิดขึ้น
        // เพราะช่องที่ไม่มีข้อความจะไม่ถูกลงทะเบียนเป็นพื้นที่กดตอนเผยแพร่
        if(empty){ctx.fillStyle='#F2F4F8';ctx.fill();ctx.strokeStyle='#D7DBE2';ctx.lineWidth=6;ctx.setLineDash([24,18]);ctx.stroke();ctx.setLineDash([]);}
        else{ctx.fillStyle=b.color;ctx.fill();}
        ctx.textAlign='center';
        if(empty){
          ctx.fillStyle='#98A0AD';ctx.font='600 72px "IBM Plex Sans Thai",system-ui,sans-serif';
          ctx.fillText('ช่องว่าง',x+w/2,y+h/2+24);
          return;
        }
        ctx.fillStyle='#FFFFFF';
        if(b.icon){ctx.font='140px system-ui,"Segoe UI Emoji",sans-serif';ctx.fillText(b.icon,x+w/2,y+h/2);}
        ctx.font='600 84px "IBM Plex Sans Thai",system-ui,sans-serif';
        ctx.fillText((b.label||'').slice(0,14),x+w/2,y+h/2+(b.icon?150:30));
      });
    }
    form.addEventListener('input',draw);
    form.addEventListener('change',draw);
    // ต้องยัดรูปก่อนฟอร์มถูกส่ง ไม่งั้นเซิร์ฟเวอร์ได้ image เป็นค่าว่างแล้วอัปไม่ได้
    form.addEventListener('submit',function(){
      draw();
      document.getElementById('imgdata').value=cv.toDataURL('image/png');
    });
    draw();
  })();`;

  return u.shell({
    tab: 'menu', title: 'เมนู LINE', query: m.query,
    warn: m.ready ? '' : u.notReady('ร่างเมนู'),
    h1: '🧩 เมนู LINE (Rich Menu)',
    hsub: 'ออกแบบเมนูล่างของแชท แล้วกดเผยแพร่ — อัปเดต ' + m.nowLabel,
    css: `
      .msplit{display:grid;grid-template-columns:1fr 420px;gap:14px;align-items:start}
      @media(max-width:980px){.msplit{grid-template-columns:1fr}}
      .stickycol{position:sticky;top:14px}
      @media(max-width:980px){.stickycol{position:static}}
      .phone{background:#8CABD8;border-radius:var(--radius);padding:12px;margin-top:12px}
      #cv{width:100%;height:auto;display:block;border-radius:8px;background:#fff}
      .bcard{border:1px solid var(--line);border-radius:var(--radius-sm);padding:12px 14px;margin-top:10px}
      .bcard.off{opacity:.45}
      .bhead{font-size:12.5px;font-weight:700;color:var(--muted);margin-bottom:6px}
    `,
    body: `<div class="msplit">${editor}${preview}</div>` + list,
    footer: 'รูปถูกวาดในเบราว์เซอร์ที่ขนาดจริงตามสเปก LINE แล้วส่งขึ้นตอนกดเผยแพร่ · เผยแพร่แล้วมีผลกับผู้ใช้ทุกคนทันที · ร่างที่ไม่ได้เผยแพร่เก็บไว้ในเครื่องเท่านั้น ไม่ถูกส่งไป LINE',
    script,
  });
}

module.exports = { page, render, SIZES, MAX_BUTTONS, PALETTE, defaultButtons };
