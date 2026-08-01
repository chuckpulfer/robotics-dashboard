const DEFAULT_TEAM=10021, YEAR=2026, DEFAULT_REFRESH=300;
const K={config:"gg_config_v5",matches:"gg_matches_v1",rankings:"gg_rankings_v1",teams:"gg_teams_v1",epa:"gg_epa_v1",etags:"gg_etags_v1",teamEvents:"gg_team_events_v2",allTeams:"gg_all_teams_v2",activeTeams:"gg_active_teams_v1",teamPower:"gg_team_power_v1",recentFilters:"gg_recent_filters_v1",allPrefs:"gg_all_prefs_v1",webcasts:"gg_webcasts_v1",eventOpr:"gg_event_opr_v1",allMatches:"gg_all_matches_v1",alliances:"gg_alliances_v1",playoffs:"gg_playoffs_v1",teamLoc:"gg_team_loc_v1",allEvents:"gg_all_events_v1",research:"gg_research_v1",teamSeason:"gg_team_season_v1",recentTeams:"gg_recent_teams_v1",recentEvents:"gg_recent_events_v1"};
const RECENT_TEAMS_MAX=20, RECENT_EVENTS_MAX=20;
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
// Stamped with the commit SHA at deploy time; left as the placeholder when run locally.
const APP_VERSION=document.querySelector('meta[name="app-version"]')?.content||"";
const VERSION_STAMPED=!!APP_VERSION&&APP_VERSION!=="__APP_VERSION__";
const load=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
let config=load(K.config,{eventKey:"2026iri",tbaKey:"",refreshSeconds:DEFAULT_REFRESH,team:DEFAULT_TEAM,eventManual:false,statbotics:false});
let team=+config.team||DEFAULT_TEAM;
let teamEvents=(()=>{const c=load(K.teamEvents,null);return c?.team===team?c.events||[]:[]})();
let matches=load(K.matches,null);
if(!matches?.some(m=>m.red.includes(team)||m.blue.includes(team)))matches=team===DEFAULT_TEAM?FALLBACK:[];
let rankings=load(K.rankings,{}), teams={...NAMES,...load(K.teams,{})}, epa=load(K.epa,{}), etags=load(K.etags,{});
let allTeamsCache=load(K.allTeams,null), allTeamsLoading=false;
// The All teams tab. activeTeams is the set that competed this season; teamPower is a
// catalogue of the best OPR seen for each team, filled in from every event loaded.
let activeTeams=load(K.activeTeams,null), activeTeamsLoading=false;
let teamPower=load(K.teamPower,{});
// Active teams default to on: the whole directory includes every team that ever
// existed, and the ones competing this season are almost always what is wanted.
const allPrefs=Object.assign({mode:"teams",activeOnly:true},load(K.allPrefs,{}));
let allTeamSearch="", activeOnly=allPrefs.activeOnly!==false, allMode=allPrefs.mode==="events"?"events":"teams", allTeamsShown=0;
// isActiveTeam is asked once per team in the directory — about ten thousand times per
// keystroke — so scanning the array each time made typing crawl. Built once, reset
// whenever the list is replaced. Declared up here with the rest of the tab's state:
// the first render happens during start-up, before the old declaration site was reached.
let activeTeamSet=null;
function saveAllPrefs(){save(K.allPrefs,{mode:allMode,activeOnly})}
const ALL_TEAMS_PAGE=200;
// Recent filters, newest first. Shorter than the team and event histories on purpose:
// a filter is a throwaway string, and a long list of them is noise rather than a
// shortcut. They are only recorded once a filter settles, never per keystroke.
let recentFilters=(load(K.recentFilters,[])||[]).filter(s=>typeof s==="string"&&s.trim());
const RECENT_FILTERS_MAX=10;
// Teams you have actually saved, newest first. Kept separate from the team directory:
// the directory is every team that exists, this is the short list you keep coming back to.
let recentTeams=(load(K.recentTeams,[])||[]).map(Number).filter(n=>n>0);
if(!recentTeams.includes(team))recentTeams=[team,...recentTeams].slice(0,RECENT_TEAMS_MAX);
// Same idea for events, but they need their name carried alongside the key: the event
// directory is only downloaded with an API key, and the header has to read sensibly
// before that lands.
let recentEvents=(load(K.recentEvents,[])||[]).filter(e=>e&&e.key);
let teamLocations=load(K.teamLoc,{});
let allMatches=load(K.allMatches,{});
let allianceData=load(K.alliances,{}), playoffMatches=load(K.playoffs,{});
let powerSource="cached", powerLabel="EPA", rankLabel="World", teamSearch="", teamSort="event";
// Per season, not one shared flag: both seasons are now fetched together, and a
// single flag would let the first in flight turn the second into a no-op.
let allEventsCache=load(K.allEvents,{}), allEventsLoading={}, eventSearch="";
let webcasts=load(K.webcasts,{});
// OPR for the current event, kept apart from `epa`. `epa` holds whichever rating drives
// the win estimates — EPA when Statbotics answers, else OPR — so it cannot also be the
// source for an OPR column without the two columns showing the same number.
let eventOpr=load(K.eventOpr,{});
// Research mode points the whole app at someone else's event without disturbing yours.
let research=load(K.research,{active:false,eventKey:"",name:""});
function researching(){return !!research.active&&!!research.eventKey}
function activeEventKey(){return researching()?research.eventKey:config.eventKey}
// allMatches, playoffMatches and allianceData are already keyed by event, so both modes
// can share them. matches, rankings and epa are not, so each mode keeps its own copy —
// otherwise browsing another event would overwrite what was downloaded for your own.
let liveCtx={matches,rankings,epa}, researchCtx={matches:[],rankings:{},epa:{}};
function stashCtx(){const c=researching()?researchCtx:liveCtx;c.matches=matches;c.rankings=rankings;c.epa=epa}
function applyCtx(){const c=researching()?researchCtx:liveCtx;matches=c.matches;rankings=c.rankings;epa=c.epa}
// Research data is deliberately transient: it must never land in the keys holding your
// own event's downloads.
function saveLive(key,val){if(!researching())save(key,val)}
updateTeamDirNote();$("eventKey").value=config.eventKey;$("tbaKey").value=config.tbaKey||"";$("refreshSeconds").value=config.refreshSeconds||DEFAULT_REFRESH;$("statboticsEnabled").checked=!!config.statbotics;
syncEventUI();
$("activeOnly").checked=activeOnly;renderAllTeams();
updateEventDirNote();renderResearchBanner();
if(config.eventKey&&!recentEvents.some(e=>e.key===config.eventKey))rememberRecentEvent(config.eventKey);
if(researching())applyCtx();

