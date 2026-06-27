/* Mulliganaire — real-course engine: OpenStreetMap data + Esri imagery + live GPS + crowdsource */
(function(){
const ESRI='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const MG={map:null,tiles:null,course:null,hi:0,edit:false,pos:null,layers:null,userMk:null,measureMk:null,started:false,elev:{},wind:null,windAt:0,windLoc:null,mode:'measure',shotsData:{}};
window.MG=MG;
const R=6371000, rd=d=>d*Math.PI/180, deg=r=>r*180/Math.PI;
function dist(a,b){const dLat=rd(b[1]-a[1]),dLon=rd(b[0]-a[0]),la1=rd(a[1]),la2=rd(b[1]);const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(h));}
const yd=m=>Math.round(m/0.9144);
function brg(a,b){const y=Math.sin(rd(b[0]-a[0]))*Math.cos(rd(b[1]));const x=Math.cos(rd(a[1]))*Math.sin(rd(b[1]))-Math.sin(rd(a[1]))*Math.cos(rd(b[1]))*Math.cos(rd(b[0]-a[0]));return Math.atan2(y,x);}
function dest(p,b,m){const dr=m/R,la1=rd(p[1]),lo1=rd(p[0]);const la2=Math.asin(Math.sin(la1)*Math.cos(dr)+Math.cos(la1)*Math.sin(dr)*Math.cos(b));const lo2=lo1+Math.atan2(Math.sin(b)*Math.sin(dr)*Math.cos(la1),Math.cos(dr)-Math.sin(la1)*Math.sin(la2));return [deg(lo2),deg(la2)];}
const ll=p=>[p[1],p[0]];
const club=y=>(window.clubFor?window.clubFor(y):'');

function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,40);}
function edits(){try{return JSON.parse(localStorage.getItem('mg_edits')||'{}');}catch(e){return {};}}
function saveEdit(course,hole,type,lonlat){const e=edits();e[course]=e[course]||{};e[course][hole]=e[course][hole]||{};e[course][hole][type]=lonlat;localStorage.setItem('mg_edits',JSON.stringify(e));updateEditCount();}
function editCount(){const e=edits();let n=0;for(const c in e)for(const h in e[c])n+=Object.keys(e[c][h]).length;return n;}
function updateEditCount(){const el=document.getElementById('mgEdits');if(el)el.textContent=editCount()+' local edit'+(editCount()===1?'':'s');}

function loadCourse(c){
  const e=edits()[c.n]||{};
  c.holes.forEach(h=>{
    if(e[h.h]&&e[h.h].t)h.t=e[h.h].t;
    if(e[h.h]&&e[h.h].g)h.g=e[h.h].g;
    const b=brg(h.g,h.t);            // green -> tee
    h.front=dest(h.g,b,13);          // 13m toward tee
    h.back=dest(h.g,b+Math.PI,13);   // 13m away
  });
  MG.course=c; MG.hi=0;
  const nm=document.getElementById('mgCourseName'); if(nm)nm.textContent=c.n;
  MG.shotsData=loadShots();
  updateEditCount();
}

function clear(){ if(MG.layers)MG.layers.clearLayers(); }
function divMk(cls,txt){return L.divIcon({className:'mgi '+cls,html:txt||'',iconSize:[16,16]});}

