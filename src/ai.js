// เรียก Gemini + คิดค่าใช้จ่ายต่อ call แล้ว log ลง aiLogs
// ยิง REST ตรง ไม่ใช้ SDK — fetch มากับ Node 18+ อยู่แล้ว ทำให้ dependency เหลือ express ตัวเดียว
//
// ค่าใช้จ่ายคิดเป็น USD ก่อนตามเรตของ "โมเดลที่ใช้จริงใน call นั้น" แล้วค่อยแปลงบาทตอนแสดงผล
// เรตเดียวรวมทุกโมเดลคลาดเคลื่อนหลายเท่า (3.5-flash vs 2.5-flash-lite ต่างกัน 15 เท่าฝั่ง input)
// → ต้องเก็บ model ลง log ด้วยเสมอ
const store = require('./store');

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

// USD ต่อ 1M tokens (เช็คจาก ai.google.dev/gemini-api/docs/pricing เมื่อ 2026-09-19)
// หมายเหตุ: เรตของตระกูล 3.8/3.7/3.6 Flash เป็นราคาโปรโมชันถึง 31 ธ.ค. 2026 — ครบกำหนดแล้วต้องมาแก้ที่นี่
const RATES = {
  'gemini-3.8-flash': { in: 0.75, out: 3.75 },
  'gemini-3.7-flash': { in: 0.75, out: 3.75 },
  'gemini-3.6-flash': { in: 0.75, out: 3.75 },
  'gemini-3.5-flash': { in: 1.50, out: 9.00 },
  'gemini-3.5-flash-lite': { in: 0.30, out: 2.50 },
  'gemini-3.1-pro-preview': { in: 2.00, out: 12.00 },
  'gemini-2.5-flash': { in: 0.30, out: 2.50 },
  'gemini-2.5-flash-lite': { in: 0.10, out: 0.40 },
  'gemini-2.5-pro': { in: 1.25, out: 10.00 },
};
const DEFAULT_MODEL = process.env.AI_MODEL || 'gemini-3.8-flash';
// โมเดลสำรอง — ใช้เมื่อตัวหลักตอบ 503/429 ติดกันจนครบ retry
// เจอจริงตอนทดสอบ: gemini-3.8-flash คืน 503 "high demand" สองครั้งติด
// ถ้าไม่มีทางสำรอง ผู้ใช้ใน LINE จะเงียบใส่ทุกครั้งที่ฝั่ง Google แน่น
const FALLBACK_MODEL = process.env.AI_MODEL_FALLBACK || 'gemini-3.5-flash-lite';
const USD_THB = Number(process.env.USD_THB || 36.5);
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

