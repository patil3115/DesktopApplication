import { VideoCompressorAPI } from '../common/types';

declare global {
  interface Window {
    videoCompressor: VideoCompressorAPI;
  }
}

export {};
