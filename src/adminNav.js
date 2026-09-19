// แถบแท็บของหน้า admin — แหล่งความจริงเดียวว่ามีหน้าอะไรบ้าง
// เพิ่มหน้าใหม่ = เพิ่มแถวใน TABS ที่นี่ที่เดียว (ห้ามไป hardcode ลิงก์ในหน้าอื่น)
// key ต้องแนบไปทุกลิงก์ ไม่งั้นกดข้ามหน้าแล้วเด้ง 401

const TABS = [
  // [key, path, label]
  ['dash', '/admin', '📊 Dashboard'],
  ['training', '/training', '🎓 สอนบอท'],
  ['template', '/admin/template', '🖼️ Template'],
  ['files', '/files', '📁 คลังไฟล์'],
  ['header', '/admin/header', '🎨 หัวการ์ด'],
  ['menu', '/admin/menu', '🧩 เมนู LINE'],
  ['contacts', '/contacts', '🗂 รายชื่อ'],
  ['users', '/admin/users', '👥 ผู้ใช้'],
];

function html(active, adminKey) {
  const K = encodeURIComponent(adminKey || '');
  return `<nav class="topnav">${TABS
    .map(([k, path, label]) => `<a class="tab${k === active ? ' active' : ''}" href="${path}?key=${K}">${label}</a>`)
    .join('')}</nav>`;
}

const CSS = `
  .topnav{display:flex;gap:4px;margin-top:14px;flex-wrap:wrap}
  .topnav .tab{color:var(--muted);text-decoration:none;font-size:13.5px;font-weight:600;padding:9px 13px;border-radius:8px 8px 0 0;border-bottom:2px solid transparent;transition:color .15s,background .15s,border-color .15s}
  .topnav .tab:hover{color:var(--ink);background:var(--line2)}
  .topnav .tab.active{color:var(--blue);border-bottom-color:var(--blue)}
`;

module.exports = { TABS, html, CSS };
