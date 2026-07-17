const DEFAULT_TEAM=10021, YEAR=2026, DEFAULT_REFRESH=300;
const K={config:"gg_config_v5",matches:"gg_matches_v1",rankings:"gg_rankings_v1",teams:"gg_teams_v1",epa:"gg_epa_v1",etags:"gg_etags_v1",teamEvents:"gg_team_events_v2"};
const FALLBACK=[
{key:"qm6",q:6,red:[8085,3641,469],blue:[10021,2056,2767]},
{key:"qm11",q:11,red:[2377,10021,359],blue:[2056,1024,3176]},
{key:"qm17",q:17,red:[1720,10021,1002],blue:[3414,1741,1706]},
{key:"qm27",q:27,red:[1792,1768,8608],blue:[5687,4028,10021]},
{key:"qm37",q:37,red:[234,10021,5907],blue:[1023,27,1987]},
{key:"qm46",q:46,red:[10021,1732,1792],blue:[11415,6721,3940]},
{key:"qm52",q:52,red:[2468,2481,1261],blue:[10021,1987,11415]},
{key:"qm61",q:61,red:[4499,11415,7890],blue:[9401,484,10021]}
];
const NAMES={27:"Team RUSH",234:"Cyber Blue",359:"Hawaiian Kids",469:"Las Guerrillas",484:"Roboforce",1002:"CircuitRunners",1023:"Bedford Express",1024:"Kil-A-Bytes",1261:"Robo Lions",1706:"Ratchet Rockers",1720:"PhyXTGears",1732:"Hilltoppers",1741:"Red Alert",1768:"Robo Chiefs",1792:"Round Table",1987:"Broncobots",2056:"OP Robotics",2377:"C Company",2468:"Team Appreciate",2481:"Roboteers",2767:"Stryke Force",3176:"Purple Precision",3414:"Hacks Tech",3641:"Flying Toasters",3940:"CyberTooth",4028:"Beak Squad",4499:"Highlanders",5687:"The Outliers",5907:"Cygnet",6721:"Tindley",7890:"TechnoNerds",8085:"MOJO",8608:"Alpha Bots",9401:"Knights",10021:"Golden Gears",11415:"Storm Surge"};
const $=id=>document.getElementById(id);
const load=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
let config=load(K.config,{eventKey:"2026iri",tbaKey:"",refreshSeconds:DEFAULT_REFRESH,team:DEFAULT_TEAM,eventManual:false,statbotics:false});
let team=+config.team||DEFAULT_TEAM;
let teamEvents=(()=>{const c=load(K.teamEvents,null);return c?.team===team?c.events||[]:[]})();
let matches=load(K.matches,null);
if(!matches?.some(m=>m.red.includes(team)||m.blue.includes(team)))matches=team===DEFAULT_TEAM?FALLBACK:[];
let rankings=load(K.rankings,{}), teams={...NAMES,...load(K.teams,{})}, epa=load(K.epa,{}), etags=load(K.etags,{});
let powerSource="cached", powerLabel="EPA", rankLabel="World", teamSearch="", teamSort="event";
$("teamNumber").value=team;$("eventKey").value=config.eventKey;$("tbaKey").value=config.tbaKey||"";$("refreshSeconds").value=config.refreshSeconds||DEFAULT_REFRESH;$("teamSort").value=teamSort;$("statboticsEnabled").checked=!!config.statbotics;
syncEventUI();renderEventSelect();