// Venue wifi often accepts connections and then never answers. Without these a
// request hangs forever and the Save button sits on "Saving…" with no way out.
// Per request, then a shorter bound on a whole cycle: a dead connection should report
// back in a handful of seconds rather than after every request times out in turn.
const NET_TIMEOUT_MS=12000, OP_TIMEOUT_MS=25000;
function timeoutSignal(ms=NET_TIMEOUT_MS){
 if(AbortSignal.timeout)return AbortSignal.timeout(ms);
 const c=new AbortController();setTimeout(()=>c.abort(),ms);return c.signal; // iOS < 16
}
function withTimeout(p,ms,label="Timed out"){
 let t;
 return Promise.race([p,new Promise((_,rej)=>{t=setTimeout(()=>rej(Error(label)),ms)})]).finally(()=>clearTimeout(t));
}
// Bounds a whole refresh cycle and reports failure in the status line. Returns false
// when it timed out so callers can surface it too.
async function runTimed(fn,ms=OP_TIMEOUT_MS){
 try{await withTimeout(fn(),ms,"timed out");return true}
 catch{
  $("statusTime").innerHTML='<span class="warn">Timed out</span>';
  $("statusDetail").innerHTML='<span class="warn">Timed out. Check your connection and try again.</span>';
  return false;
 }
}
function hasApiKey(){return!!config.tbaKey?.trim()}
// ETags stand for data we already hold. Whenever that data is deliberately discarded
// the matching ETags have to go too, or the server answers 304 for a copy we no longer
// have and we are left with nothing.
function forgetEtag(key){delete etags[key];save(K.etags,etags)}
function forgetAllEtags(){etags={};save(K.etags,etags)}
function teamDirectory(){return {...NAMES,...(allTeamsCache?.teams||{}),...teams}}
// TBA pages the team lists by team number, 500 per page; 26 pages covers every number
// issued so far with room to spare.
const TEAM_PAGES=26, PAGE_CONCURRENCY=5;
// Both lists were downloaded once and then kept forever, so anything registered with
// FIRST afterwards — a new offseason event, a new team — was invisible until the app's
// data was cleared by hand. Events move faster than the team directory, so they expire
// sooner. The manual buttons in Settings still force a refresh at any time.
const EVENTS_TTL=12*60*60*1000, TEAMS_TTL=7*24*60*60*1000;
function stale(cache,ttl){return !cache?.updated||Date.now()-cache.updated>ttl}
// Firing all 26 pages at once got pages dropped — TBA throttles a burst that size, and a
// phone's connection does the rest. A dropped page silently loses a whole 500-number
// band of teams, so the pages are fetched a few at a time, failures are retried once,
// and the caller is told whether the result is complete. Anything short of complete must
// not be cached as if it were, or one bad moment freezes a hole in the list forever.
async function fetchTeamPages(urlFor,onPage){
 const pending=[...Array(TEAM_PAGES).keys()];
 const failed=[];
 const runPage=async p=>{
  try{
   const r=await fetch(urlFor(p),{headers:{"X-TBA-Auth-Key":config.tbaKey},cache:"no-store",signal:timeoutSignal()});
   if(!r.ok)throw Error(`TBA ${r.status}`);
   onPage(await r.json());
  }catch{failed.push(p)}
 };
 const drain=async queue=>{
  const next=async()=>{const p=queue.shift();if(p===undefined)return;await runPage(p);await next()};
  await Promise.all([...Array(Math.min(PAGE_CONCURRENCY,queue.length)).keys()].map(next));
 };
 await drain(pending);
 const retry=failed.splice(0,failed.length);
 if(retry.length)await drain(retry);
 return {complete:!failed.length,failed:failed.length};
}
async function loadAllTeams(force=false){
 if(!hasApiKey()||allTeamsLoading)return;
 // A partial copy is retried on the next attempt rather than kept forever.
 if(!force&&allTeamsCache?.complete&&!stale(allTeamsCache,TEAMS_TTL))return;
 allTeamsLoading=true;
 const t={}, loc={};
 const {complete}=await fetchTeamPages(
  p=>`https://www.thebluealliance.com/api/v3/teams/${p}/simple`,
  // The simple team model already carries the location, so the All teams tab needs no
  // extra request for it — and the per-team lookups elsewhere get a warm cache.
  list=>list.forEach(x=>{
   const n=tn(x.key);
   t[n]=x.nickname||x.name;
   if(x.state_prov||x.country)loc[n]={city:x.city,state:x.state_prov,country:x.country};
  })
 );
 allTeamsLoading=false;
 // A partial answer still beats an empty tab, so it is kept and merged with whatever was
 // already held — it is only the "complete" flag that decides whether to try again.
 if(Object.keys(t).length){
  allTeamsCache={updated:Date.now(),complete,teams:{...(allTeamsCache?.teams||{}),...t},loc:{...(allTeamsCache?.loc||{}),...loc}};
  save(K.allTeams,allTeamsCache);
  teamLocations={...loc,...teamLocations};save(K.teamLoc,teamLocations);
  // Opening the team chip kicks this off, so the sheet is usually still up and showing
  // whatever it could find before the directory arrived.
  if($("switcher")?.open)renderSwitcher();
 }
 renderAllTeams();
 updateTeamDirNote();
}
function updateTeamDirNote(){
 const n=Object.keys(allTeamsCache?.teams||{}).length;
 $("teamDirNote").textContent=n?`${n} teams cached · updated ${new Date(allTeamsCache.updated).toLocaleDateString()}`:hasApiKey()?"Team directory not downloaded yet.":"Add a TBA API key to download the full team directory.";
}
// TBA's year-scoped team list is exactly "competed this season", so the Active filter
// asks it rather than inferring activity from anything else. /keys returns just the
// team keys, which is a fraction of the payload of the full records.
async function loadActiveTeams(force=false){
 if(!hasApiKey()||activeTeamsLoading)return;
 if(!force&&activeTeams?.year===YEAR&&activeTeams.complete&&!stale(activeTeams,TEAMS_TTL))return;
 activeTeamsLoading=true;
 const keys=[];
 const {complete}=await fetchTeamPages(
  p=>`https://www.thebluealliance.com/api/v3/teams/${YEAR}/${p}/keys`,
  list=>list.forEach(k=>keys.push(tn(k)))
 );
 activeTeamsLoading=false;
 if(keys.length){
  const merged=activeTeams?.year===YEAR?[...new Set([...activeTeams.teams||[],...keys])]:keys;
  activeTeams={year:YEAR,updated:Date.now(),complete,teams:merged};save(K.activeTeams,activeTeams);
  activeTeamSet=null;
 }
 renderAllTeams();
}
function isActiveTeam(t){
 if(!activeTeamSet)activeTeamSet=new Set((activeTeams?.teams||[]).map(Number));
 return activeTeamSet.has(+t);
}
// OPR belongs to an event, so there is no single global figure. This keeps the best one
// seen for each team along with where it came from, and it fills in as events load.
function recordTeamPower(map,eventKey){
 let changed=false;
 Object.entries(map).forEach(([t,total])=>{
  if(!Number.isFinite(total))return;
  const prev=teamPower[t];
  if(prev&&prev.event===eventKey&&prev.opr===total)return;
  if(prev&&prev.opr>=total&&prev.event!==eventKey)return;
  teamPower[t]={opr:total,event:eventKey};changed=true;
 });
 if(changed)save(K.teamPower,teamPower);
}
function teamOpr(t){
 const live=epa[t];
 if(live?.source==="opr"&&Number.isFinite(live.total))return live.total;
 return Number.isFinite(teamPower[t]?.opr)?teamPower[t].opr:null;
}
function teamWhere(t){
 const l=teamLocations[t]||allTeamsCache?.loc?.[t];
 if(!l)return "—";
 // USA is dropped because the state already says it, and some registrations repeat the
 // country in the state field (city states, and countries with no subdivisions).
 const country=l.country==="USA"||l.country===l.state?"":l.country;
 return [l.state,country].filter(Boolean).join(", ")||l.country||"—";
}
function teamPickerMatches(q){
 const s=(q||"").toLowerCase().trim();
 if(!s)return [];
 const dir=teamDirectory(), numeric=/^\d+$/.test(s);
 return Object.entries(dir)
  .filter(([n,name])=>numeric?String(n).startsWith(s):(name||"").toLowerCase().includes(s)||String(n).startsWith(s))
  .sort((a,b)=>+a[0]-+b[0]).slice(0,25);
}
function rememberRecentTeam(n){
 const t=+n; if(!(t>0))return;
 recentTeams=[t,...recentTeams.filter(x=>x!==t)].slice(0,RECENT_TEAMS_MAX);
 save(K.recentTeams,recentTeams);
}
function recentTeamEntries(){
 const dir=teamDirectory();
 return recentTeams.slice(0,RECENT_TEAMS_MAX).map(n=>[n,dir[n]]);
}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
async function loadAllEvents(year=YEAR,force=false){
 if(!hasApiKey()||allEventsLoading[year])return;
 if(!force&&allEventsCache[year]?.events?.length&&!stale(allEventsCache[year],EVENTS_TTL))return;
 allEventsLoading[year]=true;
 try{
  const data=await api(`https://www.thebluealliance.com/api/v3/events/${year}/simple`,`ev:${year}`);
  if(data){
   allEventsCache[year]={updated:Date.now(),events:data.map(e=>({key:e.key,name:e.name,start_date:e.start_date,end_date:e.end_date}))
    .sort((a,b)=>(a.start_date||"").localeCompare(b.start_date||"")||a.name.localeCompare(b.name))};
   save(K.allEvents,allEventsCache);
  }
 }catch{}
 allEventsLoading[year]=false;
 updateEventDirNote();
 // The sheet is usually still open, showing whatever was cached before this landed.
 if($("switcher")?.open)renderSwitcher();
 if(allMode==="events")renderAllTeams();
}
function updateEventDirNote(){
 const el=$("eventDirNote"); if(!el)return;
 const n=seasonYears().reduce((t,y)=>t+(allEventsCache[y]?.events?.length||0),0);
 el.textContent=n?`${n} events cached across ${seasonYears().join(" and ")}`:hasApiKey()?"No events downloaded yet.":"Add a TBA API key to browse events.";
}
// Searches every season already downloaded, newest first.
function allEventMatches(q){
 const s=(q||"").toLowerCase().trim(); if(!s)return [];
 const seen=new Set(), out=[];
 for(const y of Object.keys(allEventsCache).sort((a,b)=>b.localeCompare(a)))
  for(const e of allEventsCache[y]?.events||[]){
   if(seen.has(e.key))continue;
   if(!e.name.toLowerCase().includes(s)&&!e.key.toLowerCase().includes(s))continue;
   seen.add(e.key);out.push(e);
   if(out.length>=40)return out;
  }
 return out;
}
function eventDisplay(key,name){return name&&name!==key?`${key} · ${name}`:key}
// Every place an event name might be known, cheapest first. The header reads this on
// every render, so it never reaches the network.
function eventNameFor(key){
 if(!key)return "";
 if(researching()&&key===research.eventKey&&research.name)return research.name;
 const mine=teamEvents.find(e=>e.key===key); if(mine?.name)return mine.name;
 const remembered=recentEvents.find(e=>e.key===key); if(remembered?.name)return remembered.name;
 for(const y of Object.keys(allEventsCache)){
  const hit=allEventsCache[y]?.events?.find(e=>e.key===key);
  if(hit?.name)return hit.name;
 }
 return "";
}
function rememberRecentEvent(key,name){
 if(!key)return;
 const kept=recentEvents.find(e=>e.key===key);
 recentEvents=[{key,name:name||kept?.name||eventNameFor(key)||""},...recentEvents.filter(e=>e.key!==key)].slice(0,RECENT_EVENTS_MAX);
 save(K.recentEvents,recentEvents);
}
// True when the event on screen is not one your team is attending — research mode.
function awayEvent(key){return !!key&&teamEvents.length>0&&!teamEvents.some(e=>e.key===key)}
function renderResearchBanner(){
 const el=$("researchBanner"); if(!el)return;
 el.hidden=!researching();
 if(!researching()){el.innerHTML="";return}
 el.innerHTML=`<span class="rlabel">Research</span><span class="rname">${esc(research.name||research.eventKey)}</span><button type="button" class="iconbtn" data-exit-research>Back to my event</button>`;
}
// Swapping context before and after the flag flips is what keeps each mode's downloads
// separate; without the stash the mode being left behind loses its data.
async function enterResearch(eventKey,name){
 if(!eventKey)return;
 stashCtx();
 research={active:true,eventKey,name:name||eventNameFor(eventKey)||eventKey};save(K.research,research);
 rememberRecentEvent(research.eventKey,research.name);
 researchCtx={matches:[],rankings:{},epa:{}};
 applyCtx();syncPowerLabels();renderResearchBanner();render();
 await runTimed(()=>refresh(true));
}
// Split from exitResearch so switching straight to one of your own events can drop
// research mode without triggering a refresh of its own — the caller does one.
function clearResearch(){
 if(!researching())return false;
 stashCtx();
 research={active:false,eventKey:"",name:""};save(K.research,research);
 applyCtx();syncPowerLabels();renderResearchBanner();
 return true;
}
async function exitResearch(){
 if(!clearResearch())return;
 render();
 await runTimed(()=>refresh(true));
}
// One entry point for "show me this event", wherever the tap came from. An event your
// team is attending becomes your own selection; anything else opens in research mode,
// which is what keeps someone else's data out of your saved event.
async function chooseEvent(key,name){
 if(!key)return;
 rememberRecentEvent(key,name);
 if(awayEvent(key)){await enterResearch(key,name||eventNameFor(key));renderHeader();return}
 clearResearch();
 if(key!==config.eventKey){
  setEventKey(key,{manual:true});
  localStorage.removeItem(K.matches);matches=[];forgetAllEtags();
  delete allMatches[key];delete playoffMatches[key];delete allianceData[key];
 }
 render();renderHeader();
 await runTimed(()=>refresh(true));
}
// Every way of switching your team goes through here.
async function applyTeamChange(nextTeam,{eventKey=null}={}){
 const changed=nextTeam!==team;
 if(changed)clearResearch();
 config={...config,team:nextTeam,eventKey:changed?"":(eventKey??config.eventKey)};
 save(K.config,config);team=nextTeam;rememberRecentTeam(nextTeam);
 if(changed){config.eventManual=false;save(K.config,config);localStorage.removeItem(K.matches);localStorage.removeItem(K.teamEvents);matches=nextTeam===DEFAULT_TEAM?FALLBACK:[];teamEvents=[];forgetAllEtags()}
 renderHeader();
 const ok=await runTimed(async()=>{
  await loadTeamEvents({autoPick:changed||!config.eventManual});
  await refresh(true);
 });
 rememberRecentEvent(config.eventKey,eventNameFor(config.eventKey));
 renderHeader();
 return ok;
}
// ── Header switcher ────────────────────────────────────────────────────────────────
// One sheet for both chips. A dropdown would have to share a phone's width with the
// other chip; a sheet gets the whole screen, which is what makes room for the recents
// and the search in the same view.
let switcherMode="team";
function switcherRow(id,num,name,{current=false,tag=""}={}){
 return `<button type="button" class="sheetrow" data-pick="${esc(id)}"${current?' aria-current="true"':""}>`+
  `<b>${esc(num)}</b><span>${esc(name)}</span>${tag?`<span class="away-tag">${esc(tag)}</span>`:""}</button>`;
}
// Each group is wrapped so a caller — and a test — can tell "your team's events"
// apart from "recently visited", which are two very different lists.
function switcherGroup(name,label,rows){return rows.length?`<div class="sheetsection" data-group="${name}"><p class="sheetgroup">${label}</p>${rows.join("")}</div>`:""}
function renderSwitcherTeams(q){
 const dir=teamDirectory();
 if(q)return switcherGroup("search","Search results",teamPickerMatches(q).map(([n,name])=>switcherRow(n,n,name||"Team "+n,{current:+n===team})));
 return switcherGroup("recent","Recent teams",recentTeams.map(n=>switcherRow(n,n,dir[n]||"Team "+n,{current:+n===team})));
}
function renderSwitcherEvents(q){
 const active=activeEventKey();
 const row=e=>switcherRow(e.key,e.key,e.name||e.key,{current:e.key===active,tag:awayEvent(e.key)?"Research":""});
 if(q)return switcherGroup("search","Search results",allEventMatches(q).map(row));
 const mineKeys=new Set(teamEvents.map(e=>e.key));
 return switcherGroup("mine",`Team ${team} events`,teamEvents.map(row))+
  switcherGroup("recent","Recent events",recentEvents.filter(e=>!mineKeys.has(e.key)).map(e=>row({key:e.key,name:e.name||eventNameFor(e.key)})));
}
function renderSwitcher(){
 const q=$("switcherSearch").value.trim();
 const html=switcherMode==="team"?renderSwitcherTeams(q):renderSwitcherEvents(q);
 $("switcherList").innerHTML=html||`<p class="sheetempty">${
  switcherMode==="team"
   ? (hasApiKey()?"No teams match. Try a number.":"Add a TBA API key in Settings to search every team.")
   : (hasApiKey()?"No events match. Try a name or an event key.":"Add a TBA API key in Settings to browse events.")}</p>`;
}
function openSwitcher(mode){
 switcherMode=mode;
 $("switcherTitle").textContent=mode==="team"?"Team":"Event";
 $("switcherSearch").placeholder=mode==="team"?"Search any team by number or name":"Search any event by name or key";
 $("switcherSearch").value="";
 $("switcherNote").textContent=mode==="team"
  ?"Your recent teams are listed first. Search to switch to any other team."
  :"Your team's events switch your own event. Any other event opens in research mode, and your own stays saved.";
 // The season control went with the Settings panel, so both seasons are fetched here.
 // allEventMatches searches every cached year, so last season stays reachable.
 if(mode==="team")loadAllTeams(); else seasonYears().forEach(y=>loadAllEvents(y));
 renderSwitcher();
 $("switcher").showModal();
}
function closeSwitcher(){if($("switcher").open)$("switcher").close()}
async function switcherPick(value){
 closeSwitcher();
 if(switcherMode==="team"){
  const n=+value;
  if(n&&n!==team)await applyTeamChange(n);
  return;
 }
 if(value!==activeEventKey())await chooseEvent(value,eventNameFor(value));
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
function setEventKey(key,{manual=false,saveConfig=true}={}){
 config.eventKey=(key||"").trim();
 if(manual)config.eventManual=true;
 $("eventKey").value=config.eventKey;
 if(saveConfig)save(K.config,config);
}
// The header chip is the only way to pick an event, and it needs the downloaded event
// list to search. Without an API key there is no such list, so the manual key field is
// the sole escape hatch and appears only then.
function syncEventUI(){
 const manual=!hasApiKey();
 $("eventKeyWrap").hidden=!manual;
 $("eventKeyHelp").hidden=!manual;
}
async function fetchTeamEventsYear(year,byYear){
 const key=`te:${team}:${year}`, url=`https://www.thebluealliance.com/api/v3/team/frc${team}/events/${year}/simple`;
 try{
  const data=await api(url,key);
  if(data)byYear[year]=data;
 }catch{}
 if(byYear[year])return;
 const cached=readTeamEventsCache();
 if(cached?.byYear?.[year]){byYear[year]=cached.byYear[year];return}
 // Nothing local and nothing returned means a 304 answered "you already have it" for
 // data we no longer hold. Drop the stale ETag and ask for a full copy. This also
 // repairs installs already stuck with an empty event list.
 if(!etags[key])return;
 forgetEtag(key);
 try{
  const data=await api(url,key);
  if(data)byYear[year]=data;
 }catch{}
}
async function loadTeamEvents({autoPick=!config.eventManual}={}){
 syncEventUI();
 const cached=readTeamEventsCache();
 if(cached?.events?.length)teamEvents=cached.events;
 if(!hasApiKey()){renderHeader();return}
 const byYear={...(cached?.byYear||{})};
 await Promise.all(seasonYears().map(y=>fetchTeamEventsYear(y,byYear)));
 saveTeamEventsCache(byYear);
 // Names arrive with the event list, so backfill any recent entry stored without one.
 recentEvents.forEach(e=>{if(!e.name)e.name=eventNameFor(e.key)});
 save(K.recentEvents,recentEvents);
 const savedValid=teamEvents.some(e=>e.key===config.eventKey);
 if((autoPick||!savedValid)&&teamEvents.length){
  const picked=pickEventForToday(teamEvents);
  if(picked)setEventKey(picked.key,{manual:false});
  config.eventManual=false;
  save(K.config,config);
 }
 renderHeader();
}
function fmtBytes(n){
 if(!Number.isFinite(n))return "—";
 if(n<1024)return `${n} B`;
 if(n<1048576)return `${(n/1024).toFixed(1)} KB`;
 return `${(n/1048576).toFixed(1)} MB`;
}
function fmtDateTime(ms){
 return Number.isFinite(ms)?new Date(ms).toLocaleString([],{dateStyle:"medium",timeStyle:"short"}):null;
}
// Newest Date header across the cached responses: when this copy was downloaded.
async function cacheDownloadedAt(cache,keys){
 let newest=null;
 for(const req of keys){
  const d=Date.parse((await cache.match(req))?.headers.get("date")||"");
  if(Number.isFinite(d)&&(newest===null||d>newest))newest=d;
 }
 return newest;
}
async function fetchLatestVersion(){
 try{
  const r=await fetch("./version.json?_="+Date.now(),{cache:"no-store",signal:timeoutSignal(8000)});
  return r.ok?(await r.json()).version||null:null;
 }catch{return null}
}
async function cacheReport(){
 if(!window.caches)return null;
 const names=await caches.keys(), entries=[];
 let downloadedAt=null;
 for(const name of names){
  const cache=await caches.open(name), keys=await cache.keys();
  entries.push({name,paths:keys.map(r=>new URL(r.url).pathname)});
  const at=await cacheDownloadedAt(cache,keys);
  if(at!==null&&(downloadedAt===null||at>downloadedAt))downloadedAt=at;
 }
 let usage=null;
 try{usage=(await navigator.storage?.estimate?.())?.usage??null}catch{}
 return {entries,usage,downloadedAt};
}
// Compares the running build against the one currently deployed. version.json always
// comes from the network, so this reports staleness even with everything else cached.
async function renderFreshness(){
 const el=$("cacheFreshness"); if(!el)return;
 if(!VERSION_STAMPED){el.className="muted";el.textContent="Version checks only run on the deployed site.";return}
 const latest=await fetchLatestVersion();
 if(!$("cacheFreshness"))return;
 if(!latest){el.className="warn";el.textContent="Could not reach the server to check for updates.";return}
 if(latest===APP_VERSION){el.className="ok";el.textContent="Up to date."}
 else{el.className="warn";el.textContent=`Update available: ${latest}. It installs automatically, or use Clear app cache.`}
}
async function renderCacheDetails(){
 const el=$("cacheDetails"); if(!el)return;
 const rep=await cacheReport();
 if(!rep){el.textContent="This browser does not support the cache storage API.";return}
 const paths=rep.entries.flatMap(c=>c.paths).sort();
 if(!paths.length){el.textContent="No files cached yet.";return}
 const used=rep.usage!=null?` · about ${fmtBytes(rep.usage)} stored`:"";
 const when=fmtDateTime(rep.downloadedAt);
 const build=VERSION_STAMPED?APP_VERSION:"not stamped (local build)";
 el.innerHTML=`<div>Version <strong>${build}</strong>${when?` · downloaded ${when}`:""}</div>
 <div id="cacheFreshness" class="muted">Checking for a newer version…</div>
 <div><strong>${paths.length}</strong> file${paths.length===1?"":"s"} cached${used}</div>
 <div>Cache: ${rep.entries.map(c=>c.name).join(", ")}</div>
 <ul class="cachelist">${paths.map(p=>`<li>${p}</li>`).join("")}</ul>`;
 renderFreshness();
}
function openSettings(){
 document.querySelectorAll(".tab,.page").forEach(x=>x.classList.remove("active"));
 document.querySelector('.tab[data-page="settings"]').classList.add("active");
 $("page-settings").classList.add("active");
}

// The header height varies with the wrapped subtitle and the status bar inset, so the
// sticky offsets below it are measured rather than hardcoded.
function syncStickyOffsets(){
 const set=(k,el)=>{if(el?.offsetHeight)document.documentElement.style.setProperty(k,el.offsetHeight+"px")};
 set("--header-h",document.querySelector("header"));
 set("--teams-sticky-h",document.querySelector(".teams-sticky"));
}
function renderHeader(){
 const name=teamDirectory()[team];
 $("teamChipValue").textContent=`${team}${name?" · "+name:""}`;
 $("teamChip").title=`Team ${team}${name?" · "+name:""}`;
 const key=activeEventKey(), evName=eventNameFor(key);
 $("eventChipValue").textContent=key?(evName||key):"Not set";
 $("eventChip").title=key?eventDisplay(key,evName):"No event selected";
 // The away tint is the quiet version of the research banner: it keeps "you are not
 // looking at your own event" visible even once the banner has scrolled off.
 $("eventChip").classList.toggle("away",researching()||awayEvent(key));
 requestAnimationFrame(syncStickyOffsets);
}
renderHeader();
addEventListener("resize",syncStickyOffsets);
addEventListener("orientationchange",()=>requestAnimationFrame(syncStickyOffsets));

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
function teamEpa(t){return epa[t]?.source==="epa"?epa[t]:null}
// Ratings sort high to low, and a team without one goes to the bottom either way.
function byRating(get){return (a,b)=>{
 const x=get(a), y=get(b);
 if(!Number.isFinite(x)&&!Number.isFinite(y))return a-b;
 if(!Number.isFinite(x))return 1;
 if(!Number.isFinite(y))return -1;
 return y-x||a-b;
}}
function sortedTeams(){
 const list=allEventTeams();
 return list.sort((a,b)=>{
  if(teamSort==="number")return a-b;
  if(teamSort==="event")return (rankings[a]?.rank??99999)-(rankings[b]?.rank??99999)||a-b;
  if(teamSort==="name")return (teams[a]||"").localeCompare(teams[b]||"","en",{sensitivity:"base"})||a-b;
  if(teamSort==="opr")return byRating(t=>eventOpr[t]?.total)(a,b);
  if(teamSort==="epa")return byRating(t=>teamEpa(t)?.total)(a,b);
  if(teamSort==="record")return byRating(t=>Number(rankings[t]?.record?.split("-")[0]))(a,b);
  return (epa[a]?.rank??99999)-(epa[b]?.rank??99999)||a-b;
 });
}
function teamRow(t){
 const s=epa[t]||{}, r=rankings[t];
 return `<div class="teamrow ${t===team?"mine":""}" data-team="${t}"><div class="identity"><span class="tnum tnum-tap">${t}</span><span class="tname">${teams[t]||"Team "+t}${t===team?" ⭐":""}</span></div><span class="rank">${rank(s.rank)}</span><span class="rank">${rank(r?.rank)}</span></div>`;
}
function teamNextMatch(t){
 const list=allMatches[activeEventKey()]||[];
 return list.filter(m=>!matchDone(m)&&(m.red.includes(t)||m.blue.includes(t))).sort((a,b)=>a.q-b.q)[0]||null;
}
function teamNextLabel(t){
 const m=teamNextMatch(t); if(!m)return "—";
 const at=fmtMatchTime(m);
 return `Q${m.q}${at?" · "+at:""}`;
}
function teamTableRow(t){
 const r=rankings[t]||{}, o=eventOpr[t], e=teamEpa(t);
 // fmt() coerces, and +undefined is NaN but +null is 0, so an absent rating is caught
 // before it rather than being printed as 0.0.
 const val=x=>Number.isFinite(x)?fmt(x):"—";
 return `<div class="team-item ${t===team?"my-team":""}" data-team="${t}"><div class="team-num">${t}${t===team?" ⭐":""}</div><div class="team-name">${teams[t]||"Team "+t}</div><div class="stat">${rank(r.rank)}</div><div class="stat">${val(o?.total)}</div><div class="stat">${val(e?.total)}</div><div class="stat">${r.record||"—"}</div></div>`;
}
// A 304 says "you already have it". If the copy it refers to is gone, the ETag has
// outlived its data, so drop it and ask for a full response.
async function apiWithCache(url,etagKey,cached){
 const data=await api(url,etagKey);
 if(data)return data;
 if(cached)return cached;
 if(!etags[etagKey])return null;
 forgetEtag(etagKey);
 return await api(url,etagKey);
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
let teamSeasons=load(K.teamSeason,{}), teamPage={team:null,year:YEAR}, teamPageReturn="matches";
const seasonKey=(t,y)=>`${t}:${y}`;
/**
 * A team's season: the events they attended plus their status at each.
 * /statuses carries the qual rank, record, alliance and playoff result in one call, so
 * this is two requests regardless of how many events the team played.
 */
async function fetchTeamSeason(t,year){
 if(!hasApiKey())return teamSeasons[seasonKey(t,year)]||null;
 const cached=teamSeasons[seasonKey(t,year)];
 const base=`https://www.thebluealliance.com/api/v3/team/frc${t}`;
 const [events,statuses]=await Promise.all([
  apiWithCache(`${base}/events/${year}/simple`,`tse:${t}:${year}`,cached?.events).catch(()=>null),
  apiWithCache(`${base}/events/${year}/statuses`,`tss:${t}:${year}`,cached?.statuses).catch(()=>null),
 ]);
 const next={
  updated:Date.now(),
  events:(events||cached?.events||[]).map(e=>({key:e.key,name:e.name,start_date:e.start_date,end_date:e.end_date})),
  statuses:statuses||cached?.statuses||{},
 };
 next.events.sort((a,b)=>(a.start_date||"").localeCompare(b.start_date||""));
 teamSeasons[seasonKey(t,year)]=next;save(K.teamSeason,teamSeasons);
 return next;
}
function seasonEventCard(ev,status){
 const q=status?.qual?.ranking, rec=q?.record;
 const record=rec?`${rec.wins??0}-${rec.losses??0}-${rec.ties??0}`:null;
 const dates=ev.end_date&&ev.end_date!==ev.start_date?`${ev.start_date} – ${ev.end_date}`:ev.start_date||"";
 const bits=[];
 if(q?.rank)bits.push(`<span class="smetric"><b>${rank(q.rank)}</b><span>Qual rank</span></span>`);
 if(record)bits.push(`<span class="smetric"><b>${record}</b><span>Record</span></span>`);
 if(status?.alliance?.name)bits.push(`<span class="smetric"><b>${esc(status.alliance.name)}</b><span>Alliance</span></span>`);
 const playoff=status?.playoff?.status;
 if(playoff)bits.push(`<span class="smetric ${playoff==="won"?"good":""}"><b>${playoff==="won"?"Winner":esc(playoff)}</b><span>Playoffs</span></span>`);
 return `<div class="scard"><div class="sname">${esc(ev.name)}</div><div class="sdates">${esc(dates)}</div>
 ${bits.length?`<div class="smetrics">${bits.join("")}</div>`:'<div class="sdates">No results posted.</div>'}</div>`;
}
function renderTeamPage(){
 const el=$("teamPage"); if(!el)return;
 const t=teamPage.team;
 if(!t){el.innerHTML="";return}
 const name=teamDirectory()[t]||`Team ${t}`, s=epa[t]||{}, season=teamSeasons[seasonKey(t,teamPage.year)];
 const years=seasonYears().map(y=>`<button type="button" class="yearbtn ${y===teamPage.year?"active":""}" data-season-year="${y}">${y}</button>`).join("");
 const body=!hasApiKey()
  ? '<div class="empty">Add a TBA API key in Settings to look up teams.</div>'
  : !season
    ? '<div class="empty">Loading season…</div>'
    : season.events.length
      ? season.events.map(ev=>seasonEventCard(ev,season.statuses?.[ev.key])).join("")
      : `<div class="empty">No ${teamPage.year} events for team ${t}.</div>`;
 el.innerHTML=`<div class="hero teamhead">
  <div class="eyebrow">Team</div>
  <div class="hero-title">${t}</div>
  <div class="tname big">${esc(name)}</div>
  <div class="tdloc">${teamLocationText(t)}</div>
  ${Number.isFinite(+s.total)?`<div class="teamstats"><div class="tiny"><b>${fmt(s.total)}</b><span>${powerLabel}</span></div><div class="tiny"><b>${rank(s.rank)}</b><span>${rankLabel}</span></div></div>`:""}
 </div>
 <div class="yearbar">${years}</div>
 ${body}`;
}
async function openTeamSeason(t,year=teamPage.year){
 if(!t)return;
 if($("teamDetail")?.open)$("teamDetail").close();
 const current=document.querySelector(".tab.active");
 if(current&&current.dataset.page!=="team")teamPageReturn=current.dataset.page;
 teamPage={team:+t,year};
 document.querySelectorAll(".tab,.page").forEach(x=>x.classList.remove("active"));
 $("page-team").classList.add("active");
 renderTeamPage();window.scrollTo(0,0);
 await Promise.all([fetchTeamLocation(t),runTimed(()=>fetchTeamSeason(+t,year))]);
 if(teamPage.team===+t)renderTeamPage();
}
function closeTeamSeason(){
 teamPage={team:null,year:teamPage.year};
 document.querySelectorAll(".tab,.page").forEach(x=>x.classList.remove("active"));
 document.querySelector(`.tab[data-page="${teamPageReturn}"]`)?.classList.add("active");
 $("page-"+teamPageReturn)?.classList.add("active");
 renderTeamPage();
}
function teamDetailHtml(t){
 const name=teamDirectory()[t]||"Team "+t, r=rankings[t]||{}, s=epa[t]||{};
 return `<h3>${t} · ${name}${t===team?" ⭐":""}</h3>
 <div class="teamstats">
  <div class="tiny"><b>${rank(r.rank)}</b><span>Event rank</span></div>
  <div class="tiny"><b>${r.record||"—"}</b><span>Qual record</span></div>
  <div class="tiny"><b>${Number.isFinite(eventOpr[t]?.total)?fmt(eventOpr[t].total):"—"}</b><span>OPR</span></div>
  <div class="tiny"><b>${Number.isFinite(teamEpa(t)?.total)?fmt(teamEpa(t).total):"—"}</b><span>EPA</span></div>
 </div>
 <div class="tdloc">${teamLocationText(t)}</div>
 <div class="tdloc">Next match · ${esc(teamNextLabel(t))}</div>
 <button type="button" class="iconbtn tdseason" data-team-season="${t}">View ${YEAR} season</button>`;
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
// TBA posts the match video once a match has been played, so this appears on finished
// matches only. Opens in a new tab so the dashboard is not navigated away from mid-event.
function matchVideoLink(m){
 if(!m?.video)return "";
 return `<a class="videolink" href="https://www.youtube.com/watch?v=${encodeURIComponent(m.video)}" target="_blank" rel="noopener" aria-label="Watch ${matchLabel(m)} on YouTube">▶ Video</a>`;
}
// The best-known clock time for a match: when it actually ran, else when it is expected.
function matchWhenSec(m){return m?.actual_time||m?.post_result_time||m?.predicted_time||m?.time||null}
function gapText(sec){
 const mins=Math.round(sec/60);
 if(mins<60)return `${mins}m`;
 const h=Math.floor(mins/60), r=mins%60;
 return r?`${h}h ${String(r).padStart(2,"0")}m`:`${h}h`;
}
// Shown between consecutive matches of yours: the breathing room between them, which is
// what decides whether there is time to fix the robot or get to the stands.
const MAX_GAP_SEC=48*60*60;
function matchGapRow(prev,m){
 const a=matchWhenSec(prev), b=matchWhenSec(m);
 // Beyond a couple of days the two times are not really comparable — a stale estimate,
 // or a schedule that has not been posted — and a four-figure hour count helps nobody.
 if(!a||!b||b<=a||b-a>MAX_GAP_SEC)return "";
 return `<div class="matchgap"><span>${gapText(b-a)} later</span></div>`;
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
function nextMatch(){
 const sorted=myMatchList(); return sorted.find(m=>!matchDone(m))||sorted[sorted.length-1];
}
// The match list is a single timeline with past matches above, so open it parked on
// the next match. scroll-margin-top keeps it clear of the sticky header.
function scrollToNextMatch(behavior="smooth"){
 const m=nextMatch(); if(!m?.key)return;
 requestAnimationFrame(()=>document.getElementById("match-"+m.key)?.scrollIntoView({behavior,block:"start"}));
}
// ── Next-match countdown ───────────────────────────────────────────────────────────
// Pinned to the top of the Mine page so the time to your next match stays on screen
// however far down the timeline you have scrolled.
function countdownText(sec){
 const s=Math.max(0,Math.round(sec));
 const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), r=s%60;
 if(h)return `${h}h ${String(m).padStart(2,"0")}m`;
 return `${m}:${String(r).padStart(2,"0")}`;
}
// A match is treated as under way from its scheduled time until a score is posted, which
// is when the stream is worth watching and when a countdown would otherwise sit at zero.
function nextBarState(){
 const m=nextMatch();
 if(!m||m.pending)return null;
 const when=m.predicted_time||m.time||null;
 const label=matchLabel(m)+(m.red?.includes(team)?" · RED":m.blue?.includes(team)?" · BLUE":"");
 if(matchHasScore(m))return {m,label,when:"Final",live:false,over:true};
 if(matchDone(m))return {m,label,when:"Awaiting score",live:true,over:false};
 if(!when)return {m,label,when:"Time not posted",live:false,over:false};
 const left=when-Date.now()/1000;
 if(left<=0)return {m,label,when:"Now",live:true,over:false};
 return {m,label,when:`in ${countdownText(left)}`,live:false,over:false};
}
function renderNextBar(){
 const bar=$("nextBar"); if(!bar)return;
 const st=nextBarState();
 bar.hidden=!st;
 if(!st)return;
 $("nbWhen").textContent=st.when;
 $("nbLabel").textContent=st.label;
 bar.classList.toggle("live",st.live);
 // The stream is only useful while the match is still to come or under way.
 const stream=st.over?null:eventStream();
 const watch=$("nbWatch");
 watch.hidden=!stream;
 if(stream){watch.href=stream.url;watch.textContent=stream.type==="youtube"?"▶ YouTube":stream.type==="twitch"?"▶ Twitch":"▶ Watch"}
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
// The next match gets a taller card in its chronological slot: match title, when it
// starts, and the win estimate, none of which the plain cards carry.
function nextMatchCard(m){
 if(m.pending)return pendingCard(m,true);
 const p=probability(m), mine=m.red.includes(team)?"RED":"BLUE";
 const played=matchPlayTime(m), est=fmtMatchTime(m);
 const whenLabel=matchHasScore(m)?(played?`Final · ${played}`:"Final"):matchDone(m)?(played?`Played · ${played}`:"Pending"):est?`Est. ${est}`:"Time not posted";
 return `<div class="hero nexthero" id="match-${m.key}"><div class="eyebrow">Next match · ${mine} alliance</div><div class="hero-title">${matchLabel(m)}</div>
 <div class="countdown">${whenLabel}${matchVideoLink(m)}${matchStreamLink(m)}</div>
 ${p?`<div class="metrics"><div class="metric"><b>${fmt(p.re)}</b><span>Red ${powerLabel}</span></div><div class="metric"><b>${p.red}%</b><span>Red estimate</span></div><div class="metric"><b>${fmt(p.be)}</b><span>Blue ${powerLabel}</span></div></div><button type="button" class="helpbtn power-help-inline" data-open-power-help aria-label="Explain ${powerLabel}">?</button>`:""}
 ${matchHasScore(m)?matchScoreboard(m):""}
 ${alliance("red",m.red,matchWinner(m)==="red")}${alliance("blue",m.blue,matchWinner(m)==="blue")}</div>`;
}
// Only for a match still to come or under way: once a score is posted the recording
// link that matchVideoLink already provides is the useful one.
function matchStreamLink(m){
 if(matchHasScore(m))return "";
 const s=eventStream(); if(!s)return "";
 return ` · <a href="${esc(s.url)}" target="_blank" rel="noopener">▶ Watch live</a>`;
}
function matchCard(m){
 if(m.pending)return pendingCard(m);
 const meta=matchCardMeta(m), w=matchWinner(m);
 return `<div class="hero" id="match-${m.key}"><div class="eyebrow">${matchLabel(m)}</div><div class="score ${meta.cls}">${meta.text}${matchVideoLink(m)}</div>${matchHasScore(m)?matchScoreboard(m):""}${alliance("red",m.red,w==="red")}${alliance("blue",m.blue,w==="blue")}</div>`;
}
function renderMatches(){
 const keyReminder=!hasApiKey()?'<div class="alert">Add your TBA read API key in <button type="button" class="alert-link" data-open-settings>Settings</button> to load live schedules, rankings, and team names.</div>':"";
 // next must come from this same list: myMatchList() rebuilds its objects each call,
 // so an identity check against a separately-built list would never match.
 const list=myMatchList();
 const next=list.find(m=>!matchDone(m))||list[list.length-1];
 // Gaps go between cards, so each one is emitted with the match that follows it.
 const cards=list.map((m,i)=>(i?matchGapRow(list[i-1],m):"")+(m===next?nextMatchCard(m):matchCard(m))).join("");
 $("matchList").innerHTML=keyReminder+myStatusHtml()+(cards||'<div class="empty">No matches loaded.</div>');
}
function closestMatchToNow(allMatches){
 const now=Date.now()/1000;
 return allMatches.sort((a,b)=>{
  const aDist=Math.abs((a.predicted_time||a.time||a.actual_time||a.post_result_time||0)-now);
  const bDist=Math.abs((b.predicted_time||b.time||b.actual_time||b.post_result_time||0)-now);
  return aDist-bDist;
 })[0];
}
async function renderAllMatches(){
 const eventMatches=allMatches[activeEventKey()]||await fetchAllEventMatches();
 if(!eventMatches.length){
  $("allMatchList").innerHTML=!hasApiKey()?'<div class="alert">Add your TBA read API key in <button type="button" class="alert-link" data-open-settings>Settings</button> to load the full event schedule.</div>':'<div class="empty">No event matches loaded yet.</div>';
  return;
 }
 $("allMatchList").innerHTML=[...eventMatches].sort((a,b)=>a.q-b.q).map(matchCard).join("");
 const closest=closestMatchToNow(eventMatches);
 if(closest?.key)requestAnimationFrame(()=>document.getElementById("match-"+closest.key)?.scrollIntoView({behavior:"auto",block:"center"}));
}
// Every sortable heading gets the active state from the same place, so a column cannot
// be sorted by without its own heading lighting up — which is what went wrong when two
// headings shared one sort key and only the first was ever marked.
function teamSortHead(key,label,extra=""){
 return `<button data-sort="${key}" class="header-btn${extra?" "+extra:""}${teamSort===key?" active":""}" aria-sort="${teamSort===key?"descending":"none"}">${label}</button>`;
}
function renderTeams(){
 const q=teamSearch, list=sortedTeams().filter(t=>teamMatchesSearch(t,q));
 if(!list.length){$("teamList").innerHTML='<div class="empty">No teams match your search.</div>';return}
 $("teamList").innerHTML=`<div class="teams-header">`+
  teamSortHead("number","Team")+teamSortHead("name","Name")+
  teamSortHead("event","Event")+
  teamSortHead("opr","OPR","stat-btn")+teamSortHead("epa","EPA","stat-btn")+
  teamSortHead("record","Rec","stat-btn")+`
 </div>${list.map(teamTableRow).join("")}`;
}
// "All teams" means the downloaded TBA directory, on its own. teamDirectory() folds in
// NAMES — an offline seed of one event's teams — which would otherwise show up here as
// a handful of teams pretending to be the directory.
function allTeamsDirectory(){
 const downloaded=allTeamsCache?.teams;
 return downloaded&&Object.keys(downloaded).length?downloaded:{};
}
// A filter is remembered when it settles — on blur, on Enter, or when it leads to a
// team being opened. Recording every keystroke would fill the history with the prefixes
// of the word actually wanted.
function rememberFilter(s){
 const v=(s||"").trim();
 if(v.length<2)return;
 recentFilters=[v,...recentFilters.filter(x=>x.toLowerCase()!==v.toLowerCase())].slice(0,RECENT_FILTERS_MAX);
 save(K.recentFilters,recentFilters);
}
function renderFilterHistory(){
 const el=$("allTeamSearchList"); if(!el)return;
 // Only offered when the box is empty: with text in it the results below are the answer.
 if($("allTeamSearch").value.trim()||!recentFilters.length){el.hidden=true;el.innerHTML="";return}
 el.innerHTML=`<p class="combohint">Recent filters — or type a number, name, state or country</p>`+
  recentFilters.map(s=>`<button type="button" data-filter="${esc(s)}"><span>${esc(s)}</span></button>`).join("");
 el.hidden=false;
}
function applyFilter(s){
 allTeamSearch=s;
 $("allTeamSearch").value=s;
 $("allTeamSearchList").hidden=true;
 allTeamsShown=ALL_TEAMS_PAGE;
 rememberFilter(s);
 renderAllTeams();
}
// ── All tab, events mode ───────────────────────────────────────────────────────────
function allEventsList(){
 const years=activeOnly?[YEAR]:seasonYears();
 const seen=new Set(), out=[];
 for(const y of years)for(const e of allEventsCache[y]?.events||[]){
  if(!seen.has(e.key)){seen.add(e.key);out.push(e)}
 }
 return out;
}
function allEventsMatches(){
 const s=allTeamSearch.toLowerCase().trim();
 return allEventsList()
  .filter(e=>!s||e.key.toLowerCase().includes(s)||(e.name||"").toLowerCase().includes(s))
  .sort((a,b)=>(a.start_date||"").localeCompare(b.start_date||"")||(a.name||"").localeCompare(b.name||""));
}
function eventWhen(e){
 const today=todayYmd();
 if(e.start_date<=today&&e.end_date>=today)return '<span class="ev-live">Live</span>';
 return esc((e.start_date||"").slice(5)||"—");
}
function allEventRow(e){
 const active=e.key===activeEventKey();
 return `<div class="allevent-item ${active?"current":""}" data-event="${esc(e.key)}" data-name="${esc(e.name||"")}">`+
  `<div class="ev-key">${esc(e.key)}</div>`+
  `<div class="ev-name">${esc(e.name||e.key)}</div>`+
  `<div class="ev-when">${eventWhen(e)}</div></div>`;
}
function allTeamsMatches(){
 const dir=allTeamsDirectory(), s=allTeamSearch.toLowerCase().trim();
 return Object.keys(dir).map(Number).filter(t=>{
  if(activeOnly&&!isActiveTeam(t))return false;
  if(!s)return true;
  return String(t).startsWith(s)||(dir[t]||"").toLowerCase().includes(s)||teamWhere(t).toLowerCase().includes(s);
 }).sort((a,b)=>a-b);
}
function allTeamRow(t,dir){
 return `<div class="allteam-item ${t===team?"my-team":""}" data-team="${t}">`+
  `<div class="team-num">${t}${t===team?" ⭐":""}</div>`+
  `<div class="team-name">${esc(dir[t]||"Team "+t)}</div>`+
  `<div class="team-where">${esc(teamWhere(t))}</div>`+
  // fmt() coerces, and +null is 0, so an unknown OPR has to be caught before it.
  `<div class="stat">${teamOpr(t)===null?"—":fmt(teamOpr(t))}</div></div>`;
}
function renderAllTeamsRows(list){
 const dir=allTeamsDirectory(), shown=list.slice(0,allTeamsShown);
 return `<div class="allteams-header"><div class="stat-label" style="text-align:left">Team</div><div class="stat-label" style="text-align:left">Name</div><div class="stat-label" style="text-align:left">State / Country</div><div class="stat-label" style="text-align:right">OPR</div></div>${shown.map(t=>allTeamRow(t,dir)).join("")}`;
}
function renderAllEventsRows(list){
 const shown=list.slice(0,allTeamsShown);
 return `<div class="allevent-item allteams-header"><div class="stat-label" style="text-align:left">Key</div><div class="stat-label" style="text-align:left">Event</div><div class="stat-label" style="text-align:right">Starts</div></div>${shown.map(allEventRow).join("")}`;
}
// The note carries the state the list cannot: whether anything is still downloading,
// whether what arrived was short, and where OPR comes from.
function allTeamsNoteText(all,shown){
 const cached=Object.keys(allTeamsCache?.teams||{}).length;
 if(!hasApiKey())return `Add a TBA API key in Settings to download the full ${allMode==="events"?"event list":"team directory"}.`;
 if(allMode==="events"){
  if(!allEventsList().length)return Object.values(allEventsLoading).some(Boolean)?"Downloading the event list…":"Event list not downloaded yet. Reopen this tab, or tap Update event list under Settings → API and data.";
  if(!all.length)return "No events match this filter.";
  return `Showing ${shown} of ${all.length} ${activeOnly?YEAR:seasonYears().join(" and ")} events. Tap one to open it — your own event stays saved.`;
 }
 if(!cached)return allTeamsLoading?"Downloading the team directory…":"Team directory not downloaded yet. Reopen this tab, or tap Update team list under Settings → API and data.";
 if(activeOnly&&(activeTeamsLoading||!activeTeams?.teams?.length))return `Loading the ${YEAR} team list…`;
 if(!all.length)return "No teams match this filter.";
 const partial=allTeamsCache?.complete===false||(activeOnly&&activeTeams?.complete===false);
 return `Showing ${shown} of ${all.length}${activeOnly?` active ${YEAR}`:""} teams.${partial?" Part of the list failed to download — reopen this tab to finish it.":""} OPR comes from the events you have loaded; teams you have not loaded an event for show —.`;
}
function syncAllModeUI(){
 const events=allMode==="events";
 $("allTitle").textContent=events?"All events":"All teams";
 $("segTeams").classList.toggle("active",!events);
 $("segEvents").classList.toggle("active",events);
 $("segTeams").setAttribute("aria-selected",String(!events));
 $("segEvents").setAttribute("aria-selected",String(events));
 $("allTeamSearch").placeholder=events?"Filter by event name or key":"Filter by number, name, state or country";
 $("activeOnlyLabel").textContent=events?`${YEAR} events only`:"Active this season";
}
function renderAllTeams(){
 const list=$("allTeamsList"); if(!list)return;
 syncAllModeUI();
 if(!allTeamsShown)allTeamsShown=ALL_TEAMS_PAGE;
 const all=allMode==="events"?allEventsMatches():allTeamsMatches();
 const shown=Math.min(all.length,allTeamsShown);
 list.innerHTML=all.length?(allMode==="events"?renderAllEventsRows(all):renderAllTeamsRows(all)):"";
 $("allTeamsNote").textContent=allTeamsNoteText(all,shown);
 $("allTeamsMore").hidden=shown>=all.length;
 requestAnimationFrame(syncStickyOffsets);
}
// Whatever the All tab needs for the mode it is in.
function loadAllTabData(){
 if(allMode==="events")seasonYears().forEach(y=>loadAllEvents(y));
 else{loadAllTeams();if(activeOnly)loadActiveTeams()}
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
function eventAlliances(){return allianceData[activeEventKey()]||[]}
function eventPlayoffs(){return playoffMatches[activeEventKey()]||[]}
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
// ── Bracket graphic ────────────────────────────────────────────────────────────────
// FRC playoffs are double elimination, so this is not the clean binary tree a March
// Madness bracket is: the lower bracket takes losers from the upper one, and two of its
// matches mix a loser and a winner from different rounds. Connector lines are therefore
// drawn only where a pair of matches really does feed one match; every other feed is
// named on the box instead, which is honest rather than tidy.
const UPPER_COLS=[[[1,2],[3,4]],[[7,8]],[[11]]];
const LOWER_COLS=[[[5],[6]],[[9,10]],[[12]],[[13]]];
function boxSide(side,g,st){
 const num=matchAllianceNum(g,side,st.map), won=matchWinner(g)===side;
 const score=Number.isFinite(g[side+"Score"])?g[side+"Score"]:"";
 return `<div class="bside ${side}${won?" won":""}"><span class="apill">${num?"A"+num:"–"}</span>`+
  `<span class="bteams">${(g[side]||[]).map(t=>`<span class="${t===team?"mine":""}">${t}</span>`).join(" ")}</span>`+
  `<span class="bscore">${score}</span></div>`;
}
function boxFeed(feed,st){
 const r=resolveFeed(feed,st);
 const teams=r.num?allianceTeamNums(r.num):[];
 return `<div class="bside pendingside"><span class="apill">${r.num?"A"+r.num:"?"}</span>`+
  `<span class="bteams">${teams.length?teams.map(t=>`<span class="${t===team?"mine":""}">${t}</span>`).join(" "):esc(r.label)}</span>`+
  `<span class="bscore"></span></div>`;
}
function bracketBox(setNum,st){
 const info=BRACKET[setNum], games=setGames(setNum), g=games[games.length-1];
 const meta=g?matchCardMeta(g):{text:"",cls:"pending"};
 const sides=g&&g.red?.length
  ? boxSide("red",g,st)+boxSide("blue",g,st)
  : info.feeds.map(f=>boxFeed(f,st)).join("");
 const mine=g&&[...(g.red||[]),...(g.blue||[])].includes(team);
 return `<div class="bmatch${mine?" mine":""}"><div class="bhead"><span>M${setNum}</span><span class="bwhen ${meta.cls}">${esc(meta.text)}</span></div>${sides}</div>`;
}
function bracketColumns(cols,st){
 return cols.map(groups=>
  `<div class="bcol">${groups.map(g=>
    `<div class="bpair${g.length>1?" joined":""}">${g.map(sn=>bracketBox(sn,st)).join("")}</div>`
  ).join("")}</div>`
 ).join("");
}
function finalsBox(st){
 const games=finalsGames(), wins=finalsSeriesWins(st);
 const tally=Object.keys(wins).length?Object.entries(wins).map(([n,w])=>`A${n} ${w}`).join(" – "):"Best of 3";
 const sides=games.length&&games[games.length-1].red?.length
  ? games.map(g=>`<div class="bgame"><span class="bglabel">F${g.q}</span>${boxSide("red",g,st)}${boxSide("blue",g,st)}</div>`).join("")
  : ["W11","W13"].map(f=>boxFeed(f,st)).join("");
 return `<div class="bcol finals"><div class="bpair"><div class="bmatch final"><div class="bhead"><span>Finals</span><span class="bwhen">${esc(tally)}</span></div>${sides}</div></div></div>`;
}
function bracketGraphic(st){
 return `<h2 class="section-title">Bracket</h2>
 <div class="bracket-scroll"><div class="bracket">
  <div class="bhalf"><div class="bhalf-label">Upper bracket</div><div class="brow">${bracketColumns(UPPER_COLS,st)}</div></div>
  <div class="bhalf"><div class="bhalf-label">Lower bracket · one loss and you are out</div><div class="brow">${bracketColumns(LOWER_COLS,st)}</div></div>
  <div class="bhalf"><div class="bhalf-label">Finals</div><div class="brow">${finalsBox(st)}</div></div>
 </div></div>`;
}
function bracketMatchCard(s,st){
 const info=BRACKET[s], games=setGames(s), g=games[games.length-1];
 const meta=g?matchCardMeta(g):{text:"Not scheduled",cls:"pending"};
 const rows=g&&g.red?.length?bracketRow("red",g,st)+bracketRow("blue",g,st):info.feeds.map(f=>feedRow(f,st)).join("");
 return `<div class="pmatch"><div class="pmeta"><span class="mnum">M${s}</span><span class="btag ${info.b}">${info.b}</span><span class="ptime ${meta.cls}">${meta.text}</span>${matchVideoLink(g)}</div>${rows}</div>`;
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
   return `<div class="pmatch"><div class="pmeta"><span class="mnum">Final ${g.q}</span><span class="ptime ${meta.cls}">${meta.text}</span>${matchVideoLink(g)}</div>${rows}</div>`;
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
  return `<div class="pmatch"><div class="pmeta"><span class="mnum">${names[g.comp]||g.comp} ${g.set} · Game ${g.q}</span><span class="ptime ${meta.cls}">${meta.text}</span>${matchVideoLink(g)}</div>${rows}</div>`;
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
// Before alliance selection TBA has nothing to draw a bracket from, and saying only
// that reads like the app is stuck — especially mid-event with quals nearly done. Show
// how far quals have got, and who is currently in the top eight, since those are the
// teams about to be picking.
function playoffWaitingHtml(){
 const all=allMatches[activeEventKey()]||[];
 const played=all.filter(matchHasScore).length;
 const ranked=Object.entries(rankings)
  .map(([t,r])=>({t:+t,rank:r?.rank,record:r?.record}))
  .filter(x=>Number.isFinite(x.rank))
  .sort((a,b)=>a.rank-b.rank);
 const progress=all.length
  ? `${played} of ${all.length} qualification matches played.`
  : hasApiKey()?"No qualification matches loaded yet.":"";
 const top=ranked.slice(0,8);
 const topHtml=top.length?`<h2 class="section-title">Top 8 right now</h2>
  <div class="note">Alliance captains are picked in rank order, so this is who would be choosing if selection happened now.</div>
  <div class="agrid">${top.map(x=>
   `<div class="acard${x.t===team?" minecard":""}"><div class="ahead2"><b>#${x.rank}</b><span class="tnum-tap" data-team="${x.t}">${x.t}</span></div>`+
   `<div class="aname">${esc(teams[x.t]||"Team "+x.t)}</div><div class="arec">${esc(x.record||"—")}</div></div>`
  ).join("")}</div>`:"";
 return `<div class="empty">Alliance selection has not been posted to The Blue Alliance yet. ${esc(progress)}</div>${topHtml}`;
}
function renderPlayoffs(){
 const el=$("playoffContent"); if(!el)return;
 const alliances=eventAlliances(), po=eventPlayoffs();
 const keyReminder=!hasApiKey()?'<div class="alert">Add your TBA read API key in <button type="button" class="alert-link" data-open-settings>Settings</button> to load alliances and playoff results.</div>':"";
 if(!alliances.length&&!po.length){
  el.innerHTML=keyReminder+playoffWaitingHtml();
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
  bHtml=bracketGraphic(st)+`<h2 class="section-title">Match detail</h2>`+BRACKET_ROUNDS.map(([r,ms])=>
   `<div class="round-title">Round ${r}</div><div class="pgrid">${ms.map(s=>bracketMatchCard(s,st)).join("")}</div>`
  ).join("")+finalsHtml(st);
 }
 el.innerHTML=keyReminder+champHtml+bHtml+aHtml;
}
// The full directory is thousands of rows, so it is only rebuilt while its tab is up.
function render(){renderHeader();renderNextBar();renderMatches();renderAllMatches();renderTeams();renderPlayoffs();if($("page-allteams")?.classList.contains("active"))renderAllTeams()}
const SAVE_LABEL="Save and refresh";
let refreshTimer;
function setSaveButtonState(btn,state){
 if(!btn)return;
 btn.classList.remove("busy","saved","failed");
 if(state==="busy"){btn.disabled=true;btn.classList.add("busy");btn.textContent="Saving…"}
 // The settings are already in local storage by this point; only the refresh failed.
 else if(state==="failed"){btn.disabled=false;btn.classList.add("failed");btn.textContent="Saved · refresh failed";setTimeout(()=>setSaveButtonState(btn,"idle"),2800)}
 else if(state==="saved"){btn.disabled=false;btn.classList.add("saved");btn.textContent="Saved!";setTimeout(()=>setSaveButtonState(btn,"idle"),1600)}
 else{btn.disabled=false;btn.textContent=SAVE_LABEL}
}
function startRefreshTimer(){
 clearInterval(refreshTimer);
 refreshTimer=setInterval(()=>runTimed(()=>refresh()),Math.max(15,config.refreshSeconds||DEFAULT_REFRESH)*1000);
}
async function api(url,etagKey){
 if(!hasApiKey())throw Error("TBA key required");
 const h={"X-TBA-Auth-Key":config.tbaKey}; if(etags[etagKey])h["If-None-Match"]=etags[etagKey];
 const r=await fetch(url,{headers:h,cache:"no-store",signal:timeoutSignal()}); if(r.status===304)return null;if(!r.ok)throw Error(`TBA ${r.status}`);
 const e=r.headers.get("ETag");if(e){etags[etagKey]=e;save(K.etags,etags)}return r.json();
}
async function fetchStatbotics(ids){
 let good=0;
 await Promise.allSettled(ids.map(async t=>{try{
  const r=await fetch(`https://api.statbotics.io/v3/team_year/${t}/${YEAR}`,{cache:"no-store",signal:timeoutSignal()});if(!r.ok)throw 0;const d=await r.json();
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
  time:x.time,predicted_time:x.predicted_time,actual_time:x.actual_time,post_result_time:x.post_result_time,
  // Only the YouTube key is kept. TBA also lists self-hosted "tba" videos, which have
  // no stable public player, and the rest of the full match record (score_breakdown)
  // is far larger than anything the app shows.
  video:(x.videos||[]).find(v=>v.type==="youtube"&&v.key)?.key||null
 };
}
async function fetchAllEventMatches(){
 if(!hasApiKey())return allMatches[activeEventKey()]||[];
 try{
  const ek=activeEventKey();
  const data=await api(`https://www.thebluealliance.com/api/v3/event/${ek}/matches`,`am2:${ek}`);
  if(data){
   allMatches[ek]=data.filter(x=>x.comp_level==="qm").map(mapTbaMatch);
   playoffMatches[ek]=data.filter(x=>x.comp_level!=="qm").map(mapTbaMatch);
   save(K.allMatches,allMatches);
   save(K.playoffs,playoffMatches);
  }
 }catch{}
 return allMatches[activeEventKey()]||[];
}
async function fetchAlliances(){
 if(!hasApiKey())return;
 try{
  const ek=activeEventKey();
  const data=await api(`https://www.thebluealliance.com/api/v3/event/${ek}/alliances`,`al:${ek}`);
  if(data){allianceData[ek]=data;save(K.alliances,allianceData)}
 }catch{}
}
async function fetchTbaOprs(ids){
 if(!hasApiKey())return 0;
 const data=await api(`https://www.thebluealliance.com/api/v3/event/${activeEventKey()}/oprs`,`o:${activeEventKey()}`);
 if(!data){
  return ids.filter(t=>epa[t]?.source==="opr"&&Number.isFinite(epa[t]?.total)).length;
 }
 if(!data.oprs)return 0;
 const ranked=Object.entries(data.oprs).map(([k,v])=>({t:tn(k),total:+v})).filter(x=>Number.isFinite(x.total)).sort((a,b)=>b.total-a.total);
 ranked.forEach((x,i)=>{
  eventOpr[x.t]={total:x.total,rank:i+1};
  // epa only takes the OPR when nothing better is there, so enabling Statbotics does
  // not have OPR overwrite the EPA the win estimates are using.
  if(ids.includes(x.t)&&epa[x.t]?.source!=="epa")epa[x.t]={total:x.total,rank:i+1,source:"opr"};
 });
 save(K.eventOpr,eventOpr);
 // Every event carries OPR for its whole field, not just the teams on screen, so the
 // All teams catalogue is filled from the full response.
 recordTeamPower(Object.fromEntries(ranked.map(x=>[x.t,x.total])),activeEventKey());
 return ids.filter(t=>Number.isFinite(epa[t]?.total)).length;
}
// TBA carries the stream on the full event record, not the simple one. Events with a
// stream per day list several; the one dated today wins, otherwise the first.
async function fetchWebcasts(){
 if(!hasApiKey())return;
 const key=activeEventKey(); if(!key)return;
 try{
  const data=await api(`https://www.thebluealliance.com/api/v3/event/${key}`,`wc:${key}`);
  if(data){webcasts[key]=data.webcasts||[];save(K.webcasts,webcasts)}
 }catch{}
}
function webcastUrl(w){
 if(!w?.channel)return null;
 if(w.type==="youtube")return `https://www.youtube.com/watch?v=${encodeURIComponent(w.channel)}`;
 if(w.type==="twitch")return `https://www.twitch.tv/${encodeURIComponent(w.channel)}`;
 // Every other type TBA lists (livestream, dacast, nab, …) has no stable public URL
 // pattern, so send those to the event page, which embeds whatever it is.
 return `https://www.thebluealliance.com/event/${encodeURIComponent(activeEventKey())}`;
}
function eventStream(){
 const list=webcasts[activeEventKey()]||[];
 if(!list.length)return null;
 const today=todayYmd();
 const pick=list.find(w=>w.date===today)||list.find(w=>!w.date)||list[0];
 const url=webcastUrl(pick);
 return url?{url,type:pick.type}:null;
}
// Both ratings are fetched now that the Teams tab shows them in their own columns. OPR
// is a single request for the whole field, so it is always worth having; EPA is one
// request per team, so it stays behind the Statbotics setting.
async function refreshPowerRatings(ids,notes){
 if(config.statbotics){
  const epaGood=await fetchStatbotics(ids);
  if(epaGood)notes.push(`${epaGood} EPA`);
 }
 try{
  const good=await fetchTbaOprs(ids);
  if(good)notes.push(`${good} OPR from TBA`);
  else notes.push("OPR unavailable");
 }catch(e){notes.push(`OPR ${e.message||"cached"}`)}
 saveLive(K.epa,epa);
 syncPowerLabels();
}
async function refresh(force=false){
 $("statusTime").innerHTML='<span class="warn">Refreshing…</span>';
 $("statusDetail").innerHTML='<span class="warn">Refreshing live data…</span>'; const notes=[];
 if(!hasApiKey())notes.push("TBA key not set");
 else{
 try{
  const data=await api(`https://www.thebluealliance.com/api/v3/event/${activeEventKey()}/matches`,`m2:${activeEventKey()}`);
  if(data){
   matches=data.filter(x=>x.comp_level==="qm"&&(x.alliances.red.team_keys.includes("frc"+team)||x.alliances.blue.team_keys.includes("frc"+team))).map(mapTbaMatch);
   saveLive(K.matches,matches);notes.push("matches updated")
  }else notes.push("matches unchanged");
 }catch(e){notes.push(`matches ${e.message||"cached"}`)}
 try{
  const data=await api(`https://www.thebluealliance.com/api/v3/event/${activeEventKey()}/rankings`,`r:${activeEventKey()}`);
  if(data){const n={};(data.rankings||[]).forEach(x=>{const t=tn(x.team_key);n[t]={rank:x.rank,record:`${x.record?.wins??0}-${x.record?.losses??0}-${x.record?.ties??0}`}});rankings=n;saveLive(K.rankings,n);notes.push("ranks updated")}else notes.push("ranks unchanged");
 }catch(e){notes.push(`ranks ${e.message||"cached"}`)}
 try{
  const data=await api(`https://www.thebluealliance.com/api/v3/event/${activeEventKey()}/teams/simple`,`t:${activeEventKey()}`);
  if(data){data.forEach(x=>teams[tn(x.key)]=x.nickname||x.name);save(K.teams,teams);notes.push("names updated");renderHeader()}
 }catch(e){notes.push(`names ${e.message||"cached"}`)}
 }
 await refreshPowerRatings(allTeams(),notes);
 if(hasApiKey())await loadTeamEvents({autoPick:false});
 await fetchAllEventMatches();
 await fetchAlliances();
 await fetchWebcasts();
 render();
 const t=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
 $("statusTime").innerHTML=`<span class="ok">Updated ${t}</span>`;
 $("statusDetail").innerHTML=`<span class="ok">Updated ${t}</span> · ${notes.join(" · ")}`;
}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>{document.querySelectorAll(".tab,.page").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("page-"+b.dataset.page).classList.add("active");if(b.dataset.page==="matches")scrollToNextMatch();if(b.dataset.page==="allmatches")renderAllMatches();if(b.dataset.page==="playoffs")renderPlayoffs();if(b.dataset.page==="settings")renderCacheDetails();if(b.dataset.page==="allteams"){loadAllTabData();renderAllTeams()}requestAnimationFrame(syncStickyOffsets)}));
$("cachePanel").addEventListener("toggle",()=>{if($("cachePanel").open)renderCacheDetails()});
$("matchList").addEventListener("click",e=>{
 if(e.target.closest("[data-open-settings]")){openSettings();return}
 if(e.target.closest("[data-open-power-help]")){openPowerHelp();return}
 const tb=e.target.closest("[data-team]");
 if(tb)openTeamDetail(+tb.dataset.team);
});
$("allMatchList").addEventListener("click",e=>{
 if(e.target.closest("[data-open-settings]")){openSettings();return}
 const tb=e.target.closest("[data-team]");
 if(tb)openTeamDetail(+tb.dataset.team);
});
$("playoffContent").addEventListener("click",e=>{
 if(e.target.closest("[data-open-settings]"))openSettings();
 const tb=e.target.closest("[data-team]");
 if(tb)openTeamDetail(+tb.dataset.team);
});
$("teamDetailClose").addEventListener("click",()=>$("teamDetail").close());
$("teamDetail").addEventListener("click",e=>{if(e.target===$("teamDetail"))$("teamDetail").close()});
$("powerHelpBtn").addEventListener("click",openPowerHelp);
$("refreshBtn").addEventListener("click",async()=>{
 const b=$("refreshBtn");
 if(b.disabled)return; // also stops a second tap stacking another refresh
 b.disabled=true;
 await runTimed(()=>refresh(true));
 b.disabled=false;
});
$("teamChip").addEventListener("click",()=>openSwitcher("team"));
$("eventChip").addEventListener("click",()=>openSwitcher("event"));
$("switcherClose").addEventListener("click",closeSwitcher);
$("switcherSearch").addEventListener("input",renderSwitcher);
$("switcherList").addEventListener("click",e=>{
 const b=e.target.closest("[data-pick]");
 if(b)switcherPick(b.dataset.pick);
});
// Tapping the dim area outside the sheet closes it, the way a sheet is expected to.
$("switcher").addEventListener("click",e=>{if(e.target===$("switcher"))closeSwitcher()});
// Suggestions are chosen on pointerdown, which beats the input's blur and so keeps the
// list from closing under the finger. Not every tap produces a usable pointerdown
// though — a tap that starts with a hint of scroll inside the list, or a browser
// without pointer events — so click is wired as a fallback and the two are deduped.
function onComboPick(listId,attr,pick){
 const list=$(listId); if(!list)return;
 let last=0;
 const choose=(e,viaPointer)=>{
  const b=e.target.closest(`[${attr}]`);
  if(!b)return;
  const now=Date.now();
  if(!viaPointer&&now-last<700)return; // the pointerdown already handled this tap
  last=now;
  e.preventDefault();
  list.hidden=true;
  pick(b);
 };
 list.addEventListener("pointerdown",e=>choose(e,true));
 list.addEventListener("click",e=>choose(e,false));
}
$("refreshEventsBtn").addEventListener("click",async()=>{
 const b=$("refreshEventsBtn");
 if(!hasApiKey()){updateEventDirNote();return}
 b.disabled=true;b.textContent="Downloading…";
 await Promise.all(seasonYears().map(y=>loadAllEvents(y,true)));
 b.disabled=false;b.textContent="Update event list";
});
$("researchBanner").addEventListener("click",e=>{if(e.target.closest("[data-exit-research]"))exitResearch()});
$("nextBarGo").addEventListener("click",()=>scrollToNextMatch());
// One second, and only the bar: a full render every tick would rebuild the whole
// timeline underneath the user's finger.
setInterval(renderNextBar,1000);
$("teamPageBack").addEventListener("click",closeTeamSeason);
$("teamPage").addEventListener("click",e=>{
 const y=e.target.closest("[data-season-year]");
 if(y)openTeamSeason(teamPage.team,+y.dataset.seasonYear);
});
$("teamDetail").addEventListener("click",e=>{
 const b=e.target.closest("[data-team-season]");
 if(b)openTeamSeason(+b.dataset.teamSeason);
});
$("refreshTeamsBtn").addEventListener("click",async()=>{
 const b=$("refreshTeamsBtn");
 if(!hasApiKey()){updateTeamDirNote();return}
 b.disabled=true;b.textContent="Downloading…";
 await loadAllTeams(true);
 b.disabled=false;b.textContent="Update team list";
});
// Each settings section saves only its own fields, merging into the shared config so
// one section's Save never overwrites what the other holds.
$("saveApiBtn").addEventListener("click",async()=>{
 const btn=$("saveApiBtn");
 setSaveButtonState(btn,"busy");
 config={...config,tbaKey:$("tbaKey").value.trim(),refreshSeconds:Math.max(15,+$("refreshSeconds").value||DEFAULT_REFRESH),statbotics:$("statboticsEnabled").checked};
 save(K.config,config);
 syncEventUI();
 startRefreshTimer();
 const ok=await runTimed(async()=>{
  await loadTeamEvents({autoPick:!config.eventManual});
  await refresh(true);
 });
 setSaveButtonState(btn,ok?"saved":"failed");
});
$("clearCacheBtn").addEventListener("click",async()=>{
 const b=$("clearCacheBtn");
 b.disabled=true;b.textContent="Clearing…";
 try{if(window.caches){const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)))}}catch{}
 try{if("serviceWorker"in navigator){const rs=await navigator.serviceWorker.getRegistrations();await Promise.all(rs.map(r=>r.unregister()))}}catch{}
 location.reload();
});
$("clearBtn").addEventListener("click",()=>{Object.values(K).forEach(k=>localStorage.removeItem(k));location.reload()});
$("teamSearch").addEventListener("input",e=>{teamSearch=e.target.value;renderTeams()});
$("allTeamSearch").addEventListener("input",e=>{allTeamSearch=e.target.value;allTeamsShown=ALL_TEAMS_PAGE;renderFilterHistory();renderAllTeams()});
$("allTeamSearch").addEventListener("focus",e=>{e.target.select();renderFilterHistory()});
// The delay lets a tap on a suggestion land before the list closes, but the box can be
// focused again within it, so re-check before hiding rather than hiding unconditionally.
$("allTeamSearch").addEventListener("blur",e=>{
 rememberFilter(e.target.value);
 setTimeout(()=>{if(document.activeElement!==$("allTeamSearch"))$("allTeamSearchList").hidden=true},150);
});
// change fires on Enter as well as blur, which is how a filter typed and submitted from
// the phone keyboard gets remembered without waiting for focus to move.
$("allTeamSearch").addEventListener("change",e=>rememberFilter(e.target.value));
onComboPick("allTeamSearchList","data-filter",b=>applyFilter(b.dataset.filter));
$("activeOnly").addEventListener("change",e=>{
 activeOnly=e.target.checked;allTeamsShown=ALL_TEAMS_PAGE;saveAllPrefs();
 loadAllTabData();
 renderAllTeams();
});
document.querySelectorAll("#page-allteams .seg").forEach(b=>b.addEventListener("click",()=>{
 if(allMode===b.dataset.mode)return;
 allMode=b.dataset.mode;allTeamsShown=ALL_TEAMS_PAGE;saveAllPrefs();
 // The filter belongs to the list being filtered; a team name is meaningless here.
 allTeamSearch="";$("allTeamSearch").value="";$("allTeamSearchList").hidden=true;
 loadAllTabData();
 renderAllTeams();
}));

