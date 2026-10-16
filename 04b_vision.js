/* ===== ER / EER diagram image recognition (real vision call, no mock) =====
   Two providers are supported, tried in this order:
   1. Claude's own runtime (claude.use('sample') with image support) - only exists when the page runs inside Claude.
   2. The Anthropic Messages API called directly from the browser with the user's own API key
      (stored only in this browser's localStorage and sent only to api.anthropic.com).
   If neither is available the capability is reported as unavailable. Nothing is ever faked. */
const VISION_DEFAULT_MODEL = 'claude-sonnet-5-5';
const VISION = {
  cfg: LS.get('vision', { apiKey: '', model: VISION_DEFAULT_MODEL }),
  save() { return LS.set('vision', VISION.cfg); }
};
class RecogError extends Error { constructor(code, message) { super(message); this.code = code; } }

const VISION_MAX_BYTES = 8e6, VISION_MAX_EDGE = 1568;
const VISION_TYPES = { 'image/png': 'PNG', 'image/jpeg': 'JPG', 'image/webp': 'WebP' };

/* Real format from the first bytes (the browser-reported MIME type and the extension can both be wrong). */
async function sniffImageType(file) {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  return '';
}
/* Validate an uploaded file. Returns {ok:true,type} or {ok:false,msg}. */
async function validateDiagramFile(f) {
  let type = '';
  try { type = await sniffImageType(f); } catch (e) { return { ok: false, msg: 'The file could not be read from disk. Try selecting it again.' }; }
  if (type === 'application/pdf') return { ok: true, type, pdf: true };
  if (!VISION_TYPES[type]) return { ok: false, msg: 'This is not a PNG, JPG or WebP image (its contents do not match). Export the diagram as one of those formats.' };
  if (f.size > VISION_MAX_BYTES) return { ok: false, msg: `The image is ${(f.size / 1e6).toFixed(1)} MB. The limit is 8 MB. Save a smaller copy.` };
  if (f.size < 1500) return { ok: false, msg: 'The file is too small to be a diagram.' };
  return { ok: true, type };
}
/* Decode, downscale to at most 1568px on the long edge (the size vision models work best at) and return base64. */
function prepareImage(file, type) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); rej(new RecogError('read_failed', 'The browser could not decode this image. It may be corrupt. Re-export it and try again.')); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      if (w < 120 || h < 120) return rej(new RecogError('unreadable', `The image is only ${w}×${h}px, too small to read any text from. Use a larger export.`));
      const k = Math.min(1, VISION_MAX_EDGE / Math.max(w, h)), cw = Math.round(w * k), ch = Math.round(h * k);
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const cx = cv.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, ch); cx.drawImage(img, 0, 0, cw, ch);
      const out = cv.toDataURL('image/png'); /* lossless: keeps thin lines and small text legible */
      let b64 = out.split(',')[1];
      if (b64.length * 0.75 > 4.8e6) { b64 = cv.toDataURL('image/jpeg', 0.9).split(',')[1]; return res({ b64, media: 'image/jpeg', w: cw, h: ch, origW: w, origH: h }); }
      res({ b64, media: 'image/png', w: cw, h: ch, origW: w, origH: h });
    };
    img.src = url;
  });
}

const VISION_SYSTEM = 'You are an exact transcription tool for entity-relationship (ER) and enhanced ER (EER) diagrams. You only report what is actually drawn and legible. You never guess, never complete a diagram from domain knowledge and never invent names, attributes or constraints.';
const VISION_PROMPT = `Read the attached image. It should be an ER or EER diagram (Elmasri-Navathe, Chen, crow's-foot or UML-like notation).

Transcribe ONLY what is visible. If something is not drawn or cannot be read, use null (for flags) or leave it out, and add a short note to "uncertain". Do not invent anything.

Reply with ONLY one JSON object, no prose, no markdown fences:
{
 "isErDiagram": true|false,
 "readable": true|false,
 "reason": "one sentence, required when isErDiagram or readable is false",
 "entities": [ { "name": "", "weak": true|false|null, "attributes": [ { "name": "", "key": true|false|null, "partialKey": true|false|null, "derived": true|false|null, "multivalued": true|false|null, "uncertain": true|false } ], "uncertain": true|false } ],
 "relationships": [ { "name": "", "a": "entity name", "b": "entity name", "cardA": "1"|"N"|"M"|null, "cardB": "1"|"N"|"M"|null, "totalA": true|false|null, "totalB": true|false|null, "uncertain": true|false } ],
 "isas": [ { "superclass": "", "subclasses": [""], "disjoint": true|false|null, "total": true|false|null, "uncertain": true|false } ],
 "uncertain": [ "short notes about anything hard to read, cut off, ambiguous or not shown" ]
}
Rules:
- key=true only for attributes drawn as keys (underlined / marked PK).
- cardA is the cardinality on the "a" side exactly as drawn (1, N, M). null when not drawn.
- totalA/totalB: true for a double line (total participation), false for a single line (partial), null when the notation does not show it.
- isas: a superclass/subclass (specialization/generalization, ISA triangle or circle). disjoint=true for 'd', false for 'o'/overlap, null when no letter is shown. total=true for a double line from the superclass, false for a single line, null when not shown.
- Use entity names exactly as written. relationships "a" and "b" must be names that also appear in "entities".
- A relationship with three or more participants: list the pairs you can read and mention the ternary relationship in "uncertain".
- If the image is not an ER/EER diagram set isErDiagram=false. If it is but too blurry/small to read set readable=false.`;