function renderHole(){
  if(!MG.course)return;
  const h=MG.course.holes[MG.hi];
  document.getElementById('mgHoleNum').textContent=h.h;
  document.getElementById('mgHolePar').textContent=h.par||'–';
  document.getElementById('mgHoleYds').textContent=(h.y||yd(dist(h.t,h.g)))+'y'+(h.approx?' ~est':'');
  clear();
  L.polyline([ll(h.t),ll(h.g)],{color:'#fff',weight:2,opacity:.7,dashArray:'4 7'}).addTo(MG.layers);
  // hazards near this hole
  (MG.course.hz||[]).forEach(z=>{const p=[z[1],z[2]];if(dist(p,h.g)<240||dist(p,h.t)<240){L.circleMarker(ll(p),{radius:5,color:z[0]==='w'?'#46c8ff':'#e9dcae',weight:1,fillColor:z[0]==='w'?'#2b8fd0':'#e9dcae',fillOpacity:.85}).addTo(MG.layers);}});
  // tee + green markers (draggable in edit mode)
  const tee=L.marker(ll(h.t),{icon:divMk('tee'),draggable:MG.mode==='edit'}).addTo(MG.layers);
  const grn=L.marker(ll(h.g),{icon:divMk('grn','⛳'),draggable:MG.mode==='edit'}).addTo(MG.layers);
  if(MG.mode==='edit'){
    tee.on('dragend',e=>{const ll2=e.target.getLatLng();h.t=[+ll2.lng.toFixed(6),+ll2.lat.toFixed(6)];saveEdit(MG.course.n,h.h,'t',h.t);loadCourse(MG.course);MG.hi=MG.course.holes.findIndex(x=>x.h===h.h);renderHole();});
    grn.on('dragend',e=>{const ll2=e.target.getLatLng();h.g=[+ll2.lng.toFixed(6),+ll2.lat.toFixed(6)];saveEdit(MG.course.n,h.h,'g',h.g);loadCourse(MG.course);MG.hi=MG.course.holes.findIndex(x=>x.h===h.h);renderHole();});
  }
  L.marker(ll(h.front),{icon:divMk('fb','F')}).addTo(MG.layers);
  L.marker(ll(h.back),{icon:divMk('fb','B')}).addTo(MG.layers);
  const sh=(MG.shotsData&&MG.shotsData[h.h])||[];
  if(sh.length){const pts=[h.t].concat(sh);L.polyline(pts.map(ll),{color:'#ffce4d',weight:2.5,opacity:.9}).addTo(MG.layers);for(let i=1;i<pts.length;i++){L.marker(ll(pts[i]),{icon:divMk('shot',i)}).addTo(MG.layers).bindTooltip(yd(dist(pts[i-1],pts[i]))+'y',{direction:'top'});}}
  if(MG.pos)drawUser();
  MG.map.fitBounds(L.latLngBounds([ll(h.t),ll(h.g)]).pad(0.35));
  updateDist();
  ensureElev([h.t,h.g].concat(MG.pos?[MG.pos]:[])).then(updateConditions);
  ensureWind(h.g).then(updateConditions);
}
function drawUser(){ if(!MG.pos)return; if(MG.userMk)MG.userMk.setLatLng(ll(MG.pos)); else MG.userMk=L.circleMarker(ll(MG.pos),{radius:7,color:'#fff',weight:2,fillColor:'#19e57f',fillOpacity:1}).addTo(MG.map); }
function updateDist(){
  const h=MG.course.holes[MG.hi];
  const ref=MG.pos||h.t;
  document.getElementById('mgFront').textContent=yd(dist(ref,h.front));
  document.getElementById('mgCenter').textContent=yd(dist(ref,h.g));
  document.getElementById('mgBack').textContent=yd(dist(ref,h.back));
  document.getElementById('mgClub').textContent=club(yd(dist(ref,h.g)));
  document.getElementById('mgGpsState').textContent=MG.pos?'GPS live':'From tee · tap map or enable GPS';
  updateConditions();
}
function onMapClick(e){
  if(!MG.course)return;
  const p=[e.latlng.lng,e.latlng.lat];
  const h=MG.course.holes[MG.hi];
  if(MG.mode==='edit'){ // add a bunker
    MG.course.hz=MG.course.hz||[]; MG.course.hz.push(['b',+p[0].toFixed(6),+p[1].toFixed(6)]);
    saveEdit(MG.course.n,'haz',Date.now()+'',p); renderHole(); return;
  }
  if(MG.mode==='track'){ // log a shot
    MG.shotsData[h.h]=MG.shotsData[h.h]||[];
    MG.shotsData[h.h].push([+p[0].toFixed(6),+p[1].toFixed(6)]);
    saveShots(); renderHole();
    if(window.toast)toast('Shot '+MG.shotsData[h.h].length+' tracked');
    return;
  }
  const ref=MG.pos||h.t;
  const d=yd(dist(ref,p));
  if(MG.measureMk)MG.map.removeLayer(MG.measureMk);
  MG.measureMk=L.marker(ll(p),{icon:divMk('tgt')}).addTo(MG.map).bindPopup('<b>'+d+' yds</b><br>'+club(d)).openPopup();
}
function startGPS(){
  if(MG.started||!navigator.geolocation)return; MG.started=true;
  navigator.geolocation.watchPosition(p=>{MG.pos=[p.coords.longitude,p.coords.latitude];drawUser();if(MG.course)updateDist();},
    ()=>{}, {enableHighAccuracy:true,maximumAge:4000,timeout:12000});
}

