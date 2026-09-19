// หน้า /admin — Dashboard: ตัวเลขรวม ค่าใช้จ่าย โควต้า กราฟรายวัน ตารางผู้ใช้
// page() = ชั้นดึงข้อมูล · render(m) = ชั้นสร้าง HTML ล้วน (ไม่ await ไม่แตะ DB)
const u = require('./adminUi');
const gate = require('./adminGate');

const TOP_ROWS = 15;
const IDS = { body: 'ubody', search: 'usearch', more: 'umore', count: 'ucount' };

async function page(deps, query = {}) {
  // ทุก query มี .catch ของตัวเอง — แหล่งเดียวล่มต้องไม่ทำให้หน้า 500 ทั้งหน้า
  // null = ยังอ่านไม่ได้/ยังไม่ init · [] = อ่านได้แต่ยังไม่มีข้อมูล (คนละความหมาย)
  const [users, logs, settings, lineQuota] = await Promise.all([
    deps.listUsers().catch(() => null),
    deps.listAiLogs().catch(() => null),
    deps.settings().catch(() => ({})),
    deps.lineQuota ? deps.lineQuota().catch(() => null) : Promise.resolve(null),
  ]);

  const userRows = Array.isArray(users) ? users : [];
  const logRows = Array.isArray(logs) ? logs : [];

  // ---- รวมยอดในชั้นนี้ (ไม่ใช่ในชั้น render) ----
  const byDay = new Map();
  const byFeature = new Map();
  const byUser = new Map();
  let usd = 0, calls = 0, failed = 0, todayCalls = 0, todayUsd = 0;
  const todayKey = new Date().toISOString().slice(0, 10);

  for (const r of logRows) {
    calls += 1;
    if (r.ok === false) failed += 1;
    usd += Number(r.costUsd || 0);
    const day = String(r.createdAt || '').slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + 1);
    byFeature.set(r.feature || 'อื่นๆ', (byFeature.get(r.feature || 'อื่นๆ') || 0) + 1);
    if (day === todayKey) { todayCalls += 1; todayUsd += Number(r.costUsd || 0); }
    if (r.userId) {
      const cur = byUser.get(r.userId) || { calls: 0, usd: 0, last: '' };
      cur.calls += 1; cur.usd += Number(r.costUsd || 0);
      if (String(r.createdAt || '') > cur.last) cur.last = String(r.createdAt || '');
      byUser.set(r.userId, cur);
    }
  }

  const days = [...byDay.entries()].sort().slice(-14).map(([k, v]) => ({ label: k.slice(8), value: v }));
  const features = [...byFeature.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([label, value]) => ({ label, value }));

  const rate = Number(settings.usdThb || deps.usdThb || 36.5);
  const rows = userRows.map((x) => {
    const s = byUser.get(x.lineUserId) || { calls: 0, usd: 0, last: '' };
    return {
      id: x.id, name: x.displayName || (x.lineUserId || '').slice(0, 8),
      role: x.role || 'guest', blocked: Boolean(x.blocked),
      calls: s.calls, thb: s.usd * rate,
      last: (s.last || x.lastSeen || '').slice(0, 16).replace('T', ' ') || '-',
    };
  }).sort((a, b) => b.calls - a.calls);

  return render({
    query,
    usersReady: Array.isArray(users),
    logsReady: Array.isArray(logs),
    totalUsers: userRows.length,
    activeUsers: byUser.size,
    calls, failed, todayCalls,
    thb: usd * rate, todayThb: todayUsd * rate, rate,
    budgetThb: Number(settings.budgetThb || 0),
    billActualThb: settings.billActualThb == null ? null : Number(settings.billActualThb),
    dailyCallCap: Number(settings.dailyCallCap || 0),
    aiKeyOk: Boolean(deps.aiKeyOk),
    aiModel: deps.aiModel || '-',
    lineOk: Boolean(deps.lineOk),
    lineQuota,
    days, features, rows,
    recent: logRows.slice(-20).reverse().map((r) => ({
      when: String(r.createdAt || '').slice(5, 16).replace('T', ' '),
      feature: r.feature || '-', model: r.model || '-',
      q: String(r.question || '').slice(0, 70),
      ok: r.ok !== false, err: r.error || '',
      thb: Number(r.costUsd || 0) * rate,
    })),
    nowLabel: deps.nowLabel(),
  });
}

