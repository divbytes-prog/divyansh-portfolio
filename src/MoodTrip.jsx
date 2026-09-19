import React,{useEffect,useMemo,useRef,useState}from'react';
import{
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform
}from'motion/react';
import'./moodtrip.css';

const MOODS=[
  {id:'happy',label:'Happy',mark:'01',hint:'cafés · game zones · lively spots'},
  {id:'sad',label:'Sad',mark:'02',hint:'quiet public spaces · slow walks'},
  {id:'stressed',label:'Stressed',mark:'03',hint:'green areas · calm corners'},
  {id:'energetic',label:'Energetic',mark:'04',hint:'sports · activity · movement'},
  {id:'bored',label:'Bored',mark:'05',hint:'arcades · cinema · something new'},
  {id:'romantic',label:'Romantic',mark:'06',hint:'views · cafés · gardens'},
  {id:'curious',label:'Curious',mark:'07',hint:'museums · heritage · culture'},
  {id:'peaceful',label:'Peaceful',mark:'08',hint:'parks · libraries · gardens'},
  {id:'social',label:'Social',mark:'09',hint:'food · hangouts · shared spaces'},
  {id:'adventurous',label:'Adventurous',mark:'10',hint:'trails · viewpoints · activities'},
  {id:'lonely',label:'Solo time',mark:'11',hint:'comfortable low-crowd places'},
  {id:'angry',label:'Need a reset',mark:'12',hint:'movement · open space · decompression'}
];

const MOOD_VECTORS={
  happy:[.9,.82,.25,.55,.55,.72,.9,.8],
  sad:[.18,.12,.98,.3,.25,.74,.25,.12],
  stressed:[.12,.18,1,.22,.25,.92,.2,.16],
  energetic:[.62,1,.16,.58,.28,.78,.35,.95],
  bored:[.72,.78,.2,.95,.52,.62,.58,.86],
  romantic:[.52,.34,.68,.5,.5,.66,.76,.25],
  curious:[.36,.45,.42,1,.62,.42,.25,.38],
  peaceful:[.18,.14,1,.4,.34,.95,.2,.15],
  social:[1,.72,.2,.45,.54,.5,.92,.76],
  adventurous:[.42,.96,.22,.88,.08,1,.18,.98],
  lonely:[.14,.12,.98,.42,.28,.86,.22,.1],
  angry:[.2,.82,.38,.32,.18,.9,.14,.92]
};

const CATEGORY_FEATURES={
  cafe:[.74,.35,.48,.32,.82,.18,1,.25],
  restaurant:[.8,.42,.34,.28,.82,.18,1,.32],
  cinema:[.72,.42,.48,.62,1,.05,.38,.52],
  library:[.08,.05,1,.86,1,.04,.06,.02],
  park:[.22,.42,.92,.48,.02,1,.12,.48],
  garden:[.16,.28,.98,.5,.04,1,.08,.3],
  viewpoint:[.18,.58,.82,.82,.02,1,.08,.62],
  museum:[.22,.26,.72,1,1,.08,.08,.2],
  gallery:[.28,.25,.72,1,.92,.12,.12,.2],
  arcade:[.92,.92,.08,.5,.94,.08,.4,1],
  sports:[.68,1,.12,.4,.16,.84,.16,1],
  mall:[.92,.62,.18,.38,.82,.18,.92,.62],
  attraction:[.66,.68,.28,.9,.32,.68,.34,.72],
  historic:[.28,.42,.72,1,.18,.8,.08,.38],
  playground:[.74,.86,.18,.24,.06,.94,.18,.9],
  unknown:[.45,.45,.5,.5,.5,.5,.35,.4]
};

const MOOD_CATEGORIES={
  happy:['cafe','arcade','mall','restaurant','attraction','cinema'],
  sad:['park','garden','library','viewpoint','cafe'],
  stressed:['park','garden','library','viewpoint'],
  energetic:['sports','arcade','playground','park','attraction'],
  bored:['arcade','cinema','mall','museum','attraction','cafe'],
  romantic:['cafe','restaurant','garden','viewpoint','park'],
  curious:['museum','gallery','historic','attraction','library'],
  peaceful:['park','garden','library','viewpoint'],
  social:['cafe','restaurant','mall','arcade','cinema'],
  adventurous:['viewpoint','sports','attraction','park','historic'],
  lonely:['library','park','garden','cafe','viewpoint'],
  angry:['sports','park','viewpoint','garden']
};

const CROWD_DEFAULT={
  happy:'lively',sad:'quiet',stressed:'quiet',energetic:'balanced',bored:'lively',
  romantic:'balanced',curious:'balanced',peaceful:'quiet',social:'lively',
  adventurous:'balanced',lonely:'quiet',angry:'quiet'
};

const OSM_QUERY_TAGS=[
  '["amenity"~"cafe|restaurant|cinema|library"]',
  '["leisure"~"park|garden|sports_centre|fitness_centre|amusement_arcade|bowling_alley|playground"]',
  '["tourism"~"museum|gallery|attraction|viewpoint"]',
  '["shop"="mall"]',
  '["historic"]'
];

const KEYWORD_FALLBACK={
  happy:['cafe','arcade','game zone','shopping mall'],
  sad:['park','garden','library','viewpoint'],
  stressed:['park','garden','library','viewpoint'],
  energetic:['sports centre','arcade','adventure park'],
  bored:['arcade','cinema','museum','mall'],
  romantic:['cafe','garden','viewpoint','restaurant'],
  curious:['museum','gallery','historic place'],
  peaceful:['park','garden','library'],
  social:['cafe','restaurant','mall','arcade'],
  adventurous:['viewpoint','adventure park','sports centre'],
  lonely:['library','park','garden','quiet cafe'],
  angry:['sports centre','park','garden']
};

let emotionPipelinePromise;

