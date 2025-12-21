import OpenAI from 'openai';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';

// Load all CG images eagerly
// Result is a map of file paths to public URLs
const cgAssets = import.meta.glob('/src/assets/images/cg/*.{jpg,jpeg,png,webp}', { eager: true, import: 'default' });

// Build a map of Character Name -> Image URL
const characterCGMap: Record<string, string> = {};
for (const path in cgAssets) {
    // path example: "/src/assets/images/cg/上白泽慧音.jpg"
    // Extract filename without extension
    const fileName = path.split('/').pop()?.split('.')[0];
    if (fileName) {
        characterCGMap[fileName] = cgAssets[path] as string;
    }
}

export const DEFAULT_DRAWING_PROMPT_SYSTEM = `
你是一个《东方Project》RPG游戏的“插画导演”。
你的任务是根据提供的剧情文本，编写一段用于 AI 绘图的提示词。

# 编写规则
1. **开头明确风格**：提示词开头必须包含“《东方Project》风格插画，幻想乡世界观”字样。
2. **使用中文自然语言**：直接描述画面，无需使用标签或代码。
3. **着重刻画人物与场景**：
   - **严格遵循原作设定**：必须准确还原角色的外貌特征（如博丽灵梦的大蝴蝶结与露腋巫女服、雾雨魔理沙的黑白围裙与大帽子等）。
   - 大家在什么地方？环境光影如何？
   - 每个人物穿的是什么？
   - 每个人物都在干什么？表情和动作是怎样的？
4. **选取最具代表性的一幕**：如果剧情包含多段，只选取最精彩、最温馨或最关键的瞬间。
5. **风格要求**：治愈系日系现代插画，带有浓厚的生活感与空气感。线条流畅柔和，色彩饱满但不刺眼。
6. **无需输出任何解释**：只输出提示词文本本身。

# 参考范例
《东方Project》风格插画，幻想乡世界观。画面核心，是捕捉一幅褪去所有“解决异变”身份后，属于三个女孩最平凡、最温暖的瞬间。场景设定在博丽神社那略显陈旧的木质廊台（縁側）上。时值夏末初秋的傍晚，天空被落日染成一片温柔的橘红色。她们席地而坐，中间放着一个矮矮的矮桌，上面摆着几碟简单的家常菜。雾雨魔理沙正眉飞色舞地讲着什么，手舞足蹈；博丽灵梦单手托腮，嘴角带着一抹淡淡的、发自内心的微笑看着她；东风谷早苗则侧耳倾听，眼神里充满了对这种生活的好奇与喜悦。光线利用侧逆光为她们的轮廓镶上一圈金边。

# 输出格式
直接输出提示词段落，不要包含Markdown代码块或其他前缀后缀。
`;

