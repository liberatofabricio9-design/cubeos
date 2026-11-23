const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let staff = false;
let user = "";
let staffUser = "";
const I = (p) => `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'>${p}</svg>`;
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
      const s = me.settings || {};
      if (s.wallpaper) { const area = $("#area"); area.style.backgroundImage = `url(${s.wallpaper})`; area.style.backgroundSize = "cover"; area.style.backgroundPosition = "center"; }
    }
  } catch {}
}

// ---------- Desktop ----------
const apps = {};
function registerApp(k, def) { apps[k] = def; }

registerApp("msg", {
  i: I(`<path d='M4 5h16v11H9l-5 4z'/>`), t: "Transmissões",
  h: () => `<div class="app"><div class="sb" id="msgsb"><h4>Sinais</h4><div class="ch on" data-ch="geral">Sinal 01</div><div class="ch" data-ch="construcoes">Sinal 02</div><div class="ch" data-ch="trocas">Sinal 03</div><h4>Diretas</h4><div id="msgusers"></div></div><div class="main"><div class="top"><b id="mt">Sinal 01</b><span id="monline"></span></div><div class="feed" id="ms"></div><div class="compose"><input type="text" id="mi" placeholder="Escreva algo..."><button id="mb">Enviar</button></div></div></div>`,
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
  i: I(`<rect x='3' y='8' width='18' height='9' rx='4'/><path d='M8 11v3M6.5 12.5h3M16 12h.01M18 13.500h.01'/>`), t: "Biblioteca",
  h: () => `<div class="path">Biblioteca - 4 itens encontrados</div><div class="grid" style="padding:14px" id="gamesgrid"></div>`,
  go: async () => {
    const grid = $("#gamesgrid");
    grid.innerHTML = `<div class="gc"><div class="ban">${I(`<path d='M4 4h16v16H4zM4 10h10M10 14h10M10 4v6'/>`)}</div><div class="in"><b>Registros</b><small>Top sujeitos</small><button data-g="ranking">Ver</button></div></div>
      <div class="gc"><div class="ban">${I(`<rect x='4' y='4' width='7' height='7'/><rect x='13' y='13' width='7' height='7'/>`)}</div><div class="in"><b>Teste de Sincronização</b><small>Responda e avance</small><button data-g="quiz">Jogar</button></div></div>
      <div class="gc"><div class="ban">${I(`<circle cx='12' cy='12' r='3'/><path d='M2 12c4-6 16-6 20 0-4 6-16 6-20 0z'/>`)}</div><div class="in"><b>Sorteio</b><small>Prêmios semanais</small><button data-g="raffle">Ver</button></div></div>
      <div class="gc"><div class="ban">${I(`<circle cx='12' cy='13' r='8'/><path d='M12 9v4l3 2M9 2h6'/>`)}</div><div class="in"><b>Coleta</b><small>Clique e evolua</small><button data-g="minerador">Jogar</button></div></div>`;
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
  i: I(`<circle cx='12' cy='12' r='9'/><circle cx='12' cy='12' r='4'/><path d='M12 12l6-6'/>`), t: "Radar",
  h: () => `<div style="height:100%"><iframe id="mapframe" style="width:100%;height:350px;border:0" src=""></iframe><div class="path" id="mappath">Origem: desconhecida - Distância: indefinida</div></div>`,
  go: async () => {
    try {
      const c = await api("/api/map/config");
      const f = $("#mapframe");
      if (c.url) f.src = c.url; else f.srcdoc = "<div style='color:#f4ece4;padding:20px;background:#000'>Configure MAP_URL no .env</div>";
    } catch {}
  },
});

registerApp("rules", {
  i: I(`<path d='M7 3h8l4 4v14H7z'/><path d='M15 3v4h4M10 12h6M10 16h6'/>`), t: "Protocolo",
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
  i: I(`<circle cx='12' cy='8' r='4'/><path d='M4 21c1-5 15-5 16 0'/>`), t: "Sujeito",
  h: () => `<div class="ban2"></div><div class="prof"><div class="av">${I(`<circle cx='12' cy='8' r='4'/><path d='M4 21c1-5 15-5 16 0'/>`)}</div><h3 style="margin:8px 0 0" id="uname"></h3><small style="color:var(--mut)" id="usince"></small><div style="margin-top:12px" id="uxp"></div><div class="stats" style="margin-top:12px" id="ustats"></div><div id="utags"></div><div style="margin-top:12px"><button class="go" id="editbio">Editar registro</button></div></div>`,
  go: async () => {
    if (staff) {
      $("#uname").textContent = staffUser + " (Staff)";
      return;
    }
    try {
      const me = await api("/api/users/me");
      $("#uname").textContent = me.nick;
      $("#usince").textContent = "Sob observação desde " + new Date(me.createdAt).toLocaleDateString("pt-BR");
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
  i: I(`<circle cx='12' cy='12' r='3'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2'/>`), t: "Ajustes",
  h: () => `<div class="app"><div class="sb"><div class="ch on">Aparência</div><div class="ch">Sinal</div><div class="ch">Privacidade</div><div class="ch">Conta</div></div><div class="main" style="padding:16px" id="setmain"></div></div>`,
  go: async () => {
    const main = $("#setmain");
    let settings = {};
    try { settings = await api("/api/settings"); } catch {}
    main.innerHTML = `<b>Cor de destaque</b><div class="sw2">${["#ff7a1a", "#ff4d6d", "#3ddc84", "#4da3ff", "#b66bff"].map(c => `<button data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join("")}</div>
      <div class="row">Notificações<button class="sw ${settings.notifications !== false ? "on" : ""}" data-k="notifications"></button></div>
      <div class="row">Sons do sistema<button class="sw ${settings.sounds ? "on" : ""}" data-k="sounds"></button></div>
      <div class="row">Mostrar status online<button class="sw ${settings.onlineStatus !== false ? "on" : ""}" data-k="onlineStatus"></button></div>
      <hr style="border-color:var(--line);margin:16px 0">
      <b>Papel de parede</b>
      <div style="display:flex;gap:6px;margin-top:8px">
        <input type="file" id="wpfile" accept="image/*">
        <button class="pill" id="wpapply">Aplicar</button>
        <button class="pill" id="wpclear">Padrão</button>
      </div>
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
    const applyWp = (dataUrl) => {
      const area = $("#area");
      if (dataUrl) { area.style.backgroundImage = `url(${dataUrl})`; area.style.backgroundSize = "cover"; area.style.backgroundPosition = "center"; }
      else { area.style.backgroundImage = ""; }
    };
    if (settings.wallpaper) applyWp(settings.wallpaper);
    $("#wpapply").onclick = () => {
      const f = $("#wpfile").files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => { settings.wallpaper = r.result; applyWp(r.result); $("#wpapply").textContent = "Aplicado!"; };
      r.readAsDataURL(f);
    };
    $("#wpclear").onclick = () => { settings.wallpaper = ""; applyWp(""); $("#wpclear").textContent = "Padrão"; };
    $("#saveset").onclick = async () => {
      const s = {};
      main.querySelectorAll(".sw").forEach(b => { s[b.dataset.k] = b.classList.contains("on"); });
      if (settings.wallpaper) s.wallpaper = settings.wallpaper;
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
  i: I(`<path d='M3 6h7l2 2h9v11H3z'/>`), t: "Arquivos",
  h: () => `<div class="path">CubeOS / Arquivos</div><div style="padding:10px"><input type="file" id="fileinput"><button class="pill" id="uploadbtn">Upload</button></div><div id="filelist"></div>`,
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
  i: I(`<path d='M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z'/>`), t: "Painel",
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

// ---------- Extra PC apps ----------
registerApp("calc", {
  i: I(`<rect x='4' y='4' width='16' height='16' rx='2'/><path d='M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h8'/>`), t: "Calculadora",
  h: () => `<div style="padding:14px;max-width:260px;margin:0 auto">
    <input id="calcdisp" readonly style="width:100%;padding:10px;font-size:20px;text-align:right;background:#000;border:1px solid var(--line);border-radius:8px;margin-bottom:8px">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
      ${["7","8","9","/","4","5","6","*","1","2","3","-","0",".","=","+"].map(k=>`<button class="pill" data-k="${k}" style="padding:12px;font-size:16px">${k}</button>`).join("")}
      <button class="pill" data-k="C" style="grid-column:span 4;padding:8px">Limpar</button>
    </div></div>`,
  go: () => {
    const disp = $("#calcdisp");
    let expr = "";
    document.querySelectorAll("#calcdisp ~ div button").forEach(b => b.onclick = () => {
      const k = b.dataset.k;
      if (k === "C") { expr = ""; disp.value = ""; }
      else if (k === "=") { try { disp.value = Function("return " + expr)(); expr = disp.value; } catch { disp.value = "Erro"; expr = ""; } }
      else { expr += k; disp.value = expr; }
    });
  },
});

registerApp("notepad", {
  i: I(`<path d='M7 3h8l4 4v14H7z'/><path d='M15 3v4h4M10 10h6M10 14h6M10 18h4'/>`), t: "Bloco de Notas",
  h: () => `<div style="padding:10px;height:100%;display:flex;flex-direction:column">
    <div style="display:flex;gap:6px;margin-bottom:6px">
      <input id="npname" placeholder="nome do arquivo" style="flex:1;padding:6px;background:#000;border:1px solid var(--line);border-radius:6px">
      <button class="pill" id="npsave">Salvar</button>
      <button class="pill" id="npload">Carregar</button>
    </div>
    <textarea id="np" style="flex:1;width:100%;background:#000;color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:10px;font:14px/1.5 monospace;resize:none"></textarea></div>`,
  go: async () => {
    const ta = $("#np");
    $("#npsave").onclick = async () => {
      const name = $("#npname").value.trim() || "nota.txt";
      const blob = new Blob([ta.value], { type: "text/plain" });
      const fd = new FormData(); fd.append("file", blob, name);
      const ct = getCookie("csrf_token");
      const r = await fetch("/api/files/upload", { method: "POST", credentials: "include", headers: { "X-CSRF-Token": ct }, body: fd });
      if (r.ok) $("#npsave").textContent = "Salvo!"; else $("#npsave").textContent = "Erro";
    };
    $("#npload").onclick = async () => {
      const files = await api("/api/files").catch(()=>[]);
      if (!files.length) { alert("Nenhum arquivo"); return; }
      const name = prompt("Nome do arquivo para carregar:");
      const f = files.find(x => x.filename === name);
      if (!f) { alert("Não encontrado"); return; }
      const r = await fetch(f.path, { credentials: "include" });
      ta.value = await r.text();
    };
  },
});

registerApp("browser", {
  i: I(`<circle cx='12' cy='12' r='9'/><path d='M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18'/>`), t: "Navegador",
  h: () => `<div style="padding:10px;height:100%;display:flex;flex-direction:column">
    <div style="display:flex;gap:6px;margin-bottom:6px">
      <input id="brurl" placeholder="https://..." style="flex:1;padding:6px;background:#000;border:1px solid var(--line);border-radius:6px">
      <button class="pill" id="brgo">Ir</button>
    </div>
    <iframe id="brframe" style="flex:1;width:100%;border:1px solid var(--line);border-radius:8px;background:#fff"></iframe></div>`,
  go: () => {
    $("#brgo").onclick = () => { let u = $("#brurl").value.trim(); if (!u.startsWith("http")) u = "https://" + u; $("#brframe").src = u; };
    $("#brurl").onkeydown = (e) => e.key === "Enter" && $("#brgo").click();
  },
});

registerApp("clock", {
  i: I(`<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/>`), t: "Relógio",
  h: () => `<div style="padding:20px;text-align:center">
    <div id="clockbig" style="font-size:48px;font-family:monospace;color:var(--or)"></div>
    <div id="clockdate" style="color:var(--mut);margin-top:8px"></div>
    <div style="margin-top:16px"><button class="pill" id="clocktimer">Iniciar cronômetro</button> <span id="timer" style="margin-left:8px;font-family:monospace">00:00</span></div></div>`,
  go: () => {
    const tick = () => { const d = new Date(); $("#clockbig").textContent = d.toLocaleTimeString("pt-BR"); $("#clockdate").textContent = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); };
    tick(); setInterval(tick, 1000);
    let t0 = null, iv = null;
    $("#clocktimer").onclick = () => {
      if (iv) { clearInterval(iv); iv = null; $("#clocktimer").textContent = "Iniciar cronômetro"; return; }
      t0 = Date.now(); $("#clocktimer").textContent = "Parar";
      iv = setInterval(() => { const s = Math.floor((Date.now()-t0)/1000); $("#timer").textContent = String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); }, 500);
    };
  },
});

registerApp("trash", {
  i: I(`<path d='M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'/>`), t: "Lixeira",
  h: () => `<div style="padding:14px"><p class="muted">Arquivos excluídos aparecem aqui.</p><div id="trashlist"></div><button class="pill" id="trashclear" style="margin-top:10px">Esvaziar</button></div>`,
  go: async () => {
    const list = $("#trashlist");
    list.innerHTML = "<p class=muted>Função em desenvolvimento.</p>";
    $("#trashclear").onclick = () => { list.innerHTML = "<p class=muted>Lixeira vazia.</p>"; };
  },
});

// ---------- More PC apps ----------
registerApp("paint", {
  i: I(`<path d='M4 20h16M7 17l10-10 2 2-10 10H7z'/>`), t: "Paint",
  h: () => `<div style="padding:10px;height:100%;display:flex;flex-direction:column">
    <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
      <input type="color" id="pcolor" value="#ff7a1a">
      <input type="range" id="psize" min="1" max="20" value="4" style="accent-color:var(--or)">
      <button class="pill" id="pclear">Limpar</button>
      <button class="pill" id="psave">Salvar</button>
    </div>
    <canvas id="pcanvas" width="600" height="320" style="flex:1;border:1px solid var(--line);border-radius:8px;background:#fff;cursor:crosshair;touch-action:none"></canvas></div>`,
  go: () => {
    const c = $("#pcanvas"); const ctx = c.getContext("2d");
    let drawing = false;
    const color = () => $("#pcolor").value;
    const size = () => parseInt($("#psize").value,10);
    const pos = (e) => { const r = c.getBoundingClientRect(); return { x: (e.clientX-r.left)*(c.width/r.width), y: (e.clientY-r.top)*(c.height/r.height) }; };
    c.onpointerdown = (e) => { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); };
    c.onpointermove = (e) => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x,p.y); ctx.strokeStyle = color(); ctx.lineWidth = size(); ctx.lineCap = "round"; ctx.stroke(); };
    c.onpointerup = () => drawing = false;
    $("#pclear").onclick = () => ctx.clearRect(0,0,c.width,c.height);
    $("#psave").onclick = () => { const a = document.createElement("a"); a.href = c.toDataURL(); a.download = "desenho.png"; a.click(); };
  },
});

registerApp("calendar", {
  i: I(`<rect x='3' y='5' width='18' height='16' rx='2'/><path d='M3 10h18M8 3v4M16 3v4'/>`), t: "Calendário",
  h: () => `<div style="padding:14px"><div id="calhead" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><button class="pill" id="calprev">◀</button><b id="caltitle"></b><button class="pill" id="calnext">▶</button></div><div id="calgrid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center"></div></div>`,
  go: () => {
    let d = new Date();
    const render = () => {
      const y = d.getFullYear(), m = d.getMonth();
      $("#caltitle").textContent = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      const first = new Date(y,m,1).getDay();
      const days = new Date(y,m+1,0).getDate();
      const grid = $("#calgrid");
      grid.innerHTML = ["D","S","T","Q","Q","S","S"].map(x=>`<div style="color:var(--mut);font-size:12px">${x}</div>`).join("");
      for (let i=0;i<first;i++) grid.insertAdjacentHTML("beforeend","<div></div>");
      const today = new Date();
      for (let day=1;day<=days;day++) {
        const isToday = today.getFullYear()===y && today.getMonth()===m && today.getDate()===day;
        grid.insertAdjacentHTML("beforeend", `<div style="padding:6px;border-radius:6px;${isToday?"background:var(--or);color:#000;font-weight:700":""}">${day}</div>`);
      }
    };
    render();
    $("#calprev").onclick = () => { d.setMonth(d.getMonth()-1); render(); };
    $("#calnext").onclick = () => { d.setMonth(d.getMonth()+1); render(); };
  },
});

registerApp("contacts", {
  i: I(`<path d='M4 6h16v13H4z'/><circle cx='12' cy='11' r='3'/><path d='M8 17c1-2 7-2 8 0'/>`), t: "Contatos",
  h: () => `<div style="padding:14px">
    <div style="display:flex;gap:6px;margin-bottom:8px"><input id="cname" placeholder="Nome" style="flex:1;padding:6px;background:#000;border:1px solid var(--line);border-radius:6px"><input id="cphone" placeholder="Telefone" style="flex:1;padding:6px;background:#000;border:1px solid var(--line);border-radius:6px"><button class="pill" id="cadd">Adicionar</button></div>
    <div id="clist"></div></div>`,
  go: () => {
    const key = "cubeos_contacts";
    const load = () => JSON.parse(localStorage.getItem(key) || "[]");
    const save = (d) => localStorage.setItem(key, JSON.stringify(d));
    const render = () => {
      const d = load();
      $("#clist").innerHTML = d.map((c,i)=>`<div class="fr"><span>👤</span><span>${esc(c.name)}</span><small>${esc(c.phone)}</small><button data-i="${i}">Excluir</button></div>`).join("") || "<p class=muted>Nenhum contato.</p>";
      $("#clist").querySelectorAll("button").forEach(b=>b.onclick=()=>{const d=load(); d.splice(parseInt(b.dataset.i,10),1); save(d); render();});
    };
    $("#cadd").onclick = () => {
      const name = $("#cname").value.trim(); const phone = $("#cphone").value.trim();
      if (!name) return;
      const d = load(); d.push({name,phone}); save(d); $("#cname").value=""; $("#cphone").value=""; render();
    };
    render();
  },
});

registerApp("imgview", {
  i: I(`<rect x='3' y='3' width='18' height='18' rx='2'/><circle cx='8.5' cy='8.5' r='1.5'/><path d='M21 15l-5-5L5 21'/>`), t: "Visualizador",
  h: () => `<div style="padding:14px;height:100%;display:flex;flex-direction:column">
    <input type="file" id="imgfile" accept="image/*" style="margin-bottom:8px">
    <div style="flex:1;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px;overflow:auto;background:#000">
      <img id="imgpreview" style="max-width:100%;max-height:100%">
    </div></div>`,
  go: () => {
    $("#imgfile").onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader(); r.onload = () => $("#imgpreview").src = r.result; r.readAsDataURL(f);
    };
  },
});