const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*(b[i]||0),0);
const mag=a=>Math.sqrt(dot(a,a))||1;
const cosine=(a,b)=>dot(a,b)/(mag(a)*mag(b));
const avgVectors=list=>{
  if(!list.length)return MOOD_VECTORS.peaceful;
  const out=Array(8).fill(0);
  list.forEach(v=>v.forEach((n,i)=>out[i]+=n));
  return out.map(n=>n/list.length);
};
const haversine=(a,b)=>{
  const R=6371;
  const dLat=(b.lat-a.lat)*Math.PI/180;
  const dLon=(b.lng-a.lng)*Math.PI/180;
  const x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
};
const hash=n=>{
  let x=2166136261;
  for(let i=0;i<n.length;i++){x^=n.charCodeAt(i);x=Math.imul(x,16777619)}
  return Math.abs(x>>>0);
};

function dominantMoodFromVector(vector){
  return Object.entries(MOOD_VECTORS)
    .map(([id,v])=>({id,score:cosine(vector,v)}))
    .sort((a,b)=>b.score-a.score)[0]?.id||'peaceful';
}

function crowdEstimate(category){
  if(['library','garden'].includes(category))return 'quiet';
  if(['arcade','mall','restaurant','cinema'].includes(category))return 'lively';
  return 'balanced';
}

function crowdFit(pref,estimate){
  if(pref==='any')return 1;
  if(pref===estimate)return 1;
  if(pref==='balanced'||estimate==='balanced')return .68;
  return .28;
}

function placeCategory(tags={},types=[]){
  const amenity=tags.amenity||'';
  const leisure=tags.leisure||'';
  const tourism=tags.tourism||'';
  if(types.includes('cafe')||amenity==='cafe')return 'cafe';
  if(types.includes('restaurant')||amenity==='restaurant')return 'restaurant';
  if(types.includes('movie_theater')||amenity==='cinema')return 'cinema';
  if(types.includes('library')||amenity==='library')return 'library';
  if(types.includes('park')||leisure==='park')return 'park';
  if(leisure==='garden')return 'garden';
  if(types.includes('museum')||tourism==='museum')return 'museum';
  if(types.includes('art_gallery')||tourism==='gallery')return 'gallery';
  if(types.includes('amusement_park')||leisure==='amusement_arcade'||leisure==='bowling_alley')return 'arcade';
  if(types.includes('gym')||types.includes('stadium')||leisure==='sports_centre'||leisure==='fitness_centre')return 'sports';
  if(types.includes('shopping_mall')||tags.shop==='mall')return 'mall';
  if(tourism==='viewpoint')return 'viewpoint';
  if(tags.historic)return 'historic';
  if(leisure==='playground')return 'playground';
  if(tourism==='attraction')return 'attraction';
  return 'unknown';
}

function labelCategory(c){
  const labels={cafe:'CAFÉ',restaurant:'FOOD',cinema:'CINEMA',library:'LIBRARY',park:'PARK',garden:'GARDEN',viewpoint:'VIEWPOINT',museum:'MUSEUM',gallery:'GALLERY',arcade:'GAME / ARCADE',sports:'SPORTS',mall:'MALL',attraction:'ATTRACTION',historic:'HERITAGE',playground:'PLAY',unknown:'PLACE'};
  return labels[c]||'PLACE';
}

function ruleMood(text,fallback='happy'){
  const q=text.toLowerCase();
  const rules={
    sad:['sad','low','down','heartbroken','upset','cry','alone'],
    stressed:['stress','anxious','anxiety','overwhelmed','burnt','tired','pressure','exhausted'],
    happy:['happy','great','good mood','cheerful','joy','celebrate'],
    energetic:['energy','energetic','active','move','workout','hyper'],
    bored:['bored','nothing to do','boring'],
    romantic:['romantic','date','love','partner','couple'],
    curious:['curious','learn','discover','explore','history','museum'],
    peaceful:['peace','calm','quiet','slow','relax','chill'],
    social:['friends','group','hangout','social','people','together'],
    adventurous:['adventure','thrill','wild','explore outdoors','hike'],
    lonely:['lonely','myself','solo','alone time','me time'],
    angry:['angry','mad','frustrated','annoyed']
  };
  let best={id:fallback,score:0};
  Object.entries(rules).forEach(([id,words])=>{
    const score=words.reduce((s,w)=>s+(q.includes(w)?1:0),0);
    if(score>best.score)best={id,score};
  });
  return best.id;
}

async function deepEmotion(text){
  if(!text.trim())return null;
  try{
    if(!emotionPipelinePromise){
      emotionPipelinePromise=import('@huggingface/transformers').then(async({pipeline})=>{
        return pipeline('text-classification','onnx-community/twitter-roberta-base-emotion-ONNX',{dtype:'q8'});
      });
    }
    const pipe=await emotionPipelinePromise;
    let out=await pipe(text,{top_k:null});
    if(Array.isArray(out[0]))out=out[0];
    const top=[...out].sort((a,b)=>(b.score||0)-(a.score||0))[0];
    if(!top)return null;
    const label=String(top.label||'').toLowerCase();
    const map={anger:'angry',joy:'happy',optimism:'happy',sadness:'sad',positive:'happy',negative:'sad'};
    return {mood:map[label]||null,label,confidence:top.score||0};
  }catch(e){
    console.warn('Mood transformer fallback',e);
    return null;
  }
}

function kMeans(items,k=4){
  if(!items.length)return [];
  const points=items.map(p=>CATEGORY_FEATURES[p.category]||CATEGORY_FEATURES.unknown);
  const kk=Math.min(k,points.length);
  let centroids=Array.from({length:kk},(_,i)=>[...points[Math.floor(i*points.length/kk)]]);
  let labels=Array(points.length).fill(0);
  for(let step=0;step<7;step++){
    labels=points.map(p=>{
      let best=0,bestD=Infinity;
      centroids.forEach((c,j)=>{
        const d=p.reduce((s,v,i)=>s+(v-c[i])**2,0);
        if(d<bestD){bestD=d;best=j}
      });
      return best;
    });
    centroids=centroids.map((_,j)=>{
      const group=points.filter((p,i)=>labels[i]===j);
      return group.length?avgVectors(group):centroids[j];
    });
  }
  return items.map((p,i)=>({...p,cluster:labels[i],clusterVector:centroids[labels[i]]}));
}

