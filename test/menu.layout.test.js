// เทสต์พิกัดพื้นที่กดของ rich menu — ไม่ยิงเน็ต ไม่แตะฐานข้อมูล
// สำคัญเพราะ LINE ปฏิเสธทั้งชุดถ้าพื้นที่ทับกันหรือล้นรูป และถ้าพิกัดเพี้ยน
// ผู้ใช้จะกดปุ่มหนึ่งแล้วได้ผลของอีกปุ่มโดยไม่มีอะไรฟ้อง
const menu = require('../src/menuAdminPage');

let pass = 0; let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('PASS ' + name); }
  else { fail += 1; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

function audit(opt, n) {
  const S = menu.SIZES[opt.size || 'large'];
  const all = Array.from({ length: n }, (_, i) => menu.slotBounds(i, opt));
  const problems = [];
  all.forEach((a, i) => {
    if (a.x < 0 || a.y < 0 || a.width <= 0 || a.height <= 0) problems.push(`ช่อง ${i} ขนาดติดลบ`);
    if (a.x + a.width > S.w || a.y + a.height > S.h) problems.push(`ช่อง ${i} ล้นรูป`);
    all.slice(i + 1).forEach((b, j) => {
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      if (overlap) problems.push(`ช่อง ${i} ทับช่อง ${i + 1 + j}`);
    });
  });
  const covered = all.reduce((s, a) => s + a.width * a.height, 0);
  return { all, problems, covered, total: S.w * S.h };
}

for (const [label, opt, n] of [
  ['grid 3 คอลัมน์ 2 แถว', { layout: 'grid', size: 'large', cols: 3 }, 6],
  ['grid 2 คอลัมน์ 2 แถว', { layout: 'grid', size: 'large', cols: 2 }, 4],
  ['grid เตี้ย 3 ช่อง', { layout: 'grid', size: 'compact', cols: 3 }, 3],
  ['hero 1+3', { layout: 'hero', size: 'large', cols: 3 }, 4],
  ['hero 1+2', { layout: 'hero', size: 'large', cols: 2 }, 3],
]) {
  const r = audit(opt, n);
  check(`${label}: ไม่ทับกันและไม่ล้นรูป`, r.problems.length === 0, r.problems.join(', '));
  check(`  ...ปูเต็มรูปพอดี ไม่เหลือแถบว่าง`, r.covered === r.total, `${r.covered}/${r.total}`);
}

// ปุ่มใหญ่ด้านบนต้องเต็มความกว้างจริง และปุ่มล่างต้องอยู่ใต้มันพอดี
const hero = menu.slotBounds(0, { layout: 'hero', size: 'large', cols: 3 });
const below = menu.slotBounds(1, { layout: 'hero', size: 'large', cols: 3 });
check('hero: ปุ่มบนเต็มความกว้าง', hero.x === 0 && hero.width === menu.SIZES.large.w);
check('hero: ปุ่มล่างเริ่มต่อจากปุ่มบนพอดี', below.y === hero.height);

// สัดส่วนความสูงต้องปรับได้ และถูกบีบให้อยู่ในช่วงที่ใช้ได้จริง
const tall = menu.slotBounds(0, { layout: 'hero', size: 'large', cols: 3, heroRatio: 70 });
check('hero: ปรับความสูงปุ่มบนได้', tall.height > hero.height);
const clamped = menu.slotBounds(0, { layout: 'hero', size: 'large', cols: 3, heroRatio: 999 });
check('hero: ใส่ค่าเกินช่วง ถูกบีบไม่ให้ล้นรูป', clamped.height < menu.SIZES.large.h);

check('จำนวนช่อง: hero 3 คอลัมน์ = 4 ช่อง', menu.slotCount('hero', 'large', 3) === 4);
check('จำนวนช่อง: grid 3 คอลัมน์ 2 แถว = 6 ช่อง', menu.slotCount('grid', 'large', 3) === 6);

console.log('\nRESULT ' + pass + ' passed / ' + fail + ' failed');
process.exit(fail ? 1 : 0);
