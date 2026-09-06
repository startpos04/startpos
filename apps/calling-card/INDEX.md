# StartPOS Calling Card — Documentation Index

Quick navigation to all documentation for the StartPOS business calling card.

## 🚀 Start Here

| Document | When to Read | Time |
|----------|-------------|------|
| **[QUICK-START.md](QUICK-START.md)** | Right now — quickest way to preview and use | 2 min |
| **[README.md](README.md)** | Before customizing anything | 5 min |
| **[OVERVIEW.md](OVERVIEW.md)** | When you want complete understanding | 10 min |

## 📖 Reference Guides

| Document | Purpose | Audience |
|----------|---------|----------|
| **[PRINTING.md](PRINTING.md)** | Step-by-step printing instructions | Everyone printing cards |
| **[PRE-PRINT-CHECKLIST.md](PRE-PRINT-CHECKLIST.md)** | Quality checklist before bulk printing | Print managers |

## 🎨 Customization

**Want to change something?**

| What to Change | Document to Read |
|----------------|-----------------|
| QR code URL | [QUICK-START.md](QUICK-START.md) → "Change QR Code" |
| Contact info (email, website) | [QUICK-START.md](QUICK-START.md) → "Change Contact Info" |
| Brand colors | [README.md](README.md) → "Update Colors" |
| Card size | [PRINTING.md](PRINTING.md) → "Custom Sizes" |

## 🛠️ Tools Included

| File | Purpose | How to Use |
|------|---------|------------|
| `index.html` | The calling card itself | Open in Chrome, press Ctrl+P to print |
| `generate-qr.html` | QR code generator | Open in browser, enter URL, download SVG |
| `qr-code.svg` | Current QR code | Replace this file with your custom QR |

## 📊 Key Information

### Card Specifications
- **Size**: 3.5" × 2" (standard business card)
- **Front**: Dark navy with brand elements
- **Back**: Light background with features + QR code
- **Colors**: Navy (#0C222C), Amber (#F2A73C), Mint (#4FD1AE)

### Current Content
- **Website**: https://startpos.github.io/
- **Email**: startpos04@gmail.com
- **Trial**: Free for 30 days
- **QR Code**: Links to https://https://startpos.github.io/

### Printing Costs (Estimates)
- 100 cards: ₱600-800
- 250 cards: ₱1,200-1,500
- 500 cards: ₱2,000-2,500

## 🎯 Common Workflows

### Workflow 1: Quick Preview
1. Open `index.html` in browser
2. Done! That's it.

### Workflow 2: Print As-Is
1. Read [PRE-PRINT-CHECKLIST.md](PRE-PRINT-CHECKLIST.md)
2. Open `index.html` in Chrome
3. Press Ctrl+P, enable "Background graphics"
4. Save as PDF
5. Send to print shop

### Workflow 3: Customize & Print
1. Read [QUICK-START.md](QUICK-START.md)
2. Make your changes (QR, contact info, etc.)
3. Test in browser
4. Follow Workflow 2

### Workflow 4: Custom QR Code
1. Open `generate-qr.html` in browser
2. Enter your URL
3. Click "Generate QR Code"
4. Click "Download SVG"
5. Replace `qr-code.svg` with downloaded file
6. Refresh `index.html` to verify

## 📁 File Overview

```
apps/calling-card/
├── index.html                  ← THE CARD (open this!)
├── qr-code.svg                 ← QR code image
├── generate-qr.html            ← QR generator tool
├── README.md                   ← Main usage guide
├── QUICK-START.md              ← Fastest start guide
├── OVERVIEW.md                 ← Complete documentation
├── PRINTING.md                 ← Printing instructions
├── PRE-PRINT-CHECKLIST.md      ← Quality checklist
├── INDEX.md                    ← This file
├── package.json                ← App metadata
└── .gitignore                  ← Git ignore rules
```

## 💡 Pro Tips

1. **Always test the QR code** on multiple phones before bulk printing
2. **Request a test print** of 1-2 cards before ordering 500
3. **Use Chrome for printing** — best color accuracy
4. **Enable "Background graphics"** — most common mistake
5. **Choose matte finish** — looks more professional than gloss
6. **300gsm minimum** — thinner stock feels cheap

## 🚨 Troubleshooting

| Problem | Solution |
|---------|----------|
| Background is white when printed | Enable "Background graphics" in print settings |
| QR code doesn't scan | Generate new QR at higher size/quality |
| Colors look wrong | Print from Chrome, not other browsers |
| PDF is too large | It shouldn't be — check you saved from Chrome |
| Text is blurry | Don't screenshot — use "Save as PDF" |

## 📞 Support

- **Email**: startpos04@gmail.com
- **Website**: https://startpos.github.io/
- **Questions**: Check [README.md](README.md) first

## 🎓 Learning Path

### Beginner
1. [QUICK-START.md](QUICK-START.md) — Get started in 30 seconds
2. [README.md](README.md) — Understand the basics
3. [PRINTING.md](PRINTING.md) — Learn to print

### Intermediate  
1. [OVERVIEW.md](OVERVIEW.md) — Deep understanding
2. [PRE-PRINT-CHECKLIST.md](PRE-PRINT-CHECKLIST.md) — Quality control
3. Start customizing colors and content

### Advanced
1. Modify CSS variables for custom branding
2. Adjust card dimensions for non-standard sizes
3. Create variations for different audiences

---

## ⏱️ Time Investment

- **Preview**: 30 seconds
- **Print as-is**: 5 minutes
- **Customize**: 10-15 minutes
- **Full understanding**: 30 minutes

## ✅ What You Get

- ✅ Professional business card design
- ✅ Print-ready (no design work needed)
- ✅ Fully customizable
- ✅ QR code integration
- ✅ Brand-aligned colors
- ✅ Complete documentation
- ✅ No dependencies or build process
- ✅ Works offline

---

**Ready to start?** Open [QUICK-START.md](QUICK-START.md) for the fastest path forward!
