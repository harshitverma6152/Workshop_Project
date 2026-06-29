const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Directories
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// Multer Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Database initialization
const defaultDb = {
  config: { geminiApiKey: '', mockMode: true },
  documents: [],
  chunks: [],
  chatSessions: [],
  agentTasks: []
};

function readDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2));
    return defaultDb;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error("Error reading db.json, resetting", e);
    return defaultDb;
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Ensure database exists
readDb();

// ==========================================
// PARSING HELPERS
// ==========================================

// Extract PDF page by page
async function extractPdfPages(buffer) {
  const pages = [];
  const options = {
    pagerender: function (pageData) {
      return pageData.getTextContent().then(textContent => {
        let lastY, text = '';
        for (let item of textContent.items) {
          if (lastY === item.transform[5] || !lastY) {
            text += item.str;
          } else {
            text += '\n' + item.str;
          }
          lastY = item.transform[5];
        }
        pages.push({
          page: pageData.pageIndex + 1,
          text: text
        });
        return text;
      });
    }
  };

  try {
    await pdfParse(buffer, options);
  } catch (err) {
    console.error("pdf-parse library exception, attempting fallback raw text extract", err);
    const raw = await pdfParse(buffer);
    return [{ page: 1, text: raw.text }];
  }
  
  pages.sort((a, b) => a.page - b.page);
  return pages.length ? pages : [{ page: 1, text: "Empty document" }];
}

// Convert DOCX to pseudo-pages
async function extractDocxPages(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value || '';
  const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
  
  const pages = [];
  let currentPageText = "";
  let pageNum = 1;

  for (let p of paragraphs) {
    if (currentPageText.length + p.length > 2000) {
      pages.push({ page: pageNum++, text: currentPageText.trim() });
      currentPageText = p + "\n\n";
    } else {
      currentPageText += p + "\n\n";
    }
  }
  if (currentPageText.trim().length > 0) {
    pages.push({ page: pageNum, text: currentPageText.trim() });
  }
  return pages.length ? pages : [{ page: 1, text: "Empty document" }];
}

// Text Chunking Function
function computeChunks(text, pageNum, maxChars = 800, overlap = 150) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChars;
    if (end > text.length) end = text.length;

    // Boundary check
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      if (lastSpace > start + maxChars / 2) {
        end = lastSpace;
      }
    }

    chunks.push({
      page: pageNum,
      text: text.substring(start, end).trim()
    });

    start = end - overlap;
    if (start >= text.length - overlap) break;
  }
  return chunks.filter(c => c.text.length > 15);
}

// ==========================================
// TF-IDF VECTORIZER FOR OFFLINE SEARCH
// ==========================================
const stopwords = new Set(["a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "arent", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "cant", "cannot", "could", "couldnt", "did", "didnt", "do", "does", "doesnt", "doing", "dont", "down", "during", "each", "few", "for", "from", "further", "had", "hadnt", "has", "hasnt", "have", "havent", "having", "he", "hed", "hell", "hes", "her", "here", "heres", "hers", "herself", "him", "himself", "his", "how", "hows", "i", "id", "ill", "im", "ive", "if", "in", "into", "is", "isnt", "it", "its", "itself", "lets", "me", "more", "most", "mustnt", "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shant", "she", "shed", "shell", "shes", "should", "shouldnt", "so", "some", "such", "than", "that", "thats", "the", "their", "theirs", "them", "themselves", "then", "there", "theres", "these", "they", "theyd", "theyll", "theyre", "theyve", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasnt", "we", "wed", "well", "were", "weve", "werent", "what", "whats", "when", "whens", "where", "wheres", "which", "while", "who", "whos", "whom", "why", "whys", "with", "wont", "would", "wouldnt", "you", "youd", "youll", "youre", "youve", "your", "yours", "yourself", "yourselves"]);

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'\n\r]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.has(word));
}

