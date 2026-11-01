import React, { useState, useEffect } from 'react';
import { Video, Music } from 'lucide-react';
import { Header } from './components/Header';
import { PrivacyBanner } from './components/PrivacyBanner';
import { DropZone } from './components/DropZone';
import { VideoInfo } from './components/VideoInfo';
import { SettingsPanel } from './components/SettingsPanel';
import { AudioSettingsPanel } from './components/AudioSettingsPanel';
import { ProgressBar } from './components/ProgressBar';
import { ResultCard } from './components/ResultCard';
import { AudioResultCard } from './components/AudioResultCard';
import { ErrorCard } from './components/ErrorCard';
import { DesktopRequiredBanner } from './components/DesktopRequiredBanner';
import {
  VideoMetadata,
  CompressionSettings,
  AudioExtractionSettings,
  CompressionProgress,
  CompressionResult,
  AudioExtractionResult,
  StructuredError
} from '../common/types';

export const App: React.FC = () => {
  const isDesktop = typeof window !== 'undefined' && Boolean(window.videoCompressor);

  // Active Application Mode
  const [activeMode, setActiveMode] = useState<'compress' | 'audio'>('compress');

  // Shared Video File State
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [error, setError] = useState<StructuredError | null>(null);

  // Video Compressor States
  const [isCompressing, setIsCompressing] = useState(false);
  const [isCancellingCompress, setIsCancellingCompress] = useState(false);
  const [compressProgress, setCompressProgress] = useState<CompressionProgress | null>(null);
  const [compressResult, setCompressResult] = useState<CompressionResult | null>(null);
  const [compressSettings, setCompressSettings] = useState<CompressionSettings>({
    quality: 'medium',
    resolution: 'original',
    codec: 'h264',
    audioCodec: 'aac',
    removeMetadata: true,
    customOutputDir: null
  });

  // Audio Extractor States
  const [isExtractingAudio, setIsExtractingAudio] = useState(false);
  const [isCancellingAudio, setIsCancellingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState<CompressionProgress | null>(null);
  const [audioResult, setAudioResult] = useState<AudioExtractionResult | null>(null);
  const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] = useState<number>(0);
  const [audioSettings, setAudioSettings] = useState<AudioExtractionSettings>({
    format: 'mp3',
    bitrate: '192k',
    audioStreamIndex: 0,
    removeMetadata: true,
    customOutputDir: null
  });

  // Listen to video compression progress events
  useEffect(() => {
    if (!isDesktop || !window.videoCompressor?.onProgress) return;
    const unsubscribe = window.videoCompressor.onProgress((p) => {
      setCompressProgress(p);
    });
    return () => {
      unsubscribe();
    };
  }, [isDesktop]);

  // Listen to audio extraction progress events
  useEffect(() => {
    if (!isDesktop || !window.videoCompressor?.onAudioProgress) return;
    const unsubscribe = window.videoCompressor.onAudioProgress((p) => {
      setAudioProgress(p);
    });
    return () => {
      unsubscribe();
    };
  }, [isDesktop]);

  // Safe mode switching
  const handleSwitchMode = (newMode: 'compress' | 'audio') => {
    if (newMode === activeMode) return;

    if (isCompressing || isExtractingAudio) {
      const confirmSwitch = window.confirm(
        'A conversion task is currently running in the background. Switching views will not cancel it. Switch now?'
      );
      if (!confirmSwitch) return;
    }

    setError(null);
    setActiveMode(newMode);
  };

  const handleSelectFile = async () => {
    setError(null);
    setCompressResult(null);
    setAudioResult(null);

    if (!isDesktop || !window.videoCompressor) {
      setError({
        code: 'ELECTRON_RUNTIME_UNAVAILABLE',
        userMessage: 'Secure Video Compressor must be launched as the desktop application.'
      });
      return;
    }

    setIsLoadingFile(true);

    try {
      const selectFn = window.videoCompressor.selectVideo || window.videoCompressor.selectVideoFile;
      if (typeof selectFn !== 'function') {
        setError({
          code: 'PRELOAD_UNAVAILABLE',
          userMessage: 'The desktop security bridge is not available.'
        });
        return;
      }

      const res = await selectFn();

      if (res.canceled) {
        return;
      }

      if (res.error) {
        setError(res.error);
      } else if (res.metadata) {
        setVideoMetadata(res.metadata);
        setSelectedAudioTrackIndex(0);
        setAudioSettings((prev) => ({ ...prev, audioStreamIndex: 0 }));
      }
    } catch {
      setError({
        code: 'IPC_UNAVAILABLE',
        userMessage: 'Communication with desktop host failed.'
      });
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Output directory handlers
  const handleSelectCompressOutputDir = async () => {
    if (!isDesktop || !window.videoCompressor) return;
    try {
      const res = await window.videoCompressor.selectOutputDirectory();
      if (!res.canceled && res.dirPath) {
        setCompressSettings((prev) => ({ ...prev, customOutputDir: res.dirPath }));
      }
    } catch {
      // Ignore
    }
  };

  const handleSelectAudioOutputDir = async () => {
    if (!isDesktop || !window.videoCompressor) return;
    try {
      const res = await window.videoCompressor.selectOutputDirectory();
      if (!res.canceled && res.dirPath) {
        setAudioSettings((prev) => ({ ...prev, customOutputDir: res.dirPath }));
      }
    } catch {
      // Ignore
    }
  };

  // Video compression action
  const handleStartCompression = async () => {
    if (!videoMetadata || !isDesktop || !window.videoCompressor) return;

    setError(null);
    setCompressResult(null);
    setCompressProgress(null);
    setIsCompressing(true);
    setIsCancellingCompress(false);

    try {
      const res = await window.videoCompressor.startCompression(compressSettings);
      if (res.success && res.result) {
        setCompressResult(res.result);
      } else if (res.error && res.error.code !== 'CANCELLED') {
        setError(res.error);
      }
    } catch {
      setError({
        code: 'COMPRESSION_FAILED',
        userMessage: 'An unexpected error occurred during compression.'
      });
    } finally {
      setIsCompressing(false);
      setIsCancellingCompress(false);
    }
  };

  const handleCancelCompression = async () => {
    if (!isDesktop || !window.videoCompressor) return;
    setIsCancellingCompress(true);
    try {
      await window.videoCompressor.cancelCompression();
    } catch (err) {
      console.warn('Cancel compress error', err);
    }
  };

  // Audio extraction action
  const handleStartAudioExtraction = async () => {
    if (!videoMetadata || !isDesktop || !window.videoCompressor) return;

    if (!videoMetadata.hasAudio || videoMetadata.audioStreams.length === 0) {
      setError({
        code: 'AUDIO_STREAM_NOT_FOUND',
        userMessage: 'This video does not contain an audio stream that can be extracted.'
      });
      return;
    }

    setError(null);
    setAudioResult(null);
    setAudioProgress(null);
    setIsExtractingAudio(true);
    setIsCancellingAudio(false);

    try {
      const res = await window.videoCompressor.startAudioExtraction({
        ...audioSettings,
        audioStreamIndex: selectedAudioTrackIndex
      });

      if (res.success && res.result) {
        setAudioResult(res.result);
      } else if (res.error && res.error.code !== 'CANCELLED') {
        setError(res.error);
      }
    } catch {
      setError({
        code: 'COMPRESSION_FAILED',
        userMessage: 'An unexpected error occurred during audio extraction.'
      });
    } finally {
      setIsExtractingAudio(false);
      setIsCancellingAudio(false);
    }
  };

  const handleCancelAudioExtraction = async () => {
    if (!isDesktop || !window.videoCompressor) return;
    setIsCancellingAudio(true);
    try {
      await window.videoCompressor.cancelAudioExtraction();
    } catch (err) {
      console.warn('Cancel audio extraction error', err);
    }
  };

  const handleOpenFolder = (targetPath?: string) => {
    if (targetPath && isDesktop && window.videoCompressor) {
      window.videoCompressor.showInFolder(targetPath);
    }
  };

  return (
    <div className="app-container">
      <Header />

      {/* Mode Switcher Navigation Tabs */}
      <nav className="mode-tabs" aria-label="Application Modes">
        <button
          type="button"
          className={`mode-tab ${activeMode === 'compress' ? 'active' : ''}`}
          onClick={() => handleSwitchMode('compress')}
        >
          <Video size={18} />
          <span>Video Compression</span>
        </button>

        <button
          type="button"
          className={`mode-tab ${activeMode === 'audio' ? 'active active-audio' : ''}`}
          onClick={() => handleSwitchMode('audio')}
        >
          <Music size={18} />
          <span>Video → Audio</span>
        </button>
      </nav>

      <PrivacyBanner mode={activeMode} />

      {!isDesktop && <DesktopRequiredBanner />}

      {error && <ErrorCard error={error} onDismiss={() => setError(null)} />}

      {isDesktop && !videoMetadata && (
        <DropZone onBrowse={handleSelectFile} isLoading={isLoadingFile} />
      )}

      {isDesktop && videoMetadata && (
        <>
          <VideoInfo
            metadata={videoMetadata}
            onChangeFile={handleSelectFile}
            disabled={isCompressing || isExtractingAudio}
            mode={activeMode}
            selectedAudioTrackIndex={selectedAudioTrackIndex}
            onSelectAudioTrack={(idx) => {
              setSelectedAudioTrackIndex(idx);
              setAudioSettings((prev) => ({ ...prev, audioStreamIndex: idx }));
            }}
          />

          {/* MODE 1: Video Compressor */}
          {activeMode === 'compress' && (
            <>
              {!isCompressing && !compressResult && (
                <SettingsPanel
                  settings={compressSettings}
                  onChange={setCompressSettings}
                  onCompress={handleStartCompression}
                  onSelectOutputDir={handleSelectCompressOutputDir}
                  disabled={isCompressing || isExtractingAudio}
                />
              )}

              {isCompressing && (
                <ProgressBar
                  progress={compressProgress}
                  onCancel={handleCancelCompression}
                  isCancelling={isCancellingCompress}
                />
              )}

              {compressResult && !isCompressing && (
                <ResultCard
                  result={compressResult}
                  onOpenFolder={() => handleOpenFolder(compressResult.outputPath)}
                  onReset={() => {
                    setCompressResult(null);
                    setCompressProgress(null);
                  }}
                />
              )}
            </>
          )}

          {/* MODE 2: Video -> Audio Extractor */}
          {activeMode === 'audio' && (
            <>
              {!isExtractingAudio && !audioResult && (
                <AudioSettingsPanel
                  settings={audioSettings}
                  onChange={setAudioSettings}
                  onExtract={handleStartAudioExtraction}
                  onSelectOutputDir={handleSelectAudioOutputDir}
                  disabled={isExtractingAudio || isCompressing}
                  selectedStream={videoMetadata.audioStreams[selectedAudioTrackIndex]}
                  hasAudio={videoMetadata.hasAudio}
                />
              )}

              {isExtractingAudio && (
                <ProgressBar
                  progress={audioProgress}
                  onCancel={handleCancelAudioExtraction}
                  isCancelling={isCancellingAudio}
                />
              )}

              {audioResult && !isExtractingAudio && (
                <AudioResultCard
                  result={audioResult}
                  onOpenFolder={() => handleOpenFolder(audioResult.outputPath)}
                  onReset={() => {
                    setAudioResult(null);
                    setAudioProgress(null);
                  }}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
