const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, TableOfContents,
  HeadingLevel, BorderStyle, WidthType, ShadingType, VerticalAlign,
  PageNumber, PageBreak, TabStopType, TabStopPosition
} = require('docx');
const fs = require('fs');
const path = require('path');

// ---------- helpers ----------
const NAVY = "1F3864";
const BLUE = "2E75B6";
const LIGHTBLUE = "DCE6F1";
const GRAY = "595959";
const LIGHTGRAY = "F2F2F2";
const GREEN = "2E7D32";
const LIGHTGREEN = "E8F5E9";

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

function H1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function H2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function H3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
}
function P(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 160, line: 276 },
    children: [new TextRun({ text, ...opts })]
  });
}
function PRuns(runs, opts = {}) {
  return new Paragraph({ spacing: { after: 160, line: 276 }, ...opts, children: runs });
}
function bullet(text, level = 0, opts = {}) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 100 },
    children: [new TextRun({ text, ...opts })]
  });
}
function boldBullet(label, rest, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 100 },
    children: [
      new TextRun({ text: label, bold: true }),
      new TextRun({ text: rest })
    ]
  });
}
function numbered(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "numbers", level },
    spacing: { after: 100 },
    children: [new TextRun({ text })]
  });
}
function cell(text, opts = {}) {
  const { bold = false, fill = null, width, align = AlignmentType.LEFT, color = null, size = 21 } = opts;
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: fill ? { fill, type: ShadingType.CLEAR } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: align,
      children: [new TextRun({ text, bold, color: color || undefined, size })]
    })]
  });
}
function divider() {
  return new Paragraph({
    spacing: { before: 120, after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 1 } },
    children: [new TextRun("")]
  });
}
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}
function calloutBox(title, lines, fill = LIGHTBLUE, accent = BLUE) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 9360, type: WidthType.DXA },
            shading: { fill, type: ShadingType.CLEAR },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: accent },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: accent },
              left: { style: BorderStyle.SINGLE, size: 24, color: accent },
              right: { style: BorderStyle.SINGLE, size: 4, color: accent }
            },
            margins: { top: 160, bottom: 160, left: 240, right: 240 },
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: title, bold: true, color: accent, size: 23 })]
              }),
              ...lines.map(l => new Paragraph({
                spacing: { after: 60 },
                children: [new TextRun({ text: l, size: 21 })]
              }))
            ]
          })
        ]
      })
    ]
  });
}

// ============================================================
// COVER PAGE
// ============================================================
const coverPage = [
  new Paragraph({ spacing: { before: 1200 }, children: [new TextRun("")] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: "FINAL YEAR / MAJOR PROJECT", bold: true, color: BLUE, size: 24, characterSpacing: 20 })]
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: "Enterprise Document Intelligence System", bold: true, size: 56, color: NAVY })]
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: "An Agentic RAG Platform for Automated Policy, Contract, and Report Analysis", italics: true, size: 26, color: GRAY })]
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    border: { top: { style: BorderStyle.SINGLE, size: 8, color: BLUE, space: 12 } },
    children: [new TextRun("")]
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 600, after: 60 },
    children: [new TextRun({ text: "Implementation Plan & Technical Blueprint", bold: true, size: 30, color: NAVY })]
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: "Document Version 1.0", size: 22, color: GRAY })]
  }),
];

const coverMetaTable = new Table({
  alignment: AlignmentType.CENTER,
  width: { size: 7200, type: WidthType.DXA },
  columnWidths: [2880, 4320],
  rows: [
    ["Project Title", "Enterprise Document Intelligence System"],
    ["Category", "Generative AI / Applied NLP / Agentic Systems"],
    ["Core Stack", "RAG + LLM Agent + Prompt Engineering Pipeline"],
    ["Build Platform", "Antigravity (Agentic Dev Environment)"],
    ["Prepared For", "Academic Submission / Final Year Project Evaluation"],
    ["Status", "Approved for Implementation"],
  ].map(([k, v], i) => new TableRow({
    children: [
      cell(k, { bold: true, fill: i % 2 === 0 ? LIGHTGRAY : "FFFFFF", width: 2880, size: 21 }),
      cell(v, { width: 4320, size: 21 }),
    ]
  }))
});

