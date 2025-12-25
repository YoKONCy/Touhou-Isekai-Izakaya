import OpenAI from 'openai';
import JSZip from 'jszip';
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
你的任务是根据提供的剧情文本，编写一段用于 AI 绘图的提示词（包括正面描述和负面描述）。

# 编写规则
1. **正面提示词 (Prompt)**：
   - 开头必须包含“《东方Project》风格插画，幻想乡世界观”字样。
   - 使用中文自然语言，直接描述画面。
   - 准确还原角色外貌（如博丽灵梦的大蝴蝶结、雾雨魔理沙的黑白围裙等）。
   - 描述环境光影、人物动作与表情。
2. **负面提示词 (Negative Prompt)**：
   - 描述你不希望在画面中出现的内容（如：现代电器、违和感、低画质等）。
3. **输出格式**：
   - 请以 JSON 格式输出，包含 "prompt" 和 "negative_prompt" 两个字段。

# 参考范例
{
  "prompt": "《东方Project》风格插画，幻想乡世界观。博丽灵梦和雾雨魔理沙在博丽神社的走廊上喝茶，背景是落日的余晖...",
  "negative_prompt": "现代电器, 手机, 汽车, 低质量, 模糊, 断手"
}
`;

export const DEFAULT_NOVELAI_V3_PROMPT_SYSTEM = `
You are an expert AI art prompter for NovelAI V3, specializing in Touhou Project style.
Your task is to convert the given story text into a set of high-quality English tags.

# Rules
1. **Positive Prompt (prompt)**:
   - Output English Tags Only, comma-separated.
   - Quality keywords: 'best quality, amazing quality, very aesthetic, absurdres'.
   - Style: 'touhou (style), anime style'.
   - Character specifics: e.g., 'reimu hakurei, red bow, detached sleeves'.
2. **Negative Prompt (negative_prompt)**:
   - Common negative tags (e.g., 'lowres, bad anatomy, bad hands, text, error').
3. **Output Format**:
   - Provide the result in JSON format with "prompt" and "negative_prompt" keys.

# Example
{
  "prompt": "best quality, amazing quality, very aesthetic, absurdres, 1girl, reimu hakurei, red bow, detached sleeves, sitting, drinking tea, touhou (style), anime style",
  "negative_prompt": "lowres, bad anatomy, bad hands, text, error"
}
`;

export const DEFAULT_NOVELAI_V4_PROMPT_SYSTEM = `
You are an expert AI art prompter for NovelAI V4/V4.5, specializing in Touhou Project style.
NovelAI V4.5 has advanced Natural Language understanding.

# Rules
1. **Positive Prompt (prompt)**:
   - Use Natural Language (descriptive English sentences).
   - Describe the scene, characters, and lighting vividly as if writing a caption.
   - Include quality keywords at the beginning: 'best quality, amazing quality, very aesthetic, absurdres'.
   - Mention style: 'touhou (style), anime style'.
2. **Negative Prompt (negative_prompt)**:
   - Common negative tags (e.g., 'lowres, bad anatomy, bad hands, text, error').
3. **Output Format**:
   - Provide the result in JSON format with "prompt" and "negative_prompt" keys.

