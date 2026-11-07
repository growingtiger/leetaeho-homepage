/* 검역본부 방문용 예시 프로그램 포털(/ai-class/programs) — 비밀번호 잠금.
 * vercel.json rewrite로 /ai-class/programs → /api/programs. 본문은 _programs_page.js
 * (build_programs_portal.py가 만든다).
 * GET: 쿠키가 맞으면 포털, 아니면 비밀번호 화면. POST { password }: 맞으면 쿠키를 심는다.
 * PORTAL_PASSWORD 환경변수가 없으면 잠그지 않고 포털을 그대로 보여 준다.
 */
"use strict";
const crypto = require("crypto");
const PAGE = require("./_programs_page");

function normPw(v) {
  v = String(v || "").trim();
  const m = v.match(/^(["'])([\s\S]*)\1$/);
  if (m) v = m[2].trim();
  return v;
}
const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const token = (pw) => sha("qia-portal|" + pw);

function cookie(req, name) {
  const m = String(req.headers.cookie || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : "";
}

const LOGIN = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive"><title>교육 예시 프로그램</title>
<style>
:root{--paper:#fdfaf3;--ink:#2a251f;--ink-3:#70685b;--line:#e6dcc8;--gold:#846525}
@media (prefers-color-scheme:dark){:root{--paper:#15120e;--ink:#f0e8da;--ink-3:#a19682;--line:#352d22;--gold:#d6ae67}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--paper);color:var(--ink);font-family:"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;word-break:keep-all}
main{width:100%;max-width:360px;padding:0 16px}
p.m{margin:0;color:var(--ink-3);font-size:.9rem}
h1{font-size:1.35rem;margin:6px 0 24px;letter-spacing:-.02em}
label{display:block;font-size:.9rem;color:var(--ink-3);margin-bottom:6px}
input{width:100%;box-sizing:border-box;font:inherit;font-size:1.05rem;padding:12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--ink)}
button{margin-top:12px;width:100%;font:inherit;font-weight:600;padding:12px;border:0;border-radius:8px;background:var(--ink);color:var(--paper);cursor:pointer}
#e{min-height:1.4em;margin:10px 0 0;color:#b4462f;font-size:.9rem}
</style></head><body><main>
<p class="m">시그니처 동물의료센터</p>
<h1>교육 예시 프로그램</h1>
<form id="f"><label for="p">비밀번호</label><input id="p" type="password" autocomplete="current-password" autofocus required>
<button type="submit">열기</button><p id="e" role="alert"></p></form>
<script>
document.getElementById("f").addEventListener("submit", async function (ev) {
  ev.preventDefault();
  var e = document.getElementById("e"); e.textContent = "";
  try {
    var r = await fetch(location.pathname, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: document.getElementById("p").value }) });
    var d = await r.json();
    if (d.ok) location.reload(); else e.textContent = "비밀번호가 맞지 않습니다.";
  } catch (x) { e.textContent = "연결이 원활하지 않습니다. 다시 눌러 주세요."; }
});
</script></main></body></html>`;

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const pw = normPw(process.env.PORTAL_PASSWORD);

  if (req.method === "POST") {
    if (!pw) return res.status(200).json({ ok: true, open: true });
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const given = String((body && body.password) || "").trim();
    const a = Buffer.from(sha(given)), b = Buffer.from(sha(pw));
    if (!crypto.timingSafeEqual(a, b)) return res.status(200).json({ ok: false });
    res.setHeader("Set-Cookie",
      "qia_portal=" + token(pw) + "; Path=/ai-class; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax");
    return res.status(200).json({ ok: true });
  }
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).end();

  /* 진단: ?status=1 → 잠금 여부만(값은 노출하지 않음) */
  if (req.query && req.query.status) return res.status(200).json({ ok: true, locked: Boolean(pw) });

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const ok = !pw || cookie(req, "qia_portal") === token(pw);
  return res.status(200).send(ok ? PAGE : LOGIN);
};