window.mgShow=function(){
  if(typeof L==='undefined'){setTimeout(window.mgShow,200);return;}
  if(!MG.map){
    MG.map=L.map('mgmap',{zoomControl:false,attributionControl:false});
    MG.tiles=L.tileLayer(ESRI,{maxZoom:19}).addTo(MG.map);
    MG.layers=L.layerGroup().addTo(MG.map);
    MG.map.on('click',onMapClick);
    MG.map.setView([36.5685,-121.9445],16);
    startGPS();
  }
  if(!MG.course){
    fetch('pebble.json').then(r=>r.json()).then(c=>{loadCourse(c);renderHole();}).catch(()=>{});
  } else renderHole();
  setTimeout(()=>MG.map.invalidateSize(),150);
};
window.mgHole=function(d){ if(!MG.course)return; const n=MG.course.holes.length; MG.hi=(MG.hi+d+n)%n; renderHole(); if(navigator.vibrate)navigator.vibrate(6); };
window.mgToggleEdit=function(){ MG.edit=!MG.edit; const b=document.getElementById('mgEditBtn'); if(b){b.textContent=MG.edit?'Done':'Edit pins'; b.classList.toggle('on',MG.edit);} renderHole(); if(window.toast)toast(MG.edit?'Edit mode: drag pins, tap to add bunker':'Edits saved on device'); };

window.mgPickCourse=function(){
  const name=prompt('Search any golf course (live OpenStreetMap):','St Andrews Old Course');
  if(name)mgLoadLive(name.trim());
};
async function mgLoadLive(name){
  const st=document.getElementById('mgGpsState'); if(st)st.textContent='Loading '+name+'…';
  const cached=localStorage.getItem('mg_course_'+slug(name));
  if(cached){try{loadCourse(JSON.parse(cached));renderHole();return;}catch(e){}}
  try{
    const nr=await fetch('https://nominatim.openstreetmap.org/search?q='+encodeURIComponent(name)+'&format=json&limit=1');
    const nj=await nr.json();
    if(!nj.length){if(document.getElementById('mgPickState')){document.getElementById('mgPickState').textContent='Course not found — try a more specific name.';}else{alert('Course not found.');}return;}
    const bb=nj[0].boundingbox.map(Number); // [s,n,w,e]
    let s=bb[0],n=bb[1],w=bb[2],e=bb[3];
    // clamp / pad
    const cy=(s+n)/2, cx=(w+e)/2;
    s=Math.max(s,cy-0.03);n=Math.min(n,cy+0.03);w=Math.max(w,cx-0.035);e=Math.min(e,cx+0.035);
    const c=await extractOSM(name,[w,s,e,n],[cx,cy]);
    if(!c.holes.length){var ps=document.getElementById('mgPickState');if(ps){ps.textContent='No OSM hole data for that course yet — you could map it.';}else{alert('No OSM hole data mapped yet.');}return;}
    localStorage.setItem('mg_course_'+slug(name),JSON.stringify(c));
    loadCourse(c);renderHole();if(window.closeSheet)closeSheet();
    if(window.toast)toast(c.holes.length+' holes loaded from OpenStreetMap');
  }catch(err){alert('Could not load course data (OSM busy). Try again.');if(st)st.textContent='From tee · tap map or enable GPS';}
}
async function extractOSM(name,bbox,center){
  const r=await fetch('https://api.openstreetmap.org/api/0.6/map?bbox='+bbox.join(','));
  const xml=new DOMParser().parseFromString(await r.text(),'application/xml');
  const nodes={}; xml.querySelectorAll('node').forEach(n=>{nodes[n.getAttribute('id')]=[+n.getAttribute('lon'),+n.getAttribute('lat')];});
  const wc=w=>[...w.querySelectorAll('nd')].map(x=>nodes[x.getAttribute('ref')]).filter(Boolean);
  const tag=(w,k)=>{const el=w.querySelector('tag[k="'+k+'"]');return el?el.getAttribute('v'):null;};
  const ways=[...xml.querySelectorAll('way')];
  const golf=k=>ways.filter(w=>tag(w,'golf')===k);
  const cen=cs=>{let x=0,y=0;cs.forEach(p=>{x+=p[0];y+=p[1];});return[x/cs.length,y/cs.length];};
  const len=cs=>{let s=0;for(let i=1;i<cs.length;i++)s+=dist(cs[i-1],cs[i]);return s;};
  const best={};
  golf('hole').forEach(w=>{const cs=wc(w);if(cs.length<2)return;const ref=+(tag(w,'ref')||0);if(ref<1||ref>18)return;if(dist(cen(cs),center)>4000)return;const L2=len(cs);if(!best[ref]||L2>best[ref].L)best[ref]={ref,par:+(tag(w,'par')||0),cs,L:L2};});
  const greens=golf('green').map(w=>({c:cen(wc(w)),poly:wc(w)}));
  const holes=Object.values(best).sort((a,b)=>a.ref-b.ref).map(h=>{const t=h.cs[0],e=h.cs[h.cs.length-1];let g=null,gd=1e9;greens.forEach(G=>{const d=dist(G.c,e);if(d<gd&&d<110){gd=d;g=G;}});const gc=g?g.c:e;return {h:h.ref,par:h.par||null,y:Math.round(h.L/0.9144),t:[+t[0].toFixed(6),+t[1].toFixed(6)],g:[+gc[0].toFixed(6),+gc[1].toFixed(6)]};});
  const near=p=>holes.some(h=>dist(p,h.g)<240||dist(p,h.t)<240);
  const hz=[...golf('bunker').map(w=>cen(wc(w))).filter(near).map(p=>['b',+p[0].toFixed(6),+p[1].toFixed(6)]),...ways.filter(w=>['water_hazard','lateral_water_hazard'].includes(tag(w,'golf'))).map(w=>cen(wc(w))).filter(near).map(p=>['w',+p[0].toFixed(6),+p[1].toFixed(6)])];
  return {n:name,src:'OpenStreetMap, ODbL',holes,hz};
}

