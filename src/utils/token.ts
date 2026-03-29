// Token 估算器（基于简单启发式算法）
// 说明：生产环境建议对接 gpt-tokenizer 或 tiktoken 以提升各模型架构下的精度
// 经验准则：1 token 约等于 4 个英文字符，或 1 个中文字符
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // 统计中日韩（CJK）字符数量
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  // 统计其他非 CJK 字符数量
  const other = text.length - cjk;

  return cjk + Math.ceil(other / 4);
}
