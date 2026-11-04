import React from 'react';
import { ListVideo, Plus, Trash2, X, AlertCircle, Film, Music } from 'lucide-react';
import { VideoQueueItem } from '../../common/types';
import { formatBytes } from '../../common/formatters';

interface VideoQueueProps {
  items: VideoQueueItem[];
  onAddMore: () => void;
  onClearAll: () => void;
  onRemoveItem: (id: string) => void;
  disabled: boolean;
  mode: 'compress' | 'audio';
  duplicateNotice?: string | null;
  onDismissDuplicateNotice?: () => void;
}

export const VideoQueue: React.FC<VideoQueueProps> = ({
  items,
  onAddMore,
  onClearAll,
  onRemoveItem,
  disabled,
  mode,
  duplicateNotice,
  onDismissDuplicateNotice
}) => {
  const totalSizeBytes = items.reduce((acc, item) => acc + item.fileSizeBytes, 0);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          <ListVideo size={16} color={mode === 'audio' ? '#a78bfa' : '#10b981'} />
          <span>Selected Videos ({items.length})</span>
        </h2>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Total Size: <strong>{formatBytes(totalSizeBytes)}</strong>
        </div>
      </div>

      {duplicateNotice && (
        <div
          className="duplicate-notice-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            marginBottom: 14,
            fontSize: 13,
            color: '#93c5fd'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={16} />
            <span>{duplicateNotice}</span>
          </div>
          {onDismissDuplicateNotice && (
            <button
              type="button"
              onClick={onDismissDuplicateNotice}
              style={{ background: 'transparent', color: '#93c5fd', padding: 2 }}
              aria-label="Dismiss notice"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Queue items list */}
      <div className="queue-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
        {items.map((item, index) => (
          <div
            key={item.id}
            className="queue-item"
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
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', width: 22, textAlign: 'right' }}>
                {index + 1}.
              </span>
              <div style={{ color: mode === 'audio' ? '#a78bfa' : '#34d399', flexShrink: 0 }}>
                {mode === 'audio' ? <Music size={18} /> : <Film size={18} />}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                  title={item.filePath}
                >
                  {item.fileName}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  <span>{item.resolutionLabel}</span>
                  <span>•</span>
                  <span>{item.formattedDuration}</span>
                  {mode === 'audio' && !item.hasAudio && (
                    <>
                      <span>•</span>
                      <span style={{ color: '#fbbf24', fontWeight: 600 }}>No Audio Track</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                {item.formattedSize}
              </span>
              <button
                type="button"
                className="btn-remove-item"
                onClick={() => onRemoveItem(item.id)}
                disabled={disabled}
                title="Remove from queue"
                style={{
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  padding: 4,
                  borderRadius: 'var(--radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.15s ease'
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Queue action buttons */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px solid var(--border-subtle)'
        }}
      >
        <button
          type="button"
          className="btn-browse"
          style={{ padding: '8px 18px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={onAddMore}
          disabled={disabled}
        >
          <Plus size={14} />
          <span>Add More</span>
        </button>

        <button
          type="button"
          className="btn-clear-queue"
          onClick={onClearAll}
          disabled={disabled}
          style={{
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            background: 'var(--danger-dim)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Trash2 size={14} />
          <span>Clear All</span>
        </button>
      </div>
    </div>
  );
};
