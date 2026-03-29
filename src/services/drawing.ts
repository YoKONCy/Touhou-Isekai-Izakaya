import OpenAI from 'openai';
import JSZip from 'jszip';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';
import { findAvatarImage } from '@/services/characterMapping';

// 预加载：全量获取所有角色头像资源（Eager Loading）
// 结果映射：建立从文件路径到公开访问 URL 的映射表
const headAssets = import.meta.glob('/src/assets/images/head/*.{jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default'
});

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
你是 NovelAI V3 的专家级 AI 绘画提示词生成器，专精于《东方Project》风格。
你的任务是将给定的故事文本转换为一组高质量的英文标签 (Tags)。

# 规则
1. **正面提示词 (prompt)**:
   - **仅输出英文标签**，用逗号分隔。
   - 质量关键词: 'best quality, amazing quality, very aesthetic, absurdres'。
   - 风格: 'touhou (style), anime style'。
   - 角色细节: 例如 'reimu hakurei, red bow, detached sleeves'。
2. **负面提示词 (negative_prompt)**:
   - 通用负面标签 (例如 'lowres, bad anatomy, bad hands, text, error')。
3. **输出格式**:
   - 提供包含 "prompt" 和 "negative_prompt" 键的 JSON 格式结果。

# 示例
{
  "prompt": "best quality, amazing quality, very aesthetic, absurdres, 1girl, reimu hakurei, red bow, detached sleeves, sitting, drinking tea, touhou (style), anime style",
  "negative_prompt": "lowres, bad anatomy, bad hands, text, error"
}
`;

export const DEFAULT_NOVELAI_V4_PROMPT_SYSTEM = `
你是 NovelAI V4/V4.5 的专家级 AI 绘画提示词生成器，专精于《东方Project》风格。
NovelAI V4.5 拥有先进的自然语言理解能力。

# 规则
1. **正面提示词 (prompt)**:
   - 使用**自然语言** (描述性的英文句子)。
   - 生动地描述场景、角色和光影，就像写图片说明一样。
   - 在开头包含质量关键词: 'best quality, amazing quality, very aesthetic, absurdres'。
   - 提及风格: 'touhou (style), anime style'。
2. **负面提示词 (negative_prompt)**:
   - 通用负面标签 (例如 'lowres, bad anatomy, bad hands, text, error')。
3. **输出格式**:
   - 提供包含 "prompt" 和 "negative_prompt" 键的 JSON 格式结果。

# 示例
{
  "prompt": "best quality, amazing quality, very aesthetic, absurdres, Reimu Hakurei is sitting peacefully on the wooden porch of the Hakurei Shrine, holding a steaming cup of tea. The background shows a beautiful sunset over the mountains of Gensokyo. touhou (style), anime style",
  "negative_prompt": "lowres, bad anatomy, bad hands, text, error"
}
`;

export const drawingService = {
  // 标准化：处理模型 ID 中的小数点（特别是 V4.5 模型）
  // 逻辑说明：NovelAI 在底层 API 调用中通常要求使用连字符 (Hyphens)，但在展示配置中习惯使用点号 (Dots)。
  // 例如: "nai-diffusion-4.5-full" -> "nai-diffusion-4-5-full"
  sanitizeModelId(modelId: string): string {
    const modelMap: Record<string, string> = {
      'NovelAI Diffusion V4.5 Full': 'nai-diffusion-4-5-full',
      'NovelAI Diffusion V4.5 Curated': 'nai-diffusion-4-5-curated',
      'NovelAI Diffusion V4 Full': 'nai-diffusion-4-full',
      'NovelAI Diffusion V4 Curated': 'nai-diffusion-4-curated',
      'NovelAI Diffusion V3': 'nai-diffusion-3',
      'NovelAI Diffusion Furry V3': 'nai-diffusion-furry-3',
      'nai-diffusion-4.5-full': 'nai-diffusion-4-5-full',
      'nai-diffusion-4.5-curated': 'nai-diffusion-4-5-curated'
    };
    let sanitized = modelMap[modelId] || modelId;
    // 终态容错：针对任何 nai-diffusion-4.x 系列模型，强制将剩余点号替换为连字符。
    if (sanitized.includes('nai-diffusion-4.')) {
      sanitized = sanitized.replace(/\./g, '-');
    }
    return sanitized;
  },

  // 辅助方法：执行 URL 到 Base64 的转换，并同步执行图像压缩。
  async urlToBase64(url: string): Promise<string> {
    try {
      // 流程：将图像载入离屏 Image 对象以获取其物理尺寸，并准备绘制。
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous'; // 处理跨域资源引用 (CORS) 喵
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // 缩放逻辑：将图像最大边长限制在 1024 像素以内。
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

          // 转换与压缩策略：输出质量设为 0.7 的 JPEG 格式。
          // 相比 PNG 或原始 Base64 编码，该策略能显著缩减传输体积与显存占用。
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

  // 第一阶段：调用绘图辅助模型 (LLM #5) 生成精准提示词。
  async generatePrompt(
    storyText: string,
    location?: string,
    characters?: any[]
  ): Promise<{ prompt: string; negative_prompt: string }> {
    const settingsStore = useSettingsStore();
    const config = settingsStore.getEffectiveConfig('drawing');

    // 策略切换：根据服务商类型及其版本自动选择最匹配的 System Prompt。
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
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true
    });

    const userContent = `