/* What can this page do right now? Never throws. */
async function visionCapability() {
  try {
    const s = await getSample();
    if (s) { let caps = null; try { caps = await s.limits(); } catch (e) { } if (caps && caps.images) return { ok: true, provider: 'claude-runtime', label: 'Claude (this page is running inside Claude)' }; }
  } catch (e) { }
  if (VISION.cfg.apiKey) return { ok: true, provider: 'anthropic-api', label: 'Anthropic API · ' + (VISION.cfg.model || VISION_DEFAULT_MODEL) };
  return { ok: false, provider: null, label: 'Not available', why: 'No image-capable AI is connected. This page is not running inside Claude, and no Anthropic API key has been saved in this browser.' };
}

function parseVisionJSON(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch (e) { }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { } }
  throw new RecogError('bad_response', 'The AI replied, but not with readable JSON. Try again; if it keeps happening use a clearer image.');
}

async function callAnthropic(img, signal) {
  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': VISION.cfg.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: VISION.cfg.model || VISION_DEFAULT_MODEL, max_tokens: 6000, temperature: 0, system: VISION_SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: img.media, data: img.b64 } }, { type: 'text', text: VISION_PROMPT }] }]
      })
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new RecogError('cancelled', 'Stopped.');
    throw new RecogError('network', 'Could not reach api.anthropic.com. Check your internet connection (and that no ad-blocker or network filter blocks it), then try again.');
  }
  let body = null; try { body = await r.json(); } catch (e) { }
  if (!r.ok) {
    const m = (body && body.error && body.error.message) || ('HTTP ' + r.status);
    if (r.status === 401 || r.status === 403) throw new RecogError('auth', 'The Anthropic API rejected the saved API key (' + m + '). Check the key in the recognition settings.');
    if (r.status === 404) throw new RecogError('model', 'The model "' + (VISION.cfg.model || VISION_DEFAULT_MODEL) + '" was not found for this key. Change the model name in the recognition settings.');
    if (r.status === 429) throw new RecogError('rate_limited', 'Too many requests or the key has no remaining quota. Wait a moment, or check your Anthropic billing/limits.');
    if (r.status === 413) throw new RecogError('too_large', 'The API says the image is too large. Use a smaller export.');
    if (r.status === 529 || r.status >= 500) throw new RecogError('overloaded', 'The Anthropic API is temporarily overloaded or down (' + m + '). Try again in a minute.');
    throw new RecogError('api', 'The Anthropic API returned an error: ' + m);
  }
  const txt = ((body && body.content) || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (!txt) throw new RecogError('bad_response', 'The AI returned an empty reply' + (body && body.stop_reason === 'refusal' ? ' (it declined to process the image).' : '.'));
  return { data: parseVisionJSON(txt), truncated: body.stop_reason === 'max_tokens' };
}

