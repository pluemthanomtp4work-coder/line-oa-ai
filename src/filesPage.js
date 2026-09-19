// หน้า /files — คลังไฟล์: โฟลเดอร์ซ้าย รายการไฟล์ขวา อัป/เปลี่ยนชื่อ/ย้าย/ลบลงถัง + ตั้งสิทธิ์เข้าถึง
// ลบ = ย้ายลงถังก่อน (trashed=true) ไม่ลบไฟล์จริงทันที เพราะกดพลาดแล้วกู้ไม่ได้
// ลิงก์เปิดไฟล์เป็นลิงก์เซ็นชื่อที่หมดอายุเอง (signedLink.js) ไม่ใช่ URL ที่เดา id ได้
const u = require('./adminUi');
const gate = require('./adminGate');
const link = require('./signedLink');

async function page(deps, query = {}) {
  const [folders, files, users] = await Promise.all([
    deps.listFolders().catch(() => null),
    deps.listFiles().catch(() => null),
    deps.listUsers().catch(() => []),
  ]);

  const folderRows = folders || [];
  const fileRows = files || [];
  const showTrash = query.trash === '1';
  const current = query.folder || (folderRows[0] ? folderRows[0].id : '');

  const visible = fileRows.filter((f) => Boolean(f.trashed) === showTrash
    && (showTrash || !current || f.folderId === current || !f.folderId));

  return render({
    query, showTrash, current,
    ready: Array.isArray(folders) && Array.isArray(files),
    folders: folderRows.map((f) => ({
      id: f.id, name: f.name,
      count: fileRows.filter((x) => x.folderId === f.id && !x.trashed).length,
    })),
    users: (users || []).map((x) => ({ id: x.lineUserId, name: x.displayName || (x.lineUserId || '').slice(0, 8) })),
    files: visible.slice().reverse().map((f) => ({
      id: f.id, name: f.name, size: f.size || 0, mime: f.mime || '',
      folderId: f.folderId || '',
      allow: f.allow || [],
      isImage: /^image\//.test(f.mime || ''),
      isPdf: (f.mime || '') === 'application/pdf',
      url: link.urlFor(f.id),
      when: String(f.createdAt || '').slice(0, 16).replace('T', ' '),
    })),
    totalBytes: fileRows.filter((f) => !f.trashed).reduce((a, b) => a + Number(b.size || 0), 0),
    trashCount: fileRows.filter((f) => f.trashed).length,
    ttlMin: Math.round(link.TTL_MS / 60000),
    nowLabel: deps.nowLabel(),
  });
}

