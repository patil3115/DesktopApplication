import React, { useMemo } from 'react';
import { Sliders, Folder, Play, Image as ImageIcon, Target, Info, Minimize2, Check } from 'lucide-react';
import {
  ImageCompressionSettings,
  QualityPreset,
  ImageOutputFormat,
  ImageQueueItem
} from '../../common/types';
import {
  calculateMinImageTargetSizeBytes,
  calculateImageReductionPercentage
} from '../../common/image-target-size';
import { formatBytes } from '../../common/formatters';

interface ImageSettingsPanelProps {
  settings: ImageCompressionSettings;
  onChange: (updated: ImageCompressionSettings) => void;
  onCompress: () => void;
  onSelectOutputDir: () => void;
  disabled: boolean;
  batchCount?: number;
  selectedImage?: ImageQueueItem | null;
  queue?: ImageQueueItem[];
}

export const ImageSettingsPanel: React.FC<ImageSettingsPanelProps> = ({
  settings,
  onChange,
  onCompress,
  onSelectOutputDir,
  disabled,
  batchCount = 0,
  selectedImage,
  queue = []
}) => {
  const isBatch = batchCount > 1;

  // Single-file calculations for Custom Target Size mode
  const currentItem = selectedImage || queue[0];
  const singleOriginalBytes = currentItem?.fileSizeBytes || 0;
  const singleWidth = currentItem?.width || 1920;
  const singleHeight = currentItem?.height || 1080;
  const singleFormat = currentItem?.format || 'jpg';
  const singleHasAlpha = currentItem?.hasAlpha ?? false;

  const minFeasibleBytes = useMemo(() => {
    return calculateMinImageTargetSizeBytes({
      width: singleWidth,
      height: singleHeight,
      format: settings.outputFormat === 'original' ? singleFormat : settings.outputFormat,
      hasAlpha: singleHasAlpha,
      originalSizeBytes: singleOriginalBytes
    });
  }, [singleWidth, singleHeight, settings.outputFormat, singleFormat, singleHasAlpha, singleOriginalBytes]);

  // Use KB for files under 2 MB, MB for larger
  const isSmallUnit = singleOriginalBytes < 2 * 1024 * 1024;
  const unitDivisor = isSmallUnit ? 1024 : 1024 * 1024;
  const unitLabel = isSmallUnit ? 'KB' : 'MB';

  const minDisplayVal = useMemo(() => {
    return Math.max(1, Number((minFeasibleBytes / unitDivisor).toFixed(1)));
  }, [minFeasibleBytes, unitDivisor]);

  const maxDisplayVal = useMemo(() => {
    const rawMax = singleOriginalBytes > 0 ? singleOriginalBytes / unitDivisor : 100;
    return Math.max(minDisplayVal + 1, Number(rawMax.toFixed(1)));
  }, [singleOriginalBytes, unitDivisor, minDisplayVal]);

  const currentDisplayVal = useMemo(() => {
    if (settings.targetSizeBytes && settings.targetSizeBytes > 0) {
      const val = Number((settings.targetSizeBytes / unitDivisor).toFixed(1));
      return Math.min(maxDisplayVal, Math.max(minDisplayVal, val));
    }
    return Math.min(maxDisplayVal, Math.max(minDisplayVal, Number((maxDisplayVal * 0.5).toFixed(1))));
  }, [settings.targetSizeBytes, unitDivisor, minDisplayVal, maxDisplayVal]);

  const currentTargetBytes = Math.round(currentDisplayVal * unitDivisor);
  const singleReductionPercent = calculateImageReductionPercentage(singleOriginalBytes, currentTargetBytes);

  // Batch calculations
  const batchPercent = settings.targetPercent ?? 50;
  const batchExpectedReduction = Math.max(0, 100 - batchPercent);

  const handleModeChange = (mode: QualityPreset) => {
    if (mode === settings.quality) return;
    if (mode === 'custom') {
      const initialTargetBytes = settings.targetSizeBytes || Math.round(currentDisplayVal * unitDivisor);
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
    const clamped = Math.min(maxDisplayVal, Math.max(minDisplayVal, val));
    const newBytes = Math.round(clamped * unitDivisor);
    onChange({
      ...settings,
      targetSizeBytes: newBytes
    });
  };

  const handleNumberInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!Number.isFinite(val)) return;
    const clamped = Math.min(maxDisplayVal, Math.max(minDisplayVal, val));
    const newBytes = Math.round(clamped * unitDivisor);
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

  // Resize dimension changes with aspect ratio lock
  const handleWidthChange = (val: number) => {
    if (!Number.isFinite(val) || val <= 0) return;
    const updated = { ...settings.resize, width: val };
    if (settings.resize.lockAspectRatio && currentItem && currentItem.width > 0) {
      const ratio = currentItem.height / currentItem.width;
      updated.height = Math.round(val * ratio);
    }
    onChange({ ...settings, resize: updated });
  };

  const handleHeightChange = (val: number) => {
    if (!Number.isFinite(val) || val <= 0) return;
    const updated = { ...settings.resize, height: val };
    if (settings.resize.lockAspectRatio && currentItem && currentItem.height > 0) {
      const ratio = currentItem.width / currentItem.height;
      updated.width = Math.round(val * ratio);
    }
    onChange({ ...settings, resize: updated });
  };

  return (
    <div className="card">
      <h2 className="card-title">
        <ImageIcon size={16} />
        Image Compression Settings
      </h2>

      <div className="settings-grid">
        {/* Output Format Selection */}
        <div className="field-group" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label" htmlFor="image-format-select">Output Format</label>
          <select
            id="image-format-select"
            className="field-select"
            value={settings.outputFormat}
            disabled={disabled}
            onChange={(e) => onChange({ ...settings, outputFormat: e.target.value as ImageOutputFormat })}
          >
            <option value="original">Keep Original Format</option>
            <option value="jpg">JPG (Best for Photos & Standard Web)</option>
            <option value="png">PNG (Lossless & Alpha Transparency)</option>
            <option value="webp">WebP (Modern Efficiency & Alpha Support)</option>
          </select>
        </div>

        {/* Five Compression Modes */}
        <div className="field-group" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Compression Mode</label>
          <div className="compression-modes">
            <button
              type="button"
              className={`compression-mode-btn ${settings.quality === 'auto' ? 'active' : ''}`}
              onClick={() => handleModeChange('auto')}
              disabled={disabled}
              title="Automatic: smart format-aware compression (Default)"
            >
              Automatic
            </button>
            <button
              type="button"
              className={`compression-mode-btn ${settings.quality === 'high' ? 'active' : ''}`}
              onClick={() => handleModeChange('high')}
              disabled={disabled}
              title="High Quality: conservative lossy or pure lossless for PNG"
            >
              High
            </button>
            <button
              type="button"
              className={`compression-mode-btn ${settings.quality === 'medium' ? 'active' : ''}`}
              onClick={() => handleModeChange('medium')}
              disabled={disabled}
              title="Medium Quality: balanced visual quality and file size"
            >
              Medium
            </button>
            <button
              type="button"
              className={`compression-mode-btn ${settings.quality === 'low' ? 'active' : ''}`}
              onClick={() => handleModeChange('low')}
              disabled={disabled}
              title="Low Quality: prioritize smaller output files, more aggressive compression"
            >
              Low
            </button>
            <button
              type="button"
              className={`compression-mode-btn ${settings.quality === 'custom' ? 'active' : ''}`}
              onClick={() => handleModeChange('custom')}
              disabled={disabled}
              title="Custom Target Size: control approximate output file size"
            >
              Custom
            </button>
          </div>

          <div className="mode-description-hint">
            {settings.quality === 'auto' && (
              <span>
                <strong>Automatic (Default):</strong> Format-aware optimization strategy balancing quality and filesize without unexpected dimension changes.
              </span>
            )}
            {settings.quality === 'high' && (
              <span>
                <strong>High Quality:</strong> Conservative compression preserving maximum visual fidelity (pure lossless optimization for PNG).
              </span>
            )}
            {settings.quality === 'medium' && (
              <span>
                <strong>Medium Quality:</strong> Recommended balance of crisp visual quality and noticeable size reduction.
              </span>
            )}
            {settings.quality === 'low' && (
              <span>
                <strong>Low Quality:</strong> Aggressive lossy compression prioritizing minimum file size for quick sharing and bandwidth saving.
              </span>
            )}
            {settings.quality === 'custom' && (
              <span>
                <strong>Custom Target Size:</strong> Uses bounded iterative quality targeting to converge on your desired file size.
              </span>
            )}
          </div>
        </div>

        {/* CUSTOM TARGET SIZE SECTION */}
        {settings.quality === 'custom' && (
          <div className="custom-target-card">
            <div className="custom-target-header">
              <div className="custom-target-title">
                <Target size={16} color="var(--accent-cyan)" />
                {isBatch ? 'Batch Custom Target Size (Percentage Reduction)' : 'Custom Target Size — Manual Slider'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--accent-cyan)', fontWeight: 600 }}>
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
                    min={minDisplayVal}
                    max={maxDisplayVal}
                    step={0.1}
                    value={currentDisplayVal}
                    onChange={handleSliderChange}
                    disabled={disabled}
                  />
                  <div className="target-number-input-group">
                    <input
                      type="number"
                      className="target-number-input"
                      min={minDisplayVal}
                      max={maxDisplayVal}
                      step={0.1}
                      value={currentDisplayVal}
                      onChange={handleNumberInputChange}
                      disabled={disabled}
                    />
                    <span className="target-number-unit">{unitLabel}</span>
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
                  Target size is approximate. Bounded iterative encoding adjusts quality parameters over up to 5 steps to reach the target size safely.
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
                    <div className="target-stats-label">Batch Count</div>
                    <div className="target-stats-val">{queue.length} Images</div>
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

                <div className="batch-preview-container">
                  <div className="batch-preview-title">Batch Output Size Estimates:</div>
                  <div className="batch-preview-items">
                    {queue.map((item) => {
                      const estBytes = Math.round(item.fileSizeBytes * (batchPercent / 100));
                      const itemMinBytes = calculateMinImageTargetSizeBytes({
                        width: item.width,
                        height: item.height,
                        format: settings.outputFormat === 'original' ? item.format : settings.outputFormat,
                        hasAlpha: item.hasAlpha,
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
                  Each image in the batch will be processed sequentially using bounded iterative quality adjustments matching its proportional target.
                </div>
              </div>
            )}
          </div>
        )}

        {/* IMAGE RESIZING (OPTIONAL) */}
        <div style={{ gridColumn: '1 / -1', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)', padding: 14, border: '1px solid var(--border-subtle)' }}>
          <label className="checkbox-row" style={{ margin: 0 }}>
            <input
              type="checkbox"
              className="checkbox-custom"
              checked={settings.resize.enabled}
              disabled={disabled}
              onChange={(e) => onChange({
                ...settings,
                resize: {
                  ...settings.resize,
                  enabled: e.target.checked,
                  percentage: settings.resize.percentage || 50,
                  width: settings.resize.width || (currentItem?.width ? Math.round(currentItem.width * 0.5) : 1280),
                  height: settings.resize.height || (currentItem?.height ? Math.round(currentItem.height * 0.5) : 720)
                }
              })}
            />
            <div>
              <div className="checkbox-label-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Minimize2 size={14} color="var(--accent-cyan)" />
                Resize Image (Optional)
              </div>
              <div className="checkbox-label-desc">
                Reduce pixel dimensions for smaller output size. Disabled by default.
              </div>
            </div>
          </label>

          {settings.resize.enabled && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 28 }}>
              {/* Resize Mode Selector */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className={`btn-browse ${settings.resize.mode === 'percentage' ? 'active' : ''}`}
                  style={{
                    padding: '5px 12px',
                    fontSize: 12,
                    borderColor: settings.resize.mode === 'percentage' ? 'var(--accent-cyan)' : 'var(--border-subtle)'
                  }}
                  onClick={() => onChange({ ...settings, resize: { ...settings.resize, mode: 'percentage' } })}
                  disabled={disabled}
                >
                  Resize by Percentage
                </button>
                <button
                  type="button"
                  className={`btn-browse ${settings.resize.mode === 'dimensions' ? 'active' : ''}`}
                  style={{
                    padding: '5px 12px',
                    fontSize: 12,
                    borderColor: settings.resize.mode === 'dimensions' ? 'var(--accent-cyan)' : 'var(--border-subtle)'
                  }}
                  onClick={() => onChange({ ...settings, resize: { ...settings.resize, mode: 'dimensions' } })}
                  disabled={disabled}
                >
                  Custom Width & Height
                </button>
              </div>

              {/* Mode: Percentage */}
              {settings.resize.mode === 'percentage' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <input
                    type="range"
                    className="target-slider"
                    min={10}
                    max={100}
                    step={5}
                    value={settings.resize.percentage || 50}
                    onChange={(e) => onChange({
                      ...settings,
                      resize: { ...settings.resize, percentage: parseInt(e.target.value, 10) }
                    })}
                    disabled={disabled}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, minWidth: 45 }}>
                    {settings.resize.percentage || 50}%
                  </span>
                  {currentItem && currentItem.width > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      ({Math.round(currentItem.width * ((settings.resize.percentage || 50) / 100))} × {Math.round(currentItem.height * ((settings.resize.percentage || 50) / 100))} px)
                    </span>
                  )}
                </div>
              )}

              {/* Mode: Dimensions */}
              {settings.resize.mode === 'dimensions' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Width:</span>
                    <input
                      type="number"
                      className="field-input"
                      style={{ width: 80, padding: '4px 8px', fontSize: 12 }}
                      min={1}
                      max={32768}
                      value={settings.resize.width || ''}
                      onChange={(e) => handleWidthChange(parseInt(e.target.value, 10))}
                      disabled={disabled}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>px</span>
                  </div>

                  <span style={{ color: 'var(--text-muted)' }}>×</span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Height:</span>
                    <input
                      type="number"
                      className="field-input"
                      style={{ width: 80, padding: '4px 8px', fontSize: 12 }}
                      min={1}
                      max={32768}
                      value={settings.resize.height || ''}
                      onChange={(e) => handleHeightChange(parseInt(e.target.value, 10))}
                      disabled={disabled}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>px</span>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', marginLeft: 10 }}>
                    <input
                      type="checkbox"
                      checked={settings.resize.lockAspectRatio}
                      onChange={(e) => onChange({
                        ...settings,
                        resize: { ...settings.resize, lockAspectRatio: e.target.checked }
                      })}
                      disabled={disabled}
                    />
                    Lock Aspect Ratio
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Privacy Feature: Remove EXIF Metadata */}
        <label className="checkbox-row" htmlFor="remove-image-metadata-checkbox">
          <input
            id="remove-image-metadata-checkbox"
            type="checkbox"
            className="checkbox-custom"
            checked={settings.removeMetadata}
            disabled={disabled}
            onChange={(e) => onChange({ ...settings, removeMetadata: e.target.checked })}
          />
          <div>
            <div className="checkbox-label-title">
              Remove EXIF metadata from compressed image
            </div>
            <div className="checkbox-label-desc">
              Strips embedded GPS coordinates, camera model, author tags, and exposure timestamps for privacy.
            </div>
          </div>
        </label>

        {/* Output Directory Option */}
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Destination Folder: <strong>{settings.customOutputDir ? settings.customOutputDir : 'Same folder as source image'}</strong>
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
          className="btn-compress btn-compress-image"
          onClick={onCompress}
          disabled={disabled}
        >
          <Play size={18} fill="currentColor" />
          {batchCount && batchCount > 1 ? `Compress All Images (${batchCount})` : 'Compress Image'}
        </button>
      </div>
    </div>
  );
};
