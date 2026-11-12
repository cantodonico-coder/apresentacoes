const firebaseConfig = {}; const USE_EMULATOR = false;

import { initializeApp } from "./demo-firebase.js";
import {
  getAuth, connectAuthEmulator,
  onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from "./demo-firebase.js";
import {
  getFirestore, connectFirestoreEmulator,
  doc, getDoc, collection, query, where, orderBy, limit, onSnapshot,
  addDoc, serverTimestamp, updateDoc, deleteDoc, setDoc,
} from "./demo-firebase.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

if (USE_EMULATOR) {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 8080);
}

const FAMILY_ID_KEY = "cp_family_id";
let unsubscribeAlerts = null;
let unsubscribeFamily = null;

const el = {
  loginScreen: document.getElementById("login-screen"),
  familyScreen: document.getElementById("family-screen"),
  dashboardScreen: document.getElementById("dashboard-screen"),
  loginForm: document.getElementById("login-form"),
  loginError: document.getElementById("login-error"),
  email: document.getElementById("email"),
  password: document.getElementById("password"),
  signupBtn: document.getElementById("signup-btn"),
  familyForm: document.getElementById("family-form"),
  familyIdInput: document.getElementById("family-id-input"),
  familyError: document.getElementById("family-error"),
  alertsList: document.getElementById("alerts-list"),
  alertsEmpty: document.getElementById("alerts-empty"),
  alertsCount: document.getElementById("alerts-count"),
  moreBtn: document.getElementById("more-btn"),
  sortRecent: document.getElementById("sort-recent"),
  sortSeverity: document.getElementById("sort-severity"),
  fPeriod: document.getElementById("f-period"),
  fChild: document.getElementById("f-child"),
  fFlag: document.getElementById("f-flag"),
  fApp: document.getElementById("f-app"),
  fText: document.getElementById("f-text"),
  clearFiltersBtn: document.getElementById("clear-filters-btn"),
  exportCsvBtn: document.getElementById("export-csv-btn"),
  sTotal: document.getElementById("s-total"),
  sGraves: document.getElementById("s-graves"),
  sHoje: document.getElementById("s-hoje"),
  sUltimo: document.getElementById("s-ultimo"),
  chartDays: document.getElementById("chart-days"),
  topFlags: document.getElementById("top-flags"),
  topApps: document.getElementById("top-apps"),
  topChildren: document.getElementById("top-children"),
  currentProvider: document.getElementById("current-provider"),
  roboStatus: document.getElementById("robo-status"),
  requestsBox: document.getElementById("requests-box"),
  requestsList: document.getElementById("requests-list"),
  devicesList: document.getElementById("devices-list"),
  devicesEmpty: document.getElementById("devices-empty"),
  nEmail: document.getElementById("n-email"),
  nGrave: document.getElementById("n-grave"),
  nOffline: document.getElementById("n-offline"),
  nResumo: document.getElementById("n-resumo"),
  nSaveBtn: document.getElementById("n-save-btn"),
  nStatus: document.getElementById("n-status"),
  providerSelect: document.getElementById("provider-select"),
  apiKeyInput: document.getElementById("api-key-input"),
  apiKeyRow: document.getElementById("api-key-row"),
  saveSettingsBtn: document.getElementById("save-settings-btn"),
  settingsStatus: document.getElementById("settings-status"),
  signOutBtn: document.getElementById("sign-out-btn"),
  switchFamilyBtn: document.getElementById("switch-family-btn"),
  userEmailLabel: document.getElementById("user-email-label"),
};

function showScreen(name) {
  el.loginScreen.classList.toggle("hidden", name !== "login");
  el.familyScreen.classList.toggle("hidden", name !== "family");
  el.dashboardScreen.classList.toggle("hidden", name !== "dashboard");
}

// ---------- Autenticacao ----------

el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.loginError.textContent = "";
  try {
    await signInWithEmailAndPassword(auth, el.email.value, el.password.value);
  } catch (err) {
    el.loginError.textContent = traduzErroAuth(err.code);
  }
});

el.signupBtn.addEventListener("click", async () => {
  el.loginError.textContent = "";
  try {
    await createUserWithEmailAndPassword(auth, el.email.value, el.password.value);
  } catch (err) {
    el.loginError.textContent = traduzErroAuth(err.code);
  }
});

