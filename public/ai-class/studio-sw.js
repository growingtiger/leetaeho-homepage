// 강의 준비실 앱: 화면만 저장해 두고, 명단(API)은 항상 서버에서 새로 받는다.
var C="ai-studio-v2",SHELL=["/ai-class/studio","/ai-class/app/studio-192.png","/ai-class/app/studio-512.png"];
self.addEventListener("install",function(e){e.waitUntil(caches.open(C).then(function(c){return c.addAll(SHELL)}));self.skipWaiting();});
self.addEventListener("activate",function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==C}).map(function(k){return caches.delete(k)}))}));self.clients.claim();});
self.addEventListener("fetch",function(e){var u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==location.origin||u.pathname.indexOf("/api/")===0)return;
  e.respondWith(fetch(e.request).then(function(r){if(r.ok&&SHELL.indexOf(u.pathname)>=0){var cp=r.clone();caches.open(C).then(function(c){c.put(e.request,cp)});}return r;})
    .catch(function(){return caches.match(e.request,{ignoreSearch:true})}));});
