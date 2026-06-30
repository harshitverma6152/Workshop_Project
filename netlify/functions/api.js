// Netlify Function: api.js
// Handles all /api/* requests for the Netlify deployment.
// Supports LIVE Gemini AI when x-gemini-api-key header is provided and x-mock-mode is 'false'.
// Falls back to offline mock mode otherwise (no persistent storage on Netlify).

// ==========================================
// GEMINI API HELPERS
// ==========================================
async function callGeminiGenerate(prompt, apiKey, systemInstruction = null) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No answer generated from Gemini API");
  return text;
}

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
  const matched = sentences.filter(s => words.some(w => s.toLowerCase().includes(w))).slice(0, 3).map(s => s.trim());

  let body = `###### System Answer (DEMO MODE - OFFLINE)\n\nBased on the retrieved document segments, here is the compiled information regarding **${intentText}**:\n\n`;
  if (matched.length > 0) {
    body += matched.map((s, i) => `* **Claim ${i+1}**: "${s}"`).join('\n\n');
  } else {
    body += `* The system scanned text chunks but did not locate a direct sentence match. Closest context:\n  *"${contexts[0]?.text.substring(0, 200)}..."*\n`;
  }
  body += `\n\n**Evaluation Cites:**\n`;
  contexts.forEach(c => { body += `- [Page ${c.page}] in *${c.docName}*: "${c.text.substring(0, 100)}..."\n`; });
  return body;
}

