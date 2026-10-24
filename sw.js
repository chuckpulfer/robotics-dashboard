const CACHE="gg-iri-app-v6";
const SHELL=[
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/styles.css",
  "./assets/js/app.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const u=new URL(e.request.url);
  if(u.origin!==location.origin)return;
  if(u.pathname.endsWith("/version.json")){e.respondWith(fetch(e.request,{cache:"no-store"}).catch(()=>new Response('{}',{headers:{"Content-Type":"application/json"}})));return}
  // Cache first, and cached entries never expire on their own. version.json is always
  // fetched from the network, so a new deploy still wipes the cache and reloads the app.
  // ignoreSearch lets the ?v= querystrings in index.html hit the precached shell files.
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(hit=>hit||fetch(e.request).then(r=>{
    if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}
    return r;
  }).catch(()=>caches.match("./index.html"))));
});

// Match reminders are shown through this registration, because an installed web app on
// iOS allows no other route. Tapping one should land in the app that is already open
// rather than a second copy of it, so an existing window is focused where there is one.
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  e.waitUntil((async()=>{
    const open=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const hit=open.find(c=>c.url.startsWith(self.registration.scope));
    if(hit)return hit.focus();
    return self.clients.openWindow(e.notification.data?.url||"./");
  })());
});
