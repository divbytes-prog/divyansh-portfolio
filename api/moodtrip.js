const USER_AGENT='MoodTrip/1.0 (portfolio project; contact: 24DCS032@lnmiit.ac.in)';

function num(value,min,max){
  const n=Number(value);
  return Number.isFinite(n)&&n>=min&&n<=max?n:null;
}

async function fetchJson(url,options={},timeout=12000){
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

function send(res,status,payload){
  res.status(status);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=300');
  return res.end(JSON.stringify(payload));
}

export default async function handler(req,res){
  if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});

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
      if(lat===null||lng===null)return send(res,400,{error:'Invalid coordinates'});

      const url='https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lng);
      const data=await fetchJson(url,{headers},10000);
      const a=data.address||{};
      const label=[a.city||a.town||a.village||a.county,a.state].filter(Boolean).join(', ')||'Current area';
      return send(res,200,{label});
    }

    if(action==='geocode'){
      const q=String(req.query.q||'').trim().slice(0,160);
      if(!q)return send(res,400,{error:'Location is required'});

      const url='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(q);
      const data=await fetchJson(url,{headers},10000);
      if(!data?.[0])return send(res,404,{error:'Location not found'});
      return send(res,200,{
        lat:Number(data[0].lat),
        lng:Number(data[0].lon),
        label:String(data[0].display_name||q).split(',').slice(0,2).join(', ')
      });
    }

    if(action==='places'){
      const lat=num(req.query.lat,-90,90);
      const lng=num(req.query.lng,-180,180);
      const radiusKm=num(req.query.radiusKm,1,25);
      if(lat===null||lng===null||radiusKm===null)return send(res,400,{error:'Invalid place-search parameters'});

      const radius=Math.round(radiusKm*1000);
      const tags=[
        '["amenity"~"cafe|restaurant|cinema|library"]',
        '["leisure"~"park|garden|sports_centre|fitness_centre|amusement_arcade|bowling_alley|playground"]',
        '["tourism"~"museum|gallery|attraction|viewpoint"]',
        '["shop"="mall"]',
        '["historic"]'
      ];
      const blocks=tags.map(tag=>'nwr(around:'+radius+','+lat+','+lng+')'+tag+';').join('');
      const query='[out:json][timeout:20];('+blocks+');out center tags 220;';
      const body=new URLSearchParams({data:query}).toString();
      const providers=[
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter'
      ];

      let lastError=null;
      for(const provider of providers){
        try{
          const data=await fetchJson(provider,{
            method:'POST',
            headers:{
              ...headers,
              'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body
          },18000);
          if(Array.isArray(data?.elements)){
            return send(res,200,{elements:data.elements,provider:new URL(provider).hostname});
          }
        }catch(e){
          lastError=e;
        }
      }

      console.error('MoodTrip place providers failed',lastError);
      return send(res,502,{error:'Nearby place providers are temporarily unavailable. Please try again in a moment.'});
    }

    return send(res,400,{error:'Unknown action'});
  }catch(e){
    console.error('MoodTrip API error',e);
    return send(res,502,{error:'The map service did not respond. Please try again.'});
  }
}
