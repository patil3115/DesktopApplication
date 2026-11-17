import React, { useState } from 'react';
import {
  Folder,
  FolderOpen,
  Film,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Sliders,
  ShieldCheck,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatBytes } from '../../common/formatters';
import {
  FolderScanResult,
  FolderCompressionSummary,
  FolderItemProgress,
  CompressionSettings,
  ImageCompressionSettings,
  QualityPreset,
  VideoCodecOption,
  ImageOutputFormat
} from '../../common/types';

interface FolderViewProps {
  scanResult: FolderScanResult;
  outputDir: string;
  isCompressing: boolean;
  isCancelling: boolean;
  progress: FolderItemProgress | null;
  summaryResult: FolderCompressionSummary | null;
  videoSettings: CompressionSettings;
  imageSettings: ImageCompressionSettings;
  onSelectFolder: () => void;
  onSelectOutputDir: () => void;
  onChangeVideoSettings: (updater: (prev: CompressionSettings) => CompressionSettings) => void;
  onChangeImageSettings: (updater: (prev: ImageCompressionSettings) => ImageCompressionSettings) => void;
  onStartCompression: () => void;
  onCancelCompression: () => void;
  onReset: () => void;
  onOpenFolder: (targetPath?: string) => void;
}

export const FolderView: React.FC<FolderViewProps> = ({
  scanResult,
  outputDir,
  isCompressing,
  isCancelling,
  progress,
  summaryResult,
  videoSettings,
  imageSettings,
  onSelectFolder,
  onSelectOutputDir,
  onChangeVideoSettings,
  onChangeImageSettings,
  onStartCompression,
  onCancelCompression,
  onReset,
  onOpenFolder
}) => {
  const [showItemList, setShowItemList] = useState(false);

  // 1. SUMMARY VIEW AFTER COMPRESSION
  if (summaryResult && !isCompressing) {
    const isCancelled = summaryResult.isCancelled;
    const totalReduction =
      summaryResult.originalTotalBytes > summaryResult.compressedTotalBytes
        ? summaryResult.originalTotalBytes - summaryResult.compressedTotalBytes
        : 0;

    return (
      <div className="folder-summary-card">
        <div className="folder-summary-header">
          <div className="summary-status-icon">
            {isCancelled ? (
              <AlertTriangle size={36} color="#f59e0b" />
            ) : summaryResult.failedCount > 0 ? (
              <AlertTriangle size={36} color="#f59e0b" />
            ) : (
              <CheckCircle2 size={36} color="#10b981" />
            )}
          </div>
          <div>
            <h2 className="summary-title">
              {isCancelled
                ? 'Folder Compression Stopped'
                : summaryResult.failedCount === 0
                ? 'Folder Compression Completed!'
                : 'Folder Compression Completed with Warnings'}
            </h2>
            <p className="summary-subtitle">
              Original filenames and complete folder hierarchy preserved in destination. Original files untouched.
            </p>
          </div>
        </div>

        {/* Output Destination Box */}
        <div className="folder-dest-card">
          <div className="folder-dest-info">
            <span className="dest-label">Output Directory:</span>
            <span className="dest-path" title={summaryResult.outputRootDir}>
              {summaryResult.outputRootDir}
            </span>
          </div>
          <button
            type="button"
            className="btn-open-folder"
            onClick={() => onOpenFolder(summaryResult.outputRootDir)}
          >
            <FolderOpen size={16} />
            <span>Open Destination Folder</span>
          </button>
        </div>

        {/* Key Metrics Grid */}
        <div className="folder-metrics-grid">
          <div className="metric-box">
            <span className="metric-label">Total Files</span>
            <span className="metric-value">{summaryResult.totalItems}</span>
            <span className="metric-sub">
              {summaryResult.completedCount} succeeded
              {summaryResult.failedCount > 0 ? `, ${summaryResult.failedCount} failed` : ''}
            </span>
          </div>

          <div className="metric-box">
            <span className="metric-label">Original Size</span>
            <span className="metric-value">
              {formatBytes(summaryResult.originalTotalBytes)}
            </span>
            <span className="metric-sub">Before compression</span>
          </div>

          <div className="metric-box">
            <span className="metric-label">Output Size</span>
            <span className="metric-value">
              {formatBytes(summaryResult.compressedTotalBytes)}
            </span>
            <span className="metric-sub">New folder size</span>
          </div>

          <div className="metric-box highlight">
            <span className="metric-label">Space Saved</span>
            <span className="metric-value highlight-value">
              {summaryResult.overallReductionPercentage}%
            </span>
            <span className="metric-sub">
              Saved {formatBytes(totalReduction)}
            </span>
          </div>
        </div>

        {/* Toggle Detailed File List */}
        <div className="folder-item-list-section">
          <button
            type="button"
            className="btn-toggle-items"
            onClick={() => setShowItemList((prev) => !prev)}
          >
            <span>
              {showItemList ? 'Hide' : 'View'} Itemized Breakdown ({summaryResult.items.length} Files)
            </span>
            {showItemList ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showItemList && (
            <div className="folder-items-table-wrapper">
              <table className="folder-items-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Relative Path</th>
                    <th>Type</th>
                    <th>Original</th>
                    <th>Output</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryResult.items.map((entry, idx) => {
                    const status = entry.status || (entry.success ? 'compressed' : 'failed');
                    return (
                      <tr key={`${entry.item.id}_${idx}`}>
                        <td className="status-cell">
                          {status === 'compressed' ? (
                            <span className="status-badge status-compressed">
                              <CheckCircle2 size={13} /> Compressed
                            </span>
                          ) : status === 'no_reduction' ? (
                            <span className="status-badge status-warning">
                              <AlertTriangle size={13} /> No reduction
                            </span>
                          ) : (
                            <span className="status-badge status-failed">
                              <XCircle size={13} /> Failed
                            </span>
                          )}
                        </td>
                        <td className="path-cell" title={entry.item.relativePath}>
                          {entry.item.relativePath}
                        </td>
                        <td className="type-cell">
                          {entry.item.type === 'video' ? (
                            <span className="badge badge-video">
                              <Film size={12} /> Video
                            </span>
                          ) : (
                            <span className="badge badge-image">
                              <ImageIcon size={12} /> Image
                            </span>
                          )}
                        </td>
                        <td>{entry.item.formattedSize}</td>
                        <td>
                          {entry.compressedSizeBytes !== undefined
                            ? formatBytes(entry.compressedSizeBytes)
                            : '-'}
                        </td>
                        <td>
                          {status === 'compressed' && entry.reductionPercentage !== undefined ? (
                            <span className="reduction-pill">
                              {entry.reductionPercentage}% saved
                            </span>
                          ) : status === 'no_reduction' ? (
                            <span
                              className="no-reduction-pill"
                              title="Original file copied unchanged because compression would not yield smaller file"
                            >
                              Original copied (0%)
                            </span>
                          ) : (
                            <span className="failed-text" title={entry.error?.userMessage || 'Failed'}>
                              {entry.error?.userMessage || 'Failed'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Reset Action */}
        <div className="folder-summary-actions">
          <button type="button" className="btn-secondary" onClick={onReset}>
            <RotateCcw size={16} />
            <span>Compress Another Folder</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. IN-FLIGHT PROGRESS VIEW
  if (isCompressing) {
    const percent = progress ? Math.min(100, Math.max(0, progress.overallPercent)) : 0;
    const currentIdx = progress ? progress.currentItemIndex : 1;
    const totalCount = progress ? progress.totalItems : scanResult.totalFiles;
    const currentRel = progress ? progress.currentRelativePath : 'Preparing media files...';

    return (
      <div className="folder-progress-card">
        <div className="progress-header">
          <div className="progress-title-row">
            <Folder size={22} className="spin-icon" color="#38bdf8" />
            <h3>
              {isCancelling ? 'Cancelling Folder Compression...' : 'Compressing Media Folder...'}
            </h3>
          </div>
          <span className="progress-percentage-label">{percent}%</span>
        </div>

        <div className="progress-track" style={{ width: '100%', height: 14, background: '#1e293b', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
          <div
            className="progress-fill progress-bar"
            style={{
              width: `${Math.max(0, Math.min(100, percent))}%`,
              height: '100%',
              minHeight: '100%',
              display: 'block',
              background: 'linear-gradient(90deg, #059669, #10b981, #34d399)',
              borderRadius: 999,
              transition: 'width 250ms ease',
              boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)'
            }}
          />
        </div>

        <div className="progress-detail-row">
          <div className="current-file-box">
            <span className="file-index-pill">
              File {currentIdx} of {totalCount}
            </span>
            <span className="current-file-name" title={currentRel}>
              {currentRel}
            </span>
          </div>
          {progress && (
            <div className="counts-pill">
              <span className="count-success">{progress.completedCount} done</span>
              {progress.failedCount > 0 && (
                <span className="count-failed">• {progress.failedCount} failed</span>
              )}
            </div>
          )}
        </div>

        <div className="progress-cancel-row">
          <button
            type="button"
            className="btn-cancel"
            onClick={onCancelCompression}
            disabled={isCancelling}
          >
            {isCancelling ? 'Cancelling...' : 'Cancel Folder Compression'}
          </button>
        </div>
      </div>
    );
  }

  // 3. FOLDER CONFIGURE & READY TO START VIEW
  return (
    <div className="folder-view-container">
      {/* Source Folder Card */}
      <div className="folder-source-card">
        <div className="folder-source-header">
          <div className="folder-icon-box">
            <Folder size={32} color="#38bdf8" />
          </div>
          <div className="folder-source-details">
            <span className="folder-source-label">Source Folder</span>
            <h3 className="folder-source-path" title={scanResult.sourceRootDir}>
              {scanResult.sourceRootDir}
            </h3>
            <div className="folder-stats-pills">
              <span className="pill pill-total">{scanResult.totalFiles} Total Media Files</span>
              <span className="pill pill-video">
                <Film size={12} /> {scanResult.videoCount} Videos
              </span>
              <span className="pill pill-image">
                <ImageIcon size={12} /> {scanResult.imageCount} Images
              </span>
              <span className="pill pill-size">Total: {scanResult.formattedTotalSize}</span>
            </div>
          </div>
          <button type="button" className="btn-change-folder" onClick={onSelectFolder}>
            Change Folder
          </button>
        </div>
      </div>

      {/* Destination Directory Card */}
      <div className="folder-dest-card">
        <div className="folder-dest-info">
          <span className="dest-label">Output Directory:</span>
          <span className="dest-path" title={outputDir}>
            {outputDir}
          </span>
          <p className="dest-guarantee">
            <ShieldCheck size={14} color="#10b981" />
            <span>
              Preserves original filenames and exact folder hierarchy. Output is saved outside the
              source directory. Original files remain untouched.
            </span>
          </p>
        </div>
        <button type="button" className="btn-browse-dest" onClick={onSelectOutputDir}>
          <FolderOpen size={16} />
          <span>Change Destination</span>
        </button>
      </div>

      {/* Settings Grid */}
      <div className="folder-settings-grid">
        {/* Video Settings Box */}
        <div className="settings-box">
          <div className="settings-box-header">
            <Film size={18} color="#38bdf8" />
            <h4>Video Compression Settings</h4>
          </div>

          <div className="setting-group">
            <label htmlFor="folder-video-quality-select">Quality Preset:</label>
            <select
              id="folder-video-quality-select"
              className="field-select"
              value={videoSettings.quality}
              disabled={isCompressing}
              onChange={(e) => {
                const q = e.target.value as QualityPreset;
                onChangeVideoSettings((prev) => ({ ...prev, quality: q }));
              }}
            >
              <option value="auto">Auto (Balanced)</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="setting-group">
            <label htmlFor="folder-video-codec-select">Video Codec:</label>
            <select
              id="folder-video-codec-select"
              className="field-select"
              value={videoSettings.codec}
              disabled={isCompressing}
              onChange={(e) => {
                const c = e.target.value as VideoCodecOption;
                onChangeVideoSettings((prev) => ({ ...prev, codec: c }));
              }}
            >
              <option value="h264">H.264 (Universal)</option>
              <option value="h265">H.265 (High Efficiency)</option>
            </select>
          </div>
        </div>

        {/* Image Settings Box */}
        <div className="settings-box">
          <div className="settings-box-header">
            <ImageIcon size={18} color="#a855f7" />
            <h4>Image Compression Settings</h4>
          </div>

          <div className="setting-group">
            <label htmlFor="folder-image-quality-select">Quality Preset:</label>
            <select
              id="folder-image-quality-select"
              className="field-select"
              value={imageSettings.quality}
              disabled={isCompressing}
              onChange={(e) => {
                const q = e.target.value as QualityPreset;
                onChangeImageSettings((prev) => ({ ...prev, quality: q }));
              }}
            >
              <option value="auto">Auto (Balanced)</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="setting-group">
            <label htmlFor="folder-image-format-select">Output Format:</label>
            <select
              id="folder-image-format-select"
              className="field-select"
              value={imageSettings.outputFormat}
              disabled={isCompressing}
              onChange={(e) => {
                const fmt = e.target.value as ImageOutputFormat;
                onChangeImageSettings((prev) => ({ ...prev, outputFormat: fmt }));
              }}
            >
              <option value="original">Keep Original</option>
              <option value="webp">WebP</option>
              <option value="jpg">JPG</option>
              <option value="png">PNG</option>
            </select>
          </div>
        </div>
      </div>

      {/* Primary Action Button */}
      <div className="folder-launch-section">
        <button
          type="button"
          className="btn-start-folder-compress"
          onClick={onStartCompression}
        >
          <Sliders size={20} />
          <span>Compress Folder ({scanResult.totalFiles} Media Files)</span>
        </button>
      </div>
    </div>
  );
};
