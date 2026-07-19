'use strict';
// The dashboard's single self-contained HTML page (inline CSS + JS, no external
// assets). Rendered read-only from the session JSON the tool already saved.
function page() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agentwatch dashboard</title>
<style>
  :root{--bg:#0f1115;--panel:#171a21;--panel2:#1e222b;--fg:#e6e8ec;--muted:#8b93a1;
    --line:#272c37;--red:#ff5c66;--amber:#ffb020;--green:#39c07a;--accent:#5b9dff;}
  @media (prefers-color-scheme:light){:root{--bg:#f6f7f9;--panel:#fff;--panel2:#f0f2f5;
    --fg:#1a1d23;--muted:#5c6675;--line:#e2e6ec;}}
  *{box-sizing:border-box}
  body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:var(--bg);color:var(--fg)}
  header{padding:20px 24px;border-bottom:1px solid var(--line);background:var(--panel)}
  h1{margin:0;font-size:18px;letter-spacing:.2px}
  .sub{color:var(--muted);font-size:13px;margin-top:2px}
  .totals{display:flex;gap:18px;margin-top:14px;flex-wrap:wrap}
  .stat{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px 14px;min-width:96px}
  .stat .n{font-size:22px;font-weight:600}
  .stat .l{color:var(--muted);font-size:12px}
  .wrap{display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:0;height:calc(100vh - 150px)}
  @media (max-width:820px){.wrap{grid-template-columns:1fr;height:auto}}
  .list{overflow:auto;border-right:1px solid var(--line)}
  .controls{padding:12px 16px;display:flex;gap:10px;align-items:center;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg)}
  select,input{background:var(--panel2);color:var(--fg);border:1px solid var(--line);border-radius:8px;padding:7px 10px;font-size:13px}
  input{flex:1}
  .daygroup{padding:8px 16px 4px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.6px}
  .card{margin:6px 12px;padding:12px 14px;background:var(--panel);border:1px solid var(--line);
    border-radius:10px;cursor:pointer}
  .card:hover{border-color:var(--accent)}
  .card.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
  .card .top{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
  .agent{font-weight:600}
  .time{color:var(--muted);font-size:12px}
  .chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
  .chip{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);background:var(--panel2);color:var(--muted)}
  .chip.red{color:#fff;background:var(--red);border-color:transparent}
  .chip.amber{color:#241a00;background:var(--amber);border-color:transparent}
  .chip.green{color:#04240f;background:var(--green);border-color:transparent}
  .chip.vendor{color:var(--accent);border-color:var(--accent)}
  .detail{overflow:auto;padding:20px 24px}
  .detail h2{font-size:15px;margin:22px 0 8px;border-bottom:1px solid var(--line);padding-bottom:6px}
  .detail .meta{color:var(--muted);font-size:13px}
  .finding{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--red);
    border-radius:8px;padding:10px 12px;margin:8px 0}
  .finding.ok{border-left-color:var(--green)}
  .finding.warn{border-left-color:var(--amber)}
  .k{color:var(--muted)}
  code{background:var(--panel2);padding:1px 5px;border-radius:5px;font-size:12px}
  .empty{color:var(--muted);padding:40px 24px;text-align:center}
  .limitbox{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:12px 14px;color:var(--muted);font-size:13px;margin-top:8px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td,th{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
</style>
</head>
<body>
<header>
  <h1>agentwatch</h1>
  <div class="sub">Local dashboard — what your AI coding agents sent home, per run. Read-only; nothing is captured here.</div>
  <div class="totals" id="totals"></div>
</header>
<div class="wrap">
  <div class="list">
    <div class="controls">
      <select id="dayFilter"><option value="">All days</option></select>
      <input id="search" placeholder="filter by agent, vendor, or host…">
    </div>
    <div id="cards"></div>
  </div>
  <div class="detail" id="detail"><div class="empty">Select a run to see what left the machine.</div></div>
</div>
<script>
let SESSIONS=[], SELECTED=null;

async function load(){
  SESSIONS = await (await fetch('/api/sessions')).json();
  renderTotals(); renderDays(); renderList();
  if(SESSIONS.length) select(SESSIONS[0].file);
}
function renderTotals(){
  const t={runs:SESSIONS.length,files:0,secrets:0,git:0,unver:0};
  for(const s of SESSIONS){const u=s.summary||{};t.files+=u.filesWhoseContentLeft||0;t.secrets+=u.secretsOnEgress||0;t.git+=u.gitHistoryLeft?1:0;t.unver+=s.unverifiable||0;}
  document.getElementById('totals').innerHTML=[
    ['runs',t.runs],['files whose content left',t.files],['secrets on egress',t.secrets],
    ['runs w/ git history',t.git],['checks unable to verify',t.unver]
  ].map(([l,n])=>'<div class="stat"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>').join('');
}
function renderDays(){
  const days=[...new Set(SESSIONS.map(s=>s.day))].sort().reverse();
  const sel=document.getElementById('dayFilter');
  sel.innerHTML='<option value="">All days</option>'+days.map(d=>'<option>'+d+'</option>').join('');
}
function badges(s){
  const u=s.summary||{};const b=[];
  if(!s.intercepted) b.push(['amber','not intercepted']);
  if(u.ignoreViolations) b.push(['red',u.ignoreViolations+' ignore violation'+(u.ignoreViolations>1?'s':'')]);
  if(u.secretsOnEgress) b.push(['red',u.secretsOnEgress+' secret'+(u.secretsOnEgress>1?'s':'')]);
  if(u.gitHistoryLeft) b.push(['red','git history']);
  if(u.filesWhoseContentLeft) b.push(['', u.filesWhoseContentLeft+' file'+(u.filesWhoseContentLeft>1?'s':'')+' left']);
  if(s.unverifiable) b.push(['amber',s.unverifiable+' unable to verify']);
  if(!b.some(x=>x[0]==='red')&&s.intercepted) b.push(['green','nothing flagged']);
  return b;
}
function renderList(){
  const day=document.getElementById('dayFilter').value;
  const q=document.getElementById('search').value.toLowerCase();
  const rows=SESSIONS.filter(s=>(!day||s.day===day)&&(!q||JSON.stringify([s.agent,s.vendors,s.destinations,s.command]).toLowerCase().includes(q)));
  const byDay={};for(const s of rows){(byDay[s.day]=byDay[s.day]||[]).push(s);}
  const el=document.getElementById('cards');
  if(!rows.length){el.innerHTML='<div class="empty">No runs yet. Run <code>agentwatch -- &lt;agent&gt;</code> or <code>npm run demo</code>.</div>';return;}
  el.innerHTML=Object.keys(byDay).sort().reverse().map(d=>
    '<div class="daygroup">'+d+'</div>'+byDay[d].map(s=>{
      const time=(s.startedAt||'').slice(11,19);
      const vend=s.vendors.map(v=>'<span class="chip vendor">'+esc(v)+'</span>').join('');
      const bd=badges(s).map(([c,t])=>'<span class="chip '+c+'">'+esc(t)+'</span>').join('');
      const proj = s.project ? '<span class="time"> · '+esc(s.project)+'</span>' : '';
      return '<div class="card'+(SELECTED===s.file?' sel':'')+'" data-f="'+esc(s.file)+'">'
        +'<div class="top"><span class="agent">'+esc(s.agent)+proj+'</span><span class="time">'+time+'</span></div>'
        +'<div class="chips">'+vend+bd+'</div></div>';
    }).join('')).join('');
  el.querySelectorAll('.card').forEach(c=>c.onclick=()=>select(c.dataset.f));
}
async function select(file){
  SELECTED=file; renderList();
  const s=await (await fetch('/api/session?file='+encodeURIComponent(file))).json();
  document.getElementById('detail').innerHTML=renderDetail(s);
}
function renderDetail(s){
  const f=s.findings||{};const cap=s.capture||{};
  let h='<div class="meta"><b>'+esc(cmd(s))+'</b><br>'+esc(s.timing.startedAt)
    +' · agent: '+esc((s.agent&&s.agent.name)||'unknown')
    +' · tool '+esc(s.tool.version)+' on '+esc(s.env.os)+'</div>';
  h+='<div class="limitbox"><b>What this does not prove:</b> interception is cooperative; an agent can bypass it. "No match" means "not observed", never "did not leave".</div>';
  if((s.unverifiable||[]).length){
    h+='<h2>Unable to verify ('+s.unverifiable.length+') — not clean results</h2>';
    h+=dedupe(s.unverifiable).map(u=>'<div class="finding warn"><span class="k">['+esc(u.check)+']</span> '+esc(u.reason)+'</div>').join('');
  }
  // ignore
  const ig=f.ignore||{violations:[],pathOnly:[]};
  h+='<h2>Ignore-file violations</h2>';
  if(!ig.violations.length) h+='<div class="finding ok">No ignored file had its content observed leaving.</div>';
  ig.violations.forEach(v=>h+='<div class="finding"><b>'+esc(v.path)+'</b> — content in traffic ('+v.coveragePct+'%, '+esc(v.confidence)+')<br><span class="k">declared in '+esc((v.ignoredBy||[]).join(', '))+'; first at turn '+(v.firstSeen&&v.firstSeen.turn)+' → '+esc((v.destinations||[]).join(', '))+'</span></div>');
  (ig.pathOnly||[]).forEach(p=>h+='<div class="finding warn"><b>'+esc(p.path)+'</b> — path mentioned only (content not observed)</div>');
  // secrets
  const sec=(f.secrets&&f.secrets.findings)||[];
  h+='<h2>Secrets on egress ('+sec.length+')</h2>';
  if(!sec.length) h+='<div class="finding ok">No credential-shaped strings observed.</div>';
  sec.forEach(x=>h+='<div class="finding"><b>'+esc(x.ruleId)+'</b> <span class="k">('+esc(x.kind)+') ×'+x.occurrences+' · fp:'+esc(x.fingerprint)+'</span><br><span class="k">first at turn '+(x.firstSeen&&x.firstSeen.turn)+' → '+esc((x.destinations||[]).join(', '))+(x.sourceFiles&&x.sourceFiles.length?' · source: '+esc(x.sourceFiles.join(', ')):'')+'</span></div>');
  if(sec.length) h+='<div class="meta">Values are never stored — type, location, and fingerprint only.</div>';
  // git history
  const gh=(f.gitHistory&&f.gitHistory.findings)||[];
  h+='<h2>Git history / packfile ('+gh.length+')</h2>';
  if(!gh.length) h+='<div class="finding ok">No git packfile or bundle observed.</div>';
  gh.forEach(g=>h+='<div class="finding"><b>'+esc(g.kind)+' v'+g.version+'</b>'+(g.objectCount?', '+g.objectCount+' objects':'')+' → '+esc(g.destination)+' <span class="k">(turn '+(g.firstSeen&&g.firstSeen.turn)+')</span></div>');
  // read vs send
  const r=f.readVsSend||{};
  h+='<h2>Read-vs-send divergence</h2>';
  if(r.status!=='verified'){h+='<div class="finding warn">unable to verify: '+esc(r.reason||'')+'<br><span class="k">content of '+(r.contentSentCount||0)+' file(s) was observed leaving</span></div>';}
  else{
    if((r.sentNotClaimed||[]).length){h+='<div class="finding"><b>'+r.sentNotClaimed.length+' file(s) sent but not reported as read:</b><br><span class="k">'+esc(r.sentNotClaimed.join(', '))+'</span></div>';}
    else h+='<div class="finding ok">Every file whose content left was among those reported as read.</div>';
  }
  // destinations
  h+='<h2>Destinations — where the bytes went</h2><table><tr><th>host</th><th>vendor</th><th>requests</th><th>bytes</th></tr>';
  (cap.destinations||[]).forEach(d=>h+='<tr><td>'+esc(d.host)+'</td><td>'+esc(d.service||'—')+(d.isModelHost?' [model]':'')+(d.isTelemetry?' [telemetry]':'')+'</td><td>'+d.requests+'</td><td>'+fmtB(d.bytesOut)+'</td></tr>');
  h+='</table>';
  return h;
}
function cmd(s){return Array.isArray(s.agent&&s.agent.command)?s.agent.command.join(' '):(s.agent&&s.agent.command)||'';}
function dedupe(a){const seen=new Set(),o=[];for(const u of a){const k=u.check+'|'+u.reason;if(!seen.has(k)){seen.add(k);o.push(u);}}return o;}
function fmtB(n){n=n||0;if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';return (n/1048576).toFixed(2)+' MB';}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
document.getElementById('dayFilter').onchange=renderList;
document.getElementById('search').oninput=renderList;
load();
</script>
</body>
</html>`;
}
module.exports = { page };
