// Documents that travel with a DHL parcel of herbal therapy: a product declaration for customs, a Material Safety
// Data Sheet (MSDS) per product and a product info sheet, rendered from the prescription and the herbal product
// catalogue into one PDF that is filed under the patient's Documents (type SHIPPING).
// Wording follows the clinic's own product declaration and MSDS documents.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { requirePerm } from './permissions.js';
import { transactional } from './transaction.js';
import { prescriptionSettings } from './prescription-settings.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const fail = (status, message, extra) => { throw Object.assign(new Error(message), { status, ...extra }); };
export const codeKey = s => String(s ?? '').replace(/\s+/g, '').toLowerCase();
const TYPES = ['ELIXIR', 'POWDER', 'OIL', 'CAPSULE', 'OIL_CAPSULE', 'OTHER'];

/** How each product type is named in the declaration list and the info sheet title. */
const TYPE_TEXT = {
  ELIXIR: { list: 'Herbal liquid supplements', title: 'ELIXIR', generic: 'Elixir herbal liquid', form: 'LIQUID' },
  POWDER: { list: 'Herbal powder supplements', title: 'POWDER', generic: 'Herbal powder', form: 'POWDER' },
  OIL: { list: 'Herbal liquid oil', title: 'OIL', generic: 'Herbal oil', form: 'LIQUID' },
  CAPSULE: { list: 'Herbal capsules', title: 'CAPSULES', generic: 'Herbal capsules', form: 'CAPSULE' },
  OIL_CAPSULE: { list: 'Herbal oil capsules', title: 'OIL CAPSULES', generic: 'Herbal oil capsules', form: 'CAPSULE' },
  OTHER: { list: 'Herbal supplements', title: 'PRODUCT', generic: 'Herbal product', form: 'HERBAL' },
};