// ============================================================
// SECTION 1 — EXECUTIVE SUMMARY
// ============================================================
const sec1 = [
  H1("1. Executive Summary"),
  P("Modern organizations accumulate thousands of unstructured PDF documents — policies, contracts, compliance reports, and financial statements — that are searched manually, read line by line, and summarized by hand. This is slow, inconsistent, and error-prone, especially for legal and compliance-sensitive material."),
  P("The Enterprise Document Intelligence System (EDIS) is a full-stack AI platform that lets an organization upload its documents once and then interact with them intelligently: ask natural-language questions and receive grounded, cited answers; generate accurate summaries on demand; and deploy an autonomous \u201cDocument Analyst\u201d agent that can plan and execute multi-step analysis tasks (e.g. \u201ccompare clause 4.2 across all vendor contracts and flag any with auto-renewal\u201d)."),
  P("The system is architected around four pillars that map directly to the four project requirements: a secure multi-format Upload & Ingestion pipeline; a Retrieval-Augmented Generation (RAG) layer for grounded question answering; a Prompt Engineering layer dedicated to high-fidelity summarization; and an Agent layer that orchestrates tools autonomously to act as a virtual document analyst. A bonus module adds scheduled, automatic executive-summary generation."),
  calloutBox("Why this stands out in class", [
    "Most student RAG projects stop at \u201cupload PDF \u2192 chat with PDF.\u201d This project goes further: it separates RAG (retrieval) from Prompt Engineering (summarization) from Agentic reasoning (multi-step analysis) as three distinct, demonstrable layers — which is exactly how production enterprise AI systems are actually designed.",
    "Built and orchestrated using Antigravity, giving you a visible, reproducible build log and agent-driven development workflow you can show during evaluation."
  ]),
];

// ============================================================
// SECTION 2 — PROBLEM STATEMENT
// ============================================================
const sec2 = [
  H1("2. Problem Statement"),
  P("Large organizations across legal, HR, finance, and compliance functions store critical knowledge inside thousands of disparate PDF files. Three concrete pain points motivate this project:"),
  boldBullet("Information is locked in unstructured text. ", "Contracts, policies, and reports are written in prose, not structured databases, so standard search (Ctrl+F, keyword search) fails to answer real questions like \u201cwhich contracts expire in Q1 and have a penalty clause?\u201d"),
  boldBullet("Manual review does not scale. ", "A compliance officer cannot read 4,000 policy documents to verify a new regulation is reflected everywhere it should be. Human review is slow, expensive, and inconsistent between reviewers."),
  boldBullet("Summarization quality varies by person and by day. ", "Executive summaries written manually differ in structure, tone, and completeness depending on who wrote them and how much time they had."),
  P("EDIS addresses all three by combining retrieval (find the right passages), generation (answer and summarize precisely), and agentic reasoning (chain multiple retrieval and generation steps together to complete a complex analytical task) into one coherent system."),
];

// ============================================================
// SECTION 3 — OBJECTIVES
// ============================================================
const sec3 = [
  H1("3. Project Objectives"),
  numbered("Build a secure ingestion pipeline that accepts policies, contracts, and reports in PDF (and optionally DOCX) format, validates them, and prepares them for retrieval."),
  numbered("Implement a Retrieval-Augmented Generation pipeline that answers natural-language questions about uploaded documents with source-grounded, citation-backed answers and minimal hallucination."),
  numbered("Apply structured prompt engineering techniques to produce consistent, high-quality document summaries at multiple levels of granularity (one-line, paragraph, and section-by-section)."),
  numbered("Design and implement an autonomous Document Analyst agent capable of multi-step reasoning — planning a sequence of retrieval, comparison, and summarization actions to satisfy complex, compound user requests."),
  numbered("(Bonus) Automatically generate and schedule executive summaries for newly uploaded or updated documents without user intervention."),
  numbered("Demonstrate the system end-to-end with a working demo, a reproducible Antigravity build log, and complete technical documentation (this report)."),
];

