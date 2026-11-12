/* NET-KIDS · MODO DEMONSTRAÇÃO
   Substitui o Firebase por um banco falso na memória do navegador.
   Nenhum dado sai deste aparelho. */
const agora = () => Date.now();
class Timestamp { constructor(ms){ this.ms = ms; } toDate(){ return new Date(this.ms); } toMillis(){ return this.ms; } }
const ts = (minAtras) => new Timestamp(agora() - minAtras * 60000);
const iso = (minAtras) => new Date(agora() - minAtras * 60000).toISOString();
const FAM = "familia-demo";
try { localStorage.setItem("cp_family_id", FAM); } catch (e) {}

const store = new Map(); // caminho -> dados
const P = (...s) => s.join("/");
function put(path, data){ store.set(path, data); }

// ---- dados fictícios ----
put(P("families", FAM), { nome: "Família Exemplo", ai_settings: { current_provider: "local_gratis",
  last_update: { at: iso(60 * 26), status: "aplicado", provider: "local_gratis" } } });
const A = [
  [12, "risco_dados_pessoais", "Criança 1", "WhatsApp", "PC-SALA", "Pedido de endereço e nome da escola por contato desconhecido.", "oi, qual escola vc estuda? me passa teu endereço que eu te mando o presente"],
  [95, "site_adulto", "Criança 2", "Chrome", "NOTEBOOK-QUARTO", "Acesso a site de apostas, bloqueado para menores.", "bet-exemplo.com — cadastre-se e ganhe bônus"],
  [60 * 5, "risco_encontro", "Criança 1", "Discord", "PC-SALA", "Convite para encontro presencial e pedido de segredo.", "bora se ver no shopping sábado? não precisa contar pros teus pais"],
  [60 * 9, "linguagem_ofensiva", "Criança 2", "Free Fire", "CELULAR-CRIANCA-2", "Xingamentos repetidos no chat do jogo.", "(mensagens ofensivas no chat do jogo)"],
  [60 * 22, "site_adulto", "Criança 1", "Edge", "PC-SALA", "Site com conteúdo impróprio para a idade.", "site bloqueado pelo filtro de conteúdo"],
  [60 * 30, "risco_dados_pessoais", "Criança 2", "Instagram", "CELULAR-CRIANCA-2", "Compartilhou o número de telefone em comentário público.", "me chama no zap 51 9xxxx-xxxx"],
  [60 * 49, "linguagem_ofensiva", "Criança 1", "Roblox", "PC-SALA", "Briga com outros jogadores, sem risco grave.", "(discussão no chat do jogo)"],
  [60 * 75, "risco_encontro", "Criança 2", "TikTok", "CELULAR-CRIANCA-2", "Adulto desconhecido pedindo para continuar a conversa em app privado.", "me chama no outro app que lá é mais tranquilo"],
  [60 * 120, "site_adulto", "Criança 2", "Chrome", "NOTEBOOK-QUARTO", "Tentativa de acesso a site de jogos de azar.", "cassino-exemplo.net"],
  [60 * 170, "risco_dados_pessoais", "Criança 1", "WhatsApp", "PC-SALA", "Foto de documento enviada em conversa.", "(imagem de documento)"],
  [60 * 240, "linguagem_ofensiva", "Criança 2", "Free Fire", "CELULAR-CRIANCA-2", "Ofensas em partida online.", "(mensagens ofensivas)"],
  [60 * 330, "site_adulto", "Criança 1", "Edge", "PC-SALA", "Site bloqueado pelo filtro.", "site bloqueado"],
];
A.forEach((a, i) => put(P("families", FAM, "alerts", "a" + i), {
  createdAt: iso(a[0]), flag: a[1], childId: a[2], sourceApp: a[3], deviceId: a[4], motivo: a[5], capturedText: a[6],
  provider_used: i % 3 === 0 ? "gemini" : "local_gratis" }));
put(P("families", FAM, "devices", "d1"), { hostname: "PC-SALA", childId: "Criança 1", platform: "Windows", version: "1.4", lastSeen: ts(2) });
put(P("families", FAM, "devices", "d2"), { hostname: "CELULAR-CRIANCA-2", childId: "Criança 2", platform: "Android", version: "1.0", lastSeen: ts(140) });
put(P("families", FAM, "devices", "d3"), { hostname: "NOTEBOOK-QUARTO", childId: "Criança 2", platform: "Windows", version: "1.4", lastSeen: ts(60 * 30) });
put(P("families", FAM, "device_requests", "r1"), { hostname: "TABLET-CRIANCA-1", childId: "Criança 1", platform: "Android", deviceId: "TABLET-CRIANCA-1" });
put(P("families", FAM, "config", "robo"), { lastRun: ts(3), lastError: "" });
put(P("families", FAM, "config", "notificacoes"), { email: "responsavel@exemplo.com", avisoGrave: true, avisoOffline: true, resumo: "diario" });

