import React from 'react';
import { CheckCircle2, FolderOpen, RotateCcw } from 'lucide-react';
import { CompressionResult } from '../../common/types';
import { formatBytes } from '../../common/formatters';

interface ResultCardProps {
  result: CompressionResult;
  onOpenFolder: () => void;
  onReset: () => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result, onOpenFolder, onReset }) => {
  return (
    <div className="card result-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <CheckCircle2 size={24} color="#10b981" />
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            Compression Complete
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

        <div className="comparison-box">
          <div className="comparison-label">Compressed Size</div>
          <div className="comparison-val">{formatBytes(result.compressedSizeBytes)}</div>
        </div>

        <div className="comparison-box highlight">
          <div className="comparison-label">Space Saved</div>
          <div className="comparison-val savings">{result.reductionPercentage}%</div>
        </div>
      </div>

      <div className="result-actions">
        <button type="button" className="btn-open-folder" onClick={onOpenFolder}>
          <FolderOpen size={16} />
          Open Output Folder
        </button>

        <button type="button" className="btn-new-video" onClick={onReset}>
          <RotateCcw size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          Compress Another
        </button>
      </div>
    </div>
  );
};