const hasKey = () => Boolean(process.env.GEMINI_API_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * แยก token ที่ใช้จริงออกจาก usageMetadata
 *
 * output = totalTokenCount − promptTokenCount  ← ห้ามใช้ candidatesTokenCount
 * เหตุผล: Gemini คิดเงิน thinking tokens ที่เรต output แต่การนับต่างกันตามแพลตฟอร์ม
 *   - Gemini API: candidatesTokenCount รวม thinking
 *   - Vertex AI : candidatesTokenCount ไม่รวม thinking
 *   - บางโมเดลไม่คืน thoughtsTokenCount มาเลย (bug ที่มีรายงานอยู่)
 * การลบ total − prompt ถูกต้องทั้งสามกรณี เพราะ total รวมทุกอย่างเสมอ
 */
function splitUsage(usage) {
  const u = usage || {};
  const prompt = Number(u.promptTokenCount || 0);
  const total = Number(u.totalTokenCount || 0);
  const cached = Number(u.cachedContentTokenCount || 0);
  // total ที่หายไป (บาง error path ไม่คืน usage) → กันไม่ให้ได้เลขติดลบ
  const output = Math.max(0, total - prompt);
  return { prompt, output, cached, thoughts: Number(u.thoughtsTokenCount || 0) };
}

/**
 * คิดเงิน — cached tokens คิดที่เรต input เต็ม จึงเป็น "เพดานบน" ไม่ใช่ตัวเลขเป๊ะ
 * (implicit caching ของ Google ลดราคาให้ แต่ส่วนลดไม่โผล่ใน usageMetadata ให้คำนวณย้อนได้)
 * ตัวเลขในหน้า Dashboard จึงสูงกว่าบิลจริงได้ ไม่ใช่ต่ำกว่า — ฝั่งที่ปลอดภัยกว่า
 */
function costUsd(model, usage) {
  const r = RATES[model] || RATES[DEFAULT_MODEL] || { in: 0, out: 0 };
  const t = splitUsage(usage);
  return ((t.prompt * r.in) + (t.output * r.out)) / 1e6;
}

/**
 * ถามบอท — คืน { text, model, usage, costUsd, logId }
 * ทุก call ถูก log ไม่ว่าสำเร็จหรือไม่ เพื่อให้หน้า Dashboard นับได้ตรง
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
    const rec = await logCall({ ...base, ok: false, error: 'ยังไม่ได้ตั้ง GEMINI_API_KEY' });
    const e = new Error('ยังไม่ได้ตั้ง GEMINI_API_KEY ใน .env');
    e.logId = rec.id;
    throw e;
  }

  const body = {
    contents: [
      ...(opts.history || []),
      { role: 'user', parts: [{ text: String(text || '') }] },
    ],
    generationConfig: { maxOutputTokens: Number(opts.maxTokens || 2048), temperature: 0.4 },
  };
  // systemInstruction เป็นก้อนนิ่ง (persona + คลังความรู้) วางแยกจาก contents
  // implicit caching ของ Google จับ prefix ที่ซ้ำเองได้เมื่อส่วนหัวไม่ขยับ
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  try {
    const { data, usedModel } = await callWithRetry(model, body);

    const usd = costUsd(usedModel, data.usageMetadata);
    const t = splitUsage(data.usageMetadata);
    base.model = usedModel;        // log โมเดลที่ใช้จริง ไม่ใช่ตัวที่ขอไป — ไม่งั้นค่าใช้จ่ายคิดผิดเรต

    // ถูกบล็อกตั้งแต่ชั้น prompt — ไม่มี candidates กลับมาเลย ต้องเช็คก่อนอ่าน content
    const blocked = data.promptFeedback && data.promptFeedback.blockReason;
    const cand = (data.candidates || [])[0];
    if (blocked || !cand) {
      const rec = await logCall({
        ...base, ok: false, error: 'blocked:' + (blocked || 'no-candidate'),
        usage: data.usageMetadata, costUsd: usd, ms: Date.now() - started,
      });
      return { text: 'ขอโทษครับ คำถามนี้ผมตอบให้ไม่ได้', model, refused: true, logId: rec.id, costUsd: usd };
    }
    // ตอบมาแต่ถูกตัดกลางคัน — MAX_TOKENS ได้ข้อความไม่จบ, SAFETY ได้ข้อความว่าง
    if (cand.finishReason && !['STOP', 'MAX_TOKENS'].includes(cand.finishReason)) {
      const rec = await logCall({
        ...base, ok: false, error: 'finish:' + cand.finishReason,
        usage: data.usageMetadata, costUsd: usd, ms: Date.now() - started,
      });
      return { text: 'ขอโทษครับ คำถามนี้ผมตอบให้ไม่ได้', model, refused: true, logId: rec.id, costUsd: usd };
    }

    const out = (cand.content && cand.content.parts || [])
      .map((p) => p.text).filter(Boolean).join('\n').trim();

    const rec = await logCall({ ...base, ok: true, usage: data.usageMetadata, costUsd: usd, ms: Date.now() - started });
    return {
      text: out || 'ขอโทษครับ ผมยังตอบคำถามนี้ไม่ได้',
      model: usedModel, usage: data.usageMetadata, costUsd: usd, logId: rec.id,
      truncated: cand.finishReason === 'MAX_TOKENS',
      thoughtTokens: t.thoughts,
    };
  } catch (e) {
    await logCall({ ...base, ok: false, error: String(e.message || e).slice(0, 300), ms: Date.now() - started });
    throw e;
  }
}

/**
 * ยิง API พร้อม retry — 429/5xx เป็นอาการชั่วคราวของฝั่ง Google ไม่ใช่คำขอเราผิด
 * ลองตัวหลัก 3 ครั้ง (หน่วง 0.4s → 1.2s) ถ้ายังไม่ผ่านค่อยสลับไปโมเดลสำรองอีก 1 ครั้ง
 * ส่วน 4xx อื่น (คีย์ผิด โมเดลไม่มีจริง prompt ใหญ่เกิน) โยนทันที — retry ไปก็ได้ผลเดิม
 */
async function callWithRetry(model, body) {
  const plan = model === FALLBACK_MODEL ? [model] : [model, FALLBACK_MODEL];
  let last;
  for (const m of plan) {
    const tries = m === model ? 3 : 1;
    for (let i = 0; i < tries; i += 1) {
      const res = await fetch(`${API}/${encodeURIComponent(m)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      if (res.ok) return { data: JSON.parse(raw), usedModel: m };

      last = new Error(`Gemini ${res.status}: ${raw.slice(0, 200)}`);
      if (!RETRY_STATUS.has(res.status)) throw last;      // ผิดที่เรา ลองใหม่ก็เหมือนเดิม
      if (i < tries - 1) await sleep(400 * (i + 1) ** 2);
    }
    if (m !== FALLBACK_MODEL) console.warn(`[ai] ${m} ไม่ตอบ (${last.message.slice(0, 60)}) — สลับไป ${FALLBACK_MODEL}`);
  }
  throw last;
}

async function logCall(row) {
  const t = splitUsage(row.usage);
  return store.insert('aiLogs', {
    userId: row.userId,
    feature: row.feature,
    model: row.model,
    ok: row.ok !== false,
    error: row.error || null,
    ms: row.ms || 0,
    question: row.question || '',
    promptTokens: t.prompt,
    outputTokens: t.output,          // รวม thinking tokens แล้ว (total − prompt)
    cacheReadTokens: t.cached,
    costUsd: Number(row.costUsd || 0),
  });
}

module.exports = { ask, costUsd, splitUsage, logCall, RATES, DEFAULT_MODEL, USD_THB, hasKey };
