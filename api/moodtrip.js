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
    const qNorm=q.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    const labelNorm=String(item.label||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    const fullNorm=String(item.fullLabel||'').toLowerCase();
    const labelAtStart=labelNorm&&qNorm.startsWith(labelNorm);
    const exactLabel=qNorm===labelNorm;
    const score=(item.importance||0)*100+suggestionDistanceBias(item,bias)
      +(fullNorm.includes(qNorm)?18:0)
      +(labelAtStart?48:0)
      +(exactLabel?35:0);
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
      'X-Goog-FieldMask':'id,displayName,formattedAddress,rating,userRatingCount,reviews,photos,googleMapsUri,googleMapsLinks,primaryTypeDisplayName'
    }
  },6500);

  const photos=[];
  for(const photo of (detail.photos||[]).slice(0,4)){
    try{
      const media=await fetchJson(
        'https://places.googleapis.com/v1/'+photo.name+'/media?maxWidthPx=1200&maxHeightPx=900&skipHttpRedirect=true&key='+encodeURIComponent(key),
        {},
        5000
      );
      if(media?.photoUri)photos.push({
        uri:media.photoUri,
        width:photo.widthPx||null,
        height:photo.heightPx||null,
        attribution:(photo.authorAttributions||[]).map(a=>a.displayName).filter(Boolean).join(', ')
      });
    }catch{}
  }

  return {
    configured:true,
    found:true,
    placeId:detail.id,
    name:detail.displayName?.text||name,
    address:detail.formattedAddress||'',
    rating:detail.rating||null,
    ratingCount:detail.userRatingCount||0,
    type:detail.primaryTypeDisplayName?.text||'',
    photos,
    mapsUrl:detail.googleMapsUri||mapsUrl,
    reviewsUrl:detail.googleMapsLinks?.reviewsUri||detail.googleMapsUri||mapsUrl,
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



function bearingDegrees(from,to){
  const lat1=from.lat*Math.PI/180;
  const lat2=to.lat*Math.PI/180;
  const dLon=(to.lng-from.lng)*Math.PI/180;
  const y=Math.sin(dLon)*Math.cos(lat2);
  const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}

function bboxAround(lat,lng,radiusMeters){
  const dLat=radiusMeters/111111;
  const dLng=radiusMeters/(111111*Math.max(.2,Math.cos(lat*Math.PI/180)));
  return {
    west:lng-dLng,
    south:lat-dLat,
    east:lng+dLng,
    north:lat+dLat
  };
}

function angleDelta(a,b){
  if(!Number.isFinite(Number(a))||!Number.isFinite(Number(b)))return null;
  const d=Math.abs((((Number(a)-Number(b))+540)%360)-180);
  return d;
}

function firstNumber(obj,keys){
  if(!obj||typeof obj!=='object')return null;
  for(const key of keys){
    const value=obj[key];
    const n=Number(value);
    if(Number.isFinite(n))return n;
  }
  return null;
}

function firstString(obj,keys){
  if(!obj||typeof obj!=='object')return '';
  for(const key of keys){
    const value=obj[key];
    if(typeof value==='string'&&value.trim())return value.trim();
  }
  return '';
}

function rankStreetImage(image,target){
  const point={lat:Number(image.lat),lng:Number(image.lng)};
  if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng))return null;
  const distanceMeters=Math.round(haversineKm(target,point)*1000);
  const targetBearing=bearingDegrees(point,target);
  const heading=Number.isFinite(Number(image.heading))?Number(image.heading):null;
  const aimDelta=heading==null?null:angleDelta(heading,targetBearing);

  // Exact-nearby imagery wins first. When heading is known, reward frames
  // actually facing toward the selected building instead of only being nearby.
  const headingPenalty=aimDelta==null?35:Math.min(aimDelta,120)*1.05;
  const freshness=Number.isFinite(Number(image.capturedAt))
    ?Math.max(0,18-(Date.now()-Number(image.capturedAt))/(1000*60*60*24*365)*1.3)
    :0;
  const score=distanceMeters+headingPenalty-freshness;

  return {
    ...image,
    distanceMeters,
    targetBearing,
    aimDelta,
    score
  };
}

