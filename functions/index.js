const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

admin.initializeApp();

const ALERTAS = [
  { hora: "06:25", titulo: "💊 Medicação Jejum",         corpo: "Administrar medicação em jejum antes do peq. almoço" },
  { hora: "06:55", titulo: "🥣 Reforço Peq. Almoço",     corpo: "Utentes com reforço de peq. almoço — verificar lista na app" },
  { hora: "07:45", titulo: "📋 Passagem de Turno",        corpo: "Passagem de turno Noite → Manhã — MySenior + presencial OBRIGATÓRIO" },
  { hora: "08:00", titulo: "🩸 Glicemias — Peq. Almoço", corpo: "Medir glicemias antes do peq. almoço" },
  { hora: "12:00", titulo: "🩸 Glicemias — Almoço",      corpo: "Medir glicemias antes do almoço" },
  { hora: "14:30", titulo: "🌆 Turno da Tarde",           corpo: "Início do turno da tarde — ver distribuição na app" },
  { hora: "16:00", titulo: "🔄 Posicionamentos — 16h",   corpo: "Posicionar utentes acamados — registar com foto 📸" },
  { hora: "18:00", titulo: "🔄 Posicionamentos — 18h",   corpo: "Posicionar utentes acamados — registar com foto 📸" },
  { hora: "19:00", titulo: "🩸 Glicemias — Jantar",      corpo: "Medir glicemias antes do jantar" },
  { hora: "20:00", titulo: "🔄 Posicionamentos — 20h",   corpo: "Posicionar utentes acamados — registar com foto 📸" },
  { hora: "20:30", titulo: "🍽️ Ceias",                   corpo: "Distribuir ceias a todos os utentes incluindo diabéticos" },
  { hora: "21:00", titulo: "💨 Inaladores",               corpo: "Fazer inaladores e desinfetar câmaras expansoras" },
  { hora: "22:30", titulo: "📋 Passagem de Turno",        corpo: "Passagem de turno Tarde → Noite — MySenior + WhatsApp OBRIGATÓRIO" },
  { hora: "00:00", titulo: "🔄 Posicionamentos — 0h",    corpo: "Posicionar utentes acamados — luz de presença NUNCA luz de tecto" },
  { hora: "03:00", titulo: "🔄 Posicionamentos — 3h",    corpo: "Posicionar utentes acamados — luz de presença NUNCA luz de tecto" },
  { hora: "06:00", titulo: "🔄 Posicionamentos — 6h",    corpo: "Posicionar utentes acamados — luz de presença NUNCA luz de tecto" },
];

function horaLisboaAgora() {
  const agora = new Date();
  return agora.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", hour12: false });
}

// Corre a cada minuto. Cloud Scheduler (Blaze) — custo residual, poucos cêntimos/mês.
exports.enviarAlertasCuidarBem = onSchedule(
  { schedule: "every 1 minutes", timeZone: "Europe/Lisbon", region: "europe-west1" },
  async () => {
    const horaAgora = horaLisboaAgora();
    const alerta = ALERTAS.find((a) => a.hora === horaAgora);
    if (!alerta) return null;

    const snap = await admin.database().ref("tokens").once("value");
    const tokensObj = snap.val() || {};
    const tokens = Object.values(tokensObj)
      .map((d) => d && d.token)
      .filter(Boolean);

    if (!tokens.length) {
      console.log(`[CuidarBem] ${alerta.titulo}: sem tokens registados`);
      return null;
    }

    const message = {
      notification: { title: alerta.titulo, body: alerta.corpo },
      android: { priority: "high", notification: { sound: "default" } },
      apns: { payload: { aps: { sound: "default" } } },
      tokens,
    };

    const resp = await admin.messaging().sendEachForMulticast(message);
    console.log(`[CuidarBem] ${alerta.titulo}: enviado para ${resp.successCount}/${tokens.length} dispositivo(s)`);

    // Limpa tokens inválidos/expirados para não voltar a tentar
    const tokensInvalidos = [];
    resp.responses.forEach((r, i) => {
      if (!r.success && ["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(r.error?.code)) {
        tokensInvalidos.push(tokens[i]);
      }
    });
    if (tokensInvalidos.length) {
      const updates = {};
      for (const [uid, dados] of Object.entries(tokensObj)) {
        if (dados && tokensInvalidos.includes(dados.token)) updates[uid] = null;
      }
      await admin.database().ref("tokens").update(updates);
      console.log(`[CuidarBem] Removidos ${tokensInvalidos.length} token(s) inválido(s)`);
    }

    await admin.database().ref("alertas_log").push({
      titulo: alerta.titulo,
      hora: alerta.hora,
      enviados: resp.successCount,
      total: tokens.length,
      ts: Date.now(),
    });

    return null;
  }
);
