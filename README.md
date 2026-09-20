# Divyansh Singh — Developer Portfolio

A production portfolio for presenting my software engineering, machine-learning, data-visualization, and full-stack product work. The site combines an editorial interface with interactive project architecture views and direct links to deployed applications.

## Live website

**Portfolio:** [divyansh-portfolio-pearl.vercel.app](https://divyansh-portfolio-pearl.vercel.app/)

## Live projects

| Project | What it demonstrates | Live website | Source |
|---|---|---|---|
| MoodTrip | Explainable mood-aware place recommendation and feedback learning | [Open app](https://mood-trip-chi.vercel.app/) | [GitHub](https://github.com/divbytes-prog/MoodTrip) |
| Career Assistant | AI-assisted career exploration, salary insights, roadmaps, and chatbot guidance | [Open app](https://carrier-assistant.vercel.app/) | [GitHub](https://github.com/divbytes-prog/Carrier-Assistant) |
| India Data Dashboard | Interactive district map, demographic KPIs, filters, charts, and data exploration | [Open dashboard](https://dashboard-liard-seven-19.vercel.app/) | [GitHub](https://github.com/divbytes-prog/dashboard) |
| Startup Funding Analyser | Funding KPIs, trends, startup analysis, and investor activity | [Open dashboard](https://startup-funding-analyser.vercel.app/) | [GitHub](https://github.com/divbytes-prog/startup-funding-analyser) |
| QuickDine | Restaurant discovery, authentication, table booking, and role-based dashboards | [Open app](https://quick-dine-zeta-one.vercel.app/) | [GitHub](https://github.com/divbytes-prog/QuickDine) |
| Hearthlog | A cozy life-RPG with tasks, XP, streaks, attributes, and rewards | [Open app](https://hearthlog-web.vercel.app/) | [GitHub](https://github.com/divbytes-prog/Hearthlog) |

Every project card on the portfolio opens the corresponding live application in a new tab. Source-code links remain available in the table above and through my GitHub profile.

## Portfolio highlights

- Custom responsive editorial layout for desktop and mobile
- Animated project cards with pointer-driven tilt and lighting
- Interactive architecture visualization for featured projects
- Direct live-demo navigation for every displayed project
- Dedicated About, FAQ, Privacy, and Terms pages
- Integrated MoodTrip product experience and serverless API routes
- Reduced-motion support and keyboard-accessible navigation
- Production deployment through Vercel with GitHub integration

## Technology stack

| Area | Technologies |
|---|---|
| UI | React 19, semantic HTML, custom CSS |
| Build | Vite 8 |
| Motion | Motion for React |
| Visuals | VGPU, AeroShards, React Icons |
| Maps | Leaflet |
| Testing | Vitest, Playwright |
| APIs | Vercel Functions |
| Deployment | Vercel, GitHub |

## Project structure

```text
api/                  Serverless API handlers
ml/                   MoodTrip training pipeline and model documentation
src/                  React application, components, visuals, and styles
tests/                Browser end-to-end tests
.github/workflows/    Continuous integration workflows
index.html            Vite application entry document
vercel.json           Production routing and deployment configuration
```

## Run locally

Requirements: Node.js 20+ and npm.

```bash
git clone https://github.com/divbytes-prog/divyansh-portfolio.git
cd divyansh-portfolio
npm install
npm run dev
```

Vite prints the local development URL after startup.

## Quality checks

```bash
npm test
npm run build
npm run test:e2e
```

- `npm test` runs the unit-test suite.
- `npm run build` creates the optimized production bundle.
- `npm run test:e2e` builds the site and runs Playwright browser tests.

## Deployment

The `main` branch is connected to Vercel. Successful commits create production deployments automatically. Client-side application routes are handled through the repository's Vercel routing configuration.

## Contact

- Email: [24DCS032@lnmiit.ac.in](mailto:24DCS032@lnmiit.ac.in)
- GitHub: [divbytes-prog](https://github.com/divbytes-prog)
- Portfolio: [divyansh-portfolio-pearl.vercel.app](https://divyansh-portfolio-pearl.vercel.app/)

---

Built and maintained by [Divyansh Singh](https://github.com/divbytes-prog).
