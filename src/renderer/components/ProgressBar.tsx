import React from 'react';
import { XCircle, Activity } from 'lucide-react';
import { CompressionProgress } from '../../common/types';

export interface BatchProgressInfo {
  currentIndex: number;
  totalCount: number;
  currentFileName: string;
  completedCount: number;
}

interface ProgressBarProps {
  progress?: CompressionProgress | null;
  onCancel: () => void;
  isCancelling: boolean;
  batchInfo?: BatchProgressInfo;
  mode?: 'compress' | 'audio' | 'image';
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progress = null,
  onCancel,
  isCancelling,
  batchInfo,
  mode = 'compress'
}) => {
  const percent = progress?.percent ?? 0;
  const accentColor = mode === 'audio' ? '#a78bfa' : mode === 'image' ? '#06b6d4' : '#10b981';

  // Overall batch percentage (based on completed count + fraction of current file)
  const overallPercent = batchInfo
    ? Math.min(
        100,
        Math.round(
          ((batchInfo.completedCount + percent / 100) / batchInfo.totalCount) * 100
        )
      )
    : percent;

  return (
    <div className="card progress-card">
      {batchInfo ? (
        <>
          {/* Level 1: Overall Batch Progress */}
          <div className="progress-header">
            <div className="progress-status-text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={18} color={accentColor} />
              <span>
                {isCancelling
                  ? 'Cancelling batch and cleaning files...'
                  : `Processing ${batchInfo.currentIndex + 1} of ${batchInfo.totalCount}: ${batchInfo.currentFileName}`}
              </span>
            </div>
            <div className="progress-percent-text" style={{ fontSize: 16, color: 'var(--text-secondary)' }}>
              Overall: <strong>{batchInfo.completedCount} / {batchInfo.totalCount} completed</strong>
            </div>
          </div>

          <div className="progress-track" style={{ height: 8 }}>
            <div
              className="progress-bar"
              style={{
                width: `${overallPercent}%`,
                background:
                  mode === 'audio'
                    ? 'linear-gradient(90deg, #7c3aed, #a78bfa)'
                    : 'linear-gradient(90deg, #059669, #10b981)'
              }}
            ></div>
          </div>

          {/* Level 2: Current File Progress */}
          <div style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Current File Progress
              </span>
              <span className="progress-percent-text" style={{ fontSize: 20 }}>
                {percent}%
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-bar"
                style={{
                  width: `${percent}%`,
                  background:
                    mode === 'audio'
                      ? 'linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)'
                      : 'linear-gradient(90deg, #059669, #10b981, #34d399)'
                }}
              ></div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Single-file progress */}
          <div className="progress-header">
            <div className="progress-status-text" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={18} color={accentColor} />
              <span>
                {isCancelling
                  ? 'Cancelling task and cleaning files...'
                  : mode === 'audio'
                  ? 'Extracting audio locally...'
                  : 'Compressing video locally...'}
              </span>
            </div>
            <div className="progress-percent-text">{percent}%</div>
          </div>

          <div className="progress-track">
            <div
              className="progress-bar"
              style={{
                width: `${percent}%`,
                background:
                  mode === 'audio'
                    ? 'linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)'
                    : 'linear-gradient(90deg, #059669, #10b981, #34d399)'
              }}
            ></div>
          </div>
        </>
      )}

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
        {isCancelling
          ? 'Terminating...'
          : batchInfo
          ? 'Cancel Batch'
          : 'Cancel'}
      </button>
    </div>
  );
};
