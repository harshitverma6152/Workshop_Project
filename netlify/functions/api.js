// Netlify Function: api.js
// Handles all /api/* requests for the Netlify deployment (mock/sandbox mode only)
// All data is ephemeral (in-memory) since serverless functions have no persistent FS.

// ==========================================
// TF-IDF + MOCK ENGINE UTILITIES
// ==========================================
const stopwords = new Set(["a","about","above","after","again","against","all","am","an","and","any","are","arent","as","at","be","because","been","before","being","below","between","both","but","by","cant","cannot","could","couldnt","did","didnt","do","does","doesnt","doing","dont","down","during","each","few","for","from","further","had","hadnt","has","hasnt","have","havent","having","he","hed","hell","hes","her","here","heres","hers","herself","him","himself","his","how","hows","i","id","ill","im","ive","if","in","into","is","isnt","it","its","itself","lets","me","more","most","mustnt","my","myself","no","nor","not","of","off","on","once","only","or","other","ought","our","ours","ourselves","out","over","own","same","shant","she","shed","shell","shes","should","shouldnt","so","some","such","than","that","thats","the","their","theirs","them","themselves","then","there","theres","these","they","theyd","theyll","theyre","theyve","this","those","through","to","too","under","until","up","very","was","wasnt","we","wed","well","were","weve","werent","what","whats","when","whens","where","wheres","which","while","who","whos","whom","why","whys","with","wont","would","wouldnt","you","youd","youll","youre","youve","your","yours","yourself","yourselves"]);

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'\n\r]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.has(word));
}

function generateMockChunks(text, docId, docName) {
  const chunks = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 30);
  for (let i = 0; i < sentences.length; i++) {
    chunks.push({
      id: 'chunk_' + i,
      docId,
      docName,
      page: Math.floor(i / 3) + 1,
      text: sentences[i].trim()
    });
  }
  return chunks;
}

function generateMockSummary(filename, category, text) {
  const partyRegex = /(?:between|parties:)\s*([A-Z][a-zA-Z0-9\s,]+)\s*(?:and|&)\s*([A-Z][a-zA-Z0-9\s,]+)/i;
  const matchParties = text.match(partyRegex);
  const parties = matchParties ? `${matchParties[1].trim()} & ${matchParties[2].trim()}` : "Not explicitly detected";

  const dateRegex = /(?:date|effective|expires|expiration):\s*([A-Za-z0-9\s,.-]{6,25})/i;
  const matchDate = text.match(dateRegex);
  const keyDate = matchDate ? matchDate[1].trim() : "Not explicitly declared";

  const liabilityRegex = /(?:liability|indemnify|penalty|amount|sum):\s*([^.]+)/i;
  const matchLiab = text.match(liabilityRegex);
  const liabilityText = matchLiab ? matchLiab[1].trim() : "Standard Terms";

  const flags = [];
  if (text.toLowerCase().includes("indemnity")) flags.push("Contains critical compliance indemnification obligations.");
  if (text.toLowerCase().includes("auto-renew") || text.toLowerCase().includes("automatically renew")) flags.push("Auto-renewal clause active (Requires review 60 days prior to expiration).");
  if (text.toLowerCase().includes("uncapped") || text.toLowerCase().includes("unlimited liability")) flags.push("Contains uncapped liability triggers (High Legal Risk).");
  if (flags.length === 0) flags.push("No immediate high-risk warning flags detected.");

  return {
    oneLine: `This ${category} covers operational guidelines and active terms for associated parties, effective on ${keyDate}.`,
    executive: `### Executive Summary for ${filename}\n- **Document Class**: ${category.toUpperCase()}\n- **Key Parties**: ${parties}\n- **Key Dates**: ${keyDate}\n- **Primary Objective**: Administrative/legal coordination and scope enforcement.\n\n### Operational Obligations\n1. Maintain standards and delivery timelines as outlined in the core schedule.\n2. Compliance reporting and verification must be submitted periodically.\n3. Financial / penalty terms: ${liabilityText.substring(0, 120)}.\n\n### Immediate High-Risk Exposure\n${flags.map(f => `- ⚠️ **Risk Warning**: ${f}`).join('\n')}`,
    risks: `### Hazard Analysis & Risk Flag Matrix\n\n| Clause Interest | Raw Condition | Exposure Level | Recommended Action |\n|:---|:---|:---|:---|\n| **Liability Scope** | ${liabilityText.substring(0, 50)}... | Amber | Cap total liability to 1x contract value. |\n| **Notice Boundaries** | Termination policies | Green | Audit notice timelines against standard operations. |\n| **Renewal Trigger** | Auto-extensions | ${text.toLowerCase().includes("renew") ? "Red 🚨" : "Green"} | Disable automatic renewals, switch to written consent. |`,
    sections: [
      { section: "Introduction & Scope", summary: "Establishes baseline framework and context of the parties and governance." },
      { section: "Key Clauses & Legal Standards", summary: "Details performance rules, indemnifications, and financial terms." },
      { section: "Covenants & Expiration", summary: "Outline timelines, default remedies, termination notices, and exit protocols." }
    ]
  };
}

