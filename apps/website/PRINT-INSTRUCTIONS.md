# Print Instructions for Product Introduction Page

## How to Print or Save as PDF

### Option 1: Using the Print Button (Easiest)
1. Visit `/product-intro` page
2. Click the green **"Print / Save PDF"** button in the bottom-right corner
3. Choose your printer or **"Save as PDF"**
4. Adjust settings if needed
5. Print or save

### Option 2: Using Browser Menu
**Chrome / Edge:**
1. Press `Ctrl + P` (Windows) or `Cmd + P` (Mac)
2. Destination: Select "Save as PDF" or your printer
3. Layout: Portrait recommended
4. Margins: Default
5. Click "Save" or "Print"

**Firefox:**
1. Press `Ctrl + P` (Windows) or `Cmd + P` (Mac)
2. Select "Print to PDF" or your printer
3. Click "Print" or "Save"

**Safari:**
1. Press `Cmd + P`
2. Click "PDF" dropdown in bottom-left
3. Select "Save as PDF"
4. Choose location and save

---

## Print Optimization Features

### ✅ What's Optimized
- **Page Size:** A4 format
- **Margins:** Professional 1.5cm margins
- **Colors:** Print-friendly with preserved brand colors
- **Typography:** Optimized font sizes for readability
- **Layout:** Two-column grids for efficient space usage
- **Page Breaks:** Strategic breaks to avoid awkward cuts
- **No Waste:** Navigation, buttons, and decorative elements hidden
- **Links:** External URLs shown in parentheses

### 📄 What Gets Hidden When Printing
- Navigation menu
- Header and footer
- Print button
- Scroll animations
- Hover effects
- Decorative background patterns

### 📋 What Shows When Printing
- Clean header with company name and contact info
- All content sections
- Feature lists and descriptions
- Technology highlights
- Roadmap items
- Professional formatting

---

## Tips for Best Results

### For PDF Export:
1. **Paper size:** A4 (recommended) or Letter
2. **Color:** Color (recommended for brand consistency)
3. **Quality:** High quality
4. **Background graphics:** Enabled (to preserve design colors)

### For Physical Printing:
1. **Paper:** White, letter/A4 size
2. **Print quality:** Best or High
3. **Color mode:** Color (if available)
4. **Two-sided:** Optional (save paper!)

### Browser Settings to Check:
```
✅ Background graphics: ON
✅ Headers and footers: ON (for page numbers)
✅ Margins: Default or Normal
✅ Scale: 100% (adjust only if content cuts off)
```

---

## Customization

### To Change Company Contact Info:
Edit the print-only header section in `product-intro.astro`:

```html
<p class="text-sm text-slate-500 mt-2">
  Visit: startpos.ph | Email: hello@startpos.ph
</p>
```

### To Add Your Logo:
1. Place logo in `/public/images/logo.png`
2. Add to print-only header:
```html
<img src="/images/logo.png" alt="Start POS Logo" class="mx-auto mb-4 h-16">
```

### To Adjust Page Breaks:
Modify the CSS `@media print` section to add breaks before specific sections:
```css
#section-id {
  page-break-before: always;
}
```

---

## Expected Output

### Page Count: 
Approximately **6-8 pages** (A4, portrait)

### Sections Included:
1. Cover/Header
2. Overview & Why Start POS
3. Business Types
4. Key Features (2 pages)
5. Configuration & Compliance
6. Technology Stack
7. Roadmap
8. Getting Started & CTA

---

## Troubleshooting

### Colors not printing?
- **Chrome/Edge:** Enable "Background graphics"
- **Firefox:** Enable "Print backgrounds"
- **Safari:** Check "Print backgrounds" in print dialog

### Content cut off?
- Reduce scale to 95% or 90%
- Check margins are not set to "None"
- Ensure page size is A4 or Letter

### Links showing weird?
- External links will show URL in parentheses (this is intentional for print)
- Internal links won't show URLs

### Page numbers not showing?
- Enable "Headers and footers" in print settings
- Page numbers appear in bottom-right corner

### Too many pages?
- This is normal for comprehensive content
- Consider printing two-sided to save paper

---

## Professional Distribution Tips

### For Sales Meetings:
1. Print in color on quality paper
2. Include business card or contact sheet
3. Consider spiral binding for multi-page handouts

### For Email Distribution:
1. Save as PDF from browser
2. File size should be ~500KB-2MB
3. Name file: `StartPOS-Product-Introduction.pdf`
4. Include in email body: "Please see attached product introduction"

### For Trade Shows:
1. Print multiple copies
2. Use cardstock for first/last page if possible
3. Consider laminating key pages
4. Include QR code linking to digital version

---

## Questions?

If you encounter any printing issues or need custom formatting, please contact the development team or submit an issue to the repository.

**Last Updated:** 2026-08-12
