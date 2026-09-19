// ชุดดีไซน์กลางของหน้า admin (มินิมอล สว่าง เส้นขอบบาง accent เดียว)
// วิธีใช้: ทุกหน้าใส่ ${ui.FONT} ใน <head> แล้ว ${ui.BASE_CSS} เป็นบล็อกแรกใน <style>
//          CSS เฉพาะหน้าวางต่อท้าย (มาทีหลัง = ทับได้)
// แก้โทเคนที่นี่ที่เดียว → เปลี่ยนทั้งระบบ

const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap" rel="stylesheet">`;

const BASE_CSS = `
  :root{
    --blue:#2D6CDF;--blue2:#1E50B5;--accent-weak:#EEF3FE;
    --green:#06C755;--red:#D64A40;--amber:#9A6A00;
    --ink:#1A1D23;--muted:#5C6470;--faint:#8A909B;
    --bg:#F6F7F9;--card:#FFFFFF;--line:#E7E9ED;--line2:#F0F2F5;
    --radius:12px;--radius-sm:9px;
    --shadow:0 1px 2px rgba(16,24,40,.04);
    --shadow-pop:0 6px 20px rgba(16,24,40,.08);
    --ring:0 0 0 3px rgba(45,108,223,.16);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-text-size-adjust:100%}
  body{font-family:'IBM Plex Sans Thai',system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
  a{color:inherit;text-decoration:none}
  .wrap{max-width:1040px;margin:0 auto;padding:0 18px}

  /* ===== Header ===== */
  .hero{background:var(--card);color:var(--ink);border-bottom:1px solid var(--line);padding:20px 0 0}
  .hbar{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px}
  .hbar h1{font-size:20px;font-weight:700;letter-spacing:-.01em;display:flex;align-items:center;gap:8px}
  .hsub{color:var(--muted);font-size:13px;margin-top:3px;max-width:70ch}
  .pill{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--muted);background:var(--line2);border:1px solid var(--line);padding:6px 12px;border-radius:999px}
  .pill .live{width:7px;height:7px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(6,199,85,.5)}70%{box-shadow:0 0 0 7px rgba(6,199,85,0)}100%{box-shadow:0 0 0 0 rgba(6,199,85,0)}}
  .lift{margin-top:22px}

  /* ===== Panel / card ===== */
  .panel{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:18px 20px;box-shadow:var(--shadow);margin-bottom:14px}
  .panel h3{font-size:14.5px;font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:8px}
  .panel .sub{color:var(--muted);font-size:12.5px;margin-bottom:14px}

  /* ===== Buttons ===== */
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;font-family:inherit;font-size:13.5px;font-weight:600;color:#fff;background:var(--blue);border:1px solid var(--blue);border-radius:var(--radius-sm);padding:9px 16px;cursor:pointer;text-decoration:none;transition:background .15s,border-color .15s,opacity .15s}
  .btn:hover{background:var(--blue2);border-color:var(--blue2)}
  .btn.primary{background:var(--blue);border-color:var(--blue)}.btn.primary:hover{background:var(--blue2);border-color:var(--blue2)}
  .btn.gray,.btn.ghost{background:#fff;color:var(--ink);border-color:var(--line)}.btn.gray:hover,.btn.ghost:hover{background:var(--line2);border-color:#D7DBE2}
  .btn.green{background:var(--green);border-color:var(--green)}.btn.green:hover{background:#05A847;border-color:#05A847}
  .btn.danger{background:#fff;color:var(--red);border-color:#F0C9C5}.btn.danger:hover{background:var(--red);color:#fff;border-color:var(--red)}
  .btn:disabled,.btn[disabled]{opacity:.5;cursor:not-allowed}
  .btnrow{display:flex;gap:9px;flex-wrap:wrap;margin-top:8px}

  /* ===== Form controls — ครอบ input ทุกชนิดรวมที่ไม่ใส่ type ===== */
  .txtin,input:not([type]),input[type=text],input[type=search],input[type=email],input[type=url],input[type=tel],input[type=password],input[type=number],input[type=month],input[type=week],input[type=date],input[type=time],input[type=datetime-local],select,textarea{width:100%;font-family:inherit;font-size:13.5px;line-height:1.5;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:var(--radius-sm);padding:9px 11px;transition:border-color .15s,box-shadow .15s,background .15s;appearance:none;-webkit-appearance:none;-moz-appearance:none}
  .txtin:hover,input:not([type]):hover,input[type=text]:hover,input[type=search]:hover,input[type=email]:hover,input[type=number]:hover,select:hover,textarea:hover{border-color:#C7CCD6}
  .txtin:focus,input:not([type]):focus,input[type=text]:focus,input[type=search]:focus,input[type=email]:focus,input[type=number]:focus,select:focus,textarea:focus{outline:none;border-color:var(--blue);box-shadow:var(--ring);background:#fff}
  input::placeholder,textarea::placeholder{color:var(--faint)}
  textarea{min-height:76px;resize:vertical}
  select{background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' fill='none' stroke='%238A909B' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");background-repeat:no-repeat;background-position:right 11px center;padding-right:30px}
  label{font-size:13px;font-weight:600}

  /* ===== Chips ===== */
  .chip{display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-size:12.5px;font-weight:600;color:var(--muted);background:#fff;border:1px solid var(--line);border-radius:999px;padding:6px 13px;cursor:pointer;transition:.15s}
  .chip:hover{border-color:var(--blue);color:var(--blue)}
  .chip.active{background:var(--blue);border-color:var(--blue);color:#fff}

  /* ===== Flash / callouts ===== */
  .flash{padding:11px 15px;border-radius:var(--radius-sm);margin-bottom:14px;font-size:13.5px;font-weight:600}
  .fok{background:#E9F8F0;color:#0A7A40;border:1px solid #BCE8D1}
  .ferr{background:#FCECEA;color:#B23128;border:1px solid #F2C7C2}
  .warn{background:#FFF8EC;border:1px solid #F3E0B5;color:var(--amber);padding:12px 15px;border-radius:var(--radius-sm);margin-bottom:16px;font-size:13.5px;line-height:1.55}

  /* ===== Stat cards ===== */
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
  @media(max-width:760px){.stats{grid-template-columns:repeat(2,1fr)}}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:15px 16px;display:flex;gap:12px;align-items:center;box-shadow:var(--shadow)}
  .stat .ic{width:42px;height:42px;border-radius:10px;display:grid;place-items:center;font-size:20px;flex:0 0 auto}
  .stat .lab{color:var(--muted);font-size:12px}
  .stat .val{font-size:22px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums}
  .stat .sub{color:var(--faint);font-size:11.5px}

  /* ===== Tables ===== */
  .tablecard{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow)}
  .tablecard .th{padding:14px 18px;font-size:14px;font-weight:700;border-bottom:1px solid var(--line)}
  table{width:100%;border-collapse:collapse}
  th,td{padding:11px 16px;text-align:left;font-size:13.5px;border-bottom:1px solid var(--line2)}
  th{background:var(--line2);color:var(--muted);font-weight:600;font-size:11.5px;letter-spacing:.02em}
  .num{text-align:center;font-variant-numeric:tabular-nums}
  tr:last-child td{border-bottom:0}
  tbody tr:hover{background:#FAFBFC}

  code{background:#F0F2F5;color:#334;padding:2px 6px;border-radius:5px;font-size:12px;font-family:ui-monospace,Menlo,Consolas,monospace}
  footer{color:var(--faint);font-size:11.5px;text-align:center;padding:22px 0 34px;line-height:1.6}

  @media (prefers-reduced-motion: reduce){
    *,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}
  }
`;

module.exports = { FONT, BASE_CSS };