function generateMockRagAnswer(query, contexts) {
  const words = tokenize(query);
  const contextSnippet = contexts.map(c => c.text).join(" ");
  let intentText = "the queries you asked about";
  if (words.some(w => ["termination","notice","exit"].includes(w))) intentText = "termination notice periods and early-exit terms";
  else if (words.some(w => ["payment","milestone","invoice"].includes(w))) intentText = "payment schedules, fee obligations, and billing cycles";
  else if (words.some(w => ["liability","indemnity","damage"].includes(w))) intentText = "limits of liability and cross-indemnifications";
  else if (words.some(w => ["auto","renew","duration"].includes(w))) intentText = "contract auto-renewals and runtime duration conditions";

  const sentences = contextSnippet.match(/[^.!?]+[.!?]+/g) || [contextSnippet];
  const matchedSentences = sentences.filter(s => words.some(w => s.toLowerCase().includes(w))).slice(0, 3).map(s => s.trim());

  let responseBody = `###### System Answer (DEMO MODE - OFFLINE)\n\nBased on the retrieved document segments, here is the compiled information regarding **${intentText}**:\n\n`;
  if (matchedSentences.length > 0) {
    responseBody += matchedSentences.map((s, idx) => `* **Claim ${idx+1}**: "${s}"`).join('\n\n');
  } else {
    responseBody += `* The system scanned text chunks but did not locate a direct sentence match. Closest context:\n  *"${contexts[0]?.text.substring(0, 200)}..."*\n`;
  }
  responseBody += `\n\n**Evaluation Cites:**\n`;
  contexts.forEach(c => {
    responseBody += `- [Page ${c.page}] in *${c.docName}*: "${c.text.substring(0, 100)}..."\n`;
  });
  return responseBody;
}

