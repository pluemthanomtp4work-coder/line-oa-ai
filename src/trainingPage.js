// หน้า /training — สอนบอท: คลังความรู้ · เอกสาร · กฎกันเดา · persona · memory · feedback · ทดลองแชท
// ห้ามใส่ meta refresh ในหน้านี้ — มีฟอร์มยาวหลายอัน รีเฟรชแล้วสิ่งที่พิมพ์ค้างไว้หายหมด
// แต่ละบล็อกเป็นอิสระ มีฟอร์ม + ตารางของตัวเอง เพิ่มบล็อกใหม่ไม่กระทบบล็อกเดิม
const u = require('./adminUi');
const gate = require('./adminGate');

const TOP_ROWS = 10;
const K = { body: 'kbody', search: 'ksearch', more: 'kmore', count: 'kcount' };

async function page(deps, query = {}) {
  const [knowledge, docs, rules, prompts, memories, feedback] = await Promise.all([
    deps.listKnowledge().catch(() => null),
    deps.listDocs().catch(() => null),
    deps.listRules().catch(() => null),
    deps.listPrompts().catch(() => null),
    deps.listMemories().catch(() => null),
    deps.listFeedback().catch(() => null),
  ]);

  return render({
    query,
    ready: {
      knowledge: Array.isArray(knowledge), docs: Array.isArray(docs), rules: Array.isArray(rules),
      prompts: Array.isArray(prompts), memories: Array.isArray(memories), feedback: Array.isArray(feedback),
    },
    knowledge: (knowledge || []).slice().reverse(),
    docs: (docs || []).slice().reverse(),
    rules: rules || [],
    prompts: prompts || [],
    memories: memories || [],
    feedback: (feedback || []).filter((f) => !f.promoted).slice().reverse(),
    // ผลลัพธ์ช่องทดลองแชท ส่งกลับมาทาง query (PRG) ไม่เก็บ state ในเซิร์ฟเวอร์
    tryQ: query.tq || '',
    tryA: query.ta || '',
    tryVia: query.tv || '',
    nowLabel: deps.nowLabel(),
  });
}

