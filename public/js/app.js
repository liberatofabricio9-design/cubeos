const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let staff = false;
let user = "";
let staffUser = "";
let z = 10, n = 0;
let socket = null;
let csrfToken = null;

function getCookie(name) {
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const ct = getCookie("csrf_token");
  if (ct && opts.method && opts.method !== "GET") headers["X-CSRF-Token"] = ct;
  const res = await fetch(path, { credentials: "include", ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "erro");
  return data;
}

function showLoader(ms = 900) {
  const l = $("#loader");
  l.classList.remove("hide");
  return new Promise((resolve) => setTimeout(() => { l.classList.add("hide"); resolve(); }, ms));
}

function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---------- Auth ----------
let registerMode = false;
$("#tp").onclick = () => sw(0);
$("#ts").onclick = () => sw(1);
function sw(s) {
  staff = !!s;
  $("#tp").classList.toggle("on", !s);
  $("#ts").classList.toggle("on", !!s);
  $("#playerForm").classList.toggle("hide", !!s);
  $("#staffForm").classList.toggle("hide", !s);
  $("#hint").textContent = s ? "Acesso restrito à equipe." : "Acesso concedido apenas a quem foi convidado.";
}

$("#toggleReg").onclick = (e) => {
  e.preventDefault();
  registerMode = !registerMode;
  $("#regExtra").classList.toggle("hide", !registerMode);
  $("#enter").textContent = registerMode ? "Solicitar acesso" : "Entrar";
  $("#toggleReg").textContent = registerMode ? "Já tem conta? Entrar" : "Não tem conta? Solicitar acesso";
};

$("#enter").onclick = async () => {
  $("#err").textContent = "";
  try {
    if (registerMode) {
      const body = {
        nick: $("#u").value.trim(),
        password: $("#p").value,
        reason: $("#reason").value.trim(),
        inviteCode: $("#invite").value.trim() || undefined,
      };
      const r = await api("/api/auth/register-request", { method: "POST", body: JSON.stringify(body) });
      if (r.autoApproved) {
        user = body.nick;
        await showLoader();
        bootDesktop();
      } else {
        $("#err").textContent = r.message || "solicitação enviada";
      }
      return;
    }
    const body = { nick: $("#u").value.trim(), password: $("#p").value };
    const r = await api("/api/auth/login", { method: "POST", body: JSON.stringify(body) });
    user = r.user.nick;
    await showLoader();
    bootDesktop();
  } catch (e) {
    $("#err").textContent = e.message;
  }
};

$("#senter").onclick = async () => {
  $("#err").textContent = "";
  try {
    const body = { username: $("#su").value.trim(), password: $("#sp").value, teamCode: $("#sk").value };
    const r = await api("/api/staff/auth/login", { method: "POST", body: JSON.stringify(body) });
    staff = true;
    staffUser = r.staff.username;
    user = r.staff.username;
    await showLoader();
    bootDesktop();
  } catch (e) {
    $("#err").textContent = e.message;
  }
};

async function bootDesktop() {
  $("#login").classList.add("hide");
  $("#desk").classList.remove("hide");
  build();
  if (!staff) connectSocket();
  tick();
  // load user layout/settings
  try {
    if (!staff) {
      const me = await api("/api/users/me");
      if (me.windowLayout) { /* could restore; skip for now */ }
    }
  } catch {}
}

// ---------- Desktop ----------
const apps = {};
function registerApp(k, def) { apps[k] = def; }

registerApp("msg", {
  i: "💬", t: "Mensagens",
  h: () => `<div class="app"><div class="sb" id="msgsb"><h4>Canais</h4><div class="ch on" data-ch="geral"># geral</div><div class="ch" data-ch="construcoes"># construções</div><div class="ch" data-ch="trocas"># trocas</div><h4>Diretas</h4><div id="msgusers"></div></div><div class="main"><div class="top"><b id="mt"># geral</b><span id="monline"></span></div><div class="feed" id="ms"></div><div class="compose"><input type="text" id="mi" placeholder="Escreva uma mensagem"><button id="mb">Enviar</button></div></div></div>`,
  go: async () => {
    const channels = await api("/api/messages/channels").catch(() => ({ channels: [], users: [] }));
    const usersDiv = $("#msgusers");
    if (usersDiv) usersDiv.innerHTML = (channels.users || []).filter(u => u.minecraftNick !== user).map(u => `<div class="ch" data-dm="${esc(u.minecraftNick)}">${avatar(u.minecraftNick, u.status === "online")} ${esc(u.minecraftNick)}</div>`).join("");
    let currentChannel = "geral";
    const feed = $("#ms");
    async function loadHistory(ch) {
      try {
        const msgs = await api("/api/messages/history?channel=" + encodeURIComponent(ch));
        feed.innerHTML = "";
        msgs.forEach(m => appendMsg(m.author, m.content, m.author === user, m.createdAt));
      } catch {}
    }
    function appendMsg(author, content, me, ts) {
      const t = ts ? new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "agora";
      feed.insertAdjacentHTML("beforeend", `<div class="mg${me ? " me" : ""}">${avatar(author)}<div><b>${esc(author)}</b> <small>${esc(t)}</small><br><span class="bb"></span></div></div>`);
      feed.lastElementChild.querySelector(".bb").textContent = content;
      feed.scrollTop = 1e5;
    }
    await loadHistory(currentChannel);
    const send = () => {
      const v = $("#mi").value.trim();
      if (!v) return;
      if (socket) socket.emit("message", { channel: currentChannel, content: v });
      else api("/api/messages", { method: "POST", body: JSON.stringify({ channel: currentChannel, content: v }) }).catch(() => {});
      $("#mi").value = "";
    };
    $("#mb").onclick = send;
    $("#mi").onkeydown = (e) => e.key === "Enter" && send();
    $$("#msgsb .ch").forEach(c => c.onclick = () => {
      $$("#msgsb .ch").forEach(x => x.classList.remove("on"));
      c.classList.add("on");
      if (c.dataset.dm) {
        currentChannel = "dm:" + c.dataset.dm;
        $("#mt").textContent = c.dataset.dm;
      } else {
        currentChannel = c.dataset.ch;
        $("#mt").textContent = "# " + c.dataset.ch;
        if (socket) socket.emit("join", currentChannel);
      }
      loadHistory(currentChannel);
    });
    if (socket) {
      socket.off("message");
      socket.on("message", (m) => {
        if (m.channel !== currentChannel) return;
        appendMsg(m.author, m.content, m.author === user, m.createdAt);
      });
      socket.emit("join", currentChannel);
    }
  },
});

function avatar(nick, online = true) {
  return `<span class="av2">${esc(String(nick)[0] || "?")}<i class="dot${online ? "" : " off"}"></i></span>`;
}

registerApp("games", {
  i: "🎮", t: "Jogos",
  h: () => `<div class="pod"><div style="height:80px"><small>2º</small><br>Bia<b>940</b></div><div style="height:110px"><small>1º 👑</small><br>Alex<b>1280</b></div><div style="height:64px"><small>3º</small><br>Caio<b>720</b></div></div><div class="grid" style="padding:14px" id="gamesgrid"></div>`,
  go: async () => {
    const grid = $("#gamesgrid");
    grid.innerHTML = `<div class="gc"><div class="ban">🏆</div><div class="in"><b>Ranking</b><small>Top jogadores</small><button data-g="ranking">Ver</button></div></div>
      <div class="gc"><div class="ban">🧩</div><div class="in"><b>Quiz do SMP</b><small>Teste seus conhecimentos</small><button data-g="quiz">Jogar</button></div></div>
      <div class="gc"><div class="ban">🎲</div><div class="in"><b>Sorteio</b><small>Prêmios semanais</small><button data-g="raffle">Ver</button></div></div>
      <div class="gc"><div class="ban">⛏️</div><div class="in"><b>Minerador</b><small>Clique e evolua</small><button data-g="minerador">Jogar</button></div></div>`;
    grid.querySelectorAll("button").forEach(b => b.onclick = () => openSubGame(b.dataset.g));
  },
});

async function openSubGame(g) {
  // reuse current window body? Instead open new small window via openApp? We'll render in a new window
  const id = "game-" + g;
  // create a pseudo app entry
  if (!apps[id]) {
    apps[id] = { i: "🎮", t: g, h: () => `<div id="subgame-${g}">Carregando...</div>`, go: () => loadSubGame(g) };
  }
  openApp(id);
}

async function loadSubGame(g) {
  const el = $("#subgame-" + g) || document.querySelector("#subgame-" + g);
  if (!el) return;
  if (g === "ranking") {
    const rows = await api("/api/games/ranking").catch(() => []);
    const sr = await api("/api/users/ranking").catch(() => []);
    const data = rows.length ? rows : sr;
    el.innerHTML = `<div style="padding:14px"><table><tr><th>#</th><th>Jogador</th><th>Pontos</th></tr>${data.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.nick)}</td><td>${r.score}</td></tr>`).join("") || "<tr><td colspan=3 class=muted>Nenhum dado</td></tr>"}</table></div>`;
  } else if (g === "quiz") {
    const qs = await api("/api/games/quiz");
    let html = `<div style="padding:14px" id="quizarea">`;
    qs.forEach(q => {
      html += `<div style="margin-bottom:14px"><b>${esc(q.question)}</b><div>` + q.options.map((o, i) => `<button class="pill" data-q="${q.id}" data-i="${i}" style="margin:4px">${esc(o)}</button>`).join("") + `</div><div class="qres" data-q="${q.id}"></div></div>`;
    });
    html += `</div>`;
    el.innerHTML = html;
    el.querySelectorAll("button[data-q]").forEach(b => b.onclick = async () => {
      const r = await api("/api/games/quiz/answer", { method: "POST", body: JSON.stringify({ questionId: b.dataset.q, answerIndex: b.dataset.i }) });
      const resEl = el.querySelector(`.qres[data-q="${b.dataset.q}"]`);
      resEl.textContent = r.correct ? "Correto!" : "Errado. Resposta: " + r.answer;
      resEl.style.color = r.correct ? "#3ddc84" : "#ff6b6b";
    });
  } else if (g === "raffle") {
    const r = await api("/api/games/raffle").catch(() => null);
    el.innerHTML = `<div style="padding:14px">${r ? `<h3>${esc(r.title)}</h3><p>${esc(r.body)}</p>` : "Nenhum sorteio ativo."}</div>`;
  } else if (g === "minerador") {
    const data = await api("/api/games/minerador");
    el.innerHTML = `<div style="padding:14px;text-align:center"><div style="font-size:48px">⛏️</div><div class="stats"><div><b id="mclicks">${data.clicks}</b>Cliques</div><div><b id="mcoins">${data.coins}</b>Moedas</div><div><b id="mlevel">${data.level}</b>Nível</div></div><button class="go" id="minebtn">Minerar</button></div>`;
    $("#minebtn").onclick = async () => {
      const d = await api("/api/games/minerador/click", { method: "POST" });
      $("#mclicks").textContent = d.clicks;
      $("#mcoins").textContent = d.coins;
      $("#mlevel").textContent = d.level;
    };
  }
}

registerApp("map", {
  i: "🗺️", t: "Mapa",
  h: () => `<div style="height:100%"><iframe id="mapframe" style="width:100%;height:350px;border:0" src=""></iframe><div class="path" id="mappath">Mapa ao vivo</div></div>`,
  go: async () => {
    try {
      const c = await api("/api/map/config");
      const f = $("#mapframe");
      if (c.url) f.src = c.url; else f.srcdoc = "<div style='color:#f4ece4;padding:20px;background:#000'>Configure MAP_URL no .env</div>";
    } catch {}
  },
});

registerApp("rules", {
  i: "📜", t: "Regras",
  h: () => `<div style="padding:14px" id="ruleslist">Carregando...</div>`,
  go: async () => {
    try {
      const rules = await api("/api/rules");
      const anns = await api("/api/announcements").catch(() => []);
      $("#ruleslist").innerHTML = (rules.map((r, i) => `<div class="rl"><i>${i + 1}</i><div><b>${esc(r.title)}</b><br><small>${esc(r.body)}</small></div></div>`).join("") || "<p class=muted>Nenhuma regra.</p>") +
        (anns.length ? `<h4 style="margin:14px 0 6px">Anúncios</h4>` + anns.map(a => `<div class="rl"><i>📢</i><div><b>${esc(a.title)}</b><br><small>${esc(a.body)}</small></div></div>`).join("") : "");
    } catch (e) { $("#ruleslist").textContent = "Erro ao carregar"; }
  },
});

registerApp("user", {
  i: "👤", t: "Usuário",
  h: () => `<div class="ban2"></div><div class="prof"><div class="av">⛏️</div><h3 style="margin:8px 0 0" id="uname"></h3><small style="color:var(--mut)" id="usince"></small><div style="margin-top:12px" id="uxp"></div><div class="stats" style="margin-top:12px" id="ustats"></div><div id="utags"></div><div style="margin-top:12px"><button class="go" id="editbio">Editar bio</button></div></div>`,
  go: async () => {
    if (staff) {
      $("#uname").textContent = staffUser + " (Staff)";
      return;
    }
    try {
      const me = await api("/api/users/me");
      $("#uname").textContent = me.nick;
      $("#usince").textContent = "Membro desde " + new Date(me.createdAt).toLocaleDateString("pt-BR");
      $("#ustats").innerHTML = `<div><b>${me.bio ? "✓" : "—"}</b>Bio</div><div><b>${me.status}</b>Status</div><div><b>${me.windowLayout ? Object.keys(me.windowLayout).length : 0}</b>Janelas</div>`;
      const av = document.querySelector(".prof .av");
      av.innerHTML = `<img src="/api/users/skin/${encodeURIComponent(me.nick)}" alt="skin" style="width:64px;height:64px;border-radius:10px">`;
      $("#editbio").onclick = async () => {
        const bio = prompt("Nova bio:", me.bio || "");
        if (bio === null) return;
        await api("/api/users/me", { method: "PUT", body: JSON.stringify({ bio }) });
        $("#editbio").textContent = "Salvo!";
      };
      const repBtn = document.createElement("button");
      repBtn.className = "go";
      repBtn.style.marginTop = "8px";
      repBtn.textContent = "Denunciar jogador";
      repBtn.onclick = async () => {
        const nick = prompt("Nick do jogador:");
        if (!nick) return;
        const reason = prompt("Motivo:");
        if (reason === null) return;
        try { await api("/api/reports", { method: "POST", body: JSON.stringify({ reportedNick: nick, reason }) }); alert("Denúncia enviada"); }
        catch (e) { alert(e.message); }
      };
      document.querySelector(".prof").appendChild(repBtn);
    } catch {}
  },
});

registerApp("set", {
  i: "⚙️", t: "Configurações",
  h: () => `<div class="app"><div class="sb"><div class="ch on">🎨 Aparência</div><div class="ch">🔔 Notificações</div><div class="ch">🔒 Privacidade</div><div class="ch">👤 Conta</div></div><div class="main" style="padding:16px" id="setmain"></div></div>`,
  go: async () => {
    const main = $("#setmain");
    let settings = {};
    try { settings = await api("/api/settings"); } catch {}
    main.innerHTML = `<b>Cor de destaque</b><div class="sw2">${["#ff7a1a", "#ff4d6d", "#3ddc84", "#4da3ff", "#b66bff"].map(c => `<button data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join("")}</div>
      <div class="row">Notificações<button class="sw ${settings.notifications !== false ? "on" : ""}" data-k="notifications"></button></div>
      <div class="row">Sons do sistema<button class="sw ${settings.sounds ? "on" : ""}" data-k="sounds"></button></div>
      <div class="row">Mostrar status online<button class="sw ${settings.onlineStatus !== false ? "on" : ""}" data-k="onlineStatus"></button></div>
      <div style="margin-top:12px"><button class="go" id="saveset">Salvar</button></div>
      <hr style="border-color:var(--line);margin:16px 0">
      <b>Trocar senha</b>
      <label>Senha atual</label><input type="password" id="cp1">
      <label>Nova senha</label><input type="password" id="cp2">
      <button class="go" id="changepw">Alterar</button>`;
    main.querySelectorAll(".sw2 button").forEach(b => b.onclick = () => {
      document.documentElement.style.setProperty("--or", b.dataset.c);
      document.documentElement.style.setProperty("--or2", b.dataset.c);
    });
    main.querySelectorAll(".sw").forEach(b => b.onclick = () => b.classList.toggle("on"));
    $("#saveset").onclick = async () => {
      const s = {};
      main.querySelectorAll(".sw").forEach(b => { s[b.dataset.k] = b.classList.contains("on"); });
      await api("/api/settings", { method: "PUT", body: JSON.stringify(s) });
      $("#saveset").textContent = "Salvo!";
    };
    $("#changepw").onclick = async () => {
      try {
        await api("/api/users/change-password", { method: "POST", body: JSON.stringify({ currentPassword: $("#cp1").value, newPassword: $("#cp2").value }) });
        $("#changepw").textContent = "Alterada!";
      } catch (e) { alert(e.message); }
    };
  },
});

