const BEE_PREFIXES = [
  "bee", "honey", "hive", "pollen", "nectar", "wing", "buzz",
  "amber", "gold", "royal", "queen", "drone", "worker", "comb",
];

const TECH_SUFFIXES = [
  "ai", "lab", "dev", "pro", "hub", "box", "net", "io",
];

export function generateRandomAlias(): string {
  const prefix = BEE_PREFIXES[Math.floor(Math.random() * BEE_PREFIXES.length)];
  const useSuffix = Math.random() > 0.5;
  const suffix = useSuffix
    ? TECH_SUFFIXES[Math.floor(Math.random() * TECH_SUFFIXES.length)]
    : "";
  const num = Math.floor(Math.random() * 9000) + 1000;
  return suffix ? `${prefix}-${suffix}-${num}` : `${prefix}-${num}`;
}

export function validateAlias(alias: string): string | null {
  if (!alias) return "Vui lòng nhập tên";
  if (alias.length < 3) return "Tên phải có ít nhất 3 ký tự";
  if (alias.length > 30) return "Tên tối đa 30 ký tự";
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/i.test(alias)) {
    return "Chỉ dùng chữ thường, số, dấu . _ - và không bắt đầu/kết thúc bằng ký tự đặc biệt";
  }
  return null;
}

export function buildEmailAddress(alias: string, domain: string): string {
  return `${alias.toLowerCase()}@${domain}`;
}