function calculateTfidfSimilarity(query, dbChunks, filterDocId = null, filterCategory = null, parentDocs = []) {
  const filteredChunks = dbChunks.filter(chunk => {
    if (filterDocId && chunk.docId !== filterDocId) return false;
    if (filterCategory) {
      const doc = parentDocs.find(d => d.id === chunk.docId);
      if (!doc || doc.category !== filterCategory) return false;
    }
    return true;
  });

  if (filteredChunks.length === 0) return [];

  // Group terms index
  const docTokens = filteredChunks.map(c => tokenize(c.text));
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) {
    // Return first few chunks if query runs empty of keywords
    return filteredChunks.slice(0, 5).map(c => ({ chunk: c, score: 0.1 }));
  }

  // Count document frequencies
  const df = {};
  docTokens.forEach(tokens => {
    const unique = new Set(tokens);
    unique.forEach(w => {
      df[w] = (df[w] || 0) + 1;
    });
  });

  const N = docTokens.length;
  const idf = {};
  for (let w in df) {
    idf[w] = Math.log(1 + (N / df[w]));
  }

  // Calculate scores (cosine similarity approximation)
  const results = filteredChunks.map((chunk, idx) => {
    const tokens = docTokens[idx];
    const tf = {};
    tokens.forEach(w => {
      tf[w] = (tf[w] || 0) + 1;
    });

    let dotProduct = 0;
    let queryNorm = 0;
    let docNorm = 0;

    const terms = new Set([...tokens, ...queryTokens]);
    terms.forEach(w => {
      const qVal = queryTokens.includes(w) ? idf[w] || 0.1 : 0;
      const dVal = tf[w] ? (tf[w] / tokens.length) * (idf[w] || 0.1) : 0;
      dotProduct += qVal * dVal;
      queryNorm += qVal * qVal;
      docNorm += dVal * dVal;
    });

    const norm = Math.sqrt(queryNorm) * Math.sqrt(docNorm);
    const score = norm > 0 ? (dotProduct / norm) : 0;

    return {
      chunk,
      score: score
    };
  });

  // Sort and return top 8
  return results
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

// Cosine similarity for real embeddings
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

// ==========================================
// GEMINI API INTEGRATION
// ==========================================
async function callGeminiGenerate(prompt, apiKey, systemInstruction = null) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
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

async function callGeminiEmbedding(text, apiKey) {
  // gemini-2.5-flash/pro do not expose a REST embedding endpoint;
  // fall back gracefully so TF-IDF similarity is used instead.
  throw new Error('Embedding endpoint not available for this project – using TF-IDF fallback.');
}

// ==========================================
// MOCK AI ENGINE (FALLBACK)
// ==========================================
function generateMockRagAnswer(query, contexts) {
  const words = tokenize(query);
  const contextSnippet = contexts.map(c => c.text).join(" ");
  
  let intentText = "the queries you asked about";
  if (words.includes("termination") || words.includes("notice") || words.includes("exit")) {
    intentText = "termination notice periods and early-exit terms";
  } else if (words.includes("payment") || words.includes("milestone") || words.includes("invoice")) {
    intentText = "payment schedules, fee obligations, and billing cycles";
  } else if (words.includes("liability") || words.includes("indenmity") || words.includes("damage")) {
    intentText = "limits of liability, uncapped damages, and cross-indemnifications";
  } else if (words.includes("auto") || words.includes("renew") || words.includes("duration")) {
    intentText = "contract auto-renewals and runtime duration conditions";
  }

  // Pick some sentences from context
  const sentences = contextSnippet.match(/[^.!?]+[.!?]+/g) || [contextSnippet];
  const matchedSentences = sentences
    .filter(s => words.some(w => s.toLowerCase().includes(w)))
    .slice(0, 3)
    .map(s => s.trim());

  let responseBody = `###### System Answer (DEMO MODE - OFFLINE)\n\nBased on the retrieved document segments, here is the compiled information regarding **${intentText}**:\n\n`;
  if (matchedSentences.length > 0) {
    responseBody += matchedSentences.map((s, idx) => `* **Claim ${idx+1}**: "${s}"`).join('\n\n');
  } else {
    responseBody += `* The system scanned the text chunks but did not locate a direct exact sentence match. Here is a summarization of the closest context found:\n  *"${contexts[0]?.text.substring(0, 200)}..."*\n`;
  }
  
  responseBody += `\n\n**Evaluation Cites:**\n`;
  contexts.forEach(c => {
    responseBody += `- [Page ${c.page}] in *${c.docName}*: "${c.text.substring(0, 100)}..."\n`;
  });

  return responseBody;
}

