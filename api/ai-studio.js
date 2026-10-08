/* AI 교육 준비실 — /ai-class/studio 앱의 저장소.
 * 기수 일정·수강생 체크, 강의 자료(글·첨부 파일), 결과물 링크를 JSON 한 벌로 보관하고 rev로 덮어쓰기를 막는다.
 * 저장소: 서울 Supabase(tfwxsmysomeksntvqiie) 비공개 버킷, ai-apply.js와 같은 NS 아래 studio/ 폴더.
 * 열쇠: 신청 명단과 같은 관리 비밀번호(x-admin-key) 또는 원장 맥 관리 열쇠(x-ops-key).
 *
 * GET  ?state=1                     → { ok, rev, state }
 * POST ?state=1  { rev, state }     → rev가 같을 때만 저장. 다르면 409 + 최신본
 * POST ?file=1   { name, type, data(base64) } → { ok, id, size }
 * GET  ?file=<id>                   → 파일 바이트
 */
"use strict";
const crypto = require("crypto");
const store = require("./_store");

const NS = "ai-class/7c2e91d04b6a/studio";
const STATE = NS + "/state.json";
const ADMIN_HASH = "06d0f0a4bbb203d563b41c8690b320f6043678b0955afe5551a9426e86f9da8e";
const OPS_HASH = "ee293cd94f1e0400cf77900c41cc959de75329835a1807c7db2db32586d4d203";
const MAX_FILE = 3 * 1024 * 1024; // 요청 본문 4.5MB 한도 안에서 base64 부풀림을 감안

function sha(s) { return crypto.createHash("sha256").update(String(s)).digest("hex"); }
function eq(a, b) { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
function authed(req) {
  const ak = req.headers["x-admin-key"], ok = req.headers["x-ops-key"];
  if (ak) {
    const envKey = store.clean(process.env.AI_CLASS_ADMIN_KEY);
    if (eq(sha(ak), envKey ? sha(envKey) : ADMIN_HASH)) return true;
  }
  return !!ok && eq(sha(ok), OPS_HASH);
}

async function body(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b || {};
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  if (!authed(req)) { res.status(401).json({ ok: false, error: "auth" }); return; }
  if (!store.enabled()) { res.status(503).json({ ok: false, error: "storage" }); return; }
  const q = req.query || {};
  try {
    if (q.file && req.method === "GET") {
      const id = String(q.file);
      if (!/^[a-f0-9]{24}$/.test(id)) { res.status(400).json({ ok: false }); return; }
      const meta = await store.readJson(`${NS}/files/${id}.json`);
      const bytes = meta && await store.readBytes(`${NS}/files/${id}`);
      if (!bytes) { res.status(404).json({ ok: false }); return; }
      res.setHeader("Content-Type", meta.type || "application/octet-stream");
      res.setHeader("Content-Disposition", "inline; filename*=UTF-8''" + encodeURIComponent(meta.name || id));
      res.status(200).send(Buffer.from(bytes));
      return;
    }
    if (q.file && req.method === "POST") {
      const b = await body(req);
      const buf = Buffer.from(String(b.data || ""), "base64");
      if (!buf.length || buf.length > MAX_FILE) { res.status(413).json({ ok: false, error: "size" }); return; }
      const id = crypto.randomBytes(12).toString("hex");
      const type = String(b.type || "application/octet-stream").slice(0, 120);
      await store.writeBytes(`${NS}/files/${id}`, buf, type);
      await store.writeJson(`${NS}/files/${id}.json`, { name: String(b.name || "file").slice(0, 160), type, size: buf.length });
      res.status(200).json({ ok: true, id, size: buf.length });
      return;
    }
    if (q.state) {
      const cur = (await store.readJson(STATE)) || { rev: 0, state: null };
      if (req.method === "GET") { res.status(200).json({ ok: true, rev: cur.rev, state: cur.state }); return; }
      if (req.method === "POST") {
        const b = await body(req);
        if (Number(b.rev) !== Number(cur.rev)) { res.status(409).json({ ok: false, error: "rev", rev: cur.rev, state: cur.state }); return; }
        const s = JSON.stringify(b.state || {});
        if (s.length > 2 * 1024 * 1024) { res.status(413).json({ ok: false, error: "size" }); return; }
        const next = { rev: cur.rev + 1, at: new Date().toISOString(), state: JSON.parse(s) };
        await store.writeJson(STATE, next);
        res.status(200).json({ ok: true, rev: next.rev });
        return;
      }
    }
    res.status(400).json({ ok: false, error: "bad" });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server" });
  }
};