// ---- firestore falso ----
const ouvintes = new Set();
function filhosDe(path){ const n = path.split("/").length + 1; return [...store.keys()].filter(k => k.startsWith(path + "/") && k.split("/").length === n); }
function snapDoc(path){ const d = store.get(path); return { id: path.split("/").pop(), exists: () => d !== undefined, data: () => d && { ...d } }; }
function snapCol(ref){
  let docs = filhosDe(ref.path).map(snapDoc);
  for (const c of ref.cons || []) {
    if (c.t === "where" && c.op === ">=") docs = docs.filter(d => (d.data()[c.f] ?? "") >= c.v);
    if (c.t === "orderBy") docs.sort((a, b) => { const x = a.data()[c.f] ?? "", y = b.data()[c.f] ?? ""; return (x < y ? -1 : x > y ? 1 : 0) * (c.dir === "desc" ? -1 : 1); });
    if (c.t === "limit") docs = docs.slice(0, c.n);
  }
  return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) };
}
function avisar(){ ouvintes.forEach(o => setTimeout(() => o.cb(o.ref.type === "doc" ? snapDoc(o.ref.path) : snapCol(o.ref)), 0)); }

export function initializeApp(){ return {}; }
export function getFirestore(){ return {}; }
export function connectFirestoreEmulator(){}
export function doc(_db, ...s){ return { type: "doc", path: P(...s) }; }
export function collection(_db, ...s){ return { type: "col", path: P(...s) }; }
export function where(f, op, v){ return { t: "where", f, op, v }; }
export function orderBy(f, dir = "asc"){ return { t: "orderBy", f, dir }; }
export function limit(n){ return { t: "limit", n }; }
export function query(col, ...cons){ return { ...col, cons }; }
export function serverTimestamp(){ return new Timestamp(agora()); }
export async function getDoc(ref){ return snapDoc(ref.path); }
export function onSnapshot(ref, cb){ const o = { ref, cb }; ouvintes.add(o); setTimeout(() => cb(ref.type === "doc" ? snapDoc(ref.path) : snapCol(ref)), 120); return () => ouvintes.delete(o); }
export async function setDoc(ref, data){ put(ref.path, { ...data }); avisar(); }
export async function updateDoc(ref, data){
  put(ref.path, { ...(store.get(ref.path) || {}), ...data }); avisar();
  // robô simulado: aprova o aparelho em ~2 s
  if (ref.path.includes("/device_requests/") && data.approved) setTimeout(() => {
    const r = store.get(ref.path); store.delete(ref.path);
    put(P("families", FAM, "devices", "novo" + agora()), { hostname: r.hostname, childId: r.childId, platform: r.platform, version: "1.0", lastSeen: new Timestamp(agora()) });
    put(P("families", FAM, "config", "robo"), { lastRun: new Timestamp(agora()), lastError: "" });
    avisar();
  }, 2000);
}
export async function deleteDoc(ref){ store.delete(ref.path); avisar(); }
export async function addDoc(col, data){
  const id = "x" + agora(); put(col.path + "/" + id, { ...data });
  // ai-worker simulado: aplica a configuração em ~3 s
  if (col.path.endsWith("/settings_requests")) setTimeout(() => {
    store.delete(col.path + "/" + id);
    const f = store.get(P("families", FAM));
    put(P("families", FAM), { ...f, ai_settings: { current_provider: data.provider,
      last_update: { at: new Date().toISOString(), status: "aplicado", provider: data.provider, key_updated: !!data.apiKey } } });
    avisar();
  }, 3000);
  avisar(); return { id };
}

// ---- auth falso ----
let usuario = { uid: "demo", email: "responsavel@exemplo.com" };
const authOuvintes = new Set();
const auth = { get currentUser(){ return usuario; } };
const mudou = () => authOuvintes.forEach(cb => setTimeout(() => cb(usuario), 0));
export function getAuth(){ return auth; }
export function connectAuthEmulator(){}
export function onAuthStateChanged(_a, cb){ authOuvintes.add(cb); setTimeout(() => cb(usuario), 0); return () => authOuvintes.delete(cb); }
export async function signInWithEmailAndPassword(_a, email){ usuario = { uid: "demo", email: email || "responsavel@exemplo.com" }; try { localStorage.setItem("cp_family_id", FAM); } catch (e) {} mudou(); }
export async function createUserWithEmailAndPassword(a, e){ return signInWithEmailAndPassword(a, e); }
export async function signOut(){ usuario = null; mudou(); }
export async function sendPasswordResetEmail(){}