document.getElementById("forgot-btn").addEventListener("click", async () => {
  el.loginError.textContent = "";
  const email = el.email.value.trim();
  if (!email) { el.loginError.textContent = "Digite seu e-mail acima e clique de novo."; return; }
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err) {
    if (err.code === "auth/invalid-email") { el.loginError.textContent = "E-mail invalido"; return; }
  }
  // mesma resposta exista ou nao a conta (nao revela quais e-mails tem cadastro)
  el.loginError.textContent = "Se este e-mail tiver conta, chega um link para criar senha nova (veja o spam).";
});

el.signOutBtn.addEventListener("click", () => signOut(auth));

el.switchFamilyBtn.addEventListener("click", () => {
  localStorage.removeItem(FAMILY_ID_KEY);
  teardownFamilySubscriptions();
  showScreen("family");
});

function traduzErroAuth(code) {
  const mapa = {
    "auth/invalid-credential": "E-mail ou senha invalidos",
    "auth/email-already-in-use": "Este e-mail ja tem conta — faca login em vez de criar",
    "auth/weak-password": "Senha muito curta (minimo 6 caracteres)",
    "auth/invalid-email": "E-mail invalido",
  };
  return mapa[code] ?? "Erro ao autenticar. Tente novamente.";
}

// ---------- Selecao da familia ----------

el.familyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.familyError.textContent = "";
  const familyId = el.familyIdInput.value.trim();
  if (!familyId) return;

  try {
    // Confirma que o pai realmente pertence a essa familia antes de salvar
    // (as Firestore Rules bloqueiam a leitura caso contrario).
    const snap = await getDoc(doc(db, "families", familyId));
    if (!snap.exists()) {
      el.familyError.textContent = "Familia nao encontrada ou sem permissao de acesso.";
      return;
    }
    localStorage.setItem(FAMILY_ID_KEY, familyId);
    startFamilySubscriptions(familyId);
  } catch {
    el.familyError.textContent = "Sem permissao para acessar essa familia com este login.";
  }
});

// ---------- Dashboard ----------

// Gravidade de cada tipo de alerta (5 = mais grave). Tipos novos vindos da IA paga caem em 2.
const GRAVIDADE = {
  risco_autolesao: 5,
  risco_encontro: 4,
  conteudo_sexual: 4,
  site_adulto: 3,
  risco_dados_pessoais: 3,
};
const GRAVE_MIN = 4;
const NOMES_FLAG = {
  risco_autolesao: "Autolesão",
  risco_encontro: "Encontro presencial",
  conteudo_sexual: "Conteúdo sexual",
  site_adulto: "Site adulto",
  risco_dados_pessoais: "Dados pessoais",
  linguagem_ofensiva: "Linguagem ofensiva",
};
const NOMES_PROVEDOR = {
  local_gratis: "Local (grátis)",
  openai: "OpenAI",
  gemini: "Google Gemini",
  anthropic: "Anthropic (Claude)",
};
const MAX_ALERTAS = 2000;
const PAGINA = 50;

const gravidade = (a) => GRAVIDADE[a.flag] ?? 2;
const nomeFlag = (f) => NOMES_FLAG[f] ?? (f || "sem tipo");

let todosAlertas = [];   // tudo o que veio do Firestore no periodo
let filtrados = [];      // depois dos filtros da tela
let ordem = "recent";
let mostrando = PAGINA;
let familiaAtual = null;
let pedidoEnviadoEm = 0;

// --- filtros ---
[el.fChild, el.fFlag, el.fApp].forEach((s) => s.addEventListener("change", aplicarFiltros));
el.fText.addEventListener("input", debounce(aplicarFiltros, 200));
el.fPeriod.addEventListener("change", () => familiaAtual && assinarAlertas(familiaAtual));
el.clearFiltersBtn.addEventListener("click", () => {
  el.fChild.value = el.fFlag.value = el.fApp.value = el.fText.value = "";
  aplicarFiltros();
});
el.sortRecent.addEventListener("click", () => mudarOrdem("recent"));
el.sortSeverity.addEventListener("click", () => mudarOrdem("severity"));
el.moreBtn.addEventListener("click", () => { mostrando += PAGINA; renderLista(); });
el.exportCsvBtn.addEventListener("click", exportarCsv);

function mudarOrdem(o) {
  ordem = o;
  el.sortRecent.classList.toggle("active", o === "recent");
  el.sortSeverity.classList.toggle("active", o === "severity");
  aplicarFiltros();
}

