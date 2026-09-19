const USER_AGENT='MoodTrip/3.0 (portfolio project; contact: 24DCS032@lnmiit.ac.in)';

const CATEGORY_TAGS={
  cafe:'["amenity"="cafe"]',
  restaurant:'["amenity"="restaurant"]',
  cinema:'["amenity"="cinema"]',
  library:'["amenity"="library"]',
  park:'["leisure"="park"]',
  garden:'["leisure"="garden"]',
  viewpoint:'["tourism"="viewpoint"]',
  museum:'["tourism"="museum"]',
  gallery:'["tourism"="gallery"]',
  arcade:'["leisure"~"amusement_arcade|bowling_alley"]',
  sports:'["leisure"~"sports_centre|fitness_centre"]',
  mall:'["shop"="mall"]',
  attraction:'["tourism"="attraction"]',
  historic:'["historic"]',
  playground:'["leisure"="playground"]'
};

const CATEGORY_QUERY={
  cafe:'cafe',
  restaurant:'restaurant',
  cinema:'cinema',
  library:'library',
  park:'park',
  garden:'garden',
  viewpoint:'viewpoint',
  museum:'museum',
  gallery:'art gallery',
  arcade:'arcade',
  sports:'sports centre',
  mall:'shopping mall',
  attraction:'tourist attraction',
  historic:'historic place',
  playground:'playground'
};

const MOOD_CATEGORIES={
  happy:['cafe','arcade','mall','restaurant','cinema'],
  sad:['park','garden','library','viewpoint','cafe'],
  stressed:['park','garden','library','viewpoint'],
  energetic:['sports','arcade','playground','park','attraction'],
  bored:['arcade','cinema','museum','mall','cafe'],
  romantic:['cafe','restaurant','garden','viewpoint','park'],
  curious:['museum','gallery','historic','attraction','library'],
  peaceful:['park','garden','library','viewpoint'],
  social:['cafe','restaurant','mall','arcade','cinema'],
  adventurous:['viewpoint','sports','attraction','park','historic'],
  lonely:['library','park','garden','cafe','viewpoint'],
  angry:['sports','park','viewpoint','garden']
};

function num(value,min,max){
  const n=Number(value);
  return Number.isFinite(n)&&n>=min&&n<=max?n:null;
}

async function fetchJson(url,options={},timeout=7000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(url,{...options,signal:controller.signal});
    if(!r.ok)throw new Error('Upstream '+r.status);
    return await r.json();
  }finally{
    clearTimeout(timer);
  }
}

function send(res,status,payload,ttl=90){
  res.status(status);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','s-maxage='+ttl+', stale-while-revalidate=600');
  return res.end(JSON.stringify(payload));
}

function tagsForCategory(category,name){
  const tags={name};
  if(['cafe','restaurant','cinema','library'].includes(category))tags.amenity=category;
  else if(['park','garden','sports','arcade','playground'].includes(category)){
    const map={sports:'sports_centre',arcade:'amusement_arcade'};
    tags.leisure=map[category]||category;
  }else if(['viewpoint','museum','gallery','attraction'].includes(category))tags.tourism=category;
  else if(category==='mall')tags.shop='mall';
  else if(category==='historic')tags.historic='yes';
  return tags;
}

function haversineKm(a,b){
  const R=6371;
  const dLat=(b.lat-a.lat)*Math.PI/180;
  const dLon=(b.lng-a.lng)*Math.PI/180;
  const x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}

function dedupeAndSort(elements,center,limit=120){
  const seen=new Set();
  return elements.filter(el=>{
    const lat=Number(el.lat??el.center?.lat),lon=Number(el.lon??el.center?.lon);
    const name=el.tags?.name||el.tags?.['name:en'];
    if(!name||!Number.isFinite(lat)||!Number.isFinite(lon))return false;
    const key=(name+'|'+lat.toFixed(4)+'|'+lon.toFixed(4)).toLowerCase();
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  }).sort((a,b)=>{
    const aa={lat:Number(a.lat??a.center?.lat),lng:Number(a.lon??a.center?.lon)};
    const bb={lat:Number(b.lat??b.center?.lat),lng:Number(b.lon??b.center?.lon)};
    return haversineKm(center,aa)-haversineKm(center,bb);
  }).slice(0,limit);
}

