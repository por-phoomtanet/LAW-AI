// ใช้ร่วมกันระหว่าง packages/ingestion (parse เลขมาตรา) และ apps/api (ถ้าต้อง exact-match
// เลขมาตราจาก query ผู้ใช้ในอนาคต)
const THAI_DIGITS: Record<string, string> = {
  "๐": "0",
  "๑": "1",
  "๒": "2",
  "๓": "3",
  "๔": "4",
  "๕": "5",
  "๖": "6",
  "๗": "7",
  "๘": "8",
  "๙": "9",
};

export function thaiDigitsToArabic(text: string): string {
  return text.replace(/[๐-๙]/g, (ch) => THAI_DIGITS[ch] ?? ch);
}
