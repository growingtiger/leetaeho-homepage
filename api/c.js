/* 내원 링크 클릭 비콘 수신 — 이벤트 1건을 파일 1개로 남긴다.
 * 저장소: 서울 Supabase(tfwxsmysomeksntvqiie) 비공개 버킷. 환경변수 SUPABASE_URL·SUPABASE_SECRET_KEY
 * (팀 공유 변수 링크). 변수가 없으면 아무것도 쓰지 않고 204를 돌려준다 — 페이지 동작에는 영향이 없다.
 * IP·User-Agent·쿠키는 저장하지 않는다. 생성기: marketing/campaigns/owned-landing/build/mk_click_beacon.py
 */
"use strict";
const store = require("./_store");

const NS = "samc-home/905b890f86b5";
const SITE = "lee";
const HOSTS = ["leetaeho.co.kr", "www.leetaeho.co.kr", "leetaeho.vercel.app"];
const KINDS = new Set(["tel", "kakao", "map", "hosp"]);

function kstStamp(d) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000).toISOString(); // 2026-10-03T13:45:12.345Z
  return { day: k.slice(0, 10), time: k.slice(11, 23).replace(/[:.]/g, "") };
}

function slug(p) {
  const s = String(p || "/").replace(/\.html$/, "").replace(/^\/+|\/+$/g, "");
  return (s || "home").replace(/[^a-z0-9-]/gi, "_").slice(0, 40);
}

module.exports = async (req, res) => {
  res.setHeader("cache-control", "no-store");
  if (req.method === "GET") {
    res.status(200).json({ ok: true, enabled: store.enabled() });
    return;
  }
  if (req.method !== "POST") { res.status(405).end(); return; }

  const origin = String(req.headers.origin || "");
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch (e) { /* 잘못된 Origin */ }
    if (!HOSTS.includes(host)) { res.status(403).end(); return; }
  }

  let b = req.body;
  if (Buffer.isBuffer(b)) b = b.toString("utf8");
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== "object" || !KINDS.has(b.k)) { res.status(400).end(); return; }
  const page = typeof b.p === "string" && /^\/[A-Za-z0-9._\/-]{0,80}$/.test(b.p) ? b.p : "/";
  const num = b.k === "tel" && /^[0-9]{6,15}$/.test(String(b.n || "")) ? String(b.n) : "";

  if (!store.enabled()) { res.status(204).end(); return; }
  const now = new Date();
  const { day, time } = kstStamp(now);
  const rand = Math.random().toString(36).slice(2, 8);
  const name = [time, b.k, slug(page), num || "x", rand].join(".");
  try {
    await store.writeJson(`${NS}/clicks/${SITE}/${day}/${name}.json`, { t: now.toISOString(), k: b.k, p: page, n: num || undefined });
    res.status(204).end();
  } catch (e) {
    res.status(502).end();
  }
};