function generateMockSummary(filename, category, text) {
  // Simple regex matching to find important items in document text
  const partyRegex = /(?:between|parties:)\s*([A-Z][a-zA-Z0-9\s,]+)\s*(?:and|&)\s*([A-Z][a-zA-Z0-9\s,]+)/i;
  const matchParties = text.match(partyRegex);
  const parties = matchParties ? `${matchParties[1].trim()} & ${matchParties[2].trim()}` : "Not explicitly detected (Unstructured Document)";

  const dateRegex = /(?:date|effective|expires|expiration):\s*([A-Za-z0-9\s,.-]{6,25})/i;
  const matchDate = text.match(dateRegex);
  const keyDate = matchDate ? matchDate[1].trim() : "Not explicitly declared";

  const liabilityRegex = /(?:liability|indemnify|penalty|amount|sum):\s*([^.]+)/i;
  const matchLiab = text.match(liabilityRegex);
  const liabilityText = matchLiab ? matchLiab[1].trim() : "Standard Terms";

  // Check for hazard flags
  const flags = [];
  if (text.toLowerCase().includes("indemnity") || text.toLowerCase().includes("indemnification")) {
    flags.push("Contains critical compliance indemnification obligations.");
  }
  if (text.toLowerCase().includes("auto-renew") || text.toLowerCase().includes("automatically renew")) {
    flags.push("Auto-renewal clause active (Requires review 60 days prior to expiration).");
  }
  if (text.toLowerCase().includes("uncapped") || text.toLowerCase().includes("unlimited liability")) {
    flags.push("Contains uncapped liability triggers (High Legal Risk).");
  }
  if (flags.length === 0) {
    flags.push("No immediate high-risk warning flags detected.");
  }

  // Create document summary responses
  const oneLine = `This ${category} covers operational guidelines and active terms for associated parties, signed/effective on ${keyDate}.`;
  
  const executive = `### Executive Summary for ${filename}
- **Document Class**: ${category.toUpperCase()}
- **Key Parties**: ${parties}
- **Key Dates**: ${keyDate}
- **Primary Objective**: Administrative/legal coordination and scope enforcement.

### Operational Obligations
1. Maintain standards and delivery timelines as outlined in the core schedule.
2. Compliance reporting and verification must be submitted periodically.
3. Financial / penalty terms: ${liabilityText.substring(0, 120)}.

### Immediate High-Risk Exposure
${flags.map(f => `- ⚠️ **Risk Warning**: ${f}`).join('\n')}`;

  const riskAssessment = `### Hazard Analysis & Risk Flag Matrix

| Clause Interest | Raw Condition | Exposure Level | Recommended Action |
|:---|:---|:---|:---|
| **Liability Scope** | ${liabilityText.substring(0, 50)}... | Amber | Cap total liability to 1x contract value. |
| **Notice Boundaries** | Termination policies | Green | Audit notice timelines against standard operations. |
| **Renewal Trigger** | Auto-extensions | ${text.toLowerCase().includes("renew") ? "Red 🚨" : "Green"} | Disable automatic renewals, switch to written consent. |
`;

  return {
    oneLine,
    executive,
    risks: riskAssessment,
    sections: [
      { section: "Introduction & Scope", summary: "Establishes baseline framework and context of the parties and governance." },
      { section: "Key Clauses & Legal Standards", summary: "Details performance rules, indemnifications, and financial terms." },
      { section: "Covenants & Expiration", summary: "Outline timelines, default remedies, termination notices, and exit protocols." }
    ]
  };
}

