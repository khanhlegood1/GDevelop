const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in", "is", "it", "of", "on", "or", "the", "to", "what", "when", "why", "with",
  "ai", "ban", "bạn", "bi", "bị", "cac", "các", "can", "cần", "cho", "co", "có", "cua", "của", "de", "để", "den", "đến", "do", "duoc", "được",
  "gi", "gì", "hay", "hoc", "học", "khong", "không", "la", "là", "lam", "làm", "mot", "một", "nay", "này", "nhu", "như", "nhung", "nhưng",
  "sao", "the", "thế", "thi", "thì", "toi", "tôi", "trong", "tu", "từ", "va", "và", "ve", "về", "vi", "vì", "voi", "với",
]);

export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi-VN")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string, options: { keepStopwords?: boolean } = {}): string[] {
  const tokens = normalizeForSearch(value).split(" ").filter((token) => token.length >= 2);
  return options.keepStopwords ? tokens : tokens.filter((token) => !STOPWORDS.has(token));
}

export function tokenSet(value: string): Set<string> {
  return new Set(tokenize(value));
}

export function slugifyAscii(value: string, fallback = "concept"): string {
  const slug = normalizeForSearch(value).replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return (slug || fallback).slice(0, 96).replace(/_+$/g, "") || fallback;
}

export function truncateText(value: string, maxLength: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function jaccardSimilarity(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function topPhrases(value: string, limit: number): string[] {
  const tokens = tokenize(value);
  const counts = new Map<string, number>();

  for (let index = 0; index < tokens.length; index += 1) {
    const unigram = tokens[index];
    counts.set(unigram, (counts.get(unigram) ?? 0) + 1);
    if (index + 1 < tokens.length) {
      const bigram = `${tokens[index]} ${tokens[index + 1]}`;
      counts.set(bigram, (counts.get(bigram) ?? 0) + 1.5);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([phrase]) => phrase)
    .filter((phrase, index, phrases) => !phrases.slice(0, index).some((selected) => selected.includes(phrase) || phrase.includes(selected)))
    .slice(0, limit);
}