// ============================================================
// SECTION 4 — SCOPE
// ============================================================
const sec4 = [
  H1("4. Scope"),
  H2("4.1 In Scope"),
  bullet("Upload and process PDF documents across three categories: Policies, Contracts, Reports."),
  bullet("Text extraction, chunking, embedding, and vector storage for semantic search."),
  bullet("Conversational question answering grounded in retrieved document chunks (RAG)."),
  bullet("Prompt-engineered summarization (whole-document and section-level)."),
  bullet("An LLM-driven agent with tool access (retrieval tool, summarization tool, comparison tool, metadata tool)."),
  bullet("A web-based interface for upload, chat, and viewing generated summaries/reports."),
  bullet("Automatic executive summary generation as a background/bonus job."),
  H2("4.2 Out of Scope (for this iteration)"),
  bullet("OCR for scanned/handwritten documents (can be listed as future work)."),
  bullet("Multi-tenant enterprise authentication/SSO (a simple login is sufficient for a class demo)."),
  bullet("Fine-tuning a custom LLM \u2014 the project uses prompt engineering and RAG on top of an existing foundation model, not model training."),
  bullet("Real-time collaborative multi-user editing of summaries."),
];

// ============================================================
// SECTION 5 — SYSTEM ARCHITECTURE
// ============================================================
const sec5 = [
  H1("5. System Architecture"),
  P("EDIS follows a layered architecture. Each layer corresponds to one of the four required features, which makes the system easy to explain, demo, and grade section by section."),
  H2("5.1 High-Level Architecture Diagram"),
];

const sec5b = [
  H2("5.2 Layer-by-Layer Breakdown"),
  H3("Layer 1 \u2014 Ingestion & Upload"),
  bullet("Accepts PDF (primary) and DOCX uploads for three document classes: Policies, Contracts, Reports."),
  bullet("Validates file type/size, extracts raw text and basic metadata (title, page count, upload date, document class)."),
  bullet("Splits documents into overlapping chunks (recommended: 800\u20131000 tokens with ~150 token overlap) to preserve context across boundaries."),
  bullet("Generates vector embeddings for each chunk and stores them in a vector database alongside metadata (doc ID, category, page number)."),
  H3("Layer 2 \u2014 RAG (Retrieval-Augmented Generation)"),
  bullet("On a user question, embeds the query and performs a similarity search (top-k, e.g. k=5\u20138) against the vector store, optionally filtered by document category or specific document."),
  bullet("Re-ranks retrieved chunks (optional but recommended for higher precision) and assembles a context window."),
  bullet("Sends the question + retrieved context to the LLM with an instruction to answer only from the provided context and to cite the source document and page."),
  bullet("Returns the answer with inline citations, so every claim can be traced back to a specific document and page \u2014 critical for legal/compliance trust."),
  H3("Layer 3 \u2014 Prompt Engineering (Summarization)"),
  bullet("Uses a library of structured, reusable prompt templates rather than ad-hoc prompting \u2014 one template per summary type (one-line, executive, section-by-section, risk-flagging)."),
  bullet("Applies techniques such as role-setting (\u201cyou are a senior contracts analyst\u201d), explicit output schemas (JSON or fixed Markdown structure), few-shot examples for consistent tone, and chain-of-thought scratch reasoning that is discarded before the final answer is shown."),
  bullet("Summaries are generated per-document and cached so they don\u2019t need to be regenerated on every view."),
  H3("Layer 4 \u2014 Agent (Document Analyst)"),
  bullet("An LLM agent with access to a defined toolset: search_documents, summarize_document, compare_documents, extract_clauses, get_metadata."),
  bullet("Given a compound instruction (e.g. \u201cFind all contracts with an auto-renewal clause and summarize the risk for each\u201d), the agent plans a sequence of tool calls, executes them, and synthesizes a final structured answer."),
  bullet("The agent uses a reasoning loop (think \u2192 act \u2192 observe \u2192 repeat) and stops when it has enough information to answer, or asks a clarifying question if the request is ambiguous."),
  H3("Bonus Layer \u2014 Automatic Executive Summary Generation"),
  bullet("Triggered automatically whenever a new document is uploaded or an existing one is updated."),
  bullet("Runs the summarization prompt chain in the background and stores the result, optionally notifying the user once it is ready."),
];

