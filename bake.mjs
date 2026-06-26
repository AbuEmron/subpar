#!/usr/bin/env node
/*
 * Mulliganaire course-baking pipeline
 * Turns OpenStreetMap golf data into static course JSON files you own.
 *
 *   node bake.mjs harvest                 # build course-list.json (every golf course on earth)
 *   node bake.mjs harvest --bbox=s,w,n,e  # harvest one region (recommended; planet is huge)
 *   node bake.mjs run [start] [count]     # bake courses from course-list.json -> courses/<slug>.json
 *
 * Runs anywhere with internet + Node 18+. No dependencies.
 * Respect the OSM usage policy: this is rate-limited to ~1 req/sec and sets a User-Agent.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';

const OUT = 'courses';
const UA  = 'Mulliganaire-bake/1.0 (contact: you@example.com)';
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const R = 6371000, rd = d => d*Math.PI/180;
const dist = (a,b) => { const dLat=rd(b[1]-a[1]),dLon=rd(b[0]-a[0]),la1=rd(a[1]),la2=rd(b[1]);
  const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(h)); };
const lineLen = cs => { let s=0; for (let i=1;i<cs.length;i++) s+=dist(cs[i-1],cs[i]); return s; };
const centroid = cs => { let x=0,y=0; for (const p of cs){x+=p[0];y+=p[1];} return [x/cs.length,y/cs.length]; };
const r5 = v => +v.toFixed(5);
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);

async function overpass(query, tries=0) {
  const ep = ENDPOINTS[tries % ENDPOINTS.length];
  try {
    const r = await fetch(ep, { method:'POST', headers:{'Content-Type':'text/plain','User-Agent':UA}, body:query });
    if (r.status === 429 || r.status === 504) throw new Error('busy '+r.status);
    if (!r.ok) throw new Error('http '+r.status);
    return await r.json();
  } catch (e) {
    if (tries < 5) { await sleep(2000*(tries+1)); return overpass(query, tries+1); }
    throw e;
  }
}

// 1) HARVEST — list every golf course (id, name, center)
async function harvest(bbox) {
  const area = bbox ? `(${bbox})` : '';
  const q = `[out:json][timeout:1800];way["leisure"="golf_course"]${area};out center tags;`;
  console.log('Harvesting golf courses%s …', bbox?` in ${bbox}`:' worldwide (this is a big query)');
  const j = await overpass(q);
  const list = (j.elements||[])
    .filter(e => e.center && (e.tags?.name))
    .map(e => ({ id:e.id, name:e.tags.name, lat:e.center.lat, lon:e.center.lon }));
  const prev = existsSync('course-list.json') ? JSON.parse(readFileSync('course-list.json','utf8')) : [];
  const byId = new Map(prev.map(c=>[c.id,c]));
  for (const c of list) byId.set(c.id, c);
  const merged = [...byId.values()];
  writeFileSync('course-list.json', JSON.stringify(merged,null,0));
  console.log('Harvested %d courses (total %d in course-list.json)', list.length, merged.length);
}

// 2) EXTRACT — one course's holes/greens/hazards from OSM, using the same logic as the app
function extract(name, elements, center) {
  const golf = k => elements.filter(e => e.tags?.golf === k && e.geometry);
  const geom = e => e.geometry.map(p => [p.lon, p.lat]);
  const greens = golf('green').map(e => ({ c: centroid(geom(e)), poly: geom(e) }));
  const best = {};
  for (const e of golf('hole')) {
    const cs = geom(e); if (cs.length < 2) continue;
    const ref = +(e.tags.ref || 0); if (ref < 1 || ref > 18) continue;
    if (center && dist(centroid(cs), center) > 4000) continue;
    const L = lineLen(cs);
    if (!best[ref] || L > best[ref].L) best[ref] = { ref, par:+(e.tags.par||0), cs, L };
  }
  const holes = Object.values(best).sort((a,b)=>a.ref-b.ref).map(h => {
    const tee = h.cs[0], end = h.cs[h.cs.length-1];
    let g=null, gd=1e9; for (const G of greens){ const d=dist(G.c,end); if (d<gd && d<110){ gd=d; g=G; } }
    const gc = g ? g.c : end;
    return { h:h.ref, par:h.par||null, y:Math.round(h.L/0.9144), t:[r5(tee[0]),r5(tee[1])], g:[r5(gc[0]),r5(gc[1])] };
  });
  const near = p => holes.some(h => dist(p,[h.g[0],h.g[1]])<240 || dist(p,[h.t[0],h.t[1]])<240);
  const hz = [
    ...golf('bunker').map(e=>centroid(geom(e))).filter(near).map(p=>['b',r5(p[0]),r5(p[1])]),
    ...elements.filter(e=>['water_hazard','lateral_water_hazard'].includes(e.tags?.golf)&&e.geometry)
       .map(e=>centroid(geom(e))).filter(near).map(p=>['w',r5(p[0]),r5(p[1])]),
  ];
  return { n:name, src:'OpenStreetMap, ODbL', holes, hz };
}

// 3) RUN — bake courses from course-list.json
async function run(start, count) {
  if (!existsSync('course-list.json')) { console.error('Run `node bake.mjs harvest` first.'); process.exit(1); }
  const list = JSON.parse(readFileSync('course-list.json','utf8'));
  if (!existsSync(OUT)) mkdirSync(OUT);
  const indexPath = `${OUT}/index.json`;
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath,'utf8')) : {};
  const slice = list.slice(start, start+count);
  let baked=0, empty=0;
  for (const [i,c] of slice.entries()) {
    const sl = slug(c.name); const file = `${OUT}/${sl}.json`;
    if (existsSync(file)) { console.log('skip (exists) %s', c.name); continue; }
    const w=c.lon-0.035, e=c.lon+0.035, s=c.lat-0.03, n=c.lat+0.03;
    const q = `[out:json][timeout:90];(way["golf"](${s},${w},${n},${e});node["golf"](${s},${w},${n},${e}););out geom;`;
    try {
      const j = await overpass(q);
      const course = extract(c.name, j.elements||[], [c.lon,c.lat]);
      if (!course.holes.length) { empty++; console.log('… no holes mapped: %s', c.name); }
      else {
        writeFileSync(file, JSON.stringify(course));
        index[sl] = { n:c.name, holes:course.holes.length, lat:c.lat, lon:c.lon };
        baked++; console.log('[%d/%d] baked %s (%d holes)', start+i+1, list.length, c.name, course.holes.length);
      }
    } catch (err) { console.log('… error %s: %s', c.name, err.message); }
    writeFileSync(indexPath, JSON.stringify(index));
    await sleep(1100); // be polite to the public API
  }
  console.log('Done. Baked %d, %d had no mapped holes.', baked, empty);
}

const [,,cmd,a,b] = process.argv;
const bboxArg = process.argv.find(x=>x.startsWith('--bbox='));
if (cmd === 'harvest') harvest(bboxArg && bboxArg.split('=')[1]);
else if (cmd === 'run') run(+(a||0), +(b||500));
else console.log('Usage:\n  node bake.mjs harvest [--bbox=s,w,n,e]\n  node bake.mjs run [start] [count]');