function render(m) {
  const warn = [
    m.usersReady ? '' : u.notReady('ตารางผู้ใช้'),
    m.logsReady ? '' : u.notReady('ประวัติการเรียก AI'),
  ].join('');

  // โควต้าข้อความ LINE — แสดงเฉพาะเมื่อดึงได้จริง ไม่เดาเลขเอง
  const quotaPanel = (() => {
    if (!m.lineOk) return `<div class="panel"><h3>💬 โควต้าข้อความ LINE</h3><div class="dim">ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN</div></div>`;
    if (!m.lineQuota) return `<div class="panel"><h3>💬 โควต้าข้อความ LINE</h3><div class="dim">ดึงจาก LINE ไม่ได้ (ตรวจ token)</div></div>`;
    const limit = Number(m.lineQuota.limit || 0);
    const used = Number(m.lineQuota.used || 0);
    const pct = limit ? (used / limit) * 100 : 0;
    return `<div class="panel"><h3>💬 โควต้าข้อความ LINE</h3>
      <div class="big">${u.n(used)}<span class="u"> / ${limit ? u.n(limit) : 'ไม่จำกัด'}</span></div>
      ${limit ? u.bar(pct) : ''}
      <div class="dim">${limit ? `เหลือ ${u.n(limit - used)} ข้อความในรอบบิลนี้` : 'แพ็กเกจนี้ไม่จำกัดจำนวนข้อความ'}</div></div>`;
  })();

  // งบ — เทียบกับเพดานที่ตั้งไว้เท่านั้น ถ้ายังไม่ตั้งก็ไม่ต้องวาดแถบ (แถบที่เทียบกับเลขมั่วดูเหมือนพัง)
  const budgetPanel = m.budgetThb > 0
    ? `<div class="panel"><h3>💰 งบเดือนนี้</h3>
        <div class="big">฿${u.money(m.thb)}<span class="u"> / ฿${u.n(m.budgetThb)}</span></div>
        ${u.bar((m.thb / m.budgetThb) * 100)}
        <div class="dim">วันนี้ใช้ ฿${u.money(m.todayThb)} · เรต ฿${m.rate}/USD</div></div>`
    : `<div class="panel"><h3>💰 งบเดือนนี้</h3><div class="big">฿${u.money(m.thb)}</div>
        <div class="dim">ยังไม่ได้ตั้งเพดานงบ — ตั้งได้ในกล่อง "ตั้งค่าตัวเลข" ท้ายหน้า</div></div>`;

  const keyPanel = `<div class="panel"><h3>🔑 สถานะคีย์ AI</h3>
    <div class="big" style="font-size:20px">${m.aiKeyOk ? '✅ พร้อมใช้' : '⛔ ยังไม่ได้ตั้งคีย์'}</div>
    <div class="dim">โมเดล <code>${u.esc(m.aiModel)}</code></div>
    ${m.dailyCallCap > 0 ? `${u.bar((m.todayCalls / m.dailyCallCap) * 100)}<div class="dim">วันนี้ ${u.n(m.todayCalls)} / ${u.n(m.dailyCallCap)} ครั้งที่ตั้งเพดานไว้</div>`
      : `<div class="dim">วันนี้เรียกไป ${u.n(m.todayCalls)} ครั้ง${m.failed ? ` · ล้มเหลวรวม ${u.n(m.failed)} ครั้ง` : ''}</div>`}</div>`;

  const CONFIRM = u.confirmText('ลบผู้ใช้คนนี้ออกจากระบบ?',
    ['ชื่อและโปรไฟล์ที่เก็บไว้', 'สิทธิ์รายฟีเจอร์ที่ตั้งให้', 'ความจำรายคนของบอท'],
    ['ประวัติการเรียก AI (ยังนับในยอดค่าใช้จ่าย)', 'ไฟล์ที่เคยอัปโหลด']);

  const bodyRows = m.rows.length
    ? m.rows.map((r, i) => `<tr class="urow${i >= TOP_ROWS ? ' hid' : ''}" data-hay="${u.esc(String(r.name).toLowerCase())} ${u.esc(r.role)}">
        <td><div class="who"><span class="av">${u.initials(r.name)}</span><div class="nm">${u.esc(r.name)}</div></div></td>
        <td>${u.pill(r.role === 'member' ? 'สมาชิก' : 'ทั่วไป', r.role === 'member' ? 'blue' : '')}${r.blocked ? u.pill('บล็อก', 'off') : ''}</td>
        <td class="num">${u.n(r.calls)}</td>
        <td class="num">฿${u.money(r.thb)}</td>
        <td class="num dim">${u.esc(r.last)}</td>
        <td class="num"><form method="post" action="/admin/user/delete" class="inline" onsubmit="return confirm('${CONFIRM}')">
          ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(r.id)}">
          <button type="submit" class="btn danger mini">🗑️ ลบ</button>
        </form></td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="empty">ยังไม่มีผู้ใช้ — เมื่อมีคนแอดบอทใน LINE ชื่อจะขึ้นที่นี่</td></tr>`;

  const diff = m.billActualThb == null ? null : m.billActualThb - m.thb;

  const body = `
    <div class="stats">
      ${u.statCard('👥', 'ผู้ใช้ทั้งหมด', u.n(m.totalUsers), `คุยจริง ${u.n(m.activeUsers)} คน`, '#2D6CDF')}
      ${u.statCard('⚡', 'เรียก AI', u.n(m.calls), m.failed ? `ล้มเหลว ${u.n(m.failed)}` : 'สำเร็จทั้งหมด', '#7C4DFF')}
      ${u.statCard('💸', 'ค่าใช้จ่ายที่ log ไว้', '฿' + u.money(m.thb), `วันนี้ ฿${u.money(m.todayThb)}`, '#F39C12')}
      ${u.statCard('💬', 'ตอบไปแล้ว', u.n(m.calls - m.failed), 'ข้อความที่บอทตอบสำเร็จ', '#06C755')}
    </div>

    <div class="panels">${keyPanel}${quotaPanel}${budgetPanel}</div>

    <div class="panels">
      <div class="panel"><h3>📈 การเรียกใช้ 14 วันล่าสุด</h3>${u.barChart(m.days)}</div>
      <div class="panel"><h3>🏆 ฟีเจอร์ที่ใช้มากสุด</h3>
        ${m.features.length ? m.features.map((f) => {
    const max = Math.max(...m.features.map((x) => x.value));
    return `<div class="dim" style="display:flex;justify-content:space-between"><span>${u.esc(f.label)}</span><span>${u.n(f.value)}</span></div>${u.bar((f.value / max) * 100, '#2D6CDF')}`;
  }).join('') : `<div class="dim">ยังไม่มีข้อมูล</div>`}
      </div>
    </div>

    <div class="tablecard">
      <div class="th thbar">
        <span>👤 ผู้ใช้ <span class="cnt">${u.n(m.rows.length)} คน</span></span>
        <input id="${IDS.search}" class="srch" type="search" placeholder="ค้นหาชื่อ…" autocomplete="off">
      </div>
      <div class="tablescroll"><table>
        <thead><tr><th>ชื่อ</th><th>สถานะ</th><th class="num">เรียก AI</th><th class="num">ค่าใช้จ่าย</th><th class="num">ล่าสุด</th><th class="num">จัดการ</th></tr></thead>
        <tbody id="${IDS.body}">${bodyRows}</tbody>
      </table></div>
      ${u.moreBar(m.rows.length, TOP_ROWS, IDS)}
    </div>

    <details class="panel fold" style="margin-top:16px">
      <summary><h3>🧾 ยอดบิลจริง + ตั้งค่าตัวเลข (ใช้เดือนละครั้ง)</h3></summary>
      <div class="sub" style="margin-top:10px">ตัวเลขในหน้านี้คือ "เท่าที่ log ไว้" กรอกยอดบิลจริงเพื่อดูส่วนต่าง</div>
      <form method="post" action="/admin/settings/numbers">
        ${gate.keyInput()}
        <div class="grid2">
          <div class="fld"><label>ยอดบิลจริงเดือนนี้ (บาท)</label>
            <input type="number" step="0.01" min="0" name="billActualThb" value="${m.billActualThb == null ? '' : u.esc(m.billActualThb)}" placeholder="เช่น 420.50"></div>
          <div class="fld"><label>เพดานงบต่อเดือน (บาท)</label>
            <input type="number" step="1" min="0" name="budgetThb" value="${m.budgetThb || ''}" placeholder="0 = ไม่ตั้ง"></div>
          <div class="fld"><label>เพดานจำนวนเรียกต่อวัน</label>
            <input type="number" step="1" min="0" name="dailyCallCap" value="${m.dailyCallCap || ''}" placeholder="0 = ไม่ตั้ง"></div>
          <div class="fld"><label>เรตแปลงเงิน (บาท/USD)</label>
            <input type="number" step="0.01" min="1" name="usdThb" value="${m.rate}"></div>
        </div>
        <button class="btn" type="submit">บันทึก</button>
        ${diff == null ? '' : `<span class="dim" style="margin-left:10px">ส่วนต่างจากยอดที่ log ไว้: <b>${diff >= 0 ? '+' : ''}฿${u.money(diff)}</b></span>`}
      </form>
    </details>

    <details class="panel fold">
      <summary><h3>📜 20 รายการล่าสุด</h3></summary>
      <div class="tablescroll" style="margin-top:10px"><table>
        <thead><tr><th>เวลา</th><th>ฟีเจอร์</th><th>โมเดล</th><th>คำถาม</th><th class="num">ค่าใช้จ่าย</th></tr></thead>
        <tbody>${m.recent.length ? m.recent.map((r) => `<tr>
          <td class="dim">${u.esc(r.when)}</td><td>${u.esc(r.feature)}</td>
          <td class="dim"><code>${u.esc(r.model)}</code></td>
          <td>${r.ok ? u.esc(r.q) : `<span style="color:var(--red)">✖ ${u.esc(r.err)}</span>`}</td>
          <td class="num">฿${u.money(r.thb)}</td></tr>`).join('')
    : `<tr><td colspan="5" class="empty">ยังไม่มีการเรียกใช้</td></tr>`}</tbody>
      </table></div>
    </details>`;

  return u.shell({
    tab: 'dash', title: 'Dashboard', query: m.query, warn,
    h1: '📊 Dashboard',
    hsub: 'อัปเดต ' + m.nowLabel,
    pill: `<span class="pill"><span class="live"></span>รีเฟรชอัตโนมัติทุก 60 วิ</span>`,
    refresh: 60,   // หน้านี้เป็น monitoring ล้วน (ฟอร์มตั้งค่าอยู่ใน fold ที่ปิดไว้) ใส่ refresh ได้
    css: u.CHART_CSS,
    body,
    footer: `ตัวเลขค่าใช้จ่าย = ผลรวมที่ระบบ log ไว้ตอนเรียก API (แปลงบาทด้วยเรต ฿${m.rate}/USD) — ไม่เท่ากับบิลจริง เพราะสคริปต์ทดสอบและการเรียกที่ล้มเหลวกลางทางอาจไม่ถูก log · "ผู้ใช้ทั้งหมด" นับจากตารางผู้ใช้ ไม่ใช่จาก log · หน้านี้ล็อกด้วย ADMIN_KEY เท่านั้น ไม่ใช่ระบบล็อกอินจริง`,
    script: u.tableScript(IDS, TOP_ROWS),
  });
}

module.exports = { page, render };
