/* 공용 저장소 어댑터 — Supabase Storage (비공개 버킷)
 *
 * 시그니처AMC PWA 공통 부품. 새 앱을 만들 때 이 파일을 api/_store.js로 그대로 복사한다.
 * 외부 패키지 없이 Node 내장 fetch만 쓴다(package.json에 dependencies가 필요 없다).
 *
 * 환경변수 (Vercel → Settings → Environment Variables, 또는 팀 공유 변수 링크)
 *   SUPABASE_URL         https://<ref>.supabase.co
 *   SUPABASE_SECRET_KEY  sb_secret_… (Supabase → Settings → API Keys → Secret keys)
 *                        예전 service_role 키(eyJ…)도 받는다. publishable 키는 안 된다(쓰기 권한 없음).
 *   SUPABASE_BUCKET      (선택) 버킷 이름. 기본 "pwa-store". 없으면 첫 쓰기 때 비공개로 스스로 만든다.
 *
 * 인증 헤더 규칙 (2026-09 확인, supabase.com/docs/guides/api/api-keys):
 *   새 키(sb_secret_…)는 JWT가 아니라서 `Authorization: Bearer`에 실으면 거절된다 → `apikey` 헤더에만 넣는다.
 *   예전 키(eyJ…)일 때만 Bearer도 같이 붙인다.
 *
 * 한 Supabase 프로젝트·한 버킷을 여러 앱이 나눠 쓴다. 앱마다 경로 앞머리(예: "samc-xxx/")를 다르게 잡는다.
 * 경로에 무작위 문자열을 섞어 두면 저장 위치를 추측할 수 없다(기존 앱들과 같은 관행).
 */
"use strict";

const DEFAULT_BUCKET = "pwa-store";