// ============================================================
// SECTION 6 — TECH STACK
// ============================================================
const techRows = [
  ["Layer", "Recommended Technology", "Why"],
  ["Frontend / UI", "React (Next.js) + Tailwind CSS", "Fast to build, component-based, clean chat + dashboard UI"],
  ["Backend API", "Python \u2014 FastAPI", "Async-friendly, ideal for AI/ML pipelines and streaming responses"],
  ["LLM Provider", "Claude (Anthropic API)", "Strong reasoning, native tool-use/agent support, large context window"],
  ["Embeddings", "Voyage AI / OpenAI text-embedding / Sentence-Transformers (local)", "High-quality semantic embeddings for retrieval"],
  ["Vector Database", "ChromaDB (local/dev) or Pinecone / Qdrant (cloud)", "Chroma is free and ideal for a class project; Pinecone/Qdrant for scale"],
  ["Document Parsing", "PyMuPDF (fitz) / pdfplumber", "Reliable text + layout extraction from PDFs"],
  ["Orchestration", "LangChain or LlamaIndex (or custom lightweight pipeline)", "Pre-built RAG and agent abstractions; speeds up development"],
  ["Database (metadata)", "PostgreSQL / SQLite", "Stores document metadata, summaries, chat history"],
  ["Dev / Build Environment", "Antigravity (agentic IDE)", "Agent-assisted, reproducible build process \u2014 unique differentiator"],
  ["Deployment (optional)", "Docker + Render / Railway / AWS", "Containerized, portable demo deployment"],
];

const sec6 = [
  H1("6. Technology Stack"),
  P("The stack below is a recommended, proven combination. Substitute any row with an equivalent tool your instructor prefers (e.g. OpenAI instead of Claude, FAISS instead of Chroma) \u2014 the architecture does not change."),
];

function buildTechTable() {
  const widths = [2200, 4200, 2960];
  const rows = techRows.map((row, i) => {
    const isHeader = i === 0;
    return new TableRow({
      tableHeader: isHeader,
      children: row.map((text, ci) => cell(text, {
        bold: isHeader,
        fill: isHeader ? NAVY : (i % 2 === 0 ? LIGHTGRAY : "FFFFFF"),
        color: isHeader ? "FFFFFF" : null,
        width: widths[ci],
        size: 20
      }))
    });
  });
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2200, 4200, 2960],
    rows
  });
}

// ============================================================
// SECTION 7 — DATA FLOW / FEATURE DEEP DIVE
// ============================================================
const sec7 = [
  H1("7. Feature Deep Dive"),
  H2("7.1 Upload Module"),
  P("Supports three document categories with category-specific metadata fields:"),
];

const uploadRows = [
  ["Category", "Typical Metadata Captured", "Special Handling"],
  ["Policies", "Policy ID, department, effective date, version", "Detect superseded versions; flag policy conflicts"],
  ["Contracts", "Parties, effective/expiry date, contract type", "Extract key clauses (termination, renewal, penalty)"],
  ["Reports", "Report type, reporting period, author/department", "Extract KPIs/figures into structured tables where possible"],
];

function buildUploadTable() {
  const widths = [2200, 4100, 3060];
  const rows = uploadRows.map((row, i) => {
    const isHeader = i === 0;
    return new TableRow({
      tableHeader: isHeader,
      children: row.map((text, ci) => cell(text, {
        bold: isHeader,
        fill: isHeader ? BLUE : (i % 2 === 0 ? LIGHTGRAY : "FFFFFF"),
        color: isHeader ? "FFFFFF" : null,
        width: widths[ci],
        size: 20
      }))
    });
  });
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: widths, rows });
}

