# Homebase Cortex — i2systems HQ Edition

> **📚 Documentation**: See [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md) for complete documentation navigation.  
> **🤖 AI Assistants**: Start with [AI_NOTES.md](./AI_NOTES.md) for patterns and quick reference.

A **people-first** workspace management tool for the i2systems headquarters. This is a specialized variant of the Fusion/Cortex platform, tailored for a single site with an emphasis on personnel, teams, and the workspace environment rather than large-scale device commissioning.

**Current Architecture (2025)**: Zustand stores + tRPC + Next.js 14 App Router. Legacy Context API files exist for compatibility but are deprecated.

## 📋 Table of Contents

- [About This Variant](#-about-this-variant)
- [Purpose](#-purpose)
- [Architecture](#-architecture)
- [Design System](#-design-system)
- [Core Features](#-core-features)
- [Getting Started](#-getting-started)
- [Development](#-development)
- [Deployment](#-deployment)
- [Additional Documentation](#-additional-documentation)

## 🏢 About This Variant

**Homebase Cortex** is a derivative of the main Fusion/Cortex commissioning platform, purpose-built for the **i2systems headquarters**. 

**Key Differences from Fusion/Cortex:**

| Aspect | Fusion/Cortex (Main) | Homebase Cortex (This App) |
|--------|---------------------|---------------------------|
| **Focus** | Devices & commissioning | People & workspace |
| **Sites** | Multi-site (thousands) | Single site (i2systems HQ) |
| **Primary Users** | Field technicians | i2systems employees |
| **Data Model** | Device-centric | People-centric |
| **Scale** | Enterprise retail deployments | One headquarters building |

This variant prioritizes:
- **People & Teams** — Who sits where, team locations, desk assignments
- **Space Management** — Meeting rooms, common areas, workspace zones
- **Device Context** — Lighting and sensors as they relate to people's spaces
- **Single Building** — Optimized UX for navigating one familiar location

## 🎯 Purpose

Homebase Cortex is:
- A **people-first** workspace and location tool for i2systems HQ
- A way to find colleagues, teams, and meeting spaces
- A bridge between physical devices (fixtures, motion sensors) and the people who use them
- Optimized for a **single site** — the i2systems headquarters

Homebase Cortex is **not**:
- A multi-site commissioning tool (see Fusion/Cortex for that)
- A field technician's deployment platform
- An energy analytics/heatmap tool
- A BMS replacement

## 🏗️ Architecture

### Tech Stack

- **Frontend**: Next.js 14 (App Router) + React + Tailwind CSS
- **UI Components**: Custom components with design tokens
- **Canvas Rendering**: react-konva for map/blueprint visualization
- **API**: tRPC for type-safe API calls
- **Database**: PostgreSQL with Prisma ORM
- **State Management**: Zustand stores (`lib/stores/`) + Sync hooks (`lib/stores/use*Sync.ts`)
  - ⚠️ **Note**: Legacy Context API files exist for compatibility but are deprecated. New code should use Zustand stores.
- **Data Persistence**: localStorage (client-side, site-scoped) + IndexedDB (for future image storage)
- **Caching**: Redis (for future use)
- **Auth**: Auth.js (NextAuth) (to be configured)
- **Workers**: Node.js workers (for background tasks)

### Project Structure

```
/
├── app/                    # Next.js App Router
│   ├── (main)/            # Main layout group
│   │   ├── dashboard/      # HQ Dashboard (single site)
│   │   ├── people/        # 👥 People directory (PRIMARY)
│   │   ├── teams/         # 👥 Teams & groups (PRIMARY)
│   │   ├── map/           # HQ floor plan & locations
│   │   ├── zones/         # Spaces & zones section
│   │   ├── bacnet/        # BACnet Mapping section
│   │   ├── rules/         # Rules & Automation section
│   │   ├── lookup/        # Device Lookup section
│   │   ├── faults/        # Faults / Health section
│   │   └── layout.tsx     # Main layout wrapper
│   ├── api/trpc/          # tRPC API route
│   ├── globals.css        # Global styles & theme imports
│   ├── styles/            # CSS Architecture
│   │   ├── themes/        # Individual theme files (dark.css, light.css, etc.)
│   │   ├── base.css       # Core HSL variable definitions
│   │   ├── components.css # Component-specific overrides
│   │   └── utilities.css  # Utility classes
│   └── layout.tsx         # Root layout
├── components/
│   ├── layout/            # Layout components (Nav, TopBar, Panels)
│   ├── map/               # Map visualization components
│   ├── lookup/            # Device lookup components
│   ├── zones/             # Zone management components
│   ├── rules/             # Rules & overrides components
│   ├── dashboard/         # Dashboard components
│   ├── firmware/          # Firmware management components
│   ├── faults/            # Faults & Health components
│   ├── bacnet/            # BACnet mapping components
│   ├── stories/           # Storybook components
│   └── shared/            # Shared components
│       ├── FocusedObjectModal.tsx  # Reusable modal for detailed entity views
│       ├── FocusedModalTabs.tsx   # Tab navigation for focused modals
│       ├── ErrorBoundary.tsx      # Error recovery component
│       └── PanelEmptyState.tsx    # Empty state component
├── server/
│   └── trpc/              # tRPC setup & routers
│       ├── routers/       # Feature-specific routers
│       └── trpc.ts        # Base tRPC config
├── prisma/
│   └── schema.prisma      # Database schema
└── lib/                   # Shared utilities & stores
    ├── stores/            # Zustand stores (current state management)
    │   ├── personStore.ts # 👥 People/employee data (PRIMARY)
    │   ├── groupStore.ts  # 👥 Teams/groups (PRIMARY)
    │   ├── deviceStore.ts
    │   ├── zoneStore.ts
    │   ├── ruleStore.ts
    │   ├── siteStore.ts
    │   ├── mapStore.ts
    │   └── use*Sync.ts    # Sync hooks bridge tRPC ↔ stores
    ├── hooks/             # React hooks
    │   ├── usePeople.ts   # 👥 People data hook (PRIMARY)
    │   ├── useGroups.ts   # 👥 Teams/groups hook (PRIMARY)
    │   ├── useDevices.ts  # Device data hook (uses store)
    │   ├── useZones.ts    # Zone data hook (uses store)
    │   ├── useRules.ts    # Rule data hook (uses store)
    │   ├── useSite.ts     # Site data hook (uses store)
    │   ├── useErrorHandler.ts  # Centralized error handling
    │   └── useUndoable.ts      # Undo/redo functionality
    ├── [Feature]Context.tsx  # ⚠️ DEPRECATED - Compatibility layer only
    ├── ToastContext.tsx  # Toast notification system
    ├── ZoomContext.tsx   # Zoom state and interaction hints
    ├── mockData.ts        # Mock data generators
    └── siteData.ts       # Site-specific data generation
```

## 🎨 Design System

### Design Tokens

All design values are defined as CSS custom properties in `app/globals.css`. This enables:
- Easy theming (swap dark/light themes)
- Consistent spacing, colors, typography
- No hard-coded values in components

**Theme Architecture:**
- **Themes**: Located in `app/styles/themes/`. Each file (`dark.css`, `warm-night.css`) defines the full set of CSS variables.
- **Base**: `app/styles/base.css` defines the core HSL variables and default values.
- **Components**: `app/styles/components.css` contains component-specific overrides and legacy token styles.
- **Globals**: `app/globals.css` serves as the entry point, importing all themes and base styles.

**Key Token Categories:**
- Colors (backgrounds, borders, text, primary, status)
- Spacing (4px base unit scale)
- Border radius
- Shadows (layered, modern, neumorphic)
- Typography (system fonts)
- Transitions
- Z-index layers

**AI Note**: Always use design tokens (`var(--color-primary)`) instead of hard-coded values. To modify a theme, edit the specific file in `app/styles/themes/`.


### Component Library & Storybook

The project includes a Storybook instance for component inspection and design token documentation.

**To run Storybook:**
```bash
npm run storybook
```

Then open `http://localhost:6006` or click "Open Storybook" in Settings → About.

**Storybook includes:**
- **Design tokens reference** - Complete documentation of all CSS custom properties
- **Theme system** - Switch between all 9 themes (dark, light, high-contrast, warm-night, warm-day, glass-neumorphism, business-fluent, on-brand, on-brand-glass) using the toolbar selector
- **Atomic component stories** - Button, Card, DataChip, and more
- **Visual regression testing** - Test components across different themes
- **Component interaction testing** - Interactive component playground

**Theme Switching:**
Use the **Theme** selector in the Storybook toolbar (top right) to preview components in all available themes. All components automatically adapt using design tokens.

**Access from the app:**
- Settings → About → "Open Storybook" button
- Or navigate to `/storybook` (development only)

### Layout System

The app uses a **main + panel** system:

1. **Left Navigation** (80px wide, persistent)
   - Minimal icons only
   - Navigation items with active states
   - Profile & settings at bottom

2. **Top App Bar** (via PageTitle component)
   - Site selector dropdown
   - Breadcrumb navigation

3. **Main Content Area** (center, flexible)
   - Primary working surface per section
   - Scrollable when needed
   - Uses `px-[20px]` padding for consistency

4. **Right Context Panel** (384px wide, always visible on relevant pages)
   - Device details
   - Zone properties
   - Rule preview
   - Site details (on dashboard)

5. **Bottom Drawer** (collapsible)
   - Status information
   - Fault summary
   - Notifications

## 📋 Core Features

### 1. People & Teams (Primary)
- **Directory**: Find colleagues by name, team, or role
- **Team Views**: See who's on each team and where they sit
- **Desk/Space Assignments**: Visual mapping of who sits where
- **Profiles**: Contact info, role, team membership
- **Search**: Quick lookup of any employee at HQ

### 2. HQ Dashboard
- Overview of the i2systems headquarters
- People counts by floor/area
- Quick navigation to spaces and teams
- Building status and occupancy

### 3. Locations & Map
- Interactive floor plan of i2systems HQ
- See people's locations overlaid on the map
- Device visualization (fixtures, sensors) as secondary layer
- Zoom, pan, and explore the building
- Find people and navigate to their workspace

### 4. Spaces & Zones
- Define workspaces, meeting rooms, common areas
- Assign people and teams to zones
- Color-coded areas for easy navigation
- Zone-based lighting and device grouping

### 5. Device Lookup
- Search by device ID or serial number
- Map highlight of device location
- I2QR details: build date, CCT, warranty, parts list
- Focused modal view with tabs (Overview, Metrics, History, Related)
- Context: which people/spaces use this device

### 6. Rules & Automation
- Alexa-style rule builder:
  - Trigger (motion, no motion, daylight, BMS)
  - Condition (zone, duration, threshold)
  - Action (set zones, dim, return to BMS)
- Space-aware rules (e.g., "When meeting room is empty...")
- Human-readable preview in right panel

### 7. Faults / Health
- Summary counts (missing, offline, duplicates)
- Click to see filtered device table
- Impact view: which spaces are affected
- Focused modal view with comprehensive fault details

### 8. BACnet Mapping
- Table: Zone ↔ BACnet Object ID
- Inline editing of IDs
- Status: Connected / Error / Not Assigned
- Validation help in right panel

## 🏢 Single-Site Architecture

Unlike the main Fusion/Cortex platform which manages thousands of sites, Homebase Cortex is optimized for a **single site** — the i2systems headquarters.

**Benefits of Single-Site Focus:**
- Simplified navigation (no site switching)
- Faster load times (no multi-site data overhead)
- Tailored UX for familiar spaces
- People-centric data model without site isolation complexity

**Technical Notes:**
- **Site Store**: Zustand store (`lib/stores/siteStore.ts`) manages the headquarters site data
- **Site Sync**: `lib/stores/useSiteSync.ts` handles tRPC ↔ store synchronization
- **State Hydration**: `StateHydration` component initializes stores from database on app load

**People & Groups System:**
- **People Store**: `lib/stores/personStore.ts` manages employee data
- **Group Store**: `lib/stores/groupStore.ts` manages teams and organizational groups
- **Location Tracking**: Associates people with zones, desks, and spaces

**⚠️ Migration Note**: The app has migrated from React Context API to Zustand stores. Legacy Context files (`*Context.tsx`) exist for backward compatibility but are deprecated. New code should use:
- `usePeople()`, `useGroups()` hooks for people/team data
- `useDevices()`, `useZones()`, `useRules()`, `useSite()` hooks (from `lib/hooks/`)
- Direct store access: `useDeviceStore()`, `useZoneStore()`, etc. (from `lib/stores/`)

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+**
- **Docker Desktop** ([download](https://www.docker.com/products/docker-desktop/))

## 🚀 Getting Started

You can run the application in two ways: **Fully Dockerized** (easiest, best for demos) or **Local Development** (best for coding).

### Option 1: Fully Dockerized (Recommended)

Run the entire application stack in containers. Works on **Apple Silicon (M1/M2/M3)**, Intel Macs, Windows, and Linux.

```bash
# Start everything (App + Database)
npm run cortex:wakeup
```

- Open [http://localhost:3001](http://localhost:3001)
- The app comes pre-seeded with sample data.

To stop:
```bash
npm run cortex:sleep
```

---

### Option 2: Local Development (Hybrid)

Run the database in Docker, but the Next.js app locally for hot-reloading and faster coding.

1. **Start Database:**
   ```bash
   npm run db:up
   ```

2. **Seed Data (First time only):**
   ```bash
   npx prisma db push
   npm run db:seed
   ```

3. **Start App:**
   ```bash
   npm run dev:local
   ```

### Database Environment Switching

The app can switch between local Docker DB and Supabase Cloud DB:

| Command | Database | Use Case |
|---------|----------|----------|
| `npm run dev:local` | 💻 Local Docker | Active development |
| `npm run dev:cloud` | ☁️ Supabase | Presentations, shared demos |

Check **Settings → Data** in the app to see which is active.

### Database Commands

| Command | Description |
|---------|-------------|
| `npm run db:up` | Start PostgreSQL container |
| `npm run db:down` | Stop PostgreSQL container |
| `npm run db:seed` | Seed sample data |
| `npm run db:studio` | Open Prisma Studio (database GUI) |
| `npm run db:push` | Push schema changes |
| `npm run db:migrate` | Run migrations |

### Docker Compose

The `docker-compose.yml` defines:
- **PostgreSQL 15** on port 5434 (avoids conflicts with fusion-cortex on 5433)
- Persistent data volume
- Credentials: `postgres` / `postgres`

See [LOCAL_DB_SETUP.md](./LOCAL_DB_SETUP.md) for detailed setup and troubleshooting.

## 🛠️ Operations & Maintenance

### System Health
Check if the system is running correctly:
```bash
npm run cortex:health
```
(Runs `docker compose ps` to show running containers).

### Log Management
View real-time logs from the application and database:
```bash
npm run cortex:logs
```
Docker containers are configured with **Log Rotation** (max 10MB file size, 3 files max) to prevent them from consuming all disk space.

### Command Reference
For a quick list of all available commands:
```bash
npm run cortex help
```
(Or `npm run cortex`).

### Backups (Remember)
Data is critical. Save a snapshot of the database (memory):
```bash
npm run cortex:remember -- [optional-tag]
```
Example: `npm run cortex:remember -- pre-demo`
Backups are saved to `./backups` with a timestamp and your tag. The script automatically rotates them (keeping the last 10).

### LAN Access (Tablets/Mobile)
To access the app from other devices on your local network (e.g., controlling lights from an iPad):
1. Find your computer's IP address (e.g., `192.168.1.50`).
2. Update `docker-compose.yml`:
   ```yaml
   environment:
     NEXTAUTH_URL: http://192.168.1.50:3000
   ```
3. Restart the stack: `npm run cortex:wakeup`
4. Open `http://192.168.1.50:3000` on your tablet.

## 🔧 Development

### Quick Start

See the [Getting Started](#-getting-started) section above for setup instructions.

### Code Style

- TypeScript strict mode enabled
- React Server Components by default, `'use client'` when needed
- Functional components with hooks
- Plain language, no jargon (per UX brief)
- Always use design tokens (`var(--color-primary)`) - never hard-code values

### Adding New Features

1. Create route in `app/(main)/[feature]/page.tsx`
2. Add navigation item in `components/layout/MainNav.tsx`
3. Create tRPC router in `server/trpc/routers/[feature].ts`
4. Add router to `server/trpc/routers/_app.ts`
5. Update Prisma schema if needed
6. Use design tokens, not hard-coded values

### For AI Assistants

See [AI_NOTES.md](./AI_NOTES.md) for comprehensive AI-friendly documentation including patterns, file locations, and common issues.

## 🚀 Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for complete deployment guide to Vercel.

**Quick Deploy:**
1. Push code to GitHub
2. Connect repository to Vercel
3. Set environment variables in Vercel Dashboard
4. Deploy automatically on push to `main`

**CI/CD:** GitHub Actions runs lint, typecheck, and build on every push/PR.

## 📚 Additional Documentation

**📖 [DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md)** - Complete documentation navigation hub  
**⚡ [CODEBASE_QUICK_REFERENCE.md](./CODEBASE_QUICK_REFERENCE.md)** - Quick file location reference

### Core Docs
- **[AI_NOTES.md](./AI_NOTES.md)** - Comprehensive guide for AI assistants (patterns, examples)
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture and data flow

### Setup & Configuration
- **[LOCAL_DB_SETUP.md](./LOCAL_DB_SETUP.md)** - Local Docker PostgreSQL setup
- **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** - Supabase storage and database setup
- **[SEEDING.md](./SEEDING.md)** - Database seeding guide
- **[EXPORT_DATA.md](./EXPORT_DATA.md)** - Exporting zones and device positions

### Deployment
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment guide (Vercel, GitHub, checklists)

### UX & Design
- **[UX_IMPROVEMENTS.md](./UX_IMPROVEMENTS.md)** - First UX review (10 improvements)
- **[UX_IMPROVEMENTS_V2.md](./UX_IMPROVEMENTS_V2.md)** - Second UX review (10 more improvements)

## 🎨 UI Components & Patterns

### Focused Object Modal System

The app uses a **Focused Object Modal** pattern for detailed entity views. This provides a consistent, tabbed interface for viewing comprehensive information about devices, zones, faults, and sites.

**Components:**
- `FocusedObjectModal` - Reusable modal shell with tabs
- `FocusedModalTabs` - Tab navigation component
- Focused content components:
  - `DeviceFocusedContent` - Device details with Overview, Metrics, History, Related tabs
  - `ZoneFocusedContent` - Zone details with comprehensive information
  - `FaultFocusedContent` - Fault details and resolution
  - `SiteFocusedContent` - Site overview and statistics

**Usage Pattern:**
```typescript
<FocusedObjectModal
  isOpen={isOpen}
  onClose={onClose}
  title="Device ID"
  subtitle="Device Type • Serial Number"
  tabs={[
    { id: 'overview', label: 'Overview' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'history', label: 'History' },
    { id: 'related', label: 'Related' },
  ]}
>
  {(activeTab) => <TabContent activeTab={activeTab} />}
</FocusedObjectModal>
```

### Error Handling

The app includes centralized error handling via the `useErrorHandler` hook:

```typescript
const { handleError, handleWarning, handleSuccess } = useErrorHandler()

try {
  await saveSomething()
  handleSuccess('Saved successfully')
} catch (error) {
  handleError(error, { title: 'Failed to save' })
}
```

The hook automatically:
- Parses errors into user-friendly messages
- Categorizes errors (network, auth, validation, server)
- Shows toast notifications
- Logs to console for debugging

### Error Boundary

The `ErrorBoundary` component provides error recovery at the component tree level, preventing the entire app from crashing when errors occur.

## 🎯 Non-Goals

**Do not implement:**
- Multi-site management (this is a single-site app for i2systems HQ)
- Field technician commissioning workflows
- Energy savings charts
- Occupancy analytics dashboards
- Legacy spec content about energy/analytics beyond what's defined
- Device discovery/scanning (removed - use manual entry in lookup page)

## 🗺️ Roadmap

### Phase 2: Enhanced Components (Current)
- [x] **Badge Component**: Unified status indicators across the app.
- [x] **Toggle Component**: Standardized toggle buttons.
- [ ] **Select Component**: Custom select wrapper for consistent styling.
- [ ] **Card Component**: Standardized container styling.

### Phase 3: Global Theming & Dashboard
- [ ] Refactor Dashboard to use new components.
- [ ] Audit `base.css` for distinct High Contrast vs Dark separation.
- [ ] Refactor Status/Stat Cards.


## 📚 External Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [tRPC Documentation](https://trpc.io)
- [Prisma Documentation](https://www.prisma.io/docs)
- [react-konva Documentation](https://konvajs.org/docs/react/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

**Built with ❤️ for the i2systems team**