// ── MSDS ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Common text from the clinic's MSDS. Values that depend on the kind of product start from MSDS_BY_TYPE and can be
// overridden per product (herbal_products.msds), e.g. colour or the emergency telephone number.
const MSDS_COMMON = {
  emergencyPhone: '+382 69 330 057',
  eye: 'It is not an eye irritant, but direct contact with the eye may produce transient discomfort.',
  skin: 'Skin contact is not thought to have harmful health effects, however the material may produce irritation following entry through wounds, lesions or abrasions.',
  ingestion: 'Food grade',
  inhalation: 'Inhalation of fine mist will not affect respiratory system.',
  firstEyes: 'Rinse immediately with plenty of water for at least 5 minutes without lifting eyelids.',
  firstSkin: 'Wash affected area with plenty of water and soap',
  firstIngestion: 'Do not induce vomiting.',
  firstInhalation: 'If there is irritation from inhalation remove from exposure and move to fresh air immediately.',
  firstGeneral: 'In all cases of doubt or when symptoms persist always get medical assistance.',
  extinguishing: 'Dry Chemical, Carbon Dioxide, Foam',
  spills: 'Absorb onto an inert, absorbent substrate and sweep up. Wash area with soap and water.',
  handling: 'Keep away from fire and open flames. Do not overheat.',
  storage: 'Store in a cool, dry location, in a sealed container.',
  ppeEye: 'Safety glasses should be worn', ppeSkin: 'Aprons, gloves should be worn.', ppeResp: 'Not needed under normal conditions of use.',
  ppeOther: 'Evaluate need based on application. Slip proof shoes may be worn where spills may occur.',
  hygiene: 'Normal work and hygiene practices for handling non-hazardous material.',
  ph: 'Not available', vaporPressure: 'Not available', meltingPoint: 'Not available', autoIgnition: 'Not available', evaporation: 'Not available',
  waterReactive: 'No', incompatible: 'Avoid strong oxidizers', avoid: 'Excessive heat', decomposition: 'Not known', polymerization: 'Will not occur',
  acute: 'None established', chronic: 'None established', irritancy: 'Skin and eyes: not expected to be an irritant', carcinogenicity: 'None',
  ecological: 'No information', disposal: 'Do not put into sewer lines. Dispose of according to local, state and federal regulations.',
  dot: 'Ship as food stuff, not to be loaded with incompatible materials including poisons.', classDivision: 'Not restricted',
  shippingName: 'Not regulated as a hazardous material', label: 'None', packingGroup: 'Not available', idNumber: 'Not available', hazard: 'Not available',
  regulatory: 'European Labeling in Accordance with EC Directives\nHazard Symbols: Not available\nSafety Phrases: S 24/25 Avoid contact with skin and eyes.',
};
const OIL_FIRE = {
  flashPoint: '225 deg C or 437.00 deg F (close cup)', lel: 'Low', uel: 'Low',
  specialFire: 'Cool containers exposed to flame with water. Limit the spread of oil. Treat as an oil (edible fat) fire. Use air supplied equipment for fighting interior fires.',
  unusualFire: 'Rags and/or other materials containing this material may heat and spontaneously ignite if exposed to air. Store rags and similar materials in air tight containers. Avoid use of water in extinguishing oil fires.',
};
const NON_OIL_FIRE = {
  flashPoint: 'Not applicable', lel: 'Not applicable', uel: 'Not applicable',
  specialFire: 'Use extinguishing media appropriate to the surrounding fire.', unusualFire: 'None known.',
};
export const MSDS_BY_TYPE = {
  OIL: { ...OIL_FIRE, routes: 'This herbal oil is not regarded as a health hazard.', physicalState: 'Liquid oil', color: 'Pale green', odor: 'Aromatic plants', vaporDensity: '>1', boilingPoint: '570 deg F', specificGravity: '0.920 - 0.925', solubility: 'Insoluble', stability: 'Generally stable, becomes rancid on extended exposure to air.' },
  OIL_CAPSULE: { ...OIL_FIRE, routes: 'This herbal oil is not regarded as a health hazard.', physicalState: 'Oil in capsules', color: 'Not available', odor: 'Aromatic plants', vaporDensity: 'Not available', boilingPoint: 'Not available', specificGravity: 'Not available', solubility: 'Insoluble', stability: 'Generally stable.' },
  ELIXIR: { ...NON_OIL_FIRE, routes: 'This herbal water extract is not regarded as a health hazard.', physicalState: 'Liquid (herbal water extract)', color: 'Not available', odor: 'Aromatic plants', vaporDensity: 'Not available', boilingPoint: 'Not available', specificGravity: 'Not available', solubility: 'Soluble', stability: 'Stable under normal conditions.' },
  POWDER: { ...NON_OIL_FIRE, routes: 'This herbal powder is not regarded as a health hazard.', physicalState: 'Powder', color: 'Not available', odor: 'Aromatic plants', vaporDensity: 'Not applicable', boilingPoint: 'Not applicable', specificGravity: 'Not available', solubility: 'Partly soluble', stability: 'Stable when kept dry.', inhalation: 'Inhalation of fine dust may cause transient irritation.' },
  CAPSULE: { ...NON_OIL_FIRE, routes: 'These herbal capsules are not regarded as a health hazard.', physicalState: 'Capsules (herbal powder)', color: 'Not available', odor: 'Aromatic plants', vaporDensity: 'Not applicable', boilingPoint: 'Not applicable', specificGravity: 'Not available', solubility: 'Partly soluble', stability: 'Stable when kept dry.' },
  OTHER: { ...NON_OIL_FIRE, routes: 'This herbal product is not regarded as a health hazard.', physicalState: 'Not available', color: 'Not available', odor: 'Not available', vaporDensity: 'Not available', boilingPoint: 'Not available', specificGravity: 'Not available', solubility: 'Not available', stability: 'Stable under normal conditions.' },
};
export const MSDS_KEYS = [...new Set([...Object.keys(MSDS_COMMON), ...Object.keys(MSDS_BY_TYPE.OIL), ...Object.keys(MSDS_BY_TYPE.POWDER)])];
const msdsFor = (type, own) => ({ ...MSDS_COMMON, ...MSDS_BY_TYPE[type], ...Object.fromEntries(Object.entries(own ?? {}).filter(([, v]) => typeof v === 'string' && v.trim())) });

