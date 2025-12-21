// Simple heuristic token counter
// For production, use 'gpt-tokenizer' or 'tiktoken'
// 1 token ~= 4 chars in English, ~= 1 char in Chinese
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Count CJK characters
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  // Count other characters
  const other = text.length - cjk;
  
  return cjk + Math.ceil(other / 4);
}
