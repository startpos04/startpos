# StartPOS Calling Card

Business cards for StartPOS built with Astro.

## 🎨 Design Specs

- **Size:** 3.5in × 2in (standard business card)
- **Colors:** 
  - Brand ink: `#0C222C` (dark navy)
  - Accent sell: `#F2A73C` (amber - for transactions)
  - Accent stock: `#4FD1AE` (mint - for inventory)

## 📞 Contact Info

- **Phone:** +63 939 273 7849
- **Website:** startpos.github.io
- **Email:** startpos04@gmail.com

## 🚀 Development

```bash
# Install dependencies
pnpm install

# Start dev server (port 3005, auto-adjusts if busy)
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## 📄 Pages

### Preview Page (`/`)
Single card preview showing front and back side by side.

**URL:** http://localhost:3006/

### Print Page (`/print`)
Mass print layout with 10 cards per sheet.

**URL:** http://localhost:3006/print

**Layout:**
- **Page 1:** 10 fronts (5 rows × 2 columns)
- **Page 2:** 10 backs (mirrored for duplex printing)

**Printing Instructions:**
1. Open `/print` in Chrome
2. Print → More settings
3. Select "Print on both sides" (flip on short edge)
4. Page 1 prints fronts
5. Flip paper over
6. Page 2 prints backs (automatically mirrored to align)

## 🧩 Components

### `CardFront.astro`
Front side with:
- StartPOS branding
- Tagline: "Point of Sale + Inventory"
- Proposition: "Sell. Track. Grow."
- Contact info (phone + website)
- Mini POS interface preview

**Props:**
- `phone` (optional, default: "+63 939 273 7849")
- `website` (optional, default: "startpos.github.io")

### `CardBack.astro`
Back side with:
- Headline: "Complete POS + inventory for retail, restaurant & grocery."
- Feature groups: Sell, Manage, Monitor
- QR code (scans to startpos.github.io)
- Contact footer (website, phone, email)

**Props:**
- `phone` (optional, default: "+63 939 273 7849")
- `website` (optional, default: "startpos.github.io")
- `email` (optional, default: "startpos04@gmail.com")

## 🎨 Customization

To update contact info across all cards, edit props in the page files:

```astro
<CardFront phone="+63 939 273 7849" website="startpos.github.io" />
<CardBack phone="+63 939 273 7849" website="startpos.github.io" email="startpos04@gmail.com" />
```

## 📦 Build Output

```bash
pnpm build
```

Generates static HTML files in `dist/`:
- `dist/index.html` - Preview page
- `dist/print.html` - Mass print page

Ready to host anywhere or open directly in browser for printing.

## 🖨️ Print Tips

1. **Paper:** Use cardstock (250-300 GSM) for best results
2. **Settings:** 
   - Duplex printing (flip on short edge)
   - No margins/borders
   - 100% scale (do not fit to page)
3. **Cutting:** Cards are 3.5in × 2in with 0.25in spacing
4. **Test:** Print one sheet first to verify alignment

## 📁 File Structure

```
apps/calling-card/
├── src/
│   ├── components/
│   │   ├── CardFront.astro    # Front card component
│   │   └── CardBack.astro     # Back card component
│   ├── pages/
│   │   ├── index.astro        # Preview page
│   │   └── print.astro        # Mass print page
│   └── styles/
│       └── cards.css          # Shared card styles
├── public/
│   └── qr-code.svg           # QR code (scans to website)
├── astro.config.mjs          # Astro configuration
├── package.json              # Dependencies
└── tsconfig.json             # TypeScript config
```

## 🔗 Links

- Preview: http://localhost:3006/
- Print: http://localhost:3006/print
- Website: https://startpos.github.io/
