/* AI 교육 수강 후기 — /ai-class/review 에서 보낸 설문 1건을 파일 1개로 남긴다.
 * 저장소: ai-apply.js와 같은 서울 Supabase NS 아래 reviews/ 폴더.
 *
 * POST JSON                      → 저장
 * GET  ?list=1 + x-ops-key 또는 x-admin-key → 전체 목록
 */
"use strict";
const crypto = require("crypto");
const store = require("./_store");

const NS = "ai-class/7c2e91d04b6a/reviews";
const OPS_HASH = "ee293cd94f1e0400cf77900c41cc959de75329835a1807c7db2db32586d4d203";
const ADMIN_HASH = "06d0f0a4bbb203d563b41c8690b320f6043678b0955afe5551a9426e86f9da8e";
const LIMITS = { name: 40, cohort: 10, score: 2, best: 1500, worse: 1500, made: 600, next: 1500, quote: 600, publish: 20,
  // 만족도 조사(2026-10-21): 응답 방식과 항목별 점수
  form: 10, mode: 10, overall: 1, theory: 1, practice: 1, venue: 1, notice: 1, pace: 10, level: 10, course2: 10 };

function sha(s) { return crypto.createHash("sha256").update(String(s)).digest("hex"); }
function eq(a, b) { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
function authed(req) {
  const ok = req.headers["x-ops-key"], ak = req.headers["x-admin-key"];
  if (ok && eq(sha(ok), OPS_HASH)) return true;
  if (ak) {
    const envKey = store.clean(process.env.AI_CLASS_ADMIN_KEY);
    return eq(sha(ak), envKey ? sha(envKey) : ADMIN_HASH);
  }
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if (!store.enabled()) { res.status(503).json({ ok: false, error: "storage" }); return; }
  try {
    if (req.method === "GET" && (req.query || {}).list) {
      if (!authed(req)) { res.status(401).json({ ok: false, error: "auth" }); return; }
      const idx = (await store.readJson(NS + "/index.json")) || { ids: [] };
      const out = [];
      for (const id of idx.ids) { const r = await store.readJson(`${NS}/${id}.json`); if (r) out.push(r); }
      res.status(200).json({ ok: true, reviews: out });
      return;
    }
    if (req.method === "POST") {
      let b = req.body;
      if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
      if (!b || b.website) { res.status(200).json({ ok: true }); return; } // 자동 입력 걸러내기
      const rec = { at: new Date().toISOString() };
      for (const k of Object.keys(LIMITS)) rec[k] = String(b[k] == null ? "" : b[k]).slice(0, LIMITS[k]);
      // 무기명은 서버에서도 이름을 남기지 않는다. 공개 동의도 "이름과 함께"가 될 수 없다.
      if (rec.mode === "anon") { rec.name = ""; if (rec.publish === "실명") rec.publish = "익명"; }
      if (!rec.score && !rec.best && !rec.worse && !rec.overall) { res.status(400).json({ ok: false, error: "empty" }); return; }
      const id = Date.now().toString(36) + crypto.randomBytes(3).toString("hex");
      await store.writeJson(`${NS}/${id}.json`, rec);
      const idx = (await store.readJson(NS + "/index.json")) || { ids: [] };
      idx.ids.push(id);
      await store.writeJson(NS + "/index.json", idx);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(400).json({ ok: false });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server" });
  }
};
