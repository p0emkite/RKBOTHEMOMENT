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
 const engine=window.RKBOPackCinematicNext,legacy=window.RKBOPackCinematic;
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
  if(!engine&&!legacy){setStatus("시네마틱 스크립트 로딩 실패 — 페이지를 새로고침해 주세요.");return}
  const current=++token,player={...samples[grade]},selectedMode=mode.value;
  engine?.setMode?.(selectedMode);
  engine?.setSound?.(sound.checked);
  engine?.unlockAudio?.();
  setBusy(true);
  stageLabel.textContent=selectedMode==="next"?"CINEMATIC 2.0 RUNNING":"LEGACY CINEMATIC RUNNING";
  setStatus(player.tier+" 등급 연출 재생 중…");
  try{
   stage.innerHTML='<div class="lab-running" aria-hidden="true"></div>';
   const currentEngine=engine||legacy;
   const ok=await currentEngine.play(stage,grade,()=>current===token,player);
   if(!ok||current!==token){setStatus("시연이 중단되었어.");return}
   playCount++;
   stage.innerHTML='<div class="lab-result">'+
    '<span class="lab-result-label">✦ '+h(player.tier)+' — REVEAL COMPLETE</span>'+
    window.RKBOCardView.render(player)+'</div>';
   counter.textContent=String(playCount).padStart(2,"0")+" / "+String(playCount).padStart(2,"0");
   stageLabel.textContent="REVEAL COMPLETE";
   setStatus("✅ "+player.tier+" 등급 연출 완료 · 다시 재생할 수 있어!");
  }catch(e){
   console.error("[RTM Lab] preview playback failed",e);
   setStatus("연출 재생 오류: "+(e?.message||"알 수 없는 오류"));
   initialStage();
  }finally{
   if(current===token)setBusy(false);
  }
 }
 function resetStage(){
  if(busy)return;
  token++;
  initialStage();
  setStatus("무대를 초기화했어. 새 등급을 선택할 수 있어.");
 }
 if(!engine||!legacy)console.warn("[RTM Lab] cinematic component missing",{engine:!!engine,legacy:!!legacy});
 mode.value=engine?.getMode?.()||"next";
 sound.checked=!!engine?.getSound?.();
 choices.forEach(button=>button.addEventListener("click",()=>selectGrade(button.dataset.grade)));
 mode.addEventListener("change",()=>{engine?.setMode?.(mode.value);setStatus(mode.value==="next"?"시네마틱 2.0 선택 완료":"기존 시네마틱 1.0 선택 완료")});
 sound.addEventListener("change",()=>{engine?.setSound?.(sound.checked);if(sound.checked)engine?.unlockAudio?.();setStatus(sound.checked?"효과음 켜짐":"효과음 꺼짐")});
 launch.addEventListener("click",play);
 reset.addEventListener("click",resetStage);
 selectGrade(grade);
 window.RTMCinematicLab={getState:()=>({grade,mode:mode.value,sound:sound.checked,busy,playCount})};
})();