async function apiJson(url,options={},timeout=9000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  let r;
  try{
    r=await fetch(url,{...options,signal:controller.signal});
  }catch(e){
    if(e?.name==='AbortError')throw new Error('Nearby search took too long. Please retry.');
    throw new Error('Could not reach the MoodTrip map service. Please try again.');
  }finally{
    clearTimeout(timer);
  }
  let data={};
  try{data=await r.json()}catch{}
  if(!r.ok)throw new Error(data.error||'Map service unavailable. Please try again.');
  return data;
}

async function reverseGeocode({lat,lng}){
  try{
    const d=await apiJson('/api/moodtrip?action=reverse&lat='+encodeURIComponent(lat)+'&lng='+encodeURIComponent(lng));
    return d.label||'Current area';
  }catch{
    return 'Current area';
  }
}

async function geocodeCity(query){
  const d=await apiJson('/api/moodtrip?action=geocode&q='+encodeURIComponent(query));
  return {lat:Number(d.lat),lng:Number(d.lng),label:d.label||query};
}

async function overpassPlaces(coords,radiusKm,mood){
  const d=await apiJson('/api/moodtrip?action=places&lat='+encodeURIComponent(coords.lat)+'&lng='+encodeURIComponent(coords.lng)+'&radiusKm='+encodeURIComponent(radiusKm)+'&mood='+encodeURIComponent(mood),{},9000);
  const seen=new Set();
  const places=(d.elements||[]).map(el=>{
    const lat=Number(el.lat??el.center?.lat),lng=Number(el.lon??el.center?.lon);
    const tags=el.tags||{};
    const name=tags.name||tags['name:en'];
    if(!name||!Number.isFinite(lat)||!Number.isFinite(lng))return null;
    const key=(name+'|'+lat.toFixed(4)+'|'+lng.toFixed(4)).toLowerCase();
    if(seen.has(key))return null;seen.add(key);
    const category=placeCategory(tags);
    return {
      id:'osm-'+el.type+'-'+el.id,
      name,
      lat,lng,category,
      address:[tags['addr:street'],tags['addr:suburb']].filter(Boolean).join(', '),
      rating:null,reviewCount:null,
      source:'OpenStreetMap',
      website:tags.website||tags['contact:website']||null,
      osmType:el.type,osmId:el.id
    };
  }).filter(Boolean);
  return {places,provider:d.provider||'OpenStreetMap'};
}

function loadGooglePlaces(key){
  if(window.google?.maps?.places)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-moodtrip-google]');
    if(existing){
      existing.addEventListener('load',resolve,{once:true});
      existing.addEventListener('error',reject,{once:true});
      return;
    }
    const s=document.createElement('script');
    s.dataset.moodtripGoogle='1';
    s.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&libraries=places&v=weekly';
    s.async=true;s.defer=true;s.onload=resolve;s.onerror=reject;
    document.head.appendChild(s);
  });
}

async function googlePlaces(coords,radiusKm,mood){
  const key=import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if(!key)return null;
  await loadGooglePlaces(key);
  const service=new window.google.maps.places.PlacesService(document.createElement('div'));
  const keywords=(KEYWORD_FALLBACK[mood]||['cafe','park']).slice(0,4);
  const requests=keywords.map(keyword=>new Promise(resolve=>{
    service.nearbySearch({
      location:new window.google.maps.LatLng(coords.lat,coords.lng),
      radius:Math.round(radiusKm*1000),
      keyword
    },(results,status)=>{
      const ok=status===window.google.maps.places.PlacesServiceStatus.OK;
      resolve(ok?(results||[]):[]);
    });
  }));
  const groups=await Promise.all(requests);
  const seen=new Map();
  groups.flat().forEach(p=>{
    if(!p.place_id||!p.geometry?.location)return;
    const lat=p.geometry.location.lat(),lng=p.geometry.location.lng();
    const category=placeCategory({},p.types||[]);
    const item={
      id:'g-'+p.place_id,name:p.name,lat,lng,category,
      address:p.vicinity||'',rating:p.rating||null,reviewCount:p.user_ratings_total||null,
      source:'Google Places',googlePlaceId:p.place_id
    };
    if(!seen.has(item.id))seen.set(item.id,item);
  });
  return [...seen.values()];
}

function PopWindow({children,className='',delay=0,onClick}){
  const reduce=useReducedMotion();
  const rx=useMotionValue(0),ry=useMotionValue(0);
  const sx=useSpring(rx,{stiffness:180,damping:20}),sy=useSpring(ry,{stiffness:180,damping:20});
  function move(e){
    if(reduce)return;
    const r=e.currentTarget.getBoundingClientRect();
    rx.set(((e.clientY-r.top)/r.height-.5)*-3.2);
    ry.set(((e.clientX-r.left)/r.width-.5)*3.2);
  }
  return <motion.div
    className={'mtPop '+className}
    style={{rotateX:sx,rotateY:sy}}
    initial={{opacity:0,y:28,scale:.97}}
    whileInView={{opacity:1,y:0,scale:1}}
    viewport={{once:true,amount:.15}}
    transition={{delay,type:'spring',stiffness:105,damping:18}}
    whileHover={reduce?undefined:{y:-6}}
    onPointerMove={move}
    onPointerLeave={()=>{rx.set(0);ry.set(0)}}
    onClick={onClick}
  >{children}</motion.div>;
}

function LiveMoodSignal({mood,status}){
  const reduce=useReducedMotion();
  return <div className="mtLiveSignal" aria-hidden="true">
    <div className="mtSignalHead"><span><i/>LIVE MOOD SIGNAL</span><b>{status==='ready'?'DL READY':'LOCAL MODE'}</b></div>
    <div className="mtRadar">
      <motion.div className="mtOrbit mtOne" animate={reduce?undefined:{rotate:360}} transition={{duration:14,repeat:Infinity,ease:'linear'}}><span/></motion.div>
      <motion.div className="mtOrbit mtTwo" animate={reduce?undefined:{rotate:-360}} transition={{duration:9,repeat:Infinity,ease:'linear'}}><span/></motion.div>
      <motion.div className="mtPulse" animate={reduce?undefined:{scale:[1,1.7,1],opacity:[.9,.35,.9]}} transition={{duration:2.2,repeat:Infinity}}/>
      <div className="mtCross mtX"/><div className="mtCross mtY"/>
      <strong>{mood.toUpperCase()}</strong>
    </div>
    <div className="mtBars">{[42,71,55,88,61,94,73,84].map((h,i)=><motion.i key={i} style={{height:h+'%'}} animate={reduce?undefined:{scaleY:[.55,1,.7,.9,.55]}} transition={{duration:1.7+(i%3)*.28,repeat:Infinity,delay:i*.06}}/>)}</div>
  </div>;
}