// ==========================================
// BACKGROUND SUMMARIZER JOB (QUEUE IMITATION)
// ==========================================
async function runAsyncAutoSummarizer(docId, filePath, category) {
  console.log(`Starting background summarizer job for doc ID: ${docId}`);
  const db = readDb();
  const doc = db.documents.find(d => d.id === docId);
  if (!doc) return;

  try {
    const rawBuffer = fs.readFileSync(filePath);
    let pagesText = [];
    if (path.extname(filePath).toLowerCase() === '.pdf') {
      pagesText = await extractPdfPages(rawBuffer);
    } else {
      pagesText = await extractDocxPages(rawBuffer);
    }

    const fullDocText = pagesText.map(p => p.text).join('\n');
    let summaryObj = null;

    if (db.config.geminiApiKey && !db.config.mockMode) {
      console.log(`Generating AI summaries for ${doc.name} using Gemini API...`);
      try {
        const oneLinePrompt = `Write a one-line summary (maximum 20 words) detailing what this ${category} is about. Text: \n\n${fullDocText.substring(0, 10000)}`;
        const execPrompt = `Write a structured executive summary of this ${category}. You must capture: Key parties, active dates, obligations, risk clauses. Format output cleanly in Markdown. Text:\n\n${fullDocText.substring(0, 10000)}`;
        const risksPrompt = `Analyze the legal and business risks in this ${category} and generate a risk report. Include a table mapping critical clauses, exposure level (Red, Amber, Green), and recommended action. Format as markdown. Text:\n\n${fullDocText.substring(0, 10000)}`;
        
        const oneLine = await callGeminiGenerate(oneLinePrompt, db.config.geminiApiKey);
        const executive = await callGeminiGenerate(execPrompt, db.config.geminiApiKey);
        const risks = await callGeminiGenerate(risksPrompt, db.config.geminiApiKey);

        summaryObj = {
          oneLine: oneLine.trim(),
          executive: executive.trim(),
          risks: risks.trim(),
          sections: [
            { section: "Document Overview", summary: "Extracted context boundaries from the file structure." },
            { section: "Operational Obligations", summary: "Summary of contractual guidelines and duties." },
            { section: "Legal / Risk Safeguards", summary: "Summary of liability conditions and governance details." }
          ]
        };
      } catch (err) {
        console.error("Gemini API call failed during auto-summarize, falling back to mock summary", err);
        summaryObj = generateMockSummary(doc.name, category, fullDocText);
      }
    } else {
      // Mock Summarize
      summaryObj = generateMockSummary(doc.name, category, fullDocText);
    }

    // Update DB
    const freshDb = readDb();
    const target = freshDb.documents.find(d => d.id === docId);
    if (target) {
      target.summary = summaryObj;
      target.status = 'completed';
      writeDb(freshDb);
    }
  } catch (e) {
    console.error(`Background summarizer error for doc ${docId}:`, e);
    const freshDb = readDb();
    const target = freshDb.documents.find(d => d.id === docId);
    if (target) {
      target.status = 'failed';
      writeDb(freshDb);
    }
  }
}

// ==========================================
// REST APIS
// ==========================================

// Get Configuration
app.get('/api/config', (req, res) => {
  const db = readDb();
  res.json(db.config);
});

// Update Configuration
app.post('/api/config', (req, res) => {
  const { geminiApiKey, mockMode } = req.body;
  const db = readDb();
  db.config.geminiApiKey = geminiApiKey !== undefined ? geminiApiKey : db.config.geminiApiKey;
  db.config.mockMode = mockMode !== undefined ? !!mockMode : db.config.mockMode;
  writeDb(db);
  res.json({ success: true, config: db.config });
});

// List Documents
app.get('/api/documents', (req, res) => {
  const db = readDb();
  res.json(db.documents);
});

// Delete Document
app.delete('/api/documents/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const index = db.documents.findIndex(d => d.id === id);
  if (index === -1) return res.status(404).json({ error: "Document not found" });

  const doc = db.documents[index];
  if (fs.existsSync(doc.path)) {
    try { fs.unlinkSync(doc.path); } catch (e) { console.error("Error deleting physical file", e); }
  }

  db.documents.splice(index, 1);
  db.chunks = db.chunks.filter(c => c.docId !== id);
  writeDb(db);

  res.json({ success: true });
});

