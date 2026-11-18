// Lulu Print API, sandbox only: orders are validated and accepted but never printed or shipped.
// Docs: https://api.lulu.com/docs/ (sandbox host api.sandbox.lulu.com).
import { log } from './log.js';

const API = process.env.LULU_API || 'https://api.sandbox.lulu.com';
// 11 x 8.5 in landscape, full colour, standard quality, hardcover (casewrap), 80# coated white, matte.
export const POD_PACKAGE = process.env.LULU_POD_PACKAGE || '1100X0850.FC.STD.CW.080CW444.MXX';
export const SHIPPING_LEVELS = ['MAIL', 'GROUND', 'EXPEDITED'];
export const configured = () => Boolean(process.env.LULU_CLIENT_KEY && process.env.LULU_CLIENT_SECRET);

if (!/sandbox/.test(API)) throw new Error('This app only talks to the Lulu sandbox.');

let token = null;
async function auth() {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${process.env.LULU_CLIENT_KEY}:${process.env.LULU_CLIENT_SECRET}`).toString('base64');
  const r = await fetch(`${API}/auth/realms/glasstree/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Lulu sign-in failed (${r.status}).`);
  token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return token.value;
}

async function call(method, path, payload) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${await auth()}`, 'Content-Type': 'application/json' },
    body: payload && JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    log('lulu_error', { path, status: r.status, body: JSON.stringify(body).slice(0, 500) });
    const err = new Error(luluMessage(body) || `Lulu returned ${r.status}.`);
    err.status = r.status >= 500 ? 502 : 400;
    throw err;
  }
  return body;
}

// Lulu returns field errors as nested objects; turn the first one into a sentence.
function luluMessage(body) {
  const walk = (v, keyPath) => {
    if (typeof v === 'string') return `${keyPath ? `${keyPath.replace(/_/g, ' ')}: ` : ''}${v}`;
    if (Array.isArray(v)) return v.length ? walk(v[0], keyPath) : null;
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        const found = walk(val, /^\d+$/.test(k) ? keyPath : k);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(body.shipping_address ?? body.line_items ?? body.detail ?? body, '');
}

const PT_PER_INCH = 72;

// Cover size for our page count, in points. The spine for a 24-page casewrap is 0.25 in.
export async function coverDimensions(pageCount) {
  if (!configured()) return { width: (2 * 11 + 0.25 + 2 * 0.75 + 0.25) * PT_PER_INCH, height: (8.5 + 2 * 0.75 + 0.25) * PT_PER_INCH, spine: 0.25 * PT_PER_INCH };
  const d = await call('POST', '/cover-dimensions/', { pod_package_id: POD_PACKAGE, interior_page_count: pageCount, unit: 'pt' });
  return { width: Number(d.width), height: Number(d.height), spine: 0.25 * PT_PER_INCH };
}

export function luluAddress(a) {
  return {
    name: a.name, street1: a.street1, street2: a.street2 || undefined, city: a.city, state_code: a.state_code || undefined,
    postcode: a.postcode, country_code: a.country_code, phone_number: a.phone_number, email: a.email,
  };
}

// Printing + shipping + fees for one book to this address. Also validates the address.
export async function quote(address, shippingLevel, pageCount) {
  if (!configured()) throw Object.assign(new Error('Printing isn’t set up on this server yet.'), { status: 503 });
  const q = await call('POST', '/print-job-cost-calculations/', {
    line_items: [{ page_count: pageCount, pod_package_id: POD_PACKAGE, quantity: 1 }],
    shipping_address: luluAddress(address),
    shipping_option: shippingLevel,
  });
  return {
    currency: q.currency,
    print: Number(q.line_item_costs?.[0]?.total_cost_excl_tax ?? 0),
    shipping: Number(q.shipping_cost?.total_cost_excl_tax ?? 0),
    fees: (q.fees || []).reduce((s, f) => s + Number(f.cost ?? f.total_cost_excl_tax ?? 0), 0),
    tax: Number(q.total_tax ?? 0),
    total: Number(q.total_cost_incl_tax ?? 0),
    warnings: q.shipping_address?.warnings || [],
  };
}

export async function createPrintJob({ orderId, title, address, shippingLevel, interiorUrl, coverUrl, contactEmail }) {
  const job = await call('POST', '/print-jobs/', {
    contact_email: contactEmail,
    external_id: `order-${orderId}`,
    shipping_level: shippingLevel,
    shipping_address: luluAddress(address),
    line_items: [{
      external_id: `order-${orderId}-book`,
      title: title.slice(0, 255),
      quantity: 1,
      printable_normalization: {
        pod_package_id: POD_PACKAGE,
        interior: { source_url: interiorUrl },
        cover: { source_url: coverUrl },
      },
    }],
  });
  return { id: String(job.id), status: job.status?.name || 'CREATED' };
}

export async function jobStatus(id) {
  const s = await call('GET', `/print-jobs/${encodeURIComponent(id)}/status/`);
  return { name: s.name, message: s.message || '' };
}