function kartaCdnUrl(url=''){
  if(!/^https?:\/\//i.test(url))return '';
  if(/cdn\.kartaview\.org/i.test(url))return url;
  try{
    return 'https://cdn.kartaview.org/pr:sharp/'+Buffer.from(url).toString('base64url');
  }catch{
    return url;
  }
}

function normalizeKartaPhoto(item,target,index){
  const lat=firstNumber(item,['lat','latitude','gpsLat','currentLat']);
  const lng=firstNumber(item,['lng','lon','longitude','gpsLng','currentLng']);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;

  const direct=firstString(item,[
    'imageProcUrl','fileurlProc','fileurlLTh','fileurlTh','fileurl','photo','url'
  ]);
  const imageUrl=direct?kartaCdnUrl(direct):'';
  if(!imageUrl)return null;

  const heading=firstNumber(item,[
    'heading','gpsDirection','direction','compassAngle','cameraHeading'
  ]) ?? firstNumber(item.sequence||{},['heading','gpsDirection','direction']);
  const capturedRaw=firstString(item,['shotDate','dateAdded','date_added','dateProcessed','timestamp']);
  const capturedAt=capturedRaw?Date.parse(capturedRaw):null;
  const id=String(item.id||item.photoId||item.photo_id||('karta-'+index));
  const sequenceId=String(item.sequenceId||item.sequence_id||item.sequence?.id||'');

  return rankStreetImage({
    id:'kartaview-'+id,
    rawId:id,
    provider:'KartaView',
    providerId:'kartaview',
    lat,lng,heading,
    capturedAt:Number.isFinite(capturedAt)?capturedAt:null,
    imageUrl,
    previewUrl:imageUrl,
    isPano:/sphere|360/i.test(String(item.projection||item.fieldOfView||item.sequence?.fieldOfView||'')),
    sequenceId,
    viewerUrl:'https://kartaview.org/map/@'+lat+','+lng+',19z',
    attribution:'KartaView community imagery',
    quality:'street-photo'
  },target);
}

async function kartaViewStreetImages(lat,lng,headers){
  const url='https://api.openstreetcam.org/2.0/photo/?lat='+encodeURIComponent(lat)+
    '&lng='+encodeURIComponent(lng)+
    '&radius=700&zoomLevel=18&join=sequence&orderBy=id&orderDirection=desc';
  const data=await fetchJson(url,{headers},6000);
  const rows=Array.isArray(data?.result?.data)
    ?data.result.data
    :Array.isArray(data?.data)
      ?data.data
      :Array.isArray(data?.result)
        ?data.result
        :[];
  return rows.map((row,i)=>normalizeKartaPhoto(row,{lat,lng},i)).filter(Boolean);
}

function panoramaxAssetUrl(feature){
  const assets=feature?.assets||{};
  const preferred=['hd','sd','visual','thumbnail','thumb','preview','image'];
  for(const key of preferred){
    const href=assets?.[key]?.href;
    if(typeof href==='string'&&/^https?:\/\//i.test(href))return href;
  }
  for(const asset of Object.values(assets)){
    const href=asset?.href;
    if(typeof href==='string'&&/^https?:\/\//i.test(href)&&/\.(?:jpe?g|webp|png)(?:\?|$)/i.test(href))return href;
  }
  const p=feature?.properties||{};
  return firstString(p,['geovisio:image','geovisio:thumbnail','thumbnail','preview']);
}

function normalizePanoramaxFeature(feature,target,index){
  const coords=feature?.geometry?.coordinates||[];
  const lng=Number(coords[0]),lat=Number(coords[1]);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  const p=feature.properties||{};
  const id=String(feature.id||p.id||('panoramax-'+index));
  const imageUrl=panoramaxAssetUrl(feature);
  const heading=firstNumber(p,[
    'view:azimuth','heading','compass_angle','gps_heading',
    'Exif.GPSInfo.GPSImgDirection','MAPCompassHeading'
  ]);
  const capture=firstString(p,['datetime','datetimetz','captured_at','capture_time']);
  const capturedAt=capture?Date.parse(capture):null;
  const collection=String(feature.collection||p.collection||p.sequence||'');
  const imageType=String(p['pers:interior_orientation']||p['geovisio:projection']||p.type||'').toLowerCase();
  const viewerUrl='https://explore.panoramax.fr/?pic='+encodeURIComponent(id)+'&nav=any';

  return rankStreetImage({
    id:'panoramax-'+id,
    rawId:id,
    provider:'Panoramax',
    providerId:'panoramax',
    lat,lng,heading,
    capturedAt:Number.isFinite(capturedAt)?capturedAt:null,
    imageUrl,
    previewUrl:imageUrl,
    isPano:/equirect|spherical|360|pano/.test(imageType),
    sequenceId:collection,
    viewerUrl,
    embedUrl:viewerUrl,
    attribution:'Panoramax open street imagery',
    quality:'open-street-photo'
  },target);
}

async function panoramaxStreetImages(lat,lng,headers){
  const box=bboxAround(lat,lng,650);
  const url='https://api.panoramax.xyz/api/search?bbox='+
    encodeURIComponent([box.west,box.south,box.east,box.north].join(','))+
    '&limit=40';
  const data=await fetchJson(url,{headers},6500);
  const rows=Array.isArray(data?.features)?data.features:[];
  return rows.map((row,i)=>normalizePanoramaxFeature(row,{lat,lng},i)).filter(Boolean);
}

async function mapillaryStreetImages(lat,lng){
  const token=process.env.MAPILLARY_ACCESS_TOKEN||process.env.MAPILLARY_TOKEN;
  if(!token)return [];
  const box=bboxAround(lat,lng,650);
  const fields=[
    'id','thumb_2048_url','thumb_1024_url','computed_geometry',
    'captured_at','computed_compass_angle','camera_type','sequence'
  ].join(',');
  const url='https://graph.mapillary.com/images?access_token='+encodeURIComponent(token)+
    '&bbox='+encodeURIComponent([box.west,box.south,box.east,box.north].join(','))+
    '&limit=40&fields='+encodeURIComponent(fields);
  const data=await fetchJson(url,{},6500);
  const rows=Array.isArray(data?.data)?data.data:[];
  return rows.map((row,i)=>{
    const coords=row?.computed_geometry?.coordinates||row?.geometry?.coordinates||[];
    const lngN=Number(coords[0]),latN=Number(coords[1]);
    if(!Number.isFinite(latN)||!Number.isFinite(lngN))return null;
    const id=String(row.id||('mapillary-'+i));
    const imageUrl=row.thumb_2048_url||row.thumb_1024_url||'';
    if(!imageUrl)return null;
    return rankStreetImage({
      id:'mapillary-'+id,
      rawId:id,
      provider:'Mapillary',
      providerId:'mapillary',
      lat:latN,lng:lngN,
      heading:firstNumber(row,['computed_compass_angle','compass_angle']),
      capturedAt:Number(row.captured_at)||null,
      imageUrl,
      previewUrl:imageUrl,
      isPano:String(row.camera_type||'').toLowerCase()==='spherical',
      sequenceId:String(row.sequence||''),
      viewerUrl:'https://www.mapillary.com/app/?pKey='+encodeURIComponent(id),
      attribution:'Mapillary community imagery',
      quality:'street-photo'
    },{lat,lng});
  }).filter(Boolean);
}

function streetProviderSummary(id,status,count,error=''){
  return {id,status,count:Number(count)||0,error:error||''};
}

async function openStreetImagery(lat,lng,headers){
  const jobs=[
    ['panoramax',()=>panoramaxStreetImages(lat,lng,headers)],
    ['kartaview',()=>kartaViewStreetImages(lat,lng,headers)]
  ];

  if(process.env.MAPILLARY_ACCESS_TOKEN||process.env.MAPILLARY_TOKEN){
    jobs.unshift(['mapillary',()=>mapillaryStreetImages(lat,lng)]);
  }

  const settled=await Promise.all(jobs.map(async([id,run])=>{
    try{
      const items=await run();
      return {id,status:'ready',items};
    }catch(e){
      return {id,status:'unavailable',items:[],error:e?.message||'provider error'};
    }
  }));

  const byProvider=new Map();
  settled.forEach(result=>{
    const items=(result.items||[])
      .filter(item=>item&&item.distanceMeters<=900)
      .sort((a,b)=>a.score-b.score);
    byProvider.set(result.id,items);
  });

  // Interleave sources so one dense provider cannot bury useful imagery from
  // the others. Within each source the best distance + camera-direction match
  // still comes first.
  const seen=new Set();
  const balanced=[];
  let round=0;
  while(balanced.length<18){
    let added=false;
    for(const result of settled){
      const candidate=(byProvider.get(result.id)||[])[round];
      if(!candidate)continue;
      const key=candidate.providerId+'|'+candidate.rawId;
      if(seen.has(key))continue;
      seen.add(key);
      balanced.push(candidate);
      added=true;
      if(balanced.length>=18)break;
    }
    if(!added)break;
    round++;
  }

  balanced.sort((a,b)=>{
    const nearGap=a.distanceMeters-b.distanceMeters;
    if(Math.abs(nearGap)>90)return nearGap;
    return a.score-b.score;
  });

  return {
    images:balanced,
    providers:[
      ...settled.map(x=>streetProviderSummary(x.id,x.status,x.items?.length,x.error)),
      ...(process.env.MAPILLARY_ACCESS_TOKEN||process.env.MAPILLARY_TOKEN
        ?[]
        :[streetProviderSummary('mapillary','token-optional',0)])
    ],
    selected:balanced[0]||null
  };
}

function polygonCentroid(coords){
  if(!coords?.length)return null;
  const sum=coords.reduce((a,p)=>({lat:a.lat+Number(p.lat||0),lng:a.lng+Number(p.lon||0)}),{lat:0,lng:0});
  return {lat:sum.lat/coords.length,lng:sum.lng/coords.length};
}

async function nearestBuildingFootprint(lat,lng,headers){
  const query='[out:json][timeout:6];way(around:140,'+lat+','+lng+')[building];out geom 30;';
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
  },5500).then(data=>Array.isArray(data?.elements)?data.elements:[]));

  let groups=[];
  try{
    const settled=await Promise.allSettled(jobs);
    groups=settled.flatMap(x=>x.status==='fulfilled'?x.value:[]);
  }catch{}

  const unique=new Map();
  groups.forEach(el=>{
    if(el.type!=='way'||!Array.isArray(el.geometry)||el.geometry.length<3)return;
    unique.set(el.id,el);
  });

  const center={lat,lng};
  const ranked=[...unique.values()].map(el=>{
    const centroid=polygonCentroid(el.geometry);
    return {
      el,
      centroid,
      distanceKm:centroid?haversineKm(center,centroid):999
    };
  }).sort((a,b)=>a.distanceKm-b.distanceKm);

  const best=ranked[0];
  if(!best||best.distanceKm>.18)return null;

  return {
    id:best.el.id,
    name:best.el.tags?.name||best.el.tags?.['addr:housename']||'Selected building',
    building:best.el.tags?.building||'yes',
    distanceMeters:Math.round(best.distanceKm*1000),
    coordinates:best.el.geometry.map(p=>[Number(p.lat),Number(p.lon)])
  };
}


