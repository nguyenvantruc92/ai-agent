/** Deterministic upload scan. Findings intentionally never retain the matched text. */
export type SafetyFinding = { rule: string; severity: 'high' | 'medium'; count: number };

const rules: { rule: string; severity: SafetyFinding['severity']; pattern: RegExp }[] = [
  { rule: 'role_override_vi', severity: 'high', pattern: /(?:bỏ qua|phớt lờ|quên|bỏ hết)\s+(?:mọi|tất cả|toàn bộ|các|những)?\s*(?:hướng dẫn|chỉ dẫn|quy tắc|lệnh|chỉ thị)/giu },
  { rule: 'role_override_en', severity: 'high', pattern: /ignore\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier)?\s*(?:instructions|rules|prompts?)/giu },
  { rule: 'secret_exfiltration', severity: 'high', pattern: /(?:system prompt|prompt hệ thống|api[\s_-]?key|khóa api).{0,80}(?:in ra|hiển thị|tiết lộ|show|reveal|print|repeat)/giu },
  { rule: 'jailbreak_marker', severity: 'medium', pattern: /\b(?:jailbreak|developer mode|DAN mode|system message)\b/giu },
];

export function scanKnowledgeText(text: string): SafetyFinding[] {
  return rules.flatMap(({ rule, severity, pattern }) => {
    pattern.lastIndex = 0;
    const count = [...text.matchAll(pattern)].length;
    return count ? [{ rule, severity, count }] : [];
  });
}

export const needsHumanReview = (findings: readonly SafetyFinding[]) => findings.some((finding) => finding.severity === 'high');
