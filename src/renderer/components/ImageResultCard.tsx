import React from 'react';
import { CheckCircle2, FolderOpen, RotateCcw, Info } from 'lucide-react';
import { ImageCompressionResult } from '../../common/types';
import { formatBytes } from '../../common/formatters';

interface ImageResultCardProps {
  result: ImageCompressionResult;
  onOpenFolder: () => void;
  onReset: () => void;
}

export const ImageResultCard: React.FC<ImageResultCardProps> = ({ result, onOpenFolder, onReset }) => {
  const isBigger = result.compressedSizeBytes >= result.originalSizeBytes;
  const sizeDiff = result.originalSizeBytes - result.compressedSizeBytes;

  return (
    <div className="card result-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <CheckCircle2 size={24} color="#06b6d4" />
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            Image Compression Complete
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            File saved to: <strong>{result.outputFileName}</strong>
          </p>
        </div>
      </div>

      <div className="comparison-grid">
        <div className="comparison-box">
          <div className="comparison-label">Original Size</div>
          <div className="comparison-val">{formatBytes(result.originalSizeBytes)}</div>
        </div>

        {result.targetSizeBytes && result.targetSizeBytes > 0 ? (
          <div className="comparison-box">
            <div className="comparison-label">Target Size</div>
            <div className="comparison-val" style={{ color: 'var(--accent-cyan)' }}>
              {formatBytes(result.targetSizeBytes)}
            </div>
          </div>
        ) : null}

        <div className="comparison-box">
          <div className="comparison-label">Compressed Size</div>
          <div className="comparison-val">{formatBytes(result.compressedSizeBytes)}</div>
        </div>

        <div className="comparison-box highlight" style={{ borderColor: 'rgba(6, 182, 212, 0.3)', background: 'rgba(6, 182, 212, 0.08)' }}>
          <div className="comparison-label">Space Saved</div>
          <div className="comparison-val" style={{ color: isBigger ? '#f87171' : 'var(--accent-cyan)' }}>
            {isBigger ? `+${Math.abs(result.reductionPercentage)}%` : `${result.reductionPercentage}%`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {isBigger ? `Output is ${formatBytes(Math.abs(sizeDiff))} larger` : `${formatBytes(sizeDiff)} saved`}
          </div>
        </div>
      </div>

      {/* Output Details */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--text-secondary)', padding: '4px 0' }}>
        <span>Output Format: <strong>{result.outputFormat}</strong></span>
        <span>•</span>
        <span>Output Dimensions: <strong>{result.width} × {result.height} px</strong></span>
      </div>

      {result.note && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'flex-start', gap: 6, background: 'var(--bg-surface-elevated)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
          <Info size={14} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{result.note}</span>
        </div>
      )}

      <div className="result-actions">
        <button type="button" className="btn-open-folder" onClick={onOpenFolder}>
          <FolderOpen size={16} />
          Open Output Folder
        </button>

        <button type="button" className="btn-new-video" onClick={onReset}>
          <RotateCcw size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          Compress Another Image
        </button>
      </div>
    </div>
  );
};

