const CACHE = 'family-meal-20261030-web-push-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './favicon.ico', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => {event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate', event => {event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch', event => {const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('./index.html')));return;}event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));});

self.addEventListener('push',event=>{let data={};try{data=event.data?.json()||{}}catch{}const title=data.title||'わが家のごはん';event.waitUntil(self.registration.showNotification(title,{body:data.body||'',icon:'./icon-192.png',badge:'./icon-192.png',tag:'family-meal-daily',data:{url:data.url||'./'}}))});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const url=new URL(event.notification.data?.url||'./',self.registration.scope).href;const tabs=await clients.matchAll({type:'window',includeUncontrolled:true});for(const tab of tabs){if(tab.url.startsWith(self.registration.scope)){await tab.focus();return}}await clients.openWindow(url)})())});