registerApp("files", {
  i: "📁", t: "Arquivos",
  h: () => `<div class="path">📁 CubeOS / Meus arquivos</div><div style="padding:10px"><input type="file" id="fileinput"><button class="pill" id="uploadbtn">Upload</button></div><div id="filelist"></div>`,
  go: async () => {
    async function refresh() {
      const files = await api("/api/files").catch(() => []);
      $("#filelist").innerHTML = files.map(f => `<div class="fr"><span>📄</span><span>${esc(f.filename)}</span><small>${(f.size / 1024).toFixed(1)} KB</small><button data-id="${f.id}">Excluir</button></div>`).join("") || "<p class=muted>Nenhum arquivo.</p>";
      $("#filelist").querySelectorAll("button").forEach(b => b.onclick = async () => {
        await api("/api/files/" + b.dataset.id, { method: "DELETE" });
        refresh();
      });
    }
    $("#uploadbtn").onclick = async () => {
      const input = $("#fileinput");
      if (!input.files.length) return;
      const fd = new FormData();
      fd.append("file", input.files[0]);
      const ct = getCookie("csrf_token");
      const res = await fetch("/api/files/upload", { method: "POST", credentials: "include", headers: { "X-CSRF-Token": ct }, body: fd });
      if (res.ok) { input.value = ""; refresh(); } else { const d = await res.json(); alert(d.error || "erro"); }
    };
    refresh();
  },
});

