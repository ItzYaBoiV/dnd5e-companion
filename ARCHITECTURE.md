# D&D 5e Companion App — Full Architecture

## Philosophy
- **Every module is isolated.** A bug in spells cannot break inventory. A bug in UI cannot corrupt data.
- **All D&D math lives in one place:** `calculationService.ts` on the backend.
- **The frontend displays; the backend calculates and validates.**
- **Types are shared** between frontend and backend via a `shared/types` package.
- **Docker-first** for server hosting, React Native-ready for future mobile.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Backend API | Node.js + Express + TypeScript | Type-safe, fast, React Native friendly |
| Database | PostgreSQL + Prisma ORM | Relational (chars have many spells, items, etc.) |
| Frontend | React 18 + TypeScript + Vite | Fast builds, future React Native migration |
| State | Zustand | Lightweight, no boilerplate, slice-able |
| Styling | Tailwind CSS | Utility-first, consistent, dark-mode ready |
| Container | Docker + Docker Compose | Isolated services, reproducible |
| Reverse Proxy | Nginx | SSL termination, routing |
| D&D Data | Open5e SRD (seeded to DB) | Complete SRD: spells, classes, races, items |

---

## Project Structure

```
dnd5e-companion/
├── docker-compose.yml          # All services wired together
├── .env.example                # All required env vars documented
├── nginx/
│   └── nginx.conf              # Routes /api → backend, / → frontend
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma       # Single source of truth for DB shape
│   │   └── seed.ts             # Seeds all 5e SRD data from Open5e API
│   └── src/
│       ├── index.ts            # Entry point, mounts middleware + routes
│       ├── config/
│       │   └── database.ts     # Prisma client singleton
│       ├── middleware/
│       │   ├── errorHandler.ts # Catches ALL errors, returns typed responses
│       │   └── validate.ts     # Zod schema validation middleware
│       ├── routes/
│       │   ├── index.ts        # Router registry — add routes here only
│       │   ├── characters.ts   # CRUD for characters
│       │   ├── reference.ts    # Read-only SRD data (spells, classes, etc.)
│       │   └── combat.ts       # Roll outcomes, HP changes, death saves
│       ├── controllers/
│       │   ├── characterController.ts
│       │   ├── referenceController.ts
│       │   └── combatController.ts
│       └── services/
│           ├── characterService.ts     # DB operations for characters
│           ├── calculationService.ts   # ALL D&D 5e math — no exceptions
│           ├── referenceService.ts     # Queries SRD data from DB
│           └── seedService.ts          # Fetches + inserts SRD data
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx
        ├── main.tsx
        ├── types/
        │   └── dnd.ts              # All TypeScript types (mirrors Prisma models)
        ├── store/
        │   ├── characterStore.ts   # Active character state
        │   ├── referenceStore.ts   # SRD data cache (spells, classes, etc.)
        │   └── uiStore.ts          # UI state (modals, active tab, etc.)
        ├── services/
        │   └── api.ts              # All API calls — components NEVER call fetch()
        ├── hooks/
        │   ├── useCharacter.ts     # Derived character data, actions
        │   └── useReference.ts     # SRD data access
        └── components/
            ├── Layout/
            │   ├── AppShell.tsx    # Sidebar + main content wrapper
            │   └── Navigation.tsx
            ├── common/
            │   ├── DiceRoller.tsx  # Reusable dice roll display
            │   ├── Modal.tsx
            │   ├── Tooltip.tsx
            │   └── StatBlock.tsx
            ├── CharacterCreation/
            │   ├── index.tsx       # Wizard controller — manages steps
            │   ├── Step1_BasicInfo.tsx
            │   ├── Step2_Race.tsx
            │   ├── Step3_Class.tsx
            │   ├── Step4_AbilityScores.tsx  # Point buy / standard array / roll
            │   ├── Step5_Background.tsx
            │   ├── Step6_Equipment.tsx
            │   └── Step7_Review.tsx
            └── CharacterSheet/
                ├── index.tsx       # Tab controller
                ├── tabs/
                │   ├── MainTab.tsx       # Scores, combat, skills
                │   ├── SpellsTab.tsx     # Spell slots, prepared spells
                │   ├── InventoryTab.tsx  # Equipment, currency
                │   ├── FeaturesTab.tsx   # Class features, feats, traits
                │   └── NotesTab.tsx      # Backstory, allies, misc
                └── panels/
                    ├── AbilityScores.tsx
                    ├── CombatStats.tsx
                    ├── DeathSaves.tsx
                    ├── HitPoints.tsx
                    ├── SkillList.tsx
                    ├── SavingThrows.tsx
                    ├── AttackList.tsx
                    └── ConditionTracker.tsx
```

---

## Data Model Overview

### Character (stored in DB)
All values that can change during a session (HP, spell slots used, conditions, inventory) are tracked per-character. SRD reference data (spell descriptions, class features) lives separately in reference tables and is joined at query time.

### SRD Reference Data (seeded once)
- `Race` + `RaceTrait` + `Subrace`
- `Class` + `ClassFeature` + `Subclass`
- `Background` + `BackgroundFeature`
- `Spell` (all fields including components, concentration, ritual)
- `Item` (weapons, armor, adventuring gear, magic items)
- `Feat`
- `Condition` (Blinded, Charmed, etc.)