async function searchOverpass(lat,lng,radiusKm,categories,headers){
  const radius=Math.round(radiusKm*1000);
  const blocks=categories.map(category=>'nwr(around:'+radius+','+lat+','+lng+')'+CATEGORY_TAGS[category]+';').join('');
  const query='[out:json][timeout:6][maxsize:25165824];('+blocks+');out center 120;';
  const body=new URLSearchParams({data:query}).toString();

  const providers=[
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];

  const jobs=providers.map(provider=>fetchJson(provider,{
    method:'POST',
    headers:{...headers,'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
    body
  },6500).then(data=>{
    if(!Array.isArray(data?.elements)||!data.elements.length)throw new Error('Empty Overpass result');
    return {elements:data.elements,provider:new URL(provider).hostname};
  }));

  return Promise.any(jobs);
}

async function searchPhoton(lat,lng,radiusKm,categories,headers){
  const chosen=categories.slice(0,4);
  const jobs=chosen.map(async(category)=>{
    const q=CATEGORY_QUERY[category]||category;
    const url='https://photon.komoot.io/api/?limit=12&lang=en&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lng)+'&q='+encodeURIComponent(q);
    const data=await fetchJson(url,{headers},4500);
    return (data.features||[]).map((f,i)=>{
      const coords=f.geometry?.coordinates||[];
      const p=f.properties||{};
      const plon=Number(coords[0]),plat=Number(coords[1]);
      if(!Number.isFinite(plat)||!Number.isFinite(plon))return null;
      if(haversineKm({lat,lng},{lat:plat,lng:plon})>Math.max(radiusKm,3)*1.35)return null;
      const name=p.name||p.street||p.city;
      if(!name)return null;
      const tags=tagsForCategory(category,name);
      if(p.street)tags['addr:street']=p.street;
      if(p.city)tags['addr:city']=p.city;
      return {type:'node',id:'photon-'+category+'-'+(p.osm_id||i),lat:plat,lon:plon,tags};
    }).filter(Boolean);
  });
  const groups=await Promise.allSettled(jobs);
  const elements=groups.flatMap(g=>g.status==='fulfilled'?g.value:[]);
  if(!elements.length)throw new Error('Photon empty');
  return {elements,provider:'photon.komoot.io'};
}

function viewbox(lat,lng,radiusKm){
  const latDelta=radiusKm/111;
  const lngDelta=radiusKm/(111*Math.max(.2,Math.cos(lat*Math.PI/180)));
  return [lng-lngDelta,lat+latDelta,lng+lngDelta,lat-latDelta].join(',');
}

async function searchNominatim(lat,lng,radiusKm,categories,headers){
  const box=viewbox(lat,lng,Math.min(radiusKm,8));
  const chosen=categories.slice(0,3);
  const elements=[];
  for(const category of chosen){
    try{
      const q=CATEGORY_QUERY[category]||category;
      const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&bounded=1&viewbox='+encodeURIComponent(box)+'&q='+encodeURIComponent(q);
      const data=await fetchJson(url,{headers},3800);
      (data||[]).forEach((p,i)=>{
        const plat=Number(p.lat),plon=Number(p.lon);
        if(!Number.isFinite(plat)||!Number.isFinite(plon))return;
        const name=String(p.display_name||'').split(',')[0]||q;
        const tags=tagsForCategory(category,name);
        const parts=String(p.display_name||'').split(',').map(x=>x.trim()).filter(Boolean);
        if(parts[1])tags['addr:street']=parts[1];
        elements.push({type:'node',id:'nom-'+category+'-'+(p.osm_id||i),lat:plat,lon:plon,tags});
      });
    }catch{}
  }
  if(!elements.length)throw new Error('Nominatim empty');
  return {elements,provider:'nominatim.openstreetmap.org'};
}


function cleanLabel(display){
  return String(display||'').split(',').map(x=>x.trim()).filter(Boolean);
}

function suggestionKey(item){
  return (item.label+'|'+Number(item.lat).toFixed(5)+'|'+Number(item.lng).toFixed(5)).toLowerCase();
}

function suggestionDistanceBias(item,bias){
  if(!bias)return 0;
  const d=haversineKm(bias,{lat:item.lat,lng:item.lng});
  return Math.max(0,30-d);
}

async function searchAddressSuggestions(q,lat,lng,headers){
  const bias=Number.isFinite(lat)&&Number.isFinite(lng)?{lat,lng}:null;
  const nomQueries=[
    q,
    q+', India'
  ];

  const nomJobs=nomQueries.map(query=>{
    const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=12&addressdetails=1&namedetails=1&extratags=1&countrycodes=in&q='+encodeURIComponent(query);
    return fetchJson(url,{headers},4800).catch(()=>[]);
  });

  const photonUrl='https://photon.komoot.io/api/?limit=12&lang=en&q='+encodeURIComponent(q)
    +(bias?'&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lng):'');
  const photonJob=fetchJson(photonUrl,{headers},4500).catch(()=>({features:[]}));

  const [nomA,nomB,photon]=await Promise.all([nomJobs[0],nomJobs[1],photonJob]);
  const items=[];

  [...(nomA||[]),...(nomB||[])].forEach(p=>{
    const latN=Number(p.lat),lngN=Number(p.lon);
    if(!Number.isFinite(latN)||!Number.isFinite(lngN))return;
    const parts=cleanLabel(p.display_name);
    items.push({
      id:'nom-'+(p.osm_type||'x')+'-'+(p.osm_id||Math.random()),
      label:parts[0]||q,
      secondary:parts.slice(1,5).join(', '),
      fullLabel:parts.slice(0,7).join(', '),
      lat:latN,lng:lngN,
      type:p.addresstype||p.type||p.category||'place',
      osmType:p.osm_type||null,
      osmId:p.osm_id||null,
      bbox:Array.isArray(p.boundingbox)?p.boundingbox.map(Number):null,
      source:'Nominatim',
      importance:Number(p.importance)||0
    });
  });

  (photon?.features||[]).forEach((f,i)=>{
    const c=f.geometry?.coordinates||[];
    const p=f.properties||{};
    const lngN=Number(c[0]),latN=Number(c[1]);
    if(!Number.isFinite(latN)||!Number.isFinite(lngN))return;
    const full=[p.name,p.street,p.district,p.city,p.state,p.country].filter(Boolean);
    items.push({
      id:'pho-'+(p.osm_type||'x')+'-'+(p.osm_id||i),
      label:p.name||p.street||p.city||q,
      secondary:[p.street,p.district,p.city,p.state].filter(Boolean).join(', '),
      fullLabel:full.join(', '),
      lat:latN,lng:lngN,
      type:p.type||p.osm_value||p.osm_key||'place',
      osmType:p.osm_type||null,
      osmId:p.osm_id||null,
      bbox:null,
      source:'Photon',
      importance:.15
    });
  });

  const deduped=new Map();
  items.forEach(item=>{
    const key=suggestionKey(item);
    const score=(item.importance||0)*100+suggestionDistanceBias(item,bias)
      +(String(item.fullLabel||'').toLowerCase().includes(q.toLowerCase())?18:0);
    const prev=deduped.get(key);
    if(!prev||score>prev._score)deduped.set(key,{...item,_score:score});
  });

  return [...deduped.values()]
    .sort((a,b)=>b._score-a._score)
    .slice(0,12)
    .map(({_score,...item})=>item);
}

async function googleReviews(name,lat,lng){
  const key=process.env.GOOGLE_MAPS_API_KEY||process.env.GOOGLE_PLACES_API_KEY;
  const mapsUrl='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(name+(Number.isFinite(lat)&&Number.isFinite(lng)?(' '+lat+','+lng):''));
  if(!key)return {configured:false,mapsUrl};

  const searchBody={
    textQuery:name,
    languageCode:'en'
  };
  if(Number.isFinite(lat)&&Number.isFinite(lng)){
    searchBody.locationBias={circle:{center:{latitude:lat,longitude:lng},radius:1800}};
  }

  const search=await fetchJson('https://places.googleapis.com/v1/places:searchText',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'X-Goog-Api-Key':key,
      'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri'
    },
    body:JSON.stringify(searchBody)
  },6500);

  const candidates=search?.places||[];
  if(!candidates.length)return {configured:true,found:false,mapsUrl};

  let place=candidates[0];
  if(Number.isFinite(lat)&&Number.isFinite(lng)){
    place=[...candidates].sort((a,b)=>{
      const da=a.location?haversineKm({lat,lng},{lat:a.location.latitude,lng:a.location.longitude}):999;
      const db=b.location?haversineKm({lat,lng},{lat:b.location.latitude,lng:b.location.longitude}):999;
      return da-db;
    })[0];
  }

  const detail=await fetchJson('https://places.googleapis.com/v1/places/'+encodeURIComponent(place.id),{
    headers:{
      'X-Goog-Api-Key':key,
      'X-Goog-FieldMask':'id,displayName,formattedAddress,rating,userRatingCount,reviews,googleMapsUri,primaryTypeDisplayName'
    }
  },6500);

  return {
    configured:true,
    found:true,
    placeId:detail.id,
    name:detail.displayName?.text||name,
    address:detail.formattedAddress||'',
    rating:detail.rating||null,
    ratingCount:detail.userRatingCount||0,
    type:detail.primaryTypeDisplayName?.text||'',
    mapsUrl:detail.googleMapsUri||mapsUrl,
    reviews:(detail.reviews||[]).slice(0,5).map(r=>({
      author:r.authorAttribution?.displayName||'Google user',
      authorUri:r.authorAttribution?.uri||null,
      photoUri:r.authorAttribution?.photoUri||null,
      rating:r.rating||null,
      relativeTime:r.relativePublishTimeDescription||'',
      text:r.text?.text||r.originalText?.text||''
    }))
  };
}

