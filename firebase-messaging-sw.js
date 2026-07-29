// CuidarBem — Service Worker com Notificações Locais Automáticas
// Usa setTimeout preciso em vez de setInterval (muito mais fiável com ecrã bloqueado)

const SW_VERSION = 'cuidarbem-v3';
const FB = 'https://cuidarbem-4af96-default-rtdb.europe-west1.firebasedatabase.app';

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

// ===== ESTADO =====
let swAtivo = false;
let utilizadorInfo = null; // {nome, res, uid}
let timeoutAtual = null;

// ===== INSTALAR / ACTIVAR =====
self.addEventListener('install', event => {
  self.skipWaiting();
  console.log('[CuidarBem SW] v3 instalado');
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
  console.log('[CuidarBem SW] v3 activado');
});

// ===== CLIQUE NA NOTIFICAÇÃO =====
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(clientList => {
      for(const client of clientList){
        if(client.url.includes('cuidarbem') && 'focus' in client)
          return client.focus();
      }
      return clients.openWindow('/cuidarbem/');
    })
  );
});

// ===== MENSAGENS DA APP =====
self.addEventListener('message', event => {
  const data = event.data;
  if(!data) return;

  if(data.tipo === 'PING'){
    event.ports[0] && event.ports[0].postMessage({tipo:'PONG', ativo:swAtivo, versao:SW_VERSION});
  }

  if(data.tipo === 'INICIAR'){
    // App envia nome e residência quando faz login e aceita alertas
    utilizadorInfo = {nome: data.nome, res: data.res, uid: data.uid, token: data.token};
    swAtivo = true;
    registarEstadoFirebase(true);
    programarProximoAlerta();
    console.log('[CuidarBem SW] Alertas activados para:', utilizadorInfo.nome);
    event.ports[0] && event.ports[0].postMessage({tipo:'OK', mensagem:'Alertas activados!'});
  }

  if(data.tipo === 'PARAR'){
    swAtivo = false;
    utilizadorInfo = data.info || utilizadorInfo;
    if(timeoutAtual) clearTimeout(timeoutAtual);
    registarEstadoFirebase(false);
    console.log('[CuidarBem SW] Alertas desactivados');
    event.ports[0] && event.ports[0].postMessage({tipo:'OK', mensagem:'Alertas desactivados'});
  }

  if(data.tipo === 'TESTAR'){
    enviarNotificacao('🧪 Teste CuidarBem', 'As notificações estão a funcionar com som! ✅');
  }
});

// ===== SCHEDULER COM setTimeout PRECISO =====
// Muito mais fiável que setInterval — programa exactamente para a hora certa

function horaPortugalAgora(){
  // Usa Intl para obter hora correcta em Portugal (inclui horário de verão automaticamente)
  const agora = new Date();
  const str = agora.toLocaleString('pt-PT', {timeZone:'Europe/Lisbon', hour:'2-digit', minute:'2-digit', hour12:false});
  return str; // formato "HH:MM"
}

function msAteHora(horaAlvo){
  // Calcula quantos ms faltam para uma hora "HH:MM" em Lisboa
  const agora = new Date();
  const [h, m] = horaAlvo.split(':').map(Number);

  // Data/hora alvo em Lisboa
  const alvo = new Date(agora.toLocaleString('en-US', {timeZone:'Europe/Lisbon'}));
  alvo.setHours(h, m, 0, 0);

  let diff = alvo.getTime() - new Date(agora.toLocaleString('en-US', {timeZone:'Europe/Lisbon'})).getTime();

  // Se já passou hoje, programa para amanhã
  if(diff <= 0) diff += 24 * 60 * 60 * 1000;

  return diff;
}

function programarProximoAlerta(){
  if(!swAtivo) return;
  if(timeoutAtual) clearTimeout(timeoutAtual);

  const horaAgora = horaPortugalAgora();

  // Encontrar o próximo alerta
  let proximoAlerta = null;
  let menorMs = Infinity;

  for(const alerta of ALERTAS){
    const ms = msAteHora(alerta.hora);
    if(ms < menorMs){
      menorMs = ms;
      proximoAlerta = alerta;
    }
  }

  if(!proximoAlerta) return;

  console.log(`[CuidarBem SW] Próximo alerta: ${proximoAlerta.titulo} em ${Math.round(menorMs/60000)} min`);

  timeoutAtual = setTimeout(async () => {
    if(!swAtivo) return;

    // Dispara a notificação
    const corpo = proximoAlerta.corpo + (utilizadorInfo ? ` — ${utilizadorInfo.res}` : '');
    await enviarNotificacao(proximoAlerta.titulo, corpo);

    // Regista no Firebase que o alerta foi enviado
    if(utilizadorInfo){
      try {
        const qs = utilizadorInfo.token ? ('?auth=' + utilizadorInfo.token) : '';
        await fetch(`${FB}/alertas_log.json${qs}`, {
          method:'POST',
          body: JSON.stringify({
            titulo: proximoAlerta.titulo,
            hora: proximoAlerta.hora,
            nome: utilizadorInfo.nome,
            res: utilizadorInfo.res,
            ts: Date.now(),
            data: new Date().toISOString()
          })
        });
      } catch(e){}
    }

    // Programa o próximo alerta (aguarda 65 segundos para não repetir o mesmo)
    setTimeout(() => programarProximoAlerta(), 65000);

  }, menorMs);
}

// ===== ENVIAR NOTIFICAÇÃO =====
async function enviarNotificacao(titulo, corpo){
  try {
    await self.registration.showNotification(titulo, {
      body: corpo,
      icon: '/cuidarbem/icon-192.png',
      badge: '/cuidarbem/icon-192.png',
      vibrate: [400, 100, 400, 100, 400],
      requireInteraction: true,  // Não desaparece automaticamente
      tag: 'cuidarbem-alerta-' + Date.now(),
      silent: false,
      data: {url: '/cuidarbem/'}
    });
    console.log('[CuidarBem SW] Notificação enviada:', titulo);
  } catch(e){
    console.error('[CuidarBem SW] Erro ao enviar notificação:', e);
  }
}

// ===== REGISTAR ESTADO NO FIREBASE =====
// Permite ao admin ver quem tem alertas activos
async function registarEstadoFirebase(ativo){
  if(!utilizadorInfo) return;
  try {
    const uid = utilizadorInfo.uid || utilizadorInfo.nome.replace(/\s+/g,'_').toLowerCase();
    const qs = utilizadorInfo.token ? ('?auth=' + utilizadorInfo.token) : '';
    await fetch(`${FB}/estado_alertas/${uid}.json${qs}`, {
      method:'PUT',
      body: JSON.stringify({
        nome: utilizadorInfo.nome,
        res: utilizadorInfo.res,
        ativo: ativo,
        ultimaActualizacao: new Date().toISOString(),
        ts: Date.now()
      })
    });
  } catch(e){
    console.warn('[CuidarBem SW] Não foi possível registar estado (sem rede):', e);
  }
}

// ===== FCM PUSH (se um dia for usado) =====
self.addEventListener('push', event => {
  if(!event.data) return;
  try {
    const payload = event.data.json();
    const titulo = payload.notification?.title || 'CuidarBem';
    const corpo = payload.notification?.body || '';
    event.waitUntil(enviarNotificacao(titulo, corpo));
  } catch(e){
    console.error('[CuidarBem SW] Erro push:', e);
  }
});
