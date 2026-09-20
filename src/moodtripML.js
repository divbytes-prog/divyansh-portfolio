import artifacts from'../ml/model_artifacts.json';

export const ML_BENCHMARK=artifacts.benchmark;
export const ML_META=artifacts.ranking_meta;
export const MOOD_TEXT_BENCHMARK=artifacts.mood_benchmark;

const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,n));
const relu=x=>x>0?x:0;

export function buildRankFeatures({
  moodVector,
  categoryVector,
  distanceNorm,
  ratingNorm,
  crowdFit,
  groupMode,
  hour
}){
  const h=Number.isFinite(hour)?hour:new Date().getHours();
  const hourSin=(Math.sin(2*Math.PI*h/24)+1)/2;
  const hourCos=(Math.cos(2*Math.PI*h/24)+1)/2;
  return [
    ...moodVector.slice(0,8),
    ...categoryVector.slice(0,8),
    clamp(distanceNorm),
    clamp(ratingNorm),
    clamp(crowdFit),
    groupMode?1:0,
    hourSin,
    hourCos
  ];
}

function dense(input,weights,bias,activation=true){
  const width=bias.length;
  const out=Array(width).fill(0);
  for(let j=0;j<width;j++){
    let v=bias[j]||0;
    for(let i=0;i<input.length;i++)v+=(input[i]||0)*(weights[i]?.[j]||0);
    out[j]=activation?relu(v):v;
  }
  return out;
}

export function predictDistilledRanker(features){
  const {coefs,intercepts}=artifacts.student;
  let x=features;
  x=dense(x,coefs[0],intercepts[0],true);
  x=dense(x,coefs[1],intercepts[1],true);
  x=dense(x,coefs[2],intercepts[2],false);
  return clamp(Number(x[0])||0);
}

export function feedbackKey(mood,category){
  return String(mood||'unknown')+'|'+String(category||'unknown');
}

export function contextualBanditScore(feedback,mood,category){
  const row=feedback?.[feedbackKey(mood,category)]||{};
  const pos=Number(row.pos)||0;
  const neg=Number(row.neg)||0;
  const n=pos+neg;
  const alpha=1.5+pos;
  const beta=1.5+neg;
  const mean=alpha/(alpha+beta);
  const exploration=Math.min(.18,.20/Math.sqrt(n+3));
  return {
    mean,
    exploration,
    score:clamp(mean+exploration),
    observations:n
  };
}

export function productionEnsembleScore({neuralScore,contentScore,banditScore}){
  return clamp(.78*clamp(neuralScore)+.12*clamp(contentScore)+.10*clamp(banditScore));
}

export function totalFeedbackSignals(feedback){
  return Object.entries(feedback||{}).reduce((sum,[key,row])=>{
    if(!String(key).startsWith('place|'))return sum;
    return sum+(Number(row.pos)||0)+(Number(row.neg)||0);
  },0);
}


export function explainDistilledRanker(features){
  const original=predictDistilledRanker(features);
  const groups=[
    {id:'mood',label:'Mood signal',indices:[0,1,2,3,4,5,6,7],neutral:.5},
    {id:'place',label:'Place vibe',indices:[8,9,10,11,12,13,14,15],neutral:.5},
    {id:'distance',label:'Distance',indices:[16],neutral:.5},
    {id:'rating',label:'Rating',indices:[17],neutral:.5},
    {id:'crowd',label:'Crowd fit',indices:[18],neutral:.5},
    {id:'group',label:'Group mode',indices:[19],neutral:0},
    {id:'time',label:'Time context',indices:[20,21],neutral:.5}
  ];

  return groups.map(group=>{
    const ablated=[...features];
    group.indices.forEach(i=>{ablated[i]=group.neutral});
    const without=predictDistilledRanker(ablated);
    return {
      id:group.id,
      label:group.label,
      delta:original-without,
      direction:original-without>=0?'up':'down'
    };
  }).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
}

export function placeFeedbackAdjustment(feedback,mood,placeId){
  const row=feedback?.['place|'+String(mood||'unknown')+'|'+String(placeId||'unknown')]||{};
  const pos=Number(row.pos)||0;
  const neg=Number(row.neg)||0;
  const observations=pos+neg;
  const adjustment=Math.max(-.22,Math.min(.12,.065*pos-.14*neg));
  return {
    adjustment,
    observations,
    state:pos===neg?'neutral':pos>neg?'positive':'negative'
  };
}
