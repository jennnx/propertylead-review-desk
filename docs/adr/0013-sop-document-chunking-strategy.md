# 0013 — SOP Documents use small recursive chunks for bounded retrieval context

**Status**: Accepted

## Context

PRD #29 establishes the SOP Library, SOP Document, SOP Chunk, embedding, and
retrieval capability. It deliberately leaves chunking strategy unresolved so
the first ingestion slice does not accidentally lock in a poor retrieval shape.

Voyage `voyage-3` and 1024-dimensional embeddings are already decided upstream.
This ADR does not reopen the embedding model, vector dimensions, or whether
existing SOP Documents are re-embedded after a future chunking change.

The core product constraint is not the embedding model's maximum context
length. The core constraint is the amount of SOP evidence we are willing to
put into a later Claude prompt. A large chunk size can look convenient during
ingestion, but it makes retrieval coarse. For example, if one chunk contains
roughly eight paragraphs, then retrieving even three chunks can hand Claude a
large wall of playbook text before any lead-specific context is added. A future
consumer may retrieve several SOP Chunks at once, or may use iterative
retrieval, so the stored unit should be a focused evidence unit rather than a
mini-document.

SOP content is expected to be a mix of Markdown, plain text, and PDF-extracted
text. Markdown often carries real structure through headings and lists. Plain
text and PDF extraction often preserve paragraphs but may not preserve reliable
section metadata. The chunker needs to honor structure when it exists and fall
back predictably when it does not.

Sources consulted:

- LangChain JS text splitter docs: https://docs.langchain.com/oss/javascript/integrations/splitters/index
- LangChain JS recursive splitter docs: https://docs.langchain.com/oss/javascript/integrations/splitters/recursive_text_splitter
- LangChain JS Markdown splitter example: https://docs.langchain.com/oss/javascript/integrations/splitters/code_splitter
- LangChain JS PDF loader docs: https://docs.langchain.com/oss/javascript/integrations/document_loaders/file_loaders/pdf
- LiteParse README: https://github.com/run-llama/liteparse
- Unstructured JavaScript/TypeScript SDK docs: https://docs.unstructured.io/api-reference/legacy-api/partition/sdk-jsts
- Vercel RAG guide: https://vercel.com/kb/guide/what-is-rag
- Voyage text embeddings docs: https://docs.voyageai.com/docs/embeddings

## Decision

Use small, recursive, token-budgeted SOP Chunks:

```ts
SOP_CHUNK_TARGET_TOKENS = 300
SOP_CHUNK_OVERLAP_TOKENS = 30
```

The splitter family is a Markdown-aware recursive token splitter.

Implementation should use `@langchain/textsplitters` unless a concrete
implementation issue makes it unsuitable. This gives the SOP service a
maintained TypeScript splitter package without adopting a full RAG framework,
vector store abstraction, agent framework, or document-ingestion provider.

The parser seam remains separate from chunking:

```ts
extractText(buffer, contentType) -> string
chunkSopText(extractedText, contentType) -> SopChunkText[]
```

Markdown input should use a Markdown-aware recursive splitter so headings,
lists, fenced blocks, and paragraph boundaries are preferred over blind token
windows. Plain text and PDF-extracted text should use the same target token
budget and overlap, with generic paragraph/sentence/word fallback boundaries.

Chunking configuration is code-owned. It is not exposed in the operator UI,
not configurable per SOP Document, and not configurable per retrieval query.

## Normalization

Before splitting, normalize extracted text with conservative rules:

- Normalize Unicode to `NFKC`.
- Normalize line endings to `\n`.
- Trim trailing whitespace on each line.
- Collapse runs of three or more blank lines to two blank lines.
- Preserve Markdown headings, bullets, ordered lists, and fenced code blocks.
- Do not flatten lists into prose.
- Do not strip headings.
- Do not aggressively remove PDF headers or footers in the first slice. Header
  and footer stripping may be added later only if tests use representative
  extracted PDFs and the rule is conservative.

The chunk text stored in `SopChunk.text` should include the local heading path
when the source provides one, either because the splitter preserves headings or
because the implementation prefixes heading context during chunk construction.
Small chunks need this context to remain understandable when retrieved alone.

## Retrieval Context Budget

The 300-token target is chosen because SOP Retrieval will usually compose
multiple chunks. A later consumer can reasonably retrieve a small set such as
three to five chunks without handing Claude an entire SOP section dump. With
30-token overlap, adjacent chunks keep enough boundary context for split
sentences or short procedural steps without consuming most of the prompt on
duplication.

This ADR does not set the future default `k` for
`retrieveRelevantSopChunks(query, k)`. That belongs to the consumer that knows
its prompt budget. It does require future consumers to treat `k` and chunk
size as a combined context budget. High `k` values are for diagnostics,
evaluation, or deliberate iterative retrieval flows, not the default prompt
path.

If a future Claude workflow needs broader context, prefer explicit iterative
retrieval or adjacent-chunk expansion over making stored chunks larger. That
keeps the default evidence unit focused while preserving a path to "retrieve
more" behavior.

## Trade-Offs Considered

### Fixed-token chunks

Fixed-token chunks are simple and predictable, but they split across headings,
lists, and procedural boundaries too often. They are acceptable only as a hard
fallback inside the recursive strategy.

### Large chunks around 1,000 tokens

Large chunks reduce embedding calls and may keep complete sections together,
but they make retrieval context too coarse. If a downstream prompt retrieves
three to ten chunks, the SOP context can dominate the prompt before lead data,
conversation context, and writeback constraints are added.

### Tiny chunks around 25 tokens

Very small chunks make iterative retrieval attractive, but they are often too
thin to embed well or understand alone. They also increase storage rows,
embedding calls, duplicate overlap, and the need for adjacent-chunk expansion
from day one.

### Semantic chunking

Semantic chunking can find topic boundaries, but it requires additional
embedding or model work during chunking. That makes ingestion slower and
couples chunking to another model choice. The first SOP ingestion path should
be deterministic and easy to test.

### Full ingestion frameworks

LangChain, LlamaIndex, LiteParse, and Unstructured all provide useful
ingestion conveniences. For #31, adopting a broad framework would conflate the
chunking decision with parsing, OCR, layout extraction, vector store, or agent
decisions. LiteParse and Unstructured remain good future candidates if PDF
quality becomes the bottleneck, but they should be evaluated as parser
replacements behind `extractText`, not as part of the chunking constants
decision.

## Consequences

SOP ingestion has a clear default evidence unit: small enough for multi-chunk
retrieval, large enough to carry a complete rule, rebuttal, or procedural step.

Tests for the first chunking implementation should assert the public behavior
of the chunker around:

- empty or whitespace-only input,
- short input producing one chunk,
- Markdown headings staying with or being prefixed onto their section chunks,
- overlap remaining near 30 tokens,
- chunks staying near the 300-token target except when a single indivisible
  unit requires a fallback split,
- PDF/plain text using the same target budget as Markdown after extraction.

Future changes to these constants require a new ADR or an amendment to this
ADR. Re-embedding existing SOP Documents after such a change remains out of
scope until a separate PRD explicitly plans it.