const MSDS_SECTIONS = m => [
  ['1. PRODUCT NAME AND COMPANY IDENTIFICATION', [['Product Name', m.productName], ['Product Use', m.productUse], ['Company Name', m.company], ['Company Address', m.address], ['Date Issued', m.date], ['Emergency Telephone Number', m.emergencyPhone]]],
  ['2. COMPOSITION/INGREDIENT INFORMATION', [['Ingredients', m.ingredients], ['Hazardous Components', 'None']]],
  ['3. HAZARDS IDENTIFICATION', [['Routes of Entry', m.routes], ['Eye Contact', m.eye], ['Skin Contact', m.skin], ['Ingestion', m.ingestion], ['Inhalation', m.inhalation]]],
  ['4. FIRST AID MEASURES', [['Eyes', m.firstEyes], ['Skin', m.firstSkin], ['Ingestion', m.firstIngestion], ['Inhalation', m.firstInhalation], ['Medical Conditions Generally', m.firstGeneral]]],
  ['5. FIRE FIGHTING MEASURES', [['Flash Point (Method Used)', m.flashPoint], ['Flammable Limits LEL', m.lel], ['UEL', m.uel], ['Extinguishing Media', m.extinguishing], ['Special Firefighting Procedures', m.specialFire], ['Unusual Fire & Explosion Hazards', m.unusualFire]]],
  ['6. ACCIDENTAL RELEASE MEASURES (STEPS FOR SPILLS)', [['Methods for Cleaning Up', m.spills]]],
  ['7. HANDLING AND STORAGE', [['Safe Handling', m.handling], ['Storage Areas and Containers', m.storage]]],
  ['8. EXPOSURE CONTROL/PERSONAL PROTECTION', [['Eye', m.ppeEye], ['Skin/Body', m.ppeSkin], ['Respiratory', m.ppeResp], ['Other', m.ppeOther], ['Work/Hygiene Practice', m.hygiene]]],
  ['9. PHYSICAL AND CHEMICAL PROPERTIES', [['Physical State', m.physicalState], ['Color', m.color], ['Odor', m.odor], ['pH', m.ph], ['Vapor Pressure (mm Hg.)', m.vaporPressure], ['Vapor Density (AIR = 1)', m.vaporDensity], ['Boiling Point', m.boilingPoint], ['Melting Point', m.meltingPoint], ['Auto Ignition Temperature', m.autoIgnition], ['Specific Gravity (H2O = 1)', m.specificGravity], ['Evaporation Rate', m.evaporation], ['Solubility in Water', m.solubility], ['Water Reactive', m.waterReactive]]],
  ['10. STABILITY AND REACTIVITY', [['Stability', m.stability], ['Incompatibility (Materials to Avoid)', m.incompatible], ['Conditions to Avoid', m.avoid], ['Hazardous Decomposition or Byproducts', m.decomposition], ['Hazardous Polymerization', m.polymerization]]],
  ['11. TOXICOLOGICAL INFORMATION', [['Acute Effects of Overexposure', m.acute], ['Chronic Effects of Overexposure', m.chronic], ['Irritancy', m.irritancy], ['Carcinogenicity', m.carcinogenicity]]],
  ['12. ECOLOGICAL INFORMATION', [['', m.ecological]]],
  ['13. DISPOSAL CONSIDERATIONS', [['Waste Disposal Methods', m.disposal]]],
  ['14. TRANSPORT INFORMATION', [['DOT Classification', m.dot], ['Class/Division', m.classDivision], ['Proper Shipping Name', m.shippingName], ['Label', m.label], ['Packing Group', m.packingGroup], ['ID Number', m.idNumber], ['Hazard', m.hazard]]],
  ['15. REGULATORY INFORMATION', [['', m.regulatory]]],
  ['16. ADDITIONAL INFORMATION', [['', 'This information is provided for documentation purposes only. This product is not considered hazardous. The complete range of conditions or methods of use are beyond our control therefore we do not assume any responsibility and expressly disclaim any liability for any use of this product. Information contained herein is believed to be true and accurate however, all statements or suggestions are made without warranty, expressed or implied, regarding accuracy of the information, the hazards connected with the use of the material or the results to be obtained from the use thereof. Compliance with all applicable federal, state, and local laws and local regulations remains the responsibility of the user.']]],
];