function decodeHtml(input=''){
  return String(input)
    .replace(/<[^>]*>/g,' ')
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"')
    .replace(/&#x27;|&#39;/g,"'")
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/&nbsp;/g,' ')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/\s+/g,' ')
    .trim();
}

function directDuckUrl(href=''){
  try{
    const raw=href.startsWith('//')?'https:'+href:href;
    const u=new URL(raw,'https://duckduckgo.com');
    const redirected=u.searchParams.get('uddg');
    return redirected?decodeURIComponent(redirected):u.href;
  }catch{
    return href;
  }
}

function sourceLabel(url=''){
  try{
    return new URL(url).hostname.replace(/^www\./,'').split('.').slice(0,-1).join('.').toUpperCase()||'WEB';
  }catch{return 'WEB'}
}

function parseDuckResults(html){
  const results=[];
  const blocks=String(html).split(/<div[^>]+class="[^"]*result[^"]*"[^>]*>/i).slice(1);
  for(const block of blocks){
    const titleMatch=block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
      ||block.match(/<a[^>]+href="([^"]+)"[^>]+class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch=block.match(/<(?:a|div)[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i);
    if(!titleMatch)continue;
    const url=directDuckUrl(titleMatch[1]);
    const title=decodeHtml(titleMatch[2]);
    const snippet=decodeHtml(snippetMatch?.[1]||'');
    if(!url||!title)continue;
    results.push({title,url,snippet,source:sourceLabel(url)});
    if(results.length>=12)break;
  }
  return results;
}

