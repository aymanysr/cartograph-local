// Moved verbatim from cartograph.html (split preserved original file order).
// preset-repos: see cartograph.html; loads as a classic script after the lib/ files.
    const PRESET_REPOS = {
      'cartograph-saas': {
        name: 'cartograph-nextjs-saas',
        description: 'Full-stack Codebase Intelligence SaaS (Next.js App Router, TS-Morph Parser, Supabase, Clerk Auth, Graph Agent & LangSmith Evals)',
        files: [
          {
            path: 'src/types/graph.ts',
            content: `export interface CodeNode {
  id: string;
  path: string;
  layer: 'core' | 'parser' | 'agent' | 'api' | 'ui';
  exports: string[];
  loc: number;
}

export interface DependencyEdge {
  source: string;
  target: string;
  specifier: string;
  line: number;
}

export interface BlastRadiusResult {
  targetFile: string;
  hop1Direct: string[];
  hop2Transitive: string[];
}`
          },
          {
            path: 'src/lib/db/supabase.ts',
            content: `import { CodeNode, DependencyEdge } from '@/types/graph';

// Core database & multi-tenant persistence client
// WARNING: 11 modules across 2 hops depend on this file!
export const dbClient = {
  from(table: string) {
    return {
      select: async () => [],
      upsert: async (rows: unknown) => ({ data: rows, error: null }),
      eq: (col: string, val: string) => ({ single: async () => ({ id: val }) })
    };
  }
};

export async function saveRepositoryGraph(orgId: string, repoId: string, nodes: CodeNode[], edges: DependencyEdge[]) {
  return dbClient.from('repo_graphs').upsert({ orgId, repoId, nodes, edges });
}

export async function loadRepositoryGraph(orgId: string, repoId: string) {
  return dbClient.from('repo_graphs').eq('repo_id', repoId);
}

export async function recordAuditEvent(action: string, orgId: string) {
  return dbClient.from('audit_logs').upsert({ action, orgId, timestamp: Date.now() });
}`
          },
          {
            path: 'src/middleware/auth-guard.ts',
            content: `import { dbClient, recordAuditEvent } from '@/lib/db/supabase';

export interface TenantSession {
  userId: string;
  orgId: string;
  role: 'admin' | 'member';
}

// Identity is verified from the Clerk session token claim
export async function requireAuth(tokenHeader?: string): Promise<TenantSession> {
  const orgId = tokenHeader || 'org_cartograph_local';
  await recordAuditEvent('auth.verified', orgId);
  return { userId: 'usr_local_dev', orgId, role: 'admin' };
}

export async function assertRepoOwnership(orgId: string, repoId: string): Promise<boolean> {
  const record = await dbClient.from('repositories').eq('id', repoId);
  return Boolean(record);
}`
          },
          {
            path: 'src/parser/import-resolver.ts',
            content: `import { DependencyEdge } from '@/types/graph';

export function resolveImportSpecifier(fromFile: string, rawSpecifier: string, knownPaths: Set<string>): string | null {
  const clean = rawSpecifier.replace(/^['"]|['"]$/g, '');
  const candidates: string[] = [];

  if (clean.startsWith('@/')) {
    candidates.push('src/' + clean.slice(2));
  } else if (clean.startsWith('./') || clean.startsWith('../')) {
    const parts = fromFile.split('/').slice(0, -1);
    for (const seg of clean.split('/')) {
      if (seg === '.' || !seg) continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    candidates.push(parts.join('/'));
  }

  const exts = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];
  for (const base of candidates) {
    for (const ext of exts) {
      if (knownPaths.has(base + ext)) return base + ext;
    }
  }
  return null;
}

export function buildEdgeRecord(source: string, target: string, specifier: string, line: number): DependencyEdge {
  return { source, target, specifier, line };
}`
          },
          {
            path: 'src/parser/ast-engine.ts',
            content: `import { CodeNode, DependencyEdge } from '@/types/graph';
import { resolveImportSpecifier, buildEdgeRecord } from '@/parser/import-resolver';
import { saveRepositoryGraph } from '@/lib/db/supabase';

export function parseSourceFiles(files: Array<{ path: string; content: string }>) {
  const knownPaths = new Set(files.map(f => f.path));
  const nodes: CodeNode[] = [];
  const edges: DependencyEdge[] = [];

  for (const file of files) {
    const lines = file.content.split('\\n');
    lines.forEach((lineText, idx) => {
      const m = lineText.match(/from\\s+['"]([^'"]+)['"]/);
      if (m) {
        const resolved = resolveImportSpecifier(file.path, m[1], knownPaths);
        if (resolved) edges.push(buildEdgeRecord(file.path, resolved, m[1], idx + 1));
      }
    });
    nodes.push({ id: file.path, path: file.path, layer: 'parser', exports: [], loc: lines.length });
  }
  return { nodes, edges };
}

export async function parseAndPersistRepo(orgId: string, repoId: string, files: Array<{ path: string; content: string }>) {
  const { nodes, edges } = parseSourceFiles(files);
  await saveRepositoryGraph(orgId, repoId, nodes, edges);
  return { nodes, edges };
}`
          },
          {
            path: 'src/parser/blast-radius.ts',
            content: `import { DependencyEdge, BlastRadiusResult } from '@/types/graph';
import { loadRepositoryGraph } from '@/lib/db/supabase';

export function computeTwoHopBlastRadius(targetFile: string, edges: DependencyEdge[]): BlastRadiusResult {
  const hop1 = edges
    .filter(e => e.target === targetFile && e.source !== targetFile)
    .map(e => e.source);
  const hop1Set = new Set(hop1);

  const hop2: string[] = [];
  for (const e of edges) {
    if (hop1Set.has(e.target) && e.source !== targetFile && !hop1Set.has(e.source)) {
      if (!hop2.includes(e.source)) hop2.push(e.source);
    }
  }
  return { targetFile, hop1Direct: hop1, hop2Transitive: hop2 };
}

export async function fetchFileBlastRadius(orgId: string, repoId: string, targetFile: string) {
  await loadRepositoryGraph(orgId, repoId);
  return computeTwoHopBlastRadius(targetFile, []);
}`
          },
          {
            path: 'src/agent/tools.ts',
            content: `import { loadRepositoryGraph } from '@/lib/db/supabase';
import { computeTwoHopBlastRadius } from '@/parser/blast-radius';

export const AGENT_TOOLS = [
  'find_entry_points',
  'search_symbols',
  'get_file_ast',
  'walk_dependents',
  'trace_dependency_path',
  'detect_cycles_and_hubs'
] as const;

export async function executeGraphTool(orgId: string, repoId: string, toolName: string, args: Record<string, string>) {
  await loadRepositoryGraph(orgId, repoId);
  if (toolName === 'walk_dependents') {
    return computeTwoHopBlastRadius(args.path, []);
  }
  return { toolName, verified: true, args };
}`
          },
          {
            path: 'src/agent/module-explainer.ts',
            content: `import { computeTwoHopBlastRadius } from '@/parser/blast-radius';
import { loadRepositoryGraph } from '@/lib/db/supabase';

// Strictly grounds module explanations to parsed 1-hop neighbors
export async function generateGroundedExplanation(orgId: string, repoId: string, filePath: string) {
  await loadRepositoryGraph(orgId, repoId);
  const blast = computeTwoHopBlastRadius(filePath, []);
  return {
    filePath,
    directDependents: blast.hop1Direct,
    transitiveDependents: blast.hop2Transitive,
    grounded: true
  };
}`
          },
          {
            path: 'src/agent/graph-walker.ts',
            content: `import { executeGraphTool, AGENT_TOOLS } from '@/agent/tools';
import { generateGroundedExplanation } from '@/agent/module-explainer';

export async function runAgentGraphWalk(orgId: string, repoId: string, question: string) {
  const steps = [];
  const searchStep = await executeGraphTool(orgId, repoId, AGENT_TOOLS[1], { query: question });
  steps.push(searchStep);
  const explanation = await generateGroundedExplanation(orgId, repoId, 'src/lib/db/supabase.ts');
  return { question, steps, explanation };
}`
          },
          {
            path: 'src/evals/groundedness-scorer.ts',
            content: `import { runAgentGraphWalk } from '@/agent/graph-walker';
import { computeTwoHopBlastRadius } from '@/parser/blast-radius';

export async function evaluateAgentGroundedness(orgId: string, repoId: string, question: string, citedFiles: string[], validFiles: Set<string>) {
  await runAgentGraphWalk(orgId, repoId, question);
  const hallucinated = citedFiles.filter(f => !validFiles.has(f));
  const blast = computeTwoHopBlastRadius('src/lib/db/supabase.ts', []);
  return {
    citationAccuracy: citedFiles.length ? (citedFiles.length - hallucinated.length) / citedFiles.length : 1,
    hallucinatedFiles: hallucinated,
    verifiedHopCount: blast.hop1Direct.length + blast.hop2Transitive.length
  };
}`
          },
          {
            path: 'src/app/api/parse/route.ts',
            content: `import { requireAuth, assertRepoOwnership } from '@/middleware/auth-guard';
import { parseAndPersistRepo } from '@/parser/ast-engine';

export async function POST(requestBody: { repoId: string; files: Array<{ path: string; content: string }> }) {
  const session = await requireAuth();
  await assertRepoOwnership(session.orgId, requestBody.repoId);
  return parseAndPersistRepo(session.orgId, requestBody.repoId, requestBody.files);
}`
          },
          {
            path: 'src/app/api/agent/route.ts',
            content: `import { requireAuth } from '@/middleware/auth-guard';
import { runAgentGraphWalk } from '@/agent/graph-walker';
import { evaluateAgentGroundedness } from '@/evals/groundedness-scorer';

export async function POST(requestBody: { repoId: string; question: string }) {
  const session = await requireAuth();
  const result = await runAgentGraphWalk(session.orgId, requestBody.repoId, requestBody.question);
  const evalScore = await evaluateAgentGroundedness(session.orgId, requestBody.repoId, requestBody.question, [], new Set());
  return { result, evalScore };
}`
          },
          {
            path: 'src/hooks/useRepoGraph.ts',
            content: `import { CodeNode, DependencyEdge } from '@/types/graph';
import { computeTwoHopBlastRadius } from '@/parser/blast-radius';
import { POST as triggerParseRoute } from '@/app/api/parse/route';

export function useRepoGraph(nodes: CodeNode[], edges: DependencyEdge[], selectedFile: string) {
  const impact = computeTwoHopBlastRadius(selectedFile, edges);
  return { nodes, edges, impact, triggerParseRoute };
}`
          },
          {
            path: 'src/components/GraphCanvas.tsx',
            content: `import { useRepoGraph } from '@/hooks/useRepoGraph';
import { CodeNode, DependencyEdge } from '@/types/graph';

export function GraphCanvas(props: { nodes: CodeNode[]; edges: DependencyEdge[]; selected: string }) {
  const { impact } = useRepoGraph(props.nodes, props.edges, props.selected);
  return {
    component: 'GraphCanvas',
    highlightedHop1: impact.hop1Direct,
    highlightedHop2: impact.hop2Transitive
  };
}`
          },
          {
            path: 'src/components/BlastRadiusPanel.tsx',
            content: `import { useRepoGraph } from '@/hooks/useRepoGraph';
import { generateGroundedExplanation } from '@/agent/module-explainer';

export async function BlastRadiusPanel(selectedFile: string) {
  const state = useRepoGraph([], [], selectedFile);
  const explanation = await generateGroundedExplanation('org_local', 'repo_1', selectedFile);
  return { state, explanation };
}`
          },
          {
            path: 'src/app/page.tsx',
            content: `import { GraphCanvas } from '@/components/GraphCanvas';
import { BlastRadiusPanel } from '@/components/BlastRadiusPanel';
import { POST as callAgentEndpoint } from '@/app/api/agent/route';

export default async function CartographWorkspacePage() {
  const canvas = GraphCanvas({ nodes: [], edges: [], selected: 'src/lib/db/supabase.ts' });
  const inspector = await BlastRadiusPanel('src/lib/db/supabase.ts');
  return { canvas, inspector, callAgentEndpoint };
}`
          }
        ]
      },

      'fintech-ledger': {
        name: 'fintech-checkout-service',
        description: 'High-throughput TypeScript Payment & Ledger Service (Includes an intentional circular dependency between Settlement & Fraud Check)',
        files: [
          {
            path: 'src/config/env.ts',
            content: `export const LEDGER_CONFIG = {
  currency: 'USD',
  maxRetryCount: 3,
  webhookSecret: 'whsec_local_verified'
};`
          },
          {
            path: 'src/db/prisma-ledger.ts',
            content: `import { LEDGER_CONFIG } from '@/config/env';

export const ledgerDb = {
  currency: LEDGER_CONFIG.currency,
  insertJournalEntry: async (txId: string, amountCents: number) => ({ txId, amountCents }),
  findAccountBalance: async (accountId: string) => ({ accountId, balanceCents: 250000 })
};`
          },
          {
            path: 'src/auth/hmac-verifier.ts',
            content: `import { LEDGER_CONFIG } from '@/config/env';

export function verifyWebhookSignature(signature: string, payload: string): boolean {
  return signature.startsWith(LEDGER_CONFIG.webhookSecret.slice(0, 5)) && payload.length > 0;
}

export function requireMerchantApiKey(apiKey: string): { merchantId: string } {
  if (!apiKey) throw new Error('Missing API Key');
  return { merchantId: 'merch_99481' };
}`
          },
          {
            path: 'src/services/currency-fx.ts',
            content: `import { LEDGER_CONFIG } from '@/config/env';

export function convertToBaseCurrency(amount: number, fromCurrency: string): number {
  if (fromCurrency === LEDGER_CONFIG.currency) return amount;
  return Math.round(amount * 1.08);
}`
          },
          {
            path: 'src/services/settlement.ts',
            content: `import { ledgerDb } from '@/db/prisma-ledger';
import { convertToBaseCurrency } from '@/services/currency-fx';
import { evaluateVelocityRisk } from '@/services/fraud-check';

export async function settleMerchantPayout(merchantId: string, amountCents: number, currency: string) {
  const risk = await evaluateVelocityRisk(merchantId, amountCents);
  if (risk.blocked) throw new Error('Blocked by fraud velocity rule');
  const normalized = convertToBaseCurrency(amountCents, currency);
  return ledgerDb.insertJournalEntry(merchantId, normalized);
}

export async function getSettlementReserve(merchantId: string) {
  return ledgerDb.findAccountBalance(merchantId);
}`
          },
          {
            path: 'src/services/fraud-check.ts',
            content: `import { ledgerDb } from '@/db/prisma-ledger';
import { getSettlementReserve } from '@/services/settlement';

// Circular dependency: fraud-check imports settlement, and settlement imports fraud-check!
export async function evaluateVelocityRisk(merchantId: string, amountCents: number) {
  const balance = await ledgerDb.findAccountBalance(merchantId);
  const reserve = await getSettlementReserve(merchantId);
  return {
    blocked: amountCents > balance.balanceCents * 2,
    reserveAvailable: reserve.balanceCents
  };
}`
          },
          {
            path: 'src/services/invoice-issuer.ts',
            content: `import { ledgerDb } from '@/db/prisma-ledger';
import { convertToBaseCurrency } from '@/services/currency-fx';

export async function issueCustomerInvoice(accountId: string, subtotal: number, currency: string) {
  const total = convertToBaseCurrency(subtotal, currency);
  return ledgerDb.insertJournalEntry(accountId, total);
}`
          },
          {
            path: 'src/routes/checkout-api.ts',
            content: `import { requireMerchantApiKey } from '@/auth/hmac-verifier';
import { settleMerchantPayout } from '@/services/settlement';
import { issueCustomerInvoice } from '@/services/invoice-issuer';

export async function handleCheckoutPost(apiKey: string, amountCents: number) {
  const { merchantId } = requireMerchantApiKey(apiKey);
  await issueCustomerInvoice(merchantId, amountCents, 'EUR');
  return settleMerchantPayout(merchantId, amountCents, 'EUR');
}`
          },
          {
            path: 'src/routes/webhook-api.ts',
            content: `import { verifyWebhookSignature } from '@/auth/hmac-verifier';
import { settleMerchantPayout } from '@/services/settlement';

export async function handleProviderWebhook(sig: string, body: string) {
  if (!verifyWebhookSignature(sig, body)) throw new Error('Invalid HMAC signature');
  return settleMerchantPayout('merch_webhook', 15000, 'USD');
}`
          },
          {
            path: 'src/workers/reconciliation-cron.ts',
            content: `import { ledgerDb } from '@/db/prisma-ledger';
import { settleMerchantPayout } from '@/services/settlement';

export async function runNightlyReconciliation() {
  const bal = await ledgerDb.findAccountBalance('merch_primary');
  if (bal.balanceCents > 0) {
    await settleMerchantPayout('merch_primary', bal.balanceCents, 'USD');
  }
}`
          },
          {
            path: 'src/index.ts',
            content: `import { handleCheckoutPost } from '@/routes/checkout-api';
import { handleProviderWebhook } from '@/routes/webhook-api';
import { runNightlyReconciliation } from '@/workers/reconciliation-cron';

export async function bootstrapFintechServer() {
  return { handleCheckoutPost, handleProviderWebhook, runNightlyReconciliation };
}`
          }
        ]
      },

      'python-agent': {
        name: 'python-rag-orchestrator',
        description: 'Python FastAPI + Vector Graph RAG Codebase demonstrating multi-language Python AST import parsing',
        files: [
          {
            path: 'app/core/config.py',
            content: `class Settings:
    PROJECT_NAME = "Local RAG Orchestrator"
    VECTOR_DIM = 768
    CHUNK_SIZE = 512

settings = Settings()`
          },
          {
            path: 'app/db/vector_store.py',
            content: `from app.core.config import settings

class VectorStoreClient:
    def __init__(self):
        self.dim = settings.VECTOR_DIM

    def similarity_search(self, query_vec, top_k=5):
        return [{"id": "doc_1", "score": 0.94}]

vector_db = VectorStoreClient()`
          },
          {
            path: 'app/auth/jwt_bearer.py',
            content: `from app.core.config import settings

def verify_jwt_token(token: str) -> dict:
    if not token:
        raise ValueError("Missing bearer token")
    return {"sub": "user_local", "project": settings.PROJECT_NAME}`
          },
          {
            path: 'app/ingest/chunker.py',
            content: `from app.core.config import settings

def split_document_into_chunks(text: str) -> list:
    size = settings.CHUNK_SIZE
    return [text[i:i+size] for i in range(0, len(text), size)]`
          },
          {
            path: 'app/ingest/embedder.py',
            content: `from app.ingest.chunker import split_document_into_chunks
from app.db.vector_store import vector_db

def embed_and_index_document(doc_id: str, raw_text: str):
    chunks = split_document_into_chunks(raw_text)
    return vector_db.similarity_search(chunks, top_k=len(chunks))`
          },
          {
            path: 'app/agent/retriever_tool.py',
            content: `from app.db.vector_store import vector_db

def retrieve_grounded_chunks(query: str) -> list:
    return vector_db.similarity_search(query, top_k=4)`
          },
          {
            path: 'app/agent/synthesizer.py',
            content: `from app.agent.retriever_tool import retrieve_grounded_chunks
from app.core.config import settings

def answer_with_citations(question: str) -> dict:
    chunks = retrieve_grounded_chunks(question)
    return {"question": question, "citations": chunks, "model": settings.PROJECT_NAME}`
          },
          {
            path: 'app/api/routes_query.py',
            content: `from app.auth.jwt_bearer import verify_jwt_token
from app.agent.synthesizer import answer_with_citations
from app.ingest.embedder import embed_and_index_document

def post_query_endpoint(token: str, question: str):
    claims = verify_jwt_token(token)
    return answer_with_citations(question)`
          },
          {
            path: 'app/main.py',
            content: `from app.api.routes_query import post_query_endpoint
from app.core.config import settings

def create_app():
    return {"title": settings.PROJECT_NAME, "router": post_query_endpoint}`
          }
        ]
      }
    };

