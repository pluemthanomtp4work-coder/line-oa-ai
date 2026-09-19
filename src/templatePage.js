// หน้า /admin/template — วางข้อความลงรูปพื้นหลัง (ลากกล่องได้)
// หน้าเดียวในชุดที่ JS เยอะ เพราะต้องลากวางจริง
//
// กับดักที่กันไว้: พิกัดเก็บเป็น "สัดส่วน 0–1" ไม่ใช่พิกเซล
// ถ้าเก็บเป็นพิกเซล พอเปลี่ยนรูปพื้นหลังเป็นขนาดอื่นทีเดียว กล่องเพี้ยนทั้งแม่แบบ
const u = require('./adminUi');
const gate = require('./adminGate');
const link = require('./signedLink');

async function page(deps, query = {}) {
  const [templates, files] = await Promise.all([
    deps.listTemplates().catch(() => null),
    deps.listFiles().catch(() => []),
  ]);
  const rows = templates || [];
  const cur = query.id ? rows.find((r) => r.id === query.id) : rows[rows.length - 1];
  const bg = cur && cur.bgFileId ? (files || []).find((f) => f.id === cur.bgFileId && !f.trashed) : null;

  return render({
    query,
    ready: Array.isArray(templates),
    lineOk: Boolean(deps.lineOk),
    aiOk: Boolean(deps.aiKeyOk),
    testTarget: deps.adminUserIds && deps.adminUserIds[0] ? deps.adminUserIds[0] : '',
    templates: rows.slice().reverse().map((r) => ({
      id: r.id, name: r.name, boxes: (r.boxes || []).length,
      when: String(r.updatedAt || r.createdAt || '').slice(0, 16).replace('T', ' '),
      active: Boolean(cur && r.id === cur.id),
    })),
    cur: cur ? {
      id: cur.id, name: cur.name,
      bgFileId: cur.bgFileId || '',
      bgUrl: bg ? link.urlFor(bg.id) : '',
      bgMissing: Boolean(cur.bgFileId && !bg),
      boxes: (cur.boxes || []).map(normBox),
    } : null,
    nowLabel: deps.nowLabel(),
  });
}

// บีบพิกัดให้อยู่ในกรอบ 0–1 เสมอ — กล่องที่หลุดขอบจะวาดไม่เห็นแล้วหาไม่เจอว่าหายไปไหน
function normBox(b) {
  const c = (v, d) => Math.min(1, Math.max(0, Number(v == null ? d : v)));
  return {
    text: String(b.text || ''),
    x: c(b.x, 0.1), y: c(b.y, 0.1), w: c(b.w, 0.4),
    size: Math.min(0.3, Math.max(0.01, Number(b.size || 0.06))),  // สัดส่วนต่อความสูงรูป
    color: /^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color : '#FFFFFF',
    align: ['left', 'center', 'right'].includes(b.align) ? b.align : 'left',
    shadow: b.shadow !== false,
  };
}

