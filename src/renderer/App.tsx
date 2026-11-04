import React, { useState, useEffect, useRef } from 'react';
import { Video, Music } from 'lucide-react';
import { Header } from './components/Header';
import { PrivacyBanner } from './components/PrivacyBanner';
import { DropZone } from './components/DropZone';
import { VideoInfo } from './components/VideoInfo';
import { VideoQueue } from './components/VideoQueue';
import { SettingsPanel } from './components/SettingsPanel';
import { AudioSettingsPanel } from './components/AudioSettingsPanel';
import { ProgressBar, BatchProgressInfo } from './components/ProgressBar';
import { ResultCard } from './components/ResultCard';
import { AudioResultCard } from './components/AudioResultCard';
import { BatchResultCard } from './components/BatchResultCard';
import { ErrorCard } from './components/ErrorCard';
import { DesktopRequiredBanner } from './components/DesktopRequiredBanner';
import {
  VideoMetadata,
  VideoQueueItem,
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

  // Shared Video File & Queue State
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [queue, setQueue] = useState<VideoQueueItem[]>([]);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [error, setError] = useState<StructuredError | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);

  // Batch Execution States
  const [batchProgressInfo, setBatchProgressInfo] = useState<BatchProgressInfo | null>(null);
  const [batchResult, setBatchResult] = useState<{ isCancelled: boolean; items: VideoQueueItem[] } | null>(null);
  const cancelledRef = useRef<boolean>(false);

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
    setDuplicateNotice(null);
    setActiveMode(newMode);
  };

  const handleSelectFile = async (isAddMore = false) => {
    setError(null);
    setDuplicateNotice(null);
    if (!isAddMore) {
      setCompressResult(null);
      setAudioResult(null);
      setBatchResult(null);
    }

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

      const incomingFiles =
        res.files && res.files.length > 0
          ? res.files
          : res.metadata
          ? [{ filePath: res.filePath || res.metadata.filePath, metadata: res.metadata }]
          : [];

      if (incomingFiles.length === 0) {
        if (res.error) {
          setError(res.error);
        }
        return;
      }

      const existingQueue = isAddMore ? queue : [];
      const newItems: VideoQueueItem[] = [];
      let duplicatesCount = 0;
      let firstError: StructuredError | null = null;

      for (const item of incomingFiles) {
        if (!item.metadata) {
          if (!firstError && item.error) {
            firstError = item.error;
          }
          continue;
        }

        const isDuplicate = existingQueue.some(
          (q) => q.filePath.toLowerCase() === item.filePath.toLowerCase()
        );
        if (isDuplicate) {
          duplicatesCount++;
          continue;
        }

        newItems.push({
          id: item.filePath,
          filePath: item.filePath,
          fileName: item.metadata.fileName,
          fileSizeBytes: item.metadata.fileSizeBytes,
          formattedSize: item.metadata.formattedSize,
          durationSeconds: item.metadata.durationSeconds,
          formattedDuration: item.metadata.formattedDuration,
          resolutionLabel: item.metadata.resolutionLabel,
          hasAudio: item.metadata.hasAudio,
          metadata: item.metadata,
          status: 'pending'
        });
      }

      if (duplicatesCount > 0) {
        setDuplicateNotice(
          `${duplicatesCount} duplicate video${duplicatesCount > 1 ? 's were' : ' was'} skipped.`
        );
      }

      if (newItems.length === 0 && firstError && !isAddMore) {
        setError(firstError);
        return;
      }

      const finalQueue = isAddMore ? [...existingQueue, ...newItems] : newItems;
      setQueue(finalQueue);

      if (finalQueue.length === 1 && finalQueue[0]) {
        setVideoMetadata(finalQueue[0].metadata);
        setSelectedAudioTrackIndex(0);
        setAudioSettings((prev) => ({ ...prev, audioStreamIndex: 0 }));
      } else if (finalQueue.length > 1) {
        setVideoMetadata(null);
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

  const handleRemoveItem = (id: string) => {
    const nextQueue = queue.filter((item) => item.id !== id);
    setQueue(nextQueue);
    if (nextQueue.length === 1 && nextQueue[0]) {
      setVideoMetadata(nextQueue[0].metadata);
      setSelectedAudioTrackIndex(0);
      setAudioSettings((prev) => ({ ...prev, audioStreamIndex: 0 }));
    } else if (nextQueue.length === 0) {
      setVideoMetadata(null);
    }
  };

  const handleClearAll = () => {
    setQueue([]);
    setVideoMetadata(null);
    setBatchResult(null);
    setCompressResult(null);
    setAudioResult(null);
    setBatchProgressInfo(null);
    setDuplicateNotice(null);
    setError(null);
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

  // Video compression action (handles both single and batch)
  const handleStartCompression = async () => {
    if (!isDesktop || !window.videoCompressor) return;

    setError(null);
    setCompressResult(null);
    setCompressProgress(null);
    setBatchResult(null);
    setIsCompressing(true);
    setIsCancellingCompress(false);
    cancelledRef.current = false;

    // SINGLE FILE MODE: preserve existing behavior 100%
    if (videoMetadata && queue.length <= 1) {
      try {
        const targetPath = queue[0]?.filePath || videoMetadata.filePath;
        const res = await window.videoCompressor.startCompression(compressSettings, targetPath);
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
      return;
    }

    // BATCH MODE: sequential processing
    if (queue.length > 1) {
      const itemsCopy: VideoQueueItem[] = queue.map((item) => ({
        ...item,
        status: 'pending',
        compressResult: undefined,
        error: undefined
      }));
      setQueue(itemsCopy);

      let completedCount = 0;
      let wasCancelled = false;

      for (let i = 0; i < itemsCopy.length; i++) {
        if (cancelledRef.current) {
          wasCancelled = true;
          for (let j = i; j < itemsCopy.length; j++) {
            const currentPending = itemsCopy[j];
            if (currentPending) {
              itemsCopy[j] = { ...currentPending, status: 'cancelled' };
            }
          }
          break;
        }

        const currentItem = itemsCopy[i];
        if (!currentItem) continue;

        itemsCopy[i] = { ...currentItem, status: 'processing' };
        setQueue([...itemsCopy]);

        setBatchProgressInfo({
          currentIndex: i,
          totalCount: itemsCopy.length,
          currentFileName: currentItem.fileName,
          completedCount
        });
        setCompressProgress(null);

        try {
          const res = await window.videoCompressor.startCompression(
            compressSettings,
            currentItem.filePath
          );

          if (res.success && res.result) {
            itemsCopy[i] = {
              ...currentItem,
              status: 'completed',
              compressResult: res.result
            };
            completedCount++;
          } else if (res.error) {
            if (res.error.code === 'CANCELLED' || cancelledRef.current) {
              wasCancelled = true;
              itemsCopy[i] = { ...currentItem, status: 'cancelled' };
              for (let j = i + 1; j < itemsCopy.length; j++) {
                const remaining = itemsCopy[j];
                if (remaining) {
                  itemsCopy[j] = { ...remaining, status: 'cancelled' };
                }
              }
              break;
            } else {
              // Failure does not stop the batch
              itemsCopy[i] = {
                ...currentItem,
                status: 'failed',
                error: res.error
              };
            }
          }
        } catch (err) {
          itemsCopy[i] = {
            ...currentItem,
            status: 'failed',
            error: {
              code: 'COMPRESSION_FAILED',
              userMessage: err instanceof Error ? err.message : 'Compression error.'
            }
          };
        }

        setQueue([...itemsCopy]);
      }

      setBatchProgressInfo(null);
      setIsCompressing(false);
      setIsCancellingCompress(false);
      setBatchResult({ isCancelled: wasCancelled, items: [...itemsCopy] });
    }
  };

  const handleCancelCompression = async () => {
    if (!isDesktop || !window.videoCompressor) return;
    cancelledRef.current = true;
    setIsCancellingCompress(true);
    try {
      await window.videoCompressor.cancelCompression();
    } catch (err) {
      console.warn('Cancel compress error', err);
    }
  };

  // Audio extraction action (handles both single and batch)
  const handleStartAudioExtraction = async () => {
    if (!isDesktop || !window.videoCompressor) return;

    setError(null);
    setAudioResult(null);
    setAudioProgress(null);
    setBatchResult(null);
    setIsExtractingAudio(true);
    setIsCancellingAudio(false);
    cancelledRef.current = false;

    // SINGLE FILE MODE: preserve existing behavior 100%
    if (videoMetadata && queue.length <= 1) {
      if (!videoMetadata.hasAudio || videoMetadata.audioStreams.length === 0) {
        setError({
          code: 'AUDIO_STREAM_NOT_FOUND',
          userMessage: 'This video does not contain an audio stream that can be extracted.'
        });
        setIsExtractingAudio(false);
        return;
      }

      try {
        const targetPath = queue[0]?.filePath || videoMetadata.filePath;
        const res = await window.videoCompressor.startAudioExtraction(
          {
            ...audioSettings,
            audioStreamIndex: selectedAudioTrackIndex
          },
          targetPath
        );

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
      return;
    }

    // BATCH MODE: sequential processing
    if (queue.length > 1) {
      const itemsCopy: VideoQueueItem[] = queue.map((item) => ({
        ...item,
        status: 'pending',
        audioResult: undefined,
        error: undefined
      }));
      setQueue(itemsCopy);

      let completedCount = 0;
      let wasCancelled = false;

      for (let i = 0; i < itemsCopy.length; i++) {
        if (cancelledRef.current) {
          wasCancelled = true;
          for (let j = i; j < itemsCopy.length; j++) {
            const pending = itemsCopy[j];
            if (pending) {
              itemsCopy[j] = { ...pending, status: 'cancelled' };
            }
          }
          break;
        }

        const currentItem = itemsCopy[i];
        if (!currentItem) continue;

        itemsCopy[i] = { ...currentItem, status: 'processing' };
        setQueue([...itemsCopy]);

        setBatchProgressInfo({
          currentIndex: i,
          totalCount: itemsCopy.length,
          currentFileName: currentItem.fileName,
          completedCount
        });
        setAudioProgress(null);

        // If this video has no audio track, mark failed and continue
        if (!currentItem.hasAudio) {
          itemsCopy[i] = {
            ...currentItem,
            status: 'failed',
            error: {
              code: 'AUDIO_STREAM_NOT_FOUND',
              userMessage: 'This video does not contain an audio stream that can be extracted.'
            }
          };
          setQueue([...itemsCopy]);
          continue;
        }

        try {
          const res = await window.videoCompressor.startAudioExtraction(
            { ...audioSettings, audioStreamIndex: 0 },
            currentItem.filePath
          );

          if (res.success && res.result) {
            itemsCopy[i] = {
              ...currentItem,
              status: 'completed',
              audioResult: res.result
            };
            completedCount++;
          } else if (res.error) {
            if (res.error.code === 'CANCELLED' || cancelledRef.current) {
              wasCancelled = true;
              itemsCopy[i] = { ...currentItem, status: 'cancelled' };
              for (let j = i + 1; j < itemsCopy.length; j++) {
                const remaining = itemsCopy[j];
                if (remaining) {
                  itemsCopy[j] = { ...remaining, status: 'cancelled' };
                }
              }
              break;
            } else {
              itemsCopy[i] = {
                ...currentItem,
                status: 'failed',
                error: res.error
              };
            }
          }
        } catch (err) {
          itemsCopy[i] = {
            ...currentItem,
            status: 'failed',
            error: {
              code: 'COMPRESSION_FAILED',
              userMessage: err instanceof Error ? err.message : 'Audio extraction error.'
            }
          };
        }

        setQueue([...itemsCopy]);
      }

      setBatchProgressInfo(null);
      setIsExtractingAudio(false);
      setIsCancellingAudio(false);
      setBatchResult({ isCancelled: wasCancelled, items: [...itemsCopy] });
    }
  };

  const handleCancelAudioExtraction = async () => {
    if (!isDesktop || !window.videoCompressor) return;
    cancelledRef.current = true;
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

      {/* 1. INITIAL STATE: No videos selected */}
      {isDesktop && !videoMetadata && queue.length === 0 && (
        <DropZone onBrowse={() => handleSelectFile(false)} isLoading={isLoadingFile} />
      )}

      {/* 2. SINGLE VIDEO STATE: Exactly 1 video selected (existing behavior preserved) */}
      {isDesktop && videoMetadata && queue.length <= 1 && (
        <>
          <VideoInfo
            metadata={videoMetadata}
            onChangeFile={() => handleSelectFile(false)}
            onAddMore={() => handleSelectFile(true)}
            disabled={isCompressing || isExtractingAudio}
            mode={activeMode}
            selectedAudioTrackIndex={selectedAudioTrackIndex}
            onSelectAudioTrack={(idx) => {
              setSelectedAudioTrackIndex(idx);
              setAudioSettings((prev) => ({ ...prev, audioStreamIndex: idx }));
            }}
          />

          {/* MODE 1: Single Video Compression */}
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
                  mode="compress"
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

          {/* MODE 2: Single Video -> Audio Extractor */}
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
                  mode="audio"
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

      {/* 3. MULTI-VIDEO BATCH STATE: 2 or more videos selected */}
      {isDesktop && queue.length > 1 && (
        <>
          {/* Queue and Settings (when not actively compressing/extracting and no final result yet) */}
          {!isCompressing && !isExtractingAudio && !batchResult && (
            <>
              <VideoQueue
                items={queue}
                onAddMore={() => handleSelectFile(true)}
                onClearAll={handleClearAll}
                onRemoveItem={handleRemoveItem}
                disabled={isCompressing || isExtractingAudio}
                mode={activeMode}
                duplicateNotice={duplicateNotice}
                onDismissDuplicateNotice={() => setDuplicateNotice(null)}
              />

              {activeMode === 'compress' && (
                <SettingsPanel
                  settings={compressSettings}
                  onChange={setCompressSettings}
                  onCompress={handleStartCompression}
                  onSelectOutputDir={handleSelectCompressOutputDir}
                  disabled={isCompressing || isExtractingAudio}
                  batchCount={queue.length}
                />
              )}

              {activeMode === 'audio' && (
                <AudioSettingsPanel
                  settings={audioSettings}
                  onChange={setAudioSettings}
                  onExtract={handleStartAudioExtraction}
                  onSelectOutputDir={handleSelectAudioOutputDir}
                  disabled={isExtractingAudio || isCompressing}
                  hasAudio={queue.some((q) => q.hasAudio)}
                  batchCount={queue.length}
                />
              )}
            </>
          )}

          {/* In-Flight Batch Progress */}
          {(isCompressing || isExtractingAudio) && (
            <ProgressBar
              progress={isCompressing ? compressProgress : audioProgress}
              onCancel={isCompressing ? handleCancelCompression : handleCancelAudioExtraction}
              isCancelling={isCompressing ? isCancellingCompress : isCancellingAudio}
              batchInfo={batchProgressInfo ?? undefined}
              mode={activeMode}
            />
          )}

          {/* Batch Completion Summary Card */}
          {batchResult && !isCompressing && !isExtractingAudio && (
            <BatchResultCard
              items={batchResult.items}
              isCancelled={batchResult.isCancelled}
              mode={activeMode}
              onOpenFolder={handleOpenFolder}
              onReset={handleClearAll}
            />
          )}
        </>
      )}
    </div>
  );
};
