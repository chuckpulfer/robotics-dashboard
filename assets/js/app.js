const DEFAULT_TEAM=10021, YEAR=2026, DEFAULT_REFRESH=300;
const K={config:"gg_config_v5",matches:"gg_matches_v1",rankings:"gg_rankings_v1",teams:"gg_teams_v1",epa:"gg_epa_v1",etags:"gg_etags_v1",teamEvents:"gg_team_events_v2",allTeams:"gg_all_teams_v1",allMatches:"gg_all_matches_v1",alliances:"gg_alliances_v1",playoffs:"gg_playoffs_v1",teamLoc:"gg_team_loc_v1"};
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
let allTeamsCache=load(K.allTeams,null), allTeamsLoading=false, selectedTeam=team;
let teamLocations=load(K.teamLoc,{});
let allMatches=load(K.allMatches,{});
let allianceData=load(K.alliances,{}), playoffMatches=load(K.playoffs,{});
let powerSource="cached", powerLabel="EPA", rankLabel="World", teamSearch="", teamSort="event";
setPickerTeam(team);updateTeamDirNote();$("eventKey").value=config.eventKey;$("tbaKey").value=config.tbaKey||"";$("refreshSeconds").value=config.refreshSeconds||DEFAULT_REFRESH;$("statboticsEnabled").checked=!!config.statbotics;
syncEventUI();renderEventSelect();