// staff panel
registerApp("staff", { s: 1,
  i: "🛡️", t: "Painel Staff",
  h: () => `<div style="padding:14px" id="staffpanel">Carregando...</div>`,
  go: async () => {
    if (!staff) { $("#staffpanel").textContent = "Apenas staff."; return; }
    const panel = $("#staffpanel");
    panel.innerHTML = `
      <div class="stats" id="ststats"></div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="pill" data-tab="players">Jogadores</button>
        <button class="pill" data-tab="access">Pedidos de acesso</button>
        <button class="pill" data-tab="reports">Denúncias</button>
        <button class="pill" data-tab="rules">Regras</button>
        <button class="pill" data-tab="quiz">Quiz</button>
        <button class="pill" data-tab="ann">Anúncios</button>
        <button class="pill" data-tab="logs">Logs</button>
        <button class="pill" data-tab="invites">Convites</button>
      </div>
      <div id="stabcontent" style="margin-top:12px"></div>`;
    async function loadStats() {
      try {
        const s = await api("/api/staff/stats");
        $("#ststats").innerHTML = `<div><b>${s.users}</b>Jogadores</div><div><b>${s.online}</b>Online</div><div><b>${s.pending}</b>Pedidos</div><div><b>${s.openReports}</b>Denúncias</div>`;
      } catch {}
    }
    loadStats();
    const content = $("#stabcontent");
    async function showTab(tab) {
      if (tab === "players") {
        const search = "";
        const players = await api("/api/staff/players?search=" + encodeURIComponent(search));
        content.innerHTML = `<table><tr><th>Jogador</th><th>Status</th><th>Banido</th><th></th></tr>${players.map(p => `<tr><td>${esc(p.nick)}</td><td>${p.status}</td><td>${p.banned ? "Sim" : "Não"}</td><td>
          <button data-a="warn" data-id="${p.id}" data-nick="${esc(p.nick)}">Advertir</button>
          ${p.banned ? `<button data-a="unban" data-id="${p.id}">Desbanir</button>` : `<button data-a="ban" data-id="${p.id}" data-nick="${esc(p.nick)}">Banir</button>`}
        </td></tr>`).join("")}</table>`;
        content.querySelectorAll("button").forEach(b => b.onclick = async () => {
          const id = b.dataset.id;
          if (b.dataset.a === "warn") {
            const reason = prompt("Motivo do aviso:");
            if (reason === null) return;
            await api("/api/staff/players/" + id + "/warn", { method: "POST", body: JSON.stringify({ reason }) });
            alert("Aviso registrado");
          } else if (b.dataset.a === "ban") {
            const reason = prompt("Motivo do ban:");
            if (reason === null) return;
            await api("/api/staff/players/" + id + "/ban", { method: "POST", body: JSON.stringify({ reason }) });
            showTab("players");
          } else if (b.dataset.a === "unban") {
            await api("/api/staff/players/" + id + "/unban", { method: "POST" });
            showTab("players");
          }
        });
      } else if (tab === "access") {
        const list = await api("/api/staff/access-requests");
        content.innerHTML = `<table><tr><th>Nick</th><th>Motivo</th><th>Status</th><th></th></tr>${list.map(r => `<tr><td>${esc(r.nick)}</td><td>${esc(r.reason)}</td><td>${r.status}</td><td>${r.status === "pending" ? `<button data-a="apr" data-id="${r.id}">Aprovar</button> <button data-a="rej" data-id="${r.id}">Recusar</button>` : ""}</td></tr>`).join("")}</table>`;
        content.querySelectorAll("button").forEach(b => b.onclick = async () => {
          const id = b.dataset.id;
          if (b.dataset.a === "apr") await api("/api/staff/access-requests/" + id + "/approve", { method: "POST" });
          else await api("/api/staff/access-requests/" + id + "/reject", { method: "POST" });
          showTab("access");
        });
      } else if (tab === "reports") {
        const list = await api("/api/staff/reports");
        content.innerHTML = `<table><tr><th>Denunciante</th><th>Denunciado</th><th>Motivo</th><th>Status</th><th></th></tr>${list.map(r => `<tr><td>${esc(r.reporter)}</td><td>${esc(r.reported)}</td><td>${esc(r.reason)}</td><td>${r.status}</td><td>${r.status === "open" ? `<button data-id="${r.id}">Resolver</button>` : ""}</td></tr>`).join("")}</table>`;
        content.querySelectorAll("button").forEach(b => b.onclick = async () => {
          await api("/api/staff/reports/" + b.dataset.id + "/resolve", { method: "POST" });
          showTab("reports");
        });
      } else if (tab === "rules") {
        const rules = await api("/api/staff/rules");
        content.innerHTML = `<button class="pill" id="newrule">Nova regra</button><div id="rulesed"></div>`;
        const ed = $("#rulesed");
        ed.innerHTML = rules.map(r => `<div class="rl"><i>${r.order}</i><div style="flex:1"><b>${esc(r.title)}</b><br><small>${esc(r.body)}</small></div><button data-id="${r.id}">Excluir</button></div>`).join("");
        ed.querySelectorAll("button").forEach(b => b.onclick = async () => {
          await api("/api/staff/rules/" + b.dataset.id, { method: "DELETE" });
          showTab("rules");
        });
        $("#newrule").onclick = async () => {
          const title = prompt("Título:");
          if (!title) return;
          const body = prompt("Texto:");
          if (body === null) return;
          await api("/api/staff/rules", { method: "POST", body: JSON.stringify({ title, body, order: 0 }) });
          showTab("rules");
        };
      } else if (tab === "quiz") {
        const qs = await api("/api/staff/quiz");
        content.innerHTML = `<button class="pill" id="newquiz">Nova pergunta</button><div>${qs.map(q => `<div class="rl"><i>?</i><div style="flex:1"><b>${esc(q.question)}</b><br><small>${q.options.join(" | ")}</small></div><button data-id="${q.id}">Excluir</button></div>`).join("")}</div>`;
        content.querySelectorAll("button[data-id]").forEach(b => b.onclick = async () => {
          await api("/api/staff/quiz/" + b.dataset.id, { method: "DELETE" });
          showTab("quiz");
        });
        $("#newquiz").onclick = async () => {
          const question = prompt("Pergunta:");
          if (!question) return;
          const opts = prompt("Opções separadas por vírgula:");
          if (opts === null) return;
          const answer = prompt("Índice da resposta correta (0-based):");
          if (answer === null) return;
          await api("/api/staff/quiz", { method: "POST", body: JSON.stringify({ question, options: opts.split(",").map(s => s.trim()), answer: parseInt(answer, 10) }) });
          showTab("quiz");
        };
      } else if (tab === "ann") {
        const items = await api("/api/staff/announcements");
        content.innerHTML = `<button class="pill" id="newann">Novo anúncio</button><div>${items.map(a => `<div class="rl"><i>📢</i><div style="flex:1"><b>${esc(a.title)}</b><br><small>${esc(a.body)}</small></div><button data-id="${a.id}">Excluir</button></div>`).join("")}</div>`;
        content.querySelectorAll("button[data-id]").forEach(b => b.onclick = async () => {
          await api("/api/staff/announcements/" + b.dataset.id, { method: "DELETE" });
          showTab("ann");
        });
        $("#newann").onclick = async () => {
          const title = prompt("Título:");
          if (!title) return;
          const body = prompt("Texto:");
          if (body === null) return;
          await api("/api/staff/announcements", { method: "POST", body: JSON.stringify({ title, body }) });
          showTab("ann");
        };
      } else if (tab === "logs") {
        const logs = await api("/api/staff/audit-logs");
        content.innerHTML = `<table><tr><th>Quando</th><th>Staff</th><th>Ação</th><th>Alvo</th></tr>${logs.map(l => `<tr><td>${new Date(l.createdAt).toLocaleString("pt-BR")}</td><td>${esc(l.staff || "")}</td><td>${esc(l.action)}</td><td>${esc(l.target)}</td></tr>`).join("")}</table>`;
      } else if (tab === "invites") {
        content.innerHTML = `<button class="pill" id="newinvite">Gerar código de convite</button><div id="inviteres"></div>`;
        $("#newinvite").onclick = async () => {
          const r = await api("/api/staff/invite-codes", { method: "POST" });
          $("#inviteres").textContent = "Código: " + r.code;
        };
      }
    }
    panel.querySelectorAll("button[data-tab]").forEach(b => b.onclick = () => showTab(b.dataset.tab));
    showTab("players");
  },
});

