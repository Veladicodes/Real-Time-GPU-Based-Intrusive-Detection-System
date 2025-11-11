# RT-GIDS Command Interface

Tier-0 real-time React/Next.js dashboard for the **Real-Time GPU Intrusion Detection System (RT-GIDS)**.  
Streams telemetry from the FastAPI backend, visualises live attacks, and surfaces AI/analytics intelligence with cinematic tactical styling.

## Features

- 🔄 **Live telemetry** via WebSocket log tail with auto-reconnect, sound cues (Howler), and persistent history cache.
- 📊 **Command Center** summary with neon StatBoxes, live log stream, threat gauge, and attack frequency wave.
- ⚠️ **Threat Analytics** dashboard combining anomaly timeline, 3D globe hotspots, and live threat table fed from `/api/metrics/threats`.
- 🧠 **Model Insights** view showing top feature importance, on-demand AI summaries, and model transparency.
- 🛠️ **System Diagnostics** monitor with maintenance mode, system scan pulses, and GPU/pipeline telemetry.
- 🎛️ **Global UX**: neon scanlines, floating particles, UTC clock, FPS indicator, and responsive layout down to 1024px.
- 🎧 **Narration Engine**: contextual TTS with queueing, mute/volume controls, and concise/verbose modes accessible from the top toolbar.
- 🧩 **Data Layer**: Axios hooks for `/api/metrics`, `/api/threat-level`, `/api/top-ips`, `/api/model-info`, `/api/model/insights`, `/api/model/insights/generate`, `/api/metrics/threats`, `/api/metrics/anomalies`, `/api/metrics/system`, `/api/health`, `/api/attack-frequency`.

## Getting Started

1. Ensure the FastAPI backend is running (see `/backend` directory).
2. Copy environment template:

```bash
cp .env.local.example .env.local # if you create one
```

The project already includes `.env.local` with:

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/logs
```

Adjust the URLs if your backend runs elsewhere.

3. Install dependencies (run from `frontend/`):

```bash
pnpm install
pnpm add axios howler framer-motion recharts three
pnpm run check-theme
```

4. Start the dev server:

```bash
pnpm run dev
```

5. Build & preview production bundle:

```bash
pnpm run build
pnpm run preview
```

## Key Components & Hooks

- `hooks/useFetchMetrics` – polls `/api/metrics`, caches results.
- `hooks/useWebSocketLogs` – streams `/ws/logs`, throttled updates, audio alerts, persistent log cache.
- `hooks/useThreatAnalytics` – aggregates `/api/metrics/threats` + `/api/metrics/anomalies` for Threat Analytics.
- `hooks/useModelInsightsData` – fetches feature importance and AI summaries.
- `hooks/useSystemDiagnostics` – retrieves hardware/pipeline telemetry.
- `components/ui/StatBox` – animated metric tiles with neon pulses.
- `components/threat/*` – anomaly timeline, globe, and table primitives for the analytics tab.
- `components/model/*` – feature importance bar chart and animated insight cards.
- `components/system/*` – system status cards and particle backdrop for diagnostics.
- `components/rt-gids/*` – Command Center primitives (threat gauge, live log, AI core, diagnostics modal, console).

## Testing the Stack

- Backend health: `curl http://localhost:8000/api/health`
- Threat level: `curl http://localhost:8000/api/threat-level`
- WebSocket: connect to `ws://localhost:8000/ws/logs` and append log lines in `RealTime_IDS/logs`.
- Frontend: open `http://localhost:3000` and verify live updates, gauges, audio cues, and animations.

## Build Notes

- Framework: Next.js 14 (app router) + TypeScript + TailwindCSS + Radix UI.
- Styling: matte black/orange tactical palette, Orbitron/JetBrains Mono fonts.
- Animations: Framer Motion.
- Charts: Recharts.
- Audio: Howler with placeholder MP3s at `public/sounds/{alert,normal}.mp3`.
- 3D: Three.js inside diagnostics modal.
- Fonts: Local TTF files stored under `public/fonts/` (Orbitron regular/bold, JetBrains Mono regular). Replace with licensed variants if desired and keep filenames identical.

## Theme Guard

The `pnpm run check-theme` script scans the repository for disallowed accent colors (cyan/magenta, etc.). Ensure it passes before committing UI changes.

## Brand Token Rules

- All primary colors live in `components/theme/ThemeProvider.tsx` and `styles/globals.css`.
- Use Tailwind classes (`bg-brand`, `text-brand`, `bg-surface`, `text-text`, etc.) so components pull directly from the shared CSS variables.
- Do not introduce new hex codes in JSX/TSX. If you need a new shade, add a CSS variable in the theme provider and map it in Tailwind.
- Keep backgrounds neutral (`--bg` / `--surface`) and let `--brand-orange` drive glows, borders, and primary CTAs.

## Adding a New Accent

Micro-accents (icons, small badges) can use additional variables, but they must be defined centrally:

1. Add the accent variable to `ThemeProvider.tsx` and `globals.css`.
2. Map it in `tailwind.config.ts` (e.g., `colors.accentSecondary = "var(--accent-secondary)"`).
3. Limit usage to subtle highlights—never large backgrounds or CTAs.
4. Re-run `pnpm run check-theme` to ensure no stray hex slips through.

## Navigation

- **Command Center** – real-time telemetry, live logs, and top attacker statistics.
- **Threat Analytics** – anomaly timeline, threat map, and IP table with WebSocket pulses.
- **Model Insights** – feature importance visualization and AI-generated summaries.
- **System Diagnostics** – GPU/pipeline health, system scan, and maintenance controls.

## Future Enhancements

- Replace placeholder audio with production-grade cues.
- Share telemetry context across pages to avoid duplicate WebSocket clients.
- Expand responsiveness under 1024px and add role-based auth for command console actions.

Welcome to the RT-GIDS command interface. Stay vigilant. 🛡️