registerApp("media", {
  i: I(`<circle cx='12' cy='12' r='9'/><path d='M10 8l6 4-6 4z'/>`), t: "Player de Mídia",
  h: () => `<div style="padding:14px">
    <input id="mediaurl" placeholder="URL de áudio/vídeo" style="width:100%;padding:6px;background:#000;border:1px solid var(--line);border-radius:6px;margin-bottom:8px">
    <video id="mediavid" controls style="width:100%;max-height:240px;border-radius:8px;background:#000"></video>
    <audio id="mediaaud" controls style="width:100%;margin-top:8px"></audio>
    <div style="margin-top:8px;display:flex;gap:6px">
      <button class="pill" id="mediaload">Carregar</button>
      <input type="file" id="mediafile" accept="audio/*,video/*">
    </div></div>`,
  go: () => {
    $("#mediaload").onclick = () => { const u = $("#mediaurl").value.trim(); $("#mediavid").src = u; $("#mediaaud").src = u; };
    $("#mediafile").onchange = (e) => { const f = e.target.files[0]; if (!f) return; const u = URL.createObjectURL(f); $("#mediavid").src = u; $("#mediaaud").src = u; };
  },
});

registerApp("taskmgr", {
  i: I(`<rect x='3' y='4' width='18' height='16' rx='2'/><path d='M3 9h18M8 4v5M16 4v5'/>`), t: "Gerenciador de Tarefas",
  h: () => `<div style="padding:14px"><table id="tasktbl"><tr><th>Processo</th><th>CPU</th><th>Memória</th><th></th></tr></table></div>`,
  go: () => {
    const procs = [
      { name: "CubeOS Shell", cpu: "0.1%", mem: "12 MB" },
      { name: "Transmissões", cpu: "0.3%", mem: "24 MB" },
      { name: "Radar", cpu: "0.2%", mem: "18 MB" },
      { name: "Navegador", cpu: "1.2%", mem: "86 MB" },
      { name: "Paint", cpu: "0.0%", mem: "8 MB" },
    ];
    const tbl = $("#tasktbl");
    tbl.innerHTML = "<tr><th>Processo</th><th>CPU</th><th>Memória</th><th></th></tr>" + procs.map((p,i)=>`<tr><td>${esc(p.name)}</td><td>${p.cpu}</td><td>${p.mem}</td><td><button data-i="${i}">Encerrar</button></td></tr>`).join("");
    tbl.querySelectorAll("button").forEach(b => b.onclick = () => { b.closest("tr").remove(); });
  },
});

