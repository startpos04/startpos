# Printing Guide for StartPOS Calling Cards

## Quick Start

1. Open `index.html` in **Google Chrome**
2. Press `Ctrl+P` (or `Cmd+P` on Mac)
3. Configure these settings:
   - ✅ Background graphics: **ON**
   - Paper: Letter or A4
   - Margins: Default
   - Color: Color (not black & white)
4. Save as PDF or print directly

## Professional Printing Options

### Option 1: Local Print Shop
1. Save the page as PDF from Chrome
2. Take the PDF to any local print shop
3. Request:
   - **Paper**: 300gsm or 350gsm card stock
   - **Size**: Standard business card (3.5" × 2")
   - **Finish**: Matte or soft-touch laminate
   - **Quantity**: Minimum usually 100 cards
   - **Cost**: ~$20-50 for 100 cards

### Option 2: Online Print Services

#### VistaPrint (International)
- Website: https://www.vistaprint.com
- Upload the PDF
- Select "Premium" or "Luxury" card stock
- Typical price: $15-40 for 100 cards
- Delivery: 5-7 business days

#### Moo (Premium Quality)
- Website: https://www.moo.com
- Upload the PDF
- Known for excellent print quality
- Typical price: $30-60 for 100 cards
- Delivery: 7-10 business days

#### GotPrint (Philippines)
- Website: https://www.gotprint.com.ph
- Local delivery in Metro Manila
- Upload PDF
- Typical price: ₱800-1,500 for 100 cards
- Delivery: 3-5 business days

#### PrintRunner (Philippines)
- Website: https://www.printrunner.ph
- Local printing with quick turnaround
- Upload PDF
- Typical price: ₱600-1,200 for 100 cards
- Delivery: 2-3 business days

## Recommended Specifications

### Paper Stock
- **Weight**: 300gsm minimum (350gsm recommended)
- **Type**: Coated or uncoated card stock
- **Finish**: Matte (recommended) or gloss

**Why matte?** The back of the card has light colors that look better on matte finish, and matte is easier to write on if needed.

### Colors
The card uses exact color codes:
- **Navy**: `#0C222C` (brand color)
- **Amber**: `#F2A73C` (sell/checkout accent)
- **Mint**: `#4FD1AE` (inventory/stock accent)

Most professional printers will reproduce these accurately from the PDF.

### Cutting
- **Size**: 3.5" × 2" (89mm × 51mm)
- **Corner radius**: 7px (~2mm) — tell the printer "slightly rounded corners"

## Quality Checklist

Before sending to print, verify:
- [ ] QR code scans correctly on your phone
- [ ] Contact information is accurate
- [ ] Colors look correct in the PDF preview
- [ ] Text is sharp and readable (zoom in to 200%)
- [ ] Background graphics are visible (not white)

## Common Issues

### "Background is white when I print"
✅ Fix: Enable "Background graphics" in print settings

### "Colors look washed out"
✅ Fix: 
1. Use Chrome for printing (best color accuracy)
2. Request "full color" or "CMYK" printing from print shop
3. Ask for "color matching" or "color correction"

### "QR code doesn't scan"
✅ Fix: 
1. Check that QR code file (`qr-code.svg`) exists
2. Generate a new QR code at https://qr-code-generator.com
3. Test scan before printing bulk

### "Cards are too thin"
✅ Fix: Request 300gsm or higher card stock (thicker is more premium)

## Cost Estimates

| Quantity | Local Print Shop | Online (VistaPrint) | Online (Moo) | Philippines |
|----------|-----------------|---------------------|--------------|-------------|
| 100      | $20-30         | $15-25              | $30-40       | ₱600-800    |
| 250      | $35-50         | $25-35              | $50-70       | ₱1,200-1,500|
| 500      | $60-80         | $40-50              | $80-100      | ₱2,000-2,500|
| 1000     | $100-140       | $60-80              | $130-160     | ₱3,500-4,500|

*Prices are estimates and vary by location, paper stock, and finish.*

## File Preparation Tips

### For Best Results
1. **Always print from Chrome** — other browsers may have color inconsistencies
2. **Use "Save as PDF"** first — then send that PDF to the printer
3. **Preview the PDF** before printing bulk — zoom in to check quality
4. **Test print 1 card** first if possible

### What NOT to Do
- ❌ Don't screenshot the page — always use the PDF
- ❌ Don't print from Word or PowerPoint — use Chrome
- ❌ Don't resize the card — it's already the correct size
- ❌ Don't convert to JPG or PNG — PDF maintains quality

## Advanced: Custom Sizes

If you want a different card size, edit the CSS variables in `index.html`:

```css
:root {
  --card-w: 3.5in;  /* Change this for width */
  --card-h: 2in;    /* Change this for height */
}
```

Common sizes:
- **Standard US**: 3.5" × 2"
- **Standard EU**: 85mm × 55mm (3.35" × 2.17")
- **Square**: 2.5" × 2.5"

## Questions?

Contact the StartPOS team at startpos04@gmail.com or visit https://startpos.github.io/