/* ---- course picker (search + popular), overrides prompt-based loader ---- */
const POPULAR=['Spyglass Hill Golf Course','Torrey Pines Golf Course','Bethpage State Park Black Course','TPC Sawgrass','Pinehurst No. 2','Chambers Bay','Whistling Straits','Bandon Dunes','Kiawah Island Ocean Course','St Andrews Links Old Course','Augusta National Golf Club','Pebble Beach Golf Links'];
function pickState(t){const e=document.getElementById('mgPickState');if(e){e.style.display='block';e.textContent=t;}else if(window.toast)toast(t);}
window.mgOpenPicker=function(){
  const rows=POPULAR.map((n,i)=>'<div class="row" onclick="mgPick('+i+')"><div class="ic" style="font-size:18px">&#9971;</div><div class="main"><h4>'+n+'</h4><p>'+(n==='Pebble Beach Golf Links'?'Baked offline':'Live from OpenStreetMap')+'</p></div><div class="end"><span class="badge">Load</span></div></div>').join('');
  document.getElementById('sheet').innerHTML='<div class="grab"></div><h2>Courses</h2><div class="sub">Search any course on earth &mdash; live from OpenStreetMap</div>'+
   '<input id="mgSearch" placeholder="Search a course…" autocomplete="off" style="width:100%;padding:13px 14px;border-radius:12px;background:var(--surface);border:1px solid var(--stroke);color:var(--txt);font-size:15px;margin-bottom:12px" onkeydown="if(event.key===String.fromCharCode(69,110,116,101,114))mgSearchGo()"/>'+
   '<div id="mgPickState" style="color:var(--muted);font-size:13px;margin:2px 0 12px;display:none"></div>'+
   '<div class="list">'+rows+'</div>';
  if(window.openSheet)openSheet();
};
window.mgPickCourse=window.mgOpenPicker;
window.mgSearchGo=function(){var v=(document.getElementById('mgSearch').value||'').trim();if(v){pickState('Searching '+v+'…');mgLoadLive(v);}};
window.mgPick=function(i){var n=POPULAR[i];pickState('Loading '+n+'…');if(n==='Pebble Beach Golf Links'){fetch('pebble.json').then(function(r){return r.json();}).then(function(c){loadCourse(c);renderHole();if(window.closeSheet)closeSheet();});return;}mgLoadLive(n);};


