/* RTM CINEMATIC ULTRA 3.0
 * Isolated WebGL/Three.js showcase. NEVER draws inventory, hits Supabase, or changes odds.
 * Loads a pinned Three.js ESM build; if GPU/CDN unavailable, gracefully uses Cinematic 2.0.
 */
(function(root){"use strict";
 const VERSION="0.187.0";
 const THREE_URL="https://cdn.jsdelivr.net/npm/three@"+VERSION+"/build/three.module.js";
 const COLORS={
  "코랄":{name:"CORAL",hex:0xff859f,code:"#ff859f",tag:"CORAL"},
  "다이아몬드":{name:"DIAMOND",hex:0x79eaff,code:"#79eaff",tag:"DIAMOND"},
  "드림":{name:"DREAM ALL-STAR",hex:0xd4a2ff,code:"#d4a2ff",tag:"SPECIAL"},
  "나눔":{name:"NANUM ALL-STAR",hex:0xd4a2ff,code:"#d4a2ff",tag:"SPECIAL"},
  "신인왕":{name:"ROOKIE OF THE YEAR",hex:0xffd18a,code:"#ffd18a",tag:"SPECIAL"},
  "MVP":{name:"MOST VALUABLE PLAYER",hex:0xffcf71,code:"#ffcf71",tag:"SPECIAL"},
  "베스트릴리프":{name:"BEST RELIEF",hex:0xb69dff,code:"#b69dff",tag:"SPECIAL"}
 };
 let libraryPromise=null, audio=null, audioEnabled=false, active=false, lastFallback="";
 const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
 const mix=(a,b,t)=>a+(b-a)*t;
 const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
 const easeOut=t=>1-Math.pow(1-clamp(t,0,1),3);
 const between=(t,a,b)=>smooth((t-a)/(b-a));
 const phaseAt=t=>t<.9?"portal":t<2.45?"flight":t<3.55?"charge":t<4.25?"rupture":t<5.65?"ascend":t<6.55?"flip":t<8.75?"hero":"out";
 function importThree(){if(!libraryPromise)libraryPromise=import(THREE_URL);return libraryPromise}
 function escapeHTML(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
 function loadImage(src){
  return new Promise(resolve=>{
   const image=new Image();
   let done=false;
   const finish=ok=>{if(done)return;done=true;clearTimeout(timer);resolve(ok?image:null)};
   const timer=setTimeout(()=>finish(false),2800);
   image.onload=()=>finish(true);image.onerror=()=>finish(false);
   image.src=src;
  });
 }
 function canvas(w,h){const c=document.createElement("canvas");c.width=w;c.height=h;return [c,c.getContext("2d")]}
 function font(ctx,size,weight){ctx.font=weight+" "+size+"px system-ui,'Arial Black',sans-serif"}
 function packArtwork(tier,part){
  const [c,ctx]=canvas(512,768);ctx.save();
  const bg=ctx.createLinearGradient(0,0,512,768);
  bg.addColorStop(0,"#192e4a");bg.addColorStop(.25,"#061023");bg.addColorStop(.7,"#10294e");bg.addColorStop(1,"#020714");
  ctx.fillStyle=bg;ctx.fillRect(0,0,512,768);
  const burst=ctx.createRadialGradient(260,340,8,260,360,410);
  burst.addColorStop(0,tier.code+"88");burst.addColorStop(.5,tier.code+"24");burst.addColorStop(1,"transparent");
  ctx.fillStyle=burst;ctx.fillRect(0,0,512,768);
  ctx.strokeStyle="#fff4be88";ctx.lineWidth=9;ctx.strokeRect(24,24,464,720);
  ctx.strokeStyle="#fbd8a266";ctx.lineWidth=2;ctx.strokeRect(37,37,438,694);
  for(let i=0;i<22;i++){
   ctx.beginPath();ctx.moveTo((i*47)%512,0);ctx.lineTo(512-(i*79)%512,768);
   ctx.strokeStyle=i%3===0?"#fff7d719":"#fff7d70b";ctx.lineWidth=2;ctx.stroke();
  }
  ctx.translate(256,360);
  for(let i=0;i<12;i++){ctx.rotate(Math.PI/6);ctx.fillStyle=i%2?"#b8cfff10":tier.code+"16";ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(48,-320);ctx.lineTo(-48,-320);ctx.fill()}
  ctx.setTransform(1,0,0,1,0,0);
  font(ctx,53,"900");ctx.textAlign="center";ctx.fillStyle="#d6b77b";ctx.shadowBlur=15;ctx.shadowColor="#ffcb77";ctx.fillText("R  T  M",256,178);ctx.shadowBlur=0;
  font(ctx,67,"900");ctx.fillStyle="#f8fbff";ctx.fillText("THE",256,334);ctx.fillText("MOMENT",256,401);
  ctx.fillStyle=tier.code;font(ctx,26,"900");ctx.fillText(tier.name,256,510);
  ctx.fillStyle="#d5c59e";font(ctx,21,"800");ctx.fillText("SEASON 60  /  COLLECTOR'S EDITION",256,612);
  ctx.fillStyle="#9eb7ce";font(ctx,17,"700");ctx.fillText("R K B O   ·   T H E   M O M E N T",256,670);
  ctx.fillStyle="#dfc58e";ctx.fillRect(32,42,448,9);
  if(part==="top"){
   ctx.fillStyle="#050916bf";ctx.fillRect(0,570,512,198);
   ctx.fillStyle="#fff1bf";font(ctx,40,"900");ctx.fillText("PULL  TO  REVEAL",256,661);
  }
  ctx.restore();return c;
 }
 function cardArtwork(tier,player,photo){
  const [c,ctx]=canvas(600,840);
  const bg=ctx.createLinearGradient(0,0,600,840);
  bg.addColorStop(0,"#234e70");bg.addColorStop(.54,"#061429");bg.addColorStop(1,"#010612");
  ctx.fillStyle=bg;ctx.fillRect(0,0,600,840);
  const light=ctx.createRadialGradient(305,355,20,305,400,470);
  light.addColorStop(0,tier.code+"aa");light.addColorStop(1,"transparent");
  ctx.fillStyle=light;ctx.fillRect(0,0,600,840);
  if(photo){
   const sourceRatio=photo.width/photo.height,areaRatio=560/640;
   let sx=0,sy=0,sw=photo.width,sh=photo.height;
   if(sourceRatio>areaRatio){sw=photo.height*areaRatio;sx=(photo.width-sw)/2}
   else{sh=photo.width/areaRatio;sy=(photo.height-sh)/2}
   ctx.save();ctx.beginPath();ctx.rect(20,55,560,660);ctx.clip();
   ctx.globalAlpha=.96;ctx.drawImage(photo,sx,sy,sw,sh,20,55,560,660);ctx.restore();
  }else{
   ctx.fillStyle=tier.code+"5c";ctx.beginPath();ctx.ellipse(300,400,145,280,0,0,Math.PI*2);ctx.fill();
  }
  const grad=ctx.createLinearGradient(0,360,0,840);
  grad.addColorStop(0,"#02081700");grad.addColorStop(.55,"#0209179c");grad.addColorStop(1,"#020817");
  ctx.fillStyle=grad;ctx.fillRect(0,360,600,480);
  ctx.strokeStyle=tier.code;ctx.lineWidth=10;ctx.strokeRect(16,16,568,808);
  ctx.strokeStyle="#ffffffb8";ctx.lineWidth=2;ctx.strokeRect(33,33,534,774);
  for(let j=0;j<9;j++){
   const angle=(j/9)*Math.PI*2;
   ctx.strokeStyle=tier.code+"49";ctx.lineWidth=3;ctx.beginPath();
   ctx.moveTo(300+Math.cos(angle)*110,375+Math.sin(angle)*110);
   ctx.lineTo(300+Math.cos(angle)*390,375+Math.sin(angle)*390);ctx.stroke();
  }
  ctx.textAlign="left";ctx.fillStyle="#fff";ctx.shadowColor="#000";ctx.shadowBlur=9;
  font(ctx,34,"900");ctx.fillText("RTM",54,89);
  ctx.textAlign="right";font(ctx,26,"900");ctx.fillText("60th  //  "+(player?.team||"SAM"),545,90);
  ctx.textAlign="center";
  let label=String(player?.name||"RTM PLAYER").slice(0,26);
  font(ctx,label.length>14?47:60,"900");ctx.fillText(label,300,720);
  ctx.shadowBlur=0;ctx.fillStyle=tier.code;font(ctx,28,"900");ctx.fillText(tier.name,300,773);
  ctx.fillStyle="#dde6f5";font(ctx,18,"700");ctx.fillText("THE NEXT LEGEND IS HERE",300,807);
  return c;
 }
 function cardBackArtwork(tier,photo){
  const [c,ctx]=canvas(600,840);
  const bg=ctx.createLinearGradient(0,0,600,840);
  bg.addColorStop(0,"#233756");bg.addColorStop(.4,"#020816");bg.addColorStop(1,"#1b3260");
  ctx.fillStyle=bg;ctx.fillRect(0,0,600,840);
  if(photo){ctx.globalAlpha=.28;ctx.drawImage(photo,0,0,600,840);ctx.globalAlpha=1}
  ctx.strokeStyle=tier.code;ctx.lineWidth=17;ctx.strokeRect(22,22,556,796);
  ctx.strokeStyle="#dcb879";ctx.lineWidth=3;ctx.strokeRect(42,42,516,756);
  ctx.save();ctx.translate(300,420);
  for(let k=0;k<12;k++){ctx.rotate(Math.PI/6);ctx.fillStyle=k%2?tier.code+"2b":"#e7e6e933";ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-27,-320);ctx.lineTo(27,-320);ctx.fill()}
  ctx.restore();
  ctx.fillStyle="#fff";ctx.textAlign="center";font(ctx,90,"900");ctx.fillText("RTM",300,400);
  font(ctx,55,"900");ctx.fillText("THE MOMENT",300,468);
  ctx.fillStyle=tier.code;font(ctx,24,"900");ctx.fillText("CARD ARCHIVE",300,555);
  return c;
 }
 function glowTexture(THREE){
  const [c,ctx]=canvas(64,64);
  const g=ctx.createRadialGradient(32,32,1,32,32,32);
  g.addColorStop(0,"rgba(255,255,255,1)");g.addColorStop(.25,"rgba(255,255,255,.8)");
  g.addColorStop(.55,"rgba(255,255,255,.22)");g.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
 }
 function createDOM(tier){
  const el=document.createElement("div");
  el.className="rtm-ultra";el.dataset.phase="loading";
  el.style.setProperty("--ultra-color",tier.code);
  el.innerHTML=
   '<div class="ultra-backdrop" aria-hidden="true"></div>'+
   '<div class="ultra-veil" aria-hidden="true"></div>'+
   '<div class="ultra-canvas-root"></div>'+
   '<div class="ultra-screen-flash" aria-hidden="true"></div>'+
   '<div class="ultra-letterbox top"></div><div class="ultra-letterbox bottom"></div>'+
   '<div class="ultra-hud"><div class="ultra-head"><strong>RTM <small>THE MOMENT</small></strong><span>60TH SEASON // CINEMATIC 3.0</span></div>'+
   '<div class="ultra-title"><small>R A R I T Y&nbsp;&nbsp; D E T E C T E D</small><strong>'+escapeHTML(tier.name)+'</strong><i></i></div>'+
   '<div class="ultra-impact-copy">B R E A K &nbsp; T H E &nbsp; L I M I T</div>'+
   '<div class="ultra-footer"><span>YOU ARE WITNESSING THE MOMENT</span><span class="ultra-step">LOADING WEBGL</span></div></div>'+
   '<button type="button" class="ultra-skip" aria-label="연출 건너뛰기">SKIP <span>↗</span></button>';
  return el;
 }
 function startAudio(){
  if(!audioEnabled)return;
  try{
   const AudioCtx=root.AudioContext||root.webkitAudioContext;
   if(!AudioCtx)return;
   if(!audio)audio=new AudioCtx();
   if(audio.state==="suspended")audio.resume().catch(()=>{});
  }catch(e){console.warn("[RTM Ultra] audio unavailable",e)}
 }
 function soundCue(kind){
  if(!audioEnabled||!audio||audio.state!=="running")return;
  const base={portal:110,flight:150,charge:220,rupture:64,ascend:330,flip:440,hero:590}[kind]||220;
  const n=kind==="rupture"?6:kind==="hero"?4:3;
  for(let i=0;i<n;i++){
   const at=audio.currentTime+i*(kind==="rupture"?.028:.07);
   try{
    const o=audio.createOscillator(),v=audio.createGain();
    o.type=kind==="rupture"?"sawtooth":kind==="charge"?"triangle":"sine";
    const hz=base*Math.pow(1.26,i);
    o.frequency.setValueAtTime(hz,at);
    if(kind==="rupture")o.frequency.exponentialRampToValueAtTime(hz*.42,at+.26);
    else o.frequency.exponentialRampToValueAtTime(hz*1.08,at+.29);
    v.gain.setValueAtTime(.0001,at);v.gain.exponentialRampToValueAtTime(kind==="rupture"?.026:.016,at+.02);
    v.gain.exponentialRampToValueAtTime(.0001,at+(kind==="rupture"?.32:.48));
    o.connect(v);v.connect(audio.destination);o.start(at);o.stop(at+.51);
   }catch(e){console.warn("[RTM Ultra] audio cue",e);break}
  }
 }
 function fallback(stage,grade,shouldContinue,player,reason){
  lastFallback=reason||"3D 렌더러 오류";
  console.warn("[RTM Ultra] "+lastFallback+" — falling back to Cinematic 2.0");
  const other=root.RKBOPackCinematicNext||root.RKBOPackCinematic;
  if(!other?.play)return Promise.resolve(false);
  if(other.setMode)other.setMode("next");
  return other.play(stage,grade,shouldContinue,player);
 }
 async function play(stage,grade,shouldContinue,player,options){
  if(active||!stage?.isConnected)return false;
  const tier=COLORS[grade]||COLORS["다이아몬드"];
  const allowed=()=>stage.isConnected&&shouldContinue?.()!==false;
  active=true;lastFallback="";
  let overlay,renderer,scene,raf=0,onResize,onMove,onKey,skipAction,disposed=false;
  const ownsTextures=[];
  const dispose=()=>{
   if(disposed)return;disposed=true;
   if(raf)cancelAnimationFrame(raf);
   root.removeEventListener("resize",onResize);
   root.removeEventListener("pointermove",onMove);
   root.removeEventListener("keydown",onKey,true);
   if(scene){
    const geometries=new Set(),materials=new Set();
    scene.traverse(obj=>{
     if(obj.geometry)geometries.add(obj.geometry);
     const ms=Array.isArray(obj.material)?obj.material:(obj.material?[obj.material]:[]);
     ms.forEach(m=>materials.add(m));
    });
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
   }
   ownsTextures.forEach(t=>t.dispose());
   if(renderer){renderer.dispose();renderer.forceContextLoss?.()}
   overlay?.remove();active=false;
  };
  try{
   if(!allowed()){active=false;return false}
   overlay=createDOM(tier);
   document.body.appendChild(overlay);
   const skipButton=overlay.querySelector(".ultra-skip");
   const three=await Promise.race([
    importThree(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error("Three.js 연결 제한 시간 초과")),6500))
   ]);
   if(!allowed()){dispose();return false}
   const reduced=!!root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
   const low=/(iPhone|Android|iPad|iPod)/i.test(navigator.userAgent)||root.innerWidth<700;
   const canvasNode=document.createElement("canvas");canvasNode.className="ultra-webgl";
   overlay.querySelector(".ultra-canvas-root").append(canvasNode);
   renderer=new three.WebGLRenderer({canvas:canvasNode,alpha:true,antialias:!low,powerPreference:"high-performance"});
   renderer.setPixelRatio(Math.min(root.devicePixelRatio||1,low?1.3:1.75));
   renderer.outputColorSpace=three.SRGBColorSpace;
   renderer.toneMapping=three.ACESFilmicToneMapping;renderer.toneMappingExposure=1.65;
   const THREE=three;
   scene=new THREE.Scene();
   scene.fog=new THREE.FogExp2(0x030813,.018);
   const camera=new THREE.PerspectiveCamera(low?46:39,1,.1,120);
   camera.position.set(0,.25,9.2);
   scene.add(new THREE.AmbientLight(0xb8d5ff,2.0));
   const key=new THREE.PointLight(tier.hex,85,26,2);key.position.set(-3,3,4);scene.add(key);
   const fill=new THREE.PointLight(0x7dccff,60,22,2);fill.position.set(3,-2,3);scene.add(fill);
   const back=new THREE.PointLight(0xffffff,40,20,2);back.position.set(0,1,-4);scene.add(back);
   const glow=glowTexture(THREE);ownsTextures.push(glow);
   const canvasTexture=c=>{
    const tex=new THREE.CanvasTexture(c);
    tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    ownsTextures.push(tex);return tex;
   };
   const packMap=canvasTexture(packArtwork(tier,"main")),ripMap=canvasTexture(packArtwork(tier,"top"));
   const [portrait,backImage]=await Promise.all([
    loadImage("./assets/cards/"+(player?.id||"60-SAM-타-011")+".webp"),
    loadImage("./assets/card-back.webp")
   ]);
   if(!allowed()){dispose();return false}
   const frontMap=canvasTexture(cardArtwork(tier,player,portrait));
   const backMap=canvasTexture(cardBackArtwork(tier,backImage));
   const edgeMat=new THREE.MeshPhysicalMaterial({color:tier.hex,metalness:.95,roughness:.16});
   const frontMat=new THREE.MeshPhysicalMaterial({map:frontMap,metalness:.2,roughness:.22,clearcoat:1,clearcoatRoughness:.06,side:THREE.FrontSide});
   const reverseMat=new THREE.MeshPhysicalMaterial({map:backMap,metalness:.22,roughness:.24,clearcoat:.9,clearcoatRoughness:.13});
   const foilMat=new THREE.MeshPhysicalMaterial({map:packMap,metalness:.55,roughness:.25,clearcoat:.8,clearcoatRoughness:.12});
   const ripMat=new THREE.MeshPhysicalMaterial({map:ripMap,metalness:.65,roughness:.25,clearcoat:.95});
   const blackMat=new THREE.MeshStandardMaterial({color:0x10243f,metalness:.8,roughness:.28});
   const pack=new THREE.Group();scene.add(pack);
   const lower=new THREE.Mesh(new THREE.BoxGeometry(2.25,3.17,.22),
     [blackMat,blackMat,blackMat,blackMat,foilMat,blackMat]);
   lower.position.y=-.22;pack.add(lower);
   const upper=new THREE.Mesh(new THREE.BoxGeometry(2.25,.56,.25),
     [blackMat,blackMat,blackMat,blackMat,ripMat,blackMat]);
   upper.position.y=1.64;pack.add(upper);
   const seam=new THREE.Mesh(new THREE.BoxGeometry(2.27,.035,.32),
     new THREE.MeshBasicMaterial({color:tier.hex,transparent:true,opacity:.77}));
   seam.position.y=1.34;pack.add(seam);
   const cards=new THREE.Group();scene.add(cards);
   const card=new THREE.Mesh(new THREE.BoxGeometry(1.98,2.81,.045),
     [edgeMat,edgeMat,edgeMat,edgeMat,frontMat,reverseMat]);
   cards.add(card);
   const border=new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(2.005,2.835,.06)),
    new THREE.LineBasicMaterial({color:tier.hex,transparent:true,opacity:.78}));
   cards.add(border);
   const sheen=new THREE.Mesh(new THREE.PlaneGeometry(1.94,2.77),
     new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.05,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
   sheen.position.z=.035;cards.add(sheen);
   cards.visible=false;
   // World-space energy field, glow trails and rotating dimensional rings.
   const rig=new THREE.Group();scene.add(rig);
   const rings=[];
   for(let i=0;i<5;i++){
    const g=new THREE.TorusGeometry(1.6+i*.31,.012+(i%2)*.012,8,90);
    const m=new THREE.MeshBasicMaterial({color:tier.hex,transparent:true,opacity:.35,blending:THREE.AdditiveBlending,depthWrite:false});
    const ring=new THREE.Mesh(g,m);ring.rotation.x=i*.35+.35;ring.rotation.y=i*.33;
    ring.scale.setScalar(.4);rig.add(ring);rings.push(ring);
   }
   const core=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:tier.hex,transparent:true,opacity:.25,blending:THREE.AdditiveBlending,depthWrite:false}));
   core.scale.set(4.3,4.3,1);rig.add(core);
   const particleCount=low?440:1400;
   const pGeo=new THREE.BufferGeometry(),positions=new Float32Array(particleCount*3),velocity=new Float32Array(particleCount*4);
   for(let i=0;i<particleCount;i++){
    velocity[i*4]=Math.random()*Math.PI*2;
    velocity[i*4+1]=.8+Math.random()*4.8;
    velocity[i*4+2]=(Math.random()-.5)*8;
    velocity[i*4+3]=.3+Math.random()*1.6;
   }
   pGeo.setAttribute("position",new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
   const pMat=new THREE.PointsMaterial({size:low?.095:.085,map:glow,color:tier.hex,opacity:.9,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,depthTest:false,sizeAttenuation:true});
   const particles=new THREE.Points(pGeo,pMat);scene.add(particles);
   const dustCount=low?150:370,dustPos=new Float32Array(dustCount*3);
   for(let i=0;i<dustCount;i++){dustPos[i*3]=(Math.random()-.5)*24;dustPos[i*3+1]=(Math.random()-.5)*15;dustPos[i*3+2]=-Math.random()*16-2}
   const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute("position",new THREE.BufferAttribute(dustPos,3));
   const dust=new THREE.Points(dustGeo,new THREE.PointsMaterial({map:glow,color:0xa9cfff,size:low?.055:.075,transparent:true,opacity:.46,blending:THREE.AdditiveBlending,depthWrite:false}));
   scene.add(dust);
   const shardCount=low?65:150;
   const shards=new THREE.InstancedMesh(new THREE.TetrahedronGeometry(.13,0),
    new THREE.MeshStandardMaterial({color:tier.hex,metalness:.78,roughness:.26,emissive:tier.hex,emissiveIntensity:.4,side:THREE.DoubleSide}),shardCount);
   const shardInfo=Array.from({length:shardCount},()=>({
    a:Math.random()*Math.PI*2,e:(Math.random()-.5)*2,r:1+Math.random()*4.3,
    spin:Math.random()*4+1,s:.2+Math.random()*1.7
   }));
   scene.add(shards);shards.frustumCulled=false;
   const instObj=new THREE.Object3D();
   const layerTime={start:performance.now(),previous:"",pointerX:0,pointerY:0,moveX:0,moveY:0,skipped:false};
   const stageHud=overlay.querySelector(".ultra-step");
   onMove=e=>{
    layerTime.pointerX=clamp((e.clientX/root.innerWidth-.5)*2,-1,1);
    layerTime.pointerY=clamp((e.clientY/root.innerHeight-.5)*2,-1,1);
   };
   onResize=()=>{
    const w=root.innerWidth,h=root.innerHeight;
    camera.aspect=Math.max(.2,w/Math.max(h,1));camera.updateProjectionMatrix();
    renderer.setSize(w,h,false);
   };
   onKey=e=>{
    if(e.key!=="Escape"&&e.key!==" ")return;
    e.preventDefault();e.stopImmediatePropagation();skipAction?.();
   };
   root.addEventListener("resize",onResize,{passive:true});
   root.addEventListener("pointermove",onMove,{passive:true});
   root.addEventListener("keydown",onKey,true);
   onResize();
   const timeline=reduced?3.2:9.18;
   const startMs=performance.now();
   function applyFrame(realT,dt){
    // Reduced-motion still renders a readable 3D hero card without the accelerated spin.
    const t=reduced?mix(6.8,8.74,smooth(realT/timeline)):realT;
    const phase=phaseAt(t);
    if(phase!==layerTime.previous){
     layerTime.previous=phase;overlay.dataset.phase=phase;
     stageHud.textContent=({portal:"STADIUM ONLINE",flight:"PACK INBOUND",charge:"RARE ENERGY DETECTED",
      rupture:"PACK BREAK",ascend:"CARD ASCENDING",flip:"IDENTITY REVEAL",hero:"LEGEND UNLOCKED",out:"FINISH"})[phase];
     options?.onPhase?.(phase);
     soundCue(phase);
    }
    const flight=between(t,.8,2.42),charge=between(t,2.45,3.50),breakout=between(t,3.55,4.20);
    const ascend=between(t,4.13,5.62),flip=between(t,5.43,6.46),hero=between(t,6.5,8.7);
    const pulse=Math.sin(t*10)*.5+.5;
    // Camera starts close to ground, orbits around the airborne foil pack, then pushes toward the card.
    const baseZ= t<2.4?mix(11.5,7.6,flight):t<4.1?mix(7.6,7.05,charge):mix(7.05,6.75,ascend);
    const shake=(t>3.52&&t<4.42)?(.18*(1-between(t,3.6,4.4))):0;
    const px=layerTime.pointerX*.28,py=layerTime.pointerY*.18;
    camera.position.x=Math.sin(t*1.05)*(.55*(1-flip))+px*hero+(Math.random()-.5)*shake;
    camera.position.y=mix(-.3,.2,flight)+Math.cos(t*.95)*.16-py*hero+(Math.random()-.5)*shake;
    camera.position.z=baseZ+(Math.random()-.5)*shake*.7;
    camera.lookAt(0,0,0);
    // Foil pack is a true 3D object with an independent tear-off section.
    pack.visible=t<5.25;
    pack.scale.setScalar(mix(.43,1.02,flight));
    pack.position.set(mix(4.7,0,flight)+Math.sin(t*5)*.05,mix(-4.0,0,flight),mix(-5,0,flight));
    pack.rotation.y=mix(-2.35,.14,flight)+Math.sin(t*2.2)*(.2*(1-breakout));
    pack.rotation.x=mix(.9,-.1,flight)+Math.sin(t*8)*charge*.025;
    pack.rotation.z=mix(-.75,.03,flight)+Math.sin(t*39)*charge*.014;
    lower.position.y=-.22-(breakout*.72);
    lower.rotation.z=breakout*-.27;
    upper.position.set(breakout*2.7,1.64+breakout*2.3,breakout*.95);
    upper.rotation.set(breakout*.9,breakout*2.0,breakout*3.9);
    seam.scale.set(1+breakout*2.8,1,1);seam.material.opacity=.8*(1-breakout);
    if(t>4.18)pack.position.z=-breakout*1.3-ascend*2.3;
    cards.visible=t>=4.06;
    const emerge=ascend;
    cards.position.set(mix(0,-.03,emerge),mix(-1.3,0,emerge),mix(-1.1,.78,emerge));
    cards.scale.setScalar(mix(.42,1.2,easeOut(emerge))*(1+.035*Math.sin(t*2.5)*hero));
    cards.rotation.y=mix(Math.PI*1.4,Math.PI,emerge)*(1-flip)+(-.08+px*.32)*flip;
    cards.rotation.z=mix(.38,.0,emerge)+(Math.sin(t*2.15)*.035*hero);
    cards.rotation.x=mix(-.35,.01,emerge)+(Math.cos(t*1.7)*.05*hero)+py*.21*hero;
    sheen.material.opacity=hero*(.09+.08*Math.sin(t*3));
    key.intensity=45+charge*85+Math.max(0,Math.sin(t*19))*55*(1-breakout)+hero*45;
    fill.intensity=35+emerge*55+hero*35;
    // Energy cages rotate in 3 axes; rings accelerate before detonation.
    rig.position.set(0,0,t>4?-.6:0);
    rig.rotation.set(t*.52,t*.91,t*.23);
    const ringEnergy=between(t,2.26,3.3)*(1-between(t,4.1,4.85));
    rig.visible=ringEnergy>0.01||hero>0;
    for(let i=0;i<rings.length;i++){
     const ring=rings[i];
     ring.rotation.x+=dt*(.35+i*.14);ring.rotation.y+=dt*(.85+i*.22);
     const scale=.2+ringEnergy*(1.2+i*.16)+hero*(1.28+i*.21);
     ring.scale.setScalar(scale);
     ring.material.opacity=.34*ringEnergy+.075*hero;
    }
    core.material.opacity=.24*ringEnergy+.16*hero+.16*Math.max(0,Math.sin(t*15))*charge*(1-breakout);
    core.scale.setScalar(3+ringEnergy*3+breakout*3);
    // GPU-drawn luminous particle cloud with CPU-updated orbital 3D positions.
    const burst=between(t,3.63,4.45);
    const cloud=phase==="flight"?.55:1;
    for(let i=0;i<particleCount;i++){
     const ang=velocity[i*4]+t*(1.4+velocity[i*4+3]*.35);
     const rad=velocity[i*4+1]*(1-.7*charge*(1-burst));
     const expelled=burst*(1+velocity[i*4+3]*3);
     positions[3*i]=Math.cos(ang)*(rad*.55+expelled)+Math.sin(t+i)*.035;
     positions[3*i+1]=Math.sin(ang*1.37)*(rad*.46+expelled*.65);
     positions[3*i+2]=velocity[i*4+2]*.48+Math.cos(ang*.6)*.85+expelled*.47;
    }
    pGeo.attributes.position.needsUpdate=true;
    pMat.opacity=clamp(.45+charge*.5+hero*.2,0,1);
    pMat.size=(low?.095:.085)*(1+charge*.3+burst*.65);
    particles.rotation.y=t*.08;particles.scale.setScalar(cloud);
    // Independent 3D metal fragments with real depth (instanced to keep draw calls low).
    shards.visible=t>3.42&&t<7.4;
    const shardT=between(t,3.56,4.28);
    for(let i=0;i<shardCount;i++){
     const s=shardInfo[i],dist=shardT*s.r;
     instObj.position.set(Math.cos(s.a)*dist,Math.sin(s.a)*dist+s.e*shardT,s.e*1.5+Math.cos(s.a*2)*dist*.4);
     instObj.rotation.set(t*s.spin+i,t*s.spin*.73+i*.1,t*s.spin*.46);
     instObj.scale.setScalar(Math.max(.001,Math.sin(Math.PI*clamp((t-3.50)/4.2,0,1))*.8*s.s));
     instObj.updateMatrix();shards.setMatrixAt(i,instObj.matrix);
    }
    shards.instanceMatrix.needsUpdate=true;
    scene.rotation.z=0;
    renderer.render(scene,camera);
   }
   return await new Promise(resolve=>{
    let complete=false,oldTime=performance.now();
    const finish=ok=>{
     if(complete)return;complete=true;
     dispose();resolve(ok);
    };
    skipAction=()=>{layerTime.skipped=true;finish(allowed())};
    skipButton.addEventListener("click",skipAction);
    function tick(now){
     if(complete)return;
     if(!allowed()){finish(false);return}
     const time=(now-startMs)/1000;
     if(time>=timeline){finish(true);return}
     const dt=Math.min((now-oldTime)/1000,.05);oldTime=now;
     try{applyFrame(time,dt)}catch(e){console.warn("[RTM Ultra] runtime render error",e);finish(false);return}
     raf=requestAnimationFrame(tick);
    }
    raf=requestAnimationFrame(tick);
   });
  }catch(err){
   console.warn("[RTM Ultra] initialization error",err);
   dispose();
   if(!allowed())return false;
   return fallback(stage,grade,shouldContinue,player,err?.message||String(err));
  }finally{
   active=false;
  }
 }
 root.RTMUltra={play,setSound:enabled=>{audioEnabled=!!enabled},unlockAudio:startAudio,
  getFallback:()=>lastFallback,preload:importThree,version:"3.0"};
})(window);
