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
import L from'leaflet';
import AeroShards from'./AeroShards';
import{
  ML_BENCHMARK,
  ML_META,
  MOOD_TEXT_BENCHMARK,
  buildRankFeatures,
  predictDistilledRanker,
  contextualBanditScore,
  productionEnsembleScore,
  totalFeedbackSignals,
  feedbackKey,
  explainDistilledRanker,
  placeFeedbackAdjustment,
  mergeFeedbackMaps
}from'./moodtripML';
import'leaflet/dist/leaflet.css';
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
  const vector=MOOD_VECTORS[mood]||MOOD_VECTORS.happy;
  const candidates=(MOOD_CATEGORIES[mood]||['cafe','park','attraction'])
    .slice(0,4)
    .map(category=>({
      category,
      score:Math.round(cosine(vector,CATEGORY_FEATURES[category]||CATEGORY_FEATURES.unknown)*100)
    }))
    .sort((a,b)=>b.score-a.score)
    .slice(0,3);

  return <div className="mtLiveSignal mtRecommendationEngine" aria-hidden="true">
    <div className="mtSignalHead">
      <span><i/>LIVE RECOMMENDATION ENGINE</span>
      <b>{status==='ready'?'MODEL READY':'LOCAL MODEL'}</b>
    </div>

    <div className="mtEngineFlow">
      {[
        ['01',mood.toUpperCase(),'MOOD'],
        ['02','VECTOR','ENCODE'],
        ['03','K-MEANS','CLUSTER'],
        ['04','RANK','FUSE']
      ].map(([n,label,sub],i)=><React.Fragment key={n}>
        <motion.div
          className="mtEngineNode"
          animate={reduce?undefined:{y:[0,-2,0]}}
          transition={{duration:2.4+i*.2,repeat:Infinity,delay:i*.12}}
        >
          <small>{n}</small><b>{label}</b><span>{sub}</span>
        </motion.div>
        {i<3&&<motion.i className="mtEngineArrow" animate={reduce?undefined:{opacity:[.25,1,.25]}} transition={{duration:1.2,repeat:Infinity,delay:i*.18}}>→</motion.i>}
      </React.Fragment>)}
    </div>

    <div className="mtEngineCandidates">
      <div className="mtEngineCandidatesHead"><span>TOP VIBE CLUSTERS</span><b>MODEL MATCH</b></div>
      {candidates.map((item,i)=><div className="mtEngineCandidate" key={item.category}>
        <span>0{i+1}</span>
        <div><b>{item.category.toUpperCase()}</b><i><motion.em initial={{scaleX:0}} animate={{scaleX:item.score/100}} transition={{duration:.8,delay:.15+i*.1}}/></i></div>
        <strong>{item.score}%</strong>
      </div>)}
    </div>

    <div className="mtSignalFormula">
      <span>FINAL RANK</span>
      <b>VIBE MATCH + DISTANCE + REVIEW QUALITY</b>
    </div>
  </div>;
}

