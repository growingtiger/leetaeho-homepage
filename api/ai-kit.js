/* AI 교육 스타터 키트 내려받기 — 수강생 개인 코드로만 받는다 (2026-10-16 이태호 원장 지시)
 * 키트는 수강생마다 이름·키트 번호를 넣어 따로 만들고, 코드는 수업 당일에만 열린다.
 * 저장소: ai-apply.js와 같은 서울 Supabase NS 아래 kit/ 폴더.
 *
 * GET  ?check=<코드>          → { ok, name, cohort } 또는 { ok:false, error:"code"|"date", from, to }
 * GET  ?code=<코드>           → 그 수강생의 zip (기간 안일 때만). 받을 때마다 횟수를 남긴다
 * POST ?put=1 + x-ops-key     { code, name, cohort, kitId, from, to, data(base64 zip) } → 등록·교체
 * POST ?window=1 + x-ops-key  { code, from, to } → 기간만 바꾸기
 * GET  ?list=1 + x-ops-key    → 등록된 코드와 내려받은 횟수
 */
"use strict";
const crypto = require("crypto");
const store = require("./_store");

const NS = "ai-class/7c2e91d04b6a/kit";
const INDEX = NS + "/codes.json";
const OPS_HASH = "ee293cd94f1e0400cf77900c41cc959de75329835a1807c7db2db32586d4d203";

function sha(s) { return crypto.createHash("sha256").update(String(s)).digest("hex"); }
function opsOk(req) {
  const k = req.headers["x-ops-key"];
  return !!k && crypto.timingSafeEqual(Buffer.from(sha(k)), Buffer.from(OPS_HASH));
}
function norm(c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function today() { // 한국 날짜 YYYY-MM-DD
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
async function body(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b || {};
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if (!store.enabled()) { res.status(503).json({ ok: false, error: "storage" }); return; }
  const q = req.query || {};
  try {
    const idx = (await store.readJson(INDEX)) || { codes: {} };

    if (req.method === "POST") {
      if (!opsOk(req)) { res.status(401).json({ ok: false, error: "auth" }); return; }
      const b = await body(req);
      const code = norm(b.code);
      if (code.length < 8) { res.status(400).json({ ok: false, error: "code" }); return; }
      if (q.put) {
        const buf = Buffer.from(String(b.data || ""), "base64");
        if (!buf.length || buf.length > 3 * 1024 * 1024) { res.status(413).json({ ok: false, error: "size" }); return; }
        await store.writeBytes(`${NS}/zips/${code}.zip`, buf, "application/zip");
        const prev = idx.codes[code] || {};
        idx.codes[code] = { name: String(b.name || "").slice(0, 40), title: String(b.title || "원장님").slice(0, 10), cohort: String(b.cohort || "").slice(0, 10), kitId: String(b.kitId || "").slice(0, 20),
          from: String(b.from || ""), to: String(b.to || ""), size: buf.length, downloads: prev.downloads || [] };
      } else if (q.window) {
        if (!idx.codes[code]) { res.status(404).json({ ok: false, error: "code" }); return; }
        idx.codes[code].from = String(b.from || ""); idx.codes[code].to = String(b.to || "");
      } else { res.status(400).json({ ok: false }); return; }
      await store.writeJson(INDEX, idx);
      res.status(200).json({ ok: true });
      return;
    }

    if (q.list) {
      if (!opsOk(req)) { res.status(401).json({ ok: false, error: "auth" }); return; }
      res.status(200).json({ ok: true, today: today(), codes: idx.codes });
      return;
    }

    const code = norm(q.check || q.code);
    const ent = code && idx.codes[code];
    if (!ent) { res.status(404).json({ ok: false, error: "code" }); return; }
    const d = today();
    if ((ent.from && d < ent.from) || (ent.to && d > ent.to)) {
      res.status(403).json({ ok: false, error: "date", from: ent.from, to: ent.to });
      return;
    }
    if (q.check) { res.status(200).json({ ok: true, name: ent.name, title: ent.title || "원장님", cohort: ent.cohort }); return; }

    const bytes = await store.readBytes(`${NS}/zips/${code}.zip`);
    if (!bytes) { res.status(404).json({ ok: false, error: "file" }); return; }
    ent.downloads = (ent.downloads || []).concat(new Date().toISOString()).slice(-50);
    await store.writeJson(INDEX, idx);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename=\"vet-app-kit.zip\"");
    res.status(200).send(Buffer.from(bytes));
  } catch (e) {
    res.status(500).json({ ok: false, error: "server" });
  }
};
