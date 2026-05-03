// CuidarBem — Firebase Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAiqR1f8dy-LmdtwzhNy4Qwjg3HSbJ6Jt8",
  authDomain: "cuidarbem-4af96.firebaseapp.com",
  databaseURL: "https://cuidarbem-4af96-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cuidarbem-4af96",
  storageBucket: "cuidarbem-4af96.firebasestorage.app",
  messagingSenderId: "20158029936",
  appId: "1:20158029936:web:01f4f736955d223660d4b5"
});

const messaging = firebase.messaging();

// Receber notificações em background (ecrã bloqueado)
messaging.onBackgroundMessage(function(payload) {
  console.log('[CuidarBem SW] Notificação recebida em background:', payload);

  const titulo = payload.notification?.title || 'CuidarBem';
  const opcoes = {
    body: payload.notification?.body || '',
    icon: '/cuidarbem/icon-192.png',
    badge: '/cuidarbem/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    sound: 'default',
    requireInteraction: true,
    data: payload.data || {}
  };

  return self.registration.showNotification(titulo, opcoes);
});

// Clique na notificação abre a app
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/cuidarbem/')
  );
});
