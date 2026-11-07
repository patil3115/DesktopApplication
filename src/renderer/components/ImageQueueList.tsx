import React from 'react';
import { Plus, Trash2, X, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { ImageQueueItem } from '../../common/types';

interface ImageQueueListProps {
  items: ImageQueueItem[];
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
  onAddMore: () => void;
  disabled: boolean;
  duplicateNotice?: string | null;
  onDismissDuplicateNotice?: () => void;
}

export const ImageQueueList: React.FC<ImageQueueListProps> = ({
  items,
  onRemoveItem,
  onClearAll,
  onAddMore,
  disabled,
  duplicateNotice,
  onDismissDuplicateNotice
}) => {
  if (items.length === 0) return null;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          <ImageIcon size={16} />
          Selected Images ({items.length})
        </h2>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn-browse"
            style={{ padding: '5px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={onAddMore}
            disabled={disabled}
          >
            <Plus size={14} />
            Add More
          </button>

          <button
            type="button"
            className="btn-browse btn-clear-queue"
            style={{
              padding: '5px 12px',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: '#ef4444',
              borderColor: 'rgba(239, 68, 68, 0.3)'
            }}
            onClick={onClearAll}
            disabled={disabled}
          >
            <Trash2 size={14} />
            Clear All
          </button>
        </div>
      </div>

      {/* Duplicate Notice */}
      {duplicateNotice && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
            color: '#fbbf24'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={14} />
            <span>{duplicateNotice}</span>
          </div>
          {onDismissDuplicateNotice && (
            <button
              type="button"
              onClick={onDismissDuplicateNotice}
              style={{ background: 'transparent', border: 'none', color: '#fbbf24', cursor: 'pointer' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Queue Items */}
      <div
        className="queue-list"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxHeight: 280,
          overflowY: 'auto',
          paddingRight: 4
        }}
      >
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="queue-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              gap: 12
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 20 }}>
                {idx + 1}.
              </span>

              {/* Local Safe Thumbnail */}
              {item.thumbnailDataUrl ? (
                <img
                  src={item.thumbnailDataUrl}
                  alt={item.fileName}
                  style={{
                    width: 36,
                    height: 36,
                    objectFit: 'cover',
                    borderRadius: 4,
                    border: '1px solid var(--border-subtle)',
                    flexShrink: 0
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 4,
                    background: 'var(--bg-surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    flexShrink: 0
                  }}
                >
                  <ImageIcon size={18} />
                </div>
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
                  {item.fileName}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  <span>{item.formattedSize}</span>
                  <span>•</span>
                  <span style={{ textTransform: 'uppercase' }}>{item.format}</span>
                  {item.width > 0 && item.height > 0 && (
                    <>
                      <span>•</span>
                      <span>{item.width} × {item.height} px</span>
                    </>
                  )}
                  {item.hasAlpha && (
                    <span
                      style={{
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: 'rgba(6, 182, 212, 0.15)',
                        color: 'var(--accent-cyan)',
                        fontSize: 10,
                        fontWeight: 600
                      }}
                    >
                      Alpha
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Remove item button */}
            <button
              type="button"
              className="btn-remove-item"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 6,
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
              onClick={() => onRemoveItem(item.id)}
              disabled={disabled}
              title={`Remove ${item.fileName}`}
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