function tileX(lng,z){return((lng+180)/360)*2**z}
function tileY(lat,z){
  const r=lat*Math.PI/180;
  return(1-Math.asinh(Math.tan(r))/Math.PI)/2*2**z;
}

function TileMap({center,places,selectedId,onSelect}){
  const [zoom,setZoom]=useState(18);
  const [layer,setLayer]=useState('satellite');

  useEffect(()=>{
    // Selecting a result behaves like Google Maps: recenter and zoom close enough
    // to inspect the actual building/plot around the place.
    setZoom(18);
  },[center?.lat,center?.lng,selectedId]);

  if(!center)return null;

  const size=256;
  const cx=tileX(center.lng,zoom),cy=tileY(center.lat,zoom);
  const baseX=Math.floor(cx)-2,baseY=Math.floor(cy)-2;
  const centerPx=(cx-baseX)*size,centerPy=(cy-baseY)*size;
  const tiles=[];

  for(let y=0;y<5;y++)for(let x=0;x<5;x++){
    const tx=baseX+x,ty=baseY+y;
    const satellite='https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'+zoom+'/'+ty+'/'+tx;
    const street='https://tile.openstreetmap.org/'+zoom+'/'+tx+'/'+ty+'.png';
    const labels='https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/'+zoom+'/'+ty+'/'+tx;

    tiles.push(<React.Fragment key={tx+'-'+ty+'-'+zoom+'-'+layer}>
      <img
        className={'mtTile '+(layer==='satellite'?'satellite':'street')}
        style={{left:x*size,top:y*size}}
        src={layer==='satellite'?satellite:street}
        alt=""
        draggable="false"
        onError={e=>{
          const el=e.currentTarget;
          if(!el.dataset.fallback){
            el.dataset.fallback='1';
            el.src=street;
          }else{
            el.style.opacity='.08';
          }
        }}
      />
      {layer==='satellite'&&<img
        className="mtTile mtTileLabels"
        style={{left:x*size,top:y*size}}
        src={labels}
        alt=""
        draggable="false"
        onError={e=>{e.currentTarget.style.display='none'}}
      />}
    </React.Fragment>);
  }

  const visiblePlaces=places.slice(0,8);

  return <div className="mtTileMap">
    <div className="mtMapLayerSwitch" role="group" aria-label="Map style">
      <button className={layer==='satellite'?'active':''} onClick={()=>setLayer('satellite')}>SATELLITE</button>
      <button className={layer==='street'?'active':''} onClick={()=>setLayer('street')}>STREET</button>
    </div>

    <div className="mtTileCanvas" style={{left:'calc(50% - '+centerPx+'px)',top:'calc(50% - '+centerPy+'px)'}}>
      {tiles}

      {visiblePlaces.map((p,i)=>{
        const px=(tileX(p.lng,zoom)-baseX)*size;
        const py=(tileY(p.lat,zoom)-baseY)*size;
        return <button
          key={p.id}
          className={'mtMapMarker '+(selectedId===p.id?'active':'')}
          style={{left:px,top:py}}
          onClick={()=>onSelect(p.id)}
          title={p.name}
          aria-label={'Show '+p.name}
        >
          <span>{i+1}</span>
          {selectedId===p.id&&<b>{p.name}</b>}
        </button>;
      })}
    </div>

    <div className="mtMapCrosshair" aria-hidden="true"/>
    <div className="mtMapZoom">
      <button onClick={()=>setZoom(z=>Math.min(19,z+1))} aria-label="Zoom in">+</button>
      <button onClick={()=>setZoom(z=>Math.max(12,z-1))} aria-label="Zoom out">−</button>
    </div>
    <div className="mtZoomReadout">Z{zoom} · {layer==='satellite'?'SATELLITE':'STREET'}</div>
    <div className="mtMapAttribution">
      {layer==='satellite'?'Imagery © Esri, Maxar, Earthstar Geographics':'© OpenStreetMap contributors'}
    </div>
  </div>;
}

