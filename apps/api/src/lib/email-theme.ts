// Shared visual language for every outbound HTML email (newsletter + the
// cycle-open reminder) — kept in sync by hand with
// apps/mobile/tailwind.config.js, since there's no shared token file
// between the two apps for something this presentation-specific.

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Recipe links are stored as free text (see submitAnswerInput) since people
// paste them without a protocol — add one before using as an href, or the
// email client resolves it relative to the email's own (nonexistent) origin.
export function normalizeUrl(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export const COLOR = {
  primary: '#F2776A',
  charcoal: '#1B3A33',
  charcoalMuted: 'rgba(27,58,51,.55)',
  charcoalFaint: 'rgba(27,58,51,.4)',
  sand: '#EFEFEC',
  sandLine: '#C9C9C2',
  paper: '#F9F3E7',
  paperLine: '#EBE0C6',
  white: '#FFFFFF',
} as const;

// Email-safe monospace stack — 'Space Mono' loads in the handful of clients
// that render the @import in renderEmailShell (Apple Mail chief among
// them); everyone else falls back to a system monospace, which still reads
// as "the app's font" far better than a sans-serif fallback would.
export const FONT = `'Space Mono','SF Mono',Menlo,Consolas,'Courier New',monospace`;

export function pillLink(href: string, label: string, { filled = false }: { filled?: boolean } = {}) {
  const bg = filled ? COLOR.primary : COLOR.white;
  const color = filled ? COLOR.white : COLOR.charcoal;
  const border = filled ? COLOR.primary : COLOR.paperLine;
  return `<a href="${href}" style="display:inline-block;font-family:${FONT};font-size:12px;font-weight:700;color:${color};text-decoration:none;background:${bg};border:1px solid ${border};border-radius:999px;padding:7px 16px;">${label}</a>`;
}

/**
 * Common page chrome for every outbound email: paper background, a white
 * rounded card, the eyebrow/title/subtitle header, an @import'd Space Mono
 * for clients that render it, and a standard muted footer. Callers supply
 * pre-built `<tr><td>…</td></tr>` row(s) for the body.
 */
export function renderEmailShell(params: {
  eyebrow: string;
  title: string;
  subtitle: string;
  bodyRows: string;
  footerText: string;
}) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');</style>
  </head>
  <body style="margin:0;padding:20px 12px;background:${COLOR.paper};" bgcolor="${COLOR.paper}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.paper};">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" align="center" style="max-width:600px;background:${COLOR.white};border:1px solid ${COLOR.paperLine};border-radius:20px;">
          <tr><td style="padding:30px 32px 4px;">
            <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${COLOR.primary};">${params.eyebrow}</p>
            <h1 style="margin:0 0 4px;font-family:${FONT};font-size:26px;font-weight:700;color:${COLOR.charcoal};">${escapeHtml(params.title)}</h1>
            <p style="margin:0;font-family:${FONT};font-size:13px;color:${COLOR.charcoalMuted};">${escapeHtml(params.subtitle)}</p>
          </td></tr>
          ${params.bodyRows}
          <tr><td style="padding:22px 32px 28px;border-top:1px solid ${COLOR.paperLine};">
            <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.6;color:${COLOR.charcoalFaint};">${params.footerText}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