/* ---- elevation + live wind (free, keyless, via Open-Meteo) ---- */
function ekey(p){return p[1].toFixed(4)+','+p[0].toFixed(4);}
function bearingDeg(a,b){return (deg(brg(a,b))+360)%360;}
async function ensureElev(points){
  const need=points.filter(p=>MG.elev[ekey(p)]===undefined);
  if(!need.length)return;
  try{
    const la=need.map(p=>p[1].toFixed(5)).join(','), lo=need.map(p=>p[0].toFixed(5)).join(',');
    const r=await fetch('https://api.open-meteo.com/v1/elevation?latitude='+la+'&longitude='+lo);
    const j=await r.json(); (j.elevation||[]).forEach((e,i)=>{MG.elev[ekey(need[i])]=e;});
  }catch(e){}
}
async function ensureWind(p){
  const now=Date.now();
  if(MG.wind&&MG.windLoc&&dist(p,MG.windLoc)<30000&&now-MG.windAt<600000)return;
  try{
    const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+p[1].toFixed(3)+'&longitude='+p[0].toFixed(3)+'&current=wind_speed_10m,wind_direction_10m,temperature_2m&wind_speed_unit=mph&temperature_unit=fahrenheit');
    const j=await r.json();
    if(j.current){MG.wind={spd:j.current.wind_speed_10m,dir:j.current.wind_direction_10m,temp:j.current.temperature_2m};MG.windAt=now;MG.windLoc=p;}
  }catch(e){}
}
function updateConditions(){
  if(!MG.course)return;
  const h=MG.course.holes[MG.hi], ref=MG.pos||h.t, green=h.g;
  const horiz=yd(dist(ref,green));
  let elevAdj=0, dz=null;
  const er=MG.elev[ekey(ref)], eg=MG.elev[ekey(green)];
  if(er!==undefined&&eg!==undefined){dz=Math.round((eg-er)*3.281);elevAdj=dz*0.33;}
  let windAdj=0, wtxt=''; MG.lastWindKind='';
  if(MG.wind){
    const shot=bearingDeg(ref,green), toward=(MG.wind.dir+180)%360;
    const ang=(toward-shot)*Math.PI/180;
    const along=MG.wind.spd*Math.cos(ang);            // + tailwind, - headwind
    windAdj=-along*horiz*0.01;                          // ~1% of carry per mph
    const kind=along<-0.7?'into':along>0.7?'down':'cross';
    wtxt=Math.round(MG.wind.spd)+'mph '+kind+' · '+Math.round(MG.wind.temp)+'°';
    MG.lastWindKind=(kind==='into'?'into the wind':kind==='down'?'downwind':'crosswind');
  }
  const plays=Math.round(horiz+elevAdj+windAdj); MG.lastPlays=plays;
  const clubEl=document.getElementById('mgClub'); if(clubEl)clubEl.textContent=club(plays);
  const pl=document.getElementById('mgPlays');
  if(pl)pl.textContent='Plays '+plays+'y'+(dz!==null?(' · '+(dz>=0?'↑':'↓')+Math.abs(dz)+'ft'):'');
  const wd=document.getElementById('mgWind');
  if(wd){ wd.innerHTML = MG.wind ? '<span style="display:inline-block;transform:rotate('+(((MG.wind.dir+180)%360))+'deg)">↑</span> '+wtxt : ''; }
  updateCaddie();
}


