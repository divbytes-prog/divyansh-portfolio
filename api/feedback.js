const JSON_HEADERS={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'
};

const MAX_BATCH=30;
const WINDOW_MS=60_000;
const MAX_REQUESTS=45;
const buckets=new Map();

function json(body,status=200,extraHeaders={}){
  return new Response(JSON.stringify(body),{status,headers:{...JSON_HEADERS,...extraHeaders}});
}

function env(){
  const url=process.env.SUPABASE_URL||'';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
  return {url:url.replace(/\/$/,''),key,configured:Boolean(url&&key)};
}

function cleanString(value,max=180){
  return String(value??'').trim().slice(0,max);
}

function safeNumber(value,min=-Infinity,max=Infinity){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):null;
}

function safeFeatures(value){
  if(!Array.isArray(value)||value.length!==22)return null;
  const out=value.map(v=>safeNumber(v,-10,10));
  return out.every(Number.isFinite)?out:null;
}

function clientKey(request){
  const forwarded=request.headers.get('x-forwarded-for')||'';
  return cleanString(forwarded.split(',')[0]||request.headers.get('x-real-ip')||'anonymous',96);
}

function rateLimit(request){
  const key=clientKey(request);
  const now=Date.now();
  const current=buckets.get(key);
  if(!current||now-current.started>=WINDOW_MS){
    buckets.set(key,{started:now,count:1});
    return null;
  }
  current.count+=1;
  if(current.count<=MAX_REQUESTS)return null;
  const retry=Math.max(1,Math.ceil((WINDOW_MS-(now-current.started))/1000));
  return json({error:'Too many feedback requests. Please retry shortly.'},429,{'Retry-After':String(retry)});
}

function cleanEvent(payload){
  const eventType=payload.eventType==='impression'?'impression':'feedback';
  const row={
    session_id:cleanString(payload.sessionId,80),
    event_type:eventType,
    recommendation_id:cleanString(payload.recommendationId,96),
    rank_position:Number.isFinite(Number(payload.rankPosition))?Math.max(1,Math.min(100,Math.round(Number(payload.rankPosition)))):null,
    mood:cleanString(payload.mood,32),
    category:cleanString(payload.category,64),
    place_id:cleanString(payload.placeId,180),
    place_name:cleanString(payload.placeName,180),
    positive:eventType==='feedback'?Boolean(payload.positive):null,
    model_score:safeNumber(payload.modelScore,0,100),
    neural_score:safeNumber(payload.neuralScore,0,100),
    distance_km:safeNumber(payload.distanceKm,0,1000),
    rating:safeNumber(payload.rating,0,5),
    group_mode:Boolean(payload.groupMode),
    rank_features:safeFeatures(payload.rankFeatures),
    model_version:cleanString(payload.modelVersion||'distilled-nn-v1',64),
    provider:cleanString(payload.provider,64),
    source:'moodtrip-web'
  };
  if(!row.session_id||!row.recommendation_id||!row.mood||!row.category||!row.place_id||!row.rank_features)return null;
  return row;
}

async function supabase(path,options={}){
  const {url,key,configured}=env();
  if(!configured)throw new Error('storage-not-configured');
  const response=await fetch(url+'/rest/v1/'+path,{
    ...options,
    headers:{
      apikey:key,
      Authorization:'Bearer '+key,
      'Content-Type':'application/json',
      ...(options.headers||{})
    }
  });
  if(!response.ok){
    const body=await response.text().catch(()=>'');
    throw new Error('supabase-'+response.status+': '+body.slice(0,240));
  }
  const type=response.headers.get('content-type')||'';
  return type.includes('application/json')?response.json():null;
}

function eventKey(row){
  return [row.session_id,row.recommendation_id,row.place_id,row.event_type].join('|');
}

async function storeFeedback(payload){
  const rawEvents=Array.isArray(payload?.events)?payload.events:[payload];
  if(rawEvents.length>MAX_BATCH)throw new Error('batch-too-large');
  const deduped=new Map();
  for(const raw of rawEvents){
    const row=cleanEvent(raw);
    if(row)deduped.set(eventKey(row),row);
  }
  const rows=[...deduped.values()];
  if(!rows.length)throw new Error('invalid-feedback-payload');

  await supabase('moodtrip_feedback?on_conflict=session_id,recommendation_id,place_id,event_type',{
    method:'POST',
    headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(rows)
  });
  return rows.length;
}

async function aggregateFeedback(mood){
  const filter=mood?'&mood=eq.'+encodeURIComponent(mood):'';
  const rows=await supabase(
    'moodtrip_feedback_aggregate?select=mood,category,place_id,pos,neg'+filter,
    {method:'GET'}
  )||[];

  const feedback={};
  for(const row of rows){
    const categoryKey=String(row.mood)+'|'+String(row.category);
    if(!feedback[categoryKey])feedback[categoryKey]={pos:0,neg:0};
    feedback[categoryKey].pos+=Number(row.pos)||0;
    feedback[categoryKey].neg+=Number(row.neg)||0;

    if(row.place_id){
      const placeKey='place|'+String(row.mood)+'|'+String(row.place_id);
      if(!feedback[placeKey])feedback[placeKey]={pos:0,neg:0};
      feedback[placeKey].pos+=Number(row.pos)||0;
      feedback[placeKey].neg+=Number(row.neg)||0;
    }
  }
  return {feedback,rows:rows.length};
}

export default {
  async fetch(request){
    const limited=rateLimit(request);
    if(limited)return limited;

    const {configured}=env();
    const url=new URL(request.url);

    if(request.method==='GET'){
      if(!configured)return json({storage:'local',configured:false,feedback:{},rows:0});
      try{
        const data=await aggregateFeedback(cleanString(url.searchParams.get('mood'),32));
        return json({storage:'supabase',configured:true,...data});
      }catch(error){
        console.warn('Feedback aggregate failed',error?.message);
        return json({storage:'local',configured:true,feedback:{},rows:0,degraded:true});
      }
    }

    if(request.method==='POST'){
      const contentLength=Number(request.headers.get('content-length')||0);
      if(contentLength>64_000)return json({error:'Feedback payload too large'},413);
      let payload={};
      try{payload=await request.json()}catch{return json({error:'Invalid JSON'},400)}
      if(!configured)return json({stored:false,storage:'local',configured:false},202);

      try{
        const count=await storeFeedback(payload);
        return json({stored:true,storage:'supabase',configured:true,count},201);
      }catch(error){
        const message=String(error?.message||'');
        const invalid=message.includes('invalid-feedback-payload')||message.includes('batch-too-large');
        console.warn('Feedback store failed',message);
        return json({
          stored:false,
          storage:'local',
          configured:true,
          error:invalid?'Invalid feedback payload':'Feedback storage temporarily unavailable'
        },invalid?400:202);
      }
    }

    return json({error:'Method not allowed'},405,{'Allow':'GET, POST'});
  }
};