// ── Catalogue ────────────────────────────────────────────────────────────────────────────────────────────────

const PRODUCT_TEXT = { name: 300, ingredients: 6000, product_use: 300, way_of_use: 300, manufacturer: 1000, certificate: 1000 };
function cleanProduct(b) {
  const code = typeof b.code === 'string' ? b.code.trim() : '';
  if (!code || code.length > 120) fail(400, 'Code is required (up to 120 characters), e.g. 15, Chandra or 3(1) + 14(1) + 15(3)');
  const product_type = TYPES.includes(b.productType) ? b.productType : fail(400, 'Choose the product type');
  const out = { code, code_key: codeKey(code), product_type };
  for (const [k, max] of Object.entries(PRODUCT_TEXT)) {
    const v = b[{ product_use: 'productUse', way_of_use: 'wayOfUse' }[k] ?? k] ?? '';
    if (typeof v !== 'string' || v.length > max) fail(400, `${k.replace('_', ' ')}: up to ${max} characters`);
    out[k] = v.trim();
  }
  if (!out.name) fail(400, 'Product name is required');
  const msds = {};
  for (const [k, v] of Object.entries(b.msds && typeof b.msds === 'object' ? b.msds : {})) {
    if (!MSDS_KEYS.includes(k)) continue;
    if (typeof v !== 'string' || v.length > 2000) fail(400, `MSDS ${k}: up to 2000 characters`);
    if (v.trim()) msds[k] = v.trim();
  }
  out.msds = msds;
  return out;
}

/** Splits a formula into component codes: "3(1) + 14(1) + 15(3)" -> ["3","14","15"]. */
export const components = formula => String(formula).split('+').map(p => p.trim().replace(/\(\s*[\d.,/]+\s*\)\s*$/, '').trim()).filter(Boolean);

/** Finds the catalogue entry for a prescribed formula, or combines its components'. */
export function resolveProduct(formula, form, byKey) {
  const exact = byKey.get(codeKey(formula));
  if (exact) return { ...exact, formula };
  const parts = components(formula);
  const found = parts.map(p => byKey.get(codeKey(p)));
  const missing = parts.filter((p, i) => !found[i]);
  if (!parts.length || missing.length) return { missing: missing.length ? missing : [formula] };
  const seen = new Map();
  for (const p of found) for (const ing of p.ingredients.split(/[,;\n]+/).map(s => s.trim().replace(/\.$/, '')).filter(Boolean)) if (!seen.has(ing.toLowerCase())) seen.set(ing.toLowerCase(), ing);
  const type = TYPES.includes(form) ? form : found[0].product_type;
  return {
    formula, product_type: type, name: TYPE_TEXT[type].generic, ingredients: [...seen.values()].join(', '),
    product_use: found[0].product_use, way_of_use: found[0].way_of_use,
    manufacturer: [...new Set(found.map(p => p.manufacturer).filter(Boolean))].join('\n'),
    certificate: [...new Set(found.map(p => p.certificate).filter(Boolean))].join('\n'), msds: found[0].msds,
  };
}

// ── PDF ──────────────────────────────────────────────────────────────────────────────────────────────────────

