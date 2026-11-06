import React, { useMemo } from 'react';
import { Sliders, Folder, Play, Check, Target, Info } from 'lucide-react';
import {
  CompressionSettings,
  QualityPreset,
  ResolutionOption,
  VideoCodecOption,
  AudioCodecOption,
  VideoMetadata,
  VideoQueueItem
} from '../../common/types';
import {
  calculateMinTargetSizeBytes,
  calculateReductionPercentage,
  formatBytes
} from '../../common/target-size';

interface SettingsPanelProps {
  settings: CompressionSettings;
  onChange: (updated: CompressionSettings) => void;
  onCompress: () => void;
  onSelectOutputDir: () => void;
  disabled: boolean;
  batchCount?: number;
  videoMetadata?: VideoMetadata | null;
  queue?: VideoQueueItem[];
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onChange,
  onCompress,
  onSelectOutputDir,
  disabled,
  batchCount = 0,
  videoMetadata,
  queue = []
}) => {
  const isBatch = batchCount > 1;

  // Single-file calculations for Custom Target Size mode
  const singleOriginalBytes = videoMetadata?.fileSizeBytes || queue[0]?.fileSizeBytes || 0;
  const singleDuration = videoMetadata?.durationSeconds || queue[0]?.durationSeconds || 1;
  const singleWidth = videoMetadata?.width || queue[0]?.metadata?.width;
  const singleHeight = videoMetadata?.height || queue[0]?.metadata?.height;
  const singleFps = videoMetadata?.fps || queue[0]?.metadata?.fps;
  const singleHasAudio = videoMetadata?.hasAudio ?? queue[0]?.hasAudio ?? true;

  const minFeasibleBytes = useMemo(() => {
    return calculateMinTargetSizeBytes({
      durationSeconds: singleDuration,
      width: singleWidth,
      height: singleHeight,
      fps: singleFps,
      codec: settings.codec,
      audioCodec: settings.audioCodec,
      hasAudio: singleHasAudio,
      originalSizeBytes: singleOriginalBytes
    });
  }, [singleDuration, singleWidth, singleHeight, singleFps, settings.codec, settings.audioCodec, singleHasAudio, singleOriginalBytes]);

  const minMb = useMemo(() => {
    return Math.max(0.1, Number((minFeasibleBytes / (1024 * 1024)).toFixed(1)));
  }, [minFeasibleBytes]);

  const maxMb = useMemo(() => {
    const rawMax = singleOriginalBytes > 0 ? singleOriginalBytes / (1024 * 1024) : 100;
    return Math.max(minMb + 0.1, Number(rawMax.toFixed(1)));
  }, [singleOriginalBytes, minMb]);

  const currentMb = useMemo(() => {
    if (settings.targetSizeBytes && settings.targetSizeBytes > 0) {
      const mb = Number((settings.targetSizeBytes / (1024 * 1024)).toFixed(1));
      return Math.min(maxMb, Math.max(minMb, mb));
    }
    // Default to 50% of original
    return Math.min(maxMb, Math.max(minMb, Number((maxMb * 0.5).toFixed(1))));
  }, [settings.targetSizeBytes, minMb, maxMb]);

  const currentTargetBytes = Math.round(currentMb * 1024 * 1024);
  const singleReductionPercent = calculateReductionPercentage(singleOriginalBytes, currentTargetBytes);

  // Batch calculations for Custom Target Size mode
  const batchPercent = settings.targetPercent ?? 50;
  const batchExpectedReduction = Math.max(0, 100 - batchPercent);

  const handleModeChange = (mode: QualityPreset) => {
    if (mode === settings.quality) return;
    if (mode === 'custom') {
      const initialTargetBytes = settings.targetSizeBytes || Math.round(currentMb * 1024 * 1024);
      onChange({
        ...settings,
        quality: mode,
        targetSizeBytes: initialTargetBytes,
        targetPercent: settings.targetPercent ?? 50
      });
    } else {
      onChange({
        ...settings,
        quality: mode
      });
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!Number.isFinite(val)) return;
    const clamped = Math.min(maxMb, Math.max(minMb, val));
    const newBytes = Math.round(clamped * 1024 * 1024);
    onChange({
      ...settings,
      targetSizeBytes: newBytes
    });
  };

  const handleNumberInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!Number.isFinite(val)) return;
    const clamped = Math.min(maxMb, Math.max(minMb, val));
    const newBytes = Math.round(clamped * 1024 * 1024);
    onChange({
      ...settings,
      targetSizeBytes: newBytes
    });
  };

  const handleBatchPercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!Number.isFinite(val)) return;
    const clamped = Math.min(90, Math.max(10, val));
    onChange({
      ...settings,
      targetPercent: clamped
    });
  };

  return (
    <div className="card">
      <h2 className="card-title">
        <Sliders size={16} />
        Compression Settings
      </h2>

      <div className="settings-grid">
        {/* Five Compression Modes */}
        <div className="field-group" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Compression Mode</label>
          <div className="compression-modes">
            <button
              type="button"
              className={`compression-mode-btn ${settings.quality === 'auto' ? 'active' : ''}`}
              onClick={() => handleModeChange('auto')}
              disabled={disabled}
              title="Automatic: standard balanced compression (Default)"
            >
              Automatic
            </button>
            <button
              type="button"
              className={`compression-mode-btn ${settings.quality === 'high' ? 'active' : ''}`}
              onClick={() => handleModeChange('high')}
              disabled={disabled}
              title="High Quality: maximum visual fidelity, lower compression aggressiveness"
            >
              High
            </button>
            <button
              type="button"
              className={`compression-mode-btn ${settings.quality === 'medium' ? 'active' : ''}`}
              onClick={() => handleModeChange('medium')}
              disabled={disabled}
              title="Medium Quality: balanced visual quality and file size reduction"
            >
              Medium
            </button>
            <button
              type="button"
              className={`compression-mode-btn ${settings.quality === 'low' ? 'active' : ''}`}
              onClick={() => handleModeChange('low')}
              disabled={disabled}
              title="Low Quality: prioritize smaller output files, higher compression"
            >
              Low
            </button>
            <button
              type="button"
              className={`compression-mode-btn ${settings.quality === 'custom' ? 'active' : ''}`}
              onClick={() => handleModeChange('custom')}
              disabled={disabled}
              title="Custom Target Size: specify exact target output size with dynamic minimum and two-pass encoding"
            >
              Custom
            </button>
          </div>

          <div className="mode-description-hint">
            {settings.quality === 'auto' && (
              <span>
                <strong>Automatic (Default):</strong> Preserves existing balanced compression parameters (CRF 24, medium preset, 128k audio).
              </span>
            )}
            {settings.quality === 'high' && (
              <span>
                <strong>High Quality:</strong> Preserves maximum visual quality ({settings.codec === 'h265' ? 'HEVC CRF 22' : 'H.264 CRF 20'}, slow/medium preset, 192k audio).
              </span>
            )}
            {settings.quality === 'medium' && (
              <span>
                <strong>Medium Quality:</strong> Balanced visual quality and file size reduction ({settings.codec === 'h265' ? 'HEVC CRF 26' : 'H.264 CRF 24'}, medium preset, 128k audio).
              </span>
            )}
            {settings.quality === 'low' && (
              <span>
                <strong>Low Quality:</strong> Prioritizes smaller output files ({settings.codec === 'h265' ? 'HEVC CRF 30' : 'H.264 CRF 28'}, fast preset, 96k audio).
              </span>
            )}
            {settings.quality === 'custom' && (
              <span>
                <strong>Custom Target Size:</strong> Uses high-accuracy two-pass encoding to target your desired file size.
              </span>
            )}
          </div>
        </div>

        {/* CUSTOM TARGET SIZE SECTION */}
        {settings.quality === 'custom' && (
          <div className="custom-target-card">
            <div className="custom-target-header">
              <div className="custom-target-title">
                <Target size={16} color="var(--accent-emerald)" />
                {isBatch ? 'Batch Custom Target Size (Percentage Reduction)' : 'Custom Target Size — Manual Slider'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--accent-emerald-light)', fontWeight: 600 }}>
                {isBatch ? `Target ${batchPercent}% of Original` : `Target: ${formatBytes(currentTargetBytes)}`}
              </div>
            </div>

            {/* SINGLE FILE CUSTOM SLIDER */}
            {!isBatch && (
              <div className="target-slider-wrapper">
                <div className="target-slider-row">
                  <input
                    type="range"
                    className="target-slider"
                    min={minMb}
                    max={maxMb}
                    step={0.1}
                    value={currentMb}
                    onChange={handleSliderChange}
                    disabled={disabled}
                  />
                  <div className="target-number-input-group">
                    <input
                      type="number"
                      className="target-number-input"
                      min={minMb}
                      max={maxMb}
                      step={0.1}
                      value={currentMb}
                      onChange={handleNumberInputChange}
                      disabled={disabled}
                    />
                    <span className="target-number-unit">MB</span>
                  </div>
                </div>

                <div className="target-bounds-row">
                  <span>Min: {formatBytes(minFeasibleBytes)} (technically feasible floor)</span>
                  <span>Max: {formatBytes(singleOriginalBytes)} (original size)</span>
                </div>

                <div className="target-stats-grid">
                  <div className="target-stats-box">
                    <div className="target-stats-label">Original Size</div>
                    <div className="target-stats-val">{formatBytes(singleOriginalBytes)}</div>
                  </div>
                  <div className="target-stats-box">
                    <div className="target-stats-label">Target Output</div>
                    <div className="target-stats-val">{formatBytes(currentTargetBytes)}</div>
                  </div>
                  <div className="target-stats-box highlight">
                    <div className="target-stats-label">Expected Reduction</div>
                    <div className="target-stats-val savings">{singleReductionPercent}%</div>
                  </div>
                </div>

                <div className="target-disclaimer">
                  <Info size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                  Expected reduction is a mathematical estimate, not a guaranteed result. Two-pass FFmpeg encoding analyzes complexity in pass 1 and matches target bitrate in pass 2.
                </div>
              </div>
            )}

            {/* BATCH MODE CUSTOM SLIDER */}
            {isBatch && (
              <div className="target-slider-wrapper">
                <div className="target-slider-row">
                  <input
                    type="range"
                    className="target-slider"
                    min={10}
                    max={90}
                    step={5}
                    value={batchPercent}
                    onChange={handleBatchPercentChange}
                    disabled={disabled}
                  />
                  <div className="target-number-input-group">
                    <input
                      type="number"
                      className="target-number-input"
                      min={10}
                      max={90}
                      step={5}
                      value={batchPercent}
                      onChange={handleBatchPercentChange}
                      disabled={disabled}
                    />
                    <span className="target-number-unit">%</span>
                  </div>
                </div>

                <div className="target-bounds-row">
                  <span>Target 10% (Maximum compression)</span>
                  <span>Target 90% (Light compression)</span>
                </div>

                <div className="target-stats-grid">
                  <div className="target-stats-box">
                    <div className="target-stats-label">Batch Size</div>
                    <div className="target-stats-val">{queue.length} Videos</div>
                  </div>
                  <div className="target-stats-box">
                    <div className="target-stats-label">Target Ratio</div>
                    <div className="target-stats-val">{batchPercent}% of Original</div>
                  </div>
                  <div className="target-stats-box highlight">
                    <div className="target-stats-label">Expected Reduction</div>
                    <div className="target-stats-val savings">~{batchExpectedReduction}%</div>
                  </div>
                </div>

                {/* Batch per-file estimate preview */}
                <div className="batch-preview-container">
                  <div className="batch-preview-title">Batch Output Size Estimates:</div>
                  <div className="batch-preview-items">
                    {queue.map((item) => {
                      const estBytes = Math.round(item.fileSizeBytes * (batchPercent / 100));
                      const itemMinBytes = calculateMinTargetSizeBytes({
                        durationSeconds: item.durationSeconds,
                        width: item.metadata?.width,
                        height: item.metadata?.height,
                        fps: item.metadata?.fps,
                        codec: settings.codec,
                        audioCodec: settings.audioCodec,
                        hasAudio: item.hasAudio,
                        originalSizeBytes: item.fileSizeBytes
                      });
                      const finalEst = Math.max(itemMinBytes, estBytes);
                      return (
                        <div key={item.id} className="batch-preview-item">
                          <span>
                            {item.fileName} ({formatBytes(item.fileSizeBytes)})
                          </span>
                          <span className="batch-preview-item-target">
                            → ~{formatBytes(finalEst)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="target-disclaimer">
                  <Info size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                  Each video in the batch will be processed sequentially using two-pass encoding to reach its proportional target size while preserving its minimum feasible floor.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Resolution */}
        <div className="field-group">
          <label className="field-label" htmlFor="resolution-select">Resolution</label>
          <select
            id="resolution-select"
            className="field-select"
            value={settings.resolution}
            disabled={disabled}
            onChange={(e) => onChange({ ...settings, resolution: e.target.value as ResolutionOption })}
          >
            <option value="original">Keep Original</option>
            <option value="1080p">1080p (Full HD)</option>
            <option value="720p">720p (HD)</option>
            <option value="480p">480p (SD)</option>
          </select>
        </div>

        {/* Video Codec */}
        <div className="field-group">
          <label className="field-label" htmlFor="codec-select">Video Codec</label>
          <select
            id="codec-select"
            className="field-select"
            value={settings.codec}
            disabled={disabled}
            onChange={(e) => onChange({ ...settings, codec: e.target.value as VideoCodecOption })}
          >
            <option value="h264">H.264 (Universal Compatibility)</option>
            <option value="h265">H.265 / HEVC (Modern Efficiency)</option>
          </select>
        </div>

        {/* Audio Codec */}
        <div className="field-group">
          <label className="field-label" htmlFor="audio-select">Audio</label>
          <select
            id="audio-select"
            className="field-select"
            value={settings.audioCodec}
            disabled={disabled}
            onChange={(e) => onChange({ ...settings, audioCodec: e.target.value as AudioCodecOption })}
          >
            <option value="aac">AAC (Re-encode)</option>
            <option value="copy">Copy Stream (Lossless Audio)</option>
            <option value="none">Mute / Remove Audio</option>
          </select>
        </div>

        {/* Privacy Feature: Remove Metadata */}
        <label className="checkbox-row" htmlFor="remove-metadata-checkbox">
          <input
            id="remove-metadata-checkbox"
            type="checkbox"
            className="checkbox-custom"
            checked={settings.removeMetadata}
            disabled={disabled}
            onChange={(e) => onChange({ ...settings, removeMetadata: e.target.checked })}
          />
          <div>
            <div className="checkbox-label-title">
              Remove metadata from compressed video
            </div>
            <div className="checkbox-label-desc">
              Strips embedded GPS coordinates, device serial numbers, camera make, and author timestamps.
            </div>
          </div>
        </label>

        {/* Output Directory Option */}
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Destination Folder: <strong>{settings.customOutputDir ? settings.customOutputDir : 'Same folder as source video'}</strong>
          </div>
          <button
            type="button"
            className="btn-browse"
            style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={onSelectOutputDir}
            disabled={disabled}
          >
            <Folder size={14} />
            {settings.customOutputDir ? 'Change Destination' : 'Select Destination'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          className="btn-compress"
          onClick={onCompress}
          disabled={disabled}
        >
          <Play size={18} fill="currentColor" />
          {batchCount && batchCount > 1 ? `Compress All Videos (${batchCount})` : 'Compress Video'}
        </button>
      </div>
    </div>
  );
};