registerApp("sysinfo", {
  i: I(`<rect x='4' y='4' width='16' height='16' rx='2'/><path d='M8 8h8M8 12h8M8 16h5'/>`), t: "Sistema",
  h: () => `<div style="padding:14px" id="sysinfo"></div>`,
  go: () => {
    const info = [
      ["Sistema", "CubeOS"],
      ["Versão", "1.0.0"],
      ["Navegador", navigator.userAgent.split(" ").slice(-1)[0]],
      ["Plataforma", navigator.platform],
      ["Idioma", navigator.language],
      ["Resolução", screen.width + "x" + screen.height],
      ["Memória (JS heap)", (performance.memory ? (performance.memory.usedJSHeapSize/1048576).toFixed(1) + " MB" : "n/d")],
      ["Online", navigator.onLine ? "Sim" : "Não"],
    ];
    $("#sysinfo").innerHTML = info.map(([k,v])=>`<div class="row"><span>${esc(k)}</span><span style="color:var(--mut)">${esc(v)}</span></div>`).join("");
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
  w.innerHTML = `<header><span>${a.i} ${a.t}</span><button data-a="min" aria-label="Minimizar">–</button><button data-a="max" aria-label="Maximizar">□</button><button data-a="x" aria-label="Fechar">×</button></header><div class="body">${a.h()}</div><div class="resize" style="position:absolute;right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize"></div>`;
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
  w.querySelector("[data-a=max]").onclick = () => {
    if (w.dataset.maxed === "1") { w.style.left = w.dataset.prevLeft; w.style.top = w.dataset.prevTop; w.style.width = w.dataset.prevWidth; w.style.height = w.dataset.prevHeight; w.dataset.maxed = "0"; }
    else { w.dataset.prevLeft = w.style.left; w.dataset.prevTop = w.style.top; w.dataset.prevWidth = w.style.width; w.dataset.prevHeight = w.style.height; w.style.left = "0px"; w.style.top = "0px"; w.style.width = "100%"; w.style.height = "calc(100% - 40px)"; w.dataset.maxed = "1"; }
  };
  w.querySelector("[data-a=x]").onclick = () => { w.remove(); t.remove(); };
  // resize
  const rz = w.querySelector(".resize");
  let resizing = false, sx, sy, sw, sh;
  rz.onpointerdown = (e) => { resizing = true; sx = e.clientX; sy = e.clientY; sw = w.offsetWidth; sh = w.offsetHeight; rz.setPointerCapture(e.pointerId); e.stopPropagation(); };
  rz.onpointermove = (e) => { if (resizing) { w.style.width = Math.max(260, sw + (e.clientX - sx)) + "px"; w.style.height = Math.max(180, sh + (e.clientY - sy)) + "px"; } };
  rz.onpointerup = () => resizing = false;
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
