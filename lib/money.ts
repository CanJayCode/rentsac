/** Indian digit grouping: last three digits, then pairs (12,43,000). Whole rupees; paise only if present. */
export function formatINR(n: number): string {
  const negative = n < 0 && Math.round(Math.abs(n) * 100) > 0;
  const paise = Math.round(Math.abs(n) * 100);
  const whole = Math.floor(paise / 100);
  const frac = paise % 100;

  const digits = String(whole);
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}` : tail;

  const decimals = frac ? `.${String(frac).padStart(2, "0")}` : "";
  return `${negative ? "-" : ""}₹${grouped}${decimals}`;
}