const sec7b = [
  H2("7.2 RAG Question Answering \u2014 Worked Example"),
  P("Example user query: \u201cWhat is the notice period for terminating the vendor agreement with Company X?\u201d"),
  numbered("Query is embedded and matched against vector store, filtered to category = Contracts and document = \u201cCompany X Agreement.\u201d"),
  numbered("Top 5 matching chunks are retrieved (e.g. clauses 7.1\u20137.4 covering termination)."),
  numbered("Chunks + query are passed to the LLM with a strict instruction: \u201cAnswer using only the context below. If the answer is not present, say so. Cite the page number for every claim.\u201d"),
  numbered("LLM returns: \u201cThe notice period is 60 days (Section 7.2, p. 4).\u201d \u2014 a precise, traceable answer instead of a generic summary."),
  H2("7.3 Prompt Engineering \u2014 Summarization Template Example"),
  P("Rather than a single generic \u201csummarize this\u201d prompt, EDIS uses a structured template, e.g.:"),
  new Paragraph({
    spacing: { after: 200, before: 100 },
    indent: { left: 200, right: 200 },
    shading: { fill: LIGHTGRAY, type: ShadingType.CLEAR },
    border: { top: border, bottom: border },
    children: [new TextRun({
      text: "Role: You are a senior compliance analyst.\nTask: Summarize the attached [document_type] in the following structure:\n1. One-line purpose\n2. Key obligations / parties\n3. Critical dates and durations\n4. Risk flags (if any)\nConstraint: Do not infer facts not present in the document. Output as Markdown.",
      font: "Courier New", size: 19
    })]
  }),
  P("This structured, role-based, schema-constrained prompting produces consistent output regardless of which document is fed in \u2014 the core skill the \u201cPrompt Engineering\u201d feature is meant to demonstrate."),
  H2("7.4 Agent \u2014 Document Analyst Reasoning Loop"),
  P("Example compound instruction: \u201cWhich of our contracts auto-renew, and which one carries the highest financial penalty if we exit early?\u201d"),
  numbered("Agent plans: (a) search all contracts for auto-renewal clauses, (b) for each match, extract the early-exit penalty, (c) compare penalties, (d) produce a ranked answer."),
  numbered("Agent calls search_documents(category=\"contracts\", query=\"auto-renewal clause\")."),
  numbered("For each returned document, agent calls extract_clauses(doc_id, clause_type=\"early termination penalty\")."),
  numbered("Agent compares extracted values internally, then calls a final synthesis step to produce a ranked, cited answer."),
  P("This loop \u2014 plan, act, observe, repeat, synthesize \u2014 is what distinguishes an agent from a simple chatbot, and is the centerpiece of the project\u2019s technical novelty."),
];

// ============================================================
// SECTION 8 — DATABASE / DATA MODEL
// ============================================================
const sec8 = [
  H1("8. Data Model (Simplified Schema)"),
];

const schemaRows = [
  ["Entity", "Key Fields"],
  ["Document", "doc_id, filename, category (policy/contract/report), upload_date, status, page_count"],
  ["Chunk", "chunk_id, doc_id, page_number, text, embedding_vector"],
  ["Summary", "summary_id, doc_id, type (one-line/executive/section), content, generated_at"],
  ["ChatSession", "session_id, user_id, created_at"],
  ["ChatMessage", "message_id, session_id, role, content, cited_chunks, timestamp"],
  ["AgentTask", "task_id, instruction, plan_steps, tool_calls_log, final_answer, status"],
];

function buildSchemaTable() {
  const widths = [2400, 6960];
  const rows = schemaRows.map((row, i) => {
    const isHeader = i === 0;
    return new TableRow({
      tableHeader: isHeader,
      children: row.map((text, ci) => cell(text, {
        bold: isHeader,
        fill: isHeader ? NAVY : (i % 2 === 0 ? LIGHTGRAY : "FFFFFF"),
        color: isHeader ? "FFFFFF" : null,
        width: widths[ci],
        size: 20
      }))
    });
  });
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: widths, rows });
}

