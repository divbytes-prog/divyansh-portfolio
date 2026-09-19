const USER_AGENT='MoodTrip/2.0 (portfolio project; contact: 24DCS032@lnmiit.ac.in)';

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

export default async function handler(req,res){
  if(req.method!=='GET')return send(res,405,{error:'Method not allowed'},0);

  const action=String(req.query.action||'');
  const headers={
    'User-Agent':USER_AGENT,
    'Accept':'application/json',
    'Accept-Language':'en'
  };

  try{
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
      const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(q);
      const data=await fetchJson(url,{headers},5000);
      if(!data?.[0])return send(res,404,{error:'Location not found'},0);
      return send(res,200,{
        lat:Number(data[0].lat),
        lng:Number(data[0].lon),
        label:String(data[0].display_name||q).split(',').slice(0,2).join(', ')
      },300);
    }

    if(action==='places'){
      const lat=num(req.query.lat,-90,90);
      const lng=num(req.query.lng,-180,180);
      const radiusKm=num(req.query.radiusKm,1,20);
      const mood=String(req.query.mood||'happy').toLowerCase();
      if(lat===null||lng===null||radiusKm===null)return send(res,400,{error:'Invalid place-search parameters'},0);

      // Fast-first search. Most useful places should be near the user, so the first pass
      // intentionally caps the expensive Overpass radius. The UI can still sort all returned
      // results by exact haversine distance.
      const effectiveRadiusKm=Math.min(radiusKm,8);
      const radius=Math.round(effectiveRadiusKm*1000);
      const categories=(MOOD_CATEGORIES[mood]||MOOD_CATEGORIES.happy).slice(0,5);
      const blocks=categories
        .map(category=>'nwr(around:'+radius+','+lat+','+lng+')'+CATEGORY_TAGS[category]+';')
        .join('');
      const query='[out:json][timeout:7][maxsize:33554432];('+blocks+');out center 100;';
      const body=new URLSearchParams({data:query}).toString();
      const providers=[
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter'
      ];

      const jobs=providers.map(provider=>fetchJson(provider,{
        method:'POST',
        headers:{...headers,'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body
      },7500).then(data=>{
        if(!Array.isArray(data?.elements))throw new Error('Invalid Overpass payload');
        return {data,provider:new URL(provider).hostname};
      }));

      let winner;
      try{
        winner=await Promise.any(jobs);
      }catch{
        return send(res,502,{error:'Nearby place providers are busy. Please retry in a few seconds.'},0);
      }

      return send(res,200,{
        elements:winner.data.elements,
        provider:winner.provider,
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