function parseBingResults(html){
  const results=[];
  const blocks=String(html).split(/<li[^>]+class="[^"]*b_algo[^"]*"[^>]*>/i).slice(1);
  for(const block of blocks){
    const titleMatch=block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const snippetMatch=block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if(!titleMatch)continue;
    const url=decodeHtml(titleMatch[1]);
    const title=decodeHtml(titleMatch[2]);
    const snippet=decodeHtml(snippetMatch?.[1]||'');
    if(!url||!title)continue;
    results.push({title,url,snippet,source:sourceLabel(url)});
    if(results.length>=12)break;
  }
  return results;
}

async function fetchHtml(url,headers,timeout=6500){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(url,{
      signal:controller.signal,
      headers:{
        ...headers,
        'Accept':'text/html,application/xhtml+xml',
        'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'
      }
    });
    if(!r.ok)throw new Error('HTML '+r.status);
    return await r.text();
  }finally{
    clearTimeout(timer);
  }
}

function preferredReviewUrl(url=''){
  const u=url.toLowerCase();
  return [
    'wanderlog.com/place/details',
    'zomato.com/',
    'tripadvisor.',
    'justdial.com/',
    'restaurant-guru.',
    'magicpin.in/',
    'yelp.'
  ].some(x=>u.includes(x));
}