// ============================================================
// SECTION 9 — IMPLEMENTATION ROADMAP
// ============================================================
const sec9 = [
  H1("9. Implementation Roadmap"),
  P("A 6-phase build plan designed to be executed inside Antigravity, where each phase can be delegated as a discrete agent task with clear headings/outputs \u2014 ideal for showing a clean, reproducible build log during evaluation."),
];

const roadmapRows = [
  ["Phase", "Deliverable", "Key Tasks"],
  ["Phase 1\nSetup & Ingestion", "Working upload pipeline", "Project scaffold; PDF/DOCX parser; chunking; embedding; vector DB setup"],
  ["Phase 2\nRAG Core", "Working Q&A on one document", "Retrieval pipeline; prompt template for grounded QA; citation formatting"],
  ["Phase 3\nPrompt Engineering", "Reliable summarization", "Template library (one-line / executive / section); output schema validation"],
  ["Phase 4\nAgent Layer", "Multi-step analyst agent", "Tool definitions; reasoning loop; multi-doc comparison logic"],
  ["Phase 5\nUI & Integration", "End-to-end demo app", "Upload UI; chat UI; summary viewer; agent task viewer"],
  ["Phase 6\nBonus + Polish", "Auto-executive-summary + docs", "Background job trigger; testing; this implementation report; demo script"],
];

function buildRoadmapTable() {
  const widths = [1800, 2900, 4660];
  const rows = roadmapRows.map((row, i) => {
    const isHeader = i === 0;
    return new TableRow({
      tableHeader: isHeader,
      children: row.map((text, ci) => {
        const lines = text.split("\n");
        return new TableCell({
          borders,
          width: { size: widths[ci], type: WidthType.DXA },
          shading: { fill: isHeader ? BLUE : (i % 2 === 0 ? LIGHTGRAY : "FFFFFF"), type: ShadingType.CLEAR },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 90, bottom: 90, left: 120, right: 120 },
          children: lines.map((line, li) => new Paragraph({
            spacing: { after: li === 0 && lines.length > 1 ? 20 : 0 },
            children: [new TextRun({ text: line, bold: isHeader || (ci === 0 && li === 0), color: isHeader ? "FFFFFF" : null, size: 20 })]
          }))
        });
      })
    });
  });
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: widths, rows });
}

// ============================================================
// SECTION 10 — EVALUATION / TESTING
// ============================================================
const sec10 = [
  H1("10. Evaluation & Testing Strategy"),
  H2("10.1 RAG Quality Metrics"),
  bullet("Retrieval precision: are the retrieved chunks actually relevant to the query? (manual spot-check on a test set of 20\u201330 Q&A pairs)"),
  bullet("Faithfulness: does the generated answer only use facts present in the retrieved context (no hallucination)?"),
  bullet("Citation accuracy: does the cited page/section actually contain the claimed information?"),
  H2("10.2 Summarization Quality"),
  bullet("Structure compliance: does every summary follow the defined schema (sections present, correct format)?"),
  bullet("Completeness vs. conciseness: does the summary capture all critical obligations/dates without padding?"),
  H2("10.3 Agent Reliability"),
  bullet("Task success rate across a fixed set of 10\u201315 compound test instructions of increasing complexity."),
  bullet("Tool-call correctness: does the agent call the right tool with the right arguments at each step?"),
  bullet("Graceful failure: does the agent ask for clarification instead of guessing when an instruction is ambiguous?"),
  H2("10.4 System-Level Testing"),
  bullet("Upload validation (file type/size limits, corrupted file handling)."),
  bullet("Load testing with a realistic document set (recommend 50\u2013100 sample PDFs for the class demo corpus)."),
  bullet("End-to-end demo script rehearsal covering all four features plus the bonus feature."),
];

