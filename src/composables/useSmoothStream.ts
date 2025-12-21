import { ref, watch, type Ref } from 'vue';
import { audioManager } from '@/services/audio';

interface SmoothStreamOptions {
  minChunkSize?: number;
  typingSpeed?: number;
}

export function useSmoothStream(
  source: Ref<string>, 
  isStreaming: Ref<boolean>,
  options: SmoothStreamOptions = {}
) {
  const displayed = ref('');
  const buffer = ref('');
  const queue = ref('');
  let intervalId: any = null;
  let processedLength = 0;
  
  const minChunkSize = options.minChunkSize ?? 15; // Default 15 chars
  const typingSpeed = options.typingSpeed ?? 30;   // Default 30ms per char

  watch(source, (newVal) => {
    if (!newVal) {
      // Reset
      displayed.value = '';
      buffer.value = '';
      queue.value = '';
      processedLength = 0;
      if (intervalId) {
        clearTimeout(intervalId);
        intervalId = null;
      }
      return;
    }

    if (newVal.length < processedLength) {
      // Source reset or shrank
      processedLength = 0;
      displayed.value = '';
    }

    const delta = newVal.slice(processedLength);
    if (delta) {
      buffer.value += delta;
      processedLength = newVal.length;
      
      // If buffer reaches threshold, move to queue
      if (buffer.value.length >= minChunkSize) {
        flushBufferToQueue();
      }
    }
  });

  // Watch streaming status to flush remaining buffer when done
  watch(isStreaming, (streaming) => {
    if (!streaming) {
      flushBufferToQueue();
    }
  });

  function flushBufferToQueue() {
    if (!buffer.value) return;
    queue.value += buffer.value;
    buffer.value = '';
    startTyping();
  }

  function startTyping() {
    if (intervalId) return;
    
    const typeNext = () => {
      if (queue.value.length > 0) {
        const char = queue.value[0];
        if (char === undefined) {
           queue.value = queue.value.slice(1);
           intervalId = setTimeout(typeNext, 0);
           return;
        }

        queue.value = queue.value.slice(1);
        displayed.value += char;
        
        // Play writing sound
        if (char.trim() !== '') {
            audioManager.playWritingSound();
        }

        // Dynamic delay for natural feel
        let delay = typingSpeed;
        
        // 1. Random variance
        delay = delay * (0.7 + Math.random() * 0.6);

        // 2. Punctuation pauses
        if (/[，,、]/.test(char)) delay += 150;
        else if (/[。！!？?;；]/.test(char)) delay += 300;
        else if (/\n/.test(char)) delay += 400;

        intervalId = setTimeout(typeNext, Math.max(10, delay));
      } else {
        // Queue empty
        // If we still have buffer (waiting for threshold) and streaming is done, flush it
        if (buffer.value.length > 0 && !isStreaming.value) {
            flushBufferToQueue();
            intervalId = setTimeout(typeNext, 0);
        } else if (queue.value.length === 0 && buffer.value.length === 0 && !isStreaming.value) {
            // Really done
            intervalId = null;
        } else {
            // Wait for more data
            intervalId = setTimeout(typeNext, 50);
        }
      }
    };
    
    typeNext();
  }

  return {
    displayed
  };
}