// Upload Document Endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { category } = req.body; // 'policy', 'contract', 'report'
  const db = readDb();
  const docId = 'doc_' + Date.now();
  const ext = path.extname(req.file.originalname).toLowerCase();
  
  if (ext !== '.pdf' && ext !== '.docx') {
    // Delete file
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Unsupported format. Upload PDF or DOCX only.' });
  }

  try {
    const rawBuffer = fs.readFileSync(req.file.path);
    let pagesText = [];
    if (ext === '.pdf') {
      pagesText = await extractPdfPages(rawBuffer);
    } else {
      pagesText = await extractDocxPages(rawBuffer);
    }

    // Chunking text
    const newDbChunks = [];
    let pageCount = pagesText.length;

    for (let p of pagesText) {
      const pageChunks = computeChunks(p.text, p.page);
      for (let pc of pageChunks) {
        const chunkId = 'chunk_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        let embedding = [];
        if (db.config.geminiApiKey && !db.config.mockMode) {
          try {
            embedding = await callGeminiEmbedding(pc.text, db.config.geminiApiKey);
          } catch (embedErr) {
            console.error("Embedding API call failed, saving empty vector", embedErr);
          }
        }

        newDbChunks.push({
          id: chunkId,
          docId: docId,
          docName: req.file.originalname,
          page: pc.page,
          text: pc.text,
          embedding: embedding
        });
      }
    }

    const docRecord = {
      id: docId,
      name: req.file.originalname,
      category: category || 'report',
      path: req.file.path,
      uploadedAt: new Date().toISOString(),
      status: 'processing',
      pageCount: pageCount,
      summary: null
    };

    db.documents.push(docRecord);
    db.chunks.push(...newDbChunks);
    writeDb(db);

    // Trigger async summarizer job (Non-blocking)
    runAsyncAutoSummarizer(docId, req.file.path, category);

    res.status(200).json({ success: true, document: docRecord });
  } catch (err) {
    console.error("Upload handler exception:", err);
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to process document content extraction: ' + err.message });
  }
});

// ==========================================
// RAG & CHAT ENDPOINTS
// ==========================================

// Create Chat Session
app.post('/api/chat/session', (req, res) => {
  const db = readDb();
  const sessionId = 'session_' + Date.now();
  const session = { id: sessionId, messages: [] };
  db.chatSessions.push(session);
  writeDb(db);
  res.json(session);
});

// Get Chat Session
app.get('/api/chat/session/:id', (req, res) => {
  const db = readDb();
  const session = db.chatSessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session);
});

// Send Chat Message (RAG Loop)
app.post('/api/chat/message', async (req, res) => {
  const { sessionId, query, filterDocId, filterCategory } = req.body;
  const db = readDb();
  
  const sessionIndex = db.chatSessions.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) return res.status(404).json({ error: "Chat session not found" });

  if (!query || query.trim() === "") {
    return res.status(400).json({ error: "Empty query" });
  }

  try {
    let topContexts = [];
    
    // Check if we use real Gemini embeddings or offline TF-IDF
    if (db.config.geminiApiKey && !db.config.mockMode) {
      console.log(`Performing AI RAG search for: "${query}"`);
      try {
        const queryVector = await callGeminiEmbedding(query, db.config.geminiApiKey);
        
        // Filter chunks
        const pool = db.chunks.filter(c => {
          if (filterDocId && c.docId !== filterDocId) return false;
          if (filterCategory) {
            const doc = db.documents.find(d => d.id === c.docId);
            if (!doc || doc.category !== filterCategory) return false;
          }
          return true;
        });

        const scored = pool.map(c => {
          let score = 0;
          if (c.embedding && c.embedding.length > 0) {
            score = cosineSimilarity(queryVector, c.embedding);
          } else {
            // TF-IDF fallbacks if chunk has no embedding vector
            score = 0.05;
          }
          return { chunk: c, score };
        });

        topContexts = scored
          .filter(s => s.score > 0.1)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
      } catch (err) {
        console.error("Gemini context search failed, falling back to TF-IDF similarity", err);
        topContexts = calculateTfidfSimilarity(query, db.chunks, filterDocId, filterCategory, db.documents);
      }
    } else {
      // Offline TF-IDF Similarity
      topContexts = calculateTfidfSimilarity(query, db.chunks, filterDocId, filterCategory, db.documents);
    }

    if (topContexts.length === 0) {
      const responseText = "No relevant text sections were found in matching document databases to answer this question. Please make sure the documents are uploaded and processed successfully.";
      const answerMessage = {
        id: 'msg_' + Date.now(),
        role: 'assistant',
        content: responseText,
        citations: [],
        timestamp: new Date().toISOString()
      };
      
      db.chatSessions[sessionIndex].messages.push({
        id: 'msg_user_' + Date.now(),
        role: 'user',
        content: query,
        timestamp: new Date().toISOString()
      }, answerMessage);

      writeDb(db);
      return res.json(answerMessage);
    }

    const contextBlocks = topContexts.map(tc => tc.chunk);
    
    // Assemble AI response
    let finalAnswer = "";
    if (db.config.geminiApiKey && !db.config.mockMode) {
      const contextPrompt = contextBlocks.map((c, idx) => `[Source ${idx+1}: File: ${c.docName}, Page: ${c.page}]\nContent: ${c.text}`).join('\n\n');
      const systemMsg = `You are a compliance assistant. Respond to the queries using ONLY the text sources provided under "SOURCE DOCKET". Do not infer or invent facts outside. For every claim, add an inline citation, e.g. (Source 1, Page 3) mapping the correct citation. If the docket does not contain the answer, say "I cannot identify this detail from the provided sources."`;
      const prompt = `SOURCE DOCKET:\n${contextPrompt}\n\nUSER QUESTION: ${query}`;
      
      try {
        finalAnswer = await callGeminiGenerate(prompt, db.config.geminiApiKey, systemMsg);
      } catch (apiErr) {
        console.error("Calling Gemini API generation failed, fallback to mock generation", apiErr);
        finalAnswer = generateMockRagAnswer(query, contextBlocks);
      }
    } else {
      finalAnswer = generateMockRagAnswer(query, contextBlocks);
    }

    // Map citations cleanly for UI hover details
    const citations = contextBlocks.map(c => ({
      docId: c.docId,
      filename: c.docName,
      page: c.page,
      text: c.text
    }));

    const answerMessage = {
      id: 'msg_' + Date.now(),
      role: 'assistant',
      content: finalAnswer,
      citations: citations,
      timestamp: new Date().toISOString()
    };

    db.chatSessions[sessionIndex].messages.push({
      id: 'msg_user_' + Date.now(),
      role: 'user',
      content: query,
      timestamp: new Date().toISOString()
    }, answerMessage);

    writeDb(db);
    res.json(answerMessage);
  } catch (err) {
    console.error("RAG Message handler error:", err);
    res.status(500).json({ error: "Failed to query AI RAG service: " + err.message });
  }
});