function InteractiveMap({center,places,selectedId,onSelect}){
  const rootRef=useRef(null);
  const mapRef=useRef(null);
  const baseRef=useRef(null);
  const labelsRef=useRef(null);
  const markerLayerRef=useRef(null);
  const footprintLayerRef=useRef(null);

  const [layer,setLayer]=useState('satellite');
  const [zoom,setZoom]=useState(20);
  const [buildingState,setBuildingState]=useState('idle');

  const [streetState,setStreetState]=useState('idle');
  const [streetImages,setStreetImages]=useState([]);
  const [streetProviders,setStreetProviders]=useState([]);
  const [streetProvider,setStreetProvider]=useState('auto');
  const [streetIndex,setStreetIndex]=useState(0);
  const [streetCoverage,setStreetCoverage]=useState({expanded:false,coverageRadiusMeters:900,nearestDistanceMeters:null,fallbackMedia:null});
  const [cameraShift,setCameraShift]=useState({north:0,east:0});

  const selectedPlace=places.find(p=>p.id===selectedId)||places[0]||null;

  const cameraCenter=useMemo(()=>{
    if(!center)return null;
    const north=Number(cameraShift.north)||0;
    const east=Number(cameraShift.east)||0;
    const dLat=north/111111;
    const dLng=east/(111111*Math.max(.2,Math.cos(center.lat*Math.PI/180)));
    return {lat:center.lat+dLat,lng:center.lng+dLng};
  },[center?.lat,center?.lng,cameraShift.north,cameraShift.east]);

  const cameraShiftMeters=Math.round(Math.hypot(cameraShift.north,cameraShift.east));

  const providerImages=useMemo(()=>{
    if(streetProvider==='auto')return streetImages;
    return streetImages.filter(img=>img.providerId===streetProvider);
  },[streetImages,streetProvider]);

  const streetImage=providerImages.length
    ?providerImages[Math.min(streetIndex,providerImages.length-1)]
    :null;

  useEffect(()=>{
    setCameraShift({north:0,east:0});
  },[selectedId,center?.lat,center?.lng]);

  useEffect(()=>{
    if(!rootRef.current||!center||mapRef.current)return;

    const map=L.map(rootRef.current,{
      zoomControl:false,
      attributionControl:true,
      scrollWheelZoom:true,
      doubleClickZoom:true,
      dragging:true,
      touchZoom:true,
      boxZoom:true,
      keyboard:true,
      zoomSnap:.5,
      zoomDelta:.5,
      minZoom:3,
      maxZoom:21
    }).setView([center.lat,center.lng],19.5);

    L.control.zoom({position:'topright'}).addTo(map);
    markerLayerRef.current=L.layerGroup().addTo(map);
    footprintLayerRef.current=L.layerGroup().addTo(map);
    mapRef.current=map;

    const timer=setTimeout(()=>map.invalidateSize(),80);
    const sync=()=>setZoom(map.getZoom());
    map.on('zoomend',sync);

    return()=>{
      clearTimeout(timer);
      map.off('zoomend',sync);
      map.remove();
      mapRef.current=null;
      baseRef.current=null;
      labelsRef.current=null;
      markerLayerRef.current=null;
      footprintLayerRef.current=null;
    };
  },[center?.lat,center?.lng]);

  useEffect(()=>{
    const map=mapRef.current;
    if(!map)return;

    if(baseRef.current){map.removeLayer(baseRef.current);baseRef.current=null}
    if(labelsRef.current){map.removeLayer(labelsRef.current);labelsRef.current=null}

    if(layer==='camera')return;

    if(layer==='satellite'){
      baseRef.current=L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          maxNativeZoom:19,
          maxZoom:21,
          tileSize:256,
          updateWhenZooming:false,
          keepBuffer:4,
          attribution:'Imagery © Esri, Maxar, Earthstar Geographics'
        }
      ).addTo(map);

      labelsRef.current=L.tileLayer(
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        {
          maxNativeZoom:18,
          maxZoom:21,
          pane:'overlayPane',
          opacity:.82,
          attribution:''
        }
      ).addTo(map);
    }else{
      baseRef.current=L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          maxNativeZoom:19,
          maxZoom:21,
          keepBuffer:4,
          attribution:'© OpenStreetMap contributors'
        }
      ).addTo(map);
    }
  },[layer,center?.lat,center?.lng]);

  useEffect(()=>{
    if(layer!=='camera'||!cameraCenter){
      setStreetState('idle');
      return;
    }

    let alive=true;
    setStreetState('loading');
    setStreetImages([]);
    setStreetProviders([]);
    setStreetProvider('auto');
    setStreetIndex(0);

    (async()=>{
      try{
        const d=await apiJson(
          '/api/moodtrip?action=streetmedia&lat='+encodeURIComponent(cameraCenter.lat)+'&lng='+encodeURIComponent(cameraCenter.lng),
          {},
          16000
        );
        if(!alive)return;
        setStreetImages(Array.isArray(d.images)?d.images:[]);
        setStreetProviders(Array.isArray(d.providers)?d.providers:[]);
        setStreetCoverage({
          expanded:Boolean(d.expanded),
          coverageRadiusMeters:Number(d.coverageRadiusMeters)||900,
          nearestDistanceMeters:Number.isFinite(Number(d.nearestDistanceMeters))?Number(d.nearestDistanceMeters):null,
          fallbackMedia:d.fallbackMedia||null
        });
        setStreetState('ready');
      }catch{
        if(!alive)return;
        setStreetState('error');
      }
    })();

    return()=>{alive=false};
  },[layer,cameraCenter?.lat,cameraCenter?.lng,selectedId]);

  useEffect(()=>{
    setStreetIndex(0);
  },[streetProvider]);

  useEffect(()=>{
    const map=mapRef.current;
    const footprintLayer=footprintLayerRef.current;
    if(!map||!center||!footprintLayer)return;

    let alive=true;
    footprintLayer.clearLayers();
    setBuildingState('loading');

    map.flyTo([center.lat,center.lng],19.5,{
      animate:true,
      duration:.8,
      easeLinearity:.2
    });

    (async()=>{
      try{
        const d=await apiJson(
          '/api/moodtrip?action=footprint&lat='+encodeURIComponent(center.lat)+'&lng='+encodeURIComponent(center.lng),
          {},
          6500
        );
        if(!alive)return;
        const fp=d.footprint;

        if(fp?.coordinates?.length>=3){
          const polygon=L.polygon(fp.coordinates,{
            color:'#f1b09a',
            weight:4,
            opacity:1,
            fillColor:'#9a6654',
            fillOpacity:.16,
            dashArray:'8 5',
            pane:'overlayPane'
          }).addTo(footprintLayer);

          polygon.bindTooltip(fp.name||'Selected building',{
            permanent:false,
            direction:'top',
            className:'mtBuildingTooltip'
          });

          const bounds=polygon.getBounds();
          if(bounds.isValid()){
            map.flyToBounds(bounds,{
              padding:[70,70],
              maxZoom:21,
              duration:1.05
            });
          }
          setBuildingState('found');
        }else{
          map.flyTo([center.lat,center.lng],20.5,{animate:true,duration:.9});
          setBuildingState('none');
        }
      }catch{
        if(!alive)return;
        map.flyTo([center.lat,center.lng],21,{animate:true,duration:.9});
        setBuildingState('none');
      }

      setTimeout(()=>map.invalidateSize(),80);
    })();

    return()=>{alive=false};
  },[center?.lat,center?.lng,selectedId]);

  useEffect(()=>{
    const map=mapRef.current;
    const layerGroup=markerLayerRef.current;
    if(!map||!layerGroup)return;
    layerGroup.clearLayers();

    places.slice(0,8).forEach((p,i)=>{
      const active=p.id===selectedId;
      const safeName=String(p.name||'Place').replace(/[<>&"]/g,'');
      const html='<div class="mtLeafletMarker '+(active?'active':'')+'"><span>'+(i+1)+'</span>'+(active?'<b>'+safeName+'</b>':'')+'</div>';
      const icon=L.divIcon({
        className:'mtLeafletMarkerWrap',
        html,
        iconSize:[30,30],
        iconAnchor:[15,15]
      });
      const marker=L.marker([p.lat,p.lng],{icon,title:p.name||'Place'}).addTo(layerGroup);
      marker.on('click',()=>onSelect(p.id));
    });
  },[places,selectedId,onSelect]);

  const exactGoogleStreetUrl='https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+encodeURIComponent(center.lat+','+center.lng);
  const panoramaxExplore='https://explore.panoramax.fr/';
  const kartaExplore='https://kartaview.org/';
  const mapillaryExplore='https://www.mapillary.com/app/?lat='+encodeURIComponent(center.lat)+'&lng='+encodeURIComponent(center.lng)+'&z=17';

  function cycleStreet(delta){
    if(!providerImages.length)return;
    setStreetIndex(i=>(i+delta+providerImages.length)%providerImages.length);
  }

  function moveCamera(northDelta,eastDelta){
    const MAX=480;
    setCameraShift(prev=>{
      let north=(Number(prev.north)||0)+northDelta;
      let east=(Number(prev.east)||0)+eastDelta;
      const distance=Math.hypot(north,east);
      if(distance>MAX){
        const scale=MAX/distance;
        north=Math.round(north*scale);
        east=Math.round(east*scale);
      }
      return {north,east};
    });
  }

  const cameraMover=layer==='camera'&&streetState!=='loading'&&<div className="mtCameraMove">
    <div className="mtCameraMoveHead"><span>MOVE CAMERA</span><b>{cameraShiftMeters} M</b></div>
    <div className="mtCameraMovePad">
      <span/>
      <button type="button" onClick={()=>moveCamera(80,0)} aria-label="Move camera 80 meters north">↑</button>
      <span/>
      <button type="button" onClick={()=>moveCamera(0,-80)} aria-label="Move camera 80 meters west">←</button>
      <button type="button" className="reset" onClick={()=>setCameraShift({north:0,east:0})} aria-label="Reset camera to selected place">◎</button>
      <button type="button" onClick={()=>moveCamera(0,80)} aria-label="Move camera 80 meters east">→</button>
      <span/>
      <button type="button" onClick={()=>moveCamera(-80,0)} aria-label="Move camera 80 meters south">↓</button>
      <span/>
    </div>
    <small>80 M STEP · MAX 480 M</small>
  </div>;

  return <div className="mtLeafletShell">
    <div className="mtMapLayerSwitch" role="group" aria-label="Map style">
      <button className={layer==='satellite'?'active':''} onClick={()=>setLayer('satellite')}>SATELLITE</button>
      <button className={layer==='street'?'active':''} onClick={()=>setLayer('street')}>STREET MAP</button>
      <button className={layer==='camera'?'active':''} onClick={()=>setLayer('camera')}>STREET CAMERA</button>
    </div>

    <div className={'mtBuildingStatus '+(layer==='camera'?'camera':buildingState)}>
      <i/>
      <span>{layer==='camera'
        ?(streetState==='loading'
          ?'SEARCHING OPEN STREET IMAGERY'
          :streetImage
            ?streetImage.provider.toUpperCase()+(streetCoverage.fallbackMedia?' · PHOTO FALLBACK':streetCoverage.expanded?' · EXPANDED COVERAGE':'')
            :'OPEN STREET CAMERA')
        :(buildingState==='loading'?'FINDING BUILDING OUTLINE':buildingState==='found'?'EXACT BUILDING OUTLINE':'EXACT COORDINATE ZOOM')}</span>
    </div>

    <div className="mtLeafletMap" ref={rootRef}/>

    {layer==='camera'&&<div className="mtStreetCamera mtOpenStreetCamera">
      {streetState==='loading'&&<div className="mtStreetCameraState"><i/><span>SEARCHING PANORAMAX + KARTAVIEW + OPTIONAL MAPILLARY…</span></div>}

      {streetState==='ready'&&streetImage&&<>
        <div className="mtStreetProviderTabs">
          <button className={streetProvider==='auto'?'active':''} onClick={()=>setStreetProvider('auto')}>BEST MATCH <b>{streetImages.length}</b></button>
          {streetProviders.map(provider=>{
            const label=provider.id==='panoramax'?'PANORAMAX':provider.id==='kartaview'?'KARTAVIEW':provider.id==='wikimedia'?'NEARBY PHOTO':'MAPILLARY';
            const disabled=provider.count===0;
            return <button
              key={provider.id}
              className={streetProvider===provider.id?'active':''}
              onClick={()=>!disabled&&setStreetProvider(provider.id)}
              disabled={disabled}
              title={provider.status==='token-optional'?'Optional free Mapillary token can enable this source':''}
            >{label} <b>{provider.count||0}</b></button>;
          })}
        </div>

        <div className="mtStreetMediaFrame">
          {streetImage.imageUrl
            ?<img
              src={streetImage.imageUrl}
              alt={(streetImage.provider||'Street')+' imagery near '+(selectedPlace?.name||'selected place')}
              loading="eager"
              onError={()=>{
                if(providerImages.length>1)cycleStreet(1);
                else setStreetState('error');
              }}
            />
            :streetImage.embedUrl
              ?<iframe src={streetImage.embedUrl} title={'Street imagery near '+(selectedPlace?.name||'selected place')} loading="lazy"/>
              :null}

          {providerImages.length>1&&<>
            <button className="mtStreetPrev" onClick={()=>cycleStreet(-1)} aria-label="Previous street image">←</button>
            <button className="mtStreetNext" onClick={()=>cycleStreet(1)} aria-label="Next street image">→</button>
          </>}
        </div>

        {cameraMover}

        <div className="mtStreetCameraCaption">
          <div>
            <span>{streetImage.provider.toUpperCase()} · {streetImage.providerId==='wikimedia'?'GEOTAGGED PLACE PHOTO / NOT STREET VIEW':streetImage.isPano?'360° / STREET LEVEL':'STREET LEVEL'}{streetCoverage.expanded?' · WIDER COVERAGE':''}</span>
            <b>{selectedPlace?.name||'SELECTED BUILDING'}</b>
            <small>
              {streetImage.distanceMeters!=null?streetImage.distanceMeters+' m from camera point':''}
              {cameraShiftMeters?' · camera moved '+cameraShiftMeters+' m from place':''}
              {streetImage.aimDelta!=null?' · '+Math.round(streetImage.aimDelta)+'° camera offset':''}
              {streetImage.capturedAt?' · '+new Date(streetImage.capturedAt).toLocaleDateString():''}
            </small>
          </div>
          <div className="mtStreetCaptionActions">
            {streetImage.viewerUrl&&<a href={streetImage.viewerUrl} target="_blank" rel="noreferrer">{streetImage.isPano?'OPEN 360°':'OPEN SOURCE'} ↗</a>}
            <span>{streetIndex+1} / {providerImages.length}</span>
          </div>
        </div>
      </>}

      {streetState==='ready'&&!streetImages.length&&<>
        {cameraMover}
        <div className="mtCoverageExplorer">
          <div className="mtCoverageCopy">
            <span>OPEN MEDIA COVERAGE</span>
            <h4>No public camera or geotagged photo was found at this point.</h4>
            <p>Move the search point toward a nearby road in 80 m steps, or switch back to Satellite for the exact building. MoodTrip never substitutes an unrelated photo just to fill the panel.</p>
          </div>
          <div className="mtCoverageSources">
            {streetProviders.length?streetProviders.map(source=><div key={source.id}>
              <span>{source.id==='wikimedia'?'WIKIMEDIA':source.id.toUpperCase()}</span>
              <b>{source.count?source.count+' FOUND':source.status==='unavailable'?'OFFLINE':'NO COVERAGE'}</b>
            </div>):<div><span>MEDIA NETWORKS</span><b>RETRY AVAILABLE</b></div>}
          </div>
          <div className="mtOpenCameraLinks">
            <a href={panoramaxExplore} target="_blank" rel="noreferrer">PANORAMAX ↗</a>
            <a href={kartaExplore} target="_blank" rel="noreferrer">KARTAVIEW ↗</a>
            <a href={mapillaryExplore} target="_blank" rel="noreferrer">MAPILLARY ↗</a>
            <a href={exactGoogleStreetUrl} target="_blank" rel="noreferrer">GOOGLE STREET VIEW ↗</a>
          </div>
        </div>
      </>}

      {streetState==='error'&&<>
        {cameraMover}
        <div className="mtCoverageExplorer error">
          <div className="mtCoverageCopy">
            <span>MEDIA NETWORK RETRY</span>
            <h4>The open imagery request timed out.</h4>
            <p>The exact place is unchanged. Switch to Satellite, move the camera point, or reopen Street Camera to retry without losing the recommendation.</p>
          </div>
          <div className="mtOpenCameraLinks">
            <a href={panoramaxExplore} target="_blank" rel="noreferrer">PANORAMAX ↗</a>
            <a href={kartaExplore} target="_blank" rel="noreferrer">KARTAVIEW ↗</a>
            <a href={mapillaryExplore} target="_blank" rel="noreferrer">MAPILLARY ↗</a>
          </div>
        </div>
      </>}
    </div>}

    <div className="mtMapHint">{layer==='camera'
      ?'OPEN MEDIA · STREET CAMERA FIRST · WIKIMEDIA PHOTO FALLBACK · MOVE IN 80 M STEPS'
      :'SCROLL / PINCH / DRAG · BUILDING OUTLINE STAYS PRECISE AT MAX AVAILABLE SATELLITE DETAIL'}</div>
    <div className="mtZoomReadout">{layer==='camera'
      ?(streetImage?streetImage.provider.toUpperCase():'STREET CAMERA')
      :('Z'+Number(zoom).toFixed(zoom%1?1:0)+' · '+(layer==='satellite'?'SATELLITE':'STREET'))}</div>
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
  const [locationSuggestions,setLocationSuggestions]=useState([]);
  const [suggestState,setSuggestState]=useState('idle');
  const [suggestOpen,setSuggestOpen]=useState(false);
  const [reviewPlace,setReviewPlace]=useState(null);
  const [publicReviews,setPublicReviews]=useState([]);
  const [publicReviewState,setPublicReviewState]=useState('idle');
  const [localReviews,setLocalReviews]=useState([]);
  const [reviewDraftRating,setReviewDraftRating]=useState(5);
  const [reviewDraftText,setReviewDraftText]=useState('');
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
  const [feedback,setFeedback]=useState({});
  const [globalFeedback,setGlobalFeedback]=useState({});
  const [feedbackStorage,setFeedbackStorage]=useState({mode:'checking',rows:0,degraded:false});
  const [sessionId,setSessionId]=useState('');
  const [resultsMood,setResultsMood]=useState('happy');

  useEffect(()=>{
    document.title='MoodTrip — Mood-Based Trip Planner';
    try{
      setHistory(JSON.parse(localStorage.getItem('moodtrip-v2-history')||'[]'));
      setFeedback(JSON.parse(localStorage.getItem('moodtrip-v3-feedback')||'{}'));
      let sid=localStorage.getItem('moodtrip-session-id');
      if(!sid){sid='mt-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);localStorage.setItem('moodtrip-session-id',sid)}
      setSessionId(sid);
    }catch{}
  },[]);

  useEffect(()=>{
    setGroupMoods(prev=>Array.from({length:groupCount},(_,i)=>prev[i]||soloMood));
  },[groupCount,soloMood]);

  useEffect(()=>{
    let alive=true;
    (async()=>{
      try{
        const d=await apiJson('/api/feedback?mood='+encodeURIComponent(activeMood),{},5000);
        if(!alive)return;
        setGlobalFeedback(d.feedback||{});
        setFeedbackStorage({
          mode:d.storage==='supabase'?'global':'local',
          rows:Number(d.rows)||0,
          degraded:Boolean(d.degraded)
        });
      }catch{
        if(!alive)return;
        setGlobalFeedback({});
        setFeedbackStorage({mode:'local',rows:0,degraded:true});
      }
    })();
    return()=>{alive=false};
  },[activeMood]);

  useEffect(()=>{
    if(!suggestOpen||manualCity.trim().length<2){
      setLocationSuggestions([]);
      if(manualCity.trim().length<2)setSuggestState('idle');
      return;
    }
    let alive=true;
    const timer=setTimeout(async()=>{
      setSuggestState('loading');
      try{
        const bias=coords?'&lat='+encodeURIComponent(coords.lat)+'&lng='+encodeURIComponent(coords.lng):'';
        const d=await apiJson('/api/moodtrip?action=suggest&q='+encodeURIComponent(manualCity.trim())+bias,{},6500);
        if(!alive)return;
        setLocationSuggestions(d.items||[]);
        setSuggestState('ready');
      }catch{
        if(!alive)return;
        setLocationSuggestions([]);
        setSuggestState('error');
      }
    },260);
    return()=>{alive=false;clearTimeout(timer)};
  },[manualCity,suggestOpen,coords?.lat,coords?.lng]);

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
  const adaptiveFeedback=useMemo(()=>mergeFeedbackMaps(globalFeedback,feedback),[globalFeedback,feedback]);
  const selected=places.find(p=>p.id===selectedId)||places[0]||null;
  const feedbackSignals=useMemo(()=>totalFeedbackSignals(feedback),[feedback]);
  const globalFeedbackSignals=useMemo(()=>totalFeedbackSignals(globalFeedback),[globalFeedback]);
  const selectedExplanation=useMemo(()=>{
    if(!selected?.rankFeatures)return null;
    const sensitivity=explainDistilledRanker(selected.rankFeatures);
    const maxAbs=Math.max(.001,...sensitivity.map(x=>Math.abs(x.delta)));
    const normalized=sensitivity.map(x=>({...x,strength:Math.abs(x.delta)/maxAbs}));

    const categoryVector=CATEGORY_FEATURES[selected.category]||CATEGORY_FEATURES.unknown;
    const alternatives=Object.entries(MOOD_VECTORS)
      .filter(([mood])=>mood!==resultsMood)
      .map(([mood,moodVector])=>{
        const features=[...selected.rankFeatures];
        moodVector.forEach((v,i)=>{features[i]=v});
        const neural=predictDistilledRanker(features);
        const content=(cosine(moodVector,categoryVector)+1)/2;
        const bandit=contextualBanditScore(adaptiveFeedback,mood,selected.category);
        const item=placeFeedbackAdjustment(adaptiveFeedback,mood,selected.id);
        const score=clamp(productionEnsembleScore({
          neuralScore:neural,
          contentScore:content,
          banditScore:bandit.score
        })+item.adjustment);
        return {mood,score:score*100};
      })
      .sort((a,b)=>b.score-a.score);

    const currentItem=placeFeedbackAdjustment(adaptiveFeedback,resultsMood,selected.id);
    return {
      sensitivity:normalized,
      strongest:normalized[0]||null,
      counterfactual:alternatives[0]||null,
      feedbackDelta:currentItem.adjustment*100
    };
  },[selected,resultsMood,adaptiveFeedback]);

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

  function chooseSuggestion(item){
    setCoords({lat:Number(item.lat),lng:Number(item.lng)});
    setLocationLabel(item.fullLabel||[item.label,item.secondary].filter(Boolean).join(', '));
    setManualCity(item.fullLabel||item.label);
    setAccuracy(null);
    setLocationState('ready');
    setSuggestOpen(false);
    setLocationSuggestions([]);
    setError('');
  }

  async function useCity(e){
    e?.preventDefault();
    if(!manualCity.trim())return;
    if(locationSuggestions.length){
      chooseSuggestion(locationSuggestions[0]);
      return;
    }
    try{
      setError('');setLocationState('loading');
      const found=await geocodeCity(manualCity.trim());
      setCoords({lat:found.lat,lng:found.lng});
      setLocationLabel(found.label);
      setAccuracy(null);
      setLocationState('ready');
      setSuggestOpen(false);
    }catch(e){
      setLocationState('error');
      setError(e.message||'Location not found. Try the full building/society name plus neighbourhood and city.');
    }
  }

  function reviewStorageKey(place){
    return 'moodtrip-place-reviews-'+hash([
      place?.name||'place',
      Number(place?.lat||0).toFixed(5),
      Number(place?.lng||0).toFixed(5)
    ].join('|').toLowerCase());
  }

  async function openReviews(place){
    if(!place)return;
    setReviewPlace(place);
    setReviewDraftRating(5);
    setReviewDraftText('');
    setPublicReviews([]);
    setPublicReviewState('loading');

    try{
      const saved=JSON.parse(localStorage.getItem(reviewStorageKey(place))||'[]');
      setLocalReviews(Array.isArray(saved)?saved:[]);
    }catch{
      setLocalReviews([]);
    }

    try{
      const d=await apiJson(
        '/api/moodtrip?action=webreviews&name='+encodeURIComponent(place.name)+
        '&address='+encodeURIComponent(place.address||'')+
        '&lat='+encodeURIComponent(place.lat)+
        '&lng='+encodeURIComponent(place.lng),
        {},
        16000
      );
      setPublicReviews(Array.isArray(d.items)?d.items:[]);
      setPublicReviewState('ready');
    }catch{
      setPublicReviews([]);
      setPublicReviewState('error');
    }
  }

  function submitMoodTripReview(e){
    e?.preventDefault();
    if(!reviewPlace||!reviewDraftText.trim())return;
    const item={
      id:Date.now(),
      rating:reviewDraftRating,
      text:reviewDraftText.trim().slice(0,500),
      createdAt:new Date().toISOString(),
      mood:resultsMood
    };
    const next=[item,...localReviews].slice(0,30);
    setLocalReviews(next);
    setReviewDraftText('');
    try{localStorage.setItem(reviewStorageKey(reviewPlace),JSON.stringify(next))}catch{}
  }


  function inferFinalMoodFast(){
    if(mode==='group')return {mood:majority,vector:groupVector};
    const mood=autoMood&&text.trim()?ruleMood(text,soloMood):soloMood;
    setModelState(autoMood&&text.trim()?'fast':'idle');
    return {mood,vector:MOOD_VECTORS[mood]||MOOD_VECTORS[soloMood]};
  }

  function sortRankedPlaces(list){
    return [...list].sort((a,b)=>{
      const scoreGap=(b.mlScore||0)-(a.mlScore||0);
      const distanceGap=(a.distanceKm||0)-(b.distanceKm||0);

      // Keep the original product promise: distance remains a strong ordering
      // signal unless the learned model is meaningfully more confident.
      if(Math.abs(distanceGap)>1.5&&Math.abs(scoreGap)<8)return distanceGap;
      if(Math.abs(scoreGap)>.25)return scoreGap;
      if(a.rating!=null&&b.rating!=null&&a.rating!==b.rating)return b.rating-a.rating;
      if((a.reviewCount||0)!==(b.reviewCount||0))return (b.reviewCount||0)-(a.reviewCount||0);
      return distanceGap;
    });
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
      const contentScore=(cosine(vector,feature)+1)/2;

      const rankFeatures=buildRankFeatures({
        moodVector:vector,
        categoryVector:feature,
        distanceNorm:distNorm,
        ratingNorm,
        crowdFit:cFit,
        groupMode:mode==='group',
        hour:new Date().getHours()
      });

      const neuralScore=predictDistilledRanker(rankFeatures);
      const bandit=contextualBanditScore(adaptiveFeedback,mood,p.category);
      const itemFeedback=placeFeedbackAdjustment(adaptiveFeedback,mood,p.id);
      const finalScore=clamp(productionEnsembleScore({
        neuralScore,
        contentScore,
        banditScore:bandit.score
      })+itemFeedback.adjustment);

      return {
        ...p,
        distanceKm,
        mlScore:finalScore*100,
        neuralScore:neuralScore*100,
        contentScore:contentScore*100,
        banditScore:bandit.score*100,
        banditMean:bandit.mean*100,
        banditObservations:bandit.observations,
        itemFeedbackState:itemFeedback.state,
        itemFeedbackObservations:itemFeedback.observations,
        itemFeedbackAdjustment:itemFeedback.adjustment*100,
        crowdEstimate:estimate,
        moodFit:contentScore,
        rankFeatures
      };
    }).filter(p=>(MOOD_CATEGORIES[mood]||[]).includes(p.category)||p.moodFit>.76);

    return sortRankedPlaces(enriched).slice(0,12);
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
      setForestState('neural');
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

  function recordPreference(place,positive){
    const categoryKey=feedbackKey(resultsMood,place.category);
    const placeKey='place|'+resultsMood+'|'+place.id;
    const currentCategory=feedback[categoryKey]||{pos:0,neg:0};
    const currentPlace=feedback[placeKey]||{pos:0,neg:0};

    const next={
      ...feedback,
      [categoryKey]:{
        pos:(Number(currentCategory.pos)||0)+(positive?1:0),
        neg:(Number(currentCategory.neg)||0)+(positive?0:1)
      },
      [placeKey]:{
        pos:(Number(currentPlace.pos)||0)+(positive?1:0),
        neg:(Number(currentPlace.neg)||0)+(positive?0:1)
      }
    };

    setFeedback(next);
    try{localStorage.setItem('moodtrip-v3-feedback',JSON.stringify(next))}catch{}

    const combined=mergeFeedbackMaps(globalFeedback,next);
    setPlaces(prev=>sortRankedPlaces(prev.map(p=>{
      const bandit=contextualBanditScore(combined,resultsMood,p.category);
      const item=placeFeedbackAdjustment(combined,resultsMood,p.id);
      const neural=(Number(p.neuralScore)||0)/100;
      const content=(Number(p.contentScore)||Number(p.moodFit)||0)/100;
      const mlScore=clamp(productionEnsembleScore({
        neuralScore:neural,
        contentScore:content,
        banditScore:bandit.score
      })+item.adjustment)*100;
      return {
        ...p,
        mlScore,
        banditScore:bandit.score*100,
        banditMean:bandit.mean*100,
        banditObservations:bandit.observations,
        itemFeedbackState:item.state,
        itemFeedbackObservations:item.observations,
        itemFeedbackAdjustment:item.adjustment*100
      };
    })));

    // Fire-and-forget anonymous global learning. Local personalization is
    // already committed above, so a database outage cannot break the UI.
    if(sessionId){
      apiJson('/api/feedback',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          sessionId,
          mood:resultsMood,
          category:place.category,
          placeId:String(place.id),
          placeName:place.name,
          positive,
          modelScore:place.mlScore,
          neuralScore:place.neuralScore,
          distanceKm:place.distanceKm,
          rating:place.rating,
          groupMode:mode==='group',
          rankFeatures:place.rankFeatures,
          modelVersion:'distilled-nn-v1'
        })
      },5000).then(d=>{
        setFeedbackStorage(prev=>({
          mode:d.storage==='supabase'?'global':'local',
          rows:prev.rows,
          degraded:d.stored===false&&d.configured===true
        }));
      }).catch(()=>setFeedbackStorage(prev=>({...prev,mode:'local',degraded:true})));
    }

    if(!positive&&selectedId===place.id)setSelectedId(null);
  }

  const mapCenter=useMemo(()=>selected?{lat:selected.lat,lng:selected.lng}:coords,[selected,coords]);

  const selectedPlaceQuery=place=>[
    place?.name,
    place?.address,
    Number.isFinite(Number(place?.lat))&&Number.isFinite(Number(place?.lng))
      ? Number(place.lat).toFixed(6)+','+Number(place.lng).toFixed(6)
      : ''
  ].filter(Boolean).join(', ');
  const googleMapsUrl=place=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(selectedPlaceQuery(place))+(place?.googlePlaceId?'&query_place_id='+encodeURIComponent(place.googlePlaceId):'');
  const googleReviewsUrl=place=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(selectedPlaceQuery(place));
  const googleSatelliteUrl=place=>'https://www.google.com/maps/@?api=1&map_action=map&center='+encodeURIComponent(place.lat+','+place.lng)+'&zoom=21&basemap=satellite';
  const googleStreetViewUrl=place=>'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+encodeURIComponent(place.lat+','+place.lng);

  return <main className="mtApp">
    <motion.div className="mtScrollProgress" style={{scaleX:progress}}/>
    <header className="mtNav">
      <a className="mtWordmark" href="/moodtrip"><span>MT</span><b>MoodTrip</b></a>
      <div className="mtNavMeta"><span>{locationState==='ready'?(locationLabel||'LOCATION LOCKED'):'LOCATION NOT SHARED'}</span><button onClick={()=>setHistoryOpen(true)}>HISTORY {String(history.length).padStart(2,'0')}</button></div>
    </header>

    <section className="mtHero">
      {!reduce&&<motion.div className="mtHeroFx" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:1.1}} aria-hidden="true">
        <AeroShards
          backgroundColor="#f2eee7" shardColor="#b69b8c" accentColor="#9a6654"
          placement="full" flow="stream" material="pearl" detail="balanced"
          scale={1} spread={1.1} depth={1} speed={.26} spin={.42}
          interaction="repel" density={.58} shardSize={.72} turbulence={.56}
          glow={.18} edgeSoftness={2} bloom={.1} grain={.025}
          interactionRadius={1.15} interactionStrength={.2} rippleIntensity={.22}
        />
      </motion.div>}
      <div className="mtHeroFxVeil" aria-hidden="true"/>
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
        ['01','TRANSFORMER','deep emotion classification'],
        ['02','K-MEANS','unsupervised vibe clustering'],
        ['03','DISTILLED NN','learned recommendation scoring'],
        ['04','BAYES BANDIT','feedback-driven adaptation']
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
          <div className="mtLocationSearchWrap">
            <form className="mtManualLocation" onSubmit={useCity}>
              <input
                value={manualCity}
                onFocus={()=>setSuggestOpen(true)}
                onChange={e=>{setManualCity(e.target.value);setSuggestOpen(true)}}
                placeholder="Search building, society, street, locality or city"
                autoComplete="off"
              />
              <button>{suggestState==='loading'?'SEARCHING…':'SEARCH'}</button>
            </form>
            <AnimatePresence>
              {suggestOpen&&manualCity.trim().length>=2&&<motion.div className="mtLocationSuggestions" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}>
                {locationSuggestions.map((item,i)=><button type="button" key={item.id+'-'+i} onClick={()=>chooseSuggestion(item)}>
                  <span>{String(i+1).padStart(2,'0')}</span>
                  <div><b>{item.label}</b><small>{item.secondary||item.fullLabel||item.type}</small></div>
                  <em>{String(item.type||'place').replaceAll('_',' ')}</em>
                </button>)}
                {suggestState==='loading'&&<div className="mtSuggestStatus">SEARCHING LOCAL BUILDINGS + ADDRESSES…</div>}
                {suggestState==='ready'&&!locationSuggestions.length&&<div className="mtSuggestStatus">NO EXACT MATCH YET — TRY THE FULL NAME + NEIGHBOURHOOD + CITY</div>}
              </motion.div>}
            </AnimatePresence>
          </div>
          <p className="mtFinePrint">Search now checks named buildings, societies, streets, neighbourhoods and POIs—not only major landmarks. Exact coordinates stay in this browser session.</p>
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
          ['SUITABILITY','Distilled Neural Ranker','22 contextual features',forestState==='neural'?'NN ACTIVE':'READY'],
          ['FINAL ORDER','Adaptive Ensemble','neural + content + bandit',provider.toUpperCase()]
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
            {mapCenter&&<InteractiveMap center={mapCenter} places={places} selectedId={selected?.id} onSelect={setSelectedId}/>}
            <div className="mtMapFooter">
              <span>{selected?.distanceKm.toFixed(1)} KM AWAY</span>
              <div>
                <a href={selected?googleSatelliteUrl(selected):'#'} target="_blank" rel="noreferrer">GOOGLE SATELLITE ↗</a>
                <a href={selected?googleStreetViewUrl(selected):'#'} target="_blank" rel="noreferrer">STREET VIEW ↗</a>
                <a href={selected?googleMapsUrl(selected):'#'} target="_blank" rel="noreferrer">MAPS ↗</a>
              </div>
            </div>
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
                  <span><b>{Math.round(p.neuralScore||0)}%</b> neural</span>
                  <span><b>{Math.round(p.banditMean||50)}%</b> learned preference</span>
                  <span><b>{p.banditObservations||0}</b> category samples</span>
                  <span><b>{p.itemFeedbackObservations||0}</b> place samples</span>
                  <span><b>{p.crowdEstimate}</b> crowd proxy</span>
                </div>
              </div>
              <div className="mtPlaceActions">
                <button className={p.itemFeedbackState==='positive'?'activeFeedback':''} onClick={e=>{e.stopPropagation();recordPreference(p,true)}}>{p.itemFeedbackState==='positive'?'GOOD PICK ✓':'GOOD PICK +'}</button>
                <button className={'negative '+(p.itemFeedbackState==='negative'?'activeFeedback':'')} onClick={e=>{e.stopPropagation();recordPreference(p,false)}}>{p.itemFeedbackState==='negative'?'NOT FOR ME ✓':'NOT FOR ME −'}</button>
                <button onClick={e=>{e.stopPropagation();openReviews(p)}}>REVIEWS ↗</button>
                <a onClick={e=>e.stopPropagation()} href={googleMapsUrl(p)} target="_blank" rel="noreferrer">MAPS ↗</a>
              </div>
            </motion.article>)}
          </div>
        </div>

        {selected&&selectedExplanation&&<section className="mtExplainAI">
          <div className="mtExplainHead">
            <div>
              <span>EXPLAINABLE AI / SELECTED PLACE</span>
              <h3>Why did the model choose <em>{selected.name}</em>?</h3>
              <p>This explanation uses Integrated Gradients directly through the distilled neural network. Feature attributions are integrated from a neutral contextual baseline to the selected recommendation, then grouped into human-readable signals.</p>
            </div>
            <div className="mtExplainScore">
              <strong>{Math.round(selected.mlScore)}%</strong>
              <span>FINAL FIT</span>
            </div>
          </div>

          <div className="mtExplainGrid">
            <div className="mtExplainFactors">
              {selectedExplanation.sensitivity.slice(0,6).map(factor=><div className="mtExplainFactor" key={factor.id}>
                <div><span>{factor.label.toUpperCase()}</span><b>{factor.delta>=0?'+':''}{(factor.delta*100).toFixed(1)} pts</b></div>
                <i><motion.em
                  initial={{scaleX:0}}
                  whileInView={{scaleX:Math.max(.08,factor.strength)}}
                  viewport={{once:true}}
                  transition={{duration:.65}}
                  className={factor.delta>=0?'positive':'negative'}
                /></i>
              </div>)}
            </div>

            <div className="mtExplainDecision">
              <div>
                <span>STRONGEST LOCAL SIGNAL</span>
                <b>{selectedExplanation.strongest?.label||'Context'}</b>
                <small>{selectedExplanation.strongest?.delta>=0?'helped':'reduced'} the neural score by about {Math.abs((selectedExplanation.strongest?.delta||0)*100).toFixed(1)} points.</small>
              </div>
              <div>
                <span>ONLINE LEARNING</span>
                <b>{selected.itemFeedbackState==='negative'?'PLACE DEMOTED':selected.itemFeedbackState==='positive'?'PLACE BOOSTED':'NO ITEM FEEDBACK YET'}</b>
                <small>{selectedExplanation.feedbackDelta?((selectedExplanation.feedbackDelta>0?'+':'')+selectedExplanation.feedbackDelta.toFixed(1)+' points from exact-place feedback'):'Good Pick / Not For Me will adapt this exact recommendation instantly.'}</small>
              </div>
              <div>
                <span>COUNTERFACTUAL</span>
                <b>{selectedExplanation.counterfactual?selectedExplanation.counterfactual.mood.toUpperCase():'—'}</b>
                <small>{selectedExplanation.counterfactual?'Holding distance, rating, crowd and time constant, this place would score '+Math.round(selectedExplanation.counterfactual.score)+'% for that mood.':'No alternate mood available.'}</small>
              </div>
            </div>
          </div>
        </section>}

        {provider==='OpenStreetMap'&&<div className="mtProviderNotice"><span>REVIEW DATA</span><p>MoodTrip uses live open map sources for nearby discovery and does not invent ratings. Open <b>Reviews</b> on any result to see public web review snippets when available, MoodTrip community reviews, and a Google Reviews link for that exact selected place.</p></div>}
      </>:<div className="mtEmptyResults"><span>03</span><h3>Share a location, choose the mood, then run the pipeline.</h3><p>The page will query live nearby places rather than showing a fixed Jaipur demo list.</p></div>}
    </section>

    <section className="mtDataScience">
      <div className="mtSectionHead">
        <p className="mtEyebrow">04 / DATA SCIENCE LAYER</p>
        <h2>The app gets better<br/><em>than “happy = café.”</em></h2>
      </div>
      <div className="mtDSGrid">
        {[
          ['A','DEEP EMOTION','A quantized RoBERTa emotion model runs on demand for richer text emotion inference, while explicit mood selection remains available.'],
          ['B','DISTILLED NEURAL RANKER','A 22-feature browser MLP is distilled from a teacher ensemble trained with Random Forest, XGBoost and a larger neural recommender.'],
          ['C','UNSUPERVISED VIBES','K-Means groups nearby candidates by atmosphere features before supervised ranking, giving the system a real unsupervised representation layer.'],
          ['D','CONTEXTUAL FEATURES','Mood vector, place vector, normalized distance, rating, crowd fit, group state and cyclic time features all enter the learned ranker.'],
          ['E','BAYESIAN FEEDBACK','Good Pick / Not For Me signals update a mood×category Beta posterior. The posterior immediately changes ranking on this device.'],
          ['F','EVALUATION HARNESS','Rule-based, content-based, Random Forest, XGBoost, neural and distilled models are compared with Precision@5, Recall@5, NDCG@5, MAE and latency.']
        ].map(([n,t,p],i)=><PopWindow key={t} className="mtDSCard" delay={i*.04}><span>{n}</span><h3>{t}</h3><p>{p}</p></PopWindow>)}
      </div>
    </section>

    <section className="mtEvaluation" id="ml-benchmark">
      <div className="mtSectionHead">
        <p className="mtEyebrow">05 / ML EVALUATION LAB</p>
        <h2>Not just a model.<br/><em>A measured recommender.</em></h2>
      </div>

      <div className="mtEvalIntro">
        <div>
          <span>OFFLINE RANKING BENCHMARK</span>
          <b>{Intl.NumberFormat().format(ML_META.samples)} candidate rows · {Intl.NumberFormat().format(ML_META.training_sessions)} sessions</b>
          <p>The ranking benchmark is a deterministic controlled preference simulation generated by the training pipeline. It is useful for model comparison, but it is not presented as real-world user-study evidence.</p>
        </div>
        <div className="mtEvalStats">
          <div><strong>{ML_BENCHMARK['Production Distilled NN'].ndcg_at_5.toFixed(3)}</strong><span>NDCG@5<br/>PRODUCTION NN</span></div>
          <div><strong>{MOOD_TEXT_BENCHMARK.macro_f1.toFixed(3)}</strong><span>MACRO F1<br/>TEXT BASELINE</span></div>
          <div><strong>{feedbackSignals}</strong><span>LOCAL SIGNALS<br/>THIS DEVICE</span></div>
          <div><strong>{feedbackStorage.mode==='global'?globalFeedbackSignals:'—'}</strong><span>{feedbackStorage.mode==='global'?'GLOBAL SIGNALS':'LOCAL FALLBACK'}<br/>{feedbackStorage.degraded?'DEGRADED':'ONLINE LEARNING'}</span></div>
        </div>
      </div>

      <div className="mtBenchmarkTable">
        <div className="mtBenchmarkRow head">
          <span>MODEL</span><span>P@5</span><span>R@5</span><span>NDCG@5</span><span>MAE</span><span>MS / 1K</span>
        </div>
        {Object.entries(ML_BENCHMARK).map(([name,m])=><div
          key={name}
          className={'mtBenchmarkRow '+(name==='Production Distilled NN'?'production':'')}
        >
          <span><b>{name}</b>{name==='Production Distilled NN'&&<small>LIVE</small>}</span>
          <span>{m.precision_at_5.toFixed(3)}</span>
          <span>{m.recall_at_5.toFixed(3)}</span>
          <span>{m.ndcg_at_5.toFixed(3)}</span>
          <span>{m.mae.toFixed(3)}</span>
          <span>{m.latency_ms_per_1000.toFixed(2)}</span>
        </div>)}
      </div>

      <div className="mtDistillDiagram">
        <div><span>TEACHER 01</span><b>NEURAL</b><small>65%</small></div>
        <i>+</i>
        <div><span>TEACHER 02</span><b>RANDOM FOREST</b><small>20%</small></div>
        <i>+</i>
        <div><span>TEACHER 03</span><b>XGBOOST</b><small>15%</small></div>
        <i>→</i>
        <div className="student"><span>PRODUCTION</span><b>16×8 MLP</b><small>DISTILLED</small></div>
      </div>

      <div className="mtBenchmarkNote">
        <span>TEXT BENCHMARK</span>
        <p>{MOOD_TEXT_BENCHMARK.model} reaches <b>{(MOOD_TEXT_BENCHMARK.macro_f1*100).toFixed(1)}% macro-F1</b> on a {MOOD_TEXT_BENCHMARK.holdout}-phrase holdout from a curated {MOOD_TEXT_BENCHMARK.samples}-phrase, 12-mood benchmark. The on-demand RoBERTa model remains the deeper production text path.</p>
      </div>
    </section>

    <footer className="mtFooter">
      <div><b>MT</b><span>MoodTrip</span></div>
      <p>MOOD → LOCATION → VIBE → RANK → GO</p>
      <a href="/">DIVYANSH SINGH / PORTFOLIO ↗</a>
    </footer>

    <AnimatePresence>
      {reviewPlace&&<>
        <motion.button className="mtHistoryScrim" aria-label="Close reviews" onClick={()=>setReviewPlace(null)} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}/>
        <motion.aside className="mtReviewSheet" initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}} transition={{type:'spring',stiffness:190,damping:26}}>
          <div className="mtReviewHead">
            <div><span>REVIEWS / SELECTED PLACE</span><h3>{reviewPlace.name}</h3><p>{reviewPlace.address||[reviewPlace.lat,reviewPlace.lng].join(', ')}</p></div>
            <button onClick={()=>setReviewPlace(null)}>×</button>
          </div>

          <section className="mtPublicReviews">
            <div className="mtPublicReviewTitle">
              <div><span>PUBLIC REVIEWS</span><h4>What people are saying elsewhere.</h4></div>
              <b>{publicReviewState==='loading'?'SEARCHING…':publicReviews.length?publicReviews.length+' REVIEWS':'LIVE SEARCH'}</b>
            </div>

            {publicReviewState==='loading'&&<div className="mtPublicReviewLoading"><i/><span>CHECKING PUBLIC REVIEW SOURCES…</span></div>}

            {publicReviewState!=='loading'&&publicReviews.length>0&&<>
              <div className="mtPublicAggregate">
                <strong>{publicReviews[0]?.sourceRating?Number(publicReviews[0].sourceRating).toFixed(1):'—'}</strong>
                <div>
                  <span>{publicReviews[0]?.sourceRating?'★':'☆'} PUBLIC RATING</span>
                  <b>{publicReviews[0]?.reviewCount?Intl.NumberFormat().format(publicReviews[0].reviewCount)+' RATINGS':'PUBLIC REVIEW DATA'}</b>
                  <small>via {publicReviews[0]?.source||'public source'} · matched to this selected place</small>
                </div>
              </div>
              <div className="mtPublicReviewList">
              {publicReviews.map((r,i)=><article key={r.url+i}>
                <div><span>{r.source}</span><b>0{Math.min(i+1,9)}</b></div>
                <h5>{r.title}</h5>
                <p>{r.snippet.length>280?r.snippet.slice(0,277)+'…':r.snippet}</p>
                <a href={r.url} target="_blank" rel="noreferrer">READ ON {r.source} ↗</a>
              </article>)}
            </div>
            </>}

            {publicReviewState==='ready'&&!publicReviews.length&&<div className="mtPublicReviewEmpty compact">
              <span>EXACT-BRANCH CHECK COMPLETE</span>
              <p>No verified public excerpt was exposed for this branch, so MoodTrip is intentionally not borrowing a review from another location. The exact Google link remains below.</p>
            </div>}
            {publicReviewState==='error'&&<div className="mtPublicReviewEmpty compact error">
              <span>PUBLIC REVIEW SOURCE SLOW</span>
              <p>External review lookup did not answer in time. The selected place and its exact Google review link are unchanged.</p>
            </div>}
          </section>

          <div className="mtCommunityRating">
            <div>
              <strong>{localReviews.length?(localReviews.reduce((sum,r)=>sum+r.rating,0)/localReviews.length).toFixed(1):'—'}</strong>
              <span>{localReviews.length?'★':'☆'}</span>
            </div>
            <p><b>{localReviews.length}</b> MoodTrip review{localReviews.length===1?'':'s'}<small>Saved on this device</small></p>
          </div>

          <form className="mtReviewComposer" onSubmit={submitMoodTripReview}>
            <div className="mtComposerTop"><span>ADD YOUR REVIEW</span><b>{reviewDraftRating}/5</b></div>
            <div className="mtStarInput" role="radiogroup" aria-label="Rating">
              {[1,2,3,4,5].map(n=><button type="button" key={n} className={n<=reviewDraftRating?'active':''} onClick={()=>setReviewDraftRating(n)} aria-label={n+' stars'}>★</button>)}
            </div>
            <textarea value={reviewDraftText} onChange={e=>setReviewDraftText(e.target.value)} placeholder="What was this place actually like? Crowd, vibe, food, comfort, noise, safety, service…"/>
            <button className="mtSubmitReview" disabled={!reviewDraftText.trim()}>POST MOODTRIP REVIEW ↗</button>
          </form>

          <div className="mtCommunityReviewList">
            {localReviews.length?localReviews.map(r=><article key={r.id}>
              <div><span>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</span><small>{new Date(r.createdAt).toLocaleDateString()}</small></div>
              <p>{r.text}</p>
              <b>{String(r.mood||'visit').toUpperCase()} VISIT</b>
            </article>):<div className="mtNoCommunityReviews">
              <span>NO MOODTRIP REVIEWS YET</span>
              <h4>Be the first to leave one.</h4>
              <p>This section contains only reviews written inside MoodTrip. It does not copy or invent reviews from other websites.</p>
            </div>}
          </div>

          <div className="mtExternalReviews">
            <span>EXTERNAL REVIEWS</span>
            <p>Want the latest public Google rating and comments for this place?</p>
            <a href={googleReviewsUrl(reviewPlace)} target="_blank" rel="noreferrer">SEE GOOGLE REVIEWS FOR {reviewPlace.name.toUpperCase()} ↗</a>
          </div>
        </motion.aside>
      </>}
    </AnimatePresence>

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

// MoodTrip public reviews: selected-place sync
