# LINE OA-AI — บอท LINE ตอบด้วย Gemini + หน้าหลังบ้าน 8 หน้า

Node + Express.js ต่อ HTML เป็นสตริง — **ไม่มี build step ไม่มี React** แก้ไฟล์แล้วรีสตาร์ตเห็นผลทันที
สร้างตามสูตร skill `sbu-myagent-builder` (โครง `page()` ดึงข้อมูล / `render(m)` สร้าง HTML ทุกหน้า)

## ติดตั้ง

```bash
npm install
```

```bash
cp .env.example .env
```

เติมค่าใน `.env` อย่างน้อย 3 ตัว:

| ตัวแปร | เอามาจากไหน |
|---|---|
| `ADMIN_KEY` | สุ่มเอง: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"` |
| `GEMINI_API_KEY` | aistudio.google.com → Get API key |
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers Console → Messaging API |

```bash
npm run init && npm start
```

เปิด `http://localhost:3000/admin?key=<ADMIN_KEY>`

ตั้ง Webhook URL ใน LINE Developers Console เป็น `https://<โดเมนของคุณ>/line/webhook`
(ตอน dev ใช้ `ngrok http 3000` แล้วเอา URL ของ ngrok ไปใส่ — LINE ต้องการ HTTPS)

## หน้าหลังบ้าน 8 หน้า

| แท็บ | route | ไฟล์ | ทำอะไร |
|---|---|---|---|
| 📊 Dashboard | `/admin` | [adminPage.js](src/adminPage.js) | ผู้ใช้ · เรียก AI · ค่าใช้จ่าย · โควต้า LINE · กราฟรายวัน · ตารางผู้ใช้ |
| 🎓 สอนบอท | `/training` | [trainingPage.js](src/trainingPage.js) | คลังความรู้ · เอกสาร · กฎกันเดา · persona · memory · feedback · ทดลองแชท |
| 🖼️ Template | `/admin/template` | [templatePage.js](src/templatePage.js) | ลากกล่องข้อความวางบนรูปพื้นหลัง (พิกัดเก็บเป็นสัดส่วน 0–1) |
| 📁 คลังไฟล์ | `/files` | [filesPage.js](src/filesPage.js) | โฟลเดอร์ · อัป/ย้าย/ลบลงถัง · สิทธิ์ · ลิงก์เซ็นชื่อหมดอายุเอง |
| 🎨 หัวการ์ด | `/admin/header` | [headerAdminPage.js](src/headerAdminPage.js) | ธีมหัวการ์ดที่บอทส่ง + พรีวิว + ส่งทดสอบ |
| 🧩 เมนู LINE | `/admin/menu` | [menuAdminPage.js](src/menuAdminPage.js) | วาด rich menu บน canvas แล้วเผยแพร่เข้า LINE |
| 🗂 รายชื่อ | `/contacts` | [contactsPage.js](src/contactsPage.js) | ตั้งชื่อเรียกให้ LINE user id |
| 👥 ผู้ใช้ | `/admin/users` | [usersPage.js](src/usersPage.js) | บทบาท · สิทธิ์รายฟีเจอร์ · บล็อก · สั่งทีละหลายคน |

เพิ่มหน้าใหม่: สร้าง `src/<ชื่อ>Page.js` → เพิ่มแถวใน `TABS` ของ [adminNav.js](src/adminNav.js) → เพิ่ม route ใน [index.js](src/index.js)

## ไฟล์พื้นฐาน

| ไฟล์ | หน้าที่ |
|---|---|
| [uiTheme.js](src/uiTheme.js) | โทเคนสี/ฟอนต์ + CSS กลาง — แก้ที่นี่เปลี่ยนทั้งระบบ |
| [adminNav.js](src/adminNav.js) | แท็บเมนู (แหล่งความจริงเดียว) |
| [adminGate.js](src/adminGate.js) | ด่าน `?key=` · hidden key input · PRG redirect + flash |
| [adminUi.js](src/adminUi.js) | `esc()` การ์ดสถิติ กราฟแท่ง ตารางค้นหา โครง `shell()` |
| [store.js](src/store.js) | ชั้นข้อมูล (ไฟล์ JSON ใน `data/`) — เปลี่ยนไป Postgres แก้แค่ไฟล์นี้ |
| [ai.js](src/ai.js) | เรียก Gemini + คิดค่าใช้จ่ายต่อ call แล้ว log |
| [bot.js](src/bot.js) | สมองบอท — ประกอบ prompt จากความรู้/persona/memory + เช็คกฎก่อน |
| [line.js](src/line.js) | ตรวจลายเซ็น webhook · ตอบ/push · โปรไฟล์ · rich menu |

## เทสต์

```bash
npm test
```

ยิงจริงผ่าน HTTP ไม่ต้องมี DB ไม่ต้องต่อเน็ต — ครอบ: ไม่มี key→401 · key ผิด→401 · key ยาวกว่า→401 (ไม่ throw) ·
ทั้ง 8 หน้า→200 · payload XSS ถูก escape · ข้อมูลล่ม→ยัง 200 + ขึ้นคำเตือน · POST→302 พร้อม flash ·
กฎไม่มีคำค้นถูกปฏิเสธ · บล็อกแอดมินไม่ได้ · ลิงก์ไฟล์ลายเซ็นผิด→403

```bash
npm run shot
```

เขียน HTML ทั้ง 8 หน้าด้วยข้อมูลปลอมลง `test/out/` แล้วถ่ายภาพด้วย Chrome ในเครื่อง — **ดูด้วยตาก่อนส่งเสมอ**

## ข้อจำกัดที่ต้องรู้

- **`?key=` ไม่ใช่ระบบล็อกอินจริง** — คีย์ติดไปกับ URL, referrer, log ของ proxy และประวัติเบราว์เซอร์
  ใช้กับทีมกันเองได้ ถ้าเปิดให้คนนอกต้องทำ session จริงก่อน
- **ตัวเลขค่าใช้จ่าย = เท่าที่ log ไว้** ไม่ใช่บิลจริง — กรอกยอดบิลจริงในกล่องท้ายหน้า Dashboard เพื่อดูส่วนต่าง
- **แอดมินอ่านจาก `LINE_ADMIN_USER_IDS` ใน `.env` เท่านั้น** แถวแอดมินจะบล็อก/ลด/ลบจากหน้าเว็บไม่ได้ (กันล็อกตัวเอง)
- **ข้อมูลเก็บเป็นไฟล์ JSON ใน `data/`** เหมาะกับหลักพันแถว ถ้าโตกว่านั้นให้เปลี่ยน `store.js` เป็น SQLite/Postgres
- **เมนู LINE เผยแพร่แล้วมีผลทันทีกับผู้ใช้ทุกคน** และระบบจะลบเมนูเก่าบน LINE ทิ้งเพื่อไม่ให้ชนลิมิต
