const btns = Array.from(document.querySelectorAll('button'));
const matches = btns.filter(b => {
  const t = b.textContent || '';
  return t.includes('Strat') || t.includes('Back') || t.includes('test') || t.includes('Run');
});
const info = matches.map(b => {
  const r = b.getBoundingClientRect();
  return { text: b.textContent?.trim().slice(0, 50), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
});
JSON.stringify(info, null, 2);