当前地点: ${location || '未知'}
在场角色: ${
      characters
        ?.map((c) => {
          let info = c.name;
          if (c.clothing && c.clothing !== '未知' && c.clothing !== 'Unknown') {
            info += ` (着装参考：${c.clothing})`;
          }
          return info;
        })
        .join(', ') || '未知'
    }

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
      // 认知清理：剔除响应中可能存在的 CoT 思维链 (Thinking tags)
      content = content.replace(/<(thinking|think)>[\s\S]*?<\/\1>/gi, '').trim();

      try {
        const parsed = JSON.parse(content);
        return {
          prompt: parsed.prompt || '',
          negative_prompt: parsed.negative_prompt || ''
        };
      } catch (e) {
        console.warn(
          '[DrawingService] 无法将 LLM 响应解析为 JSON 格式，正降级回退至原始文本内容喵'
        );
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

  // 第二阶段 (分流 B)：执行 NovelAI 原生接口调用流程。
  async generateImageNovelAI(prompt: string, negativePrompt: string, config: any): Promise<string> {
    if (!config.apiKey) throw new Error('NovelAI API Key is missing');

    const baseUrl =
      config.apiBaseUrl || 'https://nai-proxy.2752026184.workers.dev/ai/generate-image';
    const rawModel = config.model || 'nai-diffusion-3';
    const model = this.sanitizeModelId(rawModel);
    const isV4 = model.includes('nai-diffusion-4');
    const isV45 = model.includes('nai-diffusion-4-5');

    // 采样器转换：将标准采样器标识符对齐至 NovelAI V4 专用名称
    let sampler = config.sampler || 'k_euler_ancestral';
    if (isV4) {
      const v4SamplerMap: Record<string, string> = {
        k_euler: 'k_euler',
        k_euler_ancestral: 'k_euler_a',
        k_dpmpp_2m: 'k_dpmpp_2m',
        k_dpmpp_sde: 'k_dpmpp_sde',
        k_dpmpp_2s_ancestral: 'k_dpmpp_2s_a',
        proxi_euler_ancestral: 'k_euler_a',
        proxi_euler: 'k_euler',
        deliberate_euler_ancestral: 'k_euler_a', // V4.5 standard fallback
        deliberate_euler: 'k_euler'
      };
      sampler = v4SamplerMap[sampler] || 'k_euler_a';
    }

    console.log(
      `[绘图服务] 正在使用模型生成图像: ${model}, 服务商: NovelAI (isV4: ${isV4}, isV45: ${isV45}, 采样器: ${sampler})`
    );

    // 1. 第一步：构建推导参数集 (Inference Parameters)
    let parameters: any = {};

    if (isV4) {
      // V4/V4.5 严格参数白名单：仅启用最小配置集以规避 500 后端错误确认。
      parameters = {
        width: config.width || 832,
        height: config.height || 1216,
        steps: config.steps || 28,
        scale: config.scale || 6.0,
        sampler: sampler,
        seed: Math.floor(Math.random() * 1000000000),
        // 对于 V4/V4.5 架构，通常不再需要 n_samples 参数喵
        uc: negativePrompt,
        params_version: 1,
        cfg_rescale: 0,
        noise_schedule: 'native',
        v4_prompt_optimizer: true,
        v4_skip_cfg_above_sigma: 19,
        variety_boost: true,
        decrisp_mode: false,
        qualityToggle: true
      };

      if (isV45) {
        parameters.use_coords = true;
        // 对于 V4.5，若 character_prompts 为空则需明确剔除，以规避参数校验失败。
      }
    } else {
      // V3 系列推导参数集
      parameters = {
        width: config.width || 832,
        height: config.height || 1216,
        steps: config.steps || 28,
        scale: config.scale || 6.0,
        sampler: sampler,
        seed: Math.floor(Math.random() * 1000000000),
        n_samples: 1,
        uc: negativePrompt,
        negative_prompt: negativePrompt,
        ucPreset: 0,
        qualityToggle: false,
        sm: false,
        sm_dyn: false,
        dynamic_thresholding: false,
        controlnet_strength: 1.0,
        legacy_v3_extend: false,
        add_original_image: false
      };
    }

    // 2. Build Request Body
    const body: any = {
      input: prompt,
      model: model,
      action: 'generate',
      parameters: parameters
    };

    // 兼容性修正：NovelAI 服务商始终采用其官方规定的请求参数结构
    const isOfficialStructure =
      config.providerType === 'novelai' ||
      baseUrl.includes('novelai.net') ||
      baseUrl.includes('workers.dev');

    const requestBody = isOfficialStructure
      ? body
      : {
          ...body.parameters,
          prompt: prompt,
          model: body.model
        };

    console.log('[绘图服务] 请求体:', JSON.stringify(requestBody, null, 2));

    let response;
    try {
      response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
    } catch (e: any) {
      console.error('[绘图服务] 获取响应失败:', e);
      if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
        throw new Error(
          '网络请求失败 (可能是 CORS 跨域问题)。如果您在浏览器中直接连接 NovelAI 官方接口，请务必使用 CORS 代理或反向代理地址。'
        );
      }
      throw e;
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[绘图服务] API 错误 (${response.status}):`, errText);
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

    // 响应解析方案 A：处理 ZIP 归档格式（NovelAI 官方接口默认返回格式）
    if (
      contentType?.includes('application/zip') ||
      contentType?.includes('application/x-zip-compressed')
    ) {
      const blob = await response.blob();
      const zip = await JSZip.loadAsync(blob);
      const files = Object.keys(zip.files);
      const imageFile = files.find(
        (f) => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp')
      );

      if (!imageFile) throw new Error('No image found in NovelAI response zip');

      const imageBlob = await zip.file(imageFile)?.async('blob');
      if (!imageBlob) throw new Error('Failed to extract image from zip');

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageBlob);
      });
    }

    // 响应解析方案 B：处理直接返回的单张图像二进制流。
    if (contentType?.includes('image/')) {
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    const text = await response.text();
    throw new Error(
      `Unexpected NovelAI response format (${contentType}): ${text.substring(0, 100)}`
    );
  },

  // 连通性测试模块：验证与 NovelAI 各 Endpoint 的通信完整性。
  async testNovelAIConnection(config: any): Promise<boolean> {
    if (!config.apiKey) throw new Error('API Key 不能为空');

    const baseUrl =
      config.apiBaseUrl || 'https://nai-proxy.2752026184.workers.dev/ai/generate-image';
    const rawModel = config.model || 'nai-diffusion-3';
    const model = this.sanitizeModelId(rawModel);
    const isV4 = model.includes('nai-diffusion-4');
    const isV45 = model.includes('nai-diffusion-4-5');

    console.log(
      `[DrawingService] 正在测试连接至: ${baseUrl}，使用模型: ${model} (V4 系列: ${isV4})`
    );

    let parameters: any = {};

    if (isV4) {
      parameters = {
        width: 832,
        height: 1216,
        steps: 28,
        scale: 6.0,
        sampler: 'k_euler_a',
        seed: Math.floor(Math.random() * 1000000000),
        uc: 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
        params_version: 1,
        cfg_rescale: 0,
        noise_schedule: 'native',
        v4_prompt_optimizer: true,
        v4_skip_cfg_above_sigma: 19,
        variety_boost: true,
        decrisp_mode: false,
        qualityToggle: true
      };
      if (isV45) parameters.use_coords = true;
    } else {
      parameters = {
        width: 64,
        height: 64,
        steps: 1,
        seed: Math.floor(Math.random() * 1000000000),
        sampler: 'k_euler_ancestral',
        n_samples: 1,
        ucPreset: 0,
        qualityToggle: false,
        sm: false,
        sm_dyn: false,
        uc: '',
        negative_prompt: ''
      };
    }

    const testBody: any = {
      input: isV4 ? 'A girl with a red bow sitting on a porch' : 'test connection',
      model: model,
      action: 'generate',
      parameters: parameters
    };

    console.log('[DrawingService] Test Request Body:', JSON.stringify(testBody, null, 2));

    const isOfficialStructure =
      config.providerType === 'novelai' ||
      baseUrl.includes('novelai.net') ||
      baseUrl.includes('workers.dev');
    const requestBody = isOfficialStructure
      ? testBody
      : {
          ...testBody.parameters,
          prompt: testBody.input,
          model: testBody.model
        };

    try {
      const response = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[DrawingService] Test Connection Failed (${response.status}):`, errText);
        throw new Error(`连接失败 (${response.status}): ${errText.substring(0, 100)}`);
      }

      console.log('[DrawingService] Test Connection Success!');
      return true;
    } catch (e: any) {
      console.error('[DrawingService] Test Connection Fetch Error:', e);
      if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
        throw new Error('网络请求失败 (可能是 CORS 跨域问题)。请尝试使用代理地址。');
      }
      throw e;
    }
  },

  // 第二阶段：调用通用图像生成 API (OpenAI / SiliconFlow / Flux 等)。
  async generateImage(
    prompt: string,
    negativePrompt: string,
    referenceImages: string[] = []
  ): Promise<string> {
    const settingsStore = useSettingsStore();
    const config = settingsStore.drawingConfig;

    if (!config.enabled) return '';

    // 逻辑路由：若当前模式为 NovelAI，则重定向至专有生成逻辑。
    if (config.providerType === 'novelai') {
      return this.generateImageNovelAI(prompt, negativePrompt, config);
    }

    if (!config.apiKey || !config.apiBaseUrl) {
      throw new Error('未配置绘图 API (URL 或 Key)');
    }

    // 终结点 Endpoint 构造逻辑
    let baseUrl = config.apiBaseUrl.replace(/\/+$/, '');
    let targetUrl = '';
    const isStandardImageApi =
      baseUrl.endsWith('/images/generations') || config.providerType === 'openai-image';

    if (isStandardImageApi) {
      targetUrl = baseUrl;
    } else {
      if (baseUrl.endsWith('/chat/completions')) {
        baseUrl = baseUrl.replace(/\/chat\/completions$/, '');
      }
      targetUrl = baseUrl + '/chat/completions';
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000 * 2); // 2 min timeout

      let res: Response;

      if (isStandardImageApi) {
        // Standard OpenAI / SiliconFlow Images Generations API
        const imageBody = {
          model: config.model || 'black-forest-labs/FLUX.1-schnell',
          prompt: prompt,
          negative_prompt: negativePrompt,
          image_size: `${config.width || 1024}x${config.height || 1024}`,
          batch_size: 1,
          seed: Math.floor(Math.random() * 1000000)
        };

        res = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(imageBody),
          signal: controller.signal
        });
      } else {
        // 混合多模态对话 API (适配 Nanobanana / Gemini / 及各类自定义中继)
        const content: any[] = [
          { type: 'text', text: `Prompt: ${prompt}\nNegative Prompt: ${negativePrompt}` }
        ];

        if (referenceImages && referenceImages.length > 0) {
          for (const imgData of referenceImages) {
            content.push({
              type: 'image_url',
              image_url: { url: imgData }
            });
          }
        }

        const chatBody = {
          model: config.model || 'gemini-2.0-flash-exp',
          messages: [{ role: 'user', content: content }],
          stream: true
        };

        res = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream'
          },
          body: JSON.stringify(chatBody),
          signal: controller.signal
        });
      }

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${res.statusText || ''} ${errorText}`);
      }

      // 响应处理方案 A：处理标准的同步绘图响应（JSON 载荷）
      if (isStandardImageApi) {
        const data = await res.json();
        const url = data?.data?.[0]?.url || data?.images?.[0]?.url;
        if (!url) {
          console.error('[DrawingService] Image API Response:', data);
          throw new Error('未从 API 响应中获取到图片 URL');
        }
        return url;
      }

      // 响应处理方案 B：处理多模态对话响应流（SSE 序列 / Markdown 图片析构）
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

              // 匹配规则 1: 标准 OpenAI 图像载荷或 Gemini 多模态输出
              if (ch?.delta?.image_url?.url) {
                imageUrl = ch.delta.image_url.url;
              }
              // 匹配规则 2: 回退至通用 URL 标记字段
              else if (ch?.delta?.url) {
                imageUrl = ch.delta.url;
              }
              // 匹配规则 3: 处理文本累积流（用于析构 Markdown 图片标记）
              else if (typeof ch?.delta?.content === 'string') {
                accumulatedContent += ch.delta.content;
              }
              // 匹配规则 4: 非流式降级捕获
              else if (ch?.url) {
                imageUrl = ch.url;
              }
            } catch (e) {
              // Ignore parse errors for partial chunks
            }
          }
        }

        // 析构逻辑：在文本流累积过程中持续捕捉 Markdown 图片规律
        if (!imageUrl && accumulatedContent) {
          // 正则描述：匹配 ![alt](https://...) 格式，兼容带标题的扩展语法并确保协议头完整
          const mdMatch = accumulatedContent.match(
            /!\[.*?\]\((https?:\/\/[^\s\)]+)(?:[\s"'].*?)?\)/
          );
          if (mdMatch && mdMatch[1]) {
            imageUrl = mdMatch[1];
          }
        }

        if (imageUrl) break; // Stop once we have the URL
      }

      // 终态回溯：若流结束瞬间 URL 被切分在最后一帧，则执行最后一次内容检查。
      if (!imageUrl && accumulatedContent) {
        const mdMatch = accumulatedContent.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)(?:[\s"'].*?)?\)/);
        if (mdMatch && mdMatch[1]) {
          imageUrl = mdMatch[1];
        }
      }

      if (!imageUrl && !isSSE) {
        const parsed = JSON.parse(fullRawResponse);
        const ch = parsed?.choices?.[0];
 
        // 深入检查消息正文
        const content = ch?.message?.content || '';
        const mdMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s\)]+)(?:[\s"'].*?)?\)/);
        if (mdMatch && mdMatch[1]) {
          imageUrl = mdMatch[1];
        }
      }

      if (!imageUrl) {
        console.error('[绘图服务] 原始响应追踪 (前1000字符):', fullRawResponse.slice(0, 1000));
        throw new Error('未从 API 响应中获取到图片 URL');
      }

      return imageUrl;
    } catch (error) {
      console.error('[DrawingService] Image generation failed:', error);
      throw error;
    }
  },

  // 主工作流模块：协调提示词生成与图像渲染全链路流程。
  async process(
    storyText: string,
    location?: string,
    characters?: any[],
    extraReferenceImages: string[] = []
  ) {
    const settingsStore = useSettingsStore();
    const toastStore = useToastStore();
    const config = settingsStore.drawingConfig;

    if (!config.enabled) {
      console.log('[绘图服务] 已跳过：设置中禁用了该功能');
      return null;
    }

    try {
      console.log('[DrawingService] 正在开启绘图生成工作流...');

      // 1. 调用 LLM 提示词导演生成精准描述词 (Phase 1)
      const { prompt: llmPrompt, negative_prompt: llmNegativePrompt } = await this.generatePrompt(
        storyText,
        location,
        characters
      );
      console.log('[DrawingService] LLM Generated Prompt:', llmPrompt);
      console.log('[DrawingService] LLM 生成的反向提示词:', llmNegativePrompt);

      // 2. 合并用户自定义的额外提示词 (针对 NovelAI 专属增强策略)
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

      // 3. Load Reference Images (Heads + Extra)
      const refImages: string[] = [...extraReferenceImages];
      if (config.useReferenceImages && characters && characters.length > 0) {
        console.log(
          `[DrawingService] Checking for character reference images among: ${characters.map((c) => c.name).join(', ')}`
        );
        for (const char of characters) {
          const headUrl = findAvatarImage(char.name, headAssets);
          if (headUrl) {
            try {
              console.log(`[DrawingService] Found reference image for ${char.name}, loading...`);
              const base64 = await this.urlToBase64(headUrl);
              refImages.push(base64);
              console.log(`[DrawingService] Successfully loaded reference image for ${char.name}`);
            } catch (e) {
              console.error(`[DrawingService] Failed to load reference image for ${char.name}:`, e);
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
