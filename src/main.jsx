import React from 'react';
import { createRoot } from 'react-dom/client';
import AeroShards from './AeroShards';
import './styles.css';

const projects=[
['01','Real Estate ML Application','Machine learning system for price prediction, feature engineering, model comparison, analytics and recommendations.','ML · Python · Streamlit · AWS'],
['02','India Data Visualization','Interactive dashboard exploring 120+ demographic and socioeconomic indicators across India.','Data · Plotly · Streamlit'],
['03','NLP Application Suite','Natural-language tools built around practical NLP workflows and accessible interfaces.','NLP · Python · AI'],
['04','Career Assistant','Career guidance product with personalized roadmaps, salary insights, learning discovery and AI assistance.','React · TypeScript · AI']
];
const skills=['Python','C++','Java','JavaScript','SQL','React','Node.js','Flask','Streamlit','Pandas','NumPy','Scikit-learn','Plotly','AWS','Tableau','Git'];
function App(){return <main>
<section className="hero" id="home"><div className="aero"><AeroShards backgroundColor="#120F17" shardColor="#896ABD" accentColor="#A855F7" placement="full" flow="stream" material="pearl" detail="balanced" effect="none" scale={1} spread={1} depth={1} speed={1} spin={1} interaction="repel" density={1.5} shardSize={1.1} stretch={1} turbulence={1} glow={1} edgeSoftness={2} bloom={0.5} grain={0.05} chromaticAberration={0.0075} transitionDuration={1} interactionRadius={1.5} interactionStrength={0.5} rippleIntensity={1} holdToGather={true}/></div>
<nav><a className="logo" href="#home">DIVYANSH<span>↗</span></a><div><a href="#about">ABOUT</a><a href="#work">WORK</a><a href="#stack">STACK</a><a href="#contact">CONTACT</a></div></nav>
<div className="heroContent"><div className="micro">COMPUTER SCIENCE · MACHINE LEARNING · WEB</div><h1>Divyansh<br/><i>Singh.</i></h1><p>I build intelligent products from data, code and curiosity — from ML systems to interactive web experiences.</p><div className="actions"><a className="solid" href="#work">EXPLORE MY WORK ↘</a><a href="https://github.com/divbytes-prog" target="_blank">GITHUB ↗</a></div></div>
<div className="heroFoot"><span>LNMIIT · JAIPUR</span><span>PRESS & HOLD THE SHARDS</span><span>2024—2029</span></div></section>

<section className="about wrap" id="about"><div className="sectionNo">01 / ABOUT</div><div className="aboutGrid"><h2>Learning deeply.<br/>Building <em>constantly.</em></h2><div className="copy"><p>I’m a Computer Science student at LNMIIT, working across machine learning, data science and full-stack development.</p><p>I care about the full journey: understanding the problem, building the model, designing the interface and getting the result into people’s hands.</p></div></div><div className="stats"><div><b>250+</b><span>DSA PROBLEMS</span></div><div><b>96</b><span>JEE MAIN %ILE</span></div><div><b>92%</b><span>CLASS XII</span></div><div><b>2×</b><span>OLYMPIAD GOLD</span></div></div></section>

<section className="work wrap" id="work"><div className="sectionNo">02 / SELECTED WORK</div><div className="workHead"><h2>Things I’ve<br/><em>made real.</em></h2><a href="https://github.com/divbytes-prog" target="_blank">VIEW GITHUB ↗</a></div><div className="projects">{projects.map(([n,t,d,s])=><article key={n}><span className="num">{n}</span><div><h3>{t}</h3><p>{d}</p><small>{s}</small></div><span className="arrow">↗</span></article>)}</div></section>

<section className="stack wrap" id="stack"><div className="sectionNo">03 / STACK</div><div className="stackGrid"><h2>Tools I use to<br/><em>ship ideas.</em></h2><div className="skillCloud">{skills.map(x=><span key={x}>{x}</span>)}</div></div></section>

<section className="contact wrap" id="contact"><div className="sectionNo">04 / CONTACT</div><p>HAVE AN IDEA, INTERNSHIP OR COLLABORATION?</p><h2>Let’s build something<br/><em>worth remembering.</em></h2><a className="mail" href="mailto:24DCS032@lnmiit.ac.in">24DCS032@lnmiit.ac.in ↗</a></section>
<footer className="wrap"><span>DIVYANSH SINGH © 2026</span><span>COMPUTER SCIENCE · LNMIIT</span><a href="#home">BACK TO TOP ↑</a></footer>
</main>}
createRoot(document.getElementById('root')).render(<App/>);