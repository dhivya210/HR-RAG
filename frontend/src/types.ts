export type RailCheck = {
  status: 'PASSED' | 'BLOCKED'
  reason: string | null
}

export type RetrievedChunk = {
  title: string
  text: string
  score: number
}

export type SecurityTrace = {
  input: RailCheck
  output: RailCheck
  retrieved_chunks: RetrievedChunk[]
  latency_ms: number
  tokens: { input: number; output: number }
  engine: string
}

export type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
  trace?: SecurityTrace
  createdAt: Date
}