// ---------- Desktop core ----------
function openApp(k) {
  const a = apps[k];
  const ex = document.querySelector(`.win[data-k="${k}"]`);
  if (ex) { ex.classList.remove("hide"); front(ex); return; }
  const w = document.createElement("div");
  w.className = "win"; w.dataset.k = k;
  w.style.left = (60 + n * 28) % 200 + 90 + "px";
  w.style.top = (20 + n * 28) % 120 + 20 + "px";
  n++;
  w.innerHTML = `<header><span>${a.i} ${a.t}</span><button data-a="min" aria-label="Minimizar">–</button><button data-a="x" aria-label="Fechar">×</button></header><div class="body">${a.h()}</div>`;
  $("#area").append(w);
  front(w);
  if (a.go) a.go();
  const t = document.createElement("button");
  t.innerHTML = a.i + " " + a.t;
  t.dataset.k = k;
  t.onclick = () => {
    const hid = w.classList.contains("hide");
    if (hid) { w.classList.remove("hide"); front(w); }
    else if (w.style.zIndex == z) w.classList.add("hide");
    else front(w);
  };
  $("#tasks").append(t);
  w.querySelector("[data-a=min]").onclick = () => w.classList.add("hide");
  w.querySelector("[data-a=x]").onclick = () => { w.remove(); t.remove(); };
  w.onpointerdown = () => front(w);
  const h = w.querySelector("header");
  let ox, oy, d = 0;
  h.onpointerdown = (e) => { if (e.target.tagName === "BUTTON") return; d = 1; ox = e.clientX - w.offsetLeft; oy = e.clientY - w.offsetTop; h.setPointerCapture(e.pointerId); };
  h.onpointermove = (e) => { if (d) { w.style.left = Math.max(0, e.clientX - ox) + "px"; w.style.top = Math.max(0, e.clientY - oy) + "px"; } };
  h.onpointerup = () => d = 0;
}

