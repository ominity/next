const CLIENT_IP_HEADER_NAMES = [
  "x-ominity-client-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "fastly-client-ip",
  "fly-client-ip",
  "x-vercel-forwarded-for",
  "x-client-ip",
  "x-nf-client-connection-ip",
  "x-real-ip",
  "forwarded",
  "x-forwarded-for",
] as const;

export function normalizeIpCandidate(value: string): string | null {
  let normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("\"") && normalized.endsWith("\"")) {
    normalized = normalized.slice(1, -1).trim();
  }

  if (normalized.startsWith("for=")) {
    normalized = normalized.slice(4).trim();
  }

  if (normalized.startsWith("[") && normalized.includes("]")) {
    const closingBracketIndex = normalized.indexOf("]");
    normalized = normalized.slice(1, closingBracketIndex).trim();
  } else {
    const colonCount = (normalized.match(/:/g) ?? []).length;
    if (colonCount === 1 && normalized.includes(".")) {
      const [host] = normalized.split(":");
      normalized = host?.trim() ?? normalized;
    }
  }

  normalized = normalized.replace(/^::ffff:/i, "").trim();

  if (!normalized || normalized.toLowerCase() === "unknown") {
    return null;
  }

  return normalized;
}

export function readHeaderIpCandidates(
  request: Request,
  headerName: string,
): string[] {
  const value = request.headers.get(headerName);
  if (!value) {
    return [];
  }

  if (headerName === "forwarded") {
    return value
      .split(",")
      .flatMap((entry) => entry.split(";"))
      .map((entry) => entry.trim())
      .filter((entry) => entry.toLowerCase().startsWith("for="))
      .map((entry) => normalizeIpCandidate(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  if (headerName === "x-forwarded-for") {
    return value
      .split(",")
      .map((entry) => normalizeIpCandidate(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  const normalized = normalizeIpCandidate(value);
  return normalized ? [normalized] : [];
}

export function getRequestClientIpCandidates(request: Request): string[] {
  return CLIENT_IP_HEADER_NAMES.flatMap((headerName) =>
    readHeaderIpCandidates(request, headerName),
  );
}

function isPrivateOrLoopbackIpv4(candidate: string): boolean {
  const parts = candidate.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts as [number, number, number, number];

  return (
    a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
  );
}

function isPrivateOrLoopbackIpv6(candidate: string): boolean {
  const normalized = candidate.toLowerCase();

  return (
    normalized === "::1"
    || normalized === "::"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe80:")
  );
}

function isPrivateOrLoopbackIp(candidate: string): boolean {
  if (candidate.includes(".")) {
    return isPrivateOrLoopbackIpv4(candidate);
  }

  if (candidate.includes(":")) {
    return isPrivateOrLoopbackIpv6(candidate);
  }

  return false;
}

export function resolveRequestClientIp(request: Request): string | null {
  const candidates = getRequestClientIpCandidates(request);
  const firstPublicCandidate = candidates.find((candidate) => !isPrivateOrLoopbackIp(candidate));

  return firstPublicCandidate ?? candidates[0] ?? null;
}

export function resolveRequestForwardedFor(request: Request): string | null {
  const resolvedClientIp = resolveRequestClientIp(request);
  const forwarded = readHeaderIpCandidates(request, "x-forwarded-for");
  const values = resolvedClientIp ? [resolvedClientIp, ...forwarded] : forwarded;
  const unique = values.filter((value, index) => values.indexOf(value) === index);

  if (unique.length > 0) {
    return unique.join(", ");
  }

  return resolvedClientIp;
}
