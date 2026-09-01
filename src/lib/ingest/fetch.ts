import { extractPdfText } from "./pdf";

/**
 * HTTP fetch layer for sourced ingestion.
 *
 * This is the ONLY place production code talks to the network. It fetches real
 * URLs with a timeout and size cap, detects the document type (HTML vs PDF) and
 * returns the text payload. There are no fake responses anywhere in this path:
 * a source that cannot be fetched raises FetchError, and the pipeline records it
 * as unavailable/review-required — it never invents data to keep going.
 */

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export interface FetchedDocument {
  url: string;
  statusCode: number;
  contentType: string | null;
  text: string;
  fetchedAt: Date;
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 30 * 1024 * 1024;

export async function fetchSourceDocument(
  url: string,
  opts: FetchOptions = {},
): Promise<FetchedDocument> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          opts.userAgent ??
          "TourNova-ingest/0.1 (research/provenance pipeline; contact info@gujarattourism.com for SC-JSON-LD)",
        accept: "text/html,application/pdf,application/xhtml+xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new FetchError(`Request to ${url} failed: ${cause}`);
  }

  if (!response.ok) {
    throw new FetchError(`Unexpected HTTP status ${response.status} from ${url}`, response.status);
  }

  const contentType = response.headers.get("content-type");
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) {
    throw new FetchError(`Response from ${url} exceeds the ${maxBytes}-byte fetch limit.`);
  }

  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength > maxBytes) {
    throw new FetchError(`Response from ${url} exceeds the ${maxBytes}-byte fetch limit.`);
  }

  const isPdf = (contentType ?? "").includes("pdf") || startsWithPdfMagic(body);
  const text = isPdf ? extractPdfText(body) : new TextDecoder("utf-8").decode(body);

  return {
    url,
    statusCode: response.status,
    contentType,
    text,
    fetchedAt: new Date(),
  };
}

function startsWithPdfMagic(body: Uint8Array): boolean {
  const head = body.subarray(0, 5).toString();
  return head.startsWith("%PDF");
}