function render(m) {
  const K = encodeURIComponent(gate.ADMIN_KEY);
  const folderLink = (id) => `/files?key=${K}${id ? '&folder=' + encodeURIComponent(id) : ''}`;

  const side = `<div class="panel" style="margin:0">
    <h3>📂 โฟลเดอร์</h3>
    <div class="flist">
      ${m.folders.length ? m.folders.map((f) => `<a class="fitem${f.id === m.current && !m.showTrash ? ' on' : ''}" href="${folderLink(f.id)}">
        <span>${u.esc(f.name)}</span><span class="dim">${u.n(f.count)}</span></a>`).join('')
      : `<div class="dim">ยังไม่มีโฟลเดอร์</div>`}
      <a class="fitem${m.showTrash ? ' on' : ''}" href="/files?key=${K}&trash=1"><span>🗑️ ถังขยะ</span><span class="dim">${u.n(m.trashCount)}</span></a>
    </div>
    <form method="post" action="/files/folder/create" class="frow">
      ${gate.keyInput()}
      <div class="grow"><input type="text" name="name" placeholder="ชื่อโฟลเดอร์ใหม่" required></div>
      <button class="btn mini" type="submit">➕</button>
    </form>
  </div>`;

  const DEL = u.confirmText('ย้ายไฟล์นี้ลงถังขยะ?', ['ไฟล์จะหายจากรายการโฟลเดอร์', 'ลิงก์ที่แจกไว้จะใช้ไม่ได้'], ['ตัวไฟล์จริง (ยังอยู่ในถังขยะ กู้กลับได้)']);
  const PURGE = u.confirmText('ลบไฟล์นี้ออกถาวร?', ['ตัวไฟล์จริงบนดิสก์', 'ข้อมูลสิทธิ์เข้าถึง'], []);

  const cards = m.files.length
    ? m.files.map((f) => `<div class="gcard">
      <div class="gthumb">${f.isImage
        ? `<img src="${u.esc(f.url)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'noimg\\'>เปิดรูปไม่ได้</div>'">`
        : f.isPdf ? `<a class="noimg" href="${u.esc(f.url)}" target="_blank" rel="noopener">📄 เปิด PDF</a>`
          : `<a class="noimg" href="${u.esc(f.url)}" target="_blank" rel="noopener">📎 เปิดไฟล์</a>`}</div>
      <div class="gmeta">
        <div class="nm" title="${u.esc(f.name)}">${u.esc(f.name)}</div>
        <div class="dim">${u.n(Math.round(f.size / 1024))} KB · ${u.esc(f.when)}</div>
        ${m.showTrash ? `
          <div class="btnrow">
            <form method="post" action="/files/restore" class="inline">${gate.keyInput()}
              <input type="hidden" name="id" value="${u.esc(f.id)}"><button class="btn green mini" type="submit">กู้คืน</button></form>
            <form method="post" action="/files/purge" class="inline" onsubmit="return confirm('${PURGE}')">${gate.keyInput()}
              <input type="hidden" name="id" value="${u.esc(f.id)}"><button class="btn danger mini" type="submit">ลบถาวร</button></form>
          </div>`
        : `
          <details class="fold" style="margin-top:6px"><summary class="dim">แก้ชื่อ / ย้าย / สิทธิ์</summary>
            <form method="post" action="/files/save" style="margin-top:8px">
              ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(f.id)}">
              <div class="fld"><label>ชื่อไฟล์</label><input type="text" name="name" value="${u.esc(f.name)}" required></div>
              <div class="fld"><label>ย้ายไปโฟลเดอร์</label>
                <select name="folderId">${m.folders.map((x) => `<option value="${u.esc(x.id)}"${x.id === f.folderId ? ' selected' : ''}>${u.esc(x.name)}</option>`).join('')}</select></div>
              <div class="fld"><label>ใครเข้าถึงได้ (ไม่เลือก = ทุกคนที่มีสิทธิ์คลังไฟล์)</label>
                <div class="permlist">${m.users.length ? m.users.map((x) => `<label class="pchk"><input type="checkbox" name="allow" value="${u.esc(x.id)}"${f.allow.includes(x.id) ? ' checked' : ''} style="width:auto"> ${u.esc(x.name)}</label>`).join('')
            : '<span class="dim">ยังไม่มีผู้ใช้ในระบบ</span>'}</div></div>
              <button class="btn mini" type="submit">บันทึก</button>
            </form>
            <form method="post" action="/files/trash" style="margin-top:6px" onsubmit="return confirm('${DEL}')">
              ${gate.keyInput()}<input type="hidden" name="id" value="${u.esc(f.id)}">
              <button class="btn danger mini" type="submit">🗑️ ลงถังขยะ</button></form>
          </details>`}
      </div></div>`).join('')
    : `<div class="empty">${m.showTrash ? 'ถังขยะว่าง' : 'โฟลเดอร์นี้ยังไม่มีไฟล์'}</div>`;

  const main = `<div class="panel" style="margin:0">
    <h3>${m.showTrash ? '🗑️ ถังขยะ' : '📄 ไฟล์ในโฟลเดอร์'} <span class="cnt">${u.n(m.files.length)} ไฟล์</span></h3>
    ${m.showTrash ? '<div class="sub">ไฟล์ในถังยังอยู่บนดิสก์จริง กู้คืนได้ จนกว่าจะกด "ลบถาวร"</div>' : `
    <form method="post" action="/files/upload" enctype="multipart/form-data" class="frow">
      ${gate.keyInput()}<input type="hidden" name="folderId" value="${u.esc(m.current)}">
      <div class="grow"><input type="file" name="file" required></div>
      <button class="btn" type="submit"${m.folders.length ? '' : ' disabled title="สร้างโฟลเดอร์ก่อน"'}>⬆️ อัปโหลด</button>
    </form>`}
    <div class="gal">${cards}</div>
  </div>`;

  const body = `
    <div class="stats">
      ${u.statCard('📁', 'โฟลเดอร์', u.n(m.folders.length), '', '#2D6CDF')}
      ${u.statCard('📄', 'ไฟล์ที่ใช้งาน', u.n(m.folders.reduce((a, b) => a + b.count, 0)), '', '#7C4DFF')}
      ${u.statCard('💾', 'พื้นที่ที่ใช้', u.n(Math.round(m.totalBytes / 1024 / 1024)) + ' MB', '', '#F39C12')}
      ${u.statCard('🗑️', 'ในถังขยะ', u.n(m.trashCount), 'กู้คืนได้', '#D64A40')}
    </div>
    <div class="fsplit">${side}${main}</div>`;

  return u.shell({
    tab: 'files', title: 'คลังไฟล์', query: m.query,
    warn: m.ready ? '' : u.notReady('คลังไฟล์'),
    h1: '📁 คลังไฟล์',
    hsub: 'อัปโหลด จัดโฟลเดอร์ และตั้งสิทธิ์เข้าถึง — อัปเดต ' + m.nowLabel,
    css: `
      .fsplit{display:grid;grid-template-columns:260px 1fr;gap:14px;align-items:start}
      @media(max-width:860px){.fsplit{grid-template-columns:1fr}}
      .flist{display:flex;flex-direction:column;gap:2px;margin:8px 0 12px}
      .fitem{display:flex;justify-content:space-between;gap:8px;padding:8px 11px;border-radius:var(--radius-sm);font-size:13.5px;font-weight:600;color:var(--muted)}
      .fitem:hover{background:var(--line2);color:var(--ink)}
      .fitem.on{background:var(--accent-weak);color:var(--blue2)}
      .gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-top:12px;align-items:start}
      .gcard{border:1px solid var(--line);border-radius:var(--radius-sm);overflow:hidden;background:#fff}
      .gthumb{height:120px;background:var(--line2);display:grid;place-items:center;overflow:hidden}
      .gthumb img{width:100%;height:100%;object-fit:cover}
      .noimg{display:grid;place-items:center;width:100%;height:100%;color:var(--muted);font-size:13px;font-weight:600}
      .gmeta{padding:9px 11px}
      .gmeta .nm{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .permlist{display:flex;flex-wrap:wrap;gap:8px;max-height:110px;overflow:auto;border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px}
      .pchk{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:500}
    `,
    body,
    footer: `ลิงก์เปิดไฟล์เป็นลิงก์เซ็นชื่อที่หมดอายุใน ${m.ttlMin} นาที — คัดลอกไปแจกต่อไม่ได้นาน · กดลบคือย้ายลงถังขยะ ไฟล์จริงยังอยู่จนกด "ลบถาวร" · สิทธิ์ที่ตั้งที่นี่ใช้ตอนบอทส่งไฟล์ให้ผู้ใช้ใน LINE`,
  });
}

module.exports = { page, render };