// ============================================================
// SECTION 11 — RISKS
// ============================================================
const riskRows = [
  ["Risk", "Impact", "Mitigation"],
  ["LLM hallucination in answers", "High \u2014 erodes trust, especially for legal/compliance use", "Strict \u201ccontext-only\u201d prompting; mandatory citations; faithfulness checks"],
  ["Poor PDF text extraction (scanned/complex layouts)", "Medium \u2014 missing or garbled chunks", "Use robust parser (PyMuPDF); flag low-confidence extractions; OCR as future work"],
  ["Chunking breaks context across clause boundaries", "Medium \u2014 incomplete answers", "Overlapping chunks; section-aware chunking using headings where possible"],
  ["Agent gets stuck in a reasoning loop / calls wrong tool", "Medium \u2014 incorrect or incomplete answers", "Max iteration limit; explicit tool schemas; fallback to direct RAG answer"],
  ["API cost/rate limits during demo", "Low\u2013Medium \u2014 demo disruption", "Cache summaries; use a small, fixed demo corpus; have an offline fallback recording"],
  ["Sensitive document content (contracts/policies)", "Medium \u2014 privacy/confidentiality", "Use synthetic/sample documents for the class demo, not real organizational data"],
];

function buildRiskTable() {
  const widths = [2600, 2200, 4560];
  const rows = riskRows.map((row, i) => {
    const isHeader = i === 0;
    return new TableRow({
      tableHeader: isHeader,
      children: row.map((text, ci) => cell(text, {
        bold: isHeader,
        fill: isHeader ? "8B0000" : (i % 2 === 0 ? LIGHTGRAY : "FFFFFF"),
        color: isHeader ? "FFFFFF" : null,
        width: widths[ci],
        size: 19
      }))
    });
  });
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: widths, rows });
}

const sec11 = [H1("11. Risks & Mitigations")];

// ============================================================
// SECTION 12 — WHY THIS IS UNIQUE
// ============================================================
const sec12 = [
  H1("12. Differentiation \u2014 Why This Stands Out"),
  P("Most classmates building a \u201cdocument chatbot\u201d will submit a single RAG loop: upload \u2192 embed \u2192 chat. EDIS is differentiated on four concrete axes:"),
  boldBullet("Layered architecture, not a single loop. ", "RAG, prompt engineering, and agentic reasoning are implemented and demoed as three separable, individually testable layers \u2014 mirroring how real enterprise AI platforms (e.g. legal-tech and compliance-tech products) are actually built."),
  boldBullet("A genuine agent, not just a chatbot. ", "The Document Analyst plans and executes multi-step tool-calling tasks (compare across documents, extract clauses, rank by risk) \u2014 well beyond single-turn Q&A."),
  boldBullet("Domain specificity. ", "Built explicitly around three real enterprise document types (policies, contracts, reports) with category-aware metadata and extraction logic, not a generic \u201cany PDF\u201d demo."),
  boldBullet("Built with Antigravity. ", "The build process itself is agent-assisted and reproducible, giving you a unique, demonstrable development story for evaluation \u2014 not just the final app."),
  boldBullet("Automatic executive summaries (bonus). ", "A background job that proactively keeps leadership-ready summaries up to date \u2014 a feature with clear, tangible business value beyond the core requirements."),
];

// ============================================================
// SECTION 13 — DEMO SCRIPT
// ============================================================
const sec13 = [
  H1("13. Suggested Demo Script (For Class Presentation)"),
  numbered("Upload: Show 3\u20135 sample documents being uploaded (one policy, one contract, one report) and processed live."),
  numbered("RAG Q&A: Ask 2\u20133 natural questions (\u201cWhat is the termination notice period in the vendor contract?\u201d) and show the cited, grounded answer."),
  numbered("Prompt-engineered summary: Generate an executive summary of one document live and show the consistent structured output."),
  numbered("Agent task: Issue one compound instruction (\u201cCompare auto-renewal risk across all contracts\u201d) and narrate the agent\u2019s plan \u2192 tool calls \u2192 final answer."),
  numbered("Bonus: Upload a new document and show the executive summary being generated automatically in the background without being asked."),
  numbered("Close: Show the architecture diagram and the Antigravity build log as evidence of a structured, reproducible engineering process."),
];

