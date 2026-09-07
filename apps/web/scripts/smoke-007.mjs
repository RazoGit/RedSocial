/**
 * Smoke E2E en vivo de la spec 007 (T23) — NOTIFICACIONES Y TIEMPO REAL.
 *
 * Prerequisitos (igual que los tests de integracion de apps/api):
 *   - Docker arriba: docker compose up -d postgres redis mailpit
 *   - API corriendo con .env: apps/api (pnpm --filter @redsocial/api dev)
 *
 * Uso:
 *   pnpm --filter @redsocial/web smoke:007
 *
 * Flujo verificado (SMOKE-OK-007):
 *   1. Registra a A y B; login de ambos; ids via /auth/me.
 *   2. A crea un post.
 *   3. A y B se conectan al Gateway; A recibe notifications:initial.
 *   4. B da like al post -> A recibe notification:new type=like en < 1 s.
 *   5. B sigue a A y comenta -> A recibe follow y comment (conteo sube).
 *   6. PATCH /notifications/:id/read -> notifications:unread decrementado.
 *   7. POST /notifications/read-all -> unreadCount 0 por WS.
 *   8. Presence (RF-8/RF-9): B observa a A, A desconecta -> presence:change.
 *   9. Verificaciones REST: lista paginada y unread-count consistentes.
 */
import { io } from "socket.io-client";

const API = process.env.API_URL ?? "http://localhost:4000/api/v1";
const SOCKET = process.env.SOCKET_URL ?? "http://localhost:4000";
const LIKE_SLA_MS = 1000;

const email = (n) => `smoke007_${n}_${Date.now()}@redsocial.local`;
const password = "smoke-secret-007";

let passed = 0;
let failed = 0;

function ok(label) {
  passed += 1;
  console.log(`  \x1b[32m✔\x1b[0m ${label}`);
}

function ko(label, error) {
  failed += 1;
  const detail = error?.message ?? (error === undefined ? "" : JSON.stringify(error));
  console.log(`  \x1b[31m✘\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
}

async function request(path, { method = "GET", body, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body:
      body === undefined
        ? method === "GET" || method === "DELETE"
          ? undefined
          : "{}"
        : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) ?? {};
  if (!res.ok) {
    const error = new Error(
      `${method} ${path} → ${res.status} ${JSON.stringify(json).slice(0, 200)}`,
    );
    error.status = res.status;
    throw error;
  }
  return json;
}

function waitForEvent(socket, name, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout esperando ${name} (${timeoutMs} ms)`)),
      timeoutMs,
    );
    const onEvent = (payload) => {
      clearTimeout(timer);
      socket.off(name, onEvent);
      resolve(payload);
    };
    socket.on(name, onEvent);
  });
}