function front(w) {
  w.style.zIndex = ++z;
  $$("#tasks button").forEach(b => b.classList.toggle("on", b.dataset.k === w.dataset.k));
}

function build() {
  const ks = Object.keys(apps).filter(k => !(apps[k].s) || staff);
  $("#icons").innerHTML = ks.map(k => `<button class="ic" data-k="${k}"><b>${apps[k].i}</b>${apps[k].t}</button>`).join("");
  $("#menu").innerHTML = ks.map(k => `<button data-k="${k}">${apps[k].i}  ${apps[k].t}</button>`).join("") + `<button id="out">Sair</button>`;
  $$(".ic,#menu [data-k]").forEach(b => b.onclick = () => { openApp(b.dataset.k); $("#menu").classList.add("hide"); });
  $("#out").onclick = logout;
}

async function logout() {
  if (!staff) {
    try {
      const layout = {};
      $$(".win").forEach(w => { layout[w.dataset.k] = { left: w.style.left, top: w.style.top }; });
      await api("/api/users/me", { method: "PUT", body: JSON.stringify({ windowLayout: layout }) }).catch(() => {});
    } catch {}
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  } else {
    await api("/api/staff/auth/logout", { method: "POST" }).catch(() => {});
  }
  if (socket) socket.disconnect();
  $("#desk").classList.add("hide");
  $("#login").classList.remove("hide");
  $$(".win,#tasks button").forEach(e => e.remove());
  $("#menu").classList.add("hide");
  staff = false; user = ""; staffUser = "";
}

$("#start").onclick = () => $("#menu").classList.toggle("hide");

function tick() {
  $("#clock").textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
setInterval(tick, 30000);

// ---------- Socket ----------
function connectSocket() {
  socket = io({ withCredentials: true });
  socket.on("connect", () => {});
  socket.on("presence", (p) => {
    // could update UI
  });
}

// ---------- Boot check session ----------
(async () => {
  try {
    const me = await api("/api/auth/me");
    user = me.nick;
    await showLoader(600);
    bootDesktop();
    return;
  } catch {}
  try {
    const s = await api("/api/staff/auth/me");
    staff = true; staffUser = s.username; user = s.username;
    await showLoader(600);
    bootDesktop();
    return;
  } catch {}
})();
