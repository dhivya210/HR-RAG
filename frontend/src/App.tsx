import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileCheck2,
  LockKeyhole,
  Menu,
  Moon,
  Plus,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sun,
  UserRound,
  X,
  Zap,
} from 'lucide-react'
import type { ChatMessage, SecurityTrace } from './types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const suggestions = [
  { icon: Clock3, title: 'Paid time off', prompt: 'How many PTO days do I get each year?' },
  { icon: Activity, title: 'Sick leave', prompt: 'What is the sick leave policy?' },
  { icon: ArrowDownToLine, title: 'Travel meals', prompt: 'What is the meal allowance for business travel?' },
]

const welcomeMessage: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Hi Alex. I’m your Northstar HR handbook assistant. Ask me about leave, benefits, or employee policies.',
  createdAt: new Date(),
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function GuardrailBadge({ status, reason }: { status: 'PASSED' | 'BLOCKED'; reason?: string | null }) {
  return (
    <span className={`guardrail-badge ${status.toLowerCase()}`} title={reason ?? status}>
      {status === 'PASSED' ? <Check size={12} /> : <ShieldAlert size={12} />}
      {status}
    </span>
  )
}

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const [darkMode, setDarkMode] = useState(false)
  const [auditOpen, setAuditOpen] = useState(true)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [activeTrace, setActiveTrace] = useState<SecurityTrace | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
  }, [darkMode])

  useEffect(() => {
    void fetch(`${API_URL}/health`)
      .then((response) => setApiOnline(response.ok))
      .catch(() => setApiOnline(false))
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  function resetConversation() {
    setMessages([{ ...welcomeMessage, id: makeId(), createdAt: new Date() }])
    setActiveTrace(null)
    setDraft('')
    textareaRef.current?.focus()
  }

  async function sendMessage(value = draft) {
    const text = value.trim()
    if (!text || sending) return
    const userMessage: ChatMessage = { id: makeId(), role: 'user', content: text, createdAt: new Date() }
    setMessages((current) => [...current, userMessage])
    setDraft('')
    setSending(true)
    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: 'acme-demo-session' }),
      })
      if (!response.ok) {
        const detail = await response.json().catch(() => null)
        throw new Error(detail?.detail ?? `Request failed (${response.status})`)
      }
      const result = (await response.json()) as { answer: string; security: SecurityTrace }
      const assistantMessage: ChatMessage = {
        id: makeId(), role: 'assistant', content: result.answer, trace: result.security, createdAt: new Date(),
      }
      setMessages((current) => [...current, assistantMessage])
      setActiveTrace(result.security)
      setApiOnline(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not reach the HR assistant.'
      setApiOnline(false)
      setMessages((current) => [...current, {
        id: makeId(), role: 'assistant', content: `The HR API is unavailable. ${message} Start the FastAPI service and try again.`, createdAt: new Date(),
      }])
    } finally {
      setSending(false)
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage()
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  const latestMessage = [...messages].reverse().find((message) => message.trace)
  const trace = activeTrace ?? latestMessage?.trace ?? null

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileSidebar ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><span>N</span><i /></div>
          <div className="brand-copy"><strong>Northstar</strong><span>PEOPLE OPERATIONS</span></div>
          <button className="icon-button mobile-close" aria-label="Close navigation" onClick={() => setMobileSidebar(false)}><X size={17} /></button>
        </div>

        <button className="workspace-switcher">
          <span className="workspace-avatar">N</span>
          <span className="workspace-label"><strong>Northstar</strong><small>Employee workspace</small></span>
          <ChevronDown size={15} />
        </button>

        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <a className="nav-item active" href="#assistant"><span className="nav-icon"><Zap size={16} /></span>HR assistant <span className="nav-live" /></a>
          <a className="nav-item" href="#handbook"><span className="nav-icon"><BookOpen size={16} /></span>Handbook library</a>
          <a className="nav-item" href="#audit"><span className="nav-icon"><Activity size={16} /></span>Security activity <span className="nav-count">1</span></a>
        </nav>

        <div className="sidebar-section-heading"><span>KNOWLEDGE BASE</span><button aria-label="Search documents"><Search size={14} /></button></div>
        <div className="document-item">
          <div className="document-icon"><FileCheck2 size={16} /></div>
          <div className="document-copy"><strong>HR Handbook 2026</strong><span><i className="status-dot" /> Loaded · 6 sections</span></div>
          <Check size={14} className="document-check" />
        </div>
        <div className="sync-note"><span className="sync-mark"><CheckCheck size={12} /></span>Synced just now</div>

        <div className="sidebar-policy">
          <div className="policy-header"><ShieldCheck size={15} /><span>ACTIVE POLICIES</span><span className="policy-count">4</span></div>
          <div className="policy-row"><span className="policy-bullet green" />Prompt injection <span>On</span></div>
          <div className="policy-row"><span className="policy-bullet green" />Topic boundaries <span>On</span></div>
          <div className="policy-row"><span className="policy-bullet green" />Sensitive data <span>On</span></div>
          <div className="policy-row"><span className="policy-bullet green" />Output screening <span>On</span></div>
        </div>

        <div className="sidebar-footer">
          <div className="user-profile"><div className="profile-avatar">AL</div><div className="profile-copy"><strong>Alex Lin</strong><span>People team</span></div><button className="icon-button" aria-label="Profile options"><Menu size={17} /></button></div>
          <div className="privacy-note"><LockKeyhole size={12} /> Your questions stay private</div>
        </div>
      </aside>

      {mobileSidebar && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileSidebar(false)} />}

      <main className="main-panel" id="assistant">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileSidebar(true)}><Menu size={18} /></button><div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>HR assistant</strong></div><span className="private-pill"><LockKeyhole size={11} /> PRIVATE</span></div>
          <div className="topbar-actions"><div className={`connection-status ${apiOnline === false ? 'offline' : ''}`}><span className="connection-dot" />{apiOnline === null ? 'Connecting' : apiOnline ? 'System operational' : 'API offline'}</div><button className="icon-button theme-toggle" aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button><button className={`audit-toggle ${auditOpen ? 'selected' : ''}`} onClick={() => setAuditOpen((value) => !value)}><Activity size={15} /> <span>Audit trace</span><span className="toggle-dot" /></button></div>
        </header>

        <div className={`workspace ${auditOpen ? '' : 'audit-hidden'}`}>
          <section className="conversation-column">
            <div className="conversation-heading"><div><div className="eyebrow"><span className="eyebrow-line" />NORTHSTAR PEOPLE ASSISTANT</div><h1>How can I help?</h1><p>Answers grounded in your employee handbook, with privacy built in.</p></div><button className="new-chat-button" onClick={resetConversation}><Plus size={15} /><span>New chat</span></button></div>

            <div className="messages-scroll" ref={scrollRef}>
              <div className="date-divider"><span />TODAY<span /></div>
              <div className="message-list">
                {messages.map((message) => (
                  <article key={message.id} className={`message-row ${message.role}`}>
                    {message.role === 'assistant' ? <div className="assistant-avatar"><span>N</span><i /></div> : null}
                    <div className="message-body">
                      <div className="message-meta"><strong>{message.role === 'assistant' ? 'Northstar Assistant' : 'You'}</strong><time>{formatTime(message.createdAt)}</time>{message.trace && <GuardrailBadge status={message.trace.input.status === 'BLOCKED' || message.trace.output.status === 'BLOCKED' ? 'BLOCKED' : 'PASSED'} />}</div>
                      <div className={`message-bubble ${message.role}`}>
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                      {message.trace && <div className="message-source"><BookOpen size={12} /><span>{message.trace.retrieved_chunks.length ? `Grounded in ${message.trace.retrieved_chunks.length} handbook ${message.trace.retrieved_chunks.length === 1 ? 'section' : 'sections'}` : 'No handbook context shared'}</span><button onClick={() => setActiveTrace(message.trace!)}>View trace <ArrowUpRight size={11} /></button></div>}
                    </div>
                    {message.role === 'user' ? <div className="user-avatar"><UserRound size={15} /></div> : null}
                  </article>
                ))}
                {sending && <div className="message-row assistant"><div className="assistant-avatar"><span>N</span><i /></div><div className="message-body"><div className="message-meta"><strong>Northstar Assistant</strong><span className="thinking-label">Checking handbook</span></div><div className="typing-bubble"><span /><span /><span /></div></div></div>}
              </div>
            </div>

            <div className="composer-area">
              {messages.length === 1 && <div className="suggestion-row">{suggestions.map(({ icon: Icon, title, prompt }) => <button className="suggestion-chip" key={title} onClick={() => void sendMessage(prompt)}><Icon size={14} /><span>{title}</span><ArrowUpRight size={12} className="suggestion-arrow" /></button>)}</div>}
              <form className="composer" onSubmit={onSubmit}>
                <textarea ref={textareaRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder="Ask a question about HR or benefits..." rows={1} maxLength={4000} aria-label="Message the HR assistant" />
                <div className="composer-bottom"><div className="composer-hint"><span>HR handbook</span><span className="hint-separator">·</span><span>Shift + Enter for a new line</span></div><div className="composer-actions"><span className="char-count">{draft.length > 0 ? `${draft.length}/4000` : <><Shield size={12} /> Guardrails on</>}</span><button className="send-button" type="submit" disabled={!draft.trim() || sending} aria-label="Send message"><Send size={15} /></button></div></div>
              </form>
              <div className="disclaimer"><LockKeyhole size={11} /> Responses are generated from the HR handbook. For personal matters, contact HR directly.</div>
            </div>
          </section>

          {auditOpen && <aside className="audit-panel" id="audit">
            <div className="audit-header"><div><div className="audit-kicker"><span className="pulse-dot" />LIVE SECURITY</div><h2>Audit trace</h2></div><button className="icon-button audit-close" aria-label="Close audit trace" onClick={() => setAuditOpen(false)}><X size={16} /></button></div>
            <div className="trace-session"><span className="session-indicator"><Activity size={14} /></span><span><strong>Current session</strong><small>Local processing · Session protected</small></span><ChevronDown size={14} /></div>
            {!trace ? <div className="trace-empty"><div className="trace-empty-icon"><ShieldCheck size={20} /></div><strong>Ready to inspect</strong><span>Guardrail and retrieval details appear here after each message.</span></div> : <>
              <div className="trace-section"><div className="section-title"><span>INPUT GUARDRAIL</span><span className="section-index">01</span></div><div className={`trace-check ${trace.input.status.toLowerCase()}`}><div className="trace-check-icon">{trace.input.status === 'PASSED' ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}</div><div className="trace-check-copy"><strong>{trace.input.status === 'PASSED' ? 'Input passed' : 'Input blocked'}</strong><span>{trace.input.reason ?? 'No threats detected'}</span></div><GuardrailBadge status={trace.input.status} /></div></div>
              <div className="trace-section retrieval-section"><div className="section-title"><span>CONTEXT RETRIEVAL</span><span className="section-index">02</span></div><div className="retrieval-caption"><span><span className="retrieval-dot" /> Chroma vector search</span><span>{trace.retrieved_chunks.length} chunks</span></div>{trace.retrieved_chunks.length ? <div className="chunk-list">{trace.retrieved_chunks.slice(0, 2).map((chunk, index) => <div className="chunk-card" key={`${chunk.title}-${index}`}><div className="chunk-card-top"><div className="chunk-file-icon"><BookOpen size={13} /></div><span>{chunk.title}</span><span className="chunk-score">{Math.round(chunk.score * 100)}%</span></div><p>{chunk.text}</p></div>)}</div> : <div className="no-context"><Search size={14} /><span>No safe handbook chunks retrieved</span></div>}</div>
              <div className="trace-section"><div className="section-title"><span>OUTPUT GUARDRAIL</span><span className="section-index">03</span></div><div className={`trace-check ${trace.output.status.toLowerCase()}`}><div className="trace-check-icon">{trace.output.status === 'PASSED' ? <CheckCheck size={16} /> : <ShieldAlert size={16} />}</div><div className="trace-check-copy"><strong>{trace.output.status === 'PASSED' ? 'Response cleared' : 'Response blocked'}</strong><span>{trace.output.reason ?? 'Sensitive data screening passed'}</span></div><GuardrailBadge status={trace.output.status} /></div></div>
              <div className="metrics-section"><div className="section-title"><span>TURN METRICS</span><span className="section-index">04</span></div><div className="metric-grid"><div className="metric-cell"><span>LATENCY</span><strong>{trace.latency_ms}<small>ms</small></strong></div><div className="metric-cell"><span>TOKEN EST.</span><strong>{trace.tokens.input + trace.tokens.output}<small> total</small></strong></div></div><div className="metric-engine"><Zap size={12} /><span>{trace.engine}</span></div></div>
            </>}
            <div className="audit-footer"><div className="audit-footer-icon"><LockKeyhole size={13} /></div><div><strong>Privacy first</strong><span>Confidential HR data is excluded from retrieval.</span></div><CircleHelp size={15} className="help-icon" /></div>
          </aside>}
        </div>
        <footer className="bottom-bar"><span><span className="bottom-brand-mark">N</span>NORTHSTAR HR PORTAL</span><span>SECURE KNOWLEDGE ASSISTANT <span className="footer-separator">·</span> 2026</span><button onClick={() => setAuditOpen((value) => !value)}><Activity size={13} /> {auditOpen ? 'Hide trace' : 'Show trace'}</button></footer>
      </main>
    </div>
  )
}

export default App
