// หน้า /admin/users — สิทธิ์/บทบาท/บล็อก + สั่งทีละหลายคน (bulk)
// กับดักที่กันไว้: แอดมินอ้างอิงจาก env (LINE_ADMIN_USER_IDS) ไม่ใช่จากตาราง
// ถ้าอ่านจากตาราง แล้วเผลอลดสิทธิ์ตัวเอง = ล็อกตัวเองออกจากระบบ กู้ไม่ได้จากหน้าเว็บ
const u = require('./adminUi');
const gate = require('./adminGate');

const TOP_ROWS = 15;
const IDS = { body: 'ubody', search: 'usearch', more: 'umore', count: 'ucount' };
const PERMS = [
  ['chat', '💬 แชท'],
  ['files', '📁 คลังไฟล์'],
  ['image', '🖼️ สร้างรูป'],
];

async function page(deps, query = {}) {
  const [users, logs] = await Promise.all([
    deps.listUsers().catch(() => null),
    deps.listAiLogs().catch(() => []),
  ]);
  const rows = Array.isArray(users) ? users : [];

  const calls = new Map();
  for (const r of logs || []) {
    if (!r.userId) continue;
    calls.set(r.userId, (calls.get(r.userId) || 0) + 1);
  }

  const admins = deps.adminUserIds || [];
  return render({
    query,
    ready: Array.isArray(users),
    adminCount: admins.length,
    rows: rows.map((x) => ({
      id: x.id,
      lineUserId: x.lineUserId || '',
      name: x.displayName || (x.lineUserId || '').slice(0, 8),
      picture: x.pictureUrl || '',
      role: x.role || 'guest',
      blocked: Boolean(x.blocked),
      isAdmin: admins.includes(x.lineUserId),
      perms: x.perms || {},
      calls: calls.get(x.lineUserId) || 0,
      lastSeen: String(x.lastSeen || '').slice(0, 16).replace('T', ' ') || '-',
    })).sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || b.calls - a.calls),
    nowLabel: deps.nowLabel(),
  });
}