function extractPreferredUrls(html=''){
  const urls=new Set();
  const raw=String(html)
    .replace(/\\u0026/g,'&')
    .replace(/\\\//g,'/')
    .replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"')
    .replace(/&#x27;|&#39;/g,"'");

  const abs=raw.match(/https?:\/\/[^\s"'<>\\]+/g)||[];
  abs.forEach(candidate=>{
    const cleaned=candidate.replace(/[),.;]+$/,'');
    if(preferredReviewUrl(cleaned))urls.add(cleaned);
  });

  const encodedPatterns=[
    /[?&](?:q|url)=(https?%3A%2F%2F[^&"']+)/gi,
    /uddg=(https?%3A%2F%2F[^&"']+)/gi
  ];
  for(const re of encodedPatterns){
    let m;
    while((m=re.exec(raw))){
      try{
        const u=decodeURIComponent(m[1]);
        if(preferredReviewUrl(u))urls.add(u);
      }catch{}
    }
  }

  const escapedPatterns=[
    /https?:\\\/\\\/[^\s"'<>\\]+/gi
  ];
  for(const re of escapedPatterns){
    const matches=raw.match(re)||[];
    matches.forEach(v=>{
      const u=v.replace(/\\\//g,'/');
      if(preferredReviewUrl(u))urls.add(u);
    });
  }

  return [...urls];
}

async function discoverReviewUrls(name,address,headers){
  const q='"'+[name,address].filter(Boolean).join(' ')+'" reviews';
  const urls=new Set();

  const googleSearch='https://www.google.com/search?hl=en&num=10&q='+encodeURIComponent(q+' site:wanderlog.com OR site:zomato.com OR site:tripadvisor.in OR site:justdial.com');
  const searchUrls=[
    googleSearch,
    'https://www.bing.com/search?count=12&setlang=en-IN&q='+encodeURIComponent(q),
    'https://html.duckduckgo.com/html/?q='+encodeURIComponent(q),
    'https://search.brave.com/search?source=web&q='+encodeURIComponent(q),
    'https://www.mojeek.com/search?q='+encodeURIComponent(q),
    'https://search.yahoo.com/search?p='+encodeURIComponent(q)
  ];

  const pages=await Promise.all(searchUrls.map(u=>fetchHtml(u,headers,5500).catch(()=>'')));
  pages.forEach(html=>extractPreferredUrls(html).forEach(u=>urls.add(u)));

  if(!urls.size){
    const readerTargets=[
      googleSearch,
      'https://www.bing.com/search?count=12&setlang=en-IN&q='+encodeURIComponent(q),
      'https://search.brave.com/search?source=web&q='+encodeURIComponent(q),
      'https://www.mojeek.com/search?q='+encodeURIComponent(q)
    ];
    const rendered=await Promise.all(readerTargets.map(u=>jinaRead(u,headers,9000)));
    rendered.forEach(page=>extractPreferredUrls(page).forEach(u=>urls.add(u)));
  }

  return [...urls].slice(0,8);
}

function safeJson(text){
  try{return JSON.parse(text)}catch{return null}
}

function collectJsonLd(html=''){
  const nodes=[];
  const re=/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while((m=re.exec(html))){
    const parsed=safeJson(decodeHtml(m[1]).replace(/\s+/g,' '))||safeJson(m[1]);
    if(parsed)nodes.push(parsed);
  }
  return nodes;
}

function flattenJsonLd(value,out=[]){
  if(!value)return out;
  if(Array.isArray(value)){value.forEach(v=>flattenJsonLd(v,out));return out}
  if(typeof value==='object'){
    out.push(value);
    if(Array.isArray(value['@graph']))flattenJsonLd(value['@graph'],out);
  }
  return out;
}

function metaContent(html,key){
  const escaped=String(key).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns=[
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["']`,'i')
  ];
  for(const re of patterns){
    const m=html.match(re);
    if(m)return decodeHtml(m[1]);
  }
  return '';
}

function reviewsFromJsonLd(nodes,url){
  const items=[];
  const flat=nodes.flatMap(n=>flattenJsonLd(n,[]));

  for(const node of flat){
    const businessName=node.name||node.itemReviewed?.name||'';
    const agg=node.aggregateRating||node.itemReviewed?.aggregateRating||null;
    const reviews=Array.isArray(node.review)?node.review:(node.review?[node.review]:[]);

    for(const r of reviews){
      const body=decodeHtml(r.reviewBody||r.description||'');
      if(body.length<15)continue;
      const rating=Number(r.reviewRating?.ratingValue||r.ratingValue||0)||null;
      const author=typeof r.author==='string'?r.author:(r.author?.name||'Public reviewer');
      items.push({
        title:(author||'Public reviewer')+(rating?' · '+rating+'★':''),
        snippet:body.slice(0,360),
        source:sourceLabel(url),
        url,
        rating,
        author,
        reviewCount:agg?Number(agg.reviewCount||agg.ratingCount||0)||null:null,
        sourceRating:agg?Number(agg.ratingValue||0)||null:null,
        businessName
      });
      if(items.length>=4)return items;
    }
  }

  return items;
}

async function reviewsFromPage(url,headers){
  try{
    const html=await fetchHtml(url,headers,6500);
    const structured=reviewsFromJsonLd(collectJsonLd(html),url);
    if(structured.length)return structured;

    const desc=metaContent(html,'description')||metaContent(html,'og:description');
    const title=metaContent(html,'og:title')||sourceLabel(url);
    if(desc&&/review|rating|rated|stars?|google|tripadvisor/i.test(desc)){
      return [{
        title,
        snippet:desc.slice(0,360),
        source:sourceLabel(url),
        url,
        rating:null,
        author:null,
        reviewCount:null,
        sourceRating:null,
        businessName:title
      }];
    }
  }catch{}

  const reader=await jinaRead(url,headers,9000);
  return reviewsFromReaderMarkdown(reader,url);
}


async function wanderlogJson(path,params,headers,timeout=7000){
  const u=new URL('https://wanderlog.com/api/'+path.replace(/^\/+/,''));
  Object.entries(params||{}).forEach(([k,v])=>{
    if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));
  });
  return fetchJson(u.href,{
    headers:{
      ...headers,
      'Accept':'application/json',
      'User-Agent':'Mozilla/5.0 (compatible; MoodTrip/3.2)'
    }
  },timeout);
}

function textSimilarity(a='',b=''){
  const clean=v=>String(v).toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const aa=clean(a),bb=clean(b);
  if(!aa||!bb)return 0;
  if(aa===bb)return 1;
  if(aa.includes(bb)||bb.includes(aa))return .9;
  const A=new Set(aa.split(' ')),B=new Set(bb.split(' '));
  let common=0;A.forEach(x=>{if(B.has(x))common++});
  return common/Math.max(A.size,B.size,1);
}

async function wanderlogPlaceSearch(name,address,lat,lng,headers){
  const queries=[
    [name,address].filter(Boolean).join(' '),
    name
  ].filter((q,i,a)=>q&&a.indexOf(q)===i);

  const groups=await Promise.all(queries.map(async query=>{
    const request={
      input:query,
      sessiontoken:'moodtrip-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
      location:{
        longitude:Number.isFinite(lng)?lng:0,
        latitude:Number.isFinite(lat)?lat:0
      },
      radius:50000,
      language:'en'
    };
    try{
      const data=await wanderlogJson(
        'placesAPI/autocomplete/v2',
        {request:JSON.stringify(request)},
        headers,
        6500
      );
      return Array.isArray(data?.data)?data.data:[];
    }catch{
      return [];
    }
  }));

  const seen=new Set();
  const rows=groups.flat().filter(row=>{
    const id=row?.place_id;
    if(!id||seen.has(id))return false;
    seen.add(id);
    return true;
  });
  if(!rows.length)return [];

  return rows.map(row=>{
    const main=row.structured_formatting?.main_text||row.description||'';
    const secondary=row.structured_formatting?.secondary_text||row.secondaryText||'';
    const nameSim=textSimilarity(main,name);
    const addressSim=textSimilarity(secondary,address);
    let score=nameSim*120+addressSim*28;
    if(String(main).toLowerCase()===String(name).toLowerCase())score+=35;
    return {row,score,nameSim,addressSim};
  }).sort((a,b)=>b.score-a.score).slice(0,10);
}

function deepValues(value,keyMatcher,out=[]){
  if(value==null)return out;
  if(Array.isArray(value)){
    value.forEach(v=>deepValues(v,keyMatcher,out));
    return out;
  }
  if(typeof value!=='object')return out;
  for(const [k,v] of Object.entries(value)){
    if(keyMatcher(k,v))out.push(v);
    deepValues(v,keyMatcher,out);
  }
  return out;
}

function firstField(obj,keys){
  if(!obj||typeof obj!=='object')return null;
  for(const k of keys){
    const v=obj[k];
    if(v!==undefined&&v!==null&&v!=='')return v;
  }
  return null;
}

function reviewerName(obj){
  const direct=firstField(obj,['author_name','authorName','reviewerName','userName','username']);
  if(direct)return typeof direct==='string'?direct:(direct.name||null);
  const nested=firstField(obj,['author','reviewer','user','profile']);
  if(typeof nested==='string')return nested;
  if(nested&&typeof nested==='object')return firstField(nested,['displayName','name','username','fullName'])||null;
  return null;
}

function reviewText(obj){
  const v=firstField(obj,[
    'reviewText','review_text','text','reviewBody','body','content','comment',
    'comments','snippet','description','originalText'
  ]);
  if(typeof v==='string')return decodeHtml(v).replace(/\s+/g,' ').trim();
  if(v&&typeof v==='object'){
    const nested=firstField(v,['text','content','value']);
    if(typeof nested==='string')return decodeHtml(nested).replace(/\s+/g,' ').trim();
  }
  return '';
}

function reviewRating(obj){
  const v=firstField(obj,['rating','score','stars','starRating','ratingValue']);
  if(typeof v==='number')return v;
  if(typeof v==='string'&&Number.isFinite(Number(v)))return Number(v);
  if(v&&typeof v==='object'){
    const nested=firstField(v,['value','rating','ratingValue']);
    if(Number.isFinite(Number(nested)))return Number(nested);
  }
  return null;
}

function reviewSource(obj){
  const v=firstField(obj,['source','sourceSite','platform','provider','reviewSource','publisher']);
  if(typeof v==='string')return v;
  if(v&&typeof v==='object')return firstField(v,['name','title','site','displayName'])||'Wanderlog';
  return 'Wanderlog';
}

function shortReviewExcerpt(text,maxWords=7){
  const words=String(text||'').trim().split(/\s+/).filter(Boolean);
  if(words.length<=maxWords)return words.join(' ');
  return words.slice(0,maxWords).join(' ')+'…';
}

function normalizeReviewObject(obj,placeName){
  if(!obj||typeof obj!=='object')return null;
  const text=reviewText(obj);
  if(text.length<16)return null;
  const rating=reviewRating(obj);
  const author=reviewerName(obj)||'Public reviewer';
  const source=String(reviewSource(obj)||'Wanderlog');
  return {
    title:author+(rating?' · '+Number(rating).toFixed(1)+'★':''),
    snippet:shortReviewExcerpt(text,7),
    source:source.toUpperCase(),
    url:'https://wanderlog.com/',
    rating,
    author,
    reviewCount:null,
    sourceRating:null,
    businessName:placeName
  };
}

function extractWanderlogReviewData(payload,placeName){
  const reviews=[];
  const seen=new Set();
  const arrays=deepValues(payload,(key,value)=>/reviews?/i.test(key)&&Array.isArray(value));
  arrays.forEach(arr=>{
    arr.forEach(item=>{
      const normalized=normalizeReviewObject(item,placeName);
      if(!normalized)return;
      const key=(normalized.author+'|'+normalized.snippet.slice(0,80)).toLowerCase();
      if(seen.has(key))return;
      seen.add(key);
      reviews.push(normalized);
    });
  });

  const ratings=deepValues(payload,(key,value)=>
    /^(rating|tripadvisorRating|sourceRating)$/i.test(key)&&Number.isFinite(Number(value))
  ).map(Number).filter(n=>n>0&&n<=5);

  const counts=deepValues(payload,(key,value)=>
    /(userRatingsTotal|numRatings|ratingCount|reviewCount|tripadvisorNumRatings)/i.test(key)&&Number.isFinite(Number(value))
  ).map(Number).filter(n=>n>0);

  const summaries=deepValues(payload,(key,value)=>
    /(reviewsSummary|reviewSummary)/i.test(key)&&typeof value==='string'&&value.trim().length>20
  ).map(v=>decodeHtml(v).replace(/\s+/g,' ').trim());

  return {
    reviews:reviews.slice(0,6),
    rating:ratings[0]||null,
    reviewCount:counts[0]||null,
    summary:summaries[0]||''
  };
}

async function wanderlogReviews(name,address,lat,lng,headers){
  try{
    const candidates=await wanderlogPlaceSearch(name,address,lat,lng,headers);
    if(!candidates.length)return null;

    const inspected=await Promise.all(candidates.slice(0,8).map(async candidate=>{
      const placeId=candidate.row?.place_id;
      if(!placeId)return null;
      try{
        const detail=await wanderlogJson(
          'placesAPI/getPlaceDetailsAndCardData',
          {placeId,language:'en'},
          headers,
          6000
        );
        const d=detail?.data?.details||{};
        const point={
          lat:Number(d?.geometry?.location?.lat),
          lng:Number(d?.geometry?.location?.lng)
        };
        const hasPoint=Number.isFinite(point.lat)&&Number.isFinite(point.lng);
        const distance=hasPoint&&Number.isFinite(lat)&&Number.isFinite(lng)
          ?haversineKm({lat,lng},point)
          :999;
        const main=d.name||candidate.row.structured_formatting?.main_text||'';
        const detailAddress=d.formatted_address||candidate.row.structured_formatting?.secondary_text||'';
        const nameSim=Math.max(candidate.nameSim||0,textSimilarity(main,name));
        const addressSim=Math.max(candidate.addressSim||0,textSimilarity(detailAddress,address));
        let score=nameSim*150+addressSim*30;
        if(distance<999)score+=Math.max(0,130-Math.min(distance,6)*32);
        if(distance<=.35)score+=60;
        if(String(main).toLowerCase()===String(name).toLowerCase())score+=35;
        return {candidate,detail,detailEnvelope:detail,placeId,distance,score,nameSim,addressSim};
      }catch{
        return {
          candidate,
          detail:null,
          detailEnvelope:null,
          placeId,
          distance:999,
          score:candidate.score||0,
          nameSim:candidate.nameSim||0,
          addressSim:candidate.addressSim||0
        };
      }
    }));

    const ranked=inspected.filter(Boolean).sort((a,b)=>b.score-a.score);
    if(!ranked.length)return null;

    let aggregateFallback=null;

    for(const matched of ranked.slice(0,5)){
      const closeEnough=
        (matched.distance<=1.75&&matched.nameSim>=.5) ||
        (matched.distance<=3&&matched.nameSim>=.82) ||
        (matched.distance===999&&matched.nameSim>=.9&&matched.addressSim>=.35);
      if(!closeEnough)continue;

      const placeId=matched.placeId;
      const calls=[
        Promise.resolve(matched.detailEnvelope),
        wanderlogJson('placesAPI/getPlaceDetails/v2',{placeId,language:'en'},headers,6000),
        wanderlogJson('places/metadata',{placeIds:placeId,getDetails:'true'},headers,6000),
        wanderlogJson('places/card',{placeIds:placeId},headers,6000)
      ];
      const settled=await Promise.allSettled(calls);
      const payloads=settled
        .filter(x=>x.status==='fulfilled'&&x.value)
        .map(x=>x.value);
      if(!payloads.length)continue;

      const combined=extractWanderlogReviewData(payloads,name);

      if(!aggregateFallback&&(combined.rating||combined.reviewCount||combined.summary)){
        aggregateFallback={combined,matched};
      }

      if(combined.reviews.length){
        const items=combined.reviews.slice(0,3);
        items.forEach(item=>{
          item.reviewCount=combined.reviewCount;
          item.sourceRating=combined.rating;
          item.matchDistanceKm=matched.distance<999?matched.distance:null;
        });
        return {
          items,
          placeId,
          description:matched.candidate?.row?.description||'',
          rating:combined.rating,
          reviewCount:combined.reviewCount,
          matchDistanceKm:matched.distance<999?matched.distance:null
        };
      }

      if(combined.summary){
        return {
          items:[{
            title:(combined.rating?combined.rating.toFixed(1)+'★ · ':'')+'Public review summary',
            snippet:shortReviewExcerpt(combined.summary,18),
            source:'WANDERLOG',
            url:'https://wanderlog.com/',
            rating:combined.rating,
            author:null,
            reviewCount:combined.reviewCount,
            sourceRating:combined.rating,
            businessName:name,
            matchDistanceKm:matched.distance<999?matched.distance:null
          }],
          placeId,
          description:matched.candidate?.row?.description||'',
          rating:combined.rating,
          reviewCount:combined.reviewCount,
          matchDistanceKm:matched.distance<999?matched.distance:null
        };
      }
    }

    if(aggregateFallback){
      const {combined,matched}=aggregateFallback;
      const parts=[];
      if(combined.rating)parts.push(combined.rating.toFixed(1)+' out of 5');
      if(combined.reviewCount)parts.push(Intl.NumberFormat('en').format(combined.reviewCount)+' public ratings');
      return {
        items:[{
          title:'Public rating available',
          snippet:parts.join(' · ')||'Public rating data is available for this selected place.',
          source:'WANDERLOG',
          url:'https://wanderlog.com/',
          rating:combined.rating,
          author:null,
          reviewCount:combined.reviewCount,
          sourceRating:combined.rating,
          businessName:name,
          aggregateOnly:true,
          matchDistanceKm:matched.distance<999?matched.distance:null
        }],
        placeId:matched.placeId,
        description:matched.candidate?.row?.description||'',
        rating:combined.rating,
        reviewCount:combined.reviewCount,
        matchDistanceKm:matched.distance<999?matched.distance:null
      };
    }

    return null;
  }catch(e){
    console.warn('Wanderlog review lookup failed',e?.message);
    return null;
  }
}

async function publicReviewSearch(name,address,lat,lng,headers){
  const wanderlog=await wanderlogReviews(name,address,lat,lng,headers);
  if(wanderlog?.items?.length)return wanderlog.items;

  const urls=await discoverReviewUrls(name,address,headers);
  if(!urls.length)return [];

  const groups=await Promise.all(urls.slice(0,5).map(url=>reviewsFromPage(url,headers)));
  const firstToken=name.toLowerCase().split(/\s+/)[0]||'';
  const seen=new Set();

  const all=groups.flat().filter(item=>{
    const text=(item.title+' '+item.snippet+' '+(item.businessName||'')).toLowerCase();
    if(firstToken&&!text.includes(firstToken))return false;
    const key=(item.source+'|'+item.title+'|'+item.snippet.slice(0,80)).toLowerCase();
    if(seen.has(key))return false;
    seen.add(key);
    return true;
  });

  return all.slice(0,6);
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
    if(action==='streetmedia'){
      const lat=num(req.query.lat,-90,90);
      const lng=num(req.query.lng,-180,180);
      if(lat===null||lng===null)return send(res,400,{error:'Invalid coordinates'},0);
      const data=await openStreetImagery(lat,lng,headers);
      return send(res,200,data,data.images.length?300:60);
    }

    if(action==='webreviews'){
      const name=String(req.query.name||'').trim().slice(0,180);
      const address=String(req.query.address||'').trim().slice(0,220);
      const lat=num(req.query.lat,-90,90);
      const lng=num(req.query.lng,-180,180);
      if(!name)return send(res,400,{error:'Place name is required'},0);
      try{
        const items=await publicReviewSearch(name,address,lat,lng,headers);
        return send(res,200,{items,source:'public-web-search'},120);
      }catch(e){
        console.warn('Public review search failed',e?.message);
        return send(res,200,{items:[],source:'public-web-search'},30);
      }
    }

    if(action==='footprint'){
      const lat=num(req.query.lat,-90,90);
      const lng=num(req.query.lng,-180,180);
      if(lat===null||lng===null)return send(res,400,{error:'Invalid coordinates'},0);
      try{
        const footprint=await nearestBuildingFootprint(lat,lng,headers);
        return send(res,200,{footprint},300);
      }catch(e){
        console.warn('Building footprint lookup failed',e?.message);
        return send(res,200,{footprint:null},60);
      }
    }

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
