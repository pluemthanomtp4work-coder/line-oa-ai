// เรียก Claude + คิดค่าใช้จ่ายต่อ call แล้ว log ลง aiLogs
// ค่าใช้จ่ายคิดเป็น USD ก่อนตามเรตของ "โมเดลที่ใช้จริงใน call นั้น" แล้วค่อยแปลงบาทตอนแสดงผล
// เรตเดียวรวมทุกโมเดลคลาดเคลื่อนหลายเท่า (opus vs haiku ต่างกัน 5 เท่า) → ต้องเก็บ model ลง log ด้วย
const store = require('./store');

// USD ต่อ 1M tokens — ตารางเรต (อัปเดตเมื่อ 2026-06-24)
// cacheWrite = 1.25x input, cacheRead = 0.1x input ตามสูตรมาตรฐานของ prompt caching
const RATES = {
  'claude-opus-5': { in: 5.0, out: 25.0 },
  'claude-opus-4-8': { in: 5.0, out: 25.0 },
  'claude-sonnet-5': { in: 2.0, out: 10.0 },
  'claude-haiku-4-5': { in: 1.0, out: 5.0 },
  'claude-fable-5-1': { in: 10.0, out: 50.0 },
};
const DEFAULT_MODEL = process.env.AI_MODEL || 'claude-opus-5';
const USD_THB = Number(process.env.USD_THB || 36.5);

/**
 * คิดเงินจาก usage ที่ API คืนมา
 * หมายเหตุ: output_tokens ของ Anthropic รวม thinking tokens มาให้แล้ว — ไม่ต้องบวกเพิ่มเอง
 * (ต่างจาก Gemini ที่ candidate_tokens ไม่นับ thinking แล้วต้องคิด total − prompt)
 */
function costUsd(model, usage) {
  const r = RATES[model] || RATES[DEFAULT_MODEL] || { in: 0, out: 0 };
  const u = usage || {};
  const inTok = Number(u.input_tokens || 0);
  const cWrite = Number(u.cache_creation_input_tokens || 0);
  const cRead = Number(u.cache_read_input_tokens || 0);
  const outTok = Number(u.output_tokens || 0);
  return ((inTok * r.in) + (cWrite * r.in * 1.25) + (cRead * r.in * 0.1) + (outTok * r.out)) / 1e6;
}

let client = null;
function getClient() {
  if (client) return client;
  // require แบบ lazy — ให้หน้า admin เปิดได้แม้ยังไม่ npm install @anthropic-ai/sdk
  const Anthropic = require('@anthropic-ai/sdk');
  client = new Anthropic();   // อ่าน ANTHROPIC_API_KEY จาก env เอง ห้าม hardcode
  return client;
}
const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/**
 * ถามบอท — คืน { text, model, usage, costUsd, logId }
 * ทุก call ถูก log ไม่ว่าจะสำเร็จหรือไม่ เพื่อให้หน้า Dashboard นับได้ตรง
 * opts: { system, history, feature, userId, model, maxTokens }
 */
async function ask(text, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const started = Date.now();
  const base = {
    userId: opts.userId || null,
    feature: opts.feature || 'chat',
    model,
    question: String(text || '').slice(0, 2000),
  };

  if (!hasKey()) {
    const rec = await logCall({ ...base, ok: false, error: 'ยังไม่ได้ตั้ง ANTHROPIC_API_KEY' });
    const e = new Error('ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ใน .env');
    e.logId = rec.id;
    throw e;
  }

  try {
    const res = await getClient().messages.create({
      model,
      max_tokens: Number(opts.maxTokens || 4096),
      // adaptive thinking — ให้โมเดลตัดสินใจเองว่าจะคิดลึกแค่ไหน (budget_tokens ถูกถอดออกแล้ว)
      thinking: { type: 'adaptive' },
      // effort low สำหรับแชทตอบไว — งานที่ต้องคิดหนักค่อยส่ง effort สูงมาทาง opts
      output_config: { effort: opts.effort || 'low' },
      // system เป็นก้อนนิ่ง + cache_control → prompt ยาว (คลังความรู้) ไม่ถูกคิดเงินเต็มทุกครั้ง
      system: opts.system
        ? [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }]
        : undefined,
      messages: [...(opts.history || []), { role: 'user', content: String(text || '') }],
    });

    // stop_reason 'refusal' มาแบบ HTTP 200 — ต้องเช็คก่อนอ่าน content ไม่งั้นได้ข้อความว่าง
    if (res.stop_reason === 'refusal') {
      const rec = await logCall({
        ...base, ok: false, error: 'refusal:' + ((res.stop_details && res.stop_details.category) || '?'),
        usage: res.usage, costUsd: costUsd(model, res.usage), ms: Date.now() - started,
      });
      return { text: 'ขอโทษครับ คำถามนี้ผมตอบให้ไม่ได้', model, refused: true, logId: rec.id, costUsd: 0 };
    }

    const out = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    const usd = costUsd(model, res.usage);
    const rec = await logCall({ ...base, ok: true, usage: res.usage, costUsd: usd, ms: Date.now() - started });
    return { text: out, model, usage: res.usage, costUsd: usd, logId: rec.id };
  } catch (e) {
    await logCall({ ...base, ok: false, error: String(e.message || e).slice(0, 300), ms: Date.now() - started });
    throw e;
  }
}

async function logCall(row) {
  const u = row.usage || {};
  return store.insert('aiLogs', {
    userId: row.userId,
    feature: row.feature,
    model: row.model,
    ok: row.ok !== false,
    error: row.error || null,
    ms: row.ms || 0,
    question: row.question || '',
    promptTokens: Number(u.input_tokens || 0) + Number(u.cache_read_input_tokens || 0) + Number(u.cache_creation_input_tokens || 0),
    outputTokens: Number(u.output_tokens || 0),
    cacheReadTokens: Number(u.cache_read_input_tokens || 0),
    costUsd: Number(row.costUsd || 0),
  });
}

module.exports = { ask, costUsd, logCall, RATES, DEFAULT_MODEL, USD_THB, hasKey };
