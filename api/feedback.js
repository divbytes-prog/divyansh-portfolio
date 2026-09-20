const JSON_HEADERS={
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store'
};

function json(body,status=200){
  return new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});
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
    const text=await response.text().catch(()=>'');
    throw new Error('supabase-'+response.status+': '+text.slice(0,240));
  }
  const type=response.headers.get('content-type')||'';
  return type.includes('application/json')?response.json():null;
}

async function storeFeedback(payload){
  const row={
    session_id:cleanString(payload.sessionId,80),
    mood:cleanString(payload.mood,32),
    category:cleanString(payload.category,64),
    place_id:cleanString(payload.placeId,180),
    place_name:cleanString(payload.placeName,180),
    positive:Boolean(payload.positive),
    model_score:safeNumber(payload.modelScore,0,100),
    neural_score:safeNumber(payload.neuralScore,0,100),
    distance_km:safeNumber(payload.distanceKm,0,1000),
    rating:safeNumber(payload.rating,0,5),
    group_mode:Boolean(payload.groupMode),
    rank_features:safeFeatures(payload.rankFeatures),
    model_version:cleanString(payload.modelVersion||'distilled-nn-v1',64),
    source:'moodtrip-web'
  };

  if(!row.session_id||!row.mood||!row.category||!row.place_id||!row.rank_features){
    throw new Error('invalid-feedback-payload');
  }

  await supabase('moodtrip_feedback',{
    method:'POST',
    headers:{Prefer:'return=minimal'},
    body:JSON.stringify(row)
  });
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
      let payload={};
      try{payload=await request.json()}catch{return json({error:'Invalid JSON'},400)}
      if(!configured)return json({stored:false,storage:'local',configured:false},202);

      try{
        await storeFeedback(payload);
        return json({stored:true,storage:'supabase',configured:true},201);
      }catch(error){
        const invalid=String(error?.message||'').includes('invalid-feedback-payload');
        console.warn('Feedback store failed',error?.message);
        return json({
          stored:false,
          storage:'local',
          configured:true,
          error:invalid?'Invalid feedback payload':'Feedback storage temporarily unavailable'
        },invalid?400:202);
      }
    }

    return json({error:'Method not allowed'},405);
  }
};
