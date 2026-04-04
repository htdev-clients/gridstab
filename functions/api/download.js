/**
 * GET /api/download?token={uuid}
 * Validates the purchase token and streams the buyer's watermarked PDF from R2.
 */
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response('Missing download token.', { status: 400 });
  }

  const record = await env.PURCHASES_KV.get(`token:${token}`, 'json');
  if (!record) {
    return errorPage(
      'Invalid download link',
      'This download link is invalid. If you believe this is a mistake, please contact <a href="mailto:contact@gridstab.com">contact@gridstab.com</a>.'
    );
  }

  const object = await env.BOOK_BUCKET.get(record.r2Key);
  if (!object) {
    // The watermark job may still be processing — this should be rare
    return errorPage(
      'Your file is not ready yet',
      'Your purchase was received but the file is still being prepared. Please wait a minute and try your download link again.'
    );
  }

  // Increment download count in the background (non-blocking)
  env.PURCHASES_KV.put(
    `token:${token}`,
    JSON.stringify({ ...record, downloadCount: (record.downloadCount || 0) + 1 })
  );

  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="Grid-Stability-Gilles-Chaspierre.pdf"',
      'Cache-Control': 'no-store, no-cache',
    },
  });
}

function errorPage(title, message) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — GridStab</title>
  <style>
    body { font-family: Georgia, serif; max-width: 560px; margin: 80px auto; padding: 0 20px; color: #1a1a1a; text-align: center; }
    h1 { font-size: 1.6rem; margin-bottom: 1rem; }
    p { color: #555; line-height: 1.6; }
    a { color: #FF6719; }
    .back { display: inline-block; margin-top: 2rem; font-size: 0.9rem; color: #999; text-decoration: none; }
    .back:hover { color: #FF6719; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>${message}</p>
  <a href="https://gridstab.com" class="back">← Back to GridStab.com</a>
</body>
</html>`;

  return new Response(html, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