---

## Key Calculation Rules (all in calculationService.ts)

| Calculation | Formula |
|---|---|
| Ability Modifier | `floor((score - 10) / 2)` |
| Proficiency Bonus | `ceil(level / 4) + 1` |
| Skill Bonus | `abilityMod + (proficient ? profBonus : 0) + (expertise ? profBonus : 0)` |
| Passive Perception | `10 + wisdomMod + (profPercep ? profBonus : 0)` |
| AC (no armor) | `10 + dexMod` |
| AC (light armor) | `armorBase + dexMod` |
| AC (medium armor) | `armorBase + min(dexMod, 2)` |
| AC (heavy armor) | `armorBase` |
| AC (Barbarian unarmored) | `10 + dexMod + conMod` |
| AC (Monk unarmored) | `10 + dexMod + wisMod` |
| Shield bonus | `+2 to AC` |
| Spell Save DC | `8 + profBonus + spellcastingAbilityMod` |
| Spell Attack | `profBonus + spellcastingAbilityMod` |
| Attack (melee) | `profBonus (if proficient) + strMod` |
| Attack (finesse) | `profBonus (if proficient) + max(strMod, dexMod)` |
| Attack (ranged) | `profBonus (if proficient) + dexMod` |
| HP per level | `hitDie + conMod` (max at level 1) |
| Carrying Capacity | `strength * 15 lbs` |

---

## API Endpoints

### Characters
- `GET    /api/characters`                    — List all characters
- `POST   /api/characters`                    — Create character (optional `startingInventory[]` for initial gear)
- `GET    /api/characters/:id`                — Get character with all computed stats
- `PATCH  /api/characters/:id`                — Update character fields
- `DELETE /api/characters/:id`                — Delete character
- `POST   /api/characters/:id/hp`             — Change HP (damage / heal / temp)
- `POST   /api/characters/:id/death-save`     — Record death save roll
- `POST   /api/characters/:id/rest`           — Short or long rest (recovers resources)
- `PATCH  /api/characters/:id/spell-slots`    — Use / recover spell slot
- `POST   /api/characters/:id/conditions`     — Add condition
- `DELETE /api/characters/:id/conditions/:c`  — Remove condition
- `POST   /api/characters/:id/inventory`      — Add item
- `PATCH  /api/characters/:id/inventory/:i`   — Equip / attune / update quantity
- `DELETE /api/characters/:id/inventory/:i`   — Remove item
- `POST   /api/characters/:id/spells`         — Add spell to character
- `PATCH  /api/characters/:id/spells/:s`      — Prepare / unprepare spell
- `DELETE /api/characters/:id/spells/:s`      — Remove spell

### Reference (SRD Data — read-only)
- `GET /api/reference/races`
- `GET /api/reference/races/:slug`
- `GET /api/reference/classes`
- `GET /api/reference/classes/:slug`
- `GET /api/reference/backgrounds`
- `GET /api/reference/spells?class=wizard&level=1&school=evocation`
- `GET /api/reference/spells/:slug`
- `GET /api/reference/items?type=weapon&category=martial`
- `GET /api/reference/items/:slug`
- `GET /api/reference/feats`
- `GET /api/reference/conditions`

---

## Docker Services

| Service | Port | Description |
|---|---|---|
| `nginx` | 80 / 443 | Reverse proxy |
| `backend` | 3001 (internal) | Express API |
| `frontend` | 5173 (internal) | Vite dev / built static |
| `postgres` | 5432 (internal) | PostgreSQL database |

---

## Mobile roadmap

### Near term (web on phones)
- Treat the existing Vite app as **responsive-first**: character sheet tabs, creation wizard steps, and list cards already use flexible grids; prioritize **44px minimum touch targets**, bottom-safe areas for notched devices, and scroll containment on the sheet.
- Optional **PWA** manifest + service worker (offline cache for static assets only; API still requires network) for “install to home screen” without app store.

### API and shared code (unchanged for any client)
- **`backend/`** stays the single source of truth for rules math and persistence.
- **`frontend/src/services/api.ts`**, **`types/dnd.ts`**, and **Zustand stores** stay client-agnostic: no `fetch` outside `api.ts`, no D&D math in components.

### Native app (React Native or Expo) — phased
1. **Phase A — Read-only + play**: character list, sheet read (HP, abilities, inventory list), session list; reuse API + types + stores; new RN UI only.
2. **Phase B — Play actions**: HP changes, rests, spell slots, conditions; keep using existing PATCH/POST endpoints.
3. **Phase C — Creation**: multi-step wizard on small screens (one primary action per step); same payloads as web `POST /api/characters` (including `startingInventory` when used).
4. **Styling**: Tailwind on web → **NativeWind** or **Tamagui** on RN; shared design tokens (colors, spacing) extracted once to avoid drift.

### Why the frontend is strict
**No browser-only APIs in business logic** (no direct `localStorage` in stores for core flows, no D&D rules in JSX) so the same brain can drive web and mobile with a UI rewrite only.