// ==========================================
// MAIN HANDLER
// ==========================================
exports.handler = async function(event, context) {
  const method = event.httpMethod;
  const rawPath = event.path || '';
  const path = rawPath
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/api/, '')
    .replace(/\/$/, '') || '/';

  // Read runtime config from request headers
  const apiKey = event.headers['x-gemini-api-key'] || event.headers['X-Gemini-Api-Key'] || '';
  const mockModeHeader = event.headers['x-mock-mode'] || event.headers['X-Mock-Mode'] || 'true';
  const isLive = apiKey && mockModeHeader === 'false';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-gemini-api-key, x-mock-mode',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  };

  if (method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // ---- /config ----
  if (path === '/config' || path === '') {
    if (method === 'GET') {
      // Return the config currently embedded in request headers (client is source of truth on Netlify)
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ geminiApiKey: apiKey, mockMode: !isLive })
      };
    }
    if (method === 'POST') {
      // On Netlify, config is stateless. Echo back what was sent.
      try {
        const body = JSON.parse(event.body || '{}');
        return {
          statusCode: 200, headers,
          body: JSON.stringify({ success: true, config: { geminiApiKey: body.geminiApiKey ?? apiKey, mockMode: body.mockMode ?? !isLive } })
        };
      } catch {
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, config: { geminiApiKey: apiKey, mockMode: !isLive } }) };
      }
    }
  }

  // ---- /documents ----
  if (path === '/documents' && method === 'GET') {
    // Always empty – documents are persisted client-side via localStorage
    return { statusCode: 200, headers, body: JSON.stringify([]) };
  }

  // ---- DELETE /documents/:id ----
  if (path.startsWith('/documents/') && method === 'DELETE') {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }

  // ---- POST /upload ----
  if (path === '/upload' && method === 'POST') {
    try {
      const docId = 'doc_' + Date.now();
      const isBase64 = event.isBase64Encoded;
      const body = event.body || '';

      let filename = 'uploaded_document';
      let category = 'report';
      let extractedText = '';

      const boundary = (() => {
        const ct = event.headers['content-type'] || event.headers['Content-Type'] || '';
        const m = ct.match(/boundary=([^\s;]+)/i);
        return m ? m[1] : null;
      })();

      if (boundary) {
        const rawBody = isBase64 ? Buffer.from(body, 'base64').toString('binary') : body;
        const parts = rawBody.split('--' + boundary);

        for (const part of parts) {
          if (part.includes('name="file"')) {
            const fnMatch = part.match(/filename="([^"]+)"/);
            if (fnMatch) filename = fnMatch[1];
            const sep = part.indexOf('\r\n\r\n');
            if (sep !== -1) {
              const raw = part.substring(sep + 4).replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();
              extractedText = raw.substring(0, 8000);
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

      // Generate summary – live AI if key available, else mock
      let summary;
      if (isLive) {
        try {
          console.log(`Netlify: Running live Gemini summarization for ${filename}`);
          const textSample = extractedText.substring(0, 10000);
          const [oneLine, executive, risks] = await Promise.all([
            callGeminiGenerate(`Write a one-line summary (maximum 20 words) detailing what this ${category} is about. Text:\n\n${textSample}`, apiKey),
            callGeminiGenerate(`Write a structured executive summary of this ${category}. Capture: Key parties, active dates, obligations, risk clauses. Format in Markdown.\n\nText:\n\n${textSample}`, apiKey),
            callGeminiGenerate(`Analyze the legal and business risks in this ${category}. Generate a risk report with a table mapping critical clauses, exposure level (Red/Amber/Green), and recommended action. Format as Markdown.\n\nText:\n\n${textSample}`, apiKey)
          ]);
          summary = {
            oneLine: oneLine.trim(),
            executive: executive.trim(),
            risks: risks.trim(),
            sections: [
              { section: "Document Overview", summary: "Extracted context boundaries from the file structure." },
              { section: "Operational Obligations", summary: "Summary of contractual guidelines and duties." },
              { section: "Legal / Risk Safeguards", summary: "Summary of liability conditions and governance details." }
            ]
          };
        } catch (geminiErr) {
          console.error("Netlify live summarization failed, using mock:", geminiErr);
          summary = generateMockSummary(filename, category, extractedText || filename);
        }
      } else {
        summary = generateMockSummary(filename, category, extractedText || filename);
      }

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

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, document: docRecord }) };
    } catch (err) {
      console.error('Upload error:', err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to process document: ' + err.message }) };
    }
  }

  // ---- POST /chat/session ----
  if (path === '/chat/session' && method === 'POST') {
    return { statusCode: 200, headers, body: JSON.stringify({ id: 'session_' + Date.now(), messages: [] }) };
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

      // Build context from client-side document summaries
      let contexts;
      if (clientDocuments && clientDocuments.length > 0) {
        contexts = clientDocuments.flatMap(doc => {
          const summaryText = doc.summary
            ? [doc.summary.oneLine, doc.summary.executive].filter(Boolean).join(' ').substring(0, 400)
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
        contexts = [
          { docId: 'demo', docName: 'Sample Document', page: 1, text: 'This agreement establishes the terms and conditions between the parties.' },
          { docId: 'demo', docName: 'Sample Document', page: 2, text: 'Termination may occur with 30 days written notice from either party.' }
        ];
      }

      let content;
      if (isLive) {
        try {
          console.log(`Netlify: Live Gemini RAG for query: "${query}"`);
          const contextPrompt = contexts.map((c, i) =>
            `[Source ${i+1}: File: ${c.docName}, Page: ${c.page}]\nContent: ${c.text}`
          ).join('\n\n');
          const systemMsg = `You are a compliance assistant. Respond to user queries using ONLY the document sources provided in the SOURCE DOCKET. For every claim add an inline citation e.g. (Source 1, Page 3). If the docket does not contain the answer, say "I cannot identify this detail from the provided sources."`;
          const prompt = `SOURCE DOCKET:\n${contextPrompt}\n\nUSER QUESTION: ${query}`;
          content = await callGeminiGenerate(prompt, apiKey, systemMsg);
        } catch (geminiErr) {
          console.error("Netlify live chat failed, falling back:", geminiErr);
          content = generateMockRagAnswer(query || '', contexts);
        }
      } else {
        content = generateMockRagAnswer(query || '', contexts);
      }

      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          id: 'msg_' + Date.now(),
          role: 'assistant',
          content,
          citations: contexts.slice(0, 5),
          timestamp: new Date().toISOString()
        })
      };
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
        : [];

      if (files.length === 0) {
        return {
          statusCode: 200, headers,
          body: JSON.stringify({
            id: taskId, instruction, status: 'failed',
            logs: [{ step: 1, type: 'thought', title: 'Corpus Error', detail: 'No documents uploaded. Please upload files before running agent analysis.', timestamp: now }],
            finalAnswer: "#### Execution Failed\nPlease upload at least one document (contract, policy, or report) to let the Agent run comparison analysis."
          })
        };
      }

      let finalAnswer = '';
      let logs = [];

      if (isLive) {
        try {
          logs.push({ step: 1, type: 'thought', title: 'Formulating Analytical Plan', detail: `User requested: "${instruction}". Engaging live Gemini planning engine.`, timestamp: now });
          logs.push({ step: 2, type: 'tool_call', title: 'List Files', detail: `Orchestrating scan across ${files.length} active documents.`, timestamp: now });
          logs.push({ step: 3, type: 'observation', title: 'Files Located', detail: `Found active records: ${files.map(f => f.name).join(', ')}`, timestamp: now });
          logs.push({ step: 4, type: 'thought', title: 'Consulting Planner Engine', detail: 'Polling Gemini model to compile optimal tool sequence...', timestamp: now });

          const summarySnippet = files.map(d => `**${d.name}** (${d.category}): ${d.summary?.oneLine || 'No summary available.'}\n${d.summary?.executive?.substring(0, 400) || ''}`).join('\n\n---\n\n');

          logs.push({ step: 5, type: 'tool_call', title: 'Extract Document Context', detail: 'Reading document summaries from client-side repository...', timestamp: now });
          logs.push({ step: 6, type: 'observation', title: 'Context Retrieved', detail: `Loaded ${files.length} document profiles for synthesis.`, timestamp: now });
          logs.push({ step: 7, type: 'thought', title: 'Synthesizing Final Findings', detail: 'Drafting comprehensive analysis report...', timestamp: now });

          const synthesisPrompt = `You are a senior compliance analyst. Synthesize a comprehensive report in response to:

"${instruction}"

Document Repository (${files.length} documents):
${summarySnippet}

Format your output beautifully in Markdown. Include:
- An executive overview
- A comparison table if multiple documents are involved
- Key findings and risk observations  
- Actionable recommendations`;

          finalAnswer = await callGeminiGenerate(synthesisPrompt, apiKey);
          logs.push({ step: 8, type: 'thought', title: 'Report Compiled', detail: 'Live AI analyst report successfully produced.', timestamp: now });
        } catch (geminiErr) {
          console.error("Netlify live agent failed, falling back:", geminiErr);
          finalAnswer = ''; // will trigger mock fallback below
        }
      }

      if (!finalAnswer) {
        // Mock fallback
        let tableRows = '';
        files.forEach((f, idx) => {
          const hasRenew = f.name.toLowerCase().includes('contract') || idx % 2 === 0;
          tableRows += `| **${f.name}** | ${(f.category || 'report').toUpperCase()} | ${hasRenew ? "YES (Auto-extensions)" : "NO (Direct expiry)"} | ${hasRenew ? "60 Days" : "N/A"} | ${hasRenew ? "🔴 High" : "🟢 Low"} |\n`;
        });
        finalAnswer = `### 📋 Autonomous Agent Document Analysis Report
**Analyzed Instruction**: *"${instruction}"*
**Execution Mode**: Sandbox / Mock Mode
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

        if (logs.length === 0) {
          logs = [
            { step: 1, type: 'thought', title: 'Formulating Analytical Plan', detail: `User requested: "${instruction}". Parsing repositories...`, timestamp: now },
            { step: 2, type: 'tool_call', title: 'List Corpus Documents', detail: 'Querying document database categories.', timestamp: now },
            { step: 3, type: 'observation', title: 'Available Source Files', detail: `Located ${files.length} documents: ${files.map(f => f.name).join(', ')}`, timestamp: now },
            { step: 4, type: 'tool_call', title: 'Scan Document Chunks', detail: `Searching for concepts matching: "${instruction}".`, timestamp: now },
            { step: 5, type: 'observation', title: 'Relevance Matrix Compiled', detail: `Similarity scan complete. Matched ${files.length} documents.`, timestamp: now },
            { step: 6, type: 'thought', title: 'Synthesizing Comparison Metrics', detail: 'Drafting final summary table and recommendations.', timestamp: now },
            { step: 7, type: 'thought', title: 'Task Finalized', detail: 'Analyst findings compiled and complete.', timestamp: now }
          ];
        }
      }

      return { statusCode: 200, headers, body: JSON.stringify({ id: taskId, instruction, status: 'completed', logs, finalAnswer }) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ---- GET /agent/:id ----
  if (path.startsWith('/agent/') && method === 'GET') {
    const taskId = path.split('/').pop();
    return { statusCode: 200, headers, body: JSON.stringify({ id: taskId, status: 'completed', logs: [], finalAnswer: '' }) };
  }

  // ---- POST /reset ----
  if (path === '/reset' && method === 'POST') {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Netlify mock state cleared.' }) };
  }

  // ---- 404 ----
  return { statusCode: 404, headers, body: JSON.stringify({ error: `Route not found: ${method} ${path}` }) };
};
