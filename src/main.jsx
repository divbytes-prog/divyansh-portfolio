import React,{useEffect,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import{
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform
}from'motion/react';
import AeroShards from'./AeroShards';
import'./styles.css';

const projects=[
  {n:'01',title:'Startup Funding Analytics',tags:'PYTHON · ANALYTICS · DATA',desc:'An interactive analytics project for exploring startup funding patterns, sectors and activity.',href:'https://github.com/divbytes-prog/startupfunding01'},
  {n:'02',title:'File Explorer',tags:'PRODUCT · SYSTEMS · UI',desc:'A practical file-exploration project focused on clear navigation, usable structure and desktop-style interaction.',href:'https://github.com/divbytes-prog/File-Explorer'},
  {n:'03',title:'Lawn Tennis',tags:'WEB · INTERACTION · PRODUCT',desc:'A web project built around tennis content and interaction, shaped through hands-on product iteration.',href:'https://github.com/divbytes-prog/launtennis'},
  {n:'04',title:'Hearthlog',tags:'WEB · PERSONAL PROJECT',desc:'A compact product experiment built to learn by shipping and refining a real interface.',href:'https://github.com/divbytes-prog/hearthlog'},
  {n:'05',title:'IIT Hackathon',tags:'HACKATHON · BUILD · TEAM',desc:'A fast-moving hackathon build where clarity, execution and working software mattered more than polish.',href:'https://github.com/divbytes-prog/iit_hackathon'}
];

const resumeProjects=[
  {
    n:'01',
    title:'Real Estate ML Application',
    summary:'Full-stack ML application for real-estate price prediction with model comparison, analytics and recommendations.',
    tech:'PYTHON · ML REGRESSION · STREAMLIT · AWS',
    visual:'PREDICTION / MODEL COMPARISON',
    fact:'Regression models + feature engineering + recommendations'
  },
  {
    n:'02',
    title:'India Data Visualization Dashboard',
    summary:'Interactive dashboard exploring 120+ demographic and socioeconomic parameters with geospatial filtering.',
    tech:'STREAMLIT · PLOTLY · DATA VIZ',
    visual:'PARAMETERS / GEO EXPLORATION',
    fact:'120+ demographic and socioeconomic parameters'
  },
  {
    n:'03',
    title:'NLP Application Suite',
    summary:'Python desktop scripts for sentiment analysis and emoji prediction using custom text processing and rule-based classification.',
    tech:'PYTHON · NLP · RULE-BASED SYSTEMS',
    visual:'TEXT / SENTIMENT PIPELINE',
    fact:'Sentiment analysis + emoji prediction'
  },
  {
    n:'04',
    title:'Startup Analytics Dashboard',
    summary:'Interactive startup-funding analytics for exploring funding patterns, activity and startup insights.',
    tech:'STREAMLIT · ANALYTICS · DATA',
    visual:'FUNDING / TREND EXPLORATION',
    fact:'Interactive funding-pattern analysis'
  },
  {
    n:'05',
    title:'Career Assistant',
    summary:'AI-powered career guidance platform with personalized roadmaps, skill recommendations, salary insights and an AI chatbot.',
    tech:'REACT · TYPESCRIPT · TAILWIND · AI',
    visual:'ROADMAP / SOURCE NETWORK',
    fact:'YouTube + GitHub + Udemy + LinkedIn integrations'
  },
  {
    n:'06',
    title:'MoodTrip',
    summary:'Mood-based place recommendation system using emotion detection, clustering and personalized ranking with real-world location data.',
    tech:'TRANSFORMERS · K-MEANS · RANDOM FOREST · OPENTRIPMAP',
    visual:'MOOD / CLUSTER / RANK',
    fact:'Emotion detection + clustering + personalized ranking'
  }
];

const stages=[
  ['01','Understand','Reduce the problem until the important part becomes obvious.'],
  ['02','Build','Make the smallest useful version work end to end.'],
  ['03','Refine','Remove friction, test assumptions and improve the details.'],
  ['04','Ship','Put it in front of people and learn from what happens next.']
];

const reveal={hidden:{opacity:0,y:44,scale:.94,filter:'blur(10px)'},show:{opacity:1,y:0,scale:1,filter:'blur(0px)'}};
const revealTransition={type:'spring',stiffness:105,damping:18,mass:.85};

function Reveal({children,className='',delay=0}){
  return <motion.div
    className={className}
    variants={reveal}
    initial="hidden"
    whileInView="show"
    viewport={{once:true,amount:.16,margin:'0px 0px -6% 0px'}}
    transition={{...revealTransition,delay}}
  >{children}</motion.div>
}

function CursorFollower(){
  const reduce=useReducedMotion();
  const x=useMotionValue(-100),y=useMotionValue(-100);
  const sx=useSpring(x,{stiffness:500,damping:36,mass:.25});
  const sy=useSpring(y,{stiffness:500,damping:36,mass:.25});
  useEffect(()=>{
    if(reduce)return;
    const move=e=>{x.set(e.clientX-13);y.set(e.clientY-13)};
    window.addEventListener('pointermove',move,{passive:true});
    return()=>window.removeEventListener('pointermove',move);
  },[reduce,x,y]);
  if(reduce)return null;
  return <motion.div className="cursorFollower" style={{x:sx,y:sy}} aria-hidden="true"/>;
}

function MagneticLink({href,children,className='',external=false}){
  const reduce=useReducedMotion();
  const x=useMotionValue(0),y=useMotionValue(0);
  const sx=useSpring(x,{stiffness:220,damping:16,mass:.45});
  const sy=useSpring(y,{stiffness:220,damping:16,mass:.45});
  const move=e=>{
    if(reduce)return;
    const r=e.currentTarget.getBoundingClientRect();
    x.set((e.clientX-r.left-r.width/2)*.16);
    y.set((e.clientY-r.top-r.height/2)*.16);
  };
  const reset=()=>{x.set(0);y.set(0)};
  return <motion.a
    href={href}
    className={className}
    style={{x:sx,y:sy}}
    onPointerMove={move}
    onPointerLeave={reset}
    whileTap={{scale:.96}}
    target={external?'_blank':undefined}
    rel={external?'noreferrer':undefined}
  >{children}</motion.a>
}

function TiltCard({project,index}){
  const reduce=useReducedMotion();
  const rx=useMotionValue(0),ry=useMotionValue(0);
  const rotateX=useSpring(rx,{stiffness:150,damping:18});
  const rotateY=useSpring(ry,{stiffness:150,damping:18});
  const move=e=>{
    if(reduce)return;
    const r=e.currentTarget.getBoundingClientRect();
    const px=(e.clientX-r.left)/r.width;
    const py=(e.clientY-r.top)/r.height;
    ry.set((px-.5)*9);
    rx.set((.5-py)*8);
    e.currentTarget.style.setProperty('--shine-x',`${px*100}%`);
    e.currentTarget.style.setProperty('--shine-y',`${py*100}%`);
  };
  const reset=()=>{rx.set(0);ry.set(0)};
  return <motion.a
    className="projectCard"
    href={project.href}
    target="_blank"
    rel="noreferrer"
    aria-label={project.title+', opens GitHub repository in new tab'}
    initial={{opacity:0,y:55,scale:.9}}
    whileInView={{opacity:1,y:0,scale:1}}
    viewport={{once:true,amount:.18}}
    transition={{...revealTransition,delay:index*.07}}
    whileHover={reduce?undefined:{y:-10,scale:1.015}}
    whileTap={{scale:.985}}
    style={{rotateX,rotateY,transformPerspective:1100}}
    onPointerMove={move}
    onPointerLeave={reset}
  >
    <span className="cardShine" aria-hidden="true"/>
    <div className="projectMeta"><span>{project.n}</span><small>{project.tags}</small></div>
    <div className="projectCopy">
      <h3>{project.title}</h3>
      <p>{project.desc}</p>
    </div>
    <div className="projectAction"><span>View repository</span><b>↗</b></div>
  </motion.a>
}

function Counter({value,suffix=''}) {
  const ref=useRef(null);
  const inView=useInView(ref,{once:true,amount:.6});
  const reduce=useReducedMotion();
  const[display,setDisplay]=useState(reduce?value:0);
  useEffect(()=>{
    if(!inView)return;
    if(reduce){setDisplay(value);return}
    let raf,start;
    const duration=1200;
    const tick=t=>{
      start??=t;
      const p=Math.min((t-start)/duration,1);
      const eased=1-Math.pow(1-p,3);
      setDisplay(Math.round(value*eased));
      if(p<1)raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf);
  },[inView,value,reduce]);
  return <strong ref={ref}>{display}{suffix}</strong>;
}

function FieldNotebook(){
  const reduce=useReducedMotion();
  const pathAnim=reduce?undefined:{pathLength:[0,1],opacity:[0,1]};
  return <motion.div className="fieldNotebook"
    initial={{opacity:0,y:35,rotate:2}}
    whileInView={{opacity:1,y:0,rotate:-1.2}}
    viewport={{once:true,amount:.28}}
    transition={{type:'spring',stiffness:90,damping:16}}
  >
    <div className="notebookTape" aria-hidden="true"/>
    <div className="notebookHead"><span>DS / FIELD NOTES</span><small>VOL. 04 — 2026</small></div>
    <svg viewBox="0 0 520 280" role="img" aria-label="A hand-drawn build path from question to working product">
      <motion.path d="M42 214 C95 125 128 188 176 105 C219 30 278 74 309 142 C340 207 392 187 472 70"
        fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
        initial={{pathLength:0,opacity:0}} whileInView={pathAnim||{pathLength:1,opacity:1}}
        viewport={{once:true}} transition={{duration:2.1,ease:[.16,1,.3,1]}}/>
      <motion.path d="M438 78 L474 69 L461 102" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
        initial={{pathLength:0}} whileInView={reduce?{pathLength:1}:{pathLength:[0,1]}}
        viewport={{once:true}} transition={{delay:1.55,duration:.7}}/>
      <circle cx="42" cy="214" r="7"/><circle cx="176" cy="105" r="7"/><circle cx="309" cy="142" r="7"/><circle cx="472" cy="70" r="7"/>
      <text x="28" y="246">QUESTION</text><text x="145" y="84">CODE</text><text x="287" y="174">REFINE</text><text x="420" y="48">SHIP</text>
    </svg>
    <div className="notebookStats">
      <div><b>250+</b><span>DSA reps</span></div>
      <div><b>2024—29</b><span>LNMIIT</span></div>
      <div><b>BUILD</b><span>before perfect</span></div>
    </div>
    <div className="notebookScribble" aria-hidden="true">make it work → make it clear → make it yours</div>
  </motion.div>;
}

function RealtimeViewport({compact=false}){
  const canvasRef=useRef(null);
  const wrapRef=useRef(null);
  const reduce=useReducedMotion();
  const[activeProject,setActiveProject]=useState(0);

  useEffect(()=>{
    if(compact||reduce)return;
    const id=setInterval(()=>setActiveProject(v=>(v+1)%resumeProjects.length),6200);
    return()=>clearInterval(id);
  },[compact,reduce]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    const wrap=wrapRef.current;
    if(!canvas||!wrap)return;
    const ctx=canvas.getContext('2d');
    let raf=0,visible=true,w=1,h=1,dpr=1;
    const pointer={x:.66,y:.46,active:false};
    const accent='#c28d76',sage='#8d927d',paper='#efe4da',ink='#211b18';

    const resize=()=>{
      const rect=wrap.getBoundingClientRect();
      w=Math.max(1,rect.width);h=Math.max(1,rect.height);
      dpr=Math.min(window.devicePixelRatio||1,2);
      canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
      canvas.style.width=w+'px';canvas.style.height=h+'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    };

    const grid=()=>{
      ctx.strokeStyle=compact?'rgba(102,83,72,.11)':'rgba(242,238,231,.085)';
      ctx.lineWidth=1;
      const gap=compact?36:54;
      for(let x=gap;x<w;x+=gap){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}
      for(let y=gap;y<h;y+=gap){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
    };

    const label=(text,x,y,align='left',color='rgba(239,228,218,.52)')=>{
      ctx.font='500 9px "IBM Plex Mono", monospace';
      ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(text,x,y);
    };

    const node=(x,y,r=5,color=accent)=>{
      ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
      ctx.beginPath();ctx.arc(x,y,r+10,0,Math.PI*2);ctx.strokeStyle=color+'44';ctx.stroke();
    };

    const drawCompact=time=>{
      const cx=w*(pointer.active?pointer.x:.64),cy=h*(pointer.active?pointer.y:.48);
      const count=18;
      for(let i=0;i<count;i++){
        const a=i*2.399963+time*.15;
        const r=.12+((i*37)%100)/290;
        const x=w*(.5+Math.cos(a)*r),y=h*(.5+Math.sin(a*1.13)*r*.7);
        ctx.beginPath();ctx.arc(x,y,2.2+(i%3)*.3,0,Math.PI*2);
        ctx.fillStyle=i%5===0?sage:'#9a6654';ctx.fill();
      }
      node(cx,cy,5,'#9a6654');
    };

    const drawRealEstate=time=>{
      const left=w*.08,right=w*.68,top=h*.17,bottom=h*.78;
      ctx.strokeStyle='rgba(239,228,218,.22)';
      ctx.beginPath();ctx.moveTo(left,bottom);ctx.lineTo(right,bottom);ctx.lineTo(right,top);ctx.stroke();

      const pts=Array.from({length:22},(_,i)=>{
        const x=left+(right-left)*(i/21);
        const base=bottom-(bottom-top)*(i/21)*.78;
        const y=base+Math.sin(i*1.71+time*.65)*22+(i%3-1)*9;
        return{x,y};
      });
      pts.forEach((p,i)=>node(p.x,p.y,2.6,i%6===0?sage:accent));

      ctx.beginPath();
      pts.forEach((p,i)=>{
        const x=p.x;
        const y=bottom-(bottom-top)*(i/21)*.76+Math.sin(i*.43+time*.35)*4;
        i?ctx.lineTo(x,y):ctx.moveTo(x,y);
      });
      ctx.strokeStyle=paper;ctx.lineWidth=2;ctx.stroke();

      label('ACTUAL',left,bottom+24);
      label('PREDICTED',right-6,top-10,'right');
      label('MODEL COMPARISON',left,top-10,'left',accent);
    };

    const drawIndia=time=>{
      const cols=8,rows=5;
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const i=r*cols+c;
        const x=w*.08+c*w*.065;
        const y=h*.2+r*h*.105;
        const size=3+((i*13)%9)+Math.sin(time+i)*1.2;
        ctx.beginPath();ctx.arc(x,y,Math.max(2,size*.48),0,Math.PI*2);
        ctx.fillStyle=i%7===0?sage:accent;ctx.globalAlpha=.45+((i*17)%45)/100;ctx.fill();ctx.globalAlpha=1;
      }
      const bx=w*.62,base=h*.73;
      for(let i=0;i<7;i++){
        const bh=h*(.12+((i*19)%45)/100);
        ctx.fillStyle=i%3===0?sage:accent;
        ctx.fillRect(bx+i*22,base-bh,10,bh);
      }
      label('120+ PARAMETERS',w*.08,h*.16,'left',accent);
      label('DYNAMIC FILTERS',bx,base+22);
      label('GEOSPATIAL / DEMOGRAPHIC',bx,h*.16,'left',sage);
    };

    const drawNlp=time=>{
      const words=['TEXT','TOKEN','SENTIMENT','EMOJI'];
      const xs=[w*.08,w*.28,w*.50,w*.72];
      xs.forEach((x,i)=>{
        const y=h*.42+Math.sin(time*1.2+i)*8;
        ctx.fillStyle=i===2?sage:accent;
        ctx.fillRect(x-28,y-14,56,28);
        label(words[i],x,y+4,'center','#211b18');
        if(i<xs.length-1){
          ctx.beginPath();ctx.moveTo(x+30,y);ctx.lineTo(xs[i+1]-34,h*.42+Math.sin(time*1.2+i+1)*8);
          ctx.strokeStyle='rgba(239,228,218,.34)';ctx.stroke();
        }
      });
      const gaugeX=w*.67,gaugeY=h*.68;
      ctx.beginPath();ctx.arc(gaugeX,gaugeY,46,Math.PI,Math.PI*2);ctx.strokeStyle='rgba(239,228,218,.22)';ctx.lineWidth=8;ctx.stroke();
      ctx.beginPath();ctx.arc(gaugeX,gaugeY,46,Math.PI,Math.PI*(1.35+.12*Math.sin(time)));ctx.strokeStyle=accent;ctx.stroke();
      label('RULE-BASED CLASSIFICATION',w*.08,h*.19,'left',accent);
      label('SENTIMENT',gaugeX,gaugeY+24,'center');
    };

    const drawStartup=time=>{
      const left=w*.08,right=w*.70,base=h*.72;
      const bars=10;
      for(let i=0;i<bars;i++){
        const x=left+i*((right-left)/(bars-1));
        const bh=h*(.10+((i*23)%42)/100)+Math.sin(time*.8+i)*7;
        ctx.fillStyle=i%4===0?sage:accent;
        ctx.fillRect(x,base-bh,11,bh);
      }
      ctx.beginPath();
      for(let x=left;x<=right;x+=10){
        const p=(x-left)/(right-left);
        const y=h*.52-Math.sin(p*7+time*.55)*h*.09-p*h*.11;
        x===left?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      ctx.strokeStyle=paper;ctx.lineWidth=2;ctx.stroke();
      label('FUNDING PATTERNS',left,h*.17,'left',accent);
      label('ACTIVITY / INSIGHTS',right,h*.17,'right',sage);
    };

    const drawCareer=time=>{
      const center={x:w*.46,y:h*.48};
      const sources=[
        ['YOUTUBE',w*.12,h*.24],['GITHUB',w*.13,h*.69],['UDEMY',w*.72,h*.24],['LINKEDIN',w*.76,h*.67]
      ];
      sources.forEach(([name,x,y],i)=>{
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(center.x,center.y);ctx.strokeStyle='rgba(239,228,218,.18)';ctx.stroke();
        node(x,y,4,i%2?sage:accent);label(name,x,y-16,'center');
      });
      node(center.x,center.y,7,paper);
      label('CAREER ROADMAP',center.x,center.y+28,'center',accent);
      const steps=['SKILLS','SALARY','LEARNING','JOBS'];
      steps.forEach((name,i)=>{
        const x=w*.36+i*w*.11,y=h*.79+Math.sin(time+i)*3;
        ctx.fillStyle=i%2?sage:accent;ctx.fillRect(x-22,y-12,44,24);
        label(name,x,y+3,'center','#211b18');
      });
      label('REAL-TIME SOURCE INTEGRATION',w*.08,h*.16,'left',accent);
    };

    const drawMoodTrip=time=>{
      const centers=[
        {x:w*.18,y:h*.33,c:accent},{x:w*.42,y:h*.48,c:sage},{x:w*.63,y:h*.30,c:'#d0aa96'}
      ];
      centers.forEach((c,idx)=>{
        for(let i=0;i<10;i++){
          const a=i*.92+time*.18*(idx+1);
          const rr=18+(i%4)*9;
          const x=c.x+Math.cos(a)*rr,y=c.y+Math.sin(a*1.1)*rr;
          ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fillStyle=c.c;ctx.globalAlpha=.8;ctx.fill();ctx.globalAlpha=1;
        }
        ctx.beginPath();ctx.arc(c.x,c.y,52,0,Math.PI*2);ctx.strokeStyle=c.c+'44';ctx.stroke();
      });
      const rankX=w*.72,rankY=h*.52;
      for(let i=0;i<4;i++){
        ctx.fillStyle=i===0?accent:'rgba(239,228,218,.18)';
        ctx.fillRect(rankX,rankY+i*28,90-i*12,10);
      }
      label('EMOTION CLUSTERS',w*.08,h*.15,'left',accent);
      label('PLACE RANKING',rankX,rankY-18,'left',sage);
      label('MOOD → VIBE → PLACE',w*.43,h*.84,'center');
    };

    const draw=t=>{
      const time=(t||0)*.001;
      ctx.clearRect(0,0,w,h);
      ctx.fillStyle=compact?'#f5eee7':ink;
      ctx.fillRect(0,0,w,h);
      grid();

      if(compact) drawCompact(time);
      else {
        [drawRealEstate,drawIndia,drawNlp,drawStartup,drawCareer,drawMoodTrip][activeProject](time);
        if(pointer.active){
          const px=pointer.x*w,py=pointer.y*h;
          ctx.beginPath();ctx.arc(px,py,28,0,Math.PI*2);
          ctx.strokeStyle='rgba(239,228,218,.2)';ctx.stroke();
          ctx.beginPath();ctx.arc(px,py,3,0,Math.PI*2);ctx.fillStyle=paper;ctx.fill();
        }
      }

      if(!reduce&&visible)raf=requestAnimationFrame(draw);
    };

    const move=e=>{
      const r=wrap.getBoundingClientRect();
      pointer.x=(e.clientX-r.left)/r.width;
      pointer.y=(e.clientY-r.top)/r.height;
      pointer.active=true;
    };
    const leave=()=>{pointer.active=false};

    const ro=new ResizeObserver(resize);ro.observe(wrap);
    const io=new IntersectionObserver(([entry])=>{
      const was=visible;visible=entry.isIntersecting;
      if(visible&&!was&&!reduce){cancelAnimationFrame(raf);raf=requestAnimationFrame(draw)}
    },{threshold:.05});
    io.observe(wrap);
    wrap.addEventListener('pointermove',move,{passive:true});
    wrap.addEventListener('pointerleave',leave);

    resize();
    reduce?draw(0):raf=requestAnimationFrame(draw);

    return()=>{
      cancelAnimationFrame(raf);ro.disconnect();io.disconnect();
      wrap.removeEventListener('pointermove',move);
      wrap.removeEventListener('pointerleave',leave);
    };
  },[compact,reduce,activeProject]);

  const active=resumeProjects[activeProject];

  return <div ref={wrapRef} className={compact?'renderViewport compact':'renderViewport'} role="group" aria-label={compact?'Live generative visualization':'Interactive project systems view'}>
    <canvas ref={canvasRef} aria-hidden="true"/>
    {!compact&&<>
      <div className="renderHud top"><span><i/>PROJECT SYSTEMS VIEW</span><b>{active.visual}</b></div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active.n}
          className="projectStreamCard"
          initial={{opacity:0,y:18,scale:.97}}
          animate={{opacity:1,y:0,scale:1}}
          exit={{opacity:0,y:-12,scale:.98}}
          transition={{duration:.42,ease:[.16,1,.3,1]}}
        >
          <span className="projectStreamIndex">{active.n} / 06</span>
          <h3>{active.title}</h3>
          <p>{active.summary}</p>
          <b>{active.tech}</b>
          <small>{active.fact}</small>
        </motion.div>
      </AnimatePresence>

      <div className="projectStreamTabs" aria-label="Resume projects">
        {resumeProjects.map((project,i)=><button
          key={project.n}
          type="button"
          className={i===activeProject?'active':''}
          onClick={()=>setActiveProject(i)}
          aria-pressed={i===activeProject}
        ><span>{project.n}</span><em>{project.title}</em></button>)}
      </div>

      <div className="renderHud bottom"><span>VISUAL MODEL</span><b>{active.visual}</b><span>SOURCE</span><b>RESUME</b></div>
    </>}
  </div>;
}

function LiveSignal(){
  const reduce=useReducedMotion();
  return <motion.div
    className="liveSignal"
    initial={{opacity:0,scale:.9,y:20}}
    animate={{opacity:1,scale:1,y:0}}
    transition={{delay:.8,duration:.8,ease:[.16,1,.3,1]}}
    aria-hidden="true"
  >
    <div className="liveSignalHead">
      <span><i/>LIVE BUILD SIGNAL</span>
      <small>DS/26</small>
    </div>
    <RealtimeViewport compact/>
    <div className="signalBars">
      {[36,72,48,88,58,94,64,82,52,76].map((h,i)=>
        <motion.i
          key={i}
          style={{height:`${h}%`}}
          animate={reduce?undefined:{scaleY:[.55,1,.72,.94,.55]}}
          transition={{duration:1.8+(i%3)*.35,repeat:Infinity,delay:i*.06,ease:'easeInOut'}}
        />
      )}
    </div>
    <div className="signalFoot"><span>MODEL</span><b>ACTIVE</b><span>LATENCY</span><b>12MS</b></div>
  </motion.div>;
}

function AmbientField(){
  const reduce=useReducedMotion();
  return <div className="ambientField" aria-hidden="true">
    <motion.span className="blob blobA" animate={reduce?undefined:{x:[0,35,-10,0],y:[0,-24,18,0],scale:[1,1.08,.96,1]}} transition={{duration:13,repeat:Infinity,ease:'easeInOut'}}/>
    <motion.span className="blob blobB" animate={reduce?undefined:{x:[0,-28,15,0],y:[0,22,-15,0],scale:[1,.94,1.06,1]}} transition={{duration:16,repeat:Infinity,ease:'easeInOut'}}/>
    <motion.span className="blob blobC" animate={reduce?undefined:{rotate:[0,180,360],scale:[1,1.12,1]}} transition={{duration:20,repeat:Infinity,ease:'linear'}}/>
  </div>;
}

function App(){
  const[menu,setMenu]=useState(false);
  const reduce=useReducedMotion();
  const{scrollYProgress}=useScroll();
  const progress=useSpring(scrollYProgress,{stiffness:120,damping:24,mass:.25});
  const heroY=useTransform(scrollYProgress,[0,.22],[0,110]);
  const heroOpacity=useTransform(scrollYProgress,[0,.2],[1,.38]);

  useEffect(()=>{
    document.body.classList.toggle('menu-open',menu);
    const esc=e=>e.key==='Escape'&&setMenu(false);
    const resize=()=>window.innerWidth>840&&setMenu(false);
    window.addEventListener('keydown',esc);
    window.addEventListener('resize',resize);
    return()=>{
      document.body.classList.remove('menu-open');
      window.removeEventListener('keydown',esc);
      window.removeEventListener('resize',resize);
    };
  },[menu]);

  return <main id="top">
    <motion.div className="scrollProgress" style={{scaleX:progress}} aria-hidden="true"/>
    <CursorFollower/>
    <a className="skipLink" href="#content">Skip to content</a>

    <motion.nav
      className="nav"
      aria-label="Main navigation"
      initial={{opacity:0,y:-20}}
      animate={{opacity:1,y:0}}
      transition={{duration:.7,ease:[.16,1,.3,1]}}
    >
      <a className="wordmark" href="#top" aria-label="Divyansh Singh, back to top"><span>DIVYANSH</span><b>SINGH</b></a>
      <button className="menuButton" type="button" aria-expanded={menu} aria-controls="site-menu" onClick={()=>setMenu(v=>!v)}>
        {menu?'CLOSE':'MENU'}
      </button>
      <div className="navlinks desktopNav">
        <a href="#about">About</a><a href="#work">Work</a><a href="#stack">Stack</a><a href="#contact">Contact</a>
        <MagneticLink className="navArrow" href="https://github.com/divbytes-prog" external>↗</MagneticLink>
      </div>
    </motion.nav>

    <AnimatePresence>
      {menu&&<motion.div
        id="site-menu"
        className="mobileMenu"
        initial={{opacity:0,clipPath:'circle(0% at 92% 7%)'}}
        animate={{opacity:1,clipPath:'circle(150% at 92% 7%)'}}
        exit={{opacity:0,clipPath:'circle(0% at 92% 7%)'}}
        transition={{duration:.55,ease:[.16,1,.3,1]}}
      >
        {['about','work','stack','contact'].map((id,i)=>
          <motion.a key={id} href={'#'+id} onClick={()=>setMenu(false)}
            initial={{opacity:0,y:30}} animate={{opacity:1,y:0}}
            transition={{delay:.13+i*.07,duration:.45}}
          >{id[0].toUpperCase()+id.slice(1)} <span>0{i+1}</span></motion.a>
        )}
        <motion.a href="https://github.com/divbytes-prog" target="_blank" rel="noreferrer" onClick={()=>setMenu(false)}
          initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} transition={{delay:.43}}
        >GitHub ↗</motion.a>
      </motion.div>}
    </AnimatePresence>

    <div id="content">
      <section className="hero">
        <motion.div className="heroFx" style={reduce?undefined:{y:heroY,opacity:heroOpacity}} aria-hidden="true">
          <AeroShards
            backgroundColor="#f2eee7" shardColor="#b69b8c" accentColor="#9a6654"
            placement="full" flow="stream" material="pearl" detail="balanced"
            scale={1} spread={1.15} depth={1} speed={.32} spin={.48}
            interaction="repel" density={.72} shardSize={.78} turbulence={.62}
            glow={.22} edgeSoftness={2} bloom={.14} grain={.035}
            interactionRadius={1.2} interactionStrength={.24} rippleIntensity={.3}
          />
        </motion.div>
        <div className="heroFallback" aria-hidden="true"/><div className="heroVeil" aria-hidden="true"/>
        <div className="heroInner"><div className="heroColorBlock" aria-hidden="true"/><div className="heroStudioMark" aria-hidden="true">BUILD / LEARN / SHIP</div><div className="heroMarginNote" aria-hidden="true">NO TEMPLATE<br/>JUST ITERATION</div>
          <motion.div className="heroMeta" initial={{opacity:0,y:18}} animate={{opacity:1,y:0}} transition={{delay:.25,duration:.65}}>
            <span><i/>COMPUTER SCIENCE + ML</span><span>LNMIIT · JAIPUR</span>
          </motion.div>

          <h1 className="heroTitle">
            <span className="wordLine">
              {'I build useful'.split(' ').map((w,i)=><motion.b key={w} initial={{opacity:0,y:70,rotateX:-35}} animate={{opacity:1,y:0,rotateX:0}} transition={{delay:.15+i*.09,duration:.8,ease:[.16,1,.3,1]}}>{w}</motion.b>)}
            </span>
            <motion.em initial={{opacity:0,y:80,scale:.92}} animate={{opacity:1,y:0,scale:1}} transition={{delay:.48,duration:.9,ease:[.16,1,.3,1]}}>things.</motion.em>
          </h1>

          <motion.div className="heroBottom" initial={{opacity:0,y:35}} animate={{opacity:1,y:0}} transition={{delay:.7,duration:.75}}>
            <p>Software, machine learning and data products built with curiosity, clear thinking and a bias toward shipping.</p>
            <div className="heroActions">
              <MagneticLink className="button primary" href="#work">See my work <span>↓</span></MagneticLink>
              <MagneticLink className="button ghost" href="mailto:24DCS032@lnmiit.ac.in">Say hello <span>↗</span></MagneticLink>
            </div>
          </motion.div>

          <LiveSignal/>
        </div>
      </section>

      <section className="statement" id="about">
        <AmbientField/>
        <div className="marquee" aria-hidden="true">
          <motion.div animate={reduce?undefined:{x:['0%','-50%']}} transition={{duration:32,repeat:Infinity,ease:'linear'}}>
            <span>Good work takes patience.</span><span>Good work takes patience.</span><span>Good work takes patience.</span><span>Good work takes patience.</span>
          </motion.div>
        </div>
        <div className="statementGrid shell"><div className="statementBlock" aria-hidden="true"/>
          <Reveal className="statementLabel"><p className="eyebrow">01 / ABOUT</p></Reveal>
          <Reveal className="statementCopy" delay={.07}>
            <h2>I care about making things <em>clear, useful and real.</em></h2>
            <p className="lede">I’m a Computer Science student at LNMIIT Jaipur. I work across algorithms, machine learning, data and web development, and I learn best by turning ideas into working products.</p>
          </Reveal>
          <FieldNotebook/>
        </div>
      </section>

      <section className="process shell">
        <div className="sectionHead">
          <Reveal><p className="eyebrow">02 / PROCESS</p></Reveal>
          <Reveal delay={.06}><h2>A simple way to <em>keep moving.</em></h2></Reveal>
          <Reveal delay={.12}><p>No dramatic framework. Just a repeatable loop that helps me learn faster and build better.</p></Reveal>
        </div>

        <div className="stageGrid">
          {stages.map(([n,title,desc],i)=><motion.article
            key={n}
            initial={{opacity:0,y:45,scale:.88,rotate:i%2?2:-2}}
            whileInView={{opacity:1,y:0,scale:1,rotate:0}}
            viewport={{once:true,amount:.25}}
            transition={{type:'spring',stiffness:115,damping:16,delay:i*.08}}
            whileHover={reduce?undefined:{y:-10,scale:1.025,rotate:i%2?-.6:.6}}
          >
            <div className="stageTop"><span>{n}</span><b>{title}</b><motion.i animate={reduce?undefined:{rotate:[0,90,0]}} transition={{duration:3,repeat:Infinity,delay:i*.35}}>+</motion.i></div>
            <p>{desc}</p>
          </motion.article>)}
        </div>

      </section>

      <section className="work shell" id="work"><div className="workColorBlock" aria-hidden="true"/>
        <div className="sectionHead split">
          <Reveal><div><p className="eyebrow">03 / SELECTED WORK</p><h2>Things I’ve <em>actually built.</em></h2></div></Reveal>
          <Reveal delay={.1}><MagneticLink className="textLink" href="https://github.com/divbytes-prog" external>All repositories ↗</MagneticLink></Reveal>
        </div>
        <Reveal className="renderFeature">
          <div className="renderFeatureCopy">
            <span>PROJECT / 03A</span>
            <p>Each project gets a live visual model that reflects what the project actually does.</p>
          </div>
          <RealtimeViewport/>
        </Reveal>
        <div className="projectGrid">{projects.map((project,i)=><TiltCard key={project.n} project={project} index={i}/>)}</div>
      </section>

      <section className="profile shell" id="stack"><div className="profileMark" aria-hidden="true">04</div>
        <div className="profileGrid">
          <Reveal>
            <p className="eyebrow">04 / PROFILE</p>
            <h2>Built on <em>fundamentals.</em></h2>
            <p className="lede small">B.Tech + M.Tech in Computer Science at LNMIIT. I’m still learning, but I care about understanding the basics deeply enough to build without guessing.</p>
          </Reveal>
          <div className="metrics">
            {[
              [250,'+','DSA problems'],
              [96,'','JEE Main %ile'],
              [92,'%','Class XII'],
              [2,'×','Olympiad gold']
            ].map(([v,s,label],i)=><motion.div key={label}
              initial={{opacity:0,scale:.82,y:30}}
              whileInView={{opacity:1,scale:1,y:0}}
              viewport={{once:true,amount:.5}}
              transition={{type:'spring',stiffness:120,damping:16,delay:i*.09}}
              whileHover={reduce?undefined:{scale:1.04,y:-5}}
            ><Counter value={v} suffix={s}/><span>{label}</span></motion.div>)}
          </div>
        </div>

        <div className="stack">
          {[
            ['LANGUAGES','Python · C++ · Java · JavaScript · SQL'],
            ['WEB','React · Node.js · Flask · Streamlit · HTML · CSS'],
            ['DATA / ML','Pandas · NumPy · Scikit-learn · Plotly · Matplotlib'],
            ['TOOLS','Git · GitHub · AWS · Tableau · Jupyter · VS Code']
          ].map(([a,b],i)=><motion.div key={a}
            initial={{opacity:0,x:i%2?-45:45}}
            whileInView={{opacity:1,x:0}}
            viewport={{once:true,amount:.5}}
            transition={{type:'spring',stiffness:100,damping:18,delay:i*.06}}
            whileHover={reduce?undefined:{x:8}}
          ><span>{a}</span><p>{b}</p><motion.b animate={reduce?undefined:{x:[0,7,0]}} transition={{duration:2.4,repeat:Infinity,delay:i*.25}}>↗</motion.b></motion.div>)}
        </div>
      </section>

      <section className="contact" id="contact">
        <motion.div className="contactGlow" aria-hidden="true" animate={reduce?undefined:{scale:[1,1.12,.95,1],x:[0,-40,25,0],y:[0,20,-15,0]}} transition={{duration:10,repeat:Infinity,ease:'easeInOut'}}/>
        <AmbientField/>
        <div className="shell contactInner">
          <Reveal><p className="eyebrow">05 / CONTACT</p></Reveal>
          <Reveal delay={.06}><h2>Have something interesting?<br/><em>Let’s talk.</em></h2></Reveal>
          <Reveal delay={.12}><p>Internships, collaborations, research, projects—or just a good technical conversation.</p></Reveal>
          <Reveal delay={.18}>
            <MagneticLink className="contactButton" href="mailto:24DCS032@lnmiit.ac.in"><span>24DCS032@LNMIIT.AC.IN</span><b>↗</b></MagneticLink>
          </Reveal>
        </div>
      </section>
    </div>

    <footer className="footer">
      <div className="shell footerInner">
        <Reveal><div className="footerBrand"><b>DS</b><span>Divyansh Singh</span></div></Reveal>
        <div className="footerLinks"><MagneticLink href="#top">Back to top ↑</MagneticLink><MagneticLink href="https://github.com/divbytes-prog" external>GitHub ↗</MagneticLink></div>
        <span className="copyright">© 2026 · Jaipur, India</span>
      </div>
    </footer>
  </main>
}

createRoot(document.getElementById('root')).render(<App/>);