# Quick Start — StartPOS Calling Card

## 30-Second Preview

```bash
# From the root of the project
pnpm dev:calling-card

# Or directly from this folder
cd apps/calling-card
npx serve . -p 3005
```

Then open: http://localhost:3005

## 2-Minute Print

1. Open `index.html` in **Chrome**
2. Press `Ctrl+P` (or `Cmd+P` on Mac)  
3. ✅ Enable **"Background graphics"**
4. Click **"Save as PDF"**
5. Send PDF to print shop

**Recommended specs**: 300gsm card stock, matte finish, 100 cards for ~₱600-800

## 5-Minute Customization

### Change QR Code
1. Open `generate-qr.html` in browser
2. Enter your URL
3. Download the generated SVG
4. Replace `qr-code.svg`

### Change Contact Info
Edit `index.html` at line ~270:

```html
<div class="back__footer-item">
  <span>Website</span>
  <span>YOUR-DOMAIN.com</span>
</div>
```

### Change Colors
Edit `index.html` at line ~15:

```css
:root {
  --brand-ink:    #0C222C;  /* Main color */
  --accent-sell:  #F2A73C;  /* Checkout */
  --accent-stock: #4FD1AE;  /* Inventory */
}
```

## Files

| File | Purpose |
|------|---------|
| `index.html` | The actual calling card (open this to view) |
| `qr-code.svg` | QR code image (scan to test) |
| `generate-qr.html` | Tool to create custom QR codes |
| `README.md` | Full usage guide |
| `PRINTING.md` | Detailed printing instructions |
| `OVERVIEW.md` | Complete documentation |

## What's Already Configured

✅ StartPOS branding (logo, colors)  
✅ Contact info (website, email, trial details)  
✅ QR code linking to https://https://startpos.github.io/  
✅ Print-optimized CSS  
✅ Standard business card size (3.5" × 2")  

## Common Tasks

### Test QR Code
Open your phone camera and scan the QR code in `index.html` preview

### Change Website URL
Replace all instances of `https://startpos.github.io/` with your domain

### Update Email
Replace `startpos04@gmail.com` with your email address

### Change Trial Text
Replace `Free for 30 days` with your preferred text

## Need Help?

- 📖 Full docs: See `README.md`
- 🖨️ Print guide: See `PRINTING.md`  
- 📋 Overview: See `OVERVIEW.md`
- 💬 Questions: startpos04@gmail.com

---

**That's it!** The card is ready to use as-is, or customize in 5 minutes.