export default async function handler(req,res){
  if(req.method!=='GET')return send(res,405,{error:'Method not allowed'},0);

  const action=String(req.query.action||'');
  const headers={
    'User-Agent':USER_AGENT,
    'Accept':'application/json',
    'Accept-Language':'en'
  };

  try{
    if(action==='suggest'){
      const q=String(req.query.q||'').trim().slice(0,180);
      const lat=num(req.query.lat,-90,90);
      const lng=num(req.query.lng,-180,180);
      if(q.length<2)return send(res,200,{items:[]},15);
      const items=await searchAddressSuggestions(q,lat,lng,headers);
      return send(res,200,{items},60);
    }

    if(action==='reviews'){
      const name=String(req.query.name||'').trim().slice(0,180);
      const lat=num(req.query.lat,-90,90);
      const lng=num(req.query.lng,-180,180);
      if(!name)return send(res,400,{error:'Place name is required'},0);
      try{
        const data=await googleReviews(name,lat,lng);
        return send(res,200,data,data.configured?120:30);
      }catch(e){
        console.error('Google review lookup failed',e);
        const mapsUrl='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(name);
        return send(res,200,{configured:true,found:false,mapsUrl,error:'Google review lookup is temporarily unavailable.'},30);
      }
    }

    if(action==='reverse'){
      const lat=num(req.query.lat,-90,90);
      const lng=num(req.query.lng,-180,180);
      if(lat===null||lng===null)return send(res,400,{error:'Invalid coordinates'},0);
      try{
        const url='https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lng);
        const data=await fetchJson(url,{headers},4200);
        const a=data.address||{};
        const label=[a.city||a.town||a.village||a.county,a.state].filter(Boolean).join(', ')||'Current area';
        return send(res,200,{label},300);
      }catch{
        return send(res,200,{label:'Current area'},60);
      }
    }

    if(action==='geocode'){
      const q=String(req.query.q||'').trim().slice(0,160);
      if(!q)return send(res,400,{error:'Location is required'},0);
      try{
        const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(q);
        const data=await fetchJson(url,{headers},4800);
        if(data?.[0])return send(res,200,{
          lat:Number(data[0].lat),
          lng:Number(data[0].lon),
          label:String(data[0].display_name||q).split(',').slice(0,2).join(', ')
        },300);
      }catch{}
      const photon=await fetchJson('https://photon.komoot.io/api/?limit=1&lang=en&q='+encodeURIComponent(q),{headers},4500);
      const f=photon.features?.[0];
      if(!f)return send(res,404,{error:'Location not found'},0);
      return send(res,200,{
        lat:Number(f.geometry.coordinates[1]),
        lng:Number(f.geometry.coordinates[0]),
        label:[f.properties?.name,f.properties?.city].filter(Boolean).join(', ')||q
      },300);
    }

    if(action==='places'){
      const lat=num(req.query.lat,-90,90);
      const lng=num(req.query.lng,-180,180);
      const radiusKm=num(req.query.radiusKm,1,20);
      const mood=String(req.query.mood||'happy').toLowerCase();
      if(lat===null||lng===null||radiusKm===null)return send(res,400,{error:'Invalid place-search parameters'},0);

      const effectiveRadiusKm=Math.min(radiusKm,8);
      const categories=(MOOD_CATEGORIES[mood]||MOOD_CATEGORIES.happy).slice(0,5);
      const center={lat,lng};

      let result=null;
      try{
        result=await searchOverpass(lat,lng,effectiveRadiusKm,categories,headers);
      }catch(overpassError){
        console.warn('MoodTrip Overpass unavailable:',overpassError?.message);
      }

      if(!result){
        try{
          result=await searchPhoton(lat,lng,effectiveRadiusKm,categories,headers);
        }catch(photonError){
          console.warn('MoodTrip Photon unavailable:',photonError?.message);
        }
      }

      if(!result){
        try{
          result=await searchNominatim(lat,lng,effectiveRadiusKm,categories,headers);
        }catch(nominatimError){
          console.warn('MoodTrip Nominatim unavailable:',nominatimError?.message);
        }
      }

      if(!result){
        return send(res,503,{error:'Live place sources are temporarily unavailable. Please retry shortly.'},0);
      }

      const elements=dedupeAndSort(result.elements,center,120);
      if(!elements.length)return send(res,200,{
        elements:[],
        provider:result.provider,
        effectiveRadiusKm,
        requestedRadiusKm:radiusKm,
        mood,
        categories
      },90);

      return send(res,200,{
        elements,
        provider:result.provider,
        effectiveRadiusKm,
        requestedRadiusKm:radiusKm,
        mood,
        categories
      },180);
    }

    return send(res,400,{error:'Unknown action'},0);
  }catch(e){
    console.error('MoodTrip API error',e);
    return send(res,502,{error:'The map service did not respond quickly enough. Please retry.'},0);
  }
}