function connect(token) {
  const socket = io(SOCKET, { auth: { token }, transports: ["websocket"] });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout en handshake WS")), 3000);
    socket.on("connect", () => {
      clearTimeout(timer);
      socket.off("connect_error");
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function confirmType(event, type, label) {
  if (event?.notification?.type === type) ok(label);
  else ko(label, event);
}

async function main() {
  const [aEmail, bEmail] = [email("a"), email("b")];

  console.log("1. Registro, login e identificacion de A y B");
  await request("/auth/register", { method: "POST", body: { email: aEmail, password } });
  await request("/auth/register", { method: "POST", body: { email: bEmail, password } });
  const aSession = await request("/auth/login", {
    method: "POST",
    body: { email: aEmail, password },
  });
  const bSession = await request("/auth/login", {
    method: "POST",
    body: { email: bEmail, password },
  });
  const [aMe, bMe] = await Promise.all([
    request("/users/me", { token: aSession.accessToken }),
    request("/users/me", { token: bSession.accessToken }),
  ]);
  ok(`A=${aMe.id} (${aMe.email}) y B=${bMe.id} (${bMe.email})`);
  ok("accessToken emitido para ambos");

  console.log("\n2. A crea un post");
  const post = await request("/posts", {
    method: "POST",
    token: aSession.accessToken,
    body: { text: "smoke 007" },
  });
  ok(`POST /posts -> ${post.id}`);

  console.log("\n3. A y B se conectan al Gateway");
  const [socketA, socketB] = await Promise.all([
    connect(aSession.accessToken),
    connect(bSession.accessToken),
  ]);
  const initialA = await waitForEvent(socketA, "notifications:initial");
  ok(`A: notifications:initial unreadCount=${initialA.unreadCount}`);

  console.log("\n4. Like -> notification:new en < 1 s (SLA ROADMAP Fase 7)");
  const started = Date.now();
  const likeEventPromise = waitForEvent(socketA, "notification:new");
  await request(`/posts/${post.id}/like`, { method: "POST", token: bSession.accessToken });
  const likeEvent = await likeEventPromise;
  const likeLatency = Date.now() - started;
  if (
    likeEvent?.notification?.type === "like" &&
    likeEvent.unreadCount >= 1 &&
    likeLatency < LIKE_SLA_MS
  ) {
    ok(`notification:new(type=like, unread=${likeEvent.unreadCount}) en ${likeLatency} ms`);
  } else {
    ko("like: tipo/tiempo incorrecto", { likeEvent, likeLatency });
  }

  console.log("\n5. Follow y comment (RF-3/RF-4)");
  const followEventPromise = waitForEvent(socketA, "notification:new");
  await request(`/users/${aMe.username}/follow`, { method: "POST", token: bSession.accessToken });
  confirmType(await followEventPromise, "follow", "B sigue a A -> notification:new(type=follow)");

  const commentEventPromise = waitForEvent(socketA, "notification:new");
  await request(`/posts/${post.id}/comments`, {
    method: "POST",
    token: bSession.accessToken,
    body: { text: "smoke comment" },
  });
  confirmType(await commentEventPromise, "comment", "B comenta -> notification:new(type=comment)");

  console.log("\n6. Marcar una como leida decrementa (RF-6)");
  const list = await request("/notifications?limit=10", { token: aSession.accessToken });
  const unreadBefore = list.unreadCount;
  const unreadCount = await request("/notifications/unread-count", { token: aSession.accessToken });
  if (unreadCount.unreadCount === unreadBefore)
    ok(`unread-count REST consistente (${unreadBefore})`);
  else ko("unread-count REST no coincide", unreadCount);
  const target = list.items.find((item) => !item.read);
  const unreadEventPromise = waitForEvent(socketA, "notifications:unread");
  await request(`/notifications/${target.id}/read`, {
    method: "PATCH",
    token: aSession.accessToken,
  });
  const unreadEvent = await unreadEventPromise;
  if (unreadEvent.unreadCount === unreadBefore - 1)
    ok("PATCH /:id/read -> notifications:unread decrementado");
  else ko("PATCH /:id/read", unreadEvent);

  console.log("\n7. Marcar todas como leidas (RF-6)");
  const readAllEventPromise = waitForEvent(socketA, "notifications:unread");
  await request("/notifications/read-all", { method: "POST", token: aSession.accessToken });
  const readAllEvent = await readAllEventPromise;
  if (readAllEvent.unreadCount === 0) ok("POST /read-all -> unreadCount 0 por WS");
  else ko("POST /read-all", readAllEvent);

  console.log("\n8. Presence (RF-8/RF-9)");
  const watchReply = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout en ack presence:watch")), 3000);
    socketB.emit("presence:watch", { userIds: [aMe.id] }, (reply) => {
      clearTimeout(timer);
      resolve(reply);
    });
  });
  if (watchReply?.online?.[aMe.id] === true) ok("B: presence:watch A -> online");
  else ko("presence:watch A online", watchReply);

  const presenceChangePromise = waitForEvent(socketB, "presence:change");
  socketA.disconnect();
  const change = await presenceChangePromise;
  if (change?.userId === aMe.id && change.online === false) {
    ok("A desconecta -> B recibe presence:change online=false");
  } else {
    ko("presence:change al desconectar", change);
  }

  const profileAfter = await request(`/users/${aMe.username}`, { token: bSession.accessToken });
  if (profileAfter.isOnline === false) ok("GET /users/:username isOnline=false tras desconectar");
  else ko("isOnline tras desconectar", profileAfter);

  socketB.disconnect();

  console.log("\n9. Verificacion REST paginada (RF-5)");
  const page1 = await request("/notifications?limit=2", { token: aSession.accessToken });
  const page2 = await request(
    `/notifications?limit=10&createdBefore=${encodeURIComponent(page1.nextCursor)}`,
    {
      token: aSession.accessToken,
    },
  );
  const totalPages = 1 + (page2.items.length > 0 ? 1 : 0);
  if (page1.items.length === 2 && page1.nextCursor && page2.items.length > 0) {
    ok(
      `paginacion cursor: ${totalPages} paginas, ${page1.items.length + page2.items.length} items`,
    );
  } else {
    ko("paginacion cursor", { page1: page1.items.length, page2: page2.items.length });
  }

  console.log("");
  if (failed > 0) {
    console.log(`\x1b[31mSMOKE-007 FALLIDO: ${passed} ok, ${failed} ko\x1b[0m`);
    process.exit(1);
  }
  console.log(`\x1b[32mSMOKE-OK-007 — ${passed} aserciones verdes\x1b[0m`);
}

main().catch((error) => {
  console.error("\x1b[31mSMOKE-007 FALLIDO:\x1b[0m", error);
  process.exit(1);
});
