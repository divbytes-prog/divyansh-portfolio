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


function rawForwardAndGradient(input){
  const {coefs,intercepts}=artifacts.student;
  const z1=dense(input,coefs[0],intercepts[0],false);
  const a1=z1.map(relu);
  const z2=dense(a1,coefs[1],intercepts[1],false);
  const a2=z2.map(relu);

  let raw=intercepts[2][0]||0;
  for(let j=0;j<a2.length;j++)raw+=a2[j]*(coefs[2][j]?.[0]||0);

  const g2=z2.map((z,j)=>(z>0?1:0)*(coefs[2][j]?.[0]||0));
  const g1=z1.map((z,j)=>{
    if(z<=0)return 0;
    let v=0;
    for(let k=0;k<g2.length;k++)v+=(coefs[1][j]?.[k]||0)*g2[k];
    return v;
  });
  const grad=input.map((_,i)=>{
    let v=0;
    for(let j=0;j<g1.length;j++)v+=(coefs[0][i]?.[j]||0)*g1[j];
    return v;
  });

  return {raw,gradient:grad};
}

export function integratedGradientsRanker(features,steps=48){
  const baseline=[
    .5,.5,.5,.5,.5,.5,.5,.5,
    .5,.5,.5,.5,.5,.5,.5,.5,
    .5,.5,.5,0,.5,.5
  ];
  const delta=features.map((v,i)=>(Number(v)||0)-baseline[i]);
  const avgGrad=Array(features.length).fill(0);

  for(let step=1;step<=steps;step++){
    const alpha=step/steps;
    const point=baseline.map((b,i)=>b+delta[i]*alpha);
    const {gradient}=rawForwardAndGradient(point);
    gradient.forEach((g,i)=>{avgGrad[i]+=g/steps});
  }

  const attributions=delta.map((d,i)=>d*avgGrad[i]);
  const inputRaw=rawForwardAndGradient(features).raw;
  const baselineRaw=rawForwardAndGradient(baseline).raw;
  const attributionSum=attributions.reduce((a,b)=>a+b,0);

  return {
    method:'Integrated Gradients',
    steps,
    baseline,
    attributions,
    inputRaw,
    baselineRaw,
    completenessResidual:(inputRaw-baselineRaw)-attributionSum
  };
}

export function explainDistilledRanker(features){
  const ig=integratedGradientsRanker(features);
  const groups=[
    {id:'mood',label:'Mood signal',indices:[0,1,2,3,4,5,6,7]},
    {id:'place',label:'Place vibe',indices:[8,9,10,11,12,13,14,15]},
    {id:'distance',label:'Distance',indices:[16]},
    {id:'rating',label:'Rating',indices:[17]},
    {id:'crowd',label:'Crowd fit',indices:[18]},
    {id:'group',label:'Group mode',indices:[19]},
    {id:'time',label:'Time context',indices:[20,21]}
  ];

  return groups.map(group=>{
    const delta=group.indices.reduce((sum,i)=>sum+(ig.attributions[i]||0),0);
    return {
      id:group.id,
      label:group.label,
      delta,
      direction:delta>=0?'up':'down',
      method:ig.method,
      completenessResidual:ig.completenessResidual
    };
  }).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
}

export function mergeFeedbackMaps(...maps){
  const out={};
  for(const map of maps){
    for(const [key,row] of Object.entries(map||{})){
      if(!out[key])out[key]={pos:0,neg:0};
      out[key].pos+=(Number(row?.pos)||0);
      out[key].neg+=(Number(row?.neg)||0);
    }
  }
  return out;
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