/* ---- modes, shot tracking, real scorecard ---- */
function loadShots(){try{return JSON.parse(localStorage.getItem('mg_shots_'+slug(MG.course.n))||'{}');}catch(e){return {};}}
function saveShots(){try{localStorage.setItem('mg_shots_'+slug(MG.course.n),JSON.stringify(MG.shotsData||{}));}catch(e){}}
function loadScore(){try{return JSON.parse(localStorage.getItem('mg_score_'+slug(MG.course.n))||'{}');}catch(e){return {};}}
function saveScore(m){try{localStorage.setItem('mg_score_'+slug(MG.course.n),JSON.stringify(m));}catch(e){}}
window.mgMode=function(m){
  MG.mode=m;
  ['measure','track','edit'].forEach(x=>{const b=document.getElementById('m'+x[0].toUpperCase()+x.slice(1));if(b)b.classList.toggle('on',x===m);});
  renderHole();
  if(window.toast)toast(m==='track'?'Tap your ball after each shot':m==='edit'?'Drag pins · tap to add a bunker':'Tap the map to measure');
};
window.mgToggleEdit=function(){mgMode(MG.mode==='edit'?'measure':'edit');};
function holeScore(h,shots,man){ if(man[h.h]!=null)return man[h.h]; const s=shots[h.h]; return (s&&s.length)?s.length:null; }
window.openScorecard=function(){
  if(!MG.course){return;}
  const c=MG.course, shots=loadShots(), man=loadScore();
  let tot=0,par=0; c.holes.forEach(h=>{const v=holeScore(h,shots,man); if(v!=null){tot+=v;par+=(h.par||0);}});
  const diff=tot-par;
  document.getElementById('sheet').innerHTML='<div class="grab"></div>'+
   '<div class="sc-head"><div><h2>Scorecard</h2><div class="sub" style="margin:0">'+c.n+' &middot; auto from tracked shots</div></div>'+
   '<div style="text-align:right"><div class="sc-total">'+(tot||'&mdash;')+' <small>'+(tot?((diff>0?'+':'')+(diff===0?'E':diff)):'')+'</small></div></div></div>'+
   '<div class="holegrid" id="mgGrid"></div>'+
   '<button class="btn primary" style="margin-top:18px" onclick="closeSheet()">Done</button>';
  mgGrid(); if(window.openSheet)openSheet();
};
function mgGrid(){
  const c=MG.course, shots=loadShots(), man=loadScore();
  document.getElementById('mgGrid').innerHTML=c.holes.map(h=>{
    const v=holeScore(h,shots,man); let cls='';
    if(v!=null&&h.par){const d=v-h.par; if(d<=-2)cls='eagle'; else if(d<0)cls='birdie'; else if(d>0)cls='bogey';}
    return '<div class="holecell '+cls+'"><div class="h">H'+h.h+(h.approx?' ~':'')+'</div><div class="par">PAR '+(h.par||'-')+'</div>'+
      '<div class="stepper"><button onclick="mgAdj('+h.h+',-1)">&minus;</button><div class="sval">'+(v!=null?v:'&middot;')+'</div><button onclick="mgAdj('+h.h+',1)">+</button></div></div>';
  }).join('');
}
window.mgAdj=function(hn,d){
  const c=MG.course, man=loadScore(), shots=loadShots(), h=c.holes.find(x=>x.h===hn);
  let v=man[hn]; if(v==null)v=(shots[hn]&&shots[hn].length)||h.par||4;
  v=Math.max(1,Math.min(15,v+d)); man[hn]=v; saveScore(man); mgGrid();
  let tot=0,par=0; c.holes.forEach(hh=>{const vv=holeScore(hh,shots,man); if(vv!=null){tot+=vv;par+=(hh.par||0);}});
  const diff=tot-par; const el=document.querySelector('#sheet .sc-total'); if(el)el.innerHTML=tot+' <small>'+(diff>0?'+':'')+(diff===0?'E':diff)+'</small>';
};


/* ===== AI Caddie ===== */
function lineProj(a,b,p){
  const mlon=Math.cos(rd((a[1]+b[1])/2));
  const vx=(b[0]-a[0])*mlon, vy=(b[1]-a[1]);
  const wx=(p[0]-a[0])*mlon, wy=(p[1]-a[1]);
  const L2=vx*vx+vy*vy; let t=L2?(wx*vx+wy*vy)/L2:0;
  const dx=wx-vx*t, dy=wy-vy*t;
  return { t, perpM:Math.sqrt(dx*dx+dy*dy)*111320, side:(vx*wy-vy*wx) };
}
function caddieTip(){
  if(!MG.course)return '';
  const h=MG.course.holes[MG.hi]; if(!h)return '';
  const ref=MG.pos||h.t, green=h.g, par=h.par||4;
  const horiz=yd(dist(ref,green)), plays=MG.lastPlays||horiz;
  const wp=MG.wind?(' '+Math.round(MG.wind.spd)+'mph '+(MG.lastWindKind||'wind')+'.'):'';
  if(par<=3){ return plays+'y to the pin — that\'s a '+club(plays)+'.'+wp; }
  // hazards in the driving corridor near the intended line
  const haz=(MG.course.hz||[]).map(z=>({z,proj:lineProj(h.t,green,[z[1],z[2]]),carry:yd(dist(h.t,[z[1],z[2]]))}))
    .filter(o=>o.proj.perpM<34 && o.carry>195 && o.carry<300)
    .sort((a,b)=>a.carry-b.carry);
  let tip;
  if(haz.length){
    const w=haz[0], side=w.proj.side>0?'left':'right', kind=w.z[0]==='w'?'water':'a bunker';
    tip='Watch '+kind+' '+side+' at '+w.carry+'y — favor the '+(side==='left'?'right':'left')+' off the tee.';
  } else { tip='Clear corridor — let the driver go.'; }
  const appr=Math.max(0,horiz-250);
  if(par===5) tip+=' Two good ones leaves a wedge.';
  else if(appr>40) tip+=' A solid drive leaves about '+appr+'y in.';
  return tip+wp;
}
function updateCaddie(){ const el=document.getElementById('mgCaddie'); if(el)el.textContent=caddieTip(); }