function hasApiKey(){return!!config.tbaKey?.trim()}
function teamDirectory(){return {...NAMES,...(allTeamsCache?.teams||{}),...teams}}
async function loadAllTeams(force=false){
 if(!hasApiKey()||allTeamsLoading)return;
 if(!force&&allTeamsCache)return;
 allTeamsLoading=true;
 const t={};
 await Promise.allSettled([...Array(26).keys()].map(async p=>{
  const r=await fetch(`https://www.thebluealliance.com/api/v3/teams/${p}/simple`,{headers:{"X-TBA-Auth-Key":config.tbaKey},cache:"no-store"});
  if(!r.ok)return;
  (await r.json()).forEach(x=>{t[tn(x.key)]=x.nickname||x.name});
 }));
 allTeamsLoading=false;
 if(Object.keys(t).length){
  allTeamsCache={updated:Date.now(),teams:t};save(K.allTeams,allTeamsCache);
  if(document.activeElement===$("teamPicker"))renderTeamPickerList();
 }
 updateTeamDirNote();
}
function updateTeamDirNote(){
 const n=Object.keys(allTeamsCache?.teams||{}).length;
 $("teamDirNote").textContent=n?`${n} teams cached · updated ${new Date(allTeamsCache.updated).toLocaleDateString()}`:hasApiKey()?"Team directory not downloaded yet.":"Add a TBA API key to download the full team directory.";
}
function teamPickerMatches(q){
 const s=(q||"").toLowerCase().trim();
 if(!s)return [];
 const dir=teamDirectory(), numeric=/^\d+$/.test(s);
 return Object.entries(dir)
  .filter(([n,name])=>numeric?String(n).startsWith(s):(name||"").toLowerCase().includes(s)||String(n).startsWith(s))
  .sort((a,b)=>+a[0]-+b[0]).slice(0,25);
}
function setPickerTeam(n){
 selectedTeam=+n;
 const name=teamDirectory()[n];
 $("teamPicker").value=`${n}${name?" · "+name:""}`;
 $("teamPickerList").hidden=true;
}
function pickerTeamValue(){
 const m=$("teamPicker").value.trim().match(/^\d+/);
 return m?+m[0]:selectedTeam;
}
function renderTeamPickerList(){
 const list=$("teamPickerList"), items=teamPickerMatches($("teamPicker").value);
 if(!items.length){list.hidden=true;list.innerHTML="";return}
 list.innerHTML=items.map(([n,name])=>`<button type="button" data-team="${n}"><b>${n}</b><span>${name||"Team "+n}</span></button>`).join("");
 list.hidden=false;
}
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
function allTeams(){return [...new Set(matches.flatMap(m=>[...m.red,...m.blue]))]};
function allEventTeams(){return Object.keys(rankings).map(Number).sort((a,b)=>a-b)}
function teamMatchesSearch(t,q){
 if(!q)return true;
 const name=(teams[t]||"").toLowerCase(), query=q.toLowerCase().trim();
 return String(t).includes(query)||name.includes(query);
}
function sortedTeams(){
 const list=allEventTeams();
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
function teamNextMatch(t){
 const list=allMatches[config.eventKey]||[];
 return list.filter(m=>!matchDone(m)&&(m.red.includes(t)||m.blue.includes(t))).sort((a,b)=>a.q-b.q)[0]||null;
}
function teamNextLabel(t){
 const m=teamNextMatch(t); if(!m)return "—";
 const at=fmtMatchTime(m);
 return `Q${m.q}${at?" · "+at:""}`;
}
function teamTableRow(t){
 const s=epa[t]||{}, r=rankings[t]||{};
 return `<div class="team-item ${t===team?"my-team":""}" data-team="${t}"><div class="team-num">${t}${t===team?" ⭐":""}</div><div class="team-name">${teams[t]||"Team "+t}</div><div class="stat">${rank(r.rank)}</div><div class="stat">${rank(s.rank)}</div><div class="stat">${fmt(s.total)}</div><div class="stat">${r.record||"—"}</div><div class="stat next">${teamNextLabel(t)}</div></div>`;
}
async function fetchTeamLocation(t){
 if(teamLocations[t]||!hasApiKey())return teamLocations[t]||null;
 try{
  const data=await api(`https://www.thebluealliance.com/api/v3/team/frc${t}/simple`,`loc:${t}`);
  if(data){teamLocations[t]={city:data.city,state:data.state_prov,country:data.country};save(K.teamLoc,teamLocations)}
 }catch{}
 return teamLocations[t]||null;
}
function teamLocationText(t){
 const loc=teamLocations[t];
 if(!loc)return hasApiKey()?"Loading location…":"Add a TBA API key to load location.";
 return [loc.city,loc.state,loc.country&&loc.country!=="USA"?loc.country:null].filter(Boolean).join(", ")||"—";
}
function teamDetailHtml(t){
 const name=teamDirectory()[t]||"Team "+t, r=rankings[t]||{}, s=epa[t]||{};
 return `<h3>${t} · ${name}${t===team?" ⭐":""}</h3>
 <div class="teamstats">
  <div class="tiny"><b>${rank(r.rank)}</b><span>Event rank</span></div>
  <div class="tiny"><b>${r.record||"—"}</b><span>Qual record</span></div>
  <div class="tiny"><b>${rank(s.rank)}</b><span>${rankLabel}</span></div>
  <div class="tiny"><b>${fmt(s.total)}</b><span>${powerLabel}</span></div>
 </div>
 <div class="tdloc">${teamLocationText(t)}</div>`;
}
function openTeamDetail(t){
 $("teamDetailBody").innerHTML=teamDetailHtml(t);
 $("teamDetail").showModal();
 fetchTeamLocation(t).then(()=>{if($("teamDetail").open)$("teamDetailBody").innerHTML=teamDetailHtml(t)});
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
function fmtMatchTime(m){return fmtUnixTime(m?.predicted_time||m?.time)}
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
 const sorted=myMatchList();
 const played=sorted.filter(matchDone);
 if(played.length)return played[played.length-1];
 return sorted.find(m=>!matchDone(m))||sorted[sorted.length-1];
}
function scrollToLatestMatch(){
 const m=latestMatchTarget(); if(!m?.key)return;
 requestAnimationFrame(()=>document.getElementById("match-"+m.key)?.scrollIntoView({behavior:"smooth",block:"center"}));
}
function nextMatch(){
 const sorted=myMatchList(); return sorted.find(m=>!matchDone(m))||sorted[sorted.length-1];
}
function probability(m){
 const re=m.red.reduce((a,t)=>a+(+epa[t]?.total||0),0), be=m.blue.reduce((a,t)=>a+(+epa[t]?.total||0),0);
 if(!re&&!be)return null; const p=1/(1+Math.exp(-(re-be)/12)); return {red:Math.round(p*100),blue:Math.round((1-p)*100),re,be};
}
function myStatusHtml(){
 const r=rankings[team], al=eventAlliances(), myA=myAllianceNum(), a=myA?al[myA-1]:null;
 const cells=[
  `<div class="metric"><b>${rank(r?.rank)}</b><span>Event rank</span></div>`,
  `<div class="metric"><b>${r?.record||"—"}</b><span>Qual record</span></div>`
 ];
 if(a){
  const pickIdx=(a.picks||[]).findIndex(k=>tn(k)===team);
  const role=pickIdx===0?"Captain":pickIdx>0?`Pick ${pickIdx}`:"Backup";
  cells.push(`<div class="metric"><b>A${myA}</b><span>${role}</span></div>`);
  const s=a.status||{}, rec=s.record?`${s.record.wins??0}-${s.record.losses??0}${s.record.ties?"-"+s.record.ties:""}`:"—";
  const won=s.status==="won"||(finalsSeriesWins(bracketState())[myA]||0)>=2;
  const stat=won?["🏆 Won","good"]:s.status==="eliminated"?["Out","bad"]:["In","good"];
  cells.push(`<div class="metric ${stat[1]}"><b>${stat[0]}</b><span>Playoffs · ${rec}</span></div>`);
 }else if(al.length){
  cells.push(`<div class="metric bad"><b>—</b><span>Not selected for playoffs</span></div>`);
 }
 return `<div class="hero mystatus"><div class="metrics m${cells.length}">${cells.join("")}</div></div>`;
}
function renderNext(){
 const keyReminder=!hasApiKey()?'<div class="alert">Add your TBA read API key in <button type="button" class="alert-link" data-open-settings>Settings</button> to load live schedules, rankings, and team names.</div>':"";
 const top=keyReminder+myStatusHtml();
 const list=myMatchList();
 const m=list.find(x=>!matchDone(x))||list[list.length-1];
 if(!m){$("nextContent").innerHTML=top+'<div class="empty">No matches loaded.</div>';return}
 const after=`<h2 class="section-title">After this</h2>${list.filter(x=>matchOrd(x)>matchOrd(m)).slice(0,2).map(matchCard).join("")||'<div class="empty">No later matches.</div>'}`;
 if(m.pending){$("nextContent").innerHTML=top+pendingCard(m,true)+after;return}
 const p=probability(m), mine=m.red.includes(team)?"RED":"BLUE";
 const played=matchPlayTime(m), est=fmtMatchTime(m);
 const whenLabel=matchHasScore(m)?(played?`Final · ${played}`:"Final"):matchDone(m)?(played?`Played · ${played}`:"Pending"):est?`Est. ${est}`:"Time not posted";
 $("nextContent").innerHTML=`${top}<div class="hero"><div class="eyebrow">Next match · ${mine} alliance</div><div class="hero-title">${matchLabel(m)}</div>
 <div class="countdown">${whenLabel}</div>
 ${p?`<div class="metrics"><div class="metric"><b>${fmt(p.re)}</b><span>Red ${powerLabel}</span></div><div class="metric"><b>${p.red}%</b><span>Red estimate</span></div><div class="metric"><b>${fmt(p.be)}</b><span>Blue ${powerLabel}</span></div></div><button type="button" class="helpbtn power-help-inline" data-open-power-help aria-label="Explain ${powerLabel}">?</button>`:""}
 ${matchHasScore(m)?matchScoreboard(m):""}
 ${alliance("red",m.red,matchWinner(m)==="red")}${alliance("blue",m.blue,matchWinner(m)==="blue")}</div>
 ${after}`;
}
function matchCard(m){
 if(m.pending)return pendingCard(m);
 const meta=matchCardMeta(m), w=matchWinner(m);
 return `<div class="hero" id="match-${m.key}"><div class="eyebrow">${matchLabel(m)}</div><div class="score ${meta.cls}">${meta.text}</div>${matchHasScore(m)?matchScoreboard(m):""}${alliance("red",m.red,w==="red")}${alliance("blue",m.blue,w==="blue")}</div>`;
}
function renderMatches(){$("matchList").innerHTML=myMatchList().map(matchCard).join("")}
function closestMatchToNow(allMatches){
 const now=Date.now()/1000;
 return allMatches.sort((a,b)=>{
  const aDist=Math.abs((a.predicted_time||a.time||a.actual_time||a.post_result_time||0)-now);
  const bDist=Math.abs((b.predicted_time||b.time||b.actual_time||b.post_result_time||0)-now);
  return aDist-bDist;
 })[0];
}
async function renderAllMatches(){
 const eventMatches=allMatches[config.eventKey]||await fetchAllEventMatches();
 if(!eventMatches.length){
  $("allMatchList").innerHTML=!hasApiKey()?'<div class="alert">Add your TBA read API key in <button type="button" class="alert-link" data-open-settings>Settings</button> to load the full event schedule.</div>':'<div class="empty">No event matches loaded yet.</div>';
  return;
 }
 $("allMatchList").innerHTML=[...eventMatches].sort((a,b)=>a.q-b.q).map(matchCard).join("");
 const closest=closestMatchToNow(eventMatches);
 if(closest?.key)requestAnimationFrame(()=>document.getElementById("match-"+closest.key)?.scrollIntoView({behavior:"auto",block:"center"}));
}
function renderTeams(){
 const q=teamSearch, list=sortedTeams().filter(t=>teamMatchesSearch(t,q));
 if(!list.length){$("teamList").innerHTML='<div class="empty">No teams match your search.</div>';return}
 $("teamList").innerHTML=`<div class="teams-header">
 <button data-sort="number" class="header-btn ${teamSort==="number"?"active":""}">Team</button><button data-sort="name" class="header-btn ${teamSort==="name"?"active":""}">Name</button>
 <button data-sort="event" class="header-btn ${teamSort==="event"?"active":""}">Event</button><button data-sort="power" class="header-btn ${teamSort==="power"?"active":""}">Wld</button><button data-sort="power" class="header-btn stat-btn">Pwr</button><button data-sort="event" class="header-btn stat-btn">Rec</button><div class="stat-label">Next</div>
 </div>${list.map(teamTableRow).join("")}`;
}
// FRC double-elimination bracket (2023+): sf sets 1-13, then best-of-3 finals.
// Feeds: A=alliance seed, W=winner of match n, L=loser of match n.
const BRACKET={
 1:{r:1,b:"upper",feeds:["A1","A8"]},
 2:{r:1,b:"upper",feeds:["A4","A5"]},
 3:{r:1,b:"upper",feeds:["A2","A7"]},
 4:{r:1,b:"upper",feeds:["A3","A6"]},
 5:{r:2,b:"lower",feeds:["L1","L2"]},
 6:{r:2,b:"lower",feeds:["L3","L4"]},
 7:{r:2,b:"upper",feeds:["W1","W2"]},
 8:{r:2,b:"upper",feeds:["W3","W4"]},
 9:{r:3,b:"lower",feeds:["L7","W6"]},
 10:{r:3,b:"lower",feeds:["L8","W5"]},
 11:{r:4,b:"upper",feeds:["W7","W8"]},
 12:{r:4,b:"lower",feeds:["W9","W10"]},
 13:{r:5,b:"lower",feeds:["L11","W12"]}
};
const BRACKET_ROUNDS=[[1,[1,2,3,4]],[2,[5,6,7,8]],[3,[9,10]],[4,[11,12]],[5,[13]]];
function eventAlliances(){return allianceData[config.eventKey]||[]}
function eventPlayoffs(){return playoffMatches[config.eventKey]||[]}
function allianceNumByTeam(){
 const m={};
 eventAlliances().forEach((a,i)=>{
  (a.picks||[]).forEach(k=>m[tn(k)]=i+1);
  if(a.backup?.in)m[tn(a.backup.in)]=i+1;
 });
 return m;
}
function matchAllianceNum(m,side,map){for(const t of m[side]||[]){if(map[t])return map[t]}return null}
function setGames(s){return eventPlayoffs().filter(m=>m.comp==="sf"&&m.set===s).sort((a,b)=>a.q-b.q)}
function finalsGames(){return eventPlayoffs().filter(m=>m.comp==="f").sort((a,b)=>a.q-b.q)}
function bracketState(){
 const map=allianceNumByTeam(), win={}, lose={};
 for(let s=1;s<=13;s++){
  for(const g of setGames(s)){
   const w=matchWinner(g);
   if(w&&w!=="tie"){win[s]=matchAllianceNum(g,w,map);lose[s]=matchAllianceNum(g,w==="red"?"blue":"red",map)}
  }
 }
 return {map,win,lose};
}
function resolveFeed(feed,st){
 const kind=feed[0], n=+feed.slice(1);
 if(kind==="A")return {num:n,label:`Seed ${n}`};
 return {num:(kind==="W"?st.win:st.lose)[n]||null,label:`${kind==="W"?"Winner":"Loser"} of M${n}`};
}
function allianceTeamNums(num){
 const a=eventAlliances()[num-1];
 return a?(a.picks||[]).map(tn):[];
}
function teamListHtml(list){
 return list.map(t=>`<span class="tnum-tap${t===team?" mine":""}" data-team="${t}">${t}</span>`).join(" · ")||"—";
}
function bracketRow(side,g,st){
 const num=matchAllianceNum(g,side,st.map), won=matchWinner(g)===side;
 const score=Number.isFinite(g[side+"Score"])?g[side+"Score"]:"—";
 return `<div class="prow ${side}${won?" won":""}"><span class="apill">${num?"A"+num:"–"}</span><span class="pteams">${teamListHtml(g[side])}</span><span class="pscore">${score}</span></div>`;
}
function feedRow(feed,st){
 const r=resolveFeed(feed,st);
 const teamsTxt=r.num?teamListHtml(allianceTeamNums(r.num)):r.label;
 const hint=r.num&&feed[0]!=="A"?` <span class="feedhint">(${r.label})</span>`:"";
 return `<div class="prow tbd"><span class="apill">${r.num?"A"+r.num:"?"}</span><span class="pteams">${teamsTxt}${hint}</span><span class="pscore">—</span></div>`;
}
function matchLabel(m){
 const comp=m.comp||"qm";
 if(comp==="qm")return `Qualification ${m.q}`;
 if(comp==="f")return `Final ${m.q}`;
 if(comp==="sf"&&BRACKET[m.set])return `Playoff M${m.set} · ${BRACKET[m.set].b} bracket`;
 const names={ef:"Octofinal",qf:"Quarterfinal",sf:"Semifinal"};
 return `${names[comp]||comp} ${m.set} · Game ${m.q}`;
}
function matchOrd(m){
 const comp=m.comp||"qm";
 if(comp==="qm")return m.q;
 if(comp==="f")return 100000+(m.q||0);
 return ({ef:10000,qf:20000,sf:30000}[comp]||30000)+(m.set||0)*10+(m.q||0);
}
function myAllianceNum(){return allianceNumByTeam()[team]||null}
// Bracket slots my alliance is already locked into but TBA has not posted a lineup for yet.
function pendingSlots(){
 const myA=myAllianceNum(); if(!myA)return [];
 const st=bracketState();
 const slot=(feeds,base,ref)=>{
  const r=feeds.map(f=>resolveFeed(f,st));
  if(!r.some(f=>f.num===myA))return null;
  const opp=r.find(f=>f.num!==myA)||{};
  return {...base,pending:true,red:allianceTeamNums(myA),blue:opp.num?allianceTeamNums(opp.num):[],
   oppNum:opp.num||null,oppLabel:opp.label,redScore:null,blueScore:null,predicted_time:ref?.predicted_time};
 };
 for(let s=1;s<=13;s++){
  const games=setGames(s), g=games[games.length-1];
  if((g&&g.red?.length)||games.some(matchHasScore))continue;
  const out=slot(BRACKET[s].feeds,{key:"pending_sf"+s,comp:"sf",set:s,q:1},g);
  if(out)return [out];
 }
 if(!finalsGames().some(x=>x.red?.length)){
  const out=slot(["W11","W13"],{key:"pending_f",comp:"f",set:1,q:1},finalsGames()[0]);
  if(out)return [out];
 }
 return [];
}
function myMatchList(){
 const quals=(matches||[]).map(m=>m.comp?m:{...m,comp:"qm"});
 const po=eventPlayoffs().filter(m=>(m.red||[]).includes(team)||(m.blue||[]).includes(team));
 return [...quals,...po,...pendingSlots()].sort((a,b)=>matchOrd(a)-matchOrd(b));
}
function pendingCard(m,hero=false){
 const est=fmtMatchTime(m);
 const when=est?`Est. ${est}`:m.oppNum?"Match time not posted yet":"Waiting on earlier results";
 const oppTxt=m.blue.length?teamListHtml(m.blue)+(m.oppLabel?` <span class="feedhint">(${m.oppLabel})</span>`:""):(m.oppLabel||"TBD");
 const rows=`<div class="prow tbd"><span class="apill">${myAllianceNum()?"A"+myAllianceNum():"?"}</span><span class="pteams">${teamListHtml(m.red)}</span><span class="pscore">—</span></div>
 <div class="prow tbd"><span class="apill">${m.oppNum?"A"+m.oppNum:"?"}</span><span class="pteams">${oppTxt}</span><span class="pscore">—</span></div>`;
 return `<div class="hero" id="match-${m.key}"><div class="eyebrow">${hero?"Next match · playoffs":matchLabel(m)}</div>${hero?`<div class="hero-title">${matchLabel(m)}</div>`:""}<div class="countdown">${when}</div>${rows}</div>`;
}
function bracketMatchCard(s,st){
 const info=BRACKET[s], games=setGames(s), g=games[games.length-1];
 const meta=g?matchCardMeta(g):{text:"Not scheduled",cls:"pending"};
 const rows=g&&g.red?.length?bracketRow("red",g,st)+bracketRow("blue",g,st):info.feeds.map(f=>feedRow(f,st)).join("");
 return `<div class="pmatch"><div class="pmeta"><span class="mnum">M${s}</span><span class="btag ${info.b}">${info.b}</span><span class="ptime ${meta.cls}">${meta.text}</span></div>${rows}</div>`;
}
function finalsSeriesWins(st){
 const wins={};
 finalsGames().forEach(g=>{
  const w=matchWinner(g);
  if(w&&w!=="tie"){const n=matchAllianceNum(g,w,st.map);if(n)wins[n]=(wins[n]||0)+1}
 });
 return wins;
}
function finalsHtml(st){
 const games=finalsGames(), wins=finalsSeriesWins(st);
 const tally=Object.keys(wins).length?` · Series ${Object.entries(wins).map(([n,w])=>`A${n} ${w}`).join(" – ")}`:"";
 let cards;
 if(games.length){
  cards=games.map(g=>{
   const meta=matchCardMeta(g);
   const rows=g.red?.length?bracketRow("red",g,st)+bracketRow("blue",g,st):["W11","W13"].map(f=>feedRow(f,st)).join("");
   return `<div class="pmatch"><div class="pmeta"><span class="mnum">Final ${g.q}</span><span class="ptime ${meta.cls}">${meta.text}</span></div>${rows}</div>`;
  }).join("");
 }else{
  cards=`<div class="pmatch"><div class="pmeta"><span class="mnum">Finals</span><span class="ptime pending">Not scheduled</span></div>${["W11","W13"].map(f=>feedRow(f,st)).join("")}</div>`;
 }
 return `<div class="round-title">Finals · Best of 3${tally}</div><div class="pgrid">${cards}</div>`;
}
function legacyPlayoffHtml(st){
 const names={ef:"Octofinal",qf:"Quarterfinal",sf:"Semifinal",f:"Final"}, order={ef:0,qf:1,sf:2,f:3};
 const sorted=[...eventPlayoffs()].sort((a,b)=>(order[a.comp]??9)-(order[b.comp]??9)||a.set-b.set||a.q-b.q);
 return `<h2 class="section-title">Playoff matches</h2><div class="pgrid">`+sorted.map(g=>{
  const meta=matchCardMeta(g);
  const rows=g.red?.length?bracketRow("red",g,st)+bracketRow("blue",g,st):"";
  return `<div class="pmatch"><div class="pmeta"><span class="mnum">${names[g.comp]||g.comp} ${g.set} · Game ${g.q}</span><span class="ptime ${meta.cls}">${meta.text}</span></div>${rows}</div>`;
 }).join("")+`</div>`;
}
function allianceCard(a,idx){
 const num=idx+1, dir=teamDirectory(), s=a.status||{}, stat=s.status;
 const badge=stat==="won"?'<span class="abadge won">🏆 Winners</span>':stat==="eliminated"?'<span class="abadge out">Eliminated</span>':stat==="playing"?'<span class="abadge live">Playing</span>':"";
 const rec=s.record?`Playoff record ${s.record.wins??0}-${s.record.losses??0}${s.record.ties?"-"+s.record.ties:""}`:"";
 const roles=["Captain","Pick 1","Pick 2","Pick 3"];
 const row=(t,role)=>`<div class="ateam ${t===team?"mine":""}"><span class="arole">${role}</span><span class="tnum tnum-tap" data-team="${t}">${t}</span><span class="tname">${dir[t]||"Team "+t}</span></div>`;
 const rows=(a.picks||[]).map((k,i)=>row(tn(k),roles[i]||"Pick "+i)).join("")+(a.backup?.in?row(tn(a.backup.in),"Backup"):"");
 const mine=(a.picks||[]).some(k=>tn(k)===team)||tn(a.backup?.in)===team;
 return `<div class="acard${stat==="eliminated"?" out":""}${mine?" minecard":""}"><div class="ahdr"><span class="aseed">Alliance ${num}</span>${badge}</div>${rows}${rec?`<div class="arec">${rec}</div>`:""}</div>`;
}
function renderPlayoffs(){
 const el=$("playoffContent"); if(!el)return;
 const alliances=eventAlliances(), po=eventPlayoffs();
 const keyReminder=!hasApiKey()?'<div class="alert">Add your TBA read API key in <button type="button" class="alert-link" data-open-settings>Settings</button> to load alliances and playoff results.</div>':"";
 if(!alliances.length&&!po.length){
  el.innerHTML=keyReminder+'<div class="empty">Alliances and the playoff bracket will appear here once alliance selection is posted to The Blue Alliance.</div>';
  return;
 }
 const st=bracketState(), wins=finalsSeriesWins(st);
 let champ=alliances.findIndex(a=>a.status?.status==="won")+1;
 if(!champ){const e=Object.entries(wins).find(([,w])=>w>=2);if(e)champ=+e[0]}
 const champHtml=champ?`<div class="champ">🏆 Alliance ${champ} wins the event${allianceTeamNums(champ).length?`<span class="champteams">${allianceTeamNums(champ).join(" · ")}</span>`:""}</div>`:"";
 const aHtml=alliances.length?`<h2 class="section-title">Alliances</h2><div class="agrid">${alliances.map((a,i)=>allianceCard(a,i)).join("")}</div>`:"";
 let bHtml="";
 if(po.some(m=>m.comp==="qf"||m.comp==="ef"))bHtml=legacyPlayoffHtml(st);
 else if(po.length||alliances.length){
  bHtml=`<h2 class="section-title">Bracket</h2>`+BRACKET_ROUNDS.map(([r,ms])=>
   `<div class="round-title">Round ${r}</div><div class="pgrid">${ms.map(s=>bracketMatchCard(s,st)).join("")}</div>`
  ).join("")+finalsHtml(st);
 }
 el.innerHTML=keyReminder+champHtml+aHtml+bHtml;
}
function render(){renderHeader();renderNext();renderMatches();renderAllMatches();renderTeams();renderPlayoffs()}
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
function mapTbaMatch(x){
 return {
  key:x.key,comp:x.comp_level,set:x.set_number,q:x.match_number,
  red:x.alliances.red.team_keys.map(tn),blue:x.alliances.blue.team_keys.map(tn),
  redScore:x.alliances.red.score>=0?x.alliances.red.score:null,blueScore:x.alliances.blue.score>=0?x.alliances.blue.score:null,
  time:x.time,predicted_time:x.predicted_time,actual_time:x.actual_time,post_result_time:x.post_result_time
 };
}
async function fetchAllEventMatches(){
 if(!hasApiKey())return allMatches[config.eventKey]||[];
 try{
  const data=await api(`https://www.thebluealliance.com/api/v3/event/${config.eventKey}/matches/simple`,`am:${config.eventKey}`);
  if(data){
   allMatches[config.eventKey]=data.filter(x=>x.comp_level==="qm").map(mapTbaMatch);
   playoffMatches[config.eventKey]=data.filter(x=>x.comp_level!=="qm").map(mapTbaMatch);
   save(K.allMatches,allMatches);
   save(K.playoffs,playoffMatches);
  }
 }catch{}
 return allMatches[config.eventKey]||[];
}
async function fetchAlliances(){
 if(!hasApiKey())return;
 try{
  const data=await api(`https://www.thebluealliance.com/api/v3/event/${config.eventKey}/alliances`,`al:${config.eventKey}`);
  if(data){allianceData[config.eventKey]=data;save(K.alliances,allianceData)}
 }catch{}
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
 $("statusTime").innerHTML='<span class="warn">Refreshing…</span>';
 $("statusDetail").innerHTML='<span class="warn">Refreshing live data…</span>'; const notes=[];
 if(!hasApiKey())notes.push("TBA key not set");
 else{
 try{
  const data=await api(`https://www.thebluealliance.com/api/v3/event/${config.eventKey}/matches/simple`,`m:${config.eventKey}`);
  if(data){
   matches=data.filter(x=>x.comp_level==="qm"&&(x.alliances.red.team_keys.includes("frc"+team)||x.alliances.blue.team_keys.includes("frc"+team))).map(mapTbaMatch);
   save(K.matches,matches);notes.push("matches updated")
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
 await fetchAllEventMatches();
 await fetchAlliances();
 render();
 const t=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
 $("statusTime").innerHTML=`<span class="ok">Updated ${t}</span>`;
 $("statusDetail").innerHTML=`<span class="ok">Updated ${t}</span> · ${notes.join(" · ")}`;
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab,.page").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("page-"+b.dataset.page).classList.add("active");if(b.dataset.page==="matches")scrollToLatestMatch();if(b.dataset.page==="allmatches")renderAllMatches();if(b.dataset.page==="playoffs")renderPlayoffs()}));
$("nextContent").addEventListener("click",e=>{
 if(e.target.closest("[data-open-settings]"))openSettings();
 if(e.target.closest("[data-open-power-help]"))openPowerHelp();
});
$("allMatchList").addEventListener("click",e=>{
 if(e.target.closest("[data-open-settings]"))openSettings();
});
$("playoffContent").addEventListener("click",e=>{
 if(e.target.closest("[data-open-settings]"))openSettings();
 const tb=e.target.closest("[data-team]");
 if(tb)openTeamDetail(+tb.dataset.team);
});
$("teamDetailClose").addEventListener("click",()=>$("teamDetail").close());
$("teamDetail").addEventListener("click",e=>{if(e.target===$("teamDetail"))$("teamDetail").close()});
$("powerHelpBtn").addEventListener("click",openPowerHelp);
$("refreshBtn").addEventListener("click",()=>refresh(true));
$("eventSelect").addEventListener("change",()=>{
 setEventKey($("eventSelect").value,{manual:true});
 localStorage.removeItem(K.matches);matches=[];
 delete allMatches[config.eventKey];
 delete playoffMatches[config.eventKey];
 delete allianceData[config.eventKey];
 refresh(true);
});
$("teamPicker").addEventListener("input",renderTeamPickerList);
$("teamPicker").addEventListener("focus",()=>{loadAllTeams();renderTeamPickerList()});
$("teamPicker").addEventListener("blur",()=>setTimeout(()=>{$("teamPickerList").hidden=true},150));
$("teamPickerList").addEventListener("pointerdown",e=>{
 const b=e.target.closest("[data-team]");
 if(b){e.preventDefault();setPickerTeam(+b.dataset.team)}
});
$("refreshTeamsBtn").addEventListener("click",async()=>{
 const b=$("refreshTeamsBtn");
 if(!hasApiKey()){updateTeamDirNote();return}
 b.disabled=true;b.textContent="Downloading…";
 await loadAllTeams(true);
 b.disabled=false;b.textContent="Update team list";
});
$("saveBtn").addEventListener("click",async()=>{
 setSaveButtonState("busy");
 try{
  const nextTeam=Math.max(1,+pickerTeamValue()||DEFAULT_TEAM), teamChanged=nextTeam!==team;
  config={eventKey:($("eventSelect").value||$("eventKey").value).trim(),tbaKey:$("tbaKey").value.trim(),refreshSeconds:Math.max(15,+$("refreshSeconds").value||DEFAULT_REFRESH),team:nextTeam,eventManual:config.eventManual,statbotics:$("statboticsEnabled").checked};
  save(K.config,config);team=nextTeam;
  if(teamChanged){config.eventManual=false;save(K.config,config);localStorage.removeItem(K.matches);localStorage.removeItem(K.teamEvents);matches=nextTeam===DEFAULT_TEAM?FALLBACK:[];teamEvents=[]}
  setPickerTeam(team);
  await loadTeamEvents({autoPick:teamChanged||!config.eventManual});
  await refresh(true);
  startRefreshTimer();
  setSaveButtonState("saved");
 }catch{setSaveButtonState("idle")}
});
$("clearBtn").addEventListener("click",()=>{Object.values(K).forEach(k=>localStorage.removeItem(k));location.reload()});
$("teamSearch").addEventListener("input",e=>{teamSearch=e.target.value;renderTeams()});
$("teamList").addEventListener("click",e=>{
 const btn=e.target.closest("[data-sort]");
 if(btn){teamSort=btn.dataset.sort;renderTeams();return}
 const row=e.target.closest("[data-team]");
 if(row)openTeamDetail(+row.dataset.team);
});
render();loadTeamEvents().then(()=>refresh());startRefreshTimer();
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));

// Detect when a newer build has been deployed and reload the whole app.
const APP_VERSION=document.querySelector('meta[name="app-version"]')?.content||"";
const VERSION_CHECK_MS=5*60*1000;
let reloading=false;
async function checkForUpdate(){
 // Skip when unstamped (local/dev) or when the tab is hidden.
 if(reloading||!APP_VERSION||APP_VERSION==="__APP_VERSION__"||document.hidden)return;
 try{
  const r=await fetch("./version.json?_="+Date.now(),{cache:"no-store"});
  if(!r.ok)return;
  const latest=(await r.json()).version;
  if(latest&&latest!==APP_VERSION){
   reloading=true;
   showUpdateBanner();
   await new Promise(res=>setTimeout(res,2500));
   try{if("serviceWorker"in navigator){const rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(x=>x.unregister()))}}catch{}
   try{if(window.caches){const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)))}}catch{}
   location.reload();
  }
 }catch{}
}
function showUpdateBanner(){
 if(document.getElementById("updateBanner"))return;
 const b=document.createElement("div");
 b.id="updateBanner";
 b.className="update-banner";
 b.textContent="A new version is available — refreshing…";
 document.body.appendChild(b);
}
setInterval(checkForUpdate,VERSION_CHECK_MS);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkForUpdate()});
checkForUpdate();
