import React from 'react';
import { CheckCircle2, FolderOpen, RotateCcw, Music, Zap } from 'lucide-react';
import { AudioExtractionResult } from '../../common/types';

interface AudioResultCardProps {
  result: AudioExtractionResult;
  onOpenFolder: () => void;
  onReset: () => void;
}

function formatDuration(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds <= 0) return '00:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const AudioResultCard: React.FC<AudioResultCardProps> = ({
  result,
  onOpenFolder,
  onReset
}) => {
  return (
    <div className="card result-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(139, 92, 246, 0.15)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a78bfa'
          }}
        >
          <Music size={22} />
        </div>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            Audio Extraction Complete
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Saved to: <strong>{result.outputFileName}</strong>
          </p>
        </div>
      </div>

      <div className="comparison-grid">
        <div className="comparison-box">
          <div className="comparison-label">Format</div>
          <div className="comparison-val" style={{ textTransform: 'uppercase' }}>
            {result.format}
          </div>
        </div>

        <div className="comparison-box">
          <div className="comparison-label">Audio Size</div>
          <div className="comparison-val">{result.formattedSize}</div>
        </div>

        <div className="comparison-box highlight" style={{ borderColor: 'rgba(139, 92, 246, 0.4)', background: 'rgba(139, 92, 246, 0.1)' }}>
          <div className="comparison-label">Duration</div>
          <div className="comparison-val" style={{ color: '#a78bfa' }}>
            {formatDuration(result.durationSeconds)}
          </div>
        </div>
      </div>

      {result.wasStreamCopied && (
        <div className="stream-copy-badge">
          <Zap size={14} fill="currentColor" />
          <span>Extracted via direct stream copy (Original bitstream preserved without lossy re-encoding).</span>
        </div>
      )}

      <div className="result-actions">
        <button type="button" className="btn-open-folder" onClick={onOpenFolder}>
          <FolderOpen size={16} />
          Open Output Folder
        </button>

        <button type="button" className="btn-new-video" onClick={onReset}>
          <RotateCcw size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          Extract Another Audio
        </button>
      </div>
    </div>
  );
};