/* ===== Round engine + handicap ===== */
function allRounds(){try{return JSON.parse(localStorage.getItem('mg_rounds')||'[]');}catch(e){return [];}}
function computeHandicap(){
  const r=allRounds().filter(x=>x.diff!=null).map(x=>x.diff).sort((a,b)=>a-b);
  if(!r.length)return null;
  const useN=Math.max(1,Math.min(8,Math.round(r.length*0.4)));
  const avg=r.slice(0,useN).reduce((a,b)=>a+b,0)/useN;
  return Math.round(avg*0.96*10)/10;
}
window.finishRound=function(){
  const c=MG.course; if(!c){return;}
  const shots=loadShots(), man=loadScore();
  const played=c.holes.filter(h=>holeScore(h,shots,man)!=null);
  if(!played.length){ if(window.toast)toast('Track or enter scores first'); return; }
  let score=0,par=0,bir=0,prs=0,bog=0;
  played.forEach(h=>{const v=holeScore(h,shots,man);score+=v;par+=(h.par||0);const d=v-(h.par||0);if(d<0)bir++;else if(d===0)prs++;else bog++;});
  const r={course:c.n,date:Date.now(),holes:played.length,score,par,diff:score-par,bir,prs,bog};
  const rounds=allRounds(); rounds.unshift(r); localStorage.setItem('mg_rounds',JSON.stringify(rounds.slice(0,40)));
  localStorage.removeItem('mg_shots_'+slug(c.n)); localStorage.removeItem('mg_score_'+slug(c.n)); MG.shotsData={};
  updateHomeStats();
  showRoundSummary(r);
};
function showRoundSummary(r){
  const diff=r.score-r.par, hc=computeHandicap();
  document.getElementById('sheet').innerHTML='<div class="grab"></div>'+
   '<h2>Round saved</h2><div class="sub">'+r.course+' · '+r.holes+' holes</div>'+
   '<div style="text-align:center;margin:14px 0"><div style="font-family:\'Sora\';font-weight:800;font-size:64px;line-height:1">'+r.score+'</div>'+
   '<div style="color:var(--muted);font-size:15px;margin-top:2px">'+(diff>=0?'+':'')+diff+' to par</div></div>'+
   '<div class="chips" style="margin:10px 0">'+
   '<div class="chip"><div class="v pos">'+r.bir+'</div><div class="k">Birdies+</div></div>'+
   '<div class="chip"><div class="v">'+r.prs+'</div><div class="k">Pars</div></div>'+
   '<div class="chip"><div class="v neg">'+r.bog+'</div><div class="k">Bogeys+</div></div>'+
   (hc!=null?'<div class="chip"><div class="v">'+hc.toFixed(1)+'</div><div class="k">Handicap</div></div>':'')+
   '</div><button class="btn primary" style="margin-top:12px" onclick="closeSheet();go(\'home\')">Done</button>';
  if(window.openSheet)openSheet();
}
function updateHomeStats(){
  const hc=computeHandicap();
  if(hc!=null){const el=document.getElementById('hcVal');if(el)el.textContent=hc.toFixed(1);
    const tr=document.getElementById('hcTrend');if(tr)tr.textContent='Based on your rounds';}
  const rounds=allRounds();
  if(rounds.length){
    const rr=document.getElementById('recentRounds');
    if(rr)rr.innerHTML=rounds.slice(0,4).map(r=>{const dd=new Date(r.date);const md=dd.toLocaleDateString(undefined,{month:'short',day:'numeric'});const diff=r.score-r.par;return '<div class="row"><div class="ic">⛳</div><div class="main"><h4>'+r.course+'</h4><p>'+md+' · '+r.holes+' holes</p></div><div class="end"><div class="big">'+r.score+'</div><div class="sm">'+(diff>=0?'+':'')+diff+'</div></div></div>';}).join('');
  }
}