function render(m) {
  const members = m.rows.filter((r) => r.role === 'member').length;
  const blocked = m.rows.filter((r) => r.blocked).length;

  const DEL = u.confirmText('ลบผู้ใช้ที่เลือก?',
    ['ชื่อ/รูปโปรไฟล์', 'บทบาทและสิทธิ์ที่ตั้งไว้', 'ความจำรายคน'],
    ['ประวัติการเรียก AI', 'ไฟล์ที่อัปโหลดไว้']);

  const bodyRows = m.rows.length
    ? m.rows.map((r, i) => {
      const lock = r.isAdmin;   // แอดมินจาก env — ปุ่มที่ทำร้ายตัวเองต้องกดไม่ได้
      return `<tr class="urow${i >= TOP_ROWS ? ' hid' : ''}" data-hay="${u.esc(String(r.name).toLowerCase())} ${u.esc(r.role)}${r.blocked ? ' บล็อก' : ''}">
        <td>${lock ? '' : `<input type="checkbox" class="pick" name="ids" value="${u.esc(r.id)}" style="width:auto">`}</td>
        <td><div class="who"><span class="av">${r.picture ? `<img src="${u.esc(r.picture)}" alt="" loading="lazy">` : u.initials(r.name)}</span>
          <div><div class="nm">${u.esc(r.name)}</div>
          <div class="dim" style="font-size:11px">${lock ? 'แอดมิน (จาก .env)' : u.esc(r.lineUserId.slice(0, 12) + '…')}</div></div></div></td>
        <td>${lock ? u.pill('แอดมิน', 'blue')
        : `<form method="post" action="/admin/users/role" class="inline">${gate.keyInput()}
            <input type="hidden" name="id" value="${u.esc(r.id)}">
            <input type="hidden" name="role" value="${r.role === 'member' ? 'guest' : 'member'}">
            <button class="btn ${r.role === 'member' ? 'gray' : 'ghost'} mini" type="submit" title="กดเพื่อสลับ">${r.role === 'member' ? 'สมาชิก' : 'ทั่วไป'} ⇄</button></form>`}</td>
        <td>${PERMS.map(([k, label]) => {
          const on = r.perms[k] === true;
          return `<form method="post" action="/admin/users/perm" class="inline">${gate.keyInput()}
            <input type="hidden" name="id" value="${u.esc(r.id)}"><input type="hidden" name="perm" value="${k}">
            <input type="hidden" name="value" value="${on ? '0' : '1'}">
            <button class="chip ${on ? 'active' : ''}" type="submit" title="${on ? 'กดเพื่อปิดสิทธิ์' : 'กดเพื่อเปิดสิทธิ์'}">${label}</button></form>`;
        }).join(' ')}</td>
        <td class="num">${u.n(r.calls)}</td>
        <td class="num dim">${u.esc(r.lastSeen)}</td>
        <td class="num" style="white-space:nowrap">
          ${lock ? '<span class="dim">—</span>' : `
          <form method="post" action="/admin/users/block" class="inline">${gate.keyInput()}
            <input type="hidden" name="id" value="${u.esc(r.id)}"><input type="hidden" name="value" value="${r.blocked ? '0' : '1'}">
            <button class="btn ${r.blocked ? 'green' : 'gray'} mini" type="submit">${r.blocked ? 'ปลดบล็อก' : 'บล็อก'}</button></form>
          <form method="post" action="/admin/users/refresh" class="inline">${gate.keyInput()}
            <input type="hidden" name="id" value="${u.esc(r.id)}">
            <button class="btn ghost mini" type="submit" title="ดึงชื่อ/รูปจาก LINE ใหม่">↻</button></form>`}
        </td>
      </tr>`;
    }).join('')
    : `<tr><td colspan="7" class="empty">ยังไม่มีผู้ใช้ — เมื่อมีคนแอดบอทใน LINE ชื่อจะขึ้นที่นี่</td></tr>`;

  const body = `
    <div class="stats">
      ${u.statCard('👥', 'ผู้ใช้ทั้งหมด', u.n(m.rows.length), '', '#2D6CDF')}
      ${u.statCard('⭐', 'สมาชิก', u.n(members), 'ได้สิทธิ์เต็ม', '#7C4DFF')}
      ${u.statCard('🚫', 'ถูกบล็อก', u.n(blocked), 'บอทไม่ตอบ', '#D64A40')}
      ${u.statCard('🛡️', 'แอดมิน', u.n(m.adminCount), 'จาก .env', '#06C755')}
    </div>

    <div class="warn">ℹ️ แอดมินกำหนดจาก <code>LINE_ADMIN_USER_IDS</code> ใน <code>.env</code> เท่านั้น — แถวของแอดมินจะไม่มีปุ่มบล็อก/ลด
    บทบาท/ลบ เพื่อกันการล็อกตัวเองออกจากระบบ ถ้าต้องเปลี่ยนแอดมินให้แก้ <code>.env</code> แล้วรีสตาร์ต</div>

    <form method="post" id="bulkform" action="/admin/users/bulk/noop">
      ${gate.keyInput()}
      <div class="tablecard">
        <div class="th thbar">
          <span>👤 รายชื่อ <span class="cnt">${u.n(m.rows.length)} คน</span></span>
          <input id="${IDS.search}" class="srch" type="search" placeholder="ค้นหาชื่อ…" autocomplete="off">
        </div>
        <div class="tablescroll"><table>
          <thead><tr>
            <th><input type="checkbox" id="pickall" style="width:auto" title="เลือกทั้งหมดที่เห็น"></th>
            <th>ชื่อ</th><th>บทบาท</th><th>สิทธิ์รายฟีเจอร์</th>
            <th class="num">เรียก AI</th><th class="num">ล่าสุด</th><th class="num">จัดการ</th>
          </tr></thead>
          <tbody id="${IDS.body}">${bodyRows}</tbody>
        </table></div>
        <div class="morebar">
          <span class="dim">เลือกไว้ <b id="picked">0</b> คน →</span>
          <button class="btn gray mini" type="submit" formaction="/admin/users/bulk/role-member">ตั้งเป็นสมาชิก</button>
          <button class="btn gray mini" type="submit" formaction="/admin/users/bulk/role-guest">ตั้งเป็นทั่วไป</button>
          <button class="btn gray mini" type="submit" formaction="/admin/users/bulk/block">บล็อก</button>
          <button class="btn green mini" type="submit" formaction="/admin/users/bulk/unblock">ปลดบล็อก</button>
          <button class="btn danger mini" type="submit" formaction="/admin/users/bulk/delete" onclick="return confirm('${DEL}')">ลบ</button>
          ${m.rows.length > TOP_ROWS ? `<button type="button" id="${IDS.more}" class="btn ghost mini">แสดงทั้งหมด (${u.n(m.rows.length)})</button>
          <span id="${IDS.count}" class="dim">แสดง ${TOP_ROWS} อันดับแรก</span>` : ''}
        </div>
      </div>
    </form>`;

  return u.shell({
    tab: 'users', title: 'ผู้ใช้และสิทธิ์', query: m.query,
    warn: m.ready ? '' : u.notReady('ตารางผู้ใช้'),
    h1: '👥 ผู้ใช้และสิทธิ์',
    hsub: 'บทบาท สิทธิ์รายฟีเจอร์ และการบล็อก — อัปเดต ' + m.nowLabel,
    body,
    footer: 'ปุ่มสิทธิ์มีผลทันทีกับข้อความถัดไปที่ผู้ใช้ส่งเข้ามา · ผู้ใช้ที่ถูกบล็อกจะไม่ถูกเรียก AI จึงไม่มีค่าใช้จ่าย · แอดมินอ่านจาก .env ไม่ใช่จากตารางนี้',
    script: u.tableScript(IDS, TOP_ROWS) + `
      (function(){
        var all=document.getElementById('pickall'),lab=document.getElementById('picked');
        function boxes(){return [].slice.call(document.querySelectorAll('#${IDS.body} .pick'));}
        function count(){ if(lab)lab.textContent=boxes().filter(function(b){return b.checked;}).length; }
        if(all)all.addEventListener('change',function(){
          // ติ๊กทั้งหมด = เฉพาะแถวที่มองเห็นอยู่ ไม่ลามไปแถวที่ถูกย่อ/ถูกกรองออก
          boxes().forEach(function(b){ var tr=b.closest('tr'); if(tr&&!tr.classList.contains('hid'))b.checked=all.checked; });
          count();
        });
        document.addEventListener('change',function(e){ if(e.target&&e.target.classList.contains('pick'))count(); });
        count();
      })();`,
  });
}

module.exports = { page, render, PERMS };
