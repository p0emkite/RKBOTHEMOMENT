/* RTM Cinematic Lab — visual-only, no authentication / Supabase / server draws. */
(function(){"use strict";
 const samples={
  "코랄":{id:"60-SAM-투-004",name:"Fukutomi Tsuki",team:"SAM",role:"PITCHER",grade:"코랄",tier:"CORAL",tone:"#ff8da0"},
  "다이아몬드":{id:"60-SAM-타-011",name:"Ash Yu",team:"SAM",role:"BATTER",grade:"다이아몬드",tier:"DIAMOND",tone:"#8edfff"},
  "드림":{id:"60-SAM-투-004-SPECIAL-DREAM",name:"Fukutomi Tsuki",team:"SAM",role:"ALL-STAR",grade:"드림",tier:"DREAM ALL-STAR",tone:"#d2a0ff",specialKind:"DREAM"},
  "신인왕":{id:"60-SAM-타-012-SPECIAL-ROY",name:"ROY SHOWCASE",team:"SAM",role:"ROOKIE OF THE YEAR",grade:"신인왕",tier:"ROY",tone:"#c9a0fc",specialKind:"ROY"},
  "MVP":{id:"60-KIA-투-006-SPECIAL-MVP",name:"MVP SHOWCASE",team:"KIA",role:"MOST VALUABLE PLAYER",grade:"MVP",tier:"MVP",tone:"#f2c979",specialKind:"MVP"}
 };
 const mode=document.querySelector("#mode"),sound=document.querySelector("#sound"),launch=document.querySelector("#launch"),
 reset=document.querySelector("#reset"),stage=document.querySelector("#rkbo-pack-stage"),status=document.querySelector("#status"),
 stageLabel=document.querySelector("#stageLabel"),counter=document.querySelector("#counter"),choices=[...document.querySelectorAll("[data-grade]")];
 const engine=window.RKBOPackCinematicNext,legacy=window.RKBOPackCinematic,ultra=window.RTMUltra;
 const MODE_KEY="rtm-lab-selected-mode-v3";
 // Public read-only pack artwork currently configured for 60차 [KING of the JUNGLE].
 // Production play always reads the user's selected pack directly from rkbo_pack_settings.
 const REAL_PACK_ART="https://stajnaagugudgsabntuq.supabase.co/storage/v1/object/public/rkbo-pack-art/season-60/1793024890343-37511bf5-9930-4f86-b0e1-ca5d5395a17a.png";
 let demoAssetsPromise=null,lastOriginalCard=null;
 const absolute=path=>new URL(path,document.baseURI).href;
 async function demoAssets(){
  if(!demoAssetsPromise)demoAssetsPromise=(async()=>{
   const [html,photos,backgrounds]=await Promise.all([
    fetch("./index.html",{cache:"force-cache"}).then(r=>{if(!r.ok)throw Error("60차 도감 데이터를 불러올 수 없어요.");return r.text()}),
    fetch("./data/card-images.json").then(r=>r.json()),
    fetch("./data/team-backgrounds.json").then(r=>r.json())
   ]);
   const doc=new DOMParser().parseFromString(html,"text/html");
   const raw=doc.querySelector('script#data[type="application/json"]')?.textContent;
   if(!raw)throw Error("60차 도감의 원본 선수 데이터를 찾지 못했어요.");
   const players=JSON.parse(raw);
   const map=new Map(players.map(p=>[p.id,p]));
   window.RKBOArt={
    imageState:p=>{
     const state=photos.images?.[p.id]||photos.images?.[String(p.id).replace(/-SPECIAL-[A-Z]+$/,"")]||{};
     return {...state,url:state.path?absolute(state.path):""};
    }
   };
   window.RKBOTeamBackground={
    imageState:p=>{
     const state=backgrounds.teams?.[p.team]||{};
     return {...state,url:state.path?absolute(state.path):""};
    }
   };
   window.RKBOTeamBrand={
    code:p=>p.team,
    logo:p=>absolute("assets/teams/"+p.team+(p.team==="NC"?".png":".svg"))
   };
   window.RKBOCardSpecials={
    icon:k=>absolute("assets/special-emblems/"+k+".webp"),
    backgroundFor:p=>["ROY","MVP","RELIEF"].includes(p.specialKind)?{
     url:absolute("assets/special-backgrounds/"+p.specialKind+".webp"),overlay:0,zoom:1,x:0,y:0
    }:null
   };
   return map;
  })();
  return demoAssetsPromise;
 }
 async function exactPreviewCard(sample){
  if(!window.RKBOCardExport?.make)throw Error("원본 도감 카드 생성기를 불러오지 못했어요.");
  const baseId=sample.id.replace(/-SPECIAL-[A-Z]+$/,"");
  const map=await demoAssets(),base=map.get(baseId);
  if(!base)throw Error("도감에서 선수를 찾지 못했어요: "+baseId);
  const player={...base,id:sample.id,grade:sample.grade};
  if(sample.specialKind)player.specialKind=sample.specialKind;
  const image=await window.RKBOCardExport.make(player,{gold_border:false,prism:false});
  lastOriginalCard=image;
  return image;
 }

 let grade="다이아몬드",busy=false,token=0,playCount=0;
 const h=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 window.RKBOCardView={
  render(player){
   const tone=player.tone||"#8edfff";
   const photo="./assets/cards/"+player.id+".webp";
   const logo="./assets/teams/"+player.team+".svg";
   return '<article class="player-card lab-player-card" style="--card-tone:'+tone+'" aria-label="'+h(player.name)+' 데모 카드">'+
     '<div class="player-head"><span>RTM 60th</span><img class="team-logo" alt="" src="'+h(logo)+'"></div>'+
     '<div class="player-portrait"><img src="'+h(photo)+'" onerror="this.onerror=null;this.src=\'./assets/default-batter.png\'" alt="" draggable="false"></div>'+
     '<div class="player-caption"><small>'+h(player.role)+'</small><strong>'+h(player.name)+'</strong><b>'+h(player.tier)+'</b></div></article>';
  }
 };
 function setBusy(value){
  busy=value;
  launch.disabled=value;reset.disabled=value;mode.disabled=value;sound.disabled=value;
  choices.forEach(button=>button.disabled=value);
  launch.querySelector("strong").textContent=value?"연출 재생 중…":"시네마틱 재생";
 }
 function setStatus(text){status.textContent=text}
 function initialStage(){
  stage.innerHTML='<div class="placeholder">'+
   '<div class="halo"></div><div class="pack-art"><span>RTM</span><strong>THE<br>MOMENT</strong><small>COLLECTOR\'S PACK</small></div>'+
   '<p>YOUR MOMENT AWAITS</p><small>아래에서 등급을 선택하고 개봉해 봐!</small></div>';
  stageLabel.textContent="READY FOR REVEAL";counter.textContent="00 / 00";
 }
 function selectGrade(next){
  if(!samples[next]||busy)return;
  grade=next;
  for(const el of choices){
   const current=el.dataset.grade===next;
   el.classList.toggle("selected",current);el.setAttribute("aria-pressed",String(current));
  }
  setStatus(samples[next].tier+" 등급 시연 준비 완료");
  stageLabel.textContent="RARITY: "+samples[next].tier;
 }
 async function play(){
  if(busy)return;
  if(!engine&&!legacy&&!ultra){setStatus("시네마틱 스크립트 로딩 실패 — 페이지를 새로고침해 주세요.");return}
  // Never silently show the tiny atlas when the real RTM HD asset fails to load.
  if(mode.value==="ultra"&&!window.RKBODoorPhoto?.url){
   setStatus("RTM 고해상도 문 텍스처 로드 실패. 새로고침 후 다시 시도해 줘.");
   return;
  }
  const current=++token,player={...samples[grade]},selectedMode=mode.value;
  lastOriginalCard=null;
  engine?.setMode?.(selectedMode==="legacy"?"legacy":"next");
  engine?.setSound?.(sound.checked);
  ultra?.setSound?.(sound.checked);
  engine?.unlockAudio?.();
  ultra?.unlockAudio?.();
  setBusy(true);
  stageLabel.textContent=selectedMode==="ultra"?"REAL 3D CINEMATIC 3.0":selectedMode==="next"?"CINEMATIC 2.0 RUNNING":"LEGACY CINEMATIC RUNNING";
  setStatus(player.tier+" 등급 연출 재생 중…");
  try{
   stage.innerHTML='<div class="lab-running" aria-hidden="true"></div>';
   const currentEngine=selectedMode==="ultra"?(ultra||engine||legacy):selectedMode==="legacy"?(legacy||engine):(engine||legacy);
   const ok=await currentEngine.play(stage,grade,()=>current===token,player,{
    strictAssets:selectedMode==="ultra",
    packArtUrl:REAL_PACK_ART,
    renderCard:exactPreviewCard,
    onPhase:phase=>{
     if(current!==token)return;
     const messages={portal:"야구장 입장",flight:"3D 카드팩 진입",charge:"등급 에너지 충전",rupture:"카드팩 파열",ascend:"선수 카드 등장",flip:"3D 카드 회전",hero:"레전드 공개"};
     if(messages[phase])setStatus("🎬 "+messages[phase]+" · "+player.tier);
    }
   });
   if(!ok||current!==token){setStatus("시연이 중단되었어.");return}
   playCount++;
   const realResult=lastOriginalCard&&selectedMode==="ultra"?
    '<div class="lab-real-card" role="img" aria-label="'+h(player.name)+' 원본 도감 카드">'+
    '<img alt="" src="'+lastOriginalCard.toDataURL("image/png")+'"></div>':
    window.RKBOCardView.render(player);
   stage.innerHTML='<div class="lab-result">'+
    '<span class="lab-result-label">✦ '+h(player.tier)+' — REVEAL COMPLETE</span>'+
    realResult+'</div>';
   counter.textContent=String(playCount).padStart(2,"0")+" / "+String(playCount).padStart(2,"0");
   stageLabel.textContent="REVEAL COMPLETE";
   activateResultTilt();
   const usedFallback=selectedMode==="ultra"?ultra?.getFallback?.():"";
   setStatus(usedFallback?"3D 엔진을 사용할 수 없어 2.0으로 대체했어: "+usedFallback:"✅ "+player.tier+" 등급 연출 완료 · 다시 재생할 수 있어!");
  }catch(e){
   console.error("[RTM Lab] preview playback failed",e);
   setStatus("연출 재생 오류: "+(e?.message||"알 수 없는 오류"));
   initialStage();
  }finally{
   if(current===token)setBusy(false);
  }
 }
 function activateResultTilt(){
  const card=stage.querySelector(".lab-result .lab-player-card,.lab-result .lab-real-card");
  if(!card)return;
  function move(event){
   const bounds=card.getBoundingClientRect();
   const x=Math.max(-1,Math.min(1,((event.clientX-bounds.left)/bounds.width-.5)*2));
   const y=Math.max(-1,Math.min(1,((event.clientY-bounds.top)/bounds.height-.5)*2));
   card.style.setProperty("--tilt-y",(x*16).toFixed(2)+"deg");
   card.style.setProperty("--tilt-x",(-y*13).toFixed(2)+"deg");
   card.style.setProperty("--shine-x",((x+1)*50).toFixed(1)+"%");
   card.style.setProperty("--shine-y",((y+1)*50).toFixed(1)+"%");
  }
  function rest(){
   card.style.setProperty("--tilt-x","0deg");
   card.style.setProperty("--tilt-y","0deg");
  }
  card.addEventListener("pointermove",move);
  card.addEventListener("pointerleave",rest);
  card.addEventListener("pointercancel",rest);
 }
 function resetStage(){
  if(busy)return;
  token++;
  initialStage();
  setStatus("무대를 초기화했어. 새 등급을 선택할 수 있어.");
 }
 if(!engine||!legacy||!ultra)console.warn("[RTM Lab] some cinematic component missing",{engine:!!engine,legacy:!!legacy,ultra:!!ultra});
 let saved="ultra";try{saved=localStorage.getItem(MODE_KEY)||"ultra"}catch(_){}
 mode.value=["ultra","next","legacy"].includes(saved)?saved:"ultra";
 sound.checked=!!engine?.getSound?.();
 choices.forEach(button=>button.addEventListener("click",()=>selectGrade(button.dataset.grade)));
 mode.addEventListener("change",()=>{
  engine?.setMode?.(mode.value==="legacy"?"legacy":"next");
  try{localStorage.setItem(MODE_KEY,mode.value)}catch(_){}
  const labels={ultra:"진짜 3D 시네마틱 3.0",next:"시네마틱 2.0",legacy:"기존 시네마틱 1.0"};
  setStatus(labels[mode.value]+" 선택 완료");
 });
 sound.addEventListener("change",()=>{
  engine?.setSound?.(sound.checked);ultra?.setSound?.(sound.checked);
  if(sound.checked){engine?.unlockAudio?.();ultra?.unlockAudio?.()}
  setStatus(sound.checked?"효과음 켜짐":"효과음 꺼짐");
 });
 launch.addEventListener("click",play);
 launch.addEventListener("pointerenter",()=>{if(mode.value==="ultra")ultra?.preload?.().catch(()=>{})});
 reset.addEventListener("click",resetStage);
 selectGrade(grade);
 window.RTMCinematicLab={getState:()=>({grade,mode:mode.value,sound:sound.checked,busy,playCount})};
})();