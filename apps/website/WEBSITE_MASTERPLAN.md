# Start POS — Marketing Website Master Plan

## Overview

A visual, conversion-focused marketing website built with **Astro** that explains what Start POS is, demonstrates its value to potential customers, and guides visitors toward a free trial or sales conversation. The site doubles as a leave-behind / presentation deck for in-person pitches.

**Target audience:** Small-to-medium business owners running retail shops, grocery stores, or restaurants in the Philippines and Southeast Asia.

**Primary goal:** Convert visitors to free trial signups.
**Secondary goal:** Support sales presentations with rich visuals and a pricing section that's easy to walk through.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Astro (static/SSR hybrid) |
| Styling | Tailwind CSS v4 |
| Interactivity | Minimal — Astro islands where needed (e.g. pricing toggle, mobile menu) |
| Animations | CSS animations + [Motion One](https://motion.dev/) for scroll-triggered reveals |
| Icons | Lucide (matches the app) |
| Deployment | GitHub Pages |
| Analytics | Plausible (privacy-first, no cookie banner needed) |

---

## Site Structure

```
/ (Home)
/features
/pricing
/use-cases/retail
/use-cases/restaurant
/use-cases/grocery
/about
/contact
```

---

## Pages — Detail Plan

---

### 1. Home `/`

The full story on a single scroll. Designed to work as a standalone presentation slide deck.

#### Sections (in order)

**1.1 Hero**
- Headline: *"The POS that keeps working — even when the internet doesn't."*
- Sub-headline: *"A modern, offline-first point of sale for retail, restaurant, and grocery. One platform for your whole team."*
- CTA: `Start free trial` (primary) + `See how it works` (scroll anchor)
- Visual: Animated mockup of the POS checkout screen on a tablet/desktop; subtle grid background

**1.2 Trust bar**
- Small social proof logos / stat chips: *"Multi-location ready"*, *"Works offline"*, *"BIR-compliant"*, *"Free 30-day trial"*
- Keep this minimal and factual

**1.3 Problem → Solution**
- Two-column layout
- Left: Pain points (bullet list, slightly dimmed): *"Still using a spreadsheet?"*, *"Losing track of stock across branches?"*, *"Receipts that don't match your books?"*
- Right: How Start POS solves each one — one sentence per point
- Visual accent: subtle background gradient shift between the two columns

**1.4 Business Type Selector ("Built for your business")**
- Three cards with icons: 🛒 Retail · 🍽 Restaurant · 🏪 Grocery
- Click/hover each card to show a short description + screenshot of the relevant workflow (product catalogue vs. order queue vs. barcode scan)
- This section doubles as a feature demo in presentations

**1.5 Feature Highlights Grid**
Six feature tiles, each with an icon, title, and 1-line description:

| Icon | Title | Description |
|---|---|---|
| 🛒 | Point of Sale | Fast checkout with multiple payment methods — cash, card, e-wallet. |
| 📦 | Inventory Management | Track stock across locations with batch tracking and expiry dates. |
| 📋 | Orders & Kitchen Flow | Restaurant orders, kitchen status, dine-in, take-out, delivery. |
| 📊 | Reports & Analytics | Sales trends, inventory valuation, and profit calculations. |
| 🏢 | Multi-Branch | One account, multiple locations. Centralized control. |
| 🔌 | Works Offline | Local-first architecture. Syncs when back online. No data loss. |

**1.6 Offline-First Deep Dive**
- Full-width section with a visual diagram showing: Device → Local DB → Sync Arrow (greyed out when offline) → Cloud
- Copy: *"Unlike cloud-only POS systems, Start POS stores your data locally first. Checkout never stops — even during a network outage. Everything syncs automatically when you're back online."*
- This is a key differentiator — give it visual weight

**1.7 Pricing Preview**
- Condensed version of the pricing table (not the full matrix)
- Three highlighted plans: Basic (₱299/mo), Premium (₱799/mo), Enterprise (₱1,999/mo)
- "See full pricing →" link
- Trial CTA chip: *"All plans start with a free 30-day trial"*

**1.8 Social Proof / Testimonials**
- Placeholder cards (3) for customer quotes — ready to populate when available
- Layout: horizontal scroll on mobile, 3-column on desktop

**1.9 Final CTA**
- *"Ready to run a smarter business?"*
- Two buttons: `Start free trial` · `Talk to sales`

---

### 2. Features `/features`

Full-page walkthrough of every major module. Each section has a screenshot/mockup on one side and feature bullets on the other, alternating left/right.

**Sections:**
1. POS Checkout (payments, receipts, refunds, discounts, tax)
2. Product Catalogue (variants, SKUs, bundles, add-ons, images)
3. Inventory (locations, batches, expiry, adjustments, transfers, waste)
4. Purchasing (suppliers, purchase orders, receiving, cost tracking)
5. Orders & Kitchen (restaurant workflow, dine-in/takeout/delivery)
6. Task Management (shelf refills, stock counts, branch transfers, task approval workflow diagram)
7. Reports (sales reports, inventory reports, export to CSV)
8. Multi-Branch & Employees (roles: Admin, Supervisor, Cashier, Service Provider)
9. Compliance (VAT, GST, BIR support, invoice numbering)

Each section ends with a small "Available on:" badge showing which plan unlocks it.

---

### 3. Pricing `/pricing`

The full comparison table — the most important page for converting serious buyers.

**Layout:**
- Monthly / Annual toggle (Annual = show a discount badge if applicable)
- Plan cards side by side: Trial · Basic · Premium · Enterprise · Perpetual License
- Each card: price, TX limit, branch limit, employee limit, feature list with ✓ / — / limit
- Perpetual License card gets a distinct visual treatment: dark/premium look, "Contact us for a quote" CTA
- Add-ons section below the table: Analytics Dashboard, API Access, Extra Branch, Extra Employee, TX top-up packages
- FAQ accordion at the bottom covering: "What counts as a transaction?", "Can I switch plans?", "What happens at the end of the trial?", "Is there a refund policy?", "What is the Perpetual License?"

**Plan data (from plans.csv):**

| Plan | Monthly | TX/mo | Branches | Employees |
|---|---|---|---|---|
| Trial | Free (30 days) | 1,000 | 1 | 1 |
| Basic | ₱299 | 1,000 | 1 | 1 |
| Premium | ₱799 | 5,000 | 3 | Unlimited |
| Enterprise | ₱1,999 | 10,000 | 5 | Unlimited |
| Perpetual License | One-time (quote) | Unlimited | Unlimited | Unlimited |

---

### 4. Use Cases `/use-cases/[type]`

Three pages, each telling the story from a specific business owner's perspective.

**Retail** (`/use-cases/retail`)
- Hero: *"Everything a retail shop needs. Nothing it doesn't."*
- Highlights: Product catalogue with variants, barcode support, inventory management, transaction history, CSV export
- Visual: Clothing/hardware store mockup

**Restaurant** (`/use-cases/restaurant`)
- Hero: *"From table to kitchen — in one tap."*
- Highlights: Order queue, kitchen display, dine-in/takeout/delivery, add-ons, deposit tracking
- Visual: Order ticket / kitchen screen mockup

**Grocery** (`/use-cases/grocery`)
- Hero: *"Fast checkout. Tight inventory. Full control."*
- Highlights: Barcode scanning, bulk items, expiry tracking, low-stock alerts, purchase orders
- Visual: Grocery checkout mockup

---

### 5. About `/about`

Short, honest, founder-focused.

- What we're building and why
- The problem we saw in the market (legacy POS, cloud-only fragility, pricing complexity)
- The team / company origin
- Technology philosophy (offline-first, open standards, local-first data)
- "We're based in the Philippines, building for Southeast Asia"

---

### 6. Contact `/contact`

- Simple form: Name, Business Name, Email, Business Type (dropdown), Message
- Sales email and/or Calendly link
- "Or start your free trial directly →"

---

## Visual Design Direction

**Tone:** Clean, modern, confident. Not startup-playful. Professional enough for enterprise buyers, approachable for small business owners.

**Color palette (proposed):**
- Primary: Deep blue-violet (`#3B2FCC` or similar) — authority and tech
- Accent: Bright lime/green (`#6EE7B7` or similar) — growth, POS green receipts
- Neutral: Slate grays for text, white backgrounds with subtle off-white section alternation
- Dark sections (hero, CTA): Near-black with colored accents

**Typography:**
- Headings: Inter or Geist (clean, modern, variable font)
- Body: Same family, Regular weight
- Code/technical labels: Mono variant

**Imagery:**
- Prioritize product screenshots and UI mockups over stock photos
- Use device frames (tablet, desktop browser) to present screenshots
- Animated mockups for high-impact sections (Hero, Offline section)
- Custom SVG illustrations for abstract concepts (offline sync, multi-branch)

**Animations:**
- Scroll-triggered fade-up for section entries
- Staggered card reveals in feature grids
- Smooth tab transitions in the Business Type Selector
- Keep animations subtle — this is a business tool, not a consumer app

---

## Content Priorities (for first build)

Build in this order:

1. **Home page** — full scroll experience
2. **Pricing page** — needed for every sales conversation
3. **Features page** — supports demo walkthroughs
4. **Use case pages** — one page per business type
5. **About + Contact** — fill in last

---

## Component Library Plan

Reusable Astro components to build:

```
components/
  layout/
    Header.astro         — sticky nav, mobile drawer
    Footer.astro         — links, company info
    Section.astro        — consistent section wrapper (padding, max-width)
  ui/
    Button.astro         — primary / secondary / ghost variants
    Badge.astro          — plan badge, feature badge
    Card.astro           — generic card with slot
    FeatureTile.astro    — icon + title + description
    PlanCard.astro       — pricing plan card
    Accordion.astro      — FAQ accordion (island)
    Tabs.astro           — business type selector (island)
  sections/
    Hero.astro
    TrustBar.astro
    ProblemSolution.astro
    BusinessTypeSelector.astro
    FeatureGrid.astro
    OfflineSection.astro
    PricingPreview.astro
    Testimonials.astro
    FinalCTA.astro
```

---

## SEO & Meta

- Each page has its own `<title>` and `<meta description>`
- Open Graph tags for social sharing (especially useful for sharing with prospects)
- Structured data (JSON-LD) for `Product` and `Organization` on the home page
- Sitemap generated by Astro's built-in sitemap integration

**Priority keywords:**
- "POS system Philippines"
- "offline POS system"
- "point of sale for restaurant Philippines"
- "inventory management POS"
- "multi-branch POS system"
- "POS with BIR compliance"

---

## Presentation Mode Notes

The Home page is intentionally structured so it can be walked through top to bottom in a live demo:

1. Hero → "Here's what Start POS is in one line"
2. Business type selector → "What type of business are you running?"
3. Feature grid → "Here's what's included"
4. Offline section → "Here's our key differentiator"
5. Pricing preview → "Here's how it's priced"
6. CTA → "Here's how to get started"

Consider adding a `?present=true` query param that hides the nav and footer and adds full-screen section scroll snapping for use as a true slide deck.

---

## GitHub Pages Deployment Notes

GitHub Pages serves static files only — no SSR. Astro must be configured for **fully static output**.

**`astro.config.mjs` requirements:**
```js
export default defineConfig({
  output: 'static',          // static build, no server
  site: 'https://<org>.github.io',
  base: '/<repo-name>',      // required if not using a custom domain
})
```

**Repository setup:**
- The website lives in a **separate repo** (e.g. `start-pos-website`) — not inside this monorepo
- Deploy via the official `withastro/action` GitHub Action — builds on push to `main` and publishes to the `gh-pages` branch
- If a custom domain is added later, set `base: '/'` and add a `CNAME` file to `public/`

**GitHub Actions workflow** (`.github/workflows/deploy.yml`):
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: withastro/action@v3
        with:
          node-version: 22
```

**Things that don't work on static GitHub Pages:**
- Server-side form handling (use Formspree or Netlify Forms for the contact form instead)
- Dynamic routes that aren't pre-rendered (all pages must be statically generated at build time)
- The `?present=true` presentation mode still works fine — it's pure client-side JS

---

## Milestones

| # | Milestone | Deliverable |
|---|---|---|
| M1 | Project scaffold | Astro project, Tailwind config, component stubs, routing |
| M2 | Home page | All 9 sections, static (no animations yet) |
| M3 | Pricing page | Full plan comparison table, add-ons, FAQ |
| M4 | Features page | All 9 module sections with placeholder screenshots |
| M5 | Use case pages | 3 pages with unique copy and visuals |
| M6 | Animations + polish | Scroll animations, transitions, responsive fine-tuning |
| M7 | Real screenshots | Replace placeholders with actual app screenshots |
| M8 | About + Contact | Remaining pages, contact form wiring |
| M9 | SEO + deploy | Meta tags, sitemap, deploy to production |

---

## Decisions — Locked

| Decision | Answer |
|---|---|
| Domain | None yet — using GitHub Pages URL (`<user>.github.io/start-pos-website`) |
| Brand name | **startPOS** |
| Screenshots | Placeholders for now — each placeholder labelled with what image belongs there |
| Pricing currency | PHP (₱) only for now |
| Annual billing discount | No rate set — configurable via `ANNUAL_DISCOUNT_PCT` in `src/constants.ts` |
| Testimonials | Placeholder cards — no real customers yet |
| Contact form | Formspree — form endpoint configurable in `src/constants.ts` |
| GitHub repo name | `start-pos-website` → base path: `/start-pos-website/` |
| CTA destination | Placeholder URL — configurable via `APP_URL` in `src/constants.ts` |
| Presentation mode | ✅ Enabled — `?present=true` hides nav/footer, adds scroll-snap |
| Perpetual License pricing | "Contact us" CTA — no price shown |