$("allTeamsMore").addEventListener("click",()=>{allTeamsShown+=ALL_TEAMS_PAGE;renderAllTeams()});
// Tapping a row opens that team's season: every event with rank, record and playoff
// result — the same page the team lookup opens.
$("allTeamsList").addEventListener("click",e=>{
 const teamRow=e.target.closest("[data-team]"), eventRow=e.target.closest("[data-event]");
 if(!teamRow&&!eventRow)return;
 // Acting on a row is the clearest sign the filter did its job, so keep it.
 rememberFilter(allTeamSearch);
 // A team opens its season; an event switches to it exactly as the header chip does —
 // one of your team's events becomes your own, anything else opens in research mode.
 if(teamRow)openTeamSeason(+teamRow.dataset.team);
 else chooseEvent(eventRow.dataset.event,eventRow.dataset.name);
});
$("teamList").addEventListener("click",e=>{
 const btn=e.target.closest("[data-sort]");
 if(btn){teamSort=btn.dataset.sort;renderTeams();return}
 const row=e.target.closest("[data-team]");
 if(row)openTeamDetail(+row.dataset.team);
});
render();scrollToNextMatch("auto");loadTeamEvents().then(()=>runTimed(()=>refresh()));startRefreshTimer();renderCacheDetails();
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));

// Detect when a newer build has been deployed and reload the whole app.
const VERSION_CHECK_MS=5*60*1000;
let reloading=false;
async function checkForUpdate(){
 // Skip when unstamped (local/dev) or when the tab is hidden.
 if(reloading||!VERSION_STAMPED||document.hidden)return;
 try{
  const r=await fetch("./version.json?_="+Date.now(),{cache:"no-store",signal:timeoutSignal(8000)});
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