# Example
{
  "prompt": "best quality, amazing quality, very aesthetic, absurdres, Reimu Hakurei is sitting peacefully on the wooden porch of the Hakurei Shrine, holding a steaming cup of tea. The background shows a beautiful sunset over the mountains of Gensokyo. touhou (style), anime style",
  "negative_prompt": "lowres, bad anatomy, bad hands, text, error"
}
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
  async generatePrompt(storyText: string, location?: string, characters?: any[]): Promise<{ prompt: string; negative_prompt: string }> {
    const settingsStore = useSettingsStore();
    const config = settingsStore.getEffectiveConfig('drawing');
    
    // Select System Prompt based on provider type and model
    const rawConfig = settingsStore.drawingConfig;
    const isNovelAI = rawConfig.providerType === 'novelai';
    const isV4 = isNovelAI && (rawConfig.model?.includes('nai-diffusion-4') || false);
    
    let systemPrompt = '';
    if (isNovelAI) {
        if (isV4) {
            systemPrompt = rawConfig.systemPromptNovelAIV4 || DEFAULT_NOVELAI_V4_PROMPT_SYSTEM;
        } else {
            systemPrompt = rawConfig.systemPromptNovelAIV3 || DEFAULT_NOVELAI_V3_PROMPT_SYSTEM;
        }
    } else {
        systemPrompt = rawConfig.systemPromptOpenAI || DEFAULT_DRAWING_PROMPT_SYSTEM;
    }

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
        response_format: { type: 'json_object' }
      });

      let content = response.choices[0]?.message?.content || '';
      // Strip thoughts if any
      content = content.replace(/<(thinking|think)>[\s\S]*?<\/\1>/gi, '').trim();
      
      try {
        const parsed = JSON.parse(content);
        return {
          prompt: parsed.prompt || '',
          negative_prompt: parsed.negative_prompt || ''
        };
      } catch (e) {
        console.warn('[DrawingService] Failed to parse LLM response as JSON, falling back to raw content');
        return {
          prompt: content,
          negative_prompt: ''
        };
      }
    } catch (error) {
      console.error('[DrawingService] Prompt generation failed:', error);
      throw error;
    }
  },

  // Step 2b: NovelAI Generation
  async generateImageNovelAI(prompt: string, negativePrompt: string, config: any): Promise<string> {
      if (!config.apiKey) throw new Error("NovelAI API Key is missing");
      
      const baseUrl = config.apiBaseUrl || 'https://api.novelai.net/ai/generate-image';
      
      // Standard Official NovelAI Request Structure
      const body = {
          input: prompt, 
          model: config.model || 'nai-diffusion-3',
          action: 'generate',
          parameters: {
              width: config.width || 832,
              height: config.height || 1216,
              steps: config.steps || 28,
              scale: config.scale || 5.0,
              sampler: config.sampler || 'k_euler_ancestral',
              negative_prompt: negativePrompt,
              n_samples: 1,
              ucPreset: 0,
              qualityToggle: true,
              sm: false,
              sm_dyn: false,
              dynamic_thresholding: false,
              controlnet_strength: 1.0,
              legacy_v3_extend: false,
              add_original_image: false,
              // Add a default seed if not provided to ensure consistency if needed
              seed: Math.floor(Math.random() * 1000000000)
          }
      };

      // Compatibility: Some proxies expect a flat structure
      // We'll check if the user provided a custom URL that might be a proxy
      const isOfficial = baseUrl.includes('novelai.net');
      const requestBody = isOfficial ? body : {
          ...body.parameters,
          prompt: prompt,
          model: body.model
      };

      let response;
      try {
          response = await fetch(baseUrl, {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${config.apiKey}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify(requestBody)
          });
      } catch (e: any) {
          // Detect CORS/Network error
          if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
              throw new Error("网络请求失败 (可能是 CORS 跨域问题)。如果您在浏览器中直接连接 NovelAI 官方接口，请务必使用 CORS 代理或反向代理地址。");
          }
          throw e;
      }

      if (!response.ok) {
          const errText = await response.text();
          let errorMsg = `NovelAI API Error (${response.status})`;
          try {
              const errJson = JSON.parse(errText);
              errorMsg += `: ${errJson.message || errJson.error || errText}`;
          } catch (e) {
              errorMsg += `: ${errText}`;
          }
          throw new Error(errorMsg);
      }

      // Handle Response
      const contentType = response.headers.get('content-type');
      
      // 1. ZIP Response (Official NovelAI returns a zip file)
      if (contentType?.includes('application/zip') || contentType?.includes('application/x-zip-compressed')) {
          const blob = await response.blob();
          const zip = await JSZip.loadAsync(blob);
          // Find the first image file
          const files = Object.keys(zip.files);
          const imageFile = files.find(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp'));
          
          if (!imageFile) throw new Error("No image found in NovelAI response zip");
          
          const imageBlob = await zip.file(imageFile)?.async('blob');
          if (!imageBlob) throw new Error("Failed to extract image from zip");
          
          return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(imageBlob);
          });
      }
      
      // 2. Direct Image Response
      if (contentType?.includes('image/')) {
          const blob = await response.blob();
          return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
          });
      }

      // 3. JSON Response (Usually error or unexpected)
      const text = await response.text();
      throw new Error(`Unexpected NovelAI response format (${contentType}): ${text.substring(0, 100)}`);
  },

  // Test NovelAI Connection
  async testNovelAIConnection(config: any): Promise<boolean> {
    if (!config.apiKey) throw new Error("API Key 不能为空");
    
    // For testing, we use a very minimal request to save Anlas/Points
    // Official NAI doesn't have a simple 'ping' for images, so we try a small generation if possible
    // or just a very fast check.
    const baseUrl = config.apiBaseUrl || 'https://api.novelai.net/ai/generate-image';
    
    const testBody = {
        input: "test", 
        model: config.model || 'nai-diffusion-3',
        action: 'generate',
        parameters: {
            width: 64,
            height: 64,
            steps: 1, // Minimum steps
            n_samples: 1
        }
    };

    try {
        let response;
        try {
            response = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(testBody)
            });
        } catch (e: any) {
            // Detect CORS/Network error
            if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
                throw new Error("连接失败：检测到跨域限制 (CORS)。请使用代理服务器或反向代理。");
            }
            throw e;
        }

        if (response.status === 401) throw new Error("API Key 无效 (401)");
        if (response.status === 404) throw new Error("接口地址或模型 ID 错误 (404)");
        if (response.status === 400) {
            const errText = await response.text();
            if (errText.includes("model")) throw new Error(`模型 ID "${config.model}" 不被支持`);
            throw new Error(`请求错误 (400): ${errText}`);
        }

        if (!response.ok) {
            throw new Error(`连接失败 (${response.status})`);
        }

        return true;
    } catch (e: any) {
        throw e;
    }
  },

  // Step 2: Generate Image using Image API
  async generateImage(prompt: string, negativePrompt: string, referenceImages: string[] = []): Promise<string> {
    const settingsStore = useSettingsStore();
    const config = settingsStore.drawingConfig;

    if (!config.enabled) return '';
    
    // Dispatch to NovelAI handler if selected
    if (config.providerType === 'novelai') {
        return this.generateImageNovelAI(prompt, negativePrompt, config);
    }

    if (!config.apiKey || !config.apiBaseUrl) {
      throw new Error('未配置绘图 API (URL 或 Key)');
    }

    // Construct Multimodal Message
    const content: any[] = [{ type: 'text', text: `Prompt: ${prompt}\nNegative Prompt: ${negativePrompt}` }];
    
    // Add reference images if any
    if (referenceImages && referenceImages.length > 0) {
        console.log(`[DrawingService] Attaching ${referenceImages.length} reference images to request.`);
        for (const imgData of referenceImages) {
            content.push({
                type: 'image_url',
                image_url: { 
                    url: imgData 
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
  async process(storyText: string, location?: string, characters?: any[], extraReferenceImages: string[] = []) {
    const settingsStore = useSettingsStore();
    const toastStore = useToastStore();
    const config = settingsStore.drawingConfig;

    if (!config.enabled) {
      console.log('[DrawingService] Skipped: Feature disabled in settings');
      return null;
    }

    try {
        console.log('[DrawingService] Starting generation...');
        
        // 1. Generate Prompt from LLM
        const { prompt: llmPrompt, negative_prompt: llmNegativePrompt } = await this.generatePrompt(storyText, location, characters);
        console.log('[DrawingService] LLM Generated Prompt:', llmPrompt);
        console.log('[DrawingService] LLM Generated Negative Prompt:', llmNegativePrompt);
        
        // 2. Combine with User Extra Prompts
        const isNovelAI = config.providerType === 'novelai';
        let finalPrompt = llmPrompt;
        let finalNegativePrompt = llmNegativePrompt || (isNovelAI ? config.negativePrompt : '');

        // Add user extra positive/negative prompts (NovelAI Only)
        if (isNovelAI) {
            if (config.extraPositivePrompt) {
                finalPrompt = `${finalPrompt}, ${config.extraPositivePrompt}`;
            }
            
            if (config.extraNegativePrompt) {
                finalNegativePrompt = `${finalNegativePrompt}, ${config.extraNegativePrompt}`;
            }
        }

        console.log('[DrawingService] Final Prompt:', finalPrompt);
        console.log('[DrawingService] Final Negative Prompt:', finalNegativePrompt);
        
        // 3. Load Reference Images (CGs + Extra)
        const refImages: string[] = [...extraReferenceImages];
        if (characters && characters.length > 0) {
            console.log(`[DrawingService] Checking for character CGs among: ${characters.map(c => c.name).join(', ')}`);
            for (const char of characters) {
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
                }
            }
        }

        // 4. Generate Image (with Reference Images)
        const imageUrl = await this.generateImage(finalPrompt, finalNegativePrompt, refImages);
        console.log('[DrawingService] Generated Image URL:', imageUrl);

        return {
            prompt: finalPrompt,
            url: imageUrl
        };
    } catch (error) {
        console.error('[DrawingService] Workflow failed:', error);
        toastStore.addToast('插画生成失败，请检查配置', 'error');
        return null;
    }
  }
};
