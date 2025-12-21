import { marked } from 'marked';

const dialogueExtension = {
  name: 'dialogue',
  level: 'inline',
  start(src: string) {
    return src.match(/["“「]/)?.index;
  },
  tokenizer(src: string) {
    // “...” (Chinese/English Curly Quotes)
    const curlyMatch = /^“([^”]+)”/.exec(src);
    if (curlyMatch) {
      return {
        type: 'dialogue',
        raw: curlyMatch[0],
        quoteStart: '“',
        text: curlyMatch[1], // Content inside quotes
        quoteEnd: '”',
        tokens: [] // Required for nested inline parsing if we want markdown inside quotes
      };
    }

    // 「...」 (Japanese Brackets)
    const bracketMatch = /^「([^」]+)」/.exec(src);
    if (bracketMatch) {
       return {
        type: 'dialogue',
        raw: bracketMatch[0],
        quoteStart: '「',
        text: bracketMatch[1],
        quoteEnd: '」',
        tokens: []
      };
    }

    // "..." (Straight Quotes)
    const straightMatch = /^"([^"]+)"/.exec(src);
    if (straightMatch) {
       return {
        type: 'dialogue',
        raw: straightMatch[0],
        quoteStart: '"',
        text: straightMatch[1],
        quoteEnd: '"',
        tokens: []
      };
    }
  },
  renderer(token: any) {
    // Process child tokens if we want markdown inside quotes, 
    // but for now let's just render text to keep it simple and ensure clickable area is contiguous.
    // If we want markdown inside, we'd use this.parser.parseInline(token.tokens)
    
    // We want the text inside the data attribute for TTS
    const escapedText = token.text.replace(/"/g, '&quot;');
    
    // Return HTML
    // We use a specific class for styling and interaction
    return `<span class="dialogue-text group/dialogue inline-block cursor-pointer" data-tts="${escapedText}">` +
           `<span class="text-izakaya-wood/60 dark:text-stone-500 font-serif">${token.quoteStart}</span>` +
           `<span class="font-bold text-touhou-red dark:text-red-300 mx-0.5 group-hover/dialogue:scale-105 group-hover/dialogue:text-touhou-red-dark transition-all duration-200 inline-block border-b border-transparent group-hover/dialogue:border-touhou-red/30">${token.text}</span>` +
           `<span class="text-izakaya-wood/60 dark:text-stone-500 font-serif">${token.quoteEnd}</span>` +
           `</span>`;
  }
};

marked.use({ extensions: [dialogueExtension as any] });

export function parseMarkdown(text: string): string {
  // Ensure line breaks are handled as <br>
  marked.use({ breaks: true });
  return marked.parse(text) as string;
}
