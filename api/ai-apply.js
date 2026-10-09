/* AI 교육 신청서 수신 — /ai-class/apply 에서 보낸 신청 1건을 파일 1개로 남기고 선착순 번호를 돌려준다.
 * 저장소: 서울 Supabase(tfwxsmysomeksntvqiie) 비공개 버킷, 환경변수 SUPABASE_URL·SUPABASE_SECRET_KEY.
 * 변수가 없으면 503을 돌려주고, 신청 화면은 "답변 복사해 카톡으로 보내기"로 넘어간다.
 *
 * 선착순 규칙 (2026-10-06 이태호 원장 지시)
 *   과정 1(하루 실습)은 신청 순서대로 5명씩 한 기수. 6번째부터는 다음 기수 대기자.
 *   과정 2(방문 세팅)는 접수 번호만 매긴다.
 *
 * GET  ?list=1 + 헤더 x-admin-key  → 신청 목록 (원장 확인용 /ai-class/admin)
 * POST JSON                        → 접수
 */
"use strict";
const crypto = require("crypto");
const store = require("./_store");

const NS = "ai-class/7c2e91d04b6a";
const INDEX = NS + "/index.json";
const PER_COHORT = 5;
const HOSTS = ["leetaeho.co.kr", "www.leetaeho.co.kr", "leetaeho.vercel.app", "leetaeho-homepage.vercel.app"];
// 관리 비밀번호. Vercel 환경변수 AI_CLASS_ADMIN_KEY가 있으면 그것을 쓰고(원장이 직접 정함),
// 없으면 처음 만든 비밀번호의 SHA-256과 비교한다. 비밀번호 자체는 저장소에 두지 않는다.
const ADMIN_HASH = "06d0f0a4bbb203d563b41c8690b320f6043678b0955afe5551a9426e86f9da8e";

// 원장 맥의 신청 알림(~/ai-assistant/ai_class_alert.py)이 쓰는 읽기 전용 열쇠의 SHA-256.
// 이름·병원·과정·순서만 돌려주고 연락처와 답변은 주지 않는다.
const NOTIFY_HASH = "263fff00e310bdee13c2209774b0872d185f4b1ab9b390e71392cf74b1c99567";

// 원장 맥의 관리 작업(기수 재배정·구두 신청 추가 등)용 열쇠의 SHA-256. 비밀번호와 따로 둔다.
const OPS_HASH = "ee293cd94f1e0400cf77900c41cc959de75329835a1807c7db2db32586d4d203";

const LIMITS = { note: 200, name: 40, hospital: 80, region: 40, phone: 30, type: 40, size: 80, laptop: 20, ai: 200, pain: 1500, want: 1500, users: 40, ask: 1500 };

function sha(s) { return crypto.createHash("sha256").update(String(s)).digest("hex"); }

function opsOk(key) {
  if (!key) return false;
  return crypto.timingSafeEqual(Buffer.from(sha(key)), Buffer.from(OPS_HASH));
}

function adminOk(key) {
  if (!key) return false;
  const envKey = store.clean(process.env.AI_CLASS_ADMIN_KEY);
  const want = envKey ? sha(envKey) : ADMIN_HASH;
  return crypto.timingSafeEqual(Buffer.from(sha(key)), Buffer.from(want));
}

function kst(d) { return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().replace("Z", "+09:00"); }

function pick(body) {
  const out = {};
  for (const k of Object.keys(LIMITS)) {
    let v = body[k];
    if (Array.isArray(v)) v = v.join(", ");
    out[k] = String(v == null ? "" : v).trim().slice(0, LIMITS[k]);
  }
  out.course = body.course === "2" ? "2" : "1";
  return out;
}

async function readIndex() {
  try { return (await store.readJson(INDEX)) || { total: 0, c1: 0, c2: 0 }; }
  catch (e) { if (e && e.status === 404) return { total: 0, c1: 0, c2: 0 }; throw e; }
}

