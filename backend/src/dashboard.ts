export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Job Hunt OS — Mail tracker</title>
  <style>
    :root { font-family: ui-sans-serif, system-ui, sans-serif; color: #102026; background: #f4f1ea; }
    body { margin: 0; }
    main { max-width: 980px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { font-size: 1.6rem; margin: 0 0 6px; }
    .sub { color: #4b5b61; margin-bottom: 24px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
    .card { background: #fff; border-radius: 12px; padding: 16px 18px; box-shadow: 0 1px 0 rgba(16,32,38,.06); flex: 1; min-width: 160px; }
    .card h2 { font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; color: #6a7a80; margin: 0 0 8px; }
    .num { font-size: 1.8rem; font-weight: 650; }
    button, .btn { background: #143d3a; color: #fff; border: 0; border-radius: 8px; padding: 10px 14px; cursor: pointer; text-decoration: none; display: inline-block; font: inherit; }
    button.secondary { background: #d9e2e0; color: #143d3a; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #ece7dc; font-size: .92rem; vertical-align: top; }
    th { font-size: .75rem; text-transform: uppercase; color: #6a7a80; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #e8efe8; font-size: .75rem; }
    .pill.rejection { background: #f8d7d3; }
    .pill.interview_invite, .pill.recruiter_screen, .pill.interview_reschedule { background: #d7e8f8; }
    .pill.offer { background: #d9f2d4; }
    .muted { color: #6a7a80; font-size: .85rem; }
    .banner { background: #143d3a; color: #fff; padding: 10px 20px; }
    .err { background: #7a1f16; }
  </style>
</head>
<body>
  <div id="banner" class="banner" hidden></div>
  <main>
    <h1>Application mail tracker</h1>
    <p class="sub">Gmail is read on the backend. Classification uses rules first, then <code id="model">gpt-4o-mini</code> when needed. The Swift app syncs the same data.</p>
    <div class="row">
      <div class="card"><h2>Applications</h2><div class="num" id="appCount">0</div></div>
      <div class="card"><h2>Needs review</h2><div class="num" id="pendingCount">0</div></div>
      <div class="card"><h2>Gmail</h2><div id="gmailState" class="muted">Checking…</div></div>
    </div>
    <div class="row">
      <a class="btn" href="/api/mail/google/start" id="connectBtn">Connect Gmail</a>
      <button type="button" id="syncBtn">Sync mail now</button>
      <button type="button" class="secondary" id="demoBtn">Load demo inbox</button>
    </div>
    <p class="muted" id="hint"></p>
    <h2>Pipeline</h2>
    <div class="row" id="statusCards"></div>
    <h2>Mail events</h2>
    <table>
      <thead><tr><th>When</th><th>Type</th><th>From / subject</th><th>Company</th><th></th></tr></thead>
      <tbody id="events"></tbody>
    </table>
  </main>
  <script>
    const $ = (id) => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    if (params.get("mail") === "connected") {
      $("banner").hidden = false;
      $("banner").textContent = "Gmail connected. Click Sync mail now.";
    }
    if (params.get("mail_error")) {
      $("banner").hidden = false;
      $("banner").classList.add("err");
      $("banner").textContent = "Gmail connect failed: " + params.get("mail_error");
    }

    async function refresh() {
      const [status, stats, events] = await Promise.all([
        fetch("/api/mail/status").then((r) => r.json()),
        fetch("/api/applications/stats").then((r) => r.json()),
        fetch("/api/mail/events").then((r) => r.json()),
      ]);
      $("model").textContent = status.openaiModel;
      $("appCount").textContent = stats.totals.applications;
      $("pendingCount").textContent = status.pendingReview;
      if (status.accounts.length) {
        const a = status.accounts[0];
        $("gmailState").innerHTML = a.email + (a.lastSyncAt ? "<br>Last sync " + new Date(a.lastSyncAt).toLocaleString() : "");
        $("connectBtn").textContent = "Reconnect Gmail";
      } else {
        $("gmailState").textContent = status.googleConfigured ? "Not connected" : "OAuth keys not set — use demo inbox";
      }
      $("hint").textContent = status.openaiConfigured
        ? "OpenAI is on. Low-confidence mail is classified with " + status.openaiModel + "."
        : "No OPENAI_API_KEY. High-signal mail still classifies with deterministic rules.";
      const cards = $("statusCards");
      cards.innerHTML = "";
      for (const [k, v] of Object.entries(stats.byStatus)) {
        const el = document.createElement("div");
        el.className = "card";
        el.innerHTML = "<h2>" + k + "</h2><div class='num'>" + v + "</div>";
        cards.appendChild(el);
      }
      const body = $("events");
      body.innerHTML = "";
      for (const ev of events.events) {
        const tr = document.createElement("tr");
        const when = ev.receivedAt ? new Date(ev.receivedAt).toLocaleString() : "";
        const actions = ev.reviewState === "pending"
          ? "<button data-id='"+ev.id+"' data-act='confirm'>Confirm</button> <button class='secondary' data-id='"+ev.id+"' data-act='ignore'>Ignore</button>"
          : "<span class='muted'>"+ev.reviewState+"</span>";
        tr.innerHTML = "<td class='muted'>"+when+"</td><td><span class='pill "+ev.classification+"'>"+ev.classification+"</span></td><td>"+(ev.subject||"")+"<div class='muted'>"+(ev.fromAddress||"")+"</div></td><td>"+(ev.company||"—")+"</td><td>"+actions+"</td>";
        body.appendChild(tr);
      }
    }

    $("syncBtn").onclick = async () => {
      $("syncBtn").disabled = true;
      const res = await fetch("/api/mail/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) alert(data.error || "Sync failed");
      $("syncBtn").disabled = false;
      await refresh();
    };

    const demos = [
      { messageId: "demo-receipt-1", fromAddress: "noreply@greenhouse.io", subject: "Thank you for applying to Acme — Product Manager", snippet: "Thank you for your application. We received your application for Product Manager at Acme.", receivedAt: new Date().toISOString() },
      { messageId: "demo-reject-1", fromAddress: "talent@northwind.com", subject: "Update on your application", snippet: "Unfortunately we will not be moving forward with your application at this time.", receivedAt: new Date().toISOString() },
      { messageId: "demo-int-1", fromAddress: "jordan@lumen.jobs", subject: "Interview availability for Solutions Engineer", snippet: "We would like to schedule an interview. Please share your availability this week: https://cal.lumen.example/jordan", receivedAt: new Date().toISOString() },
      { messageId: "demo-news-1", fromAddress: "alerts@indeed.com", subject: "12 jobs for you", snippet: "Recommended jobs you may like. Unsubscribe anytime.", receivedAt: new Date().toISOString() },
    ];

    $("demoBtn").onclick = async () => {
      for (const payload of demos) {
        await fetch("/api/mail/dev/ingest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      }
      await refresh();
    };

    document.body.addEventListener("click", async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLButtonElement) || !t.dataset.id) return;
      await fetch("/api/mail/events/" + t.dataset.id + "/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: t.dataset.act }),
      });
      await refresh();
    });

    refresh();
  </script>
</body>
</html>`;
}
