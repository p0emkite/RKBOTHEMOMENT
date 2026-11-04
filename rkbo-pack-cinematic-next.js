/* RTM CINEMATIC NEXT v1 — visual-only layer. Does not call RPC or mutate draws.
 * Legacy engine remains unchanged and can be selected in the pack UI.
 */
(function(root){"use strict";
 const MODE_KEY="rtm-cinematic-mode-v2";
 const SOUND_KEY="rtm-cinematic-sound-v2";
 const PHASES=[["intro",900],["arena",1120],["charge",1600],["reveal",1550]];
 const COLORS={
  "코랄":["CORAL","#fb889c","coral"],
  "다이아몬드":["DIAMOND","#8de8ff","diamond"],
  "신인왕":["ROOKIE OF THE YEAR","#e2b2ff","special"],
  "MVP":["MOST VALUABLE PLAYER","#e2b2ff","special"],
  "드림":["DREAM ALL-STAR","#e2b2ff","special"],
  "나눔":["NANUM ALL-STAR","#e2b2ff","special"],
  "베스트릴리프":["BEST RELIEF","#e2b2ff","special"]
 };
 const SPECIAL={"신인왕":"ROY","MVP":"MVP","드림":"DREAM","나눔":"NANUM","베스트릴리프":"RELIEF"};
 const TEAMS=["DOO","HAN","KIA","KIW","KT","LG","LOT","NC","SAM","SSG"];
 const escapeHTML=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 let soundContext=null,playing=false;
 function stored(key,fallback){
  try{return root.localStorage.getItem(key)||fallback}catch(_){return fallback}
 }
 function write(key,value){
  try{root.localStorage.setItem(key,value)}catch(_){}
 }
 function getMode(){return stored(MODE_KEY,"next")==="legacy"?"legacy":"next"}
 function setMode(mode){
  if(mode!=="legacy"&&mode!=="next")return false;
  write(MODE_KEY,mode);
  return true;
 }
 function getSound(){return stored(SOUND_KEY,"off")==="on"}
 function setSound(enabled){write(SOUND_KEY,enabled?"on":"off")}
 function unlockAudio(){
  if(!getSound())return;
  try{
   const AudioCtx=root.AudioContext||root.webkitAudioContext;
   if(!AudioCtx)return;
   if(!soundContext)soundContext=new AudioCtx();
   if(soundContext.state==="suspended")soundContext.resume().catch(()=>{});
  }catch(e){console.warn("[RTM cinematic] sound unavailable",e)}
 }
 function cue(phase){
  if(!getSound()||!soundContext||soundContext.state!=="running")return;
  const notes={intro:[128,163],arena:[196,246],charge:[330,392,493],reveal:[587,783,988]}[phase]||[];
  try{
   notes.forEach((frequency,i)=>{
    const now=soundContext.currentTime+i*.075;
    const o=soundContext.createOscillator(),g=soundContext.createGain();
    o.type=phase==="charge"?"sawtooth":"sine";
    o.frequency.setValueAtTime(frequency,now);
    if(phase==="charge")o.frequency.exponentialRampToValueAtTime(frequency*1.18,now+.16);
    g.gain.setValueAtTime(.0001,now);
    g.gain.exponentialRampToValueAtTime(.024,now+.025);
    g.gain.exponentialRampToValueAtTime(.0001,now+.32);
    o.connect(g);g.connect(soundContext.destination);
    o.start(now);o.stop(now+.34);
   });
  }catch(e){console.warn("[RTM cinematic] cue",e)}
 }
 function getEmblem(grade,player){
  const kind=player?.specialKind||SPECIAL[grade];
  if(kind&&["ROY","MVP","DREAM","NANUM","RELIEF"].includes(kind))
   return "./assets/special-emblems/"+kind+".webp";
  let team=String(player?.displayTeamCode||player?.team||"").toUpperCase();
  if(team==="SK")team="SSG";
  if(TEAMS.includes(team))return "./assets/teams/"+team+(team==="NC"?".png":".svg");
  return "";
 }
 function getCard(player){
  if(!player)return "<div class='rkbo-next-card-placeholder'>RTM</div>";
  try{return root.RKBOCardView?.render?.(player,true)||
   "<div class='rkbo-next-card-placeholder'>"+escapeHTML(player.name||"RTM")+"</div>"}
  catch(e){
   console.warn("[RTM cinematic] fallback card",e);
   return "<div class='rkbo-next-card-placeholder'>"+escapeHTML(player.name||"RTM")+"</div>";
  }
 }
 function particles(){
  let html="";
  for(let i=0;i<46;i++){
   const x=(i*37+17)%100,y=(i*53+11)%100;
   const delay=((i*13)%29)/10,scale=(i%4+2)/4;
   html+="<i class='rkbo-next-spark' style='--px:"+x+"%;--py:"+y+"%;--pd:"+delay+"s;--ps:"+scale+"'></i>";
  }
  return html;
 }
 function createLayer(grade,player){
  const rarity=COLORS[grade]||COLORS["코랄"];
  const emblem=getEmblem(grade,player);
  const playerName=escapeHTML(player?.name||"");
  const layer=document.createElement("div");
  layer.className="rkbo-next-layer";
  layer.dataset.phase="intro";
  layer.dataset.tier=rarity[2];
  layer.setAttribute("role","dialog");
  layer.setAttribute("aria-modal","true");
  layer.setAttribute("aria-label","RTM 카드 개봉 시네마틱");
  layer.style.setProperty("--rkbo-next-accent",rarity[1]);
  layer.innerHTML=
   "<div class='rkbo-next-world' aria-hidden='true'><div class='rkbo-next-stadium'></div>"+
    "<div class='rkbo-next-field-lights'></div><div class='rkbo-next-gate rkbo-next-gate-left'></div>"+
    "<div class='rkbo-next-gate rkbo-next-gate-right'></div></div>"+
   "<div class='rkbo-next-shade' aria-hidden='true'></div>"+
   "<div class='rkbo-next-wash' aria-hidden='true'></div>"+
   "<div class='rkbo-next-sparks' aria-hidden='true'>"+particles()+"</div>"+
   "<div class='rkbo-next-speedlines' aria-hidden='true'></div>"+
   "<div class='rkbo-next-topline'><span class='rkbo-next-brand'>RTM <small>RKBO THE MOMENT</small></span>"+
    "<span class='rkbo-next-livetag'>PACK REVEAL // 2026</span></div>"+
   "<div class='rkbo-next-gate-label' aria-hidden='true'>ENTER THE MOMENT<small>OPENING CEREMONY</small></div>"+
   "<div class='rkbo-next-board' aria-live='off'><span class='rkbo-next-board-tag'>RARITY DETECTED</span>"+
    "<strong>"+escapeHTML(rarity[0])+"</strong><span class='rkbo-next-board-line'></span></div>"+
   "<div class='rkbo-next-impact' aria-hidden='true'><i></i><i></i><i></i><i></i>"+
    (emblem?"<img class='rkbo-next-emblem' alt='' src='"+escapeHTML(emblem)+"'>":"")+"</div>"+
   "<div class='rkbo-next-card-stage' aria-hidden='true'><div class='rkbo-next-card-rotator'>"+
    "<div class='rkbo-next-card-side rkbo-next-card-back'><img src='./assets/card-back.webp' alt=''></div>"+
    "<div class='rkbo-next-card-side rkbo-next-card-front'>"+getCard(player)+"</div>"+
    "</div></div>"+
   "<div class='rkbo-next-bottom'><span class='rkbo-next-player'>"+playerName+"</span>"+
    "<span class='rkbo-next-caption'>THE NEXT LEGEND IS HERE</span></div>"+
   "<button type='button' class='rkbo-next-skip' aria-label='연출 건너뛰기'>연출 건너뛰기 <span>↗</span></button>";
  return layer;
 }
 async function play(stage,grade,shouldContinue,player){
  const legacy=()=>root.RKBOPackCinematic?.play?.(stage,grade,shouldContinue,player)??false;
  if(getMode()==="legacy"||!COLORS[grade])return legacy();
  if(playing||!stage?.isConnected)return false;
  playing=true;
  let layer=null,skip=false,release=null;
  const allowed=()=>stage.isConnected&&shouldContinue?.()!==false;
  const awaken=()=>{if(release){const fn=release;release=null;fn()}};
  function skipNow(){skip=true;awaken()}
  function onKey(event){
   if(event.key!=="Escape")return;
   event.preventDefault();event.stopImmediatePropagation();
   skipNow();
  }
  function pause(ms){
   return new Promise(resolve=>{
    let finished=false;
    let timer,poller;
    const finish=()=>{
     if(finished)return;
     finished=true;clearTimeout(timer);clearInterval(poller);
     if(release===finish)release=null;
     resolve();
    };
    release=finish;
    timer=setTimeout(finish,ms);
    poller=setInterval(()=>{if(!allowed()||skip)finish()},70);
   });
  }
  try{
   if(!allowed())return false;
   layer=createLayer(grade,player);
   document.body.append(layer);
   layer.querySelector(".rkbo-next-skip").addEventListener("click",skipNow);
   root.addEventListener("keydown",onKey,true);
   const reduced=!!root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
   if(reduced){
    layer.dataset.phase="reveal";
    await pause(180);
   }else{
    for(const [phase,time] of PHASES){
     if(!allowed())return false;
     if(skip)break;
     layer.dataset.phase=phase;
     cue(phase);
     await pause(time);
    }
   }
   if(!allowed())return false;
   layer.dataset.phase="out";
   await pause(skip?90:360);
   return allowed();
  }catch(error){
   console.warn("[RTM cinematic] V2 failed; using legacy",error);
   if(!allowed())return false;
   return await legacy();
  }finally{
   awaken();
   if(layer)layer.remove();
   root.removeEventListener("keydown",onKey,true);
   playing=false;
  }
 }
 root.RKBOPackCinematicNext={play,getMode,setMode,getSound,setSound,unlockAudio};
})(window);
