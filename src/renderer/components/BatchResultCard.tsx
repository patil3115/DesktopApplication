import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Folder, RotateCcw, Check, Music } from 'lucide-react';
import { VideoQueueItem, CompressionResult, AudioExtractionResult } from '../../common/types';
import { formatBytes } from '../../common/formatters';

interface BatchResultCardProps {
  items: VideoQueueItem[];
  isCancelled: boolean;
  mode: 'compress' | 'audio';
  onOpenFolder: (targetPath?: string) => void;
  onReset: () => void;
}

export const BatchResultCard: React.FC<BatchResultCardProps> = ({
  items,
  isCancelled,
  mode,
  onOpenFolder,
  onReset
}) => {
  const successItems = items.filter((item) => item.status === 'completed');
  const failedItems = items.filter((item) => item.status === 'failed');
  const cancelledItems = items.filter((item) => item.status === 'cancelled' || item.status === 'pending');

  const totalOriginalBytes = items.reduce((acc, item) => acc + item.fileSizeBytes, 0);

  let totalOutputBytes = 0;
  if (mode === 'compress') {
    totalOutputBytes = successItems.reduce((acc, item) => {
      const res = item.compressResult as CompressionResult | undefined;
      return acc + (res?.compressedSizeBytes ?? 0);
    }, 0);
  } else {
    totalOutputBytes = successItems.reduce((acc, item) => {
      const res = item.audioResult as AudioExtractionResult | undefined;
      return acc + (res?.audioSizeBytes ?? 0);
    }, 0);
  }

  const successOriginalBytes = successItems.reduce((acc, item) => acc + item.fileSizeBytes, 0);
  const totalReductionBytes = successOriginalBytes > totalOutputBytes ? successOriginalBytes - totalOutputBytes : 0;
  const overallReductionPercent =
    successOriginalBytes > 0
      ? Math.round(((totalReductionBytes / successOriginalBytes) * 100) * 10) / 10
      : 0;

  return (
    <div className="card result-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          {isCancelled ? (
            <>
              <AlertTriangle size={18} color="#f59e0b" />
              <span style={{ color: '#f59e0b' }}>Batch Processing Cancelled</span>
            </>
          ) : failedItems.length === 0 ? (
            <>
              <CheckCircle2 size={18} color="#10b981" />
              <span style={{ color: '#34d399' }}>Batch Processing Complete</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={18} color="#10b981" />
              <span>Batch Complete (With Errors)</span>
            </>
          )}
        </h2>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {successItems.length} of {items.length} videos completed
        </div>
      </div>

      {/* Summary statistics boxes */}
      <div className="comparison-grid">
        <div className="comparison-box">
          <div className="comparison-label">Successful</div>
          <div className="comparison-val" style={{ color: '#34d399' }}>
            {successItems.length}
          </div>
        </div>

        <div className="comparison-box">
          <div className="comparison-label">Failed</div>
          <div className="comparison-val" style={{ color: failedItems.length > 0 ? '#f87171' : 'var(--text-muted)' }}>
            {failedItems.length}
          </div>
        </div>

        {mode === 'compress' ? (
          <div className="comparison-box highlight">
            <div className="comparison-label">Space Saved</div>
            <div className="comparison-val savings">
              {overallReductionPercent > 0 ? `-${overallReductionPercent}%` : '0%'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {formatBytes(totalReductionBytes)} saved
            </div>
          </div>
        ) : (
          <div className="comparison-box">
            <div className="comparison-label">Audio Extracted</div>
            <div className="comparison-val" style={{ color: '#a78bfa' }}>
              {formatBytes(totalOutputBytes)}
            </div>
          </div>
        )}
      </div>

      {/* Per-file details */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.05em' }}>
          Batch File Results
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
          {items.map((item, idx) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                gap: 12
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                {item.status === 'completed' && <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0 }} />}
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

                  {item.status === 'completed' && mode === 'compress' && item.compressResult && (
                    <div style={{ fontSize: 11, color: '#34d399', marginTop: 2 }}>
                      {item.formattedSize} → {formatBytes(item.compressResult.compressedSizeBytes)} (-{item.compressResult.reductionPercentage}%)
                    </div>
                  )}

                  {item.status === 'completed' && mode === 'audio' && item.audioResult && (
                    <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 2 }}>
                      {item.audioResult.outputFileName} ({item.audioResult.formattedSize})
                      {item.audioResult.wasStreamCopied && ' • Stream Copied'}
                    </div>
                  )}

                  {item.status === 'failed' && (
                    <div style={{ fontSize: 11, color: '#f87171', marginTop: 2 }}>
                      {item.error?.code ? `[${item.error.code}] ` : ''}
                      {item.error?.userMessage || 'Processing failed.'}
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
                  onClick={() =>
                    onOpenFolder(
                      item.compressResult?.outputPath || item.audioResult?.outputPath
                    )
                  }
                  title="Reveal in File Explorer"
                >
                  <Folder size={12} />
                  <span>Show</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="result-actions" style={{ marginTop: 12 }}>
        {successItems.length > 0 && (
          <button
            type="button"
            className="btn-open-folder"
            onClick={() => {
              const firstOutput =
                successItems[0]?.compressResult?.outputPath || successItems[0]?.audioResult?.outputPath;
              onOpenFolder(firstOutput);
            }}
          >
            <Folder size={16} />
            <span>Open Destination Folder</span>
          </button>
        )}

        <button
          type="button"
          className="btn-new-video"
          onClick={onReset}
          style={{ flex: successItems.length > 0 ? 0.6 : 1 }}
        >
          <RotateCcw size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          <span>New Batch</span>
        </button>
      </div>
    </div>
  );
};