// ==========================================
// MAIN HANDLER
// ==========================================
exports.handler = async function(event, context) {
  const method = event.httpMethod;
  // path looks like /.netlify/functions/api/documents or /api/documents
  const rawPath = event.path || '';
  // Normalize: strip /.netlify/functions/api or /api prefix
  const path = rawPath
    .replace(/^\/.netlify\/functions\/api/, '')
    .replace(/^\/api/, '')
    .replace(/\/$/, '') || '/';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  };

  if (method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // ---- /config ----
  if (path === '/config' || path === '') {
    if (method === 'GET') {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ geminiApiKey: '', mockMode: true })
      };
    }
    if (method === 'POST') {
      // On Netlify, config is stateless – just echo back mock mode
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ success: true, config: { geminiApiKey: '', mockMode: true } })
      };
    }
  }

  // ---- /documents ----
  if (path === '/documents' && method === 'GET') {
    return { statusCode: 200, headers, body: JSON.stringify([]) };
  }

  // ---- DELETE /documents/:id ----
  if (path.startsWith('/documents/') && method === 'DELETE') {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }

  // ---- POST /upload ----
  if (path === '/upload' && method === 'POST') {
    // Parse multipart form on Netlify – file content arrives as base64
    try {
      const docId = 'doc_' + Date.now();
      const isBase64 = event.isBase64Encoded;
      const body = event.body || '';

      // Extract filename from Content-Disposition header in multipart body
      let filename = 'uploaded_document';
      let category = 'report';
      let extractedText = '';

      const boundary = (() => {
        const ct = event.headers['content-type'] || event.headers['Content-Type'] || '';
        const m = ct.match(/boundary=([^\s;]+)/i);
        return m ? m[1] : null;
      })();

      if (boundary) {
        // Decode body
        const rawBody = isBase64 ? Buffer.from(body, 'base64').toString('binary') : body;
        const parts = rawBody.split('--' + boundary);

        for (const part of parts) {
          if (part.includes('name="file"')) {
            const fnMatch = part.match(/filename="([^"]+)"/);
            if (fnMatch) filename = fnMatch[1];
            // Extract readable text from after \r\n\r\n
            const sep = part.indexOf('\r\n\r\n');
            if (sep !== -1) {
              // Get printable ASCII text from binary content as a sample
              const raw = part.substring(sep + 4).replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();
              extractedText = raw.substring(0, 5000);
            }
          }
          if (part.includes('name="category"')) {
            const sep = part.indexOf('\r\n\r\n');
            if (sep !== -1) {
              category = part.substring(sep + 4).trim().split(/\r?\n/)[0].trim() || 'report';
            }
          }
        }
      }

      // Generate summary from extracted text
      const summary = generateMockSummary(filename, category, extractedText || filename);

      const docRecord = {
        id: docId,
        name: filename,
        category: category || 'report',
        path: '',
        uploadedAt: new Date().toISOString(),
        status: 'completed',
        pageCount: Math.max(1, Math.floor(extractedText.length / 2000) + 1),
        summary
      };

      return {
        statusCode: 200, headers,
        body: JSON.stringify({ success: true, document: docRecord })
      };
    } catch (err) {
      console.error('Upload error:', err);
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: 'Failed to process document: ' + err.message })
      };
    }
  }

  // ---- POST /chat/session ----
  if (path === '/chat/session' && method === 'POST') {
    const session = { id: 'session_' + Date.now(), messages: [] };
    return { statusCode: 200, headers, body: JSON.stringify(session) };
  }

  // ---- GET /chat/session/:id ----
  if (path.startsWith('/chat/session/') && method === 'GET') {
    return { statusCode: 200, headers, body: JSON.stringify({ id: path.split('/').pop(), messages: [] }) };
  }

  // ---- POST /chat/message ----
  if (path === '/chat/message' && method === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { query, clientDocuments } = body;

      // Build context from client-side documents if available
      let mockContexts;
      if (clientDocuments && clientDocuments.length > 0) {
        mockContexts = clientDocuments.flatMap(doc => {
          const summaryText = doc.summary
            ? [doc.summary.oneLine, doc.summary.executive].filter(Boolean).join(' ').substring(0, 300)
            : `${doc.name} is a ${doc.category} document in the system.`;
          return [
            { docId: doc.id, docName: doc.name, page: 1, text: summaryText },
            ...(doc.summary?.sections || []).map((sec, i) => ({
              docId: doc.id, docName: doc.name, page: i + 2,
              text: `${sec.section}: ${sec.summary}`
            }))
          ];
        });
      } else {
        mockContexts = [
          { docId: 'demo', docName: 'Sample Document', page: 1, text: 'This agreement establishes the terms and conditions between the parties.' },
          { docId: 'demo', docName: 'Sample Document', page: 2, text: 'Termination may occur with 30 days written notice from either party.' }
        ];
      }

      const content = generateMockRagAnswer(query || '', mockContexts);
      const answerMessage = {
        id: 'msg_' + Date.now(),
        role: 'assistant',
        content,
        citations: mockContexts.slice(0, 5),
        timestamp: new Date().toISOString()
      };
      return { statusCode: 200, headers, body: JSON.stringify(answerMessage) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ---- POST /agent ----
  if (path === '/agent' && method === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { instruction, clientDocuments } = body;

      const taskId = 'task_' + Date.now();
      const now = new Date().toISOString();

      const files = clientDocuments && clientDocuments.length > 0
        ? clientDocuments
        : [{ name: 'Sample Document', category: 'report' }];

      let tableRows = '';
      files.forEach((f, idx) => {
        const hasRenew = f.name.toLowerCase().includes('contract') || idx % 2 === 0;
        tableRows += `| **${f.name}** | ${(f.category || 'report').toUpperCase()} | ${hasRenew ? "YES (Auto-extensions)" : "NO (Direct expiry)"} | ${hasRenew ? "60 Days" : "N/A"} | ${hasRenew ? "🔴 High" : "🟢 Low"} |\n`;
      });

      const mockReport = `### 📋 Autonomous Agent Document Analysis Report
**Analyzed Instruction**: *"${instruction}"*
**Execution Mode**: Netlify Sandbox / Mock Mode
**Analyzed Corpus**: ${files.length} Documents.

#### Key Parameters Extracted

| Document Name | Document Category | Auto-Renewal Active? | Notice Deadline | Risk Exposure Level |
|:---|:---|:---|:---|:---|
${tableRows}
### Analytical Synthesis & Recommendations
1. **Notice Alert**: Ensure written termination cancellations are submitted at least **60 days prior** for documents containing automatic renew properties.
2. **Review Advisory**: Check the liability thresholds of all contracts flagged above. We recommend negotiating a hard cap equivalent to 100% of standard fees paid.
3. **Continuous Tracking**: Add monitoring to prevent auto-renewal dates from slipping past.

*Analysis generated automatically by EDIS Document Analyst Agent.*`;

      const task = {
        id: taskId,
        instruction,
        status: 'completed',
        logs: [
          { step: 1, type: 'thought', title: 'Formulating Analytical Plan', detail: `User requested: "${instruction}". Parsing local databases...`, timestamp: now },
          { step: 2, type: 'tool_call', title: 'List Corpus Documents', detail: 'Querying document database categories.', timestamp: now },
          { step: 3, type: 'observation', title: 'Available Source Files', detail: `Located ${files.length} documents: ${files.map(f => f.name).join(', ')}`, timestamp: now },
          { step: 4, type: 'tool_call', title: 'Scan Document Chunks', detail: `Searching for concepts matching: "${instruction}".`, timestamp: now },
          { step: 5, type: 'observation', title: 'Relevance Matrix Compiled', detail: `Completed similarity scan. Matched ${files.length} documents.`, timestamp: now },
          { step: 6, type: 'thought', title: 'Synthesizing Comparison Metrics', detail: 'Drafting final output summary table and recommendation guidelines.', timestamp: now },
          { step: 7, type: 'thought', title: 'Task Finalized', detail: 'Analyst findings compiled, verified, and complete.', timestamp: now }
        ],
        finalAnswer: mockReport
      };

      return { statusCode: 200, headers, body: JSON.stringify(task) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ---- GET /agent/:id ----
  if (path.startsWith('/agent/') && method === 'GET') {
    const taskId = path.split('/').pop();
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ id: taskId, status: 'completed', logs: [], finalAnswer: '' })
    };
  }

  // ---- POST /reset ----
  if (path === '/reset' && method === 'POST') {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Netlify mock state cleared.' }) };
  }

  // ---- Default 404 ----
  return {
    statusCode: 404, headers,
    body: JSON.stringify({ error: `Route not found: ${method} ${path}` })
  };
};
