import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Folder, RotateCcw, Image as ImageIcon } from 'lucide-react';
import { ImageQueueItem } from '../../common/types';
import { formatBytes } from '../../common/formatters';

interface BatchImageResultCardProps {
  items: ImageQueueItem[];
  isCancelled: boolean;
  onOpenFolder: (targetPath?: string) => void;
  onReset: () => void;
}

export const BatchImageResultCard: React.FC<BatchImageResultCardProps> = ({
  items,
  isCancelled,
  onOpenFolder,
  onReset
}) => {
  const successItems = items.filter((item) => item.status === 'completed');
  const failedItems = items.filter((item) => item.status === 'failed');

  const totalOriginalBytes = successItems.reduce((acc, item) => acc + item.fileSizeBytes, 0);
  const totalOutputBytes = successItems.reduce((acc, item) => {
    return acc + (item.result?.compressedSizeBytes ?? 0);
  }, 0);

  const totalReductionBytes = totalOriginalBytes > totalOutputBytes ? totalOriginalBytes - totalOutputBytes : 0;
  const overallReductionPercent =
    totalOriginalBytes > 0
      ? Math.round(((totalReductionBytes / totalOriginalBytes) * 100) * 10) / 10
      : 0;

  return (
    <div className="card result-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          {isCancelled ? (
            <>
              <AlertTriangle size={18} color="#f59e0b" />
              <span style={{ color: '#f59e0b' }}>Batch Image Processing Cancelled</span>
            </>
          ) : failedItems.length === 0 ? (
            <>
              <CheckCircle2 size={18} color="#06b6d4" />
              <span style={{ color: 'var(--accent-cyan)' }}>Batch Image Compression Complete</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={18} color="#06b6d4" />
              <span>Batch Complete (With Errors)</span>
            </>
          )}
        </h2>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {successItems.length} of {items.length} images completed
        </div>
      </div>

      {/* Summary statistics boxes */}
      <div className="comparison-grid">
        <div className="comparison-box">
          <div className="comparison-label">Successful</div>
          <div className="comparison-val" style={{ color: 'var(--accent-cyan)' }}>
            {successItems.length}
          </div>
        </div>

        <div className="comparison-box">
          <div className="comparison-label">Failed</div>
          <div className="comparison-val" style={{ color: failedItems.length > 0 ? '#f87171' : 'var(--text-muted)' }}>
            {failedItems.length}
          </div>
        </div>

        <div className="comparison-box highlight" style={{ borderColor: 'rgba(6, 182, 212, 0.3)', background: 'rgba(6, 182, 212, 0.08)' }}>
          <div className="comparison-label">Space Saved</div>
          <div className="comparison-val savings" style={{ color: 'var(--accent-cyan)' }}>
            {overallReductionPercent > 0 ? `-${overallReductionPercent}%` : '0%'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {formatBytes(totalReductionBytes)} saved
          </div>
        </div>
      </div>

      {/* Item-by-item breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Processed Images:
        </div>

        <div
          className="queue-list"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 240,
            overflowY: 'auto',
            paddingRight: 4
          }}
        >
          {items.map((item, idx) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                gap: 10
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                {item.status === 'completed' && <CheckCircle2 size={16} color="#06b6d4" style={{ flexShrink: 0 }} />}
                {item.status === 'failed' && <XCircle size={16} color="#ef4444" style={{ flexShrink: 0 }} />}
                {(item.status === 'cancelled' || item.status === 'pending') && (
                  <AlertTriangle size={16} color="#9ca3af" style={{ flexShrink: 0 }} />
                )}

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    title={item.filePath}
                  >
                    {idx + 1}. {item.fileName}
                  </div>

                  {item.status === 'completed' && item.result && (
                    <div style={{ fontSize: 11, color: 'var(--accent-cyan)', marginTop: 2 }}>
                      {item.formattedSize} → {formatBytes(item.result.compressedSizeBytes)} (-{item.result.reductionPercentage}%)
                      {item.result.targetSizeBytes ? ` • Target: ${formatBytes(item.result.targetSizeBytes)}` : ''}
                      <span> • {item.result.width} × {item.result.height} px</span>
                    </div>
                  )}

                  {item.status === 'failed' && (
                    <div style={{ fontSize: 11, color: '#f87171', marginTop: 2 }}>
                      {item.error?.code ? `[${item.error.code}] ` : ''}
                      {item.error?.userMessage || 'Compression failed.'}
                    </div>
                  )}

                  {(item.status === 'cancelled' || item.status === 'pending') && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Cancelled / Skipped
                    </div>
                  )}
                </div>
              </div>

              {item.status === 'completed' && (
                <button
                  type="button"
                  className="btn-browse"
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0
                  }}
                  onClick={() => onOpenFolder(item.result?.outputPath || item.filePath)}
                >
                  <Folder size={12} />
                  Open
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="result-actions">
        <button
          type="button"
          className="btn-open-folder"
          onClick={() => onOpenFolder()}
        >
          <Folder size={16} />
          Open Output Folder
        </button>

        <button
          type="button"
          className="btn-new-video"
          onClick={onReset}
        >
          <RotateCcw size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          Compress More Images
        </button>
      </div>
    </div>
  );
};

