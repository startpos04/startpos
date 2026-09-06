# StartPOS Calling Card App

A standalone, print-ready business card application for StartPOS marketing materials.

## 📁 What's Inside

```
apps/calling-card/
├── index.html          # Main calling card (front + back)
├── qr-code.svg         # QR code linking to app
├── generate-qr.html    # Tool to create custom QR codes
├── README.md           # Usage instructions
├── PRINTING.md         # Detailed printing guide
├── OVERVIEW.md         # This file
├── package.json        # App metadata
└── .gitignore          # Git ignore rules
```

## 🎯 Purpose

Professional business cards for StartPOS that can be:
- ✅ Distributed at trade shows and events
- ✅ Handed out to potential customers
- ✅ Included in product packaging
- ✅ Left at partner locations
- ✅ Used by sales team

## 🎨 Design

### Front Side
- **Dark navy background** (#0C222C) — the brand's signature "screen" color
- **Bold wordmark**: "StartPOS"
- **Tagline**: "Point of Sale + Inventory"
- **Value prop**: "Sell. Track. Grow."
- **Decorative panel**: Miniature UI showing checkout + inventory interface
- **Visual accents**: Amber (transactions) + Mint (inventory) stripe

### Back Side
- **Light background** (#FAFAF9) — professional and easy to read
- **Headline**: "Everything your store needs to sell and track stock."
- **Feature groups**:
  - 🟠 **Sell**: Fast checkout, Sales tracking
  - 🔵 **Manage**: Products, Inventory  
  - 🟢 **Monitor**: Stock levels, Business activity
- **QR code**: Direct link to trial signup
- **Contact info**: Website, Email, Trial details

## 📊 Card Information Filled In

All fields have been populated with actual StartPOS data:

| Field | Value |
|-------|-------|
| Website | https://startpos.github.io/ |
| Email | startpos04@gmail.com |
| Trial | Free for 30 days |
| QR Link | https://https://startpos.github.io/ |

## 🚀 Quick Start

### Preview the Card
```bash
# Option 1: Open directly in browser
# Double-click index.html

# Option 2: Use the dev server
pnpm dev:calling-card

# Then open: http://localhost:3005
```

### Customize QR Code
```bash
# Open the QR generator
# Double-click generate-qr.html

# Or navigate to:
# http://localhost:3005/generate-qr.html
```

### Print the Cards
1. Open `index.html` in **Chrome**
2. Press `Ctrl+P` (or `Cmd+P`)
3. Enable "Background graphics"
4. Save as PDF
5. Send to print shop

See `PRINTING.md` for detailed instructions.

## 🛠️ Customization

### Update Contact Information

Edit the footer section in `index.html`:

```html
<div class="back__footer">
  <div class="back__footer-item">
    <span>Website</span>
    <span>your-custom-domain.com</span>
  </div>
  <!-- ... more items ... -->
</div>
```

### Change QR Code URL

1. Open `generate-qr.html` in browser
2. Enter your custom URL
3. Click "Generate QR Code"
4. Click "Download SVG"
5. Replace `qr-code.svg` with the downloaded file

### Adjust Colors

Edit CSS variables at the top of `index.html`:

```css
:root {
  --brand-ink:       #0C222C;  /* Main brand color */
  --accent-sell:     #F2A73C;  /* Checkout accent */
  --accent-stock:    #4FD1AE;  /* Inventory accent */
  /* ... */
}
```

## 📦 No Dependencies

This app is completely self-contained:
- ✅ No build process required
- ✅ No Node modules to install (for the card itself)
- ✅ No external assets or fonts
- ✅ Works offline
- ✅ Total size: ~15 KB

The QR generator (`generate-qr.html`) loads one small library from CDN, but it's optional — you can use any QR code generator.

## 🎯 Production Ready

This card is ready for professional printing:
- ✅ Exact color codes defined
- ✅ Print-optimized CSS
- ✅ Standard business card size (3.5" × 2")
- ✅ High-contrast text (WCAG AA compliant)
- ✅ Professional typography
- ✅ Rounded corners specified
- ✅ Background graphics preserved

## 📋 Printing Specs

| Property | Value |
|----------|-------|
| Size | 3.5" × 2" (89mm × 51mm) |
| Stock | 300-350gsm recommended |
| Finish | Matte (recommended) or gloss |
| Corners | Rounded (7px / ~2mm radius) |
| Colors | Full CMYK |
| Bleed | Handled by print shop |

## 💰 Estimated Costs

| Quantity | Cost (Estimate) |
|----------|-----------------|
| 100 cards | ₱600-800 (Philippines) |
| 250 cards | ₱1,200-1,500 |
| 500 cards | ₱2,000-2,500 |
| 1000 cards | ₱3,500-4,500 |

*Prices vary by print shop, paper stock, and finish.*

## 🔗 Integration with StartPOS

The calling card integrates with the StartPOS ecosystem:

- **QR Code** → Links to trial signup at `https://startpos.github.io/`
- **Branding** → Uses exact colors from the main web app
- **Messaging** → Aligns with website value propositions
- **Call-to-action** → "See StartPOS in action" → Free trial

## 📱 Mobile-Friendly Preview

The preview page (`index.html`) is responsive:
- ✅ Cards display side-by-side on desktop
- ✅ Cards stack vertically on mobile
- ✅ Touch-friendly for tablet viewing
- ✅ Preview labels ("FRONT" / "BACK") only show on screen, not print

## ✅ Quality Assurance

Before printing in bulk:

1. **Test QR code**: Scan with multiple phones to verify it works
2. **Check spelling**: Review all text for typos
3. **Verify URLs**: Ensure website and email are correct
4. **Print preview**: Use Chrome's print preview to check colors
5. **Test print**: Print 1-2 cards first to verify quality

## 📞 Support

Questions about the calling card?
- Email: startpos04@gmail.com
- Website: https://startpos.github.io/

## 🔄 Version History

- **v0.1.0** (2026-09-06): Initial release
  - Front and back card design
  - QR code integration
  - Print-optimized CSS
  - QR generator tool
  - Comprehensive documentation

---

**Ready to print?** See `PRINTING.md` for step-by-step instructions.