const W = 595.28, H = 841.89, M = 56;
const ink = rgb(0.08, 0.08, 0.1), grey = rgb(0.35, 0.35, 0.38), red = rgb(0.75, 0.1, 0.1);
let assets;
const loadAssets = () => (assets ??= {
  regular: fs.readFileSync(path.join(DIR, 'fonts', 'NotoSans-Regular.ttf')),
  bold: fs.readFileSync(path.join(DIR, 'fonts', 'NotoSans-Bold.ttf')),
  logo: fs.existsSync(path.join(DIR, 'assets', 'letterhead-logo.png')) ? fs.readFileSync(path.join(DIR, 'assets', 'letterhead-logo.png')) : null,
});
const dmy = d => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}.`;

function wrap(text, font, size, width) {
  const out = [];
  for (const para of String(text ?? '').split(/\r?\n/)) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) { cur = next; continue; }
      if (cur) out.push(cur);
      cur = word;
    }
    out.push(cur);
  }
  return out;
}

/** A small page-flowing writer over pdf-lib. */
async function writer(letterhead) {
  const a = loadAssets();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // Full fonts: pdf-lib's subsetting drops glyphs from Noto Sans (see intake.js).
  const R = await doc.embedFont(a.regular, { subset: false });
  const B = await doc.embedFont(a.bold, { subset: false });
  const logo = a.logo ? await doc.embedPng(a.logo) : null;
  const w = { doc, R, B, page: null, y: 0, size: [W, H] };
  w.newPage = (size = [W, H], withHead = true) => {
    w.size = size;
    w.page = doc.addPage(size);
    w.y = size[1] - 40;
    if (!withHead) return;
    const [first, ...rest] = letterhead;
    const x = logo ? M + 72 : M;
    if (logo) { const h = 62, lw = (logo.width / logo.height) * h; w.page.drawImage(logo, { x: M, y: w.y - h + 6, width: lw, height: h }); }
    w.page.drawText(first ?? '', { x, y: w.y - 8, size: 14, font: B, color: ink });
    let ly = w.y - 24;
    for (const l of rest) { w.page.drawText(l, { x, y: ly, size: 9.5, font: R, color: ink }); ly -= 12.5; }
    w.y = Math.min(ly, w.y - 62) - 4;
    w.page.drawLine({ start: { x: M, y: w.y }, end: { x: size[0] - M, y: w.y }, thickness: 1.2, color: ink });
    w.y -= 26;
  };
  w.ensure = h => { if (w.y - h < 50) w.newPage(w.size); };
  w.text = (text, { font = R, size = 10.5, color = ink, x = M, width = w.size[0] - M - x, gap = 3, center = false, right = false } = {}) => {
    for (const line of wrap(text, font, size, width)) {
      w.ensure(size + gap);
      const lx = center ? (w.size[0] - font.widthOfTextAtSize(line, size)) / 2 : right ? w.size[0] - M - font.widthOfTextAtSize(line, size) : x;
      w.page.drawText(line, { x: lx, y: w.y, size, font, color });
      w.y -= size + gap;
    }
  };
  w.space = h => { w.y -= h; };
  return w;
}

function declaration(w, { patient, date, sinceYear, days, lines, letterhead }) {
  w.newPage();
  w.text('PRODUCT DECLARATION', { font: w.B, size: 12, center: true });
  w.space(10);
  w.text(`Date: ${dmy(date)}`, { right: true, font: w.B });
  w.space(10);
  const who = patient.sex === 'Female' ? ['She', 'her'] : patient.sex === 'Male' ? ['He', 'his'] : ['The patient', 'the patient\'s'];
  w.text(`This is to certify that ${patient.name} is undergoing Ayurvedic therapy in our institution since ${sinceYear}.`);
  w.text(`${who[0]} is advised to have Ayurvedic herbal supplements described below for a period of ${days} days. This has been specifically formulated for the patient in our institution.`);
  w.space(10);
  lines.forEach((l, i) => w.text(`${i + 1}.  ${TYPE_TEXT[l.product.product_type].list} – ${l.quantity}`, { font: w.B, x: M + 16, color: red }));
  w.space(10);
  const forms = [...new Set(lines.map(l => TYPE_TEXT[l.product.product_type].form))];
  const formText = forms.length > 1 ? `${forms.slice(0, -1).join(', ')} AND ${forms.at(-1)}` : forms[0];
  w.text('These supplements are non-toxic, non-narcotic, non-habituating, non-inflammable, non-viable and sterile.');
  w.text(`THE PARCEL CONTAINS HERBAL PRODUCTS IN ${formText} FORM. NONE OF THE HERBAL PRODUCTS CONTAIN ANY PHARMACEUTICAL ACTIVE INGREDIENTS, AS THEY ARE NOT IN PHARMACEUTICAL GRADE.`);
  w.space(8);
  w.text('They are made from herbal ingredients. The ingredients are listed below:');
  w.space(6);
  lines.forEach((l, i) => {
    w.text(`${i + 1}.  ${TYPE_TEXT[l.product.product_type].list}: ${l.product.name} – ( ${l.formula} ) ( ${l.quantity} )`, { x: M + 16, font: w.B, size: 10.5 });
    w.text(`${l.product.product_use || 'Food supplements for general health'}. Ingredients: ${l.product.ingredients}.`.replace('..', '.'), { x: M + 32 });
    w.space(6);
  });
  w.space(14);
  const makers = [...new Set(lines.flatMap(l => (l.product.manufacturer || letterhead.slice(0, 3).join('\n')).split('\n')))];
  w.text('Manufacturing company and address:', { font: w.B });
  for (const m of makers) w.text(m);
}

function msds(w, { line, date, letterhead }) {
  const p = line.product;
  w.newPage();
  w.text('MATERIAL SAFETY DATA SHEET (MSDS)', { font: w.B, size: 11.5 });
  w.space(4);
  w.text(`${TYPE_TEXT[p.product_type].generic}: ( ${line.formula} )`, { font: w.B, size: 11, color: red });
  w.space(8);
  const m = { ...msdsFor(p.product_type, p.msds), productName: `${p.name} ( ${line.formula} )`, productUse: p.product_use || '—', company: letterhead[1] || letterhead[0], address: letterhead[2] || '', date: dmy(date), ingredients: p.ingredients };
  const labelW = 190, vx = M + labelW + 8, vw = W - M - vx;
  for (const [title, rows] of MSDS_SECTIONS(m)) {
    w.ensure(40);
    w.page.drawRectangle({ x: M, y: w.y - 5, width: W - 2 * M, height: 17, borderColor: ink, borderWidth: 0.8 });
    w.page.drawText(title, { x: M + 6, y: w.y, size: 9.5, font: w.B, color: ink });
    w.y -= 22;
    for (const [label, value] of rows) {
      const vals = wrap(value ?? '', w.R, 9.5, label ? vw : W - 2 * M);
      w.ensure(Math.min(vals.length, 6) * 12);
      const top = w.y;
      if (label) w.page.drawText(`${label}:`, { x: M, y: top, size: 9.5, font: w.B, color: grey });
      let vy = top;
      for (const v of vals) { if (vy < 50) { w.newPage(); vy = w.y; } w.page.drawText(v, { x: label ? vx : M, y: vy, size: 9.5, font: w.R, color: ink }); vy -= 12; }
      w.y = vy - 2;
    }
    w.space(6);
  }
}

function infoSheets(w, { lines, distributor }) {
  const size = [H, W]; // landscape, like the clinic's product info label
  const cols = [['Name', 70], ['Quantity', 52], ['Manufacturer', 92], ['Way of use', 66], ['Use', 78], ['Ingredients', 170], ['Manufacture date / Best before', 76], ['Distributor for Montenegro', 82], ['Certificate', 82]];
  const total = cols.reduce((s, [, cw]) => s + cw, 0), left = (size[0] - total) / 2;
  for (const l of lines) {
    const p = l.product;
    w.newPage(size);
    w.page.drawText(TYPE_TEXT[p.product_type].title, { x: left, y: w.y, size: 12, font: w.B, color: ink });
    w.page.drawText('INFO', { x: size[0] / 2, y: w.y, size: 12, font: w.B, color: ink });
    w.y -= 20;
    const cells = [`${p.name}\n( ${l.formula} )`, l.quantity, p.manufacturer, p.way_of_use, p.product_use, p.ingredients, [l.mfgDate, l.bestBefore].filter(Boolean).join(' / '), distributor, p.certificate];
    const wrapped = cells.map((c, i) => wrap(c || '', w.R, 8, cols[i][1] - 8));
    const headH = Math.max(...cols.map(([title, cw]) => wrap(title, w.B, 8, cw - 8).length)) * 9.5 + 8;
    const bodyH = Math.max(...wrapped.map(x => x.length)) * 10 + 10;
    let x = left;
    cols.forEach(([title, cw], i) => {
      w.page.drawRectangle({ x, y: w.y - headH - bodyH, width: cw, height: headH + bodyH, borderColor: ink, borderWidth: 0.6 });
      w.page.drawLine({ start: { x, y: w.y - headH }, end: { x: x + cw, y: w.y - headH }, thickness: 0.6, color: ink });
      wrap(title, w.B, 8, cw - 8).forEach((t, j) => w.page.drawText(t, { x: x + 4, y: w.y - 10 - j * 9.5, size: 8, font: w.B, color: ink }));
      wrapped[i].forEach((t, j) => w.page.drawText(t, { x: x + 4, y: w.y - headH - 10 - j * 10, size: 8, font: w.R, color: ink }));
      x += cw;
    });
    w.y -= headH + bodyH + 10;
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────────────────────────────────────

export function registerShipping({ app, pool, auth, audit, storageDir }) {
  const asJson = r => ({ ...r, msds: r.msds ?? {} });
  app.get('/api/herbal-products', auth, requirePerm('products.read'), async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM herbal_products WHERE active ORDER BY lower(code)');
    res.json({ products: rows.map(asJson), msdsDefaults: Object.fromEntries(TYPES.map(t => [t, msdsFor(t, {})])), msdsKeys: MSDS_KEYS });
  });

  const save = (sql, action) => transactional(pool, async (req, res, c) => {
    const p = cleanProduct(req.body || {});
    const params = [p.code, p.code_key, p.name, p.product_type, p.ingredients, p.product_use, p.way_of_use, p.manufacturer, p.certificate, JSON.stringify(p.msds), req.auth.user_id];
    let r;
    try {
      r = await c.query(sql, req.params.id ? [...params, req.params.id] : params);
    } catch (e) {
      if (e.code === '23505') fail(409, `A product with code "${p.code}" already exists`);
      throw e;
    }
    if (!r.rows[0]) fail(404, 'Product not found');
    await audit(c, { userId: req.auth.user_id, sessionId: req.auth.session_id, action, tableName: 'herbal_products', recordId: r.rows[0].id, req, details: { code: p.code } });
    res.status(req.params.id ? 200 : 201).json(asJson(r.rows[0]));
  });
  app.post('/api/herbal-products', auth, requirePerm('products.write'), save(
    `INSERT INTO herbal_products(code,code_key,name,product_type,ingredients,product_use,way_of_use,manufacturer,certificate,msds,updated_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, 'CREATE_HERBAL_PRODUCT'));
  app.put('/api/herbal-products/:id', auth, requirePerm('products.write'), save(
    `UPDATE herbal_products SET code=$1,code_key=$2,name=$3,product_type=$4,ingredients=$5,product_use=$6,way_of_use=$7,manufacturer=$8,certificate=$9,msds=$10,updated_by=$11,updated_at=now()
     WHERE id=$12 AND active RETURNING *`, 'UPDATE_HERBAL_PRODUCT'));
  app.delete('/api/herbal-products/:id', auth, requirePerm('products.write'), transactional(pool, async (req, res, c) => {
    // Retired, not deleted: the code is freed so it can be entered again.
    const r = await c.query(`UPDATE herbal_products SET active=false, code_key=code_key||'#'||id WHERE id=$1 AND active RETURNING id,code`, [req.params.id]);
    if (!r.rows[0]) fail(404, 'Product not found');
    await audit(c, { userId: req.auth.user_id, sessionId: req.auth.session_id, action: 'RETIRE_HERBAL_PRODUCT', tableName: 'herbal_products', recordId: r.rows[0].id, req, details: { code: r.rows[0].code } });
    res.json({ ok: true });
  }));

  // POST /api/patients/:id/prescriptions/:recordId/shipping-documents
  //   { date?, sinceYear?, days, distributor?, items: [{ lineId, quantity, mfgDate?, bestBefore? }] }
  app.post('/api/patients/:id/prescriptions/:recordId/shipping-documents', auth, requirePerm('products.read'), requirePerm('documents.write'), transactional(pool, async (req, res, c) => {
    const b = req.body || {};
    const patient = (await c.query('SELECT * FROM patients WHERE patient_id=$1', [req.params.id])).rows[0];
    if (!patient) fail(404, 'Patient not found');
    const rx = (await c.query('SELECT * FROM prescriptions WHERE prescription_id=$1 AND patient_id=$2', [req.params.recordId, patient.patient_id])).rows[0];
    if (!rx) fail(404, 'Prescription not found for this patient');
    const days = Number(b.days);
    if (!Number.isInteger(days) || days < 1 || days > 730) fail(400, 'Therapy period: enter the number of days (1-730)');
    const date = b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? new Date(b.date + 'T12:00:00') : new Date();
    const sinceYear = Number(b.sinceYear) || new Date(patient.registered_at).getFullYear();
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) fail(400, 'Choose at least one product for the parcel');
    const rxLines = (await c.query('SELECT * FROM prescription_medicines WHERE prescription_id=$1 ORDER BY sort_order', [rx.prescription_id])).rows;
    const byKey = new Map((await c.query('SELECT * FROM herbal_products WHERE active')).rows.map(p => [p.code_key, p]));
    const missing = [];
    const lines = items.map(it => {
      const l = rxLines.find(x => x.row_id === it?.lineId);
      if (!l) fail(400, 'A product line does not belong to this prescription');
      const quantity = typeof it.quantity === 'string' ? it.quantity.trim().slice(0, 60) : '';
      if (!quantity) fail(400, `Enter the quantity in the parcel for ${l.medicine_name}`);
      const product = resolveProduct(l.medicine_name, l.form, byKey);
      if (product.missing) { missing.push(...product.missing); return null; }
      if (!product.ingredients) missing.push(l.medicine_name);
      const short = v => (typeof v === 'string' ? v.trim().slice(0, 40) : '');
      return { formula: l.medicine_name, quantity, product, mfgDate: short(it.mfgDate), bestBefore: short(it.bestBefore) };
    });
    if (missing.length) fail(400, `Add these to the product catalogue (with ingredients) first: ${[...new Set(missing)].join(', ')}`, { missing: [...new Set(missing)] });

    const settings = await prescriptionSettings(c);
    const letterhead = settings.en.letterhead.split('\n').map(s => s.trim()).filter(Boolean);
    const distributor = typeof b.distributor === 'string' && b.distributor.trim() ? b.distributor.trim().slice(0, 300) : 'Datha Ayuryoga International Health Institute d.o.o. Podgorica';
    const w = await writer(letterhead);
    w.doc.setTitle(`Shipping documents — ${patient.name}`);
    declaration(w, { patient, date, sinceYear, days, lines, letterhead });
    for (const line of lines) msds(w, { line, date, letterhead });
    infoSheets(w, { lines, distributor });
    const pdf = Buffer.from(await w.doc.save());

    const storageKey = crypto.randomUUID() + '.pdf';
    const file = path.join(storageDir, storageKey);
    await fs.promises.writeFile(file, pdf);
    req.onRollback = () => fs.promises.unlink(file).catch(() => {});
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const fileName = `DHL_${patient.uhid.replace(/[^\w.-]+/g, '-')}_${patient.name.replace(/[^\p{L}\p{N}]+/gu, '-')}_${day}.pdf`;
    const d = (await c.query(
      `INSERT INTO documents(patient_id,document_type,file_name,storage_key,mime_type,uploaded_by,title,report_date) VALUES($1,'SHIPPING',$2,$3,'application/pdf',$4,$5,$6) RETURNING id`,
      [patient.patient_id, fileName, storageKey, req.auth.user_id, `DHL documents: declaration, ${lines.length} MSDS, info sheets`, day])).rows[0];
    await audit(c, { userId: req.auth.user_id, sessionId: req.auth.session_id, action: 'CREATE_SHIPPING_DOCUMENTS', tableName: 'documents', recordId: d.id, req, details: { patientId: patient.patient_id, prescriptionNo: rx.prescription_no, products: lines.map(l => l.formula) } });
    res.status(201).json({ documentId: d.id, fileName, pages: w.doc.getPageCount() });
  }));
}