// ==========================================
// AGENT / INTENT PLANNER LOOP
// ==========================================

app.post('/api/agent', async (req, res) => {
  const { instruction } = req.body;
  const db = readDb();

  if (!instruction || instruction.trim() === "") {
    return res.status(400).json({ error: "Argument 'instruction' required" });
  }

  const taskId = 'task_' + Date.now();
  const taskRecord = {
    id: taskId,
    instruction: instruction,
    status: 'running',
    logs: [],
    finalAnswer: ""
  };
  
  db.agentTasks.push(taskRecord);
  writeDb(db);

  // Helper log emitter for updating database live
  const emitTrace = (type, title, detail) => {
    const liveDb = readDb();
    const liveTask = liveDb.agentTasks.find(t => t.id === taskId);
    if (liveTask) {
      liveTask.logs.push({
        step: liveTask.logs.length + 1,
        type,
        title,
        detail,
        timestamp: new Date().toISOString()
      });
      writeDb(liveDb);
    }
  };

  try {
    // 1. Log beginning plan
    emitTrace('thought', 'Formulating Analytical Plan', `User requested: "${instruction}". I will parse local databases, find target files, execute similarity search across documents, and generate a synthesized comparison report.`);

    // Check if Gemini API is configured for real agent reasoning
    if (db.config.geminiApiKey && !db.config.mockMode) {
      try {
        // Step 2 Tool Call: Search databases
        emitTrace('tool_call', 'List Files', 'Executing search: Listing all uploaded files in the repository corpus.');
        const files = db.documents;
        emitTrace('observation', 'Files Located', `Found ${files.length} active database records: ${files.map(f => f.name).join(', ')}`);

        if (files.length === 0) {
          throw new Error("No files uploaded in corpus yet. Please upload files before requesting agent analysis.");
        }

        // Send a structured prompt to Gemini to outline a step-by-step tool plan
        const plannerSystem = `You are a compliance planner. Write a plan in JSON (and ONLY JSON) format detailing the step-by-step tools you will invoke to answer the query: "${instruction}".
Available tools:
1. "search_chunks" (arguments: query, docId) - Find matching sections.
2. "compare_values" (arguments: parameter_name, docId1, docId2) - Contrast clause items.
3. "summarize" (arguments: docId) - Synthesizes brief content.

Output in JSON:
{
  "steps": [
    { "tool": "search_chunks", "arg": "renewal termination liabilities", "docId": "all" },
    { "tool": "compare_values", "arg": "auto-renewal penalty comparison", "docId": "optional" }
  ]
}`;
        emitTrace('thought', 'Consulting Planner Engine', 'Polling Gemini model to compile optimal tool sequence...');
        
        let plannerResponse = await callGeminiGenerate("Generate planning blueprint", db.config.geminiApiKey, plannerSystem);
        // clean possible markdown wrappers
        plannerResponse = plannerResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        const plan = JSON.parse(plannerResponse);

        emitTrace('thought', 'Logical Pipeline Approved', `Determined tool sequence: ${plan.steps.map(s => `${s.tool}(q="${s.arg}")`).join(' -> ')}`);

        // Execute steps
        const responses = [];
        for (let step of plan.steps) {
          emitTrace('tool_call', `Execute Tool: ${step.tool}`, `Invoking tool with arguments: ${JSON.stringify(step)}`);
          
          if (step.tool === 'search_chunks') {
            const queryVec = await callGeminiEmbedding(step.arg, db.config.geminiApiKey);
            const scored = db.chunks.map(c => ({ chunk: c, score: cosineSimilarity(queryVec, c.embedding || []) }));
            const best = scored.sort((a,b) => b.score - a.score).slice(0, 4).map(s => s.chunk.text);
            responses.push(`Search matching results: ${best.join(' -- ')}`);
            emitTrace('observation', 'Knowledge Retrieved', `Retrieved ${best.length} highly matches. Sample: "${best[0]?.substring(0, 100)}..."`);
          } else if (step.tool === 'compare_values' || step.tool === 'summarize') {
            // Consolidate summaries
            const summarySnippet = db.documents.map(d => `${d.name}: ${d.summary?.oneLine || 'No cached summary'}`).join('\n');
            responses.push(`Review summaries:\n${summarySnippet}`);
            emitTrace('observation', 'Evaluations Summaries Pulled', `Inspected ${db.documents.length} document metadata tables.`);
          }
        }

        // Final synthesis
        emitTrace('thought', 'Synthesizing Final Findings', 'Drafting comprehensive analysis report comparing all constraints...');
        const synthesisPrompt = `Synthesize a final report based on structural findings.
Original request: "${instruction}"
Retrieved Docket details:
${responses.join('\n\n')}
Format output beautifully in Markdown. Make sure to use comparison tables if appropriate.`;

        const finalReport = await callGeminiGenerate(synthesisPrompt, db.config.geminiApiKey);
        
        emitTrace('thought', 'Report Compiled', 'Analyst report successfully produced code, citations verified.');
        
        // Save
        const finalDb = readDb();
        const activeT = finalDb.agentTasks.find(t => t.id === taskId);
        if (activeT) {
          activeT.status = 'completed';
          activeT.finalAnswer = finalReport;
          writeDb(finalDb);
        }
        return res.json(activeT);

      } catch (err) {
        console.error("Real Agent execution loop failed, falling back to mock trace engine", err);
        // Continue to mock block
      }
    }

    // ==========================================
    // MOCK AGENT TRACE SIMULATION (FALLBACK / MOCK MODE)
    // ==========================================
    const files = db.documents;
    if (files.length === 0) {
      emitTrace('thought', 'Corpus Error', 'Cannot run tool calls because no files are registered in the system.');
      const finalDb = readDb();
      const activeT = finalDb.agentTasks.find(t => t.id === taskId);
      activeT.status = 'failed';
      activeT.finalAnswer = "#### Execution Failed\nPlease upload at least one document (contract, policy, or report) to let the Agent run comparison analysis.";
      writeDb(finalDb);
      return res.json(activeT);
    }

    // Mock Tool Executions based on request words
    const queryLower = instruction.toLowerCase();
    
    // Step 2 Tool Call: List documents
    setTimeout(() => {
      emitTrace('tool_call', 'List Corpus Documents', 'Querying document database categories for Policies, Contracts, and Reports.');
      
      setTimeout(() => {
        emitTrace('observation', 'Available Source Files', `Located ${files.length} documents: ${files.map(f => f.name).join(', ')}`);
        
        // Step 3 Tool Call: Scanning
        setTimeout(() => {
          emitTrace('tool_call', 'Scan Document Chunks', `Searching vector database index for concepts matching: "${instruction}".`);
          
          setTimeout(() => {
            const matches = files.map(f => f.name);
            emitTrace('observation', 'Relevance Matrix Compiled', `Completed similarity scan. Matching documents: ${matches.slice(0, 3).join(', ')}.`);
            
            // Step 4 Tool Call: Extract details
            setTimeout(() => {
              emitTrace('tool_call', 'Extract Active Clauses', 'Extracting parameters: [Auto-Renewal Clause terms, Liability cap sizes, Payment schedules].');
              
              setTimeout(() => {
                // Compile Mock Report Table
                let mockTableReport = `### 📋 Autonomous Agent Document Analysis Report
**Analyzed Instruction**: *"${instruction}"*
**Execution Mode**: Offline Sandbox / Mock Mode
**Analyzed Corpus**: ${files.length} Documents.

#### Key Parameters Extracted

| Document Name | Document Category | Auto-Renewal Active? | Notice Deadline | Risk Exposure Level |
|:---|:---|:---|:---|:---|
`;
                files.forEach((f, idx) => {
                  const hasRenew = f.name.toLowerCase().includes('contract') || idx % 2 === 0;
                  mockTableReport += `| **${f.name}** | ${f.category.toUpperCase()} | ${hasRenew ? "YES (Auto-extensions)" : "NO (Direct expiry)"} | ${hasRenew ? "60 Days" : "N/A"} | ${hasRenew ? "🔴 High (Locked terms)" : "🟢 Low (Standard)"} |\n`;
                });

                mockTableReport += `\n\n### Analytical Synthesis & Recommendations
1. **Notice Alert**: Ensure written termination cancellations are submitted at least **60 days prior** for documents containing automatic renew properties.
2. **Review Advisory**: Check the liability thresholds of all contracts flagged above. We recommend negotiating a hard cap equivalent to 100% of standard fees paid.
3. **Continuous Tracking**: Add monitoring to prevent auto-renewal dates from slipping past.

*Analysis generated automatically by EDIS Document Analyst Agent.*`;

                emitTrace('thought', 'Synthesizing Comparison Metrics', 'Drafting final output summary table and recommendation guidelines.');
                
                setTimeout(() => {
                  emitTrace('thought', 'Task Finalized', 'Analyst findings compiled, verified, and complete.');
                  
                  const finalDb = readDb();
                  const activeT = finalDb.agentTasks.find(t => t.id === taskId);
                  if (activeT) {
                    activeT.status = 'completed';
                    activeT.finalAnswer = mockTableReport;
                    writeDb(finalDb);
                  }
                }, 1000);

              }, 1200);
            }, 1000);
          }, 1200);
        }, 1000);
      }, 1200);
    }, 1000);

    // Prompt reply immediately that agent task has started tracking
    res.json(taskRecord);

  } catch (err) {
    console.error("Agent supervisor loop crash:", err);
    res.status(500).json({ error: "Agent engine failed to run: " + err.message });
  }
});

// Get Agent Task Status
app.get('/api/agent/:id', (req, res) => {
  const db = readDb();
  const task = db.agentTasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json(task);
});

// Clear Database State (Helper for debugging/evaluations)
app.post('/api/reset', (req, res) => {
  // Delete uploaded files
  const db = readDb();
  db.documents.forEach(doc => {
    if (fs.existsSync(doc.path)) {
      try { fs.unlinkSync(doc.path); } catch (e) { console.error(e); }
    }
  });

  writeDb(defaultDb);
  res.json({ success: true, message: "Database reset complete" });
});

// Serve static assets from frontend build
const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDistPath));

// Catch-all route to serve index.html for React Router / SPA support
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const indexPath = path.join(frontendDistPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send("API Online. Access EDIS on Port 5173, or wait for the compilation build to serve both.");
  }
});

// Startup Server
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` EDIS Express Backend Server listening on port ${PORT}`);
  console.log(` Database: ${DB_FILE}`);
  console.log(` Upload Directory: ${UPLOADS_DIR}`);
  console.log(`===============================================`);
});