const vStr = x => (x == null ? '' : String(x)).trim();
/* Turn the raw model JSON into a clean structure, enforcing the "do not invent" rules. */
function normalizeVision(d) {
  if (!d || typeof d !== 'object') throw new RecogError('bad_response', 'The AI reply had an unexpected shape.');
  if (d.isErDiagram === false) throw new RecogError('not_er', 'This image was not recognised as an ER/EER diagram.' + (d.reason ? ' ' + vStr(d.reason) : ''));
  if (d.readable === false) throw new RecogError('unreadable', 'The diagram could not be read.' + (d.reason ? ' ' + vStr(d.reason) : ' Try a larger or sharper image.'));
  const tri = v => (v === true || v === false) ? v : null;
  const seen = new Set();
  const entities = (Array.isArray(d.entities) ? d.entities : []).map(e => ({
    name: vStr(e && e.name), weak: tri(e && e.weak), uncertain: !!(e && e.uncertain),
    attributes: (Array.isArray(e && e.attributes) ? e.attributes : []).map(a => (typeof a === 'string' ? { name: a } : a || {})).map(a => ({ name: vStr(a.name), key: a.key === true, partialKey: a.partialKey === true, derived: a.derived === true, multivalued: a.multivalued === true, uncertain: !!a.uncertain })).filter(a => a.name)
  })).filter(e => { const k = e.name.toLowerCase(); if (!e.name || seen.has(k)) return false; seen.add(k); return true; });
  if (!entities.length) throw new RecogError('unreadable', 'No entities could be read from this image. It may not be an ER/EER diagram or may be too unclear.');
  const card = v => (v === '1' || v === 1) ? '1' : (v === 'N' || v === 'M' || v === 'n' || v === 'm' || v === '*') ? 'N' : null;
  const names = new Set(entities.map(e => e.name.toLowerCase()));
  const relationships = (Array.isArray(d.relationships) ? d.relationships : []).map(r => ({ name: vStr(r && r.name), a: vStr(r && r.a), b: vStr(r && r.b), cardA: card(r && r.cardA), cardB: card(r && r.cardB), totalA: tri(r && r.totalA), totalB: tri(r && r.totalB), uncertain: !!(r && r.uncertain) })).filter(r => names.has(r.a.toLowerCase()) && names.has(r.b.toLowerCase()) && r.a.toLowerCase() !== r.b.toLowerCase());
  const isas = (Array.isArray(d.isas) ? d.isas : []).map(g => ({ superclass: vStr(g && g.superclass), subclasses: (Array.isArray(g && g.subclasses) ? g.subclasses : []).map(vStr).filter(s => names.has(s.toLowerCase())), disjoint: tri(g && g.disjoint), total: tri(g && g.total), uncertain: !!(g && g.uncertain) })).filter(g => names.has(g.superclass.toLowerCase()) && g.subclasses.length);
  const dropped = (Array.isArray(d.relationships) ? d.relationships.length : 0) - relationships.length + (Array.isArray(d.isas) ? d.isas.length : 0) - isas.length;
  const uncertain = (Array.isArray(d.uncertain) ? d.uncertain : []).map(vStr).filter(Boolean);
  if (dropped > 0) uncertain.push(`${dropped} relationship/specialization item(s) referred to entity names that are not in the entity list and were left out.`);
  return { entities, relationships, isas, uncertain };
}

/* Main entry point. Returns {result, provider, model, img} or throws RecogError. */
async function recognizeDiagram(file, signal) {
  const cap = await visionCapability();
  if (!cap.ok) throw new RecogError('unavailable', cap.why);
  const v = await validateDiagramFile(file);
  if (!v.ok) throw new RecogError('read_failed', v.msg);
  if (v.pdf) throw new RecogError('read_failed', 'PDFs cannot be read here. Export the diagram as PNG, JPG or WebP.');
  const img = await prepareImage(file, v.type);
  let raw, truncated = false;
  if (cap.provider === 'claude-runtime') {
    const s = await getSample();
    try { raw = await s.json(VISION_SYSTEM + '\n\n' + VISION_PROMPT, { images: file, signal }); }
    catch (e) {
      if (e && e.code === 'cancelled') throw new RecogError('cancelled', 'Stopped.');
      if (e && e.code === 'not_granted') throw new RecogError('unavailable', 'Permission to send the image to Claude was declined.');
      throw new RecogError(e && e.code === 'invalid_json' ? 'bad_response' : 'api', aiErr(e));
    }
  } else { const r = await callAnthropic(img, signal); raw = r.data; truncated = r.truncated; }
  const result = normalizeVision(raw);
  if (truncated) result.uncertain.push('The AI reply was cut off because the diagram is large. Some items at the end may be missing.');
  return { result, provider: cap.label, img: { w: img.origW, h: img.origH } };
}
const RECOG_ERR_TITLE = { unavailable: 'Recognition is not available', read_failed: 'The image could not be read', unreadable: 'The diagram is not readable', not_er: 'Not recognised as an ER/EER diagram', auth: 'API key rejected', network: 'Could not reach the AI service', rate_limited: 'Rate limit reached', model: 'Model not found', overloaded: 'AI service busy', bad_response: 'Unusable AI reply', api: 'AI service error', too_large: 'Image too large', cancelled: 'Stopped' };
