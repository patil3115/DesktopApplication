import React from 'react';
import { XCircle, Activity } from 'lucide-react';
import { CompressionProgress } from '../../common/types';

interface ProgressBarProps {
  progress: CompressionProgress | null;
  onCancel: () => void;
  isCancelling: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, onCancel, isCancelling }) => {
  const percent = progress?.percent ?? 0;

  return (
    <div className="card progress-card">
      <div className="progress-header">
        <div className="progress-status-text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={18} color="#10b981" />
          <span>{isCancelling ? 'Cancelling task and cleaning files...' : 'Compressing video locally...'}</span>
        </div>
        <div className="progress-percent-text">{percent}%</div>
      </div>

      <div className="progress-track">
        <div className="progress-bar" style={{ width: `${percent}%` }}></div>
      </div>

      <div className="progress-stats-row">
        <span>FPS: <strong>{progress?.fps ?? 0}</strong></span>
        <span>Speed: <strong>{progress?.speed ?? '1.0x'}</strong></span>
        <span>Time: <strong>{progress?.currentTimeSeconds ?? 0}s</strong> / {progress?.totalTimeSeconds ?? 0}s</span>
        <span>Frames: <strong>{progress?.currentFrame ?? 0}</strong></span>
      </div>

      <button
        type="button"
        className="btn-cancel"
        onClick={onCancel}
        disabled={isCancelling}
      >
        <XCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
        {isCancelling ? 'Terminating...' : 'Cancel'}
      </button>
    </div>
  );
};
