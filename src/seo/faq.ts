import type { CmsPage, CmsPageComponent } from "../cms/index.js";

export interface FaqItem {
  readonly question: string;
  readonly answer?: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isCmsPageComponent(value: unknown): value is CmsPageComponent {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.key === "string"
    && typeof value.type === "string"
    && isRecord(value.fields)
    && Array.isArray(value.children);
}

export function resolveFaqItem(value: unknown): FaqItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const question = optionalString(value.question);
  const answer = optionalString(value.answer);
  return question ? { question, ...(answer ? { answer } : {}) } : null;
}

export function resolveFaqItems(value: unknown): ReadonlyArray<FaqItem> {
  return Array.isArray(value)
    ? value.map(resolveFaqItem).filter((item): item is FaqItem => item !== null)
    : [];
}

function collect(value: unknown, visited: Set<string>): ReadonlyArray<FaqItem> {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collect(entry, visited));
  }

  if (!isCmsPageComponent(value)) {
    return isRecord(value)
      ? Object.values(value).flatMap((entry) => collect(entry, visited))
      : [];
  }

  if (visited.has(value.id)) {
    return [];
  }
  visited.add(value.id);

  const own = value.key === "faq-section" || value.type === "faq-section"
    ? resolveFaqItems(value.fields.items)
    : [];

  return [
    ...own,
    ...value.children.flatMap((child) => collect(child, visited)),
    ...Object.values(value.fields).flatMap((entry) => collect(entry, visited)),
  ];
}

export function buildFaqPageStructuredData(page: CmsPage): Readonly<Record<string, unknown>> | null {
  const mainEntity = page.components
    .flatMap((component) => collect(component, new Set<string>()))
    .flatMap((item) => item.answer ? [{
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    }] : []);

  return mainEntity.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity,
  } : null;
}