export const drawingService = {
  // Helper: Convert URL to Base64 with Compression
  async urlToBase64(url: string): Promise<string> {
      try {
        // Load image into an Image element to get dimensions and draw to canvas
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous'; // Handle CORS if needed for local assets
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Resize logic: Max dimension 1024px
                const MAX_SIZE = 1024;
                if (width > MAX_SIZE || height > MAX_SIZE) {
                    if (width > height) {
                        height = Math.round((height * MAX_SIZE) / width);
                        width = MAX_SIZE;
                    } else {
                        width = Math.round((width * MAX_SIZE) / height);
                        height = MAX_SIZE;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }
                
                ctx.drawImage(img, 0, 0, width, height);
                
                // Compress to JPEG with 0.7 quality
                // This significantly reduces size compared to PNG or raw Base64
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(dataUrl);
            };
            img.onerror = (e) => {
                reject(new Error(`Failed to load image for compression: ${e}`));
            };
            img.src = url;
        });
      } catch (e) {
          console.error('[DrawingService] Failed to convert image to base64:', url, e);
          throw e;
      }
  },

  // Step 1: Generate Prompt using LLM #5
  async generatePrompt(storyText: string, location?: string, characters?: any[]): Promise<string> {
    const settingsStore = useSettingsStore();
    const config = settingsStore.getEffectiveConfig('drawing');
    const systemPrompt = settingsStore.drawingConfig.systemPrompt || DEFAULT_DRAWING_PROMPT_SYSTEM;

    if (!config.apiKey) {
      throw new Error('未配置绘图提示词模型 (LLM #5) 的 API Key');
    }

    const openai = new OpenAI({
      baseURL: config.baseUrl || 'https://api.openai.com/v1',
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true
    });

    const userContent = `
当前地点: ${location || '未知'}
在场角色: ${characters?.map(c => {
    let info = c.name;
    // Check if character has clothing info in the passed object (which comes from gameStore)
    // Note: 'c' here is likely a simplified object {id, name} from gameLoop, 
    // we need to access the full store state if possible, or assume 'c' has it if passed correctly.
    // In gameLoop.ts, we passed: gameStore.state.npcs[id] || { id, name: id }
    // So 'c' should be the full NPC object if available.
    if (c.clothing && c.clothing !== '未知' && c.clothing !== 'Unknown') {
        info += ` (着装参考：${c.clothing})`;
    }
    return info;
}).join(', ') || '未知'}

剧情文本:
${storyText}
`;

    try {
      const response = await openai.chat.completions.create({
        model: config.model || 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.7,
      });

      let content = response.choices[0]?.message?.content || '';
      // Strip thoughts if any
      content = content.replace(/<(thinking|think)>[\s\S]*?<\/\1>/gi, '').trim();
      
      return content;
    } catch (error) {
      console.error('[DrawingService] Prompt generation failed:', error);
      throw error;
    }
  },

  // Step 2: Generate Image using Image API
  async generateImage(prompt: string, referenceImages: string[] = []): Promise<string> {
    const settingsStore = useSettingsStore();
    const config = settingsStore.drawingConfig;

    if (!config.enabled) return '';
    if (!config.apiKey || !config.apiBaseUrl) {
      throw new Error('未配置绘图 API (URL 或 Key)');
    }

    // Construct Multimodal Message
    const content: any[] = [{ type: 'text', text: prompt }];
    
    // Add reference images if any
    if (referenceImages && referenceImages.length > 0) {
        console.log(`[DrawingService] Attaching ${referenceImages.length} reference images to request.`);
        for (const imgData of referenceImages) {
            content.push({
                type: 'image_url',
                image_url: { 
                    url: imgData 
                    // detail: 'high' // Optional, some APIs support this
                }
            });
        }
    }

    const body = {
      model: config.model || 'gemini-2.5-flash-image-landscape',
      messages: [
        { role: 'user', content: content }
      ],
      stream: true
    };

    let baseUrl = config.apiBaseUrl.replace(/\/+$/, '');
    if (baseUrl.endsWith('/chat/completions')) {
       baseUrl = baseUrl.replace(/\/chat\/completions$/, '');
    }
    const chatUrl = baseUrl + '/chat/completions';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000 * 2); // 2 min timeout

      const res = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Stream not available');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let imageUrl = '';
      let accumulatedContent = '';
      let fullRawResponse = '';
      let isSSE = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        fullRawResponse += chunk;
        buffer += chunk;

        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const lineRaw of parts) {
          const line = lineRaw.trim();
          if (!line) continue;
          
          if (line.startsWith('data:')) {
            isSSE = true;
            const payload = line.slice('data:'.length).trim();
            if (payload === '[DONE]') break;

            try {
              const parsed = JSON.parse(payload);
              const ch = parsed?.choices?.[0];
              
              // 1. Standard OpenAI Image/Gemini format
              if (ch?.delta?.image_url?.url) {
                imageUrl = ch.delta.image_url.url;
              } 
              // 2. Alternative URL field
              else if (ch?.delta?.url) {
                imageUrl = ch.delta.url;
              } 
              // 3. Content accumulation (for Markdown images)
              else if (typeof ch?.delta?.content === 'string') {
                 accumulatedContent += ch.delta.content;
              }
              // 4. Non-stream fallback (rare in SSE)
              else if (ch?.url) { 
                imageUrl = ch.url;
              }
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          }
        }
        
          // Check accumulated content for markdown image
          if (!imageUrl && accumulatedContent) {
              // Match markdown image ![alt](url) - handle optional title and assure http(s)
              const mdMatch = accumulatedContent.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)(?:[\s"'].*?)?\)/);
              if (mdMatch && mdMatch[1]) {
                  imageUrl = mdMatch[1];
              }
          }
          
          if (imageUrl) break; // Stop once we have the URL
      }

      // Final check on accumulated content after stream ends (in case URL was split across last chunk)
      if (!imageUrl && accumulatedContent) {
           const mdMatch = accumulatedContent.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)(?:[\s"'].*?)?\)/);
           if (mdMatch && mdMatch[1]) {
               imageUrl = mdMatch[1];
           }
      }

      // Fallback: If not SSE or failed to find URL in stream, try parsing full response as JSON
      if (!imageUrl) {
          console.warn('[DrawingService] No URL found in stream. Attempting full response parse...');
          try {
              // Try to parse the accumulated buffer + remaining buffer if any, or just fullRawResponse
              // fullRawResponse contains everything including "data: " prefixes if it was SSE.
              // If it was NOT SSE, fullRawResponse is just the JSON body.
              
              if (!isSSE) {
                  const parsed = JSON.parse(fullRawResponse);
                  const ch = parsed?.choices?.[0];
                  
                  // Check message content
                  const content = ch?.message?.content || '';
                  const mdMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)(?:[\s"'].*?)?\)/);
                  
                  if (mdMatch && mdMatch[1]) {
                      imageUrl = mdMatch[1];
                  } else if (ch?.message?.image_url?.url) {
                      imageUrl = ch.message.image_url.url;
                  } else if (ch?.url) {
                      imageUrl = ch.url;
                  }
              }
          } catch (e) {
              console.error('[DrawingService] Full response parse failed:', e);
          }
      }

      if (!imageUrl) {
        console.error('[DrawingService] Raw Response Dump:', fullRawResponse.slice(0, 1000)); // Log first 1000 chars
        throw new Error('未从 API 响应中获取到图片 URL');
      }

      return imageUrl;

    } catch (error) {
      console.error('[DrawingService] Image generation failed:', error);
      throw error;
    }
  },

  // Main Workflow
  async process(storyText: string, location?: string, characters?: any[]) {
    const settingsStore = useSettingsStore();
    const toastStore = useToastStore();

    if (!settingsStore.drawingConfig.enabled) {
      console.log('[DrawingService] Skipped: Feature disabled in settings');
      return null;
    }

    try {
        console.log('[DrawingService] Starting generation...');
        
        // 1. Generate Prompt
        const prompt = await this.generatePrompt(storyText, location, characters);
        console.log('[DrawingService] Generated Prompt:', prompt);
        
        // 1.5 Load Reference Images (CGs)
        const refImages: string[] = [];
        if (characters && characters.length > 0) {
            console.log(`[DrawingService] Checking for character CGs among: ${characters.map(c => c.name).join(', ')}`);
            for (const char of characters) {
                // Try exact match
                const cgUrl = characterCGMap[char.name];
                
                if (cgUrl) {
                    try {
                        console.log(`[DrawingService] Found CG for ${char.name}, loading...`);
                        const base64 = await this.urlToBase64(cgUrl);
                        refImages.push(base64);
                        console.log(`[DrawingService] Successfully loaded CG for ${char.name}`);
                    } catch (e) {
                        console.error(`[DrawingService] Failed to load CG for ${char.name}:`, e);
                    }
                } else {
                    console.log(`[DrawingService] No CG found for ${char.name}`);
                }
            }
        }

        // 2. Generate Image (with Reference Images)
        const imageUrl = await this.generateImage(prompt, refImages);
        console.log('[DrawingService] Generated Image URL:', imageUrl);

        return {
            prompt,
            url: imageUrl
        };
    } catch (error) {
        console.error('[DrawingService] Workflow failed:', error);
        toastStore.addToast('插画生成失败，请检查配置', 'error');
        return null;
    }
  }
};
