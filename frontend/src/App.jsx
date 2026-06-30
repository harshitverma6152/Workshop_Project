import { useState, useEffect, useRef } from 'react';
import './App.css';

const API_BASE = '/api';

function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState('docs'); // 'docs', 'chat', 'agent', 'config'

  // Settings
  const [config, setConfig] = useState({ geminiApiKey: '', mockMode: true });
  const [showConfigAlert, setShowConfigAlert] = useState(false);

  // Document Repository
  const [documents, setDocuments] = useState([]);
  const [uploadCategory, setUploadCategory] = useState('report'); // 'policy', 'contract', 'report'
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [summaryTab, setSummaryTab] = useState('overview'); // 'overview', 'obligations', 'hazard'

  // Chat Section
  const [chatSession, setChatSession] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDocId, setFilterDocId] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [activeCitation, setActiveCitation] = useState(null); // { filename, page, text }

  // Agent Section
  const [agentInstruction, setAgentInstruction] = useState('');
  const [runningAgentTask, setRunningAgentTask] = useState(null); // active task object
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  const fileInputRef = useRef(null);
  const chatBottomRef = useRef(null);
  const agentLogBottomRef = useRef(null);

  // Initialize data
  useEffect(() => {
    fetchConfig();
    fetchDocuments();
  }, []);

  // Poll for document processing statuses
  useEffect(() => {
    const hasProcessing = documents.some(doc => doc.status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchDocuments();
    }, 3000);

    return () => clearInterval(interval);
  }, [documents]);

  // Scroll to bottom of chat when new messages arrive
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  // Scroll to bottom of agent logs
  useEffect(() => {
    if (agentLogBottomRef.current) {
      agentLogBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [runningAgentTask?.logs]);

  // Poll for agent steps if running
  useEffect(() => {
    if (!runningAgentTask || runningAgentTask.status !== 'running') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/agent/${runningAgentTask.id}`);
        if (!res.ok) throw new Error("Failed to fetch task");
        const data = await res.json();
        setRunningAgentTask(data);
        if (data.status !== 'running') {
          setIsAgentRunning(false);
          clearInterval(interval);
        }
      } catch (err) {
        console.error("Error polling agent status:", err);
      }
    }, 850);

    return () => clearInterval(interval);
  }, [runningAgentTask]);

  // ==========================================
  // API INTERACTIONS
  // ==========================================

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/config`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (e) {
      console.error("Error fetching config:", e);
    }
  };

  const updateConfigVal = async (updated) => {
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        setShowConfigAlert(true);
        setTimeout(() => setShowConfigAlert(false), 3000);
      }
    } catch (e) {
      console.error("Error saving config:", e);
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
        // If a document was open for viewing and has finished processing, update the view context
        if (selectedDoc) {
          const fresh = data.find(d => d.id === selectedDoc.id);
          if (fresh && fresh.status !== selectedDoc.status) {
            setSelectedDoc(fresh);
          }
        }
      }
    } catch (e) {
      console.error("Error fetching documents:", e);
    }
  };

  const handleFileUploadClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', uploadCategory);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to upload file");
      } else {
        const data = await res.json();
        // Optimistically add the document to local state immediately
        // (required for stateless Netlify deployments where /documents always returns [])
        if (data.document) {
          setDocuments(prev => {
            // Avoid duplicates if the document is already in state
            if (prev.find(d => d.id === data.document.id)) return prev;
            return [...prev, data.document];
          });
        }
        // Also re-fetch in case backend has more documents (local Express server)
        await fetchDocuments();
      }
    } catch (err) {
      console.error("Upload error:", err);
      alert("Network error occurred during document uploading.");
    } finally {
      setIsUploading(false);
      e.target.value = null; // Reset file input
    }
  };

  const deleteDocument = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this document and its chunk vectors from storage?")) return;

    try {
      const res = await fetch(`${API_BASE}/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedDoc && selectedDoc.id === id) {
          setSelectedDoc(null);
        }
        await fetchDocuments();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const initializeChatSession = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/session`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setChatSession(data);
        setChatMessages(data.messages);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const sendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    let activeSessionId = chatSession?.id;
    if (!activeSessionId) {
      // Lazy init chat session if none active
      try {
        const res = await fetch(`${API_BASE}/chat/session`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          activeSessionId = data.id;
          setChatSession(data);
        } else {
          return;
        }
      } catch (err) {
        console.error(err);
        return;
      }
    }

    const userMessageContent = chatInput;
    setChatInput('');
    setIsSendingMessage(true);

    // Append user message immediately
    const tempUserMsg = {
      id: 'tmp_user_' + Date.now(),
      role: 'user',
      content: userMessageContent,
      timestamp: new Date().toISOString()
    };
    setChatMessages(prev => [...prev, tempUserMsg]);

    try {
      const response = await fetch(`${API_BASE}/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          query: userMessageContent,
          filterDocId: filterDocId || undefined,
          filterCategory: filterCategory || undefined,
          // Pass client-side documents so stateless backends (Netlify) can answer
          clientDocuments: documents.filter(d => d.status === 'completed').map(d => ({
            id: d.id,
            name: d.name,
            category: d.category,
            summary: d.summary
          }))
        })
      });

      if (!response.ok) {
        throw new Error("API replied with failure status");
      }

      const data = await response.json();
      setChatMessages(prev => [...prev, data]);
    } catch (err) {
      console.error(err);
      alert("Failed to submit query. Ensure backend is running.");
    } finally {
      setIsSendingMessage(false);
    }
  };

  const triggerAgentInstruction = async () => {
    if (!agentInstruction.trim() || isAgentRunning) return;

    setIsAgentRunning(true);
    setRunningAgentTask({
      id: 'temp',
      instruction: agentInstruction,
      status: 'running',
      logs: [{ step: 1, type: 'thought', title: 'Task Started', detail: 'Spinning up the Document Analyst reasoning runtime...', timestamp: new Date().toISOString() }],
      finalAnswer: ''
    });

    try {
      const res = await fetch(`${API_BASE}/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: agentInstruction,
          clientDocuments: documents.filter(d => d.status === 'completed').map(d => ({
            id: d.id, name: d.name, category: d.category, summary: d.summary
          }))
        })
      });

      if (!res.ok) {
        throw new Error("Agent failed to bootstrap");
      }

      const data = await res.json();
      setRunningAgentTask(data);
    } catch (err) {
      console.error(err);
      setRunningAgentTask(prev => ({
        ...prev,
        status: 'failed',
        finalAnswer: '#### Execution Error\nBackend agent engine is unavailable. Please verify connection.'
      }));
      setIsAgentRunning(false);
    }
  };

  const triggerSystemReset = async () => {
    if (!confirm("This will erase all uploaded documents, vectors, summaries, and agent logs. Reset system?")) return;
    try {
      const res = await fetch(`${API_BASE}/reset`, { method: 'POST' });
      if (res.ok) {
        setSelectedDoc(null);
        setDocuments([]);
        setChatSession(null);
        setChatMessages([]);
        setRunningAgentTask(null);
        alert("Database has been reset to empty sandbox mode.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Helper: Format inline text citations to beautiful HTML cards
  const renderTextWithCitations = (text, citations) => {
    if (!citations || citations.length === 0) return <span>{text}</span>;

    // Matches strings like (Source 1, Page 3) or (Source 22, Page 1)
    const regex = /\(Source\s+(\d+),\s+Page\s+(\d+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Push text before match
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      const sourceIdx = parseInt(match[1], 10) - 1;
      const pageNum = parseInt(match[2], 10);
      const citationObj = citations[sourceIdx];

      if (citationObj) {
        parts.push(
          <a
            key={match.index}
            className="edis-citation-pill"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setActiveCitation({
                filename: citationObj.filename,
                page: citationObj.page,
                text: citationObj.text
              });
            }}
          >
            {citationObj.filename.substring(0, 10)}... (p. {citationObj.page})
          </a>
        );
      } else {
        parts.push(match[0]); // fallback to raw string if bounds error
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return <span>{parts.length > 0 ? parts : text}</span>;
  };

  return (
    <div className="edis-app-container">
      {/* ============================================================ */}
      {/* SIDEBAR VIEW CONTAINER */}
      {/* ============================================================ */}
      <aside className="edis-sidebar">
        <div className="edis-logo-area">
          <div className="edis-logo-icon">E</div>
          <div className="edis-logo-text">
            <h1>EDIS Console</h1>
            <span>Document Intelligence</span>
          </div>
        </div>

        <nav>
          <ul className="edis-menu-list">
            <li
              className={`edis-menu-item ${activeTab === 'docs' ? 'active' : ''}`}
              onClick={() => { setActiveTab('docs'); setSelectedDoc(null); }}
            >
              <span className="edis-menu-icon">📁</span>
              Repository
            </li>
            <li
              className={`edis-menu-item ${activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('chat');
                if (!chatSession) initializeChatSession();
              }}
            >
              <span className="edis-menu-icon">💬</span>
              RAG Chat
            </li>
            <li
              className={`edis-menu-item ${activeTab === 'agent' ? 'active' : ''}`}
              onClick={() => setActiveTab('agent')}
            >
              <span className="edis-menu-icon">🤖</span>
              Agent Workspace
            </li>
            <li
              className={`edis-menu-item ${activeTab === 'config' ? 'active' : ''}`}
              onClick={() => setActiveTab('config')}
            >
              <span className="edis-menu-icon">⚙️</span>
              Settings
            </li>
          </ul>
        </nav>

        {/* Sidebar Status Widgets */}
        <div className="edis-sidebar-footer">
          <div className="edis-status-pill">
            <span className={`edis-status-indicator ${config.mockMode ? 'off' : 'on'}`}></span>
            <span>{config.mockMode ? 'Mock Sandbox Mode' : 'AI Backend Service Active'}</span>
          </div>
          {config.mockMode ? (
            <div className="edis-mode-badge">OFFLINE SIMULATOR</div>
          ) : (
            <div className="edis-mode-badge" style={{ borderColor: 'rgba(16, 185, 129, 0.3)', color: '#10b981' }}>
              GEMINI ACTIVE
            </div>
          )}
        </div>
      </aside>

      {/* ============================================================ */}
      {/* WORKSPACE HOST */}
      {/* ============================================================ */}
      <main className="edis-workspace">
        <header className="edis-workspace-header">
          <div className="edis-header-title">
            {activeTab === 'docs' && (
              <>
                <h2>Document Repository</h2>
                <p>Upload, validate, and digest reports, policies, and contracts.</p>
              </>
            )}
            {activeTab === 'chat' && (
              <>
                <h2>Retrieval-Augmented Chat</h2>
                <p>Ask natural questions grounded in document database context.</p>
              </>
            )}
            {activeTab === 'agent' && (
              <>
                <h2>Document Analyst Agent</h2>
                <p>Run autonomous multi-step clause evaluations and cross-comparisons.</p>
              </>
            )}
            {activeTab === 'config' && (
              <>
                <h2>System Settings</h2>
                <p>Manage API key registries and backend modes.</p>
              </>
            )}
          </div>

          <div className="edis-header-actions">
            {config.mockMode && activeTab !== 'config' && (
              <button className="edis-quick-key-btn" onClick={() => setActiveTab('config')}>
                🔌 Configure API Key
              </button>
            )}
          </div>
        </header>

        {/* Workspace Display Area */}
        <div className="edis-panel-content">

          {/* ============================================================ */}
          {/* TAB 1: FILE REPOSITORY VIEW */}
          {/* ============================================================ */}
          {activeTab === 'docs' && !selectedDoc && (
            <div className="edis-repo-layout">
              {/* Left Column: Upload Console */}
              <div className="edis-card">
                <div className="edis-card-title">📤 Upload New Document</div>
                
                <div className="edis-upload-zone" onClick={handleFileUploadClick}>
                  <div className="edis-upload-icon">📄</div>
                  <p style={{ fontWeight: 600, color: 'white', marginBottom: '6px' }}>
                    {isUploading ? 'Extracting File Structure...' : 'Choose PDF or DOCX file'}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Maximum size limit: 12MB. Layouts chunks processed automatically.
                  </p>
                  
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".pdf,.docx"
                    style={{ display: 'none' }}
                    disabled={isUploading}
                  />
                </div>

                <div className="edis-category-selector">
                  <label>Assign Document Category Filter:</label>
                  <div className="edis-category-buttons">
                    {['policy', 'contract', 'report'].map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={`edis-category-btn ${uploadCategory === cat ? 'selected' : ''}`}
                        onClick={() => setUploadCategory(cat)}
                      >
                        {cat.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Files Registry */}
              <div className="edis-card">
                <div className="edis-card-title">📁 Document Library ({documents.length})</div>
                
                {documents.length === 0 ? (
                  <div className="edis-doc-list-empty">
                    <p style={{ fontSize: '28px', marginBottom: '10px' }}>📦</p>
                    <p style={{ fontWeight: '500' }}>No Documents Uploaded</p>
                    <p style={{ fontSize: '13px', margin: '4px 0 16px' }}>
                      Drag files into upload card to populate RAG databases.
                    </p>
                  </div>
                ) : (
                  <div className="edis-doc-table-container">
                    <table className="edis-table">
                      <thead>
                        <tr>
                          <th>Document Name</th>
                          <th>Category</th>
                          <th>Pages</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documents.map((doc) => (
                          <tr key={doc.id} style={{ cursor: doc.status === 'completed' ? 'pointer' : 'default' }} onClick={() => doc.status === 'completed' && setSelectedDoc(doc)}>
                            <td style={{ fontWeight: '600' }}>{doc.name}</td>
                            <td>
                              <span className={`edis-doc-type-tag ${doc.category}`}>
                                {doc.category}
                              </span>
                            </td>
                            <td>{doc.pageCount || 1}</td>
                            <td>
                              <span className={`edis-status-badge ${doc.status}`}>
                                {doc.status === 'processing' && '⏳ Processing'}
                                {doc.status === 'completed' && '✅ Ready'}
                                {doc.status === 'failed' && '❌ Error'}
                              </span>
                            </td>
                            <td>
                              <div className="edis-action-icons">
                                {doc.status === 'completed' && (
                                  <button className="edis-action-btn view-summary" onClick={() => setSelectedDoc(doc)}>
                                    View Outline
                                  </button>
                                )}
                                <button className="edis-action-btn delete" onClick={(e) => deleteDocument(doc.id, e)}>
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* ACTION: DOCUMENT SUMMARY DETAIL DRAWER */}
          {/* ============================================================ */}
          {activeTab === 'docs' && selectedDoc && (
            <div className="edis-card" style={{ padding: '30px' }}>
              <div className="edis-summary-header">
                <div className="edis-summary-header-desc">
                  <span className={`edis-doc-type-tag ${selectedDoc.category}`} style={{ marginBottom: '8px' }}>
                    {selectedDoc.category}
                  </span>
                  <h3>{selectedDoc.name}</h3>
                </div>
                <button className="edis-btn edis-btn-secondary" onClick={() => setSelectedDoc(null)}>
                  ⬅️ Back to Library
                </button>
              </div>

              {/* Tab Selector inside document details */}
              <div className="edis-summary-tab-nav">
                <button
                  className={`edis-tab-btn ${summaryTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setSummaryTab('overview')}
                >
                  Overview & Chunks
                </button>
                <button
                  className={`edis-tab-btn ${summaryTab === 'obligations' ? 'active' : ''}`}
                  onClick={() => setSummaryTab('obligations')}
                >
                  Executive Report
                </button>
                <button
                  className={`edis-tab-btn ${summaryTab === 'hazard' ? 'active' : ''}`}
                  onClick={() => setSummaryTab('hazard')}
                >
                  Risk Matrix
                </button>
              </div>

              {/* Tab Screen 1: Overview */}
              {summaryTab === 'overview' && (
                <div className="edis-markdown-view">
                  <blockquote>
                    <strong>One-Line Purpose:</strong> {selectedDoc.summary?.oneLine || 'Background summarizer job is active...'}
                  </blockquote>

                  <h3 style={{ marginTop: '24px' }}>Logical Paragraph Sections ({selectedDoc.summary?.sections?.length || 0})</h3>
                  <div className="edis-section-summaries-list">
                    {selectedDoc.summary?.sections?.map((sec, i) => (
                      <div className="edis-section-item" key={i}>
                        <div className="edis-section-title">{sec.section}</div>
                        <div className="edis-section-summary-text">{sec.summary}</div>
                      </div>
                    )) || <p>Summarie files processing...</p>}
                  </div>
                </div>
              )}

              {/* Tab Screen 2: Executive Report */}
              {summaryTab === 'obligations' && (
                <div className="edis-markdown-view">
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {selectedDoc.summary?.executive || 'Executive reports processing...'}
                  </div>
                </div>
              )}

              {/* Tab Screen 3: Risk Matrix */}
              {summaryTab === 'hazard' && (
                <div className="edis-markdown-view">
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {selectedDoc.summary?.risks || 'Hazard evaluations processing...'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 2: RAG EXPLORER & CHAT PANEL */}
          {/* ============================================================ */}
          {activeTab === 'chat' && (
            <div className="edis-chat-layout">
              {/* Left Column: Chat Workspace */}
              <div className="edis-chat-workspace">
                <div className="edis-chat-header-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px' }}>💬</span>
                    <span style={{ fontWeight: 600 }}>Active RAG Conversation</span>
                  </div>
                  <div className="edis-citation-alert-banner">
                    {config.mockMode ? '💡 Citations enabled: Click citations to open Source Drawer.' : '⚡ Gemini grounding active with page indices.'}
                  </div>
                </div>

                {/* Messages Room */}
                <div className="edis-chat-window">
                  {chatMessages.length === 0 ? (
                    <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <p style={{ fontSize: '32px', marginBottom: '8px' }}>💬</p>
                      <p style={{ fontWeight: '500', color: 'white' }}>Ask anything about your documents</p>
                      <p style={{ fontSize: '13px', marginTop: '4px' }}>
                        Type a question. The AI will query document chunks and answer with citations.
                      </p>
                    </div>
                  ) : (
                    chatMessages.map((msg, i) => (
                      <div className={`edis-chat-bubble ${msg.role}`} key={msg.id || i}>
                        <div className="edis-bubble-body">
                          {msg.role === 'assistant' ? (
                            renderTextWithCitations(msg.content, msg.citations)
                          ) : (
                            msg.content
                          )}
                        </div>
                        <span className="edis-bubble-timestamp">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))
                  )}
                  {isSendingMessage && (
                    <div className="edis-chat-bubble assistant">
                      <div className="edis-bubble-body">
                        <div className="edis-typing-indicator">
                          <span></span><span></span><span></span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Input form */}
                <div className="edis-chat-input-area">
                  <form className="edis-chat-input-form" onSubmit={sendChatMessage}>
                    <input
                      type="text"
                      className="edis-text-input"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="e.g. What is the contract notice period for terminating supplier agreement?"
                      disabled={isSendingMessage}
                    />
                    <button type="submit" className="edis-btn" disabled={isSendingMessage || !chatInput.trim()}>
                      Send Query ⚡
                    </button>
                  </form>
                </div>
              </div>

              {/* Right Column: Grounding Filters */}
              <div className="edis-chat-filters-sidebar">
                <div className="edis-card" style={{ padding: '20px' }}>
                  <div className="edis-card-title" style={{ fontSize: '14px', marginBottom: '14px' }}>
                    🔍 Search Target Filter
                  </div>
                  
                  <div className="edis-filter-group" style={{ marginBottom: '15px' }}>
                    <label>By Category:</label>
                    <select
                      className="edis-select"
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                    >
                      <option value="">All Categories</option>
                      <option value="policy">Policies Only</option>
                      <option value="contract">Contracts Only</option>
                      <option value="report">Reports Only</option>
                    </select>
                  </div>

                  <div className="edis-filter-group">
                    <label>Focus Document:</label>
                    <select
                      className="edis-select"
                      value={filterDocId}
                      onChange={(e) => setFilterDocId(e.target.value)}
                    >
                      <option value="">Search Entire Corpus</option>
                      {documents.filter(d => d.status === 'completed').map(doc => (
                        <option key={doc.id} value={doc.id}>
                          {doc.name.substring(0, 20)}...
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    className="edis-btn edis-btn-secondary"
                    style={{ width: '100%', marginTop: '20px', fontSize: '12px', padding: '8px' }}
                    onClick={initializeChatSession}
                  >
                    🧹 Clear Chat Stream
                  </button>
                </div>
              </div>

              {/* CITATION DRAWER PANEL ACTION */}
              {activeCitation && (
                <div className="edis-citation-drawer">
                  <div className="edis-drawer-header">
                    <h4>Grounding Resource Detail</h4>
                    <button className="edis-drawer-close-btn" onClick={() => setActiveCitation(null)}>
                      ✖️
                    </button>
                  </div>
                  <div className="edis-drawer-body">
                    <div className="edis-drawer-meta">
                      <div className="edis-drawer-meta-row">
                        <strong>Source File: </strong> <span>{activeCitation.filename}</span>
                      </div>
                      <div className="edis-drawer-meta-row">
                        <strong>Location: </strong> <span>Page {activeCitation.page}</span>
                      </div>
                    </div>
                    <p style={{ fontWeight: '600', color: 'white', marginBottom: '8px' }}>Matched Context Snippet:</p>
                    <div className="edis-drawer-snippet">
                      "{activeCitation.text}"
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 3: AGENT ANALYST WORKSPACE */}
          {/* ============================================================ */}
          {activeTab === 'agent' && (
            <div className="edis-agent-layout">
              {/* Left Column: Instruction Entry */}
              <div className="edis-agent-setup-panel">
                <div className="edis-card">
                  <div className="edis-card-title">🤖 Command the Analyst Agent</div>
                  
                  <div className="edis-form-item" style={{ marginBottom: '16px' }}>
                    <label>Complex Analytical Directive:</label>
                    <input
                      type="text"
                      className="edis-text-input"
                      value={agentInstruction}
                      onChange={(e) => setAgentInstruction(e.target.value)}
                      placeholder="e.g. Compare auto-renewal penalty and notice terms across all contracts"
                      disabled={isAgentRunning}
                      style={{ fontSize: '13.5px' }}
                    />
                  </div>

                  <button
                    className="edis-btn"
                    style={{ width: '100%' }}
                    onClick={triggerAgentInstruction}
                    disabled={isAgentRunning || !agentInstruction.trim()}
                  >
                    {isAgentRunning ? '🧠 Orchestrating Tools...' : 'Execute Loop Plan ⚙️'}
                  </button>
                </div>

                <div className="edis-agent-instruction-suggestions">
                  <span>💡 Sample Queries to Try:</span>
                  <button
                    className="edis-suggestion-chip"
                    onClick={() => setAgentInstruction('Compare renewal and liability parameters across contracts')}
                    disabled={isAgentRunning}
                  >
                    Compare renewal and liability parameters across contracts
                  </button>
                  <button
                    className="edis-suggestion-chip"
                    onClick={() => setAgentInstruction('Find all policy files and extract active notification requirements')}
                    disabled={isAgentRunning}
                  >
                    Find all policy files and extract active notification requirements
                  </button>
                </div>
              </div>

              {/* Right Column: Trace Logs Timeline */}
              <div className="edis-card" style={{ display: 'flex', flexDirection: 'column', height: '530px' }}>
                <div className="edis-card-title" style={{ justifyContent: 'space-between' }}>
                  <span>📋 Live Trace & Synthesis</span>
                  {isAgentRunning && <span className="edis-analyzing-label" style={{ fontSize: '11px', fontWeight: 700 }}>● ANALYZING...</span>}
                </div>

                {!runningAgentTask ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: '32px' }}>⚙️</span>
                    <p style={{ fontWeight: 600, marginTop: '8px' }}>Analyst Console Offline</p>
                    <p style={{ fontSize: '12px' }}>Submit an analytical command to observe tool execution logs.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                    {/* Log Terminal Window */}
                    <div className="edis-agent-console-log" style={{ flexGrow: 1, marginBottom: '20px' }}>
                      {runningAgentTask.logs.map((log, index) => (
                        <div className="edis-trace-element" key={index}>
                          <div className="edis-trace-icon-col">
                            <div className={`edis-trace-circle ${log.type}`}>
                              {log.type === 'thought' && '🧠'}
                              {log.type === 'tool_call' && '🛠️'}
                              {log.type === 'observation' && '👁️'}
                            </div>
                            {index < runningAgentTask.logs.length - 1 && <div className="edis-trace-line" />}
                          </div>
                          <div className="edis-trace-details-col">
                            <div className="edis-trace-head">
                              <span className="title">{log.title}</span>
                              <span className="time">{new Date(log.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="edis-trace-body">{log.detail}</div>
                          </div>
                        </div>
                      ))}
                      <div ref={agentLogBottomRef} />
                    </div>

                    {/* Final Answer synthezis card */}
                    {runningAgentTask.status === 'completed' && (
                      <div
                        className="edis-markdown-view"
                        style={{
                          maxHeight: '160px',
                          overflowY: 'auto',
                          background: 'rgba(16, 185, 129, 0.05)',
                          border: '1px solid rgba(16, 185, 129, 0.2)',
                          padding: '16px',
                          borderRadius: '8px'
                        }}
                      >
                        <div style={{ whiteSpace: 'pre-wrap' }}>
                          {runningAgentTask.finalAnswer}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 4: APP CONFIGURATION PANEL */}
          {/* ============================================================ */}
          {activeTab === 'config' && (
            <div className="edis-config-grid">
              <div className="edis-card edis-config-form">
                <div className="edis-card-title">⚙️ API Keys & Grounding Settings</div>

                {showConfigAlert && (
                  <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-color)', padding: '12px', fontSize: '13px', borderRadius: '6px', color: 'var(--success-color)' }}>
                    💾 Settings updated and saved successfully!
                  </div>
                )}

                <div className="edis-toggle-item">
                  <div className="edis-toggle-label">
                    <h4>Sandbox Mode (Mock Data)</h4>
                    <p>Run full RAG chat & agent visual logs completely offline.</p>
                  </div>
                  <label className="edis-switch">
                    <input
                      type="checkbox"
                      checked={config.mockMode}
                      onChange={(e) => updateConfigVal({ mockMode: e.target.checked })}
                    />
                    <span className="edis-slider"></span>
                  </label>
                </div>

                <div className="edis-form-item">
                  <label>Google Gemini API Key:</label>
                  <input
                    type="password"
                    value={config.geminiApiKey}
                    onChange={(e) => updateConfigVal({ geminiApiKey: e.target.value })}
                    placeholder="Enter your GEMINI_API_KEY..."
                  />
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Note: If Sandbox/Mock mode is OFF and Key is configured, queries will fetch Google's live LLM generation and compute actual Voyage/Gemini embeddings. 
                  </p>
                </div>
              </div>

              <div className="edis-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center' }}>
                <div className="edis-card-title" style={{ color: 'var(--danger-color)' }}>
                  ⚠️ Administrative Resets
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  This will physically delete extracted document files, clear memory, reset chat logs, and wipe saved configurables. Use this for fresh evaluations.
                </p>
                <button className="edis-btn" style={{ background: 'var(--danger-color)', alignSelf: 'start' }} onClick={triggerSystemReset}>
                  Full System Reset 🧹
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

export default App;