function hasApiKey(){return!!config.tbaKey?.trim()}
function todayYmd(){
 const d=new Date();
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function seasonYears(){return [YEAR,YEAR-1]}
function readTeamEventsCache(){const c=load(K.teamEvents,null);return c?.team===team?c:null}
function mergeEventYears(byYear){
 const merged=new Map();
 seasonYears().forEach(y=>(byYear[y]||[]).forEach(e=>merged.set(e.key,e)));
 return [...merged.values()].sort((a,b)=>b.start_date.localeCompare(a.start_date)||a.name.localeCompare(b.name));
}
function saveTeamEventsCache(byYear){
 teamEvents=mergeEventYears(byYear);
 save(K.teamEvents,{team,byYear,events:teamEvents,updated:Date.now()});
}
function pickEventForToday(events,today=todayYmd()){
 if(!events?.length)return null;
 const live=events.filter(e=>e.start_date<=today&&e.end_date>=today);
 if(live.length)return live.sort((a,b)=>a.start_date.localeCompare(b.start_date))[0];
 const upcoming=events.filter(e=>e.start_date>today).sort((a,b)=>a.start_date.localeCompare(b.start_date));
 if(upcoming.length)return upcoming[0];
 return events.filter(e=>e.end_date<today).sort((a,b)=>b.end_date.localeCompare(a.end_date))[0]||events[0];
}
function formatEventOption(e,today=todayYmd()){
 const live=e.start_date<=today&&e.end_date>=today?" · live":"";
 const dates=e.end_date!==e.start_date?`${e.start_date}–${e.end_date}`:e.start_date;
 return `${e.name} (${dates})${live}`;
}
function setEventKey(key,{manual=false,saveConfig=true}={}){
 config.eventKey=(key||"").trim();
 if(manual)config.eventManual=true;
 $("eventKey").value=config.eventKey;
 if($("eventSelect")&&config.eventKey)$("eventSelect").value=config.eventKey;
 updateEventKeyNote();
 if(saveConfig)save(K.config,config);
}
function updateEventKeyNote(){
 const ev=teamEvents.find(e=>e.key===config.eventKey);
 $("eventKeyNote").textContent=config.eventKey?`Event key: ${config.eventKey}${ev?" · "+ev.name:""}`:"Event key not set";
}
function syncEventUI(){
 const manual=!hasApiKey();
 $("eventSelectWrap").hidden=manual;
 $("eventAutoNote").hidden=manual;
 $("eventKeyWrap").hidden=!manual;
 $("eventKeyHelp").hidden=!manual;
}
function renderEventSelect(){
 const sel=$("eventSelect"), today=todayYmd();
 if(!teamEvents.length){
  sel.innerHTML=hasApiKey()?'<option value="">No events found for this team</option>':`<option value="${config.eventKey||""}">${config.eventKey||"Add API key to load events"}</option>`;
  sel.value=config.eventKey||"";
  updateEventKeyNote();
  return;
 }
 const groups=new Map();
 teamEvents.forEach(e=>{
  const y=(e.key||"").slice(0,4)||(e.start_date||"").slice(0,4)||"Other";
  if(!groups.has(y))groups.set(y,[]);
  groups.get(y).push(e);
 });
 sel.innerHTML=[...groups.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([y,list])=>
  `<optgroup label="${y} season">${list.map(e=>`<option value="${e.key}">${formatEventOption(e,today)}</option>`).join("")}</optgroup>`
 ).join("");
 sel.value=teamEvents.some(e=>e.key===config.eventKey)?config.eventKey:teamEvents[0].key;
 updateEventKeyNote();
}
async function fetchTeamEventsYear(year,byYear){
 try{
  const data=await api(`https://www.thebluealliance.com/api/v3/team/frc${team}/events/${year}/simple`,`te:${team}:${year}`);
  if(data)byYear[year]=data;
 }catch{}
 if(!byYear[year]){
  const cached=readTeamEventsCache();
  if(cached?.byYear?.[year])byYear[year]=cached.byYear[year];
 }
}
async function loadTeamEvents({autoPick=!config.eventManual}={}){
 syncEventUI();
 const cached=readTeamEventsCache();
 if(cached?.events?.length){teamEvents=cached.events;renderEventSelect()}
 if(!hasApiKey()){renderEventSelect();return}
 const byYear={...(cached?.byYear||{})};
 await Promise.all(seasonYears().map(y=>fetchTeamEventsYear(y,byYear)));
 saveTeamEventsCache(byYear);
 renderEventSelect();
 const savedValid=teamEvents.some(e=>e.key===config.eventKey);
 if((autoPick||!savedValid)&&teamEvents.length){
  const picked=pickEventForToday(teamEvents);
  if(picked)setEventKey(picked.key,{manual:false});
  config.eventManual=false;
  save(K.config,config);
 }else if(savedValid)$("eventSelect").value=config.eventKey;
 updateEventKeyNote();
}
function openSettings(){
 document.querySelectorAll(".tab,.page").forEach(x=>x.classList.remove("active"));
 document.querySelector('.tab[data-page="settings"]').classList.add("active");
 $("page-settings").classList.add("active");
}

function renderHeader(){
 $("appSub").textContent=`Team ${team}${teams[team]?" · "+teams[team]:""} live dashboard`;
}
renderHeader();

function syncPowerLabels(){
 const s=Object.values(epa).find(x=>x?.source);
 powerSource=s?.source||"cached";
 powerLabel=powerSource==="opr"?"OPR":"EPA";
 rankLabel=powerSource==="opr"?"OPR #":"World";
 updatePowerHelpStatus();
 updateTeamSortLabel();
}
function updateTeamSortLabel(){
 const opt=$("teamSort")?.querySelector('option[value="power"]');
 if(opt)opt.textContent=powerSource==="opr"?"OPR rank":"World rank";
}
function updatePowerHelpStatus(){
 const el=$("powerHelpStatus"); if(!el)return;
 if(powerSource==="opr")el.textContent="Currently showing OPR from The Blue Alliance for this event.";
 else if(powerSource==="epa")el.textContent="Currently showing EPA from Statbotics.";
 else el.textContent="Power ratings are not loaded yet. Add a TBA API key and refresh.";
}
function openPowerHelp(){
 openSettings();
 const d=$("powerHelp");
 if(d&&!d.open)d.open=true;
 requestAnimationFrame(()=>d?.scrollIntoView({behavior:"smooth",block:"start"}));
}
syncPowerLabels();

function tn(k){return Number(String(k||"").replace("frc",""))}
function fmt(n,d=1){return Number.isFinite(+n)?(+n).toFixed(d):"—"}
function rank(n){return Number.isFinite(+n)?`#${+n}`:"—"}
function allTeams(){return [...new Set(matches.flatMap(m=>[...m.red,...m.blue]))]}
function teamMatchesSearch(t,q){
 if(!q)return true;
 const name=(teams[t]||"").toLowerCase(), query=q.toLowerCase().trim();
 return String(t).includes(query)||name.includes(query);
}
function sortedTeams(){
 const list=allTeams();
 return list.sort((a,b)=>{
  if(teamSort==="number")return a-b;
  if(teamSort==="event")return (rankings[a]?.rank??99999)-(rankings[b]?.rank??99999)||(epa[a]?.rank??99999)-(epa[b]?.rank??99999)||a-b;
  if(teamSort==="name")return (teams[a]||"").localeCompare(teams[b]||"","en",{sensitivity:"base"})||a-b;
  return (epa[a]?.rank??99999)-(epa[b]?.rank??99999)||a-b;
 });
}
function teamRow(t){
 const s=epa[t]||{}, r=rankings[t];
 return `<div class="teamrow ${t===team?"mine":""}"><div class="identity"><span class="tnum">${t}</span><span class="tname">${teams[t]||"Team "+t}${t===team?" ⭐":""}</span></div><span class="rank">${rank(s.rank)}</span><span class="rank">${rank(r?.rank)}</span></div>`;
}
function alliance(color,list,won=false){
 const win=won?" · WIN":"";
 return `<div class="alliance ${color}${won?" won":""}"><div class="ahead">${color==="red"?"🔴 RED":"🔵 BLUE"}${win} <span style="float:right" class="rankhead">${rankLabel}&nbsp;&nbsp;EVENT</span></div>${list.map(teamRow).join("")}</div>`;
}
function matchDone(m){return m.actual_time||m.post_result_time||Number.isFinite(m.redScore)}
function matchHasScore(m){return matchDone(m)&&Number.isFinite(m.redScore)&&Number.isFinite(m.blueScore)}
function matchWinner(m){
 if(!matchHasScore(m))return null;
 if(m.redScore>m.blueScore)return "red";
 if(m.blueScore>m.redScore)return "blue";
 return "tie";
}
function fmtUnixTime(ts){return ts?new Date(ts*1000).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):null}
function matchPlayTime(m){return fmtUnixTime(m?.actual_time||m?.post_result_time)}
function fmtMatchTime(m){return fmtUnixTime(m?.predicted_time)}
function matchScoreboard(m){
 const w=matchWinner(m);
 return `<div class="scoreboard"><div class="scorebox red${w==="red"?" won":""}"><span class="scorelabel">Red</span><b>${m.redScore}</b></div><div class="scorebox blue${w==="blue"?" won":""}"><span class="scorelabel">Blue</span><b>${m.blueScore}</b></div></div>`;
}
function matchCardMeta(m){
 if(matchHasScore(m)){
  const played=matchPlayTime(m), label=matchWinner(m)==="tie"?"Tie":"Final";
  return {text:played?`${label} · ${played}`:label,cls:"winner"};
 }
 if(matchDone(m)){
  const played=matchPlayTime(m);
  return {text:played?`Played · ${played}`:"Pending",cls:"pending"};
 }
 const t=fmtMatchTime(m);
 return {text:t?`Est. ${t}`:"Time TBD",cls:"pending"};
}
function latestMatchTarget(){
 const sorted=[...matches].sort((a,b)=>a.q-b.q);
 const played=sorted.filter(matchDone);
 if(played.length)return played[played.length-1];
 return sorted.find(m=>!matchDone(m))||sorted[sorted.length-1];
}
function scrollToLatestMatch(){
 const m=latestMatchTarget(); if(!m?.key)return;
 requestAnimationFrame(()=>document.getElementById("match-"+m.key)?.scrollIntoView({behavior:"smooth",block:"center"}));
}
function nextMatch(){
 const sorted=[...matches].sort((a,b)=>a.q-b.q); return sorted.find(m=>!matchDone(m))||sorted[sorted.length-1];
}
function probability(m){
 const re=m.red.reduce((a,t)=>a+(+epa[t]?.total||0),0), be=m.blue.reduce((a,t)=>a+(+epa[t]?.total||0),0);
 if(!re&&!be)return null; const p=1/(1+Math.exp(-(re-be)/12)); return {red:Math.round(p*100),blue:Math.round((1-p)*100),re,be};
}
function renderNext(){
 const keyReminder=!hasApiKey()?'<div class="alert">Add your TBA read API key in <button type="button" class="alert-link" data-open-settings>Settings</button> to load live schedules, rankings, and team names.</div>':"";
 const m=nextMatch(); if(!m){$("nextContent").innerHTML=keyReminder+'<div class="empty">No matches loaded.</div>';return}
 const p=probability(m), mine=m.red.includes(team)?"RED":"BLUE";
 const played=matchPlayTime(m), est=fmtMatchTime(m);
 const whenLabel=matchHasScore(m)?(played?`Final · ${played}`:"Final"):matchDone(m)?(played?`Played · ${played}`:"Pending"):est?`Est. ${est}`:"Time not posted";
 $("nextContent").innerHTML=`${keyReminder}<div class="hero"><div class="eyebrow">Next match · ${mine} alliance</div><div class="hero-title">Qualification ${m.q}</div>
 <div class="countdown">${whenLabel}</div>
 ${p?`<div class="metrics"><div class="metric"><b>${fmt(p.re)}</b><span>Red ${powerLabel}</span></div><div class="metric"><b>${p.red}%</b><span>Red estimate</span></div><div class="metric"><b>${fmt(p.be)}</b><span>Blue ${powerLabel}</span></div></div><button type="button" class="helpbtn power-help-inline" data-open-power-help aria-label="Explain ${powerLabel}">?</button>`:""}
 ${matchHasScore(m)?matchScoreboard(m):""}
 ${alliance("red",m.red,matchWinner(m)==="red")}${alliance("blue",m.blue,matchWinner(m)==="blue")}</div>
 <h2 class="section-title">After this</h2>${[...matches].filter(x=>x.q>m.q).slice(0,2).map(matchCard).join("")||'<div class="empty">No later matches.</div>'}`;
}
function matchCard(m){
 const meta=matchCardMeta(m), w=matchWinner(m);
 return `<article class="card${matchHasScore(m)?" played":""}" id="match-${m.key}"><div class="cardhead"><span>Qualification ${m.q}</span><span class="score ${meta.cls}">${meta.text}</span></div>${matchHasScore(m)?matchScoreboard(m):""}${alliance("red",m.red,w==="red")}${alliance("blue",m.blue,w==="blue")}</article>`;
}
function renderMatches(){$("matchList").innerHTML=[...matches].sort((a,b)=>a.q-b.q).map(matchCard).join("")}
function renderTeams(){
 const q=teamSearch, list=sortedTeams().filter(t=>teamMatchesSearch(t,q));
 $("teamList").innerHTML=list.length?list.map(t=>{
 const s=epa[t]||{},r=rankings[t]||{};
 return `<article class="card teamcard"><h3>${t} · ${teams[t]||"Team "+t}${t===team?" ⭐":""}</h3><div class="teamstats">
 <div class="tiny"><b>${rank(r.rank)}</b><span>Event</span></div><div class="tiny"><b>${rank(s.rank)}</b><span>${rankLabel}</span></div>
 <div class="tiny"><b>${fmt(s.total)}</b><span>${powerLabel}</span></div><div class="tiny"><b>${r.record||"—"}</b><span>Record</span></div>
 </div></article>`}).join(""):'<div class="empty">No teams match your search.</div>';
}
function render(){renderHeader();renderNext();renderMatches();renderTeams()}
const SAVE_LABEL="Save and refresh";
let refreshTimer;
function setSaveButtonState(state){
 const btn=$("saveBtn");
 if(state==="busy"){btn.disabled=true;btn.classList.add("busy");btn.classList.remove("saved");btn.textContent="Saving…"}
 else if(state==="saved"){btn.disabled=false;btn.classList.remove("busy");btn.classList.add("saved");btn.textContent="Saved!";setTimeout(()=>setSaveButtonState("idle"),1600)}
 else{btn.disabled=false;btn.classList.remove("busy","saved");btn.textContent=SAVE_LABEL}
}
function startRefreshTimer(){
 clearInterval(refreshTimer);
 refreshTimer=setInterval(()=>refresh(),Math.max(15,config.refreshSeconds||DEFAULT_REFRESH)*1000);
}
async function api(url,etagKey){
 if(!hasApiKey())throw Error("TBA key required");
 const h={"X-TBA-Auth-Key":config.tbaKey}; if(etags[etagKey])h["If-None-Match"]=etags[etagKey];
 const r=await fetch(url,{headers:h,cache:"no-store"}); if(r.status===304)return null;if(!r.ok)throw Error(`TBA ${r.status}`);
 const e=r.headers.get("ETag");if(e){etags[etagKey]=e;save(K.etags,etags)}return r.json();
}
async function fetchStatbotics(ids){
 let good=0;
 await Promise.allSettled(ids.map(async t=>{try{
  const r=await fetch(`https://api.statbotics.io/v3/team_year/${t}/${YEAR}`,{cache:"no-store"});if(!r.ok)throw 0;const d=await r.json();
  const total=+(d.epa?.total_points?.mean??d.epa?.total_points??d.epa?.mean??d.epa?.total??NaN);
  const wr=+(d.epa?.ranks?.total?.rank??d.epa?.rank?.total??d.epa_rank??NaN);
  epa[t]={total:Number.isFinite(total)?total:epa[t]?.total,rank:Number.isFinite(wr)?wr:epa[t]?.rank,source:"epa"};good++;
 }catch{}}));
 return good;
}
async function fetchTbaOprs(ids){
 if(!hasApiKey())return 0;
 const data=await api(`https://www.thebluealliance.com/api/v3/event/${config.eventKey}/oprs`,`o:${config.eventKey}`);
 if(!data){
  return ids.filter(t=>epa[t]?.source==="opr"&&Number.isFinite(epa[t]?.total)).length;
 }
 if(!data.oprs)return 0;
 const ranked=Object.entries(data.oprs).map(([k,v])=>({t:tn(k),total:+v})).filter(x=>Number.isFinite(x.total)).sort((a,b)=>b.total-a.total);
 ranked.forEach((x,i)=>{if(ids.includes(x.t))epa[x.t]={total:x.total,rank:i+1,source:"opr"};});
 return ids.filter(t=>Number.isFinite(epa[t]?.total)).length;
}
async function refreshPowerRatings(ids,notes){
 if(config.statbotics){
  const epaGood=await fetchStatbotics(ids);
  if(epaGood){save(K.epa,epa);syncPowerLabels();notes.push(`${epaGood} EPA`);return}
 }
 try{
  const data=await fetchTbaOprs(ids);
  if(data){save(K.epa,epa);syncPowerLabels();notes.push(`${data} OPR from TBA`);return}
  notes.push("OPR unavailable");
 }catch(e){notes.push(`OPR ${e.message||"cached"}`)}
 syncPowerLabels();
}
async function refresh(force=false){
 $("status").innerHTML='<span class="warn">Refreshing live data…</span>'; const notes=[];
 if(!hasApiKey())notes.push("TBA key not set");
 else{
 try{
  const data=await api(`https://www.thebluealliance.com/api/v3/event/${config.eventKey}/matches/simple`,`m:${config.eventKey}`);
  if(data){
   matches=data.filter(x=>x.comp_level==="qm"&&(x.alliances.red.team_keys.includes("frc"+team)||x.alliances.blue.team_keys.includes("frc"+team))).map(x=>({
    key:x.key,q:x.match_number,red:x.alliances.red.team_keys.map(tn),blue:x.alliances.blue.team_keys.map(tn),
    redScore:x.alliances.red.score>=0?x.alliances.red.score:null,blueScore:x.alliances.blue.score>=0?x.alliances.blue.score:null,
    predicted_time:x.predicted_time,actual_time:x.actual_time,post_result_time:x.post_result_time
   }));save(K.matches,matches);notes.push("matches updated")
  }else notes.push("matches unchanged");
 }catch(e){notes.push(`matches ${e.message||"cached"}`)}
 try{
  const data=await api(`https://www.thebluealliance.com/api/v3/event/${config.eventKey}/rankings`,`r:${config.eventKey}`);
  if(data){const n={};(data.rankings||[]).forEach(x=>{const t=tn(x.team_key);n[t]={rank:x.rank,record:`${x.record?.wins??0}-${x.record?.losses??0}-${x.record?.ties??0}`}});rankings=n;save(K.rankings,n);notes.push("ranks updated")}else notes.push("ranks unchanged");
 }catch(e){notes.push(`ranks ${e.message||"cached"}`)}
 try{
  const data=await api(`https://www.thebluealliance.com/api/v3/event/${config.eventKey}/teams/simple`,`t:${config.eventKey}`);
  if(data){data.forEach(x=>teams[tn(x.key)]=x.nickname||x.name);save(K.teams,teams);notes.push("names updated");renderHeader()}
 }catch(e){notes.push(`names ${e.message||"cached"}`)}
 }
 await refreshPowerRatings(allTeams(),notes);
 if(hasApiKey())await loadTeamEvents({autoPick:false});
 render();$("status").innerHTML=`<span class="ok">Updated ${new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</span> · ${notes.join(" · ")}`;
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab,.page").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("page-"+b.dataset.page).classList.add("active");if(b.dataset.page==="matches")scrollToLatestMatch()}));
$("nextContent").addEventListener("click",e=>{
 if(e.target.closest("[data-open-settings]"))openSettings();
 if(e.target.closest("[data-open-power-help]"))openPowerHelp();
});
$("powerHelpBtn").addEventListener("click",openPowerHelp);
$("refreshBtn").addEventListener("click",()=>refresh(true));
$("eventSelect").addEventListener("change",()=>{
 setEventKey($("eventSelect").value,{manual:true});
 localStorage.removeItem(K.matches);matches=[];
 refresh(true);
});
$("saveBtn").addEventListener("click",async()=>{
 setSaveButtonState("busy");
 try{
  const nextTeam=Math.max(1,+$("teamNumber").value||DEFAULT_TEAM), teamChanged=nextTeam!==team;
  config={eventKey:($("eventSelect").value||$("eventKey").value).trim(),tbaKey:$("tbaKey").value.trim(),refreshSeconds:Math.max(15,+$("refreshSeconds").value||DEFAULT_REFRESH),team:nextTeam,eventManual:config.eventManual,statbotics:$("statboticsEnabled").checked};
  save(K.config,config);team=nextTeam;
  if(teamChanged){config.eventManual=false;save(K.config,config);localStorage.removeItem(K.matches);localStorage.removeItem(K.teamEvents);matches=nextTeam===DEFAULT_TEAM?FALLBACK:[];teamEvents=[]}
  await loadTeamEvents({autoPick:teamChanged||!config.eventManual});
  await refresh(true);
  startRefreshTimer();
  setSaveButtonState("saved");
 }catch{setSaveButtonState("idle")}
});
$("clearBtn").addEventListener("click",()=>{Object.values(K).forEach(k=>localStorage.removeItem(k));location.reload()});
$("teamSearch").addEventListener("input",e=>{teamSearch=e.target.value;renderTeams()});
$("teamSort").addEventListener("change",e=>{teamSort=e.target.value;renderTeams()});
render();loadTeamEvents().then(()=>refresh());startRefreshTimer();
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
