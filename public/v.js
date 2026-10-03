/* 내원 링크 클릭 수 — 전화·카카오 상담·지도·병원 홈페이지. 쿠키·식별자 없음 */
(function () {
  function kind(h) {
    if (h.indexOf('tel:') === 0) return 'tel';
    if (h.indexOf('pf.kakao.com') > -1) return 'kakao';
    if (/map\.naver\.com|naver\.me\/|place\.naver\.com/.test(h)) return 'map';
    if (h.indexOf('signatureamc.co.kr') > -1) return 'hosp';
    return '';
  }
  function send(a) {
    var h = a.getAttribute('href') || '';
    var k = kind(h);
    if (!k) return;
    var d = { k: k, p: location.pathname.slice(0, 80) };
    if (k === 'tel') d.n = h.slice(4).replace(/[^0-9]/g, '').slice(0, 15);
    var body = JSON.stringify(d);
    try {
      if (navigator.sendBeacon) navigator.sendBeacon('/api/c', body);
      else fetch('/api/c', { method: 'POST', body: body, keepalive: true });
    } catch (e) { /* 측정 실패는 무시한다 */ }
  }
  function on(e) {
    var t = e.target;
    var a = t && t.closest ? t.closest('a[href]') : null;
    if (a) send(a);
  }
  document.addEventListener('click', on, true);
  document.addEventListener('auxclick', function (e) { if (e.button === 1) on(e); }, true);
})();