/* 환경변수 값 정리 — 붙여넣기로 딸려 온 앞뒤 공백·줄바꿈·따옴표는 무시한다 */
function clean(v) {
  v = String(v || "").trim();
  const m = v.match(/^(["'])([\s\S]*)\1$/);
  return m ? m[2].trim() : v;
}

function cfg() {
  return {
    url: clean(process.env.SUPABASE_URL).replace(/\/+$/, ""),
    key: clean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
    bucket: clean(process.env.SUPABASE_BUCKET) || DEFAULT_BUCKET,
  };
}

/* 저장소를 쓸 수 있는가 — 주소와 비밀 키가 둘 다 있어야 한다 */
function enabled() {
  const c = cfg();
  return Boolean(c.url && c.key);
}

function keyKind(key) {
  if (!key) return "none";
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("sb_publishable_")) return "publishable(잘못된 키 — secret 키를 넣어야 한다)";
  if (key.startsWith("eyJ")) return "legacy-jwt";
  return "unknown";
}

/* 진단용. 값은 절대 내보내지 않고 있는지·모양만 알려 준다 */
function diagnostics() {
  const c = cfg();
  return {
    backend: enabled() ? "supabase" : null,
    url: Boolean(c.url),
    urlLooksRight: /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.url),
    key: keyKind(c.key),
    bucket: c.bucket,
    envNames: Object.keys(process.env).filter((k) => /SUPABASE/i.test(k)).sort(),
  };
}

function headers(extra) {
  const { key } = cfg();
  const h = { apikey: key };
  if (key.startsWith("eyJ")) h.Authorization = "Bearer " + key;
  return Object.assign(h, extra || {});
}

function checkPath(path) {
  const p = String(path || "");
  if (!p || p.startsWith("/") || p.includes("..") || /[\s]/.test(p)) throw new Error("bad path: " + p);
  return p;
}

function objectUrl(path) {
  const c = cfg();
  return c.url + "/storage/v1/object/" + encodeURIComponent(c.bucket) + "/" +
    checkPath(path).split("/").map(encodeURIComponent).join("/");
}

class StoreError extends Error {
  constructor(info) {
    super("supabase storage " + info.status + (info.code ? " " + info.code : "") + (info.message ? ": " + info.message : ""));
    this.status = info.status;
    this.code = info.code;
    this.detail = info.message;
  }
}

async function errInfo(res) {
  let body = null;
  try { body = await res.json(); } catch (e) { /* 본문이 JSON이 아닐 수 있다 */ }
  return {
    status: res.status,
    code: String((body && (body.error || body.statusCode)) || ""),
    message: String((body && body.message) || ""),
  };
}
const isNotFound = (e) => e.status === 404 || /not.?found/i.test(e.code) || /not found/i.test(e.message);
const isBucketMissing = (e) => /bucket not found/i.test(e.code) || /bucket not found/i.test(e.message);

/* 버킷이 없으면 비공개로 만든다. 이미 있으면(409) 그대로 통과 */
async function ensureBucket() {
  const c = cfg();
  const res = await fetch(c.url + "/storage/v1/bucket", {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({ id: c.bucket, name: c.bucket, public: false }),
  });
  if (res.ok || res.status === 409) return true;
  throw new StoreError(await errInfo(res));
}

/* 읽기 — 없으면 null, 그 밖의 실패는 던진다(빈 값으로 뭉개면 다음 저장이 남의 기록을 덮는다) */
async function readBytes(path) {
  if (!enabled()) throw new Error("store not configured");
  const res = await fetch(objectUrl(path), { headers: headers({ "cache-control": "no-cache" }), cache: "no-store" });
  if (res.ok) return Buffer.from(await res.arrayBuffer());
  const e = await errInfo(res);
  if (isNotFound(e)) return null;
  throw new StoreError(e);
}

/* 쓰기 — 같은 경로면 덮어쓴다(x-upsert). CDN이 옛 내용을 물고 있지 않도록 max-age=0 */
async function writeBytes(path, data, contentType) {
  if (!enabled()) throw new Error("store not configured");
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const send = () => fetch(objectUrl(path), {
    method: "POST",
    headers: headers({ "content-type": contentType || "application/octet-stream", "x-upsert": "true", "cache-control": "max-age=0" }),
    body,
  });
  let res = await send();
  if (!res.ok) {
    const e = await errInfo(res);
    if (!isBucketMissing(e)) throw new StoreError(e);
    await ensureBucket();
    res = await send();
    if (!res.ok) throw new StoreError(await errInfo(res));
  }
  return "supabase";
}

/* 지우기 — 이미 없어도 조용히 지나간다 */
async function remove(path) {
  if (!enabled()) throw new Error("store not configured");
  const c = cfg();
  const res = await fetch(c.url + "/storage/v1/object/" + encodeURIComponent(c.bucket), {
    method: "DELETE",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify({ prefixes: [checkPath(path)] }),
  });
  if (res.ok) return true;
  const e = await errInfo(res);
  if (isNotFound(e)) return false;
  throw new StoreError(e);
}

async function readJson(path) {
  const buf = await readBytes(path);
  if (buf === null) return null;
  const text = buf.toString("utf8");
  return text.trim() ? JSON.parse(text) : null;
}

function writeJson(path, obj) {
  return writeBytes(path, Buffer.from(JSON.stringify(obj)), "application/json");
}

/* 쓰기→읽기 왕복 점검. sync.js의 action=ping이 쓴다 */
async function ping(path) {
  const stamp = Date.now();
  const out = { backend: "supabase", writeOk: false, readOk: false };
  const t0 = Date.now();
  try {
    await writeJson(path, { t: stamp });
    out.writeOk = true;
    const back = await readJson(path);
    out.readOk = Boolean(back && back.t === stamp);
  } catch (e) {
    out.error = String((e && e.message) || e);
  }
  out.ms = Date.now() - t0;
  return out;
}

module.exports = { enabled, diagnostics, readBytes, writeBytes, readJson, writeJson, remove, ping, ensureBucket, clean, StoreError };