function aplicarFiltros() {
  const child = el.fChild.value, flag = el.fFlag.value, appF = el.fApp.value;
  const texto = el.fText.value.trim().toLowerCase();
  filtrados = todosAlertas.filter((a) =>
    (!child || a.childId === child) &&
    (!flag || a.flag === flag) &&
    (!appF || a.sourceApp === appF) &&
    (!texto || `${a.capturedText ?? ""} ${a.motivo ?? ""} ${a.sourceApp ?? ""}`.toLowerCase().includes(texto))
  );
  filtrados.sort(ordem === "severity"
    ? (x, y) => gravidade(y) - gravidade(x) || (y.createdAt ?? "").localeCompare(x.createdAt ?? "")
    : (x, y) => (y.createdAt ?? "").localeCompare(x.createdAt ?? ""));
  mostrando = PAGINA;
  renderResumo();
  renderLista();
}

function preencherOpcoes(select, valores, rotulo = (v) => v) {
  const atual = select.value;
  select.innerHTML = `<option value="">Todos</option>` +
    [...valores].sort().map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(rotulo(v))}</option>`).join("");
  select.value = valores.has(atual) ? atual : "";
}

// --- resumo ---
function contar(lista, chave) {
  const m = new Map();
  lista.forEach((a) => { const k = a[chave] || "-"; m.set(k, (m.get(k) ?? 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function renderTop(alvo, pares, rotulo = (k) => k, campo) {
  if (!pares.length) { alvo.innerHTML = `<p class="empty-state">-</p>`; return; }
  const max = pares[0][1];
  alvo.innerHTML = pares.slice(0, 6).map(([k, n]) => `
    <button class="top-row" data-campo="${campo}" data-valor="${escapeHtml(k)}" title="Filtrar por ${escapeHtml(rotulo(k))}">
      <span class="top-name">${escapeHtml(rotulo(k))}</span>
      <span class="top-bar"><span style="width:${Math.max(4, (n / max) * 100)}%"></span></span>
      <span class="top-n">${n}</span>
    </button>`).join("");
}

document.addEventListener("click", (e) => {
  const row = e.target.closest(".top-row");
  if (!row) return;
  const alvo = { childId: el.fChild, flag: el.fFlag, sourceApp: el.fApp }[row.dataset.campo];
  if (!alvo || row.dataset.valor === "-") return;
  alvo.value = row.dataset.valor;
  aplicarFiltros();
});

function renderResumo() {
  const hoje = new Date().toDateString();
  el.sTotal.textContent = filtrados.length;
  el.sGraves.textContent = filtrados.filter((a) => gravidade(a) >= GRAVE_MIN).length;
  el.sHoje.textContent = filtrados.filter((a) => a.createdAt && new Date(a.createdAt).toDateString() === hoje).length;
  const ultimo = filtrados.reduce((m, a) => (a.createdAt > (m ?? "") ? a.createdAt : m), null);
  el.sUltimo.textContent = ultimo ? quandoRelativo(ultimo) : "-";

  renderTop(el.topFlags, contar(filtrados, "flag"), nomeFlag, "flag");
  renderTop(el.topApps, contar(filtrados, "sourceApp"), (k) => k, "sourceApp");
  renderTop(el.topChildren, contar(filtrados, "childId"), (k) => k, "childId");
  renderDias();
}

function renderDias() {
  const dias = Number(el.fPeriod.value) || 30;
  const n = Math.min(Math.max(dias, 7), 31);
  const base = new Date(); base.setHours(0, 0, 0, 0);
  const cont = new Map();
  filtrados.forEach((a) => {
    if (!a.createdAt) return;
    const d = new Date(a.createdAt); d.setHours(0, 0, 0, 0);
    cont.set(d.getTime(), (cont.get(d.getTime()) ?? 0) + 1);
  });
  const barras = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base); d.setDate(base.getDate() - i);
    barras.push({ d, v: cont.get(d.getTime()) ?? 0 });
  }
  const max = Math.max(1, ...barras.map((b) => b.v));
  el.chartDays.innerHTML = barras.map((b, i) => `
    <div class="bar" title="${b.d.toLocaleDateString("pt-BR")}: ${b.v} alerta(s)">
      <span class="bar-v">${b.v || ""}</span>
      <span class="bar-fill" style="height:${(b.v / max) * 100}%"></span>
      <span class="bar-x">${i % Math.ceil(n / 8) === 0 || i === n - 1 ? b.d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : ""}</span>
    </div>`).join("");
}

// --- lista ---
function renderLista() {
  el.alertsList.innerHTML = "";
  el.alertsEmpty.classList.toggle("hidden", filtrados.length > 0);
  el.alertsCount.textContent = filtrados.length ? `(${filtrados.length})` : "";
  filtrados.slice(0, mostrando).forEach((a) => el.alertsList.appendChild(renderAlertCard(a)));
  el.moreBtn.classList.toggle("hidden", filtrados.length <= mostrando);
}

function renderAlertCard(alert) {
  const card = document.createElement("details");
  const g = gravidade(alert);
  card.className = `alert-card sev-${g}`;
  const when = alert.createdAt ? new Date(alert.createdAt).toLocaleString("pt-BR") : "-";
  card.innerHTML = `
    <summary>
      <div class="alert-header">
        <span class="alert-flag">${escapeHtml(nomeFlag(alert.flag))}${g >= GRAVE_MIN ? " · grave" : ""}</span>
        <span class="alert-time">${when}</span>
      </div>
      <p class="alert-motivo">${escapeHtml(alert.motivo ?? "")}</p>
      <div class="alert-meta">
        <span>Filho: ${escapeHtml(alert.childId || "-")}</span>
        <span>App: ${escapeHtml(alert.sourceApp || "-")}</span>
        <span>Dispositivo: ${escapeHtml((alert.deviceId || "-").slice(0, 12))}</span>
        <span>Análise: ${escapeHtml(NOMES_PROVEDOR[alert.provider_used] ?? alert.provider_used ?? "-")}</span>
      </div>
    </summary>
    <div class="alert-text">
      <span class="hint">Texto capturado</span>
      <pre>${escapeHtml(alert.capturedText || "(vazio)")}</pre>
    </div>`;
  return card;
}

// --- CSV ---
function exportarCsv() {
  const cols = [
    ["Data", (a) => (a.createdAt ? new Date(a.createdAt).toLocaleString("pt-BR") : "")],
    ["Gravidade", (a) => gravidade(a)],
    ["Tipo", (a) => nomeFlag(a.flag)],
    ["Motivo", (a) => a.motivo ?? ""],
    ["Filho", (a) => a.childId ?? ""],
    ["App", (a) => a.sourceApp ?? ""],
    ["Dispositivo", (a) => a.deviceId ?? ""],
    ["Analise", (a) => a.provider_used ?? ""],
    ["Texto capturado", (a) => a.capturedText ?? ""],
  ];
  const esc = (v) => `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const linhas = [cols.map((c) => esc(c[0])).join(";"), ...filtrados.map((a) => cols.map((c) => esc(c[1](a))).join(";"))];
  const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), {
    href: url, download: `netkids-alertas-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- configuracao da IA (sem Cloud Functions) ---
// O painel grava um pedido em settings_requests; o ai-worker (GitHub Actions, a cada ~10 min)
// valida, criptografa a chave, aplica em ai_settings e apaga o pedido.
el.providerSelect.addEventListener("change", () => {
  el.apiKeyRow.classList.toggle("hidden", el.providerSelect.value === "local_gratis");
});

el.saveSettingsBtn.addEventListener("click", async () => {
  const familyId = localStorage.getItem(FAMILY_ID_KEY);
  const provider = el.providerSelect.value;
  const apiKey = el.apiKeyInput.value.trim();
  el.settingsStatus.textContent = "Enviando…";
  try {
    await addDoc(collection(db, "families", familyId, "settings_requests"), {
      provider,
      apiKey: provider !== "local_gratis" && apiKey ? apiKey : null,
      requestedBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    });
    el.apiKeyInput.value = "";
    pedidoEnviadoEm = Date.now();
    el.settingsStatus.textContent = "Pedido enviado. O robô do GitHub aplica na próxima execução.";
  } catch (err) {
    el.settingsStatus.textContent = `Erro: ${err.message}`;
  }
});

function renderStatusConfig(ai) {
  el.currentProvider.textContent = NOMES_PROVEDOR[ai?.current_provider] ?? ai?.current_provider ?? "Local (grátis)";
  const u = ai?.last_update;
  if (!u?.at) return;
  const quando = new Date(u.at);
  if (pedidoEnviadoEm && quando.getTime() < pedidoEnviadoEm) return; // ainda esperando o pedido novo
  const txt = u.status === "aplicado"
    ? `Aplicado ${quandoRelativo(u.at)}: ${NOMES_PROVEDOR[u.provider] ?? u.provider}${u.key_updated ? " (chave nova)" : ""}.`
    : `Não aplicado ${quandoRelativo(u.at)}: ${u.message ?? "erro"}`;
  el.settingsStatus.textContent = txt;
}

// --- assinaturas ---
function assinarAlertas(familyId) {
  if (unsubscribeAlerts) unsubscribeAlerts();
  const dias = Number(el.fPeriod.value);
  const col = collection(db, "families", familyId, "alerts");
  const q = dias
    ? query(col, where("createdAt", ">=", new Date(Date.now() - dias * 86400000).toISOString()), orderBy("createdAt", "desc"), limit(MAX_ALERTAS))
    : query(col, orderBy("createdAt", "desc"), limit(MAX_ALERTAS));

  unsubscribeAlerts = onSnapshot(q, (snapshot) => {
    todosAlertas = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    preencherOpcoes(el.fChild, new Set(todosAlertas.map((a) => a.childId).filter(Boolean)));
    preencherOpcoes(el.fFlag, new Set(todosAlertas.map((a) => a.flag).filter(Boolean)), nomeFlag);
    preencherOpcoes(el.fApp, new Set(todosAlertas.map((a) => a.sourceApp).filter(Boolean)));
    aplicarFiltros();
  }, (err) => {
    el.alertsEmpty.classList.remove("hidden");
    el.alertsEmpty.textContent = `Erro ao carregar alertas: ${err.message}`;
  });
}

function startFamilySubscriptions(familyId) {
  showScreen("dashboard");
  // o navegador as vezes preenche a busca com o e-mail salvo; comeca sempre limpa
  el.fText.value = "";
  familiaAtual = familyId;

  unsubscribeFamily = onSnapshot(doc(db, "families", familyId), (snap) => {
    const data = snap.data();
    if (!data) return;
    if (!pedidoEnviadoEm) {
      el.providerSelect.value = data.ai_settings?.current_provider ?? "local_gratis";
      el.apiKeyRow.classList.toggle("hidden", el.providerSelect.value === "local_gratis");
    }
    renderStatusConfig(data.ai_settings);
  });

  assinarAlertas(familyId);
  assinarDispositivos(familyId);
}

function teardownFamilySubscriptions() {
  extras.forEach((u) => u());
  extras = [];
  if (unsubscribeAlerts) unsubscribeAlerts();
  if (unsubscribeFamily) unsubscribeFamily();
  unsubscribeAlerts = null;
  unsubscribeFamily = null;
  familiaAtual = null;
}

// --- dispositivos, pedidos de acesso e robo ---
let extras = [];
let dispositivos = [];
let pedidos = [];
let roboLastRun = null;
let roboErro = "";
const aprovando = new Set();

function assinarDispositivos(familyId) {
  extras.push(onSnapshot(collection(db, "families", familyId, "devices"), (s) => {
    dispositivos = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderDispositivos();
  }, () => {}));
  extras.push(onSnapshot(collection(db, "families", familyId, "device_requests"), (s) => {
    pedidos = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderDispositivos();
  }, () => {}));
  extras.push(onSnapshot(doc(db, "families", familyId, "config", "robo"), (s) => {
    const d = s.data();
    roboLastRun = d?.lastRun?.toDate?.() ?? null;
    roboErro = d?.lastError ?? "";
    renderRobo();
  }, () => {}));
  extras.push(onSnapshot(doc(db, "families", familyId, "config", "notificacoes"), (s) => {
    const c = s.data();
    if (document.activeElement && el.nSaveBtn.parentElement.contains(document.activeElement)) return;
    el.nEmail.value = c?.email ?? auth.currentUser?.email ?? "";
    el.nGrave.checked = c?.avisoGrave ?? true;
    el.nOffline.checked = c?.avisoOffline ?? true;
    el.nResumo.value = c?.resumo ?? "diario";
  }, () => {}));
}

function renderRobo() {
  const erro = roboErro;
  if (!roboLastRun) {
    el.roboStatus.textContent = "Robô: não instalado";
    el.roboStatus.className = "robo off";
    return;
  }
  const min = (Date.now() - roboLastRun.getTime()) / 60000;
  el.roboStatus.textContent = erro ? "Robô: com erro" : `Robô: ${quandoRelativo(roboLastRun.toISOString())}`;
  el.roboStatus.className = `robo ${erro || min > 20 ? "off" : "on"}`;
  el.roboStatus.title = erro ? `Último erro: ${erro}` : "Robô que aprova dispositivos e envia e-mails (roda a cada 5 min)";
}

function statusDispositivo(d) {
  const visto = d.lastSeen?.toDate?.();
  if (!visto) return { cls: "off", txt: "sem sinal" };
  const min = (Date.now() - visto.getTime()) / 60000;
  if (min <= 15) return { cls: "on", txt: "online" };
  if (min < 24 * 60) return { cls: "warn", txt: `visto ${quandoRelativo(visto.toISOString())}` };
  return { cls: "off", txt: `sem sinal ${quandoRelativo(visto.toISOString())}` };
}

function renderDispositivos() {
  el.requestsBox.classList.toggle("hidden", pedidos.length === 0);
  el.requestsList.innerHTML = pedidos.map((p) => `
    <div class="device">
      <div class="device-info">
        <strong>${escapeHtml(p.hostname || p.deviceId || p.id)}</strong>
        <span class="hint">${escapeHtml(p.childId || "-")} · ${escapeHtml(p.platform || "-")}</span>
      </div>
      ${p.approved || aprovando.has(p.id)
        ? `<span class="hint">Aprovado, liberando…</span>`
        : `<div class="device-actions">
             <button class="mini ok" data-aprovar="${escapeHtml(p.id)}">Aprovar</button>
             <button class="mini" data-recusar="${escapeHtml(p.id)}">Recusar</button>
           </div>`}
    </div>`).join("");

  el.devicesEmpty.classList.toggle("hidden", dispositivos.length > 0);
  el.devicesList.innerHTML = dispositivos
    .sort((a, b) => (b.lastSeen?.toMillis?.() ?? 0) - (a.lastSeen?.toMillis?.() ?? 0))
    .map((d) => {
      const st = statusDispositivo(d);
      return `<div class="device">
        <span class="dot ${st.cls}"></span>
        <div class="device-info">
          <strong>${escapeHtml(d.hostname || d.deviceId || d.id)}</strong>
          <span class="hint">${escapeHtml(d.childId || "-")} · ${escapeHtml(d.platform || "-")} ${d.version ? "v" + escapeHtml(d.version) : ""}</span>
        </div>
        <span class="device-status ${st.cls}">${escapeHtml(st.txt)}</span>
      </div>`;
    }).join("");
}

document.addEventListener("click", async (e) => {
  const aprovar = e.target.closest("[data-aprovar]");
  const recusar = e.target.closest("[data-recusar]");
  if (!aprovar && !recusar || !familiaAtual) return;
  const id = (aprovar || recusar).dataset[aprovar ? "aprovar" : "recusar"];
  const ref = doc(db, "families", familiaAtual, "device_requests", id);
  try {
    if (aprovar) {
      aprovando.add(id); renderDispositivos();
      await updateDoc(ref, { approved: true, decidedBy: auth.currentUser.uid, decidedAt: serverTimestamp() });
    } else if (true) {
      await deleteDoc(ref);
    }
  } catch (err) {
    aprovando.delete(id); renderDispositivos();
    alert(`Não foi possível: ${err.message}`);
  }
});

el.nSaveBtn.addEventListener("click", async () => {
  const email = el.nEmail.value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { el.nStatus.textContent = "E-mail inválido."; return; }
  el.nStatus.textContent = "Salvando…";
  try {
    await setDoc(doc(db, "families", familiaAtual, "config", "notificacoes"), {
      email, avisoGrave: el.nGrave.checked, avisoOffline: el.nOffline.checked, resumo: el.nResumo.value,
      updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp(),
    });
    el.nStatus.textContent = "Avisos salvos.";
    setTimeout(() => (el.nStatus.textContent = ""), 3000);
  } catch (err) {
    el.nStatus.textContent = `Erro: ${err.message}`;
  }
});

// atualiza os "há X min" sem recarregar
setInterval(() => { if (familiaAtual) { renderDispositivos(); renderRobo(); } }, 60000);

// --- utilidades ---
function quandoRelativo(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML.replace(/"/g, "&quot;");
}

// ---------- Bootstrap ----------

onAuthStateChanged(auth, (user) => {
  teardownFamilySubscriptions();

  if (!user) {
    showScreen("login");
    return;
  }

  el.userEmailLabel.textContent = user.email ?? "";

  const savedFamilyId = localStorage.getItem(FAMILY_ID_KEY);
  if (savedFamilyId) {
    startFamilySubscriptions(savedFamilyId);
  } else {
    showScreen("family");
  }
});