// ============================================================
// SECTION 14 — FUTURE WORK
// ============================================================
const sec14 = [
  H1("14. Future Enhancements"),
  bullet("OCR support for scanned and handwritten documents."),
  bullet("Multi-language document support."),
  bullet("Role-based access control and full enterprise SSO integration."),
  bullet("Fine-tuned or distilled smaller model for cost-efficient summarization at scale."),
  bullet("Active-learning feedback loop where user corrections improve retrieval ranking over time."),
  bullet("Integration with e-signature and contract lifecycle management (CLM) platforms."),
];

// ============================================================
// SECTION 15 — CONCLUSION
// ============================================================
const sec15 = [
  H1("15. Conclusion"),
  P("The Enterprise Document Intelligence System turns an organization\u2019s static PDF archive into an interactive, queryable knowledge base. By cleanly separating ingestion, retrieval-augmented question answering, prompt-engineered summarization, and agentic multi-step analysis into distinct, demonstrable layers \u2014 and by automating executive summaries as a bonus capability \u2014 the project meets every stated requirement while remaining clear enough to explain confidently in a viva or class presentation. Built and tracked using Antigravity, it also tells a strong story about engineering process, not just the final output, which is what will make it stand out among submissions in your class."),
];

// ============================================================
// ASSEMBLE DOCUMENT
// ============================================================
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Arial", size: 22, color: "262626" } }
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 4 } } }
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: BLUE },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 }
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 23, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 2 }
      },
    ]
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 900, hanging: 270 } } } },
        ]
      },
      {
        reference: "numbers",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 540, hanging: 360 } } } },
        ]
      },
    ]
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 }
        },
        titlePage: true,
      },
      headers: {},
      footers: {},
      children: [
        ...coverPage,
        coverMetaTable,
      ]
    },
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 }
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF", space: 4 } },
            children: [
              new TextRun({ text: "Enterprise Document Intelligence System", size: 16, color: GRAY }),
              new TextRun({ text: "\tImplementation Plan", size: 16, color: GRAY }),
            ]
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Page ", size: 18, color: GRAY }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: GRAY }),
              new TextRun({ text: " of ", size: 18, color: GRAY }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: GRAY }),
            ]
          })]
        })
      },
      children: [
        H1("Table of Contents"),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
        pageBreak(),
        ...sec1,
        pageBreak(),
        ...sec2,
        ...sec3,
        pageBreak(),
        ...sec4,
        pageBreak(),
        ...sec5,
        new Paragraph({ children: [new TextRun({ text: "[See Figure 1 \u2014 Architecture Diagram, provided as a separate image file: architecture-diagram.png]", italics: true, color: GRAY })], spacing: { after: 240 } }),
        ...sec5b,
        pageBreak(),
        ...sec6,
        buildTechTable(),
        pageBreak(),
        ...sec7,
        buildUploadTable(),
        new Paragraph({ spacing: { after: 200 } }),
        ...sec7b,
        pageBreak(),
        ...sec8,
        buildSchemaTable(),
        pageBreak(),
        ...sec9,
        buildRoadmapTable(),
        pageBreak(),
        ...sec10,
        pageBreak(),
        ...sec11,
        buildRiskTable(),
        pageBreak(),
        ...sec12,
        pageBreak(),
        ...sec13,
        pageBreak(),
        ...sec14,
        ...sec15,
      ]
    }
  ]
});

Packer.toBuffer(doc).then(buffer => {
  const outputPath = path.join(__dirname, "EDIS_Implementation_Plan.docx");
  fs.writeFileSync(outputPath, buffer);
  console.log("done compiling docx: " + outputPath);
}).catch(err => {
  console.error("Compilation error", err);
});
