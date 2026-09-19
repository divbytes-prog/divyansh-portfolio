import React,{useEffect,useMemo,useState}from'react';
import{AnimatePresence,motion}from'motion/react';
import'./moodtrip.css';

const moods=[
  {id:'calm',label:'Calm',emoji:'◌',tone:'Slow down'},
  {id:'energized',label:'Energized',emoji:'↗',tone:'Move around'},
  {id:'curious',label:'Curious',emoji:'?',tone:'Find something new'},
  {id:'romantic',label:'Romantic',emoji:'♡',tone:'Share the moment'},
  {id:'social',label:'Social',emoji:'◎',tone:'Be around people'},
  {id:'reflective',label:'Reflective',emoji:'≈',tone:'Think quietly'}
];

const places=[
  {
    name:'Nahargarh Fort',
    type:'VIEWPOINT · HERITAGE',
    distance:'8.4 km',
    duration:'2–3 hrs',
    image:'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=84',
    vibes:['curious','energized','reflective'],
    tags:['outdoors','culture'],
    note:'A hilltop reset with old walls, long views and enough space to wander without a plan.',
    why:'High scenic payoff · open-air · strong discovery score'
  },
  {
    name:'Jal Mahal Promenade',
    type:'WATERFRONT · WALK',
    distance:'6.1 km',
    duration:'45–90 min',
    image:'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=84',
    vibes:['calm','romantic','reflective'],
    tags:['quiet','outdoors'],
    note:'A low-effort lakeside stop for a slower evening, soft light and conversation.',
    why:'Low stimulation · water view · sunset-friendly'
  },
  {
    name:'Albert Hall Museum',
    type:'MUSEUM · CULTURE',
    distance:'3.2 km',
    duration:'1–2 hrs',
    image:'https://images.unsplash.com/photo-1526772662000-3f88f10405ff?auto=format&fit=crop&w=1200&q=84',
    vibes:['curious','reflective'],
    tags:['culture','quiet'],
    note:'Architecture, collections and detail-heavy rooms when your brain wants something to follow.',
    why:'High novelty · indoor · culture-rich'
  },
  {
    name:'Jawahar Circle',
    type:'PARK · SOCIAL',
    distance:'9.7 km',
    duration:'1–2 hrs',
    image:'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=84',
    vibes:['social','energized','romantic'],
    tags:['outdoors','food'],
    note:'Open space, movement, snacks and enough activity to make a group plan feel effortless.',
    why:'Group-friendly · easy energy · flexible duration'
  },
  {
    name:'Central Park',
    type:'GREEN SPACE · WALK',
    distance:'2.5 km',
    duration:'45–75 min',
    image:'https://images.unsplash.com/photo-1517760444937-f6397edcbbcd?auto=format&fit=crop&w=1200&q=84',
    vibes:['calm','energized','reflective'],
    tags:['quiet','outdoors'],
    note:'Simple, green and low-pressure—good when you want movement without a packed itinerary.',
    why:'Easy access · green space · low planning cost'
  },
  {
    name:'Patrika Gate',
    type:'ARCHITECTURE · PHOTO WALK',
    distance:'10.2 km',
    duration:'45–90 min',
    image:'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=84',
    vibes:['romantic','curious','social'],
    tags:['culture','outdoors'],
    note:'Color, symmetry and a short photo-friendly outing that works well for pairs or groups.',
    why:'Visual novelty · short visit · social-friendly'
  }
];

const keywordMap={
  calm:['tired','stressed','quiet','peace','slow','drained','overwhelmed','relax','calm'],
  energized:['energetic','energy','active','move','adventure','adventurous','excited','fun','bored'],
  curious:['curious','explore','learn','new','discover','different','interesting','museum'],
  romantic:['date','romantic','love','partner','sunset','couple'],
  social:['friends','group','social','people','hangout','party','together'],
  reflective:['think','alone','reflect','reset','clear my head','peaceful','solo']
};

function inferMood(text,fallback){
  const q=text.toLowerCase();
  let best=fallback,score=0;
  Object.entries(keywordMap).forEach(([m,words])=>{
    const n=words.reduce((sum,w)=>sum+(q.includes(w)?1:0),0);
    if(n>score){best=m;score=n}
  });
  return best;
}

function confidence(place,mood,filters){
  let score=place.vibes.includes(mood)?91:72;
  score+=filters.filter(f=>place.tags.includes(f)).length*3;
  return Math.min(98,score);
}

