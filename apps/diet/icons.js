/* icons.js — 14px inline SVG, 1.5px stroke, currentColor.
   design-system.md: "Icons: inline SVG only, 1.5px stroke, currentColor, 14px
   box. No image files, no logos." That rule was written for the artifact
   sandbox, which had no network to fetch anything from. It still holds here for
   a better reason: an icon that inherits currentColor stays correct when the row
   it sits in turns amber for a pinned item or grey for an archived one. */

const wrap = d => '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';

export const ICONS = {
  /* grain — oats, rice */
  grain: wrap('<path d="M12 21V8"/><path d="M12 12c0-3 2-5 5-5 0 3-2 5-5 5Z"/>' +
              '<path d="M12 12c0-3-2-5-5-5 0 3 2 5 5 5Z"/><path d="M12 17c0-3 2-5 5-5 0 3-2 5-5 5Z"/>' +
              '<path d="M12 17c0-3-2-5-5-5 0 3 2 5 5 5Z"/>'),
  /* tub — protein powder */
  tub: wrap('<path d="M6 8h12l-1 12H7L6 8Z"/><path d="M5 5h14v3H5z"/><path d="M10 13h4"/>'),
  /* pot — yoghurt */
  pot: wrap('<path d="M6 9h12l-1.2 11H7.2L6 9Z"/><path d="M5 6h14v3H5z"/>'),
  /* bottle — milk */
  bottle: wrap('<path d="M10 3h4v3l2 3v12H8V9l2-3V3Z"/><path d="M8 13h8"/>'),
  /* berry */
  berry: wrap('<circle cx="9.5" cy="15" r="4"/><circle cx="15" cy="13" r="3.5"/>' +
              '<path d="M13 9.5V6M13 6c1.5-1 3-1 4-.5"/>'),
  /* honey drop */
  drop: wrap('<path d="M12 3s5 6 5 9.5A5 5 0 0 1 7 12.5C7 9 12 3 12 3Z"/>'),
  /* poultry */
  chicken: wrap('<path d="M14 4a6 6 0 0 1 6 6c0 4-3 6-6 6h-2l-4 4-2-2 4-4v-2c0-3 2-6 4-8Z"/>' +
                '<circle cx="16" cy="8" r="1"/>'),
  /* beef / mince */
  beef: wrap('<path d="M4 12a7 5 0 0 1 16 0 7 5 0 0 1-16 0Z"/><path d="M8 12a3.5 2.5 0 0 1 7 0"/>'),
  /* fish — salmon */
  fish: wrap('<path d="M3 12s3.5-5 8.5-5 8.5 5 8.5 5-3.5 5-8.5 5S3 12 3 12Z"/>' +
             '<path d="M20 12l1.5-3v6L20 12Z"/><circle cx="8" cy="11" r=".9"/>'),
  /* potato / root */
  potato: wrap('<path d="M5 13c0-4 3.5-7 8-7s6 2.5 6 5.5S15 20 10.5 20 5 17 5 13Z"/>'),
  /* leaf — veg */
  leaf: wrap('<path d="M5 19c0-8 6-13 14-13 0 8-5 14-13 14H5v-1Z"/><path d="M9 19c2-5 5-8 9-10"/>'),
  /* spice shaker — paprika */
  spice: wrap('<path d="M8 9h8v11H8z"/><path d="M9 6h6v3H9z"/><path d="M11 3h2v3h-2z"/>' +
              '<circle cx="11" cy="7" r=".4"/><circle cx="13" cy="7.5" r=".4"/>'),
  /* soy / sauce bottle */
  sauce: wrap('<path d="M10 3h4v2l1.5 2.5V20a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V7.5L10 5V3Z"/>' +
              '<path d="M9 12h6"/>'),
  /* cheese */
  cheese: wrap('<path d="M3 15V11l9-5 9 5v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>' +
               '<circle cx="8" cy="12.5" r="1"/><circle cx="14" cy="13" r="1"/>'),
  /* generic plate */
  plate: wrap('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/>')
};

export const icon = k => ICONS[k] || ICONS.plate;
