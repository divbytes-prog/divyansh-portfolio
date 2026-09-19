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
    <div className="radar">
      <motion.div className="orbit one" animate={reduce?undefined:{rotate:360}} transition={{duration:14,repeat:Infinity,ease:'linear'}}>
        <span/>
      </motion.div>
      <motion.div className="orbit two" animate={reduce?undefined:{rotate:-360}} transition={{duration:9,repeat:Infinity,ease:'linear'}}>
        <span/>
      </motion.div>
      <motion.div className="pulseDot" animate={reduce?undefined:{scale:[1,1.8,1],opacity:[.9,.35,.9]}} transition={{duration:2.2,repeat:Infinity}}/>
      <div className="cross x"/><div className="cross y"/>
    </div>
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
            backgroundColor="#f4f0ea" shardColor="#b8aa9d" accentColor="#8a6f60"
            placement="full" flow="stream" material="pearl" detail="balanced"
            scale={1} spread={1.15} depth={1} speed={.32} spin={.48}
            interaction="repel" density={.72} shardSize={.78} turbulence={.62}
            glow={.22} edgeSoftness={2} bloom={.14} grain={.035}
            interactionRadius={1.2} interactionStrength={.24} rippleIntensity={.3}
          />
        </motion.div>
        <div className="heroFallback" aria-hidden="true"/><div className="heroVeil" aria-hidden="true"/>
        <div className="heroInner">
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
        <div className="statementGrid shell">
          <Reveal><p className="eyebrow">01 / ABOUT</p></Reveal>
          <Reveal delay={.07}>
            <h2>I care about making things <em>clear, useful and real.</em></h2>
            <p className="lede">I’m a Computer Science student at LNMIIT Jaipur. I work across algorithms, machine learning, data and web development, and I learn best by turning ideas into working products.</p>
          </Reveal>
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

        <Reveal className="flowWrap">
          <div className="flow" aria-label="Build process: question to code to system to product">
            {['QUESTION','CODE','SYSTEM','PRODUCT'].map((item,i)=><React.Fragment key={item}>
              <motion.span whileHover={{scale:1.08,color:'#8a6f60'}}>{item}</motion.span>
              {i<3&&<div className="flowLine"><motion.i animate={reduce?undefined:{x:['-100%','120%']}} transition={{duration:2.4,repeat:Infinity,delay:i*.32,ease:'easeInOut'}}/></div>}
            </React.Fragment>)}
          </div>
        </Reveal>
      </section>

      <section className="work shell" id="work">
        <div className="sectionHead split">
          <Reveal><div><p className="eyebrow">03 / SELECTED WORK</p><h2>Things I’ve <em>actually built.</em></h2></div></Reveal>
          <Reveal delay={.1}><MagneticLink className="textLink" href="https://github.com/divbytes-prog" external>All repositories ↗</MagneticLink></Reveal>
        </div>
        <div className="projectGrid">{projects.map((project,i)=><TiltCard key={project.n} project={project} index={i}/>)}</div>
      </section>

      <section className="profile shell" id="stack">
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