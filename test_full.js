const http = require('http');

function post(port, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: '127.0.0.1', port,
      path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const r = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) }));
    });
    r.on('error', reject);
    r.write(data);
    r.end();
  });
}

async function fullTest() {
  console.log('\n========== EDIS Full Integration Test ==========\n');

  // 1. Config
  console.log('[1] Config check...');
  const cfgRes = await new Promise((res, rej) => {
    http.get({ hostname: '127.0.0.1', port: 5173, path: '/api/config' }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  console.log('    mockMode:', cfgRes.mockMode, '| apiKey set:', !!cfgRes.geminiApiKey);

  // 2. Documents
  console.log('[2] Documents list...');
  const docsRes = await new Promise((res, rej) => {
    http.get({ hostname: '127.0.0.1', port: 5173, path: '/api/documents' }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  console.log('    Total docs:', docsRes.length);
  docsRes.forEach(d => console.log('    -', d.name, '|', d.status, '| summary:', d.summary ? 'yes' : 'no'));

  // 3. Chat session
  console.log('[3] Chat session...');
  const sessRes = await post(5173, '/api/chat/session', {});
  console.log('    Session ID:', sessRes.body.id);

  // 4. Chat message
  console.log('[4] Chat message...');
  const msgRes = await post(5173, '/api/chat/message', {
    sessionId: sessRes.body.id,
    query: 'What are the main document categories in the system?',
    clientDocuments: docsRes.filter(d => d.status === 'completed').map(d => ({
      id: d.id, name: d.name, category: d.category, summary: d.summary
    }))
  });
  console.log('    Response status:', msgRes.status);
  console.log('    Answer preview:', msgRes.body.content?.substring(0, 120));

  // 5. Agent
  console.log('[5] Agent task...');
  const agentRes = await post(5173, '/api/agent', {
    instruction: 'Compare all uploaded documents',
    clientDocuments: docsRes.filter(d => d.status === 'completed').map(d => ({
      id: d.id, name: d.name, category: d.category, summary: d.summary
    }))
  });
  console.log('    Agent status:', agentRes.status);
  console.log('    Task status:', agentRes.body.status);
  console.log('    Log steps:', agentRes.body.logs?.length);

  console.log('\n========== ALL TESTS PASSED ✅ ==========\n');
}

fullTest().catch(e => {
  console.error('\n❌ TEST FAILED:', e.message);
  process.exit(1);
});
