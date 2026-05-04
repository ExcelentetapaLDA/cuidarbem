// CuidarBem — Service Worker com Notificações Locais Automáticas
// Não precisa de servidor FCM — gere os alertas localmente

const CACHE_NAME = 'cuidarbem-v1';
const ALERTAS = [
  {hora:'06:25', titulo:'💊 Medicação Jejum',         corpo:'Administrar medicação em jejum antes do peq. almoço'},
  {hora:'06:55', titulo:'🥣 Reforço Peq. Almoço',     corpo:'Utentes com reforço de peq. almoço — verificar lista na app'},
  {hora:'07:45', titulo:'📋 Passagem de Turno',        corpo:'Passagem de turno Noite → Manhã — MySenior + presencial OBRIGATÓRIO'},
  {hora:'08:00', titulo:'🩸 Glicemias — Peq. Almoço', corpo:'Medir glicemias antes do peq. almoço'},
  {hora:'12:00', titulo:'🩸 Glicemias — Almoço',      corpo:'Medir glicemias antes do almoço'},
  {hora:'14:30', titulo:'🌆 Turno da Tarde',           corpo:'Início do turno da tarde — ver distribuição na app'},
  {hora:'16:00', titulo:'🔄 Posicionamentos — 16h',   corpo:'Posicionar utentes acamados — registar com foto 📸'},
  {hora:'18:00', titulo:'🔄 Posicionamentos — 18h',   corpo:'Posicionar utentes acamados — registar com foto 📸'},
  {hora:'19:00', titulo:'🩸 Glicemias — Jantar',      corpo:'Medir glicemias antes do jantar'},
  {hora:'20:00', titulo:'🔄 Posicionamentos — 20h',   corpo:'Posicionar utentes acamados — registar com foto 📸'},
  {hora:'20:30', titulo:'🍽️ Ceias',                   corpo:'Distribuir ceias a todos os utentes incluindo diabéticos'},
  {hora:'21:00', titulo:'💨 Inaladores',               corpo:'Fazer inaladores e desinfetar câmaras expansoras'},
  {hora:'22:30', titulo:'📋 Passagem de Turno',        corpo:'Passagem de turno Tarde → Noite — MySenior + WhatsApp OBRIGATÓRIO'},
  {hora:'00:00', titulo:'🔄 Posicionamentos — 0h',    corpo:'Posicionar utentes acamados — luz de presença NUNCA luz de tecto'},
  {hora:'03:00', titulo:'🔄 Posicionamentos — 3h',    corpo:'Posicionar utentes acamados — luz de presença NUNCA luz de tecto'},
  {hora:'06:00', titulo:'🔄 Posicionamentos — 6h',    corpo:'Posicionar utentes acamados — luz de presença NUNCA luz de tecto'},
];

// Instalar service worker
self.addEventListener('install', event => {
  self.skipWaiting();
  console.log('[CuidarBem SW] Instalado!');
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
  console.log('[CuidarBem SW] Activado!');
  // Inicia o scheduler de alertas
  iniciarScheduler();
});

// Clique na notificação abre a app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({type:'window'}).then(clientList => {
      for(const client of clientList){
        if(client.url.includes('cuidarbem') && 'focus' in client)
          return client.focus();
      }
      return clients.openWindow('/cuidarbem/');
    })
  );
});

// Receber mensagens da app principal
self.addEventListener('message', event => {
  if(event.data && event.data.tipo === 'PING'){
    event.ports[0].postMessage({tipo:'PONG', status:'activo'});
  }
  if(event.data && event.data.tipo === 'TESTAR'){
    enviarNotificacao('🧪 Teste CuidarBem', 'As notificações estão a funcionar! ✅');
  }
});

// ===== SCHEDULER LOCAL =====
let ultimoMinuto = '';

function horaPortugal(){
  const agora = new Date();
  // Portugal: UTC+0 no inverno, UTC+1 no verão
  const offset = isDST(agora) ? 60 : 0;
  const local = new Date(agora.getTime() + offset * 60000);
  const h = String(local.getUTCHours()).padStart(2,'0');
  const m = String(local.getUTCMinutes()).padStart(2,'0');
  return `${h}:${m}`;
}

function isDST(date){
  // Horário de verão Portugal: último domingo de Março até último domingo de Outubro
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  return Math.max(jan, jul) !== date.getTimezoneOffset();
}

async function enviarNotificacao(titulo, corpo){
  if(self.registration.showNotification){
    await self.registration.showNotification(titulo, {
      body: corpo,
      icon: '/cuidarbem/icon-192.png',
      badge: '/cuidarbem/icon-192.png',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
      tag: 'cuidarbem-alerta',
      renotify: true,
      silent: false
    });
  }
}

async function verificarAlertas(){
  const hora = horaPortugal();
  if(hora === ultimoMinuto) return;
  ultimoMinuto = hora;

  for(const alerta of ALERTAS){
    if(alerta.hora === hora){
      console.log(`[CuidarBem SW] Alerta: ${alerta.titulo}`);
      await enviarNotificacao(alerta.titulo, alerta.corpo);
    }
  }
}

function iniciarScheduler(){
  // Verifica a cada 30 segundos
  setInterval(verificarAlertas, 30000);
  // Verifica imediatamente
  verificarAlertas();
  console.log('[CuidarBem SW] Scheduler iniciado!');
}

// FCM background (quando o servidor enviar)
self.addEventListener('push', event => {
  if(!event.data) return;
  try {
    const payload = event.data.json();
    const titulo = payload.notification?.title || 'CuidarBem';
    const corpo = payload.notification?.body || '';
    event.waitUntil(enviarNotificacao(titulo, corpo));
  } catch(e) {
    console.error('[CuidarBem SW] Erro push:', e);
  }
});
