'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = Number(process.env.PORT || 8080);
const BOARD_TITLE = process.env.BOARD_TITLE || 'My Notes';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const DATA_FILE = path.join('/data', 'notes.json');
const MAX_NOTES = 200;
const MAX_NOTE_LENGTH = 500;

function readNotes() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Written via a temporary file so a crash mid-write cannot leave a truncated
// notes.json behind, which readNotes would silently read back as an empty board.
function writeNotes(notes) {
  const temporary = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(notes, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, DATA_FILE);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(payload);
}

function renderPage() {
  const notes = readNotes();
  const items = notes.length
    ? notes.map((note) => `<li><time>${escapeHtml(note.createdAt)}</time><p>${escapeHtml(note.text)}</p></li>`).join('')
    : '<li class="empty"><p>No notes yet. Write the first one.</p></li>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(BOARD_TITLE)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; margin: 0 auto; max-width: 40rem; padding: 2rem 1rem; line-height: 1.5; }
  h1 { margin-bottom: 0.25rem; }
  .subtitle { color: gray; margin-top: 0; }
  form { display: flex; gap: 0.5rem; margin: 1.5rem 0; }
  input[type=text] { flex: 1; padding: 0.5rem; font: inherit; }
  button { padding: 0.5rem 1rem; font: inherit; cursor: pointer; }
  ul { list-style: none; padding: 0; }
  li { border-top: 1px solid rgba(128,128,128,0.35); padding: 0.75rem 0; }
  li p { margin: 0.25rem 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  time { color: gray; font-size: 0.8rem; }
  .empty p { color: gray; }
</style>
</head>
<body>
  <h1>${escapeHtml(BOARD_TITLE)}</h1>
  <p class="subtitle">An example external app running on MOS.</p>
  <form method="post" action="/notes">
    <input type="text" name="text" maxlength="${MAX_NOTE_LENGTH}" placeholder="Write a note" required autofocus>
    <button type="submit">Add</button>
  </form>
  <ul>${items}</ul>
</body>
</html>
`;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      // Bounded so an oversized submission cannot grow this process's memory
      // until the container is killed.
      if (body.length > 64 * 1024) {
        reject(new Error('BODY_TOO_LARGE'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function addNote(text) {
  const trimmed = String(text || '').trim().slice(0, MAX_NOTE_LENGTH);
  if (!trimmed) return false;
  const notes = readNotes();
  notes.unshift({ createdAt: new Date().toISOString(), text: trimmed });
  writeNotes(notes.slice(0, MAX_NOTES));
  return true;
}

// Compared in constant time so a caller cannot learn the token one character at
// a time from how long the comparison takes.
function tokenMatches(candidate) {
  if (!ADMIN_TOKEN) return false;
  const expected = Buffer.from(ADMIN_TOKEN);
  const supplied = Buffer.from(String(candidate || ''));
  if (expected.length !== supplied.length) return false;
  return require('node:crypto').timingSafeEqual(expected, supplied);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/healthz') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(renderPage());
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/notes') {
    sendJson(response, 200, { notes: readNotes() });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/notes') {
    try {
      const body = await readBody(request);
      addNote(new URLSearchParams(body).get('text'));
    } catch {
      sendJson(response, 413, { error: 'Note is too large.' });
      return;
    }
    response.writeHead(303, { location: '/' });
    response.end();
    return;
  }

  // Guarded by the token MOS generated at install time, to show how a generated
  // secret reaches the app through the environment.
  if (request.method === 'POST' && url.pathname === '/api/reset') {
    if (!tokenMatches(request.headers['x-admin-token'])) {
      sendJson(response, 403, { error: 'A valid admin token is required.' });
      return;
    }
    writeNotes([]);
    sendJson(response, 200, { notes: [] });
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`example-notes listening on ${PORT}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