function render(m) {
  const enabled = m.knowledge.filter((k) => k.enabled).length;
  const draft = m.knowledge.length - enabled;
  const activePrompt = m.prompts.find((p) => p.active);

  // ---------- 1. คลังความรู้ ----------
  const kDel = u.confirmText('ลบความรู้ข้อนี้?', ['ข้อความทั้งข้อ'], ['ความรู้ข้ออื่น', 'เอกสารที่อัปไว้']);
  const kRows = m.knowledge.length
    ? m.knowledge.map((k, i) => `<tr class="urow${i >= TOP_ROWS ? ' hid' : ''}" data-hay="${u.esc(String(k.title).toLowerCase())} ${u.esc(String(k.body).toLowerCase().slice(0, 200))}">
        <td><div class="nm">${u.esc(k.title)}</div><div class="dim">${u.esc(String(k.body).slice(0, 110))}${String(k.body).length > 110 ? '…' : ''}</div></td>
        <td>${u.pill(k.source === 'doc' ? 'จากเอกสาร' : k.source === 'feedback' ? 'จาก feedback' : 'พิมพ์เอง', 'blue')}</td>
        <td class="num"><form method="post" action="/training/knowledge/toggle" class="inline">${gate.keyInput()}
          <input type="hidden" name="id" value="${u.esc(k.id)}"><input type="hidden" name="value" value="${k.enabled ? '0' : '1'}">
          <button class="chip ${k.enabled ? 'active' : ''}" type="submit">${k.enabled ? 'เปิดใช้' : 'ร่าง'}</button></form></td>
        <td class="num"><div class="acts">
          <details><summary class="btn ghost mini" style="display:inline-flex">แก้</summary>
            <form method="post" action="/training/knowledge/save" style="margin-top:8px;text-align:left;min-width:260px">
              ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(k.id)}">
              <input type="text" name="title" value="${u.esc(k.title)}" required>
              <textarea name="body" required>${u.esc(k.body)}</textarea>
              <button class="btn mini" type="submit">บันทึก</button></form></details>
          <form method="post" action="/training/knowledge/delete" class="inline" onsubmit="return confirm('${kDel}')">
            ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(k.id)}">
            <button class="btn danger mini" type="submit">🗑️</button></form>
        </div></td></tr>`).join('')
    : `<tr><td colspan="4" class="empty">ยังไม่มีความรู้ — เพิ่มข้อแรกในฟอร์มด้านบน</td></tr>`;

  const knowledgeBlock = `
    <div class="panel">
      <h3>📚 คลังความรู้ <span class="cnt">${u.n(enabled)} เปิดใช้ / ${u.n(m.knowledge.length)} ข้อ</span></h3>
      <div class="sub">ข้อที่ "เปิดใช้" จะถูกใส่เข้า prompt ทุกครั้งที่บอทตอบ — ข้อที่เป็น "ร่าง" ไม่ถูกใช้</div>
      <form method="post" action="/training/knowledge/save">
        ${gate.keyInput()}
        <div class="fld"><label>หัวข้อ</label><input type="text" name="title" placeholder="เช่น เวลาทำการ" required></div>
        <div class="fld"><label>เนื้อหา</label><textarea name="body" placeholder="จันทร์–ศุกร์ 8:30–17:00 หยุดเสาร์–อาทิตย์และวันหยุดราชการ" required></textarea></div>
        <div class="btnrow"><button class="btn" type="submit">➕ เพิ่มความรู้</button>
        ${draft > 0 ? `<button class="btn gray" type="submit" formaction="/training/knowledge/enable-all">เปิดใช้ทั้งหมด (${u.n(draft)} ร่าง)</button>` : ''}</div>
      </form>
    </div>
    <div class="tablecard">
      <div class="th thbar"><span>รายการความรู้</span>
        <input id="${K.search}" class="srch" type="search" placeholder="ค้นหา…" autocomplete="off"></div>
      <div class="tablescroll"><table>
        <thead><tr><th>หัวข้อ</th><th>ที่มา</th><th class="num">สถานะ</th><th class="num">จัดการ</th></tr></thead>
        <tbody id="${K.body}">${kRows}</tbody></table></div>
      ${u.moreBar(m.knowledge.length, TOP_ROWS, K)}
    </div>`;

  // ---------- 2. เอกสารในคลัง ----------
  const dDel = u.confirmText('ลบเอกสารนี้?', ['ไฟล์ที่อัปโหลด', 'ความรู้ที่ถูกดึงจากไฟล์นี้'], ['ความรู้ที่พิมพ์เอง']);
  const docsBlock = `
    <details class="panel fold">
      <summary><h3>📄 เอกสารในคลัง <span class="cnt">${u.n(m.docs.length)} ไฟล์</span></h3></summary>
      <div class="sub" style="margin-top:10px">อัปไฟล์ <code>.md</code> / <code>.txt</code> เพื่อแปลงเป็นความรู้ทั้งก้อน (PDF ต้องแปลงเป็นข้อความก่อน)</div>
      <form method="post" action="/training/docs/upload" enctype="multipart/form-data">
        ${gate.keyInput()}
        <div class="frow"><div class="grow"><input type="file" name="file" accept=".md,.txt,.markdown,text/plain" required></div>
        <button class="btn" type="submit">⬆️ อัปและแปลงเป็นความรู้</button></div>
      </form>
      <div class="tablescroll" style="margin-top:12px"><table>
        <thead><tr><th>ชื่อไฟล์</th><th class="num">ขนาด</th><th>สถานะ</th><th class="num">จัดการ</th></tr></thead>
        <tbody>${m.docs.length ? m.docs.map((d) => `<tr>
          <td><div class="nm">${u.esc(d.name)}</div><div class="dim">${u.esc(String(d.note || ''))}</div></td>
          <td class="num dim">${u.n(Math.round((d.size || 0) / 1024))} KB</td>
          <td>${u.pill(d.status === 'imported' ? `แปลงแล้ว ${u.n(d.items || 0)} ข้อ` : 'ยังไม่แปลง', d.status === 'imported' ? 'on' : 'warn')}</td>
          <td class="num"><form method="post" action="/training/docs/delete" class="inline" onsubmit="return confirm('${dDel}')">
            ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(d.id)}">
            <button class="btn danger mini" type="submit">🗑️</button></form></td></tr>`).join('')
      : `<tr><td colspan="4" class="empty">ยังไม่มีเอกสาร</td></tr>`}</tbody></table></div>
    </details>`;

  // ---------- 3. กฎกันบอทเดา ----------
  const ACTIONS = { reply: 'ตอบข้อความตายตัว', handoff: 'ส่งต่อเจ้าหน้าที่', silent: 'ไม่ตอบเลย' };
  const rulesBlock = `
    <details class="panel fold">
      <summary><h3>🛑 กฎกันบอทเดา <span class="cnt">${u.n(m.rules.filter((r) => r.enabled).length)} กฎที่เปิด</span></h3></summary>
      <div class="sub" style="margin-top:10px">ถ้าข้อความเข้ามาตรงคำค้นข้อใดข้อหนึ่ง จะทำตามกฎทันที <b>ไม่เรียก AI</b> (ไม่เสียเงิน)</div>
      <form method="post" action="/training/rules/save">
        ${gate.keyInput()}
        <div class="grid2">
          <div class="fld"><label>คำค้น (คั่นด้วยเครื่องหมายจุลภาค — ต้องมีอย่างน้อย 1 คำ)</label>
            <input type="text" name="keywords" placeholder="ราคา, ค่าบริการ, กี่บาท" required></div>
          <div class="fld"><label>ทำอะไร</label>
            <select name="action">${Object.entries(ACTIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        </div>
        <div class="fld"><label>ข้อความตอบ (ใช้กับ 2 แบบแรก)</label>
          <textarea name="reply" placeholder="ราคาขึ้นกับขอบเขตงานครับ ขอให้เจ้าหน้าที่ติดต่อกลับนะครับ"></textarea></div>
        <button class="btn" type="submit">➕ เพิ่มกฎ</button>
      </form>
      <div class="tablescroll" style="margin-top:12px"><table>
        <thead><tr><th>คำค้น</th><th>การกระทำ</th><th>ข้อความตอบ</th><th class="num">สถานะ</th><th class="num">จัดการ</th></tr></thead>
        <tbody>${m.rules.length ? m.rules.map((r) => `<tr>
          <td>${(r.keywords || []).map((w) => `<code>${u.esc(w)}</code>`).join(' ')}</td>
          <td>${u.esc(ACTIONS[r.action] || r.action)}</td>
          <td class="dim">${u.esc(String(r.reply || '').slice(0, 70)) || '—'}</td>
          <td class="num"><form method="post" action="/training/rules/toggle" class="inline">${gate.keyInput()}
            <input type="hidden" name="id" value="${u.esc(r.id)}"><input type="hidden" name="value" value="${r.enabled ? '0' : '1'}">
            <button class="chip ${r.enabled ? 'active' : ''}" type="submit">${r.enabled ? 'เปิด' : 'ปิด'}</button></form></td>
          <td class="num"><form method="post" action="/training/rules/delete" class="inline" onsubmit="return confirm('ลบกฎนี้?\\n\\nสิ่งที่หาย:\\n- คำค้นและข้อความตอบของกฎนี้\\n\\nกู้คืนไม่ได้')">
            ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(r.id)}">
            <button class="btn danger mini" type="submit">🗑️</button></form></td></tr>`).join('')
      : `<tr><td colspan="5" class="empty">ยังไม่มีกฎ — บอทจะใช้ AI ตอบทุกข้อความ</td></tr>`}</tbody></table></div>
    </details>`;

  // ---------- 4. Prompt Manager (persona) ----------
  const promptsBlock = `
    <details class="panel fold">
      <summary><h3>🎭 บุคลิกบอท (persona) <span class="cnt">${activePrompt ? 'ใช้: ' + u.esc(activePrompt.name) : 'ยังไม่ได้เลือก'}</span></h3></summary>
      <div class="sub" style="margin-top:10px">สลับชุดที่ใช้งานได้ทันทีโดยไม่ต้อง deploy ใหม่ — ชุดที่ติ๊ก "ใช้ชุดนี้" คือชุดที่มีผลจริง</div>
      <form method="post" action="/training/prompts/save">
        ${gate.keyInput()}
        <div class="fld"><label>ชื่อชุด</label><input type="text" name="name" placeholder="เช่น สุภาพทางการ" required></div>
        <div class="fld"><label>คำสั่งบุคลิก</label><textarea name="body" placeholder="คุณเป็นเจ้าหน้าที่ประชาสัมพันธ์ ตอบสุภาพ ลงท้ายด้วยครับ ไม่ใช้คำแสลง" required></textarea></div>
        <button class="btn" type="submit">➕ เพิ่มชุด</button>
      </form>
      <div class="tablescroll" style="margin-top:12px"><table>
        <thead><tr><th>ชื่อชุด</th><th>คำสั่ง</th><th class="num">ใช้งาน</th><th class="num">จัดการ</th></tr></thead>
        <tbody>${m.prompts.length ? m.prompts.map((p) => `<tr>
          <td class="nm">${u.esc(p.name)}</td>
          <td class="dim">${u.esc(String(p.body).slice(0, 90))}${String(p.body).length > 90 ? '…' : ''}</td>
          <td class="num">${p.active ? u.pill('ใช้ชุดนี้', 'on')
        : `<form method="post" action="/training/prompts/activate" class="inline">${gate.keyInput()}
              <input type="hidden" name="id" value="${u.esc(p.id)}"><button class="btn ghost mini" type="submit">เลือกใช้</button></form>`}</td>
          <td class="num"><form method="post" action="/training/prompts/delete" class="inline" onsubmit="return confirm('ลบชุดบุคลิกนี้?\\n\\nสิ่งที่หาย:\\n- คำสั่งบุคลิกชุดนี้\\n\\nกู้คืนไม่ได้')">
            ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(p.id)}">
            <button class="btn danger mini" type="submit">🗑️</button></form></td></tr>`).join('')
      : `<tr><td colspan="4" class="empty">ยังไม่มีชุด — บอทใช้บุคลิกเริ่มต้น (ผู้ช่วยตอบภาษาไทย สุภาพ กระชับ)</td></tr>`}</tbody></table></div>
    </details>`;

  // ---------- 5. Memory ----------
  const memoryBlock = `
    <details class="panel fold">
      <summary><h3>🧠 ความจำ <span class="cnt">${u.n(m.memories.filter((x) => x.enabled).length)} ข้อที่เปิด</span></h3></summary>
      <div class="sub" style="margin-top:10px">"ส่วนกลาง" ใส่ให้ทุกคน · "รายคน" ใส่เฉพาะ LINE user id ที่ระบุ</div>
      <form method="post" action="/training/memory/save">
        ${gate.keyInput()}
        <div class="grid2">
          <div class="fld"><label>ขอบเขต</label><select name="scope"><option value="global">ส่วนกลาง (ทุกคน)</option><option value="user">รายคน</option></select></div>
          <div class="fld"><label>LINE user id (เฉพาะรายคน)</label><input type="text" name="userId" placeholder="Uxxxxxxxx"></div>
        </div>
        <div class="fld"><label>สิ่งที่ให้จำ</label><input type="text" name="text" placeholder="ลูกค้ารายนี้ใช้ภาษาอังกฤษ" required></div>
        <button class="btn" type="submit">➕ เพิ่ม</button>
      </form>
      <div class="tablescroll" style="margin-top:12px"><table>
        <thead><tr><th>ขอบเขต</th><th>ข้อความ</th><th class="num">สถานะ</th><th class="num">จัดการ</th></tr></thead>
        <tbody>${m.memories.length ? m.memories.map((x) => `<tr>
          <td>${u.pill(x.scope === 'global' ? 'ส่วนกลาง' : 'รายคน', x.scope === 'global' ? 'blue' : '')}
            ${x.scope === 'user' ? `<div class="dim" style="font-size:11px">${u.esc(String(x.userId || '').slice(0, 12))}…</div>` : ''}</td>
          <td>${u.esc(x.text)}</td>
          <td class="num"><form method="post" action="/training/memory/toggle" class="inline">${gate.keyInput()}
            <input type="hidden" name="id" value="${u.esc(x.id)}"><input type="hidden" name="value" value="${x.enabled ? '0' : '1'}">
            <button class="chip ${x.enabled ? 'active' : ''}" type="submit">${x.enabled ? 'เปิด' : 'ปิด'}</button></form></td>
          <td class="num"><form method="post" action="/training/memory/delete" class="inline" onsubmit="return confirm('ลบความจำข้อนี้?\\n\\nสิ่งที่หาย:\\n- ข้อความที่ให้จำ\\n\\nกู้คืนไม่ได้')">
            ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(x.id)}">
            <button class="btn danger mini" type="submit">🗑️</button></form></td></tr>`).join('')
      : `<tr><td colspan="4" class="empty">ยังไม่มีความจำ</td></tr>`}</tbody></table></div>
    </details>`;

  // ---------- 6. Feedback ----------
  const feedbackBlock = `
    <details class="panel fold"${m.feedback.length ? ' open' : ''}>
      <summary><h3>👎 คำตอบที่ผู้ใช้บอกว่าไม่ดี <span class="cnt">${u.n(m.feedback.length)} รายการค้าง</span></h3></summary>
      <div class="sub" style="margin-top:10px">กด "เลื่อนขึ้นเป็นความรู้" เพื่อเอาคำถามนี้ไปตั้งเป็นความรู้ใหม่ (สถานะเริ่มต้นเป็นร่าง ให้แก้คำตอบก่อนเปิดใช้)</div>
      <div class="tablescroll"><table>
        <thead><tr><th>คำถาม</th><th>บอทตอบว่า</th><th class="num">จัดการ</th></tr></thead>
        <tbody>${m.feedback.length ? m.feedback.map((f) => `<tr>
          <td class="nm">${u.esc(String(f.question).slice(0, 80))}</td>
          <td class="dim">${u.esc(String(f.answer || '').slice(0, 80))}</td>
          <td class="num"><form method="post" action="/training/feedback/promote" class="inline">${gate.keyInput()}
            <input type="hidden" name="id" value="${u.esc(f.id)}">
            <button class="btn gray mini" type="submit">⬆️ เลื่อนขึ้นเป็นความรู้</button></form>
          <form method="post" action="/training/feedback/delete" class="inline" onsubmit="return confirm('ลบ feedback นี้?\\n\\nสิ่งที่หาย:\\n- คำถาม/คำตอบที่บันทึกไว้\\n\\nกู้คืนไม่ได้')">
            ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(f.id)}">
            <button class="btn danger mini" type="submit">🗑️</button></form></td></tr>`).join('')
      : `<tr><td colspan="3" class="empty">ยังไม่มี feedback ค้าง 🎉</td></tr>`}</tbody></table></div>
    </details>`;

  // ---------- 7. ทดลองแชท ----------
  const tryBlock = `
    <div class="panel">
      <h3>🧪 ทดลองแชท</h3>
      <div class="sub">ใช้ความรู้ กฎ persona และ memory ชุดเดียวกับที่ผู้ใช้จริงได้ — <b>การทดลองนี้เสียค่า API จริงและถูกนับใน Dashboard</b></div>
      <form method="post" action="/training/try">
        ${gate.keyInput()}
        <div class="frow"><div class="grow"><input type="text" name="q" value="${u.esc(m.tryQ)}" placeholder="พิมพ์คำถามที่อยากลอง…" required></div>
        <button class="btn" type="submit">ส่ง</button></div>
      </form>
      ${m.tryA ? `<div class="panel" style="margin:12px 0 0;background:var(--line2)">
        <div class="dim">ถาม: ${u.esc(m.tryQ)}</div>
        <div style="margin-top:6px;white-space:pre-wrap">${u.esc(m.tryA)}</div>
        <div class="dim" style="margin-top:8px">ตอบโดย: ${u.esc(m.tryVia === 'rule' ? 'กฎกันเดา (ไม่เสียเงิน)' : m.tryVia === 'handoff' ? 'กฎ → ส่งต่อเจ้าหน้าที่' : 'AI')}</div>
      </div>` : ''}
    </div>`;

  const warn = Object.entries(m.ready).filter(([, ok]) => !ok).map(([k]) => u.notReady('ข้อมูล ' + k)).join('');

  return u.shell({
    tab: 'training', title: 'สอนบอท', query: m.query, warn,
    h1: '🎓 สอนบอท',
    hsub: 'คลังความรู้ กฎ บุคลิก และความจำ — อัปเดต ' + m.nowLabel,
    pill: `<span class="pill">${enabled ? `📚 ${u.n(enabled)} ความรู้ที่บอทใช้อยู่` : '📚 ยังไม่มีความรู้ที่เปิดใช้'}</span>`,
    body: tryBlock + knowledgeBlock + docsBlock + rulesBlock + promptsBlock + memoryBlock + feedbackBlock,
    footer: 'ความรู้ที่ "เปิดใช้" ทุกข้อถูกใส่เข้า prompt ทุกครั้งที่บอทตอบ — ยิ่งเปิดมาก token ยิ่งมาก ค่าใช้จ่ายยิ่งสูง · กฎกันเดาทำงานก่อน AI จึงไม่มีค่าใช้จ่าย',
    script: u.tableScript(K, TOP_ROWS),
  });
}

module.exports = { page, render };