function App(){
  const reduce=useReducedMotion();
  const {scrollYProgress}=useScroll();
  const progress=useSpring(scrollYProgress,{stiffness:100,damping:24,mass:.25});

  const [mode,setMode]=useState('solo');
  const [soloMood,setSoloMood]=useState('happy');
  const [text,setText]=useState('');
  const [autoMood,setAutoMood]=useState(false);
  const [groupCount,setGroupCount]=useState(4);
  const [groupMoods,setGroupMoods]=useState(['happy','happy','social','peaceful']);
  const [crowd,setCrowd]=useState('any');
  const [radiusKm,setRadiusKm]=useState(8);
  const [coords,setCoords]=useState(null);
  const [locationLabel,setLocationLabel]=useState('');
  const [accuracy,setAccuracy]=useState(null);
  const [locationState,setLocationState]=useState('idle');
  const [manualCity,setManualCity]=useState('');
  const [places,setPlaces]=useState([]);
  const [selectedId,setSelectedId]=useState(null);
  const [searchState,setSearchState]=useState('idle');
  const [provider,setProvider]=useState('OpenStreetMap');
  const [modelState,setModelState]=useState('idle');
  const [modelInfo,setModelInfo]=useState(null);
  const [forestState,setForestState]=useState('idle');
  const [error,setError]=useState('');
  const [history,setHistory]=useState([]);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [likes,setLikes]=useState({});
  const [resultsMood,setResultsMood]=useState('happy');

  useEffect(()=>{
    document.title='MoodTrip — Mood-Based Trip Planner';
    try{
      setHistory(JSON.parse(localStorage.getItem('moodtrip-v2-history')||'[]'));
      setLikes(JSON.parse(localStorage.getItem('moodtrip-v2-likes')||'{}'));
    }catch{}
  },[]);

  useEffect(()=>{
    setGroupMoods(prev=>Array.from({length:groupCount},(_,i)=>prev[i]||soloMood));
  },[groupCount,soloMood]);

  const groupVector=useMemo(()=>avgVectors(groupMoods.map(m=>MOOD_VECTORS[m]||MOOD_VECTORS.happy)),[groupMoods]);
  const groupCounts=useMemo(()=>groupMoods.reduce((a,m)=>(a[m]=(a[m]||0)+1,a),{}),[groupMoods]);
  const majority=useMemo(()=>{
    const sorted=Object.entries(groupCounts).sort((a,b)=>b[1]-a[1]);
    if(!sorted.length)return soloMood;
    if(sorted.length>1&&sorted[0][1]===sorted[1][1])return dominantMoodFromVector(groupVector);
    return sorted[0][0];
  },[groupCounts,groupVector,soloMood]);
  const activeMood=mode==='group'?majority:soloMood;
  const activeVector=mode==='group'?groupVector:(MOOD_VECTORS[soloMood]||MOOD_VECTORS.happy);
  const activeCrowd=crowd==='any'?CROWD_DEFAULT[activeMood]:crowd;
  const selected=places.find(p=>p.id===selectedId)||places[0]||null;

  async function useMyLocation(){
    setError('');
    if(!navigator.geolocation){setError('This browser does not support location access.');return}
    setLocationState('loading');
    navigator.geolocation.getCurrentPosition(async pos=>{
      const next={lat:pos.coords.latitude,lng:pos.coords.longitude};
      setCoords(next);setAccuracy(Math.round(pos.coords.accuracy||0));
      setLocationLabel(await reverseGeocode(next));
      setLocationState('ready');
    },err=>{
      setLocationState('error');
      setError(err.code===1?'Location permission was not granted. You can type a city instead.':'Could not get your location. Try a city search.');
    },{enableHighAccuracy:true,timeout:14000,maximumAge:60000});
  }

  async function useCity(e){
    e?.preventDefault();
    if(!manualCity.trim())return;
    try{
      setError('');setLocationState('loading');
      const found=await geocodeCity(manualCity.trim());
      setCoords({lat:found.lat,lng:found.lng});setLocationLabel(found.label);setAccuracy(null);setLocationState('ready');
    }catch(e){setLocationState('error');setError(e.message||'Location not found')}
  }

  function inferFinalMoodFast(){
    if(mode==='group')return {mood:majority,vector:groupVector};
    const mood=autoMood&&text.trim()?ruleMood(text,soloMood):soloMood;
    setModelState(autoMood&&text.trim()?'fast':'idle');
    return {mood,vector:MOOD_VECTORS[mood]||MOOD_VECTORS[soloMood]};
  }

  function rankPlacesFast(raw,mood,vector){
    if(!raw.length)return [];
    const clustered=kMeans(raw,4);
    const clusterScores=new Map();
    clustered.forEach(p=>clusterScores.set(p.cluster,cosine(p.clusterVector,vector)));
    const bestClusters=[...clusterScores.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]);
    const shortlist=clustered.filter(p=>bestClusters.includes(p.cluster));
    const enriched=shortlist.map(p=>{
      const feature=CATEGORY_FEATURES[p.category]||CATEGORY_FEATURES.unknown;
      const distanceKm=haversine(coords,p);
      const ratingNorm=p.rating?clamp((p.rating-2.5)/2.5):.72;
      const distNorm=clamp(distanceKm/Math.max(radiusKm,1));
      const estimate=crowdEstimate(p.category);
      const cFit=crowdFit(activeCrowd,estimate);
      const moodFit=(cosine(vector,feature)+1)/2;
      let mlScore=100*clamp(.56*moodFit+.24*(1-distNorm)+.12*ratingNorm+.08*cFit);
      const affinity=likes[p.category]||0;
      mlScore=clamp((mlScore+Math.min(affinity,6)*1.2)/100)*100;
      return {...p,distanceKm,mlScore,crowdEstimate:estimate,moodFit};
    }).filter(p=>(MOOD_CATEGORIES[mood]||[]).includes(p.category)||p.moodFit>.76);

    return enriched.sort((a,b)=>{
      const distanceGap=a.distanceKm-b.distanceKm;
      if(Math.abs(distanceGap)>.7)return distanceGap;
      if(a.rating!=null&&b.rating!=null&&a.rating!==b.rating)return b.rating-a.rating;
      if((a.reviewCount||0)!==(b.reviewCount||0))return (b.reviewCount||0)-(a.reviewCount||0);
      return b.mlScore-a.mlScore;
    }).slice(0,12);
  }

  async function runDeepMood(){
    if(!text.trim()){setError('Write how you feel first, then run deep mood analysis.');return}
    setError('');setModelState('loading');
    try{
      const deep=await deepEmotion(text);
      if(!deep){setModelState('fallback');setError('Deep model could not load on this device. Fast mood detection still works.');return}
      setModelInfo(deep);
      setModelState('ready');
      if(deep.mood&&deep.confidence>.48)setSoloMood(deep.mood);
    }catch{
      setModelState('fallback');
      setError('Deep model could not load on this device. Fast mood detection still works.');
    }
  }

  async function findPlaces(){
    if(!coords){setError('Share your location or enter a city before finding places.');return}
    if(searchState==='loading')return;
    setError('');setSearchState('loading');
    const started=performance.now();
    try{
      const inferred=inferFinalMoodFast();
      const mood=inferred.mood;
      const vector=mode==='group'?groupVector:inferred.vector;
      setResultsMood(mood);

      let raw=null;
      const key=import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if(key){
        try{
          raw=await Promise.race([
            googlePlaces(coords,Math.min(radiusKm,8),mood),
            new Promise((_,reject)=>setTimeout(()=>reject(new Error('Google Places timeout')),3500))
          ]);
        }catch(e){console.warn('Google Places fast fallback',e)}
      }

      if(raw?.length){
        setProvider('Google Places');
      }else{
        const fallback=await overpassPlaces(coords,radiusKm,mood);
        raw=fallback.places;
        setProvider(fallback.provider);
      }

      const ranked=rankPlacesFast(raw||[],mood,vector);
      setPlaces(ranked);
      setSelectedId(ranked[0]?.id||null);
      setForestState('fast');
      setSearchState('ready');

      if(!ranked.length){
        setError('No suitable places were found in the fast search radius. Try another mood or a larger city area.');
      }

      const elapsed=Math.max(1,Math.round((performance.now()-started)/100)/10);
      setModelInfo(info=>({...info,lastSearchSeconds:elapsed}));

      const entry={id:Date.now(),mood,mode,location:locationLabel||'Current area',count:ranked.length,time:new Date().toLocaleString()};
      const next=[entry,...history].slice(0,8);setHistory(next);
      try{localStorage.setItem('moodtrip-v2-history',JSON.stringify(next))}catch{}
      requestAnimationFrame(()=>document.getElementById('results')?.scrollIntoView({behavior:'smooth',block:'start'}));
    }catch(e){
      console.error(e);
      setSearchState('error');
      setError(e?.message&&e.message!=='Failed to fetch'?e.message:'Nearby place search is temporarily unavailable. Please retry.');
    }
  }

  function likePlace(place){
    const next={...likes,[place.category]:(likes[place.category]||0)+1};
    setLikes(next);
    try{localStorage.setItem('moodtrip-v2-likes',JSON.stringify(next))}catch{}
  }

  const mapCenter=useMemo(()=>selected?{lat:selected.lat,lng:selected.lng}:coords,[selected,coords]);

  const googleMapsUrl=place=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(place.name+' '+(locationLabel||''))+(place.googlePlaceId?'&query_place_id='+encodeURIComponent(place.googlePlaceId):'');

  return <main className="mtApp">
    <motion.div className="mtScrollProgress" style={{scaleX:progress}}/>
    <header className="mtNav">
      <a className="mtWordmark" href="/moodtrip"><span>MT</span><b>MoodTrip</b></a>
      <div className="mtNavMeta"><span>{locationState==='ready'?(locationLabel||'LOCATION LOCKED'):'LOCATION NOT SHARED'}</span><button onClick={()=>setHistoryOpen(true)}>HISTORY {String(history.length).padStart(2,'0')}</button></div>
    </header>

    <section className="mtHero">
      <div className="mtHeroBlock" aria-hidden="true"/>
      <div className="mtHeroStudio" aria-hidden="true">MOOD<br/>PLACE<br/>GO</div>
      <div className="mtMarginNote" aria-hidden="true">DISTANCE FIRST / REVIEWS SECOND</div>

      <div className="mtHeroCopy">
        <p className="mtEyebrow">MOOD-BASED TRIP PLANNING / ML SYSTEM</p>
        <h1>YOUR MOOD<br/><em>IS A QUERY.</em></h1>
        <p className="mtLead">Tell MoodTrip how you feel. It reads the emotion, finds nearby places that fit the vibe, clusters them, predicts suitability, then ranks the shortlist by distance and review quality.</p>
        <div className="mtHeroActions">
          <button className="mtPrimaryAction" onClick={useMyLocation}>{locationState==='loading'?'LOCATING…':locationState==='ready'?'LOCATION READY ✓':'USE MY LOCATION ↗'}</button>
          <a href="#planner">BUILD A MOOD PLAN ↓</a>
        </div>
      </div>

      <LiveMoodSignal mood={activeMood} status={modelState}/>
    </section>

    <section className="mtTechStrip">
      {[
        ['01','TRANSFORMER','emotion classification'],
        ['02','K-MEANS','vibe clustering'],
        ['03','RANK FUSION','fast suitability scoring'],
        ['04',provider.toUpperCase(),'nearby place discovery']
      ].map(([n,a,b],i)=><motion.div key={a} initial={{opacity:0,y:18}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:i*.06}}><span>{n}</span><b>{a}</b><small>{b}</small></motion.div>)}
    </section>

    <section className="mtPlanner" id="planner">
      <div className="mtSectionHead">
        <p className="mtEyebrow">01 / INPUT</p>
        <h2>Tell the system<br/><em>what kind of day this is.</em></h2>
      </div>

      <div className="mtPlannerGrid">
        <PopWindow className="mtLocationWindow">
          <div className="mtWindowTop"><span>LOCATION INPUT</span><b>{locationState==='ready'?'LOCKED':'WAITING'}</b></div>
          <div className="mtLocationLock">
            <span className="mtBigIndex">A</span>
            <div><h3>{locationState==='ready'?(locationLabel||'Current area'):'Where are you?'}</h3><p>{locationState==='ready'?(accuracy?('Browser GPS · ±'+accuracy+' m'):'Manual city location'):'MoodTrip only requests location when you press the button.'}</p></div>
          </div>
          <button className="mtBlackButton" onClick={useMyLocation}>{locationState==='loading'?'REQUESTING LOCATION…':'USE BROWSER LOCATION ↗'}</button>
          <form className="mtManualLocation" onSubmit={useCity}>
            <input value={manualCity} onChange={e=>setManualCity(e.target.value)} placeholder="or type a city"/>
            <button>USE CITY</button>
          </form>
          <p className="mtFinePrint">Exact coordinates stay in your browser session. The UI only displays a city/area label.</p>
        </PopWindow>

        <PopWindow className="mtModeWindow" delay={.05}>
          <div className="mtWindowTop"><span>WHO IS GOING?</span><b>{mode.toUpperCase()}</b></div>
          <div className="mtModeSwitch">
            <button className={mode==='solo'?'active':''} onClick={()=>setMode('solo')}>SOLO</button>
            <button className={mode==='group'?'active':''} onClick={()=>setMode('group')}>GROUP</button>
          </div>
          {mode==='group'?<>
            <div className="mtCountRow"><span>PEOPLE</span><div>{[2,3,4,5,6].map(n=><button className={groupCount===n?'active':''} key={n} onClick={()=>setGroupCount(n)}>{n}</button>)}</div></div>
            <div className="mtVoteSummary"><span>MAJORITY</span><strong>{majority.toUpperCase()}</strong><small>{Math.max(...Object.values(groupCounts),0)} / {groupCount} votes</small></div>
          </>:<div className="mtSoloNote"><span>PERSONAL MODE</span><p>Your text emotion + selected mood + local feedback profile.</p></div>}
        </PopWindow>

        <PopWindow className="mtMoodWindow" delay={.1}>
          <div className="mtWindowTop"><span>{mode==='group'?'GROUP MOOD BOARD':'MOOD INPUT'}</span><b>{activeMood.toUpperCase()}</b></div>
          {mode==='solo'&&<>
            <label className="mtTextMood"><span>Describe how you feel</span><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="I feel low today. I want somewhere quiet where I can sit by myself and not deal with a crowd…"/></label>
            <div className="mtAutoRow"><div><button className={autoMood?'active':''} onClick={()=>setAutoMood(v=>!v)}>{autoMood?'FAST TEXT MOOD ON':'FAST TEXT MOOD OFF'}</button><button onClick={runDeepMood} disabled={modelState==='loading'}>{modelState==='loading'?'DEEP MODEL LOADING…':'RUN DEEP MODEL'}</button></div><span>{modelInfo?.label?('DL: '+modelInfo.label+' · '+Math.round(modelInfo.confidence*100)+'%'):modelInfo?.lastSearchSeconds?('last search '+modelInfo.lastSearchSeconds+'s'):'Fast mode never waits for the transformer'}</span></div>
          </>}
          {mode==='group'&&<div className="mtGroupBoard">
            {groupMoods.map((gm,i)=><label key={i}><span>P{String(i+1).padStart(2,'0')}</span><select value={gm} onChange={e=>setGroupMoods(v=>v.map((m,j)=>j===i?e.target.value:m))}>{MOODS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label>)}
          </div>}
          <div className="mtMoodGrid">
            {MOODS.map(m=><button key={m.id} className={soloMood===m.id&&mode==='solo'?'active':''} onClick={()=>mode==='solo'&&setSoloMood(m.id)} disabled={mode==='group'}>
              <span>{m.mark}</span><b>{m.label}</b><small>{m.hint}</small>
            </button>)}
          </div>
        </PopWindow>

        <PopWindow className="mtContextWindow" delay={.15}>
          <div className="mtWindowTop"><span>CONTEXT FEATURES</span><b>LIVE VECTOR</b></div>
          <div className="mtContextGrid">
            <label><span>RADIUS</span><select value={radiusKm} onChange={e=>setRadiusKm(Number(e.target.value))}>{[3,5,8,12,20].map(n=><option key={n} value={n}>{n} KM</option>)}</select></label>
            <label><span>CROWD</span><select value={crowd} onChange={e=>setCrowd(e.target.value)}><option value="any">AUTO</option><option value="quiet">QUIET</option><option value="balanced">BALANCED</option><option value="lively">LIVELY</option></select></label>
          </div>
          <div className="mtVectorBars">
            {['SOCIAL','ENERGY','CALM','DISCOVERY','INDOOR','OUTDOOR','FOOD','PLAY'].map((label,i)=><div key={label}><span>{label}</span><i><motion.b animate={{width:(activeVector[i]*100)+'%'}} transition={{type:'spring',stiffness:110,damping:18}}/></i><small>{Math.round(activeVector[i]*100)}</small></div>)}
          </div>
          <p className="mtFinePrint">For “sad”, “stressed” and solo-time moods, quiet public spaces are favored. MoodTrip does not intentionally recommend unsafe isolated areas.</p>
        </PopWindow>
      </div>

      {error&&<motion.div className="mtError" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}>{error}</motion.div>}

      <motion.button className="mtFindButton" onClick={findPlaces} disabled={searchState==='loading'} whileHover={reduce?undefined:{scale:1.01}} whileTap={reduce?undefined:{scale:.985}}>
        <span>{searchState==='loading'?'RUNNING MOOD → PLACE PIPELINE…':'FIND PLACES FOR THIS MOOD'}</span>
        <b>{searchState==='loading'?'•••':'↗'}</b>
      </motion.button>
    </section>

    <section className="mtPipeline">
      <div className="mtPipelineHead">
        <p className="mtEyebrow">02 / MODEL PIPELINE</p>
        <h2>Not a category filter.<br/><em>A small recommendation system.</em></h2>
      </div>
      <div className="mtPipelineCanvas">
        {[
          ['TEXT / MOOD','Transformer','emotion probabilities',modelState==='ready'?'READY':modelState==='loading'?'LOADING':'LAZY'],
          ['PLACE FEATURES','K-Means','vibe cluster vectors',places.length?String(new Set(places.map(p=>p.cluster)).size)+' CLUSTERS':'WAITING'],
          ['SUITABILITY','Rank Fusion','mood + distance + crowd',forestState==='fast'?'FAST MODE':'READY'],
          ['FINAL ORDER','Rank fusion','distance → rating → ML',provider.toUpperCase()]
        ].map(([a,b,c,d],i)=><React.Fragment key={b}>
          <motion.div className="mtPipeNode" initial={{opacity:0,scale:.9}} whileInView={{opacity:1,scale:1}} viewport={{once:true}} transition={{delay:i*.08,type:'spring'}}><span>{a}</span><h3>{b}</h3><p>{c}</p><b>{d}</b></motion.div>
          {i<3&&<div className="mtPipeLine"><motion.i animate={reduce?undefined:{x:['-20%','120%']}} transition={{duration:2.2,repeat:Infinity,delay:i*.45,ease:'linear'}}/></div>}
        </React.Fragment>)}
      </div>
      <div className="mtPipelineNote"><span>RANKING RULE</span><p>Mood relevance creates the shortlist. Inside that shortlist, nearby places come first. When Google rating data is available, rating and review count break close-distance ties; ML suitability is the next signal.</p></div>
    </section>

    <section className="mtResults" id="results">
      <div className="mtSectionHead mtSplitHead">
        <div><p className="mtEyebrow">03 / NEARBY RESULTS</p><h2>{places.length?'Places that fit right now.':'Results will land here.'}</h2></div>
        <div className="mtResultMeta">
          <span>MOOD <b>{resultsMood.toUpperCase()}</b></span>
          <span>SOURCE <b>{provider.toUpperCase()}</b></span>
          <span>RADIUS <b>{radiusKm} KM</b></span>
        </div>
      </div>

      {places.length?<>
        <div className="mtResultsGrid">
          <PopWindow className="mtMapWindow">
            <div className="mtWindowTop"><span>LIVE MAP</span><b>{selected?selected.name.toUpperCase():'AREA'}</b></div>
            {mapCenter&&<TileMap center={mapCenter} places={places} selectedId={selected?.id} onSelect={setSelectedId}/>}
            <div className="mtMapFooter"><span>{selected?.distanceKm.toFixed(1)} KM AWAY</span><a href={selected?googleMapsUrl(selected):'#'} target="_blank" rel="noreferrer">OPEN IN GOOGLE MAPS ↗</a></div>
          </PopWindow>

          <div className="mtPlaceList">
            {places.slice(0,8).map((p,i)=><motion.article
              key={p.id}
              className={'mtPlace '+(selected?.id===p.id?'active':'')}
              onClick={()=>setSelectedId(p.id)}
              initial={{opacity:0,x:26}}
              whileInView={{opacity:1,x:0}}
              viewport={{once:true,amount:.2}}
              transition={{delay:i*.04,type:'spring',stiffness:110,damping:19}}
              whileHover={reduce?undefined:{x:-6}}
            >
              <div className="mtPlaceNum">0{i+1}</div>
              <div className="mtPlaceMain">
                <div className="mtPlaceTop"><span>{labelCategory(p.category)} · CLUSTER {p.cluster}</span><b>{Math.round(p.mlScore)}% FIT</b></div>
                <h3>{p.name}</h3>
                <p>{p.address||locationLabel||'Nearby'}</p>
                <div className="mtPlaceSignals">
                  <span><b>{p.distanceKm.toFixed(1)} km</b> distance</span>
                  <span><b>{p.rating?Number(p.rating).toFixed(1):'—'}</b> rating</span>
                  <span><b>{p.reviewCount?Intl.NumberFormat().format(p.reviewCount):'—'}</b> reviews</span>
                  <span><b>{p.crowdEstimate}</b> crowd proxy</span>
                </div>
              </div>
              <div className="mtPlaceActions"><button onClick={e=>{e.stopPropagation();likePlace(p)}}>GOOD PICK +</button><a onClick={e=>e.stopPropagation()} href={googleMapsUrl(p)} target="_blank" rel="noreferrer">MAPS ↗</a></div>
            </motion.article>)}
          </div>
        </div>

        {provider==='OpenStreetMap'&&<div className="mtProviderNotice"><span>REVIEW DATA</span><p>This deployment is currently using OpenStreetMap/Overpass for real nearby places. It does not fabricate ratings. The Google Places adapter is already wired into the project; adding a restricted <code>VITE_GOOGLE_MAPS_API_KEY</code> enables real rating + review-count tie-breaking automatically.</p></div>}
      </>:<div className="mtEmptyResults"><span>03</span><h3>Share a location, choose the mood, then run the pipeline.</h3><p>The page will query live nearby places rather than showing a fixed Jaipur demo list.</p></div>}
    </section>

    <section className="mtDataScience">
      <div className="mtSectionHead">
        <p className="mtEyebrow">04 / DATA SCIENCE LAYER</p>
        <h2>The app gets better<br/><em>than “happy = café.”</em></h2>
      </div>
      <div className="mtDSGrid">
        {[
          ['A','DEEP EMOTION','A quantized RoBERTa emotion model runs in the browser on demand. Manual mood remains available as an explicit user signal.'],
          ['B','GROUP VECTOR','Every group member contributes a mood vector. Majority decides the label; ties are resolved from the averaged group vector.'],
          ['C','UNSUPERVISED VIBES','K-Means groups nearby candidates by atmosphere features instead of relying only on OSM/Google category names.'],
          ['D','ENSEMBLE RANKING','Fast rank fusion scores mood fit, exact distance, crowd preference and rating signal. Heavy models never block the first result set.'],
          ['E','ONLINE FEEDBACK','“Good pick” feedback is stored locally and adds a small category affinity bonus on later searches.'],
          ['F','CONTEXT','Distance radius, crowd preference, group state and current mood all become model features rather than visual-only filters.']
        ].map(([n,t,p],i)=><PopWindow key={t} className="mtDSCard" delay={i*.04}><span>{n}</span><h3>{t}</h3><p>{p}</p></PopWindow>)}
      </div>
    </section>

    <footer className="mtFooter">
      <div><b>MT</b><span>MoodTrip</span></div>
      <p>MOOD → LOCATION → VIBE → RANK → GO</p>
      <a href="/">DIVYANSH SINGH / PORTFOLIO ↗</a>
    </footer>

    <AnimatePresence>
      {historyOpen&&<>
        <motion.button className="mtHistoryScrim" aria-label="Close history" onClick={()=>setHistoryOpen(false)} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}/>
        <motion.aside className="mtHistory" initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}} transition={{type:'spring',stiffness:190,damping:26}}>
          <div className="mtHistoryHead"><div><span>LOCAL SESSION LOG</span><h3>TRIP HISTORY</h3></div><button onClick={()=>setHistoryOpen(false)}>×</button></div>
          {history.length?<div className="mtHistoryList">{history.map(h=><div key={h.id}><span>{h.time}</span><b>{h.mood.toUpperCase()}</b><p>{h.location} · {h.mode} · {h.count} results</p></div>)}</div>:<p className="mtNoHistory">No trips yet. Run the mood pipeline once and they’ll appear here.</p>}
          {history.length>0&&<button className="mtClearHistory" onClick={()=>{setHistory([]);localStorage.removeItem('moodtrip-v2-history')}}>CLEAR LOCAL HISTORY</button>}
        </motion.aside>
      </>}
    </AnimatePresence>
  </main>;
}

export default App;