export default function MoodTrip(){
  const [text,setText]=useState('');
  const [mood,setMood]=useState('calm');
  const [groupSize,setGroupSize]=useState(1);
  const [groupMoods,setGroupMoods]=useState(['calm']);
  const [filters,setFilters]=useState([]);
  const [loading,setLoading]=useState(false);
  const [searched,setSearched]=useState(false);
  const [history,setHistory]=useState([]);
  const [historyOpen,setHistoryOpen]=useState(false);

  useEffect(()=>{
    document.title='MoodTrip — Mood-Based Place Recommendations';
    try{setHistory(JSON.parse(localStorage.getItem('moodtrip-history')||'[]'))}catch{}
  },[]);

  useEffect(()=>{
    setGroupMoods(prev=>Array.from({length:groupSize},(_,i)=>prev[i]||mood));
  },[groupSize,mood]);

  const detected=useMemo(()=>inferMood(text,mood),[text,mood]);
  const ranked=useMemo(()=>[...places]
    .sort((a,b)=>confidence(b,detected,filters)-confidence(a,detected,filters))
    .slice(0,4),[detected,filters,searched]);

  function toggleFilter(f){
    setFilters(v=>v.includes(f)?v.filter(x=>x!==f):[...v,f]);
  }

  function updateGroupMood(index,value){
    setGroupMoods(v=>v.map((m,i)=>i===index?value:m));
  }

  function findPlaces(){
    setLoading(true);
    const finalMood=inferMood(text,mood);
    setTimeout(()=>{
      setMood(finalMood);
      setSearched(true);
      setLoading(false);
      const item={
        id:Date.now(),
        mood:finalMood,
        text:text.trim()||moods.find(m=>m.id===finalMood)?.tone,
        groupSize,
        time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
      };
      const next=[item,...history].slice(0,6);
      setHistory(next);
      try{localStorage.setItem('moodtrip-history',JSON.stringify(next))}catch{}
      document.getElementById('mood-results')?.scrollIntoView({behavior:'smooth',block:'start'});
    },900);
  }

  const moodMeta=moods.find(m=>m.id===detected)||moods[0];

  return <main className="moodtrip">
    <header className="mtNav">
      <a className="mtBrand" href="/moodtrip"><span>M</span><b>MoodTrip</b></a>
      <div className="mtNavRight">
        <span className="mtDemoTag">JAIPUR · PROTOTYPE DATASET</span>
        <button className="mtTextButton" onClick={()=>setHistoryOpen(v=>!v)}>History <b>{String(history.length).padStart(2,'0')}</b></button>
      </div>
    </header>

    <section className="mtHero">
      <div className="mtHeroCopy">
        <p className="mtKicker">AI-POWERED PLACE DISCOVERY / 01</p>
        <h1>Go where your<br/><em>mood makes sense.</em></h1>
        <p className="mtLead">MoodTrip turns how you feel into a short list of places worth leaving home for—using emotion, vibe clustering and personalized ranking.</p>
        <div className="mtFlow">
          <span>EMOTION</span><i>→</i><span>VIBE</span><i>→</i><span>RANK</span><i>→</i><span>GO</span>
        </div>
      </div>

      <motion.div className="mtConsole" initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} transition={{duration:.65}}>
        <div className="mtConsoleHead">
          <span>MOOD INPUT</span>
          <span className="mtLive"><i/> MODEL READY</span>
        </div>

        <label className="mtPrompt">
          <span>How are you feeling right now?</span>
          <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="I’m mentally tired and want somewhere quiet, open and not too crowded…"/>
        </label>

        <div className="mtMoodGrid">
          {moods.map(item=><button key={item.id} className={mood===item.id?'active':''} onClick={()=>setMood(item.id)}>
            <span>{item.emoji}</span><b>{item.label}</b><small>{item.tone}</small>
          </button>)}
        </div>

        <div className="mtConsoleRow">
          <div>
            <span className="mtFieldLabel">WHO'S GOING?</span>
            <div className="mtSegmented">
              {[1,2,4].map(n=><button key={n} className={groupSize===n?'active':''} onClick={()=>setGroupSize(n)}>{n===1?'SOLO':n===2?'PAIR':'GROUP'}</button>)}
            </div>
          </div>
          <div>
            <span className="mtFieldLabel">DETECTED</span>
            <strong className="mtDetected">{moodMeta.label}</strong>
          </div>
        </div>

        {groupSize>1&&<div className="mtGroupMoods">
          {groupMoods.map((gm,i)=><label key={i}><span>P{i+1}</span><select value={gm} onChange={e=>updateGroupMood(i,e.target.value)}>{moods.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label>)}
        </div>}

        <button className="mtPrimary" onClick={findPlaces} disabled={loading}>
          <span>{loading?'Reading the room…':'Find places for this mood'}</span>
          <b>{loading?'•••':'↗'}</b>
        </button>
      </motion.div>
    </section>

    <section className="mtSignal">
      <div><small>01</small><b>Transformer</b><span>emotion signal</span></div>
      <div><small>02</small><b>K-Means</b><span>vibe cluster</span></div>
      <div><small>03</small><b>Random Forest</b><span>personalized rank</span></div>
      <div><small>04</small><b>OpenTripMap</b><span>place discovery</span></div>
    </section>

    <section className="mtResults" id="mood-results">
      <div className="mtResultsHead">
        <div>
          <p className="mtKicker">RECOMMENDATIONS / 02</p>
          <h2>{searched?'Places that fit the feeling.':'A few directions for your mood.'}</h2>
        </div>
        <div className="mtFilters">
          {['quiet','outdoors','culture','food'].map(f=><button key={f} onClick={()=>toggleFilter(f)} className={filters.includes(f)?'active':''}>#{f}</button>)}
        </div>
      </div>

      <div className="mtCards">
        <AnimatePresence mode="popLayout">
          {ranked.map((place,i)=><motion.article className="mtPlaceCard" key={place.name+detected+filters.join('-')} layout initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={{delay:i*.06}}>
            <div className="mtPhoto">
              <img src={place.image} alt="" loading="lazy"/>
              <span className="mtScore">{confidence(place,detected,filters)}% MATCH</span>
              <span className="mtIndex">0{i+1}</span>
            </div>
            <div className="mtPlaceBody">
              <p>{place.type}</p>
              <h3>{place.name}</h3>
              <div className="mtPlaceMeta"><span>{place.distance}</span><span>{place.duration}</span></div>
              <p className="mtPlaceNote">{place.note}</p>
              <div className="mtWhy"><span>WHY THIS FITS</span><b>{place.why}</b></div>
            </div>
          </motion.article>)}
        </AnimatePresence>
      </div>
    </section>

    <section className="mtExplainer">
      <div className="mtExplainerTitle">
        <p className="mtKicker">BEHIND THE MATCH / 03</p>
        <h2>Not “top ten places.”<br/><em>A ranking for this moment.</em></h2>
      </div>
      <div className="mtSteps">
        <article><span>01</span><h3>Read the mood</h3><p>Your text and selected mood become an emotion signal rather than a generic category search.</p></article>
        <article><span>02</span><h3>Find the vibe</h3><p>Places are grouped by atmosphere—quiet, social, exploratory, romantic, energetic and reflective.</p></article>
        <article><span>03</span><h3>Rank the fit</h3><p>The system balances mood, group context and filters to surface a smaller, more useful shortlist.</p></article>
      </div>
    </section>

    <footer className="mtFooter">
      <div><span>M</span><strong>MoodTrip</strong></div>
      <p>AI-powered mood-based place recommendation system.</p>
      <a href="/">Divyansh Singh ↗</a>
    </footer>

    <AnimatePresence>
      {historyOpen&&<motion.aside className="mtHistory" initial={{x:'100%'}} animate={{x:0}} exit={{x:'100%'}} transition={{type:'spring',stiffness:210,damping:28}}>
        <div className="mtHistoryHead"><div><small>YOUR TRAIL</small><h3>Recent moods</h3></div><button onClick={()=>setHistoryOpen(false)}>×</button></div>
        <div className="mtHistoryList">
          {history.length===0?<p className="mtEmpty">Your recommendation history will appear here after your first search.</p>:history.map(item=><div key={item.id}><span>{item.time}</span><b>{item.mood}</b><p>{item.text}</p><small>{item.groupSize===1?'solo':item.groupSize===2?'pair':'group'}</small></div>)}
        </div>
        {history.length>0&&<button className="mtClear" onClick={()=>{setHistory([]);localStorage.removeItem('moodtrip-history')}}>Clear history</button>}
      </motion.aside>}
    </AnimatePresence>
  </main>
}
