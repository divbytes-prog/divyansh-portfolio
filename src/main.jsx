import React,{useEffect,useState}from'react';
import{createRoot}from'react-dom/client';
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

function App(){
  const[menu,setMenu]=useState(false);

  useEffect(()=>{
    const revealEls=[...document.querySelectorAll('[data-reveal]')];
    if(!('IntersectionObserver'in window)){
      revealEls.forEach(el=>el.classList.add('is-visible'));
      return;
    }
    const io=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },{threshold:.12,rootMargin:'0px 0px -6% 0px'});
    revealEls.forEach(el=>io.observe(el));
    return()=>io.disconnect();
  },[]);

  useEffect(()=>{
    document.body.classList.toggle('menu-open',menu);
    const onKey=e=>{if(e.key==='Escape')setMenu(false)};
    const onResize=()=>{if(window.innerWidth>840)setMenu(false)};
    window.addEventListener('keydown',onKey);
    window.addEventListener('resize',onResize);
    return()=>{
      document.body.classList.remove('menu-open');
      window.removeEventListener('keydown',onKey);
      window.removeEventListener('resize',onResize);
    };
  },[menu]);

  return <main id="top">
    <a className="skipLink" href="#content">Skip to content</a>

    <nav className="nav" aria-label="Main navigation">
      <a className="wordmark" href="#top" aria-label="Divyansh Singh, back to top">
        <span>DIVYANSH</span><b>SINGH</b>
      </a>

      <button
        className="menuButton"
        type="button"
        aria-expanded={menu}
        aria-controls="site-menu"
        onClick={()=>setMenu(v=>!v)}
      >
        {menu?'CLOSE':'MENU'}
      </button>

      <div id="site-menu" className={menu?'navlinks open':'navlinks'}>
        <a href="#about" onClick={()=>setMenu(false)}>About</a>
        <a href="#work" onClick={()=>setMenu(false)}>Work</a>
        <a href="#stack" onClick={()=>setMenu(false)}>Stack</a>
        <a href="#contact" onClick={()=>setMenu(false)}>Contact</a>
        <a className="navArrow" href="https://github.com/divbytes-prog" target="_blank" rel="noreferrer" aria-label="GitHub profile, opens in new tab">↗</a>
      </div>
    </nav>

    <div id="content">
      <section className="hero" aria-labelledby="hero-title">
        <div className="heroFx" aria-hidden="true">
          <AeroShards
            backgroundColor="#f4f0ea"
            shardColor="#b8aa9d"
            accentColor="#8a6f60"
            placement="full"
            flow="stream"
            material="pearl"
            detail="balanced"
            scale={1}
            spread={1.15}
            depth={1}
            speed={0.28}
            spin={0.45}
            interaction="repel"
            density={0.65}
            shardSize={0.75}
            turbulence={0.55}
            glow={0.2}
            edgeSoftness={2}
            bloom={0.12}
            grain={0.035}
            interactionRadius={1.15}
            interactionStrength={0.22}
            rippleIntensity={0.25}
          />
        </div>
        <div className="heroFallback" aria-hidden="true"/>
        <div className="heroVeil" aria-hidden="true"/>

        <div className="heroInner">
          <div className="heroMeta" data-reveal>
            <span><i/>COMPUTER SCIENCE + ML</span>
            <span>LNMIIT · JAIPUR</span>
          </div>

          <h1 id="hero-title">
            <span>I build useful</span>
            <em>things.</em>
          </h1>

          <div className="heroBottom" data-reveal>
            <p>Software, machine learning and data products built with curiosity, clear thinking and a bias toward shipping.</p>
            <div className="heroActions">
              <a className="button primary" href="#work">See my work <span>↓</span></a>
              <a className="button ghost" href="mailto:24DCS032@lnmiit.ac.in">Say hello <span>↗</span></a>
            </div>
          </div>
        </div>
      </section>

      <section className="statement" id="about">
        <div className="marquee" aria-hidden="true">
          <div>
            <span>Good work takes patience.</span><span>Good work takes patience.</span>
            <span>Good work takes patience.</span><span>Good work takes patience.</span>
          </div>
        </div>

        <div className="statementGrid shell" data-reveal>
          <p className="eyebrow">01 / ABOUT</p>
          <div>
            <h2>I care about making things <em>clear, useful and real.</em></h2>
            <p className="lede">I’m a Computer Science student at LNMIIT Jaipur. I work across algorithms, machine learning, data and web development, and I learn best by turning ideas into working products.</p>
          </div>
        </div>
      </section>

      <section className="process shell">
        <div className="sectionHead" data-reveal>
          <p className="eyebrow">02 / PROCESS</p>
          <h2>A simple way to <em>keep moving.</em></h2>
          <p>No dramatic framework. Just a repeatable loop that helps me learn faster and build better.</p>
        </div>

        <div className="stageGrid">
          {stages.map(([n,title,desc])=>
            <article key={n} data-reveal>
              <div className="stageTop"><span>{n}</span><b>{title}</b><i>+</i></div>
              <p>{desc}</p>
            </article>
          )}
        </div>

        <div className="flow" aria-label="Build process: question to code to system to product" data-reveal>
          <span>QUESTION</span><i/><span>CODE</span><i/><span>SYSTEM</span><i/><span>PRODUCT</span>
        </div>
      </section>

      <section className="work shell" id="work">
        <div className="sectionHead split" data-reveal>
          <div>
            <p className="eyebrow">03 / SELECTED WORK</p>
            <h2>Things I’ve <em>actually built.</em></h2>
          </div>
          <a className="textLink" href="https://github.com/divbytes-prog" target="_blank" rel="noreferrer">All repositories ↗</a>
        </div>

        <div className="projectGrid">
          {projects.map(project=>
            <a
              className="projectCard"
              key={project.n}
              href={project.href}
              target="_blank"
              rel="noreferrer"
              data-reveal
              aria-label={project.title+', opens GitHub repository in new tab'}
            >
              <div className="projectMeta"><span>{project.n}</span><small>{project.tags}</small></div>
              <div className="projectCopy">
                <h3>{project.title}</h3>
                <p>{project.desc}</p>
              </div>
              <div className="projectAction"><span>View repository</span><b>↗</b></div>
            </a>
          )}
        </div>
      </section>

      <section className="profile shell" id="stack">
        <div className="profileGrid">
          <div data-reveal>
            <p className="eyebrow">04 / PROFILE</p>
            <h2>Built on <em>fundamentals.</em></h2>
            <p className="lede small">B.Tech + M.Tech in Computer Science at LNMIIT. I’m still learning, but I care about understanding the basics deeply enough to build without guessing.</p>
          </div>

          <div className="metrics">
            <div data-reveal><strong>250+</strong><span>DSA problems</span></div>
            <div data-reveal><strong>96</strong><span>JEE Main %ile</span></div>
            <div data-reveal><strong>92%</strong><span>Class XII</span></div>
            <div data-reveal><strong>2×</strong><span>Olympiad gold</span></div>
          </div>
        </div>

        <div className="stack" data-reveal>
          <div><span>LANGUAGES</span><p>Python · C++ · Java · JavaScript · SQL</p></div>
          <div><span>WEB</span><p>React · Node.js · Flask · Streamlit · HTML · CSS</p></div>
          <div><span>DATA / ML</span><p>Pandas · NumPy · Scikit-learn · Plotly · Matplotlib</p></div>
          <div><span>TOOLS</span><p>Git · GitHub · AWS · Tableau · Jupyter · VS Code</p></div>
        </div>
      </section>

      <section className="contact" id="contact">
        <div className="contactGlow" aria-hidden="true"/>
        <div className="shell contactInner" data-reveal>
          <p className="eyebrow">05 / CONTACT</p>
          <h2>Have something interesting?<br/><em>Let’s talk.</em></h2>
          <p>Internships, collaborations, research, projects—or just a good technical conversation.</p>
          <a className="contactButton" href="mailto:24DCS032@lnmiit.ac.in">
            <span>24DCS032@LNMIIT.AC.IN</span><b>↗</b>
          </a>
        </div>
      </section>
    </div>

    <footer className="footer">
      <div className="shell footerInner">
        <div className="footerBrand"><b>DS</b><span>Divyansh Singh</span></div>
        <div className="footerLinks">
          <a href="#top">Back to top ↑</a>
          <a href="https://github.com/divbytes-prog" target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
        <span className="copyright">© 2026 · Jaipur, India</span>
      </div>
    </footer>
  </main>
}

createRoot(document.getElementById('root')).render(<App/>);