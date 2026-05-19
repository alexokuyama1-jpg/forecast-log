export const LACTALIS_DOMAIN = "@br.lactalis.com";

export function isValidLactalisEmail(email: string): boolean {
  const v = email.trim().toLowerCase();
  return /^[^\s@]+@br\.lactalis\.com$/.test(v);
}

export function passwordIssues(pw: string): string[] {
  const issues: string[] = [];
  if (pw.length < 8) issues.push("Mínimo de 8 caracteres");
  if (!/[A-Z]/.test(pw)) issues.push("Pelo menos 1 letra maiúscula");
  if (!/[0-9]/.test(pw)) issues.push("Pelo menos 1 número");
  if (!/[!@#$%^&*()_\-+={}\[\]:;"'<>,.?/\\|`~]/.test(pw))
    issues.push("Pelo menos 1 caractere especial (ex.: # @ % $)");
  return issues;
}

export function isValidPassword(pw: string): boolean {
  return passwordIssues(pw).length === 0;
}