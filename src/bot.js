// สมองของบอท — ประกอบ prompt จากคลังความรู้/persona/memory แล้วเช็คกฎกันเดาก่อนยิง AI
// ใช้ร่วมกันสองทาง: LINE webhook (src/line.js) และช่อง "ทดลองแชท" ในหน้า /training
// แยกออกมาเป็นไฟล์เดียวเพื่อให้ที่ทดลองในหน้า admin ได้คำตอบเหมือนที่ผู้ใช้จริงได้เป๊ะ
const store = require('./store');
const ai = require('./ai');

const safe = (p) => p.catch(() => []);

/**
 * กฎกันบอทเดา — เช็คก่อนเรียก AI เสมอ
 * กฎที่ไม่มีคำค้นเลยจะถูกข้าม (ตอนบันทึกก็บังคับไว้อีกชั้น) ไม่งั้นกฎจะ match ทุกข้อความเงียบๆ
 */
function matchRule(rules, text) {
  const t = String(text || '').toLowerCase();
  for (const r of rules) {
    if (!r.enabled) continue;
    const words = (r.keywords || []).map((w) => String(w).toLowerCase()).filter(Boolean);
    if (!words.length) continue;
    if (words.some((w) => t.includes(w))) return r;
  }
  return null;
}

async function buildSystem(userId) {
  const [knowledge, prompts, memories] = await Promise.all([
    safe(store.read('knowledge')),
    safe(store.read('prompts')),
    safe(store.read('memories')),
  ]);

  const persona = prompts.find((p) => p.active);
  const facts = knowledge.filter((k) => k.enabled);
  const mem = memories.filter((m) => m.enabled && (m.scope === 'global' || m.userId === userId));

  // เรียงส่วนที่นิ่งไว้ก่อน (persona → ความรู้) ส่วนที่เปลี่ยนบ่อย (memory รายคน) ไว้ท้าย
  // เพื่อให้ prompt cache ของ Anthropic hit ได้ — cache เป็น prefix match ขยับต้นทางแล้วพังทั้งก้อน
  const parts = [];
  parts.push(persona ? persona.body : 'คุณเป็นผู้ช่วยตอบคำถามภาษาไทย ตอบสุภาพ กระชับ ตรงประเด็น');
  if (facts.length) {
    parts.push('# คลังความรู้ (ใช้ข้อมูลนี้ก่อนความรู้ทั่วไปเสมอ)\n' +
      facts.map((k) => `## ${k.title}\n${k.body}`).join('\n\n'));
  }
  parts.push('ถ้าไม่มีข้อมูลในคลังความรู้ ให้บอกตรงๆ ว่าไม่ทราบ ห้ามเดา');
  if (mem.length) parts.push('# สิ่งที่จำไว้เกี่ยวกับผู้ใช้คนนี้\n' + mem.map((m) => '- ' + m.text).join('\n'));
  return parts.join('\n\n');
}

/**
 * ตอบข้อความหนึ่งข้อความ — คืน { text, via, model, costUsd }
 * via: 'rule' = ตอบจากกฎ (ไม่เสียเงิน) · 'ai' = เรียกโมเดล · 'handoff'/'silent' = ตามกฎ
 */
async function reply(text, opts = {}) {
  const rules = await safe(store.read('rules'));
  const hit = matchRule(rules, text);

  if (hit) {
    if (hit.action === 'silent') return { text: null, via: 'silent', ruleId: hit.id };
    if (hit.action === 'handoff') {
      return { text: hit.reply || 'เดี๋ยวเจ้าหน้าที่มาตอบให้ครับ 🙏', via: 'handoff', ruleId: hit.id };
    }
    return { text: hit.reply || '(กฎนี้ยังไม่ได้ใส่ข้อความตอบ)', via: 'rule', ruleId: hit.id };
  }

  const system = await buildSystem(opts.userId);
  const out = await ai.ask(text, {
    system,
    userId: opts.userId || null,
    feature: opts.feature || 'chat',
    effort: opts.effort,
  });
  return { text: out.text, via: 'ai', model: out.model, costUsd: out.costUsd, refused: out.refused };
}

module.exports = { reply, buildSystem, matchRule };