module.exports = async (req, res) => {
  res.setHeader("cache-control", "no-store");

  if (req.method === "GET") {
    if (req.query && req.query.notify) {
      const nk = String(req.headers["x-notify-key"] || "");
      if (!nk || !crypto.timingSafeEqual(Buffer.from(sha(nk)), Buffer.from(NOTIFY_HASH))) { res.status(401).json({ ok: false }); return; }
      if (!store.enabled()) { res.status(503).json({ ok: false, error: "storage" }); return; }
      const idx = await readIndex();
      const after = Math.max(0, parseInt(req.query.after, 10) || 0);
      const items = [];
      for (let n = after + 1; n <= idx.total; n++) {
        try {
          const a = await store.readJson(`${NS}/apps/${String(n).padStart(4, "0")}.json`);
          if (a) items.push({ no: a.no, at: a.at, name: a.name, hospital: a.hospital, region: a.region, course: a.course, order: a.order, cohort: a.cohort || null, seat: a.seat || null });
        } catch (e) { /* 건너뛴다 */ }
      }
      res.status(200).json({ ok: true, total: idx.total, items });
      return;
    }
    // 원장 맥의 관리 열쇠로 신청서 답변을 읽는다(교육 준비용 시제품 제작, 2026-10-09 원장 허락). 연락처는 주지 않는다.
    if (req.query && req.query.answers) {
      if (!opsOk(String(req.headers["x-ops-key"] || ""))) { res.status(401).json({ ok: false }); return; }
      if (!store.enabled()) { res.status(503).json({ ok: false, error: "storage" }); return; }
      const idx = await readIndex();
      const items = [];
      for (let n = 1; n <= idx.total; n++) {
        try {
          const a = await store.readJson(`${NS}/apps/${String(n).padStart(4, "0")}.json`);
          if (a) { const { phone, ...rest } = a; items.push(rest); }
        } catch (e) { /* 건너뛴다 */ }
      }
      res.status(200).json({ ok: true, items });
      return;
    }
    if (!req.query || !req.query.list) { res.status(200).json({ ok: true, enabled: store.enabled() }); return; }
    const key = String(req.headers["x-admin-key"] || "");
    if (!adminOk(key)) { res.status(401).json({ ok: false }); return; }
    if (!store.enabled()) { res.status(503).json({ ok: false, error: "storage" }); return; }
    const idx = await readIndex();
    const items = [];
    for (let n = 1; n <= idx.total; n++) {
      try { const a = await store.readJson(`${NS}/apps/${String(n).padStart(4, "0")}.json`); if (a) items.push(a); }
      catch (e) { /* 빠진 번호는 건너뛴다 */ }
    }
    res.status(200).json({ ok: true, index: idx, items });
    return;
  }

  if (req.method !== "POST") { res.status(405).end(); return; }

  // 원장 전용: 신청 기록 고치기(이름 오타 등). 헤더 x-admin-key 필요.
  if (req.query && req.query.fix) {
    if (!adminOk(String(req.headers["x-admin-key"] || "")) && !opsOk(String(req.headers["x-ops-key"] || ""))) { res.status(401).json({ ok: false }); return; }
    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
    b = b || {};
    // 기수 재배정·구두 신청 추가·기수 닫기 (원장 관리 작업)
    if (b.op === "plan") {
      const idx = await readIndex();
      const recs = {};
      for (let n = 1; n <= idx.total; n++) {
        const r0 = await store.readJson(`${NS}/apps/${String(n).padStart(4, "0")}.json`);
        if (r0) recs[n] = r0;
      }
      for (const m of (b.add || [])) {
        idx.total += 1; idx.c1 += 1;
        recs[idx.total] = { no: idx.total, at: kst(new Date()), course: "1", order: idx.c1, name: String(m.name || "").slice(0, 40), hospital: String(m.hospital || "").slice(0, 80), region: String(m.region || "").slice(0, 40), phone: "", note: String(m.note || "구두 신청").slice(0, 200), manual: true, cohort: m.cohort };
      }
      for (const [no, c] of Object.entries(b.assign || {})) if (recs[no]) recs[no].cohort = c;
      for (const [no, t] of Object.entries(b.notes || {})) if (recs[no]) recs[no].note = String(t).slice(0, 200);
      for (const [no, nm] of Object.entries(b.names || {})) if (recs[no]) recs[no].name = String(nm).slice(0, 40);
      if (Array.isArray(b.closed)) idx.closed = b.closed;
      idx.cc = {};
      Object.values(recs).filter((r0) => r0.course === "1").sort((x, y) => x.no - y.no).forEach((r0) => {
        idx.cc[r0.cohort] = (idx.cc[r0.cohort] || 0) + 1; r0.seat = idx.cc[r0.cohort];
      });
      for (const r0 of Object.values(recs)) await store.writeJson(`${NS}/apps/${String(r0.no).padStart(4, "0")}.json`, r0);
      await store.writeJson(INDEX, idx);
      res.status(200).json({ ok: true, index: idx });
      return;
    }
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
    const no = parseInt(b && b.no, 10);
    const allowed = ["name", "hospital", "region", "phone", "note"];
    if (!no || !b.fields || typeof b.fields !== "object") { res.status(400).json({ ok: false }); return; }
    const path = `${NS}/apps/${String(no).padStart(4, "0")}.json`;
    const rec = await store.readJson(path);
    if (!rec) { res.status(404).json({ ok: false }); return; }
    for (const k of allowed) if (typeof b.fields[k] === "string") rec[k] = b.fields[k].trim().slice(0, LIMITS[k]);
    rec.editedAt = kst(new Date());
    await store.writeJson(path, rec);
    res.status(200).json({ ok: true, rec: { no: rec.no, name: rec.name, hospital: rec.hospital } });
    return;
  }

  const origin = String(req.headers.origin || "");
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch (e) { /* 잘못된 Origin */ }
    if (!HOSTS.includes(host)) { res.status(403).end(); return; }
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== "object") { res.status(400).json({ ok: false, error: "body" }); return; }
  if (body.website) { res.status(200).json({ ok: true, no: 0 }); return; } // 자동 입력 방지용 빈칸

  const a = pick(body);
  if (!a.name || !a.hospital || !a.phone || body.agree !== true || body.agree2 !== true || body.agree3 !== true) {
    res.status(400).json({ ok: false, error: "required" }); return;
  }
  if (!store.enabled()) { res.status(503).json({ ok: false, error: "storage" }); return; }

  try {
    const idx = await readIndex();
    idx.total += 1;
    const rec = { no: idx.total, at: kst(new Date()), ...a, agreedNoResale: true, agreedRefund: true };
    if (a.course === "1") {
      idx.c1 += 1;
      rec.order = idx.c1;
      // 기수 배정: 닫힌 기수(예: VIP 전용)는 건너뛰고, 5명이 안 찬 가장 앞 기수에 넣는다.
      if (!idx.cc) { idx.cc = {}; for (let n = 1; n < idx.c1; n++) { const c = Math.ceil(n / PER_COHORT); idx.cc[c] = (idx.cc[c] || 0) + 1; } }
      const closed = idx.closed || [];
      let k = 1;
      while (closed.includes(k) || (idx.cc[k] || 0) >= PER_COHORT) k++;
      idx.cc[k] = (idx.cc[k] || 0) + 1;
      rec.cohort = k;
      rec.seat = idx.cc[k];
    } else {
      idx.c2 += 1;
      rec.order = idx.c2;
    }
    await store.writeJson(`${NS}/apps/${String(rec.no).padStart(4, "0")}.json`, rec);
    await store.writeJson(INDEX, idx);
    // 순서·기수는 원장 명단에서만 본다(2026-10-07 원장 지시). 신청자에게는 돌려주지 않는다.
    res.status(200).json({ ok: true, course: rec.course });
  } catch (e) {
    res.status(500).json({ ok: false, error: "save" });
  }
};
