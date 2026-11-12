import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url';
import { segmentationAlpha } from './segmentation-mask.js';

self.onmessage = async ({ data: { pixels, width, height } }) => {
  let segmenter;
  try {
    if (!await FilesetResolver.isSimdSupported()) throw new Error('Unsupported browser');
    segmenter = await ImageSegmenter.createFromOptions({ wasmLoaderPath, wasmBinaryPath }, {
      canvas: new OffscreenCanvas(1, 1),
      baseOptions: { modelAssetPath: new URL('/avatar-model/selfie_multiclass_256x256-v1.tflite', self.location.origin).href, delegate: 'CPU' },
      runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: false,
    });
    const source = new OffscreenCanvas(width, height);
    source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    let alpha;
    segmenter.segment(source, (result) => {
      const mask = result.categoryMask;
      alpha = segmentationAlpha(mask.getAsUint8Array(), mask.width, mask.height, width, height);
    });
    source.width = source.height = 0;
    self.postMessage({ alpha: alpha.buffer }, [alpha.buffer]);
  } catch { self.postMessage({ error: 'Automatic cutout unavailable' }); }
  finally { new Uint8ClampedArray(pixels).fill(0); segmenter?.close(); }
};
