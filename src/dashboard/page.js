'use strict';
// The dashboard's single self-contained HTML page (inline CSS + JS, no external
// assets). Rendered read-only from the session JSON the tool already saved.
function page() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Watcher</title>
<style>
  :root{
    --bg:#0d1017; --panel:#141922; --panel2:#1a2029; --raised:#202836;
    --fg:#e8edf4; --muted:#8a97a8; --faint:#5f6b7c; --line:#232b38;
    --brand:#7c8cff; --brand-soft:#7c8cff22;
    --red:#f76b6b; --amber:#e5a13a; --green:#43c98a; --info:#5aa9f8;
    --shadow:0 1px 3px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.25);
    --radius:14px;
  }
  @media (prefers-color-scheme:light){
    :root{
      --bg:#f4f6fa; --panel:#ffffff; --panel2:#f0f3f8; --raised:#ffffff;
      --fg:#1a2230; --muted:#5b6675; --faint:#8b95a4; --line:#e4e9f0;
      --brand:#5461d6; --brand-soft:#5461d611;
      --red:#dc4b4b; --amber:#c07d12; --green:#1f9d63; --info:#2f7fd6;
      --shadow:0 1px 2px rgba(20,30,50,.06), 0 8px 24px rgba(20,30,50,.08);
    }
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;background:var(--bg);color:var(--fg);
    font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif;
    -webkit-font-smoothing:antialiased}

  /* ---- header ---- */
  header{padding:22px 28px 20px;background:linear-gradient(180deg,var(--panel),var(--bg));
    border-bottom:1px solid var(--line)}
  .brand{display:flex;align-items:center;gap:11px}
  .logo{width:30px;height:30px;flex:none}
  .title{font-size:19px;font-weight:700;letter-spacing:-.2px}
  .title .w{color:var(--brand)}
  .tag{color:var(--muted);font-size:13px;margin:3px 0 0 41px}
  .totals{display:flex;gap:12px;margin:18px 0 0 41px;flex-wrap:wrap}
  .stat{background:var(--panel2);border:1px solid var(--line);border-radius:12px;
    padding:11px 16px;min-width:104px}
  .stat .n{font-size:23px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
  .stat.alert .n{color:var(--red)} .stat.warn .n{color:var(--amber)}
  .stat .l{color:var(--muted);font-size:11.5px;margin-top:3px;letter-spacing:.2px}

  /* ---- layout ---- */
  .wrap{display:grid;grid-template-columns:minmax(320px,400px) 1fr;height:calc(100vh - 132px)}
  @media (max-width:860px){.wrap{grid-template-columns:1fr;height:auto}}
  .list{overflow:auto;border-right:1px solid var(--line);background:var(--panel)}
  .controls{padding:14px 16px;display:flex;gap:9px;position:sticky;top:0;z-index:2;
    background:var(--panel);border-bottom:1px solid var(--line)}
  select,input{background:var(--panel2);color:var(--fg);border:1px solid var(--line);
    border-radius:9px;padding:8px 11px;font-size:13px;outline:none;transition:border-color .15s}
  select:focus,input:focus{border-color:var(--brand)}
  input{flex:1}
  .daygroup{padding:14px 18px 6px;color:var(--faint);font-size:11px;font-weight:600;
    text-transform:uppercase;letter-spacing:.8px}

  /* ---- session cards ---- */
  .card{margin:7px 12px;padding:13px 15px;background:var(--panel2);border:1px solid var(--line);
    border-radius:12px;cursor:pointer;transition:border-color .15s,transform .05s}
  .card:hover{border-color:var(--brand)}
  .card:active{transform:translateY(1px)}
  .card.sel{border-color:var(--brand);box-shadow:0 0 0 1px var(--brand) inset,var(--shadow);background:var(--raised)}
  .card .top{display:flex;justify-content:space-between;align-items:center;gap:8px}
  .who{display:flex;align-items:center;gap:8px;min-width:0}
  .dot{width:8px;height:8px;border-radius:50%;flex:none}
  .agent{font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .proj{color:var(--faint);font-size:12px}
  .time{color:var(--faint);font-size:12px;font-variant-numeric:tabular-nums;flex:none}
  .chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
  .chip{font-size:11px;padding:3px 9px;border-radius:999px;font-weight:600;
    border:1px solid var(--line);background:var(--bg);color:var(--muted)}
  .chip.red{color:#fff;background:var(--red);border-color:transparent}
  .chip.amber{color:#241a00;background:var(--amber);border-color:transparent}
  .chip.green{color:#04240f;background:var(--green);border-color:transparent}
  .chip.info{color:var(--info);border-color:var(--info)}
  .chip.vendor{color:var(--brand);border-color:var(--brand);background:var(--brand-soft)}

  /* ---- detail ---- */
  .detail{overflow:auto;padding:26px 30px}
  .detail .head{font-size:17px;font-weight:700}
  .detail .sub{color:var(--muted);font-size:13px;margin-top:4px}
  .detail h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;
    color:var(--faint);margin:26px 0 10px;padding-bottom:7px;border-bottom:1px solid var(--line)}
  .finding{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--red);
    border-radius:9px;padding:11px 13px;margin:8px 0}
  .finding.ok{border-left-color:var(--green)}
  .finding.warn{border-left-color:var(--amber)}
  .finding.info{border-left-color:var(--info)}
  .k{color:var(--muted)}
  code{background:var(--panel2);padding:1.5px 6px;border-radius:6px;font-size:12px;
    font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  .footnote{color:var(--faint);font-size:12px;line-height:1.5;margin-top:24px;
    padding-top:14px;border-top:1px solid var(--line)}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-top:4px}
  td,th{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
  th{color:var(--faint);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  td.num{text-align:right;font-variant-numeric:tabular-nums;color:var(--muted)}
  .empty{color:var(--muted);padding:64px 30px;text-align:center;max-width:420px;margin:0 auto}
  .empty .big{font-size:34px;margin-bottom:12px}
</style>
</head>
<body>
<header>
  <div class="brand">
    <svg class="logo" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="16" cy="16" r="15" stroke="var(--brand)" stroke-width="1.5" opacity=".35"/>
      <circle cx="16" cy="16" r="9.5" stroke="var(--brand)" stroke-width="1.5" opacity=".6"/>
      <circle cx="16" cy="16" r="3.5" fill="var(--brand)"/>
      <path d="M16 1 L16 6 M16 26 L16 31 M1 16 L6 16 M26 16 L31 16" stroke="var(--brand)" stroke-width="1.5" opacity=".5"/>
    </svg>
    <div class="title">Agent <span class="w">Watcher</span></div>
  </div>
  <div class="tag">What your AI coding agents sent off this machine — one card per run.</div>
  <div class="totals" id="totals"></div>
</header>
<div class="wrap">
  <div class="list">
    <div class="controls">
      <select id="dayFilter"><option value="">All days</option></select>
      <input id="search" placeholder="filter by agent, project, or host…">
    </div>
    <div id="cards"></div>
  </div>
  <div class="detail" id="detail"><div class="empty"><div class="big">👁</div>Select a run on the left to see what left the machine.</div></div>
</div>
<script>
let SESSIONS=[], SELECTED=null;

async function load(){
  SESSIONS = await (await fetch('/api/sessions')).json();
  renderTotals(); renderDays(); renderList();
  if(SESSIONS.length) select(SESSIONS[0].file);
}
function renderTotals(){
  const t={runs:SESSIONS.length,viol:0,secrets:0,unver:0};
  for(const s of SESSIONS){const u=s.summary||{};t.viol+=(u.ignoreViolations||0)+(u.gitHistoryLeft?1:0);t.secrets+=u.secretsOnEgress||0;t.unver+=s.unverifiable||0;}
  document.getElementById('totals').innerHTML=[
    ['runs',t.runs,''],['flagged',t.viol,t.viol?'alert':''],['secrets',t.secrets,t.secrets?'alert':''],['unable to verify',t.unver,t.unver?'warn':'']
  ].map(([l,n,c])=>'<div class="stat '+c+'"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>').join('');
}
function renderDays(){
  const days=[...new Set(SESSIONS.map(s=>s.day))].sort().reverse();
  document.getElementById('dayFilter').innerHTML='<option value="">All days</option>'+days.map(d=>'<option>'+d+'</option>').join('');
}
function statusOf(s){
  const u=s.summary||{};
  if(u.ignoreViolations||u.secretsOnEgress||u.gitHistoryLeft) return 'red';
  if(!s.intercepted||s.unverifiable) return 'amber';
  return 'green';
}
function badges(s){
  const u=s.summary||{};const b=[];
  if(!s.intercepted) b.push(['amber','not intercepted']);
  if(u.ignoreViolations) b.push(['red',u.ignoreViolations+' ignored file'+(u.ignoreViolations>1?'s':'')+' leaked']);
  if(u.secretsOnEgress) b.push(['red',u.secretsOnEgress+' secret'+(u.secretsOnEgress>1?'s':'')]);
  if(u.gitHistoryLeft) b.push(['red','git history']);
  if(u.filesWhoseContentLeft) b.push(['info', u.filesWhoseContentLeft+' file'+(u.filesWhoseContentLeft>1?'s':'')+' sent']);
  if(s.unverifiable) b.push(['amber',s.unverifiable+' unable to verify']);
  if(statusOf(s)==='green') b.unshift(['green','nothing flagged']);
  return b;
}
function renderList(){
  const day=document.getElementById('dayFilter').value;
  const q=document.getElementById('search').value.toLowerCase();
  const rows=SESSIONS.filter(s=>(!day||s.day===day)&&(!q||JSON.stringify([s.agent,s.project,s.vendors,s.destinations,s.command]).toLowerCase().includes(q)));
  const byDay={};for(const s of rows){(byDay[s.day]=byDay[s.day]||[]).push(s);}
  const el=document.getElementById('cards');
  if(!rows.length){el.innerHTML='<div class="empty">No runs match. Run <code>agentwatch -- &lt;agent&gt;</code> or <code>npm run demo</code>.</div>';return;}
  const dotColor={red:'var(--red)',amber:'var(--amber)',green:'var(--green)'};
  el.innerHTML=Object.keys(byDay).sort().reverse().map(d=>
    '<div class="daygroup">'+d+'</div>'+byDay[d].map(s=>{
      const time=(s.startedAt||'').slice(11,16);
      const st=statusOf(s);
      const vend=s.vendors.map(v=>'<span class="chip vendor">'+esc(v)+'</span>').join('');
      const bd=badges(s).map(([c,t])=>'<span class="chip '+c+'">'+esc(t)+'</span>').join('');
      return '<div class="card'+(SELECTED===s.file?' sel':'')+'" data-f="'+esc(s.file)+'">'
        +'<div class="top"><span class="who"><span class="dot" style="background:'+dotColor[st]+'"></span>'
        +'<span class="agent">'+esc(s.agent)+'</span>'+(s.project?'<span class="proj">'+esc(s.project)+'</span>':'')+'</span>'
        +'<span class="time">'+time+'</span></div>'
        +'<div class="chips">'+vend+bd+'</div></div>';
    }).join('')).join('');
  el.querySelectorAll('.card').forEach(c=>c.onclick=()=>select(c.dataset.f));
}
async function select(file){
  SELECTED=file; renderList();
  const s=await (await fetch('/api/session?file='+encodeURIComponent(file))).json();
  document.getElementById('detail').innerHTML=renderDetail(s);
  document.getElementById('detail').scrollTop=0;
}
function renderDetail(s){
  const f=s.findings||{};const cap=s.capture||{};
  const agentName=(s.agent&&s.agent.name)||'unknown agent';
  const when=(s.timing&&s.timing.startedAt||'').replace('T',' ').slice(0,16);
  let h='<div class="head">'+esc(agentName)+'</div>';
  h+='<div class="sub">'+esc(when)+(s.project&&s.project.name?' · '+esc(s.project.name):'')+' · Agent Watcher '+esc(s.tool.version)+'</div>';
  if((s.unverifiable||[]).length){
    h+='<h2>Unable to verify ('+s.unverifiable.length+') — not clean results</h2>';
    h+=dedupe(s.unverifiable).map(u=>'<div class="finding warn"><span class="k">['+esc(u.check)+']</span> '+esc(u.reason)+'</div>').join('');
  }
  const left=f.contentLeft||[];
  h+='<h2>Files whose content left ('+left.length+')</h2>';
  h+='<div class="k" style="margin-bottom:6px">Context, not an alarm — most content leaving is normal. Real concerns are flagged in the sections below.</div>';
  if(!left.length) h+='<div class="finding ok">No local file content observed leaving.</div>';
  else left.forEach(c=>h+='<div class="finding info"><b>'+esc(c.path)+'</b> <span class="k">'+c.coveragePct+'% matched · '+esc(c.confidence)+' → '+esc((c.destinations||[]).join(', '))+'</span></div>');
  const ig=f.ignore||{violations:[],pathOnly:[]};
  h+='<h2>Private files (ignore rules)</h2>';
  if(!ig.violations.length) h+='<div class="finding ok">No ignored file had its content leave.</div>';
  ig.violations.forEach(v=>h+='<div class="finding"><b>'+esc(v.path)+'</b> — content sent ('+v.coveragePct+'%, '+esc(v.confidence)+')<br><span class="k">declared in '+esc((v.ignoredBy||[]).join(', '))+' → '+esc((v.destinations||[]).join(', '))+'</span></div>');
  (ig.pathOnly||[]).forEach(p=>h+='<div class="finding info"><b>'+esc(p.path)+'</b> <span class="k">— filename appeared, content not sent</span></div>');
  const sec=(f.secrets&&f.secrets.findings)||[];
  h+='<h2>Secrets ('+sec.length+')</h2>';
  if(!sec.length) h+='<div class="finding ok">No credential-shaped strings observed.</div>';
  sec.forEach(x=>h+='<div class="finding"><b>'+esc(x.ruleId)+'</b> <span class="k">('+esc(x.kind)+') · <code>fp:'+esc(x.fingerprint)+'</code>'+(x.sourceFiles&&x.sourceFiles.length?' · from '+esc(x.sourceFiles.join(', ')):'')+' → '+esc((x.destinations||[]).join(', '))+'</span></div>');
  if(sec.length) h+='<div class="k">Values are never stored — type, location, and fingerprint only.</div>';
  const gh=(f.gitHistory&&f.gitHistory.findings)||[];
  h+='<h2>Git history</h2>';
  if(!gh.length) h+='<div class="finding ok">No git packfile or bundle observed.</div>';
  gh.forEach(g=>h+='<div class="finding"><b>'+esc(g.kind)+' v'+g.version+'</b>'+(g.objectCount?', '+g.objectCount+' objects':'')+' → '+esc(g.destination)+'</div>');
  const r=f.readVsSend||{};
  h+='<h2>Read vs send</h2>';
  if(r.status!=='verified') h+='<div class="finding warn">unable to verify — '+esc(r.reason||'')+'</div>';
  else if((r.sentNotClaimed||[]).length) h+='<div class="finding"><b>Sent but not reported as read:</b> '+esc(r.sentNotClaimed.join(', '))+'</div>';
  else h+='<div class="finding ok">Everything sent was among the files it reported reading.</div>';
  h+='<h2>Destinations</h2><table><tr><th>Host</th><th>Vendor</th><th class="num">Requests</th><th class="num">Sent</th></tr>';
  (cap.destinations||[]).forEach(d=>h+='<tr><td>'+esc(d.host)+'</td><td>'+esc(d.service||'—')+(d.isModelHost?' <span class="k">[model]</span>':'')+(d.isTelemetry?' <span class="k">[telemetry]</span>':'')+'</td><td class="num">'+d.requests+'</td><td class="num">'+fmtB(d.bytesOut)+'</td></tr>');
  h+='</table>';
  h+='<div class="footnote">Interception is cooperative — a determined agent could bypass it, so a clean result means nothing was flagged, not proof that nothing left.</div>';
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