/* ===== Course picker incl. baked index ===== */
window.mgOpenPicker=function(){
  const pop=POPULAR.map((n,i)=>'<div class="row" onclick="mgPick('+i+')"><div class="ic" style="font-size:18px">&#9971;</div><div class="main"><h4>'+n+'</h4><p>'+(n==='Pebble Beach Golf Links'?'Baked offline':'Live from OpenStreetMap')+'</p></div><div class="end"><span class="badge">Load</span></div></div>').join('');
  document.getElementById('sheet').innerHTML='<div class="grab"></div><h2>Courses</h2><div class="sub">Search any course on earth &mdash; live from OpenStreetMap</div>'+
   '<input id="mgSearch" placeholder="Search a course…" autocomplete="off" style="width:100%;padding:13px 14px;border-radius:12px;background:var(--surface);border:1px solid var(--stroke);color:var(--txt);font-size:15px;margin-bottom:12px" onkeydown="if(event.key===String.fromCharCode(69,110,116,101,114))mgSearchGo()"/>'+
   '<div id="mgPickState" style="color:var(--muted);font-size:13px;margin:2px 0 12px;display:none"></div>'+
   '<div id="mgBaked"></div><div class="list">'+pop+'</div>';
  if(window.openSheet)openSheet();
  fetch('courses/index.json').then(r=>r.ok?r.json():{}).then(idx=>{
    const ks=Object.keys(idx||{}); if(!ks.length)return;
    document.getElementById('mgBaked').innerHTML='<div class="section-title" style="margin:4px 0 10px">Baked &amp; instant ('+ks.length+')</div><div class="list" style="margin-bottom:14px">'+
      ks.slice(0,40).map(k=>'<div class="row" onclick="mgLoadBaked(\''+k+'\')"><div class="ic" style="font-size:18px">&#9971;</div><div class="main"><h4>'+(idx[k].n||k)+'</h4><p>'+(idx[k].holes||'')+' holes · instant</p></div><div class="end"><span class="badge gold">Instant</span></div></div>').join('')+'</div>';
  }).catch(()=>{});
};
window.mgPickCourse=window.mgOpenPicker;
window.mgLoadBaked=function(sl){
  pickState('Loading…');
  const url=sl==='pebble-beach-golf-links'?'pebble.json':'courses/'+sl+'.json';
  fetch(url).then(r=>r.json()).then(c=>{loadCourse(c);renderHole();if(window.closeSheet)closeSheet();}).catch(()=>pickState('Could not load that course.'));
};

/* ===== scorecard with Finish round ===== */
window.openScorecard=function(){
  if(!MG.course){return;}
  const c=MG.course, shots=loadShots(), man=loadScore();
  let tot=0,par=0; c.holes.forEach(h=>{const v=holeScore(h,shots,man); if(v!=null){tot+=v;par+=(h.par||0);}});
  const diff=tot-par;
  document.getElementById('sheet').innerHTML='<div class="grab"></div>'+
   '<div class="sc-head"><div><h2>Scorecard</h2><div class="sub" style="margin:0">'+c.n+' &middot; auto from tracked shots</div></div>'+
   '<div style="text-align:right"><div class="sc-total">'+(tot||'&mdash;')+' <small>'+(tot?((diff>0?'+':'')+(diff===0?'E':diff)):'')+'</small></div></div></div>'+
   '<div class="holegrid" id="mgGrid"></div>'+
   '<button class="btn primary" style="margin-top:18px" onclick="finishRound()">Finish &amp; save round</button>'+
   '<button class="btn ghost" onclick="closeSheet()">Keep playing</button>';
  mgGrid(); if(window.openSheet)openSheet();
};

try{ updateHomeStats(); }catch(e){}

})();
