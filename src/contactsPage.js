// หน้า /contacts — สมุดรายชื่อ: แปลง LINE user id ที่อ่านไม่รู้เรื่องให้เป็นชื่อที่คนอ่านได้
// หน้าเล็กสุดในชุด — มีไว้เพราะ id อย่าง U1a2b3c... ใช้อ้างอิงกับคนในทีมไม่ได้
const u = require('./adminUi');
const gate = require('./adminGate');

const TOP_ROWS = 15;
const IDS = { body: 'cbody', search: 'csearch', more: 'cmore', count: 'ccount' };

async function page(deps, query = {}) {
  const [contacts, users] = await Promise.all([
    deps.listContacts().catch(() => null),
    deps.listUsers().catch(() => []),
  ]);
  const byLine = new Map((contacts || []).map((c) => [c.lineUserId, c]));

  // แถวมาจาก "ผู้ใช้ที่ระบบเคยเห็น" เป็นหลัก แล้วเอาชื่อเรียกจาก contacts มาทับ
  const rows = (users || []).map((x) => {
    const c = byLine.get(x.lineUserId) || {};
    return {
      lineUserId: x.lineUserId || '',
      displayName: x.displayName || '',
      picture: x.pictureUrl || '',
      alias: c.alias || '',
      note: c.note || '',
      contactId: c.id || '',
      lastSeen: String(x.lastSeen || '').slice(0, 16).replace('T', ' ') || '-',
    };
  }).sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));

  return render({ query, ready: Array.isArray(contacts), rows, named: rows.filter((r) => r.alias).length, nowLabel: deps.nowLabel() });
}

function render(m) {
  const DEL = u.confirmText('ลบชื่อเรียกของคนนี้?', ['ชื่อเรียกที่ตั้งไว้', 'หมายเหตุ'], ['บัญชีผู้ใช้', 'ประวัติการคุย']);

  const rows = m.rows.length
    ? m.rows.map((r, i) => `<tr class="urow${i >= TOP_ROWS ? ' hid' : ''}" data-hay="${u.esc((r.alias + ' ' + r.displayName + ' ' + r.note).toLowerCase())}">
        <td><div class="who"><span class="av">${r.picture ? `<img src="${u.esc(r.picture)}" alt="" loading="lazy">` : u.initials(r.alias || r.displayName)}</span>
          <div><div class="nm">${u.esc(r.alias || r.displayName || '(ไม่มีชื่อ)')}</div>
          <div class="dim" style="font-size:11px">${r.alias && r.displayName ? 'ชื่อใน LINE: ' + u.esc(r.displayName) : u.esc(r.lineUserId.slice(0, 14) + '…')}</div></div></div></td>
        <td><form method="post" action="/contacts/save" class="frow" style="margin:0;gap:6px">
          ${gate.keyInput()}<input type="hidden" name="lineUserId" value="${u.esc(r.lineUserId)}">
          <input type="text" name="alias" value="${u.esc(r.alias)}" placeholder="ชื่อเรียก" style="min-width:120px;flex:1">
          <input type="text" name="note" value="${u.esc(r.note)}" placeholder="หมายเหตุ" style="min-width:120px;flex:1">
          <button class="btn mini" type="submit">บันทึก</button></form></td>
        <td class="num dim">${u.esc(r.lastSeen)}</td>
        <td class="num">${r.contactId ? `<form method="post" action="/contacts/delete" class="inline" onsubmit="return confirm('${DEL}')">
          ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(r.contactId)}">
          <button class="btn danger mini" type="submit">🗑️</button></form>` : '<span class="dim">—</span>'}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" class="empty">ยังไม่มีใครคุยกับบอท — รายชื่อจะขึ้นเองเมื่อมีคนส่งข้อความเข้ามา</td></tr>`;

  const body = `
    <div class="stats">
      ${u.statCard('🗂', 'คนที่ระบบเคยเห็น', u.n(m.rows.length), '', '#2D6CDF')}
      ${u.statCard('🏷️', 'ตั้งชื่อเรียกแล้ว', u.n(m.named), `เหลือ ${u.n(m.rows.length - m.named)} คน`, '#7C4DFF')}
    </div>
    <div class="tablecard">
      <div class="th thbar"><span>รายชื่อ <span class="cnt">${u.n(m.rows.length)} คน</span></span>
        <input id="${IDS.search}" class="srch" type="search" placeholder="ค้นหาชื่อ/หมายเหตุ…" autocomplete="off"></div>
      <div class="tablescroll"><table>
        <thead><tr><th>คน</th><th>ชื่อเรียก + หมายเหตุ</th><th class="num">คุยล่าสุด</th><th class="num">จัดการ</th></tr></thead>
        <tbody id="${IDS.body}">${rows}</tbody></table></div>
      ${u.moreBar(m.rows.length, TOP_ROWS, IDS)}
    </div>`;

  return u.shell({
    tab: 'contacts', title: 'รายชื่อ', query: m.query,
    warn: m.ready ? '' : u.notReady('สมุดรายชื่อ'),
    h1: '🗂 รายชื่อ',
    hsub: 'ตั้งชื่อเรียกให้ LINE user id ที่อ่านไม่รู้เรื่อง — อัปเดต ' + m.nowLabel,
    body,
    footer: 'ชื่อเรียกใช้แสดงในหน้าหลังบ้านเท่านั้น ไม่ถูกส่งให้ผู้ใช้เห็น · LINE user id แสดงแค่ 14 ตัวแรกเพราะหน้านี้ล็อกด้วย ?key= ซึ่งติดไปกับ URL และ log ของ proxy',
    script: u.tableScript(IDS, TOP_ROWS),
  });
}

module.exports = { page, render };