function render(m) {
  const K = encodeURIComponent(gate.ADMIN_KEY);

  const list = `<div class="tablecard" style="margin-top:16px">
    <div class="th">🖼️ แม่แบบทั้งหมด <span class="cnt">${u.n(m.templates.length)} ชุด</span></div>
    <div class="tablescroll"><table>
      <thead><tr><th>ชื่อ</th><th class="num">กล่องข้อความ</th><th class="num">แก้ล่าสุด</th><th class="num">จัดการ</th></tr></thead>
      <tbody>${m.templates.length ? m.templates.map((t) => `<tr>
        <td class="nm">${u.esc(t.name)}${t.active ? ' ' + u.pill('กำลังแก้', 'blue') : ''}</td>
        <td class="num">${u.n(t.boxes)}</td>
        <td class="num dim">${u.esc(t.when)}</td>
        <td class="num" style="white-space:nowrap">
          <a class="btn ghost mini" href="/admin/template?key=${K}&id=${encodeURIComponent(t.id)}">แก้</a>
          <form method="post" action="/admin/template/delete" class="inline"
            onsubmit="return confirm('${u.confirmText('ลบแม่แบบนี้?', ['ชื่อแม่แบบ', 'ตำแหน่งกล่องข้อความทั้งหมด'], ['รูปพื้นหลัง (ยังอยู่ในคลังไฟล์)'])}')">
            ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(t.id)}">
            <button class="btn danger mini" type="submit">🗑️</button></form></td></tr>`).join('')
    : `<tr><td colspan="4" class="empty">ยังไม่มีแม่แบบ — สร้างชุดแรกจากฟอร์มด้านบน</td></tr>`}</tbody></table></div>
  </div>`;

  const createForm = `<div class="panel">
    <h3>➕ สร้างแม่แบบใหม่</h3>
    <form method="post" action="/admin/template/create" enctype="multipart/form-data">
      ${gate.keyInput()}
      <div class="frow">
        <div class="grow"><input type="text" name="name" placeholder="ชื่อแม่แบบ เช่น ใบประกาศ" required></div>
        <div class="grow"><input type="file" name="file" accept="image/png,image/jpeg" required></div>
        <button class="btn" type="submit">สร้าง</button>
      </div>
      <div class="dim" style="margin-top:6px">อัปรูปพื้นหลังก่อน แล้วค่อยลากกล่องข้อความไปวาง</div>
    </form>
  </div>`;

  if (!m.cur) {
    return u.shell({
      tab: 'template', title: 'Template', query: m.query,
      warn: m.ready ? '' : u.notReady('แม่แบบ'),
      h1: '🖼️ Template Editor',
      hsub: 'วางข้อความลงรูปพื้นหลัง — อัปเดต ' + m.nowLabel,
      body: createForm + list,
      footer: 'พิกัดกล่องเก็บเป็นสัดส่วน 0–1 ของขนาดรูป ไม่ใช่พิกเซล — เปลี่ยนรูปพื้นหลังเป็นขนาดอื่นแล้วกล่องยังอยู่ที่เดิมตามสัดส่วน',
    });
  }

  const editor = `<div class="panel" style="margin:0">
    <h3>🎯 ลากกล่องไปวาง</h3>
    <div class="sub">ลากกล่องบนรูปเพื่อย้าย · ลากมุมขวาล่างเพื่อปรับความกว้าง · ค่าตัวเลขอัปเดตให้อัตโนมัติ</div>
    ${m.cur.bgMissing ? '<div class="warn">⚠️ รูปพื้นหลังของแม่แบบนี้ถูกลบออกจากคลังไฟล์แล้ว — อัปรูปใหม่ด้านล่าง กล่องข้อความยังอยู่ครบ</div>' : ''}
    <div class="stage" id="stage">
      ${m.cur.bgUrl ? `<img id="bg" src="${u.esc(m.cur.bgUrl)}" alt="" onerror="this.style.display='none'">` : '<div class="nobg">ยังไม่มีรูปพื้นหลัง</div>'}
      <div id="layer"></div>
    </div>
    <form method="post" action="/admin/template/bg" enctype="multipart/form-data" class="frow">
      ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(m.cur.id)}">
      <div class="grow"><input type="file" name="file" accept="image/png,image/jpeg" required></div>
      <button class="btn gray" type="submit">⬆️ เปลี่ยนรูปพื้นหลัง</button>
    </form>
  </div>`;

  const side = `<div class="panel" style="margin:0">
    <h3>📝 กล่องข้อความ</h3>
    <form method="post" action="/admin/template/save" id="tform">
      ${gate.keyInput()}
      <input type="hidden" name="id" value="${u.esc(m.cur.id)}">
      <input type="hidden" name="boxes" id="boxes">
      <div class="fld"><label>ชื่อแม่แบบ</label><input type="text" name="name" value="${u.esc(m.cur.name)}" required></div>
      <div id="fields"></div>
      <div class="btnrow">
        <button class="btn ghost" type="button" id="addbox">➕ เพิ่มกล่อง</button>
        <button class="btn" type="submit">💾 บันทึก</button>
      </div>
    </form>
    <form method="post" action="/admin/template/test" style="margin-top:14px;border-top:1px solid var(--line);padding-top:14px">
      ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(m.cur.id)}">
      <div class="fld"><label>ส่งทดสอบไปที่ LINE user id</label>
        <div class="frow" style="margin:0"><div class="grow"><input type="text" name="to" value="${u.esc(m.testTarget)}" placeholder="Uxxxxxxxx" required></div>
        <button class="btn green" type="submit"${m.lineOk ? '' : ' disabled title="ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN"'}>📤 ส่งทดสอบ</button></div></div>
      <div class="dim">ส่งเป็นลิงก์รูปพื้นหลัง + ข้อความในกล่อง (ยังไม่ได้เบิร์นข้อความลงรูปฝั่งเซิร์ฟเวอร์)</div>
    </form>
  </div>`;

  const script = `
  (function(){
    var boxes=${u.jsonScript(m.cur.boxes)};
    var layer=document.getElementById('layer'),stage=document.getElementById('stage');
    var fields=document.getElementById('fields'),form=document.getElementById('tform');
    if(!layer||!form)return;

    function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

    function drawAll(){
      layer.innerHTML='';
      fields.innerHTML='';
      boxes.forEach(function(b,i){
        var el=document.createElement('div');
        el.className='tbox';el.dataset.i=i;
        el.style.left=(b.x*100)+'%';el.style.top=(b.y*100)+'%';el.style.width=(b.w*100)+'%';
        el.style.color=b.color;el.style.textAlign=b.align;
        el.style.fontSize='calc('+(b.size*100)+' * var(--stageh) / 100)';
        if(b.shadow)el.style.textShadow='0 2px 6px rgba(0,0,0,.6)';
        el.innerHTML='<span class="ttext">'+esc(b.text||'(ว่าง)')+'</span><span class="grip"></span>';
        layer.appendChild(el);

        var f=document.createElement('div');
        f.className='bcard';
        f.innerHTML='<div class="bhead">กล่องที่ '+(i+1)+'</div>'+
          '<div class="fld"><input type="text" class="f-text" value="'+esc(b.text)+'" placeholder="ข้อความ"></div>'+
          '<div class="grid2">'+
          '<div class="fld"><label>ขนาด</label><input type="range" class="f-size" min="1" max="30" value="'+Math.round(b.size*100)+'"></div>'+
          '<div class="fld"><label>สี</label><input type="color" class="f-color" value="'+esc(b.color)+'"></div>'+
          '<div class="fld"><label>จัดชิด</label><select class="f-align">'+
            ['left:ซ้าย','center:กลาง','right:ขวา'].map(function(o){var p=o.split(':');
              return '<option value="'+p[0]+'"'+(b.align===p[0]?' selected':'')+'>'+p[1]+'</option>';}).join('')+
          '</select></div>'+
          '<div class="fld"><label>&nbsp;</label><button type="button" class="btn danger mini f-del">ลบกล่องนี้</button></div>'+
          '</div>'+
          '<div class="dim">ตำแหน่ง x '+b.x.toFixed(3)+' · y '+b.y.toFixed(3)+' · กว้าง '+b.w.toFixed(3)+' (สัดส่วน 0–1)</div>';
        fields.appendChild(f);

        f.querySelector('.f-text').addEventListener('input',function(e){b.text=e.target.value;drawAll();});
        f.querySelector('.f-size').addEventListener('input',function(e){b.size=Number(e.target.value)/100;drawAll();});
        f.querySelector('.f-color').addEventListener('input',function(e){b.color=e.target.value;drawAll();});
        f.querySelector('.f-align').addEventListener('change',function(e){b.align=e.target.value;drawAll();});
        f.querySelector('.f-del').addEventListener('click',function(){boxes.splice(i,1);drawAll();});
      });
      sync();
    }
    function sync(){document.getElementById('boxes').value=JSON.stringify(boxes);}

    // ลาก: คิดเป็นสัดส่วนของขนาด stage เสมอ ไม่เก็บพิกเซล
    var drag=null;
    layer.addEventListener('pointerdown',function(e){
      var el=e.target.closest('.tbox'); if(!el)return;
      var r=stage.getBoundingClientRect();
      drag={i:+el.dataset.i,mode:e.target.classList.contains('grip')?'size':'move',
            r:r,sx:e.clientX,sy:e.clientY,b:Object.assign({},boxes[+el.dataset.i])};
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    layer.addEventListener('pointermove',function(e){
      if(!drag)return;
      var b=boxes[drag.i],dx=(e.clientX-drag.sx)/drag.r.width,dy=(e.clientY-drag.sy)/drag.r.height;
      if(drag.mode==='move'){
        b.x=Math.min(1,Math.max(0,drag.b.x+dx));
        b.y=Math.min(1,Math.max(0,drag.b.y+dy));
      }else{
        b.w=Math.min(1,Math.max(0.05,drag.b.w+dx));
      }
      var el=layer.querySelector('.tbox[data-i="'+drag.i+'"]');
      if(el){el.style.left=(b.x*100)+'%';el.style.top=(b.y*100)+'%';el.style.width=(b.w*100)+'%';}
    });
    function endDrag(){ if(drag){drag=null;drawAll();} }
    layer.addEventListener('pointerup',endDrag);
    layer.addEventListener('pointercancel',endDrag);

    document.getElementById('addbox').addEventListener('click',function(){
      boxes.push({text:'ข้อความใหม่',x:0.1,y:0.1+boxes.length*0.08,w:0.5,size:0.06,color:'#FFFFFF',align:'left',shadow:true});
      drawAll();
    });
    form.addEventListener('submit',sync);

    // ขนาดตัวอักษรอิงความสูงรูปจริง เพื่อให้พรีวิวใกล้ของจริงตอนเบิร์นลงรูป
    function setH(){
      var img=document.getElementById('bg');
      stage.style.setProperty('--stageh',(img&&img.clientHeight?img.clientHeight:320)+'px');
    }
    window.addEventListener('resize',function(){setH();drawAll();});
    var img=document.getElementById('bg');
    if(img)img.addEventListener('load',function(){setH();drawAll();});
    setH();drawAll();
  })();`;

  return u.shell({
    tab: 'template', title: 'Template', query: m.query,
    warn: m.ready ? '' : u.notReady('แม่แบบ'),
    h1: '🖼️ Template Editor',
    hsub: u.esc(m.cur.name) + ' — อัปเดต ' + m.nowLabel,
    css: `
      .tsplit{display:grid;grid-template-columns:1fr 360px;gap:14px;align-items:start}
      @media(max-width:980px){.tsplit{grid-template-columns:1fr}}
      .stage{position:relative;margin:12px 0;border-radius:var(--radius-sm);overflow:hidden;background:var(--line2);min-height:180px;touch-action:none}
      .stage img{width:100%;display:block}
      /* วางข้อความไว้บนสุด ไม่ใช่กลางกรอบ — ไม่งั้นมันไปซ้อนกับกล่องข้อความที่ลากวางอยู่ */
      .nobg{display:grid;place-items:start center;height:220px;padding-top:14px;color:var(--muted);font-size:13.5px}
      #layer{position:absolute;inset:0}
      .tbox{position:absolute;padding:2px 4px;border:1px dashed rgba(255,255,255,.75);cursor:move;line-height:1.25;font-weight:700;user-select:none;background:rgba(0,0,0,.06)}
      .tbox .grip{position:absolute;right:-6px;bottom:-6px;width:13px;height:13px;border-radius:3px;background:var(--blue);border:2px solid #fff;cursor:ew-resize}
      .bcard{border:1px solid var(--line);border-radius:var(--radius-sm);padding:11px 13px;margin-top:10px}
      .bhead{font-size:12.5px;font-weight:700;color:var(--muted);margin-bottom:6px}
      input[type=range]{width:100%;padding:0}
      input[type=color]{width:100%;height:36px;padding:2px}
    `,
    body: `<div class="tsplit">${editor}${side}</div>` + createForm + list,
    footer: 'พิกัดเก็บเป็นสัดส่วน 0–1 ของขนาดรูป ไม่ใช่พิกเซล — เปลี่ยนรูปพื้นหลังเป็นขนาดอื่นแล้วกล่องยังอยู่ตำแหน่งเดิมตามสัดส่วน · พรีวิวเป็นการจำลองด้วย CSS ฟอนต์จริงตอนเบิร์นลงรูปอาจต่างเล็กน้อย',
    script,
  });
}

module.exports = { page, render, normBox };
