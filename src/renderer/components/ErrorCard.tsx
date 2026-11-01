import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { StructuredError } from '../../common/types';

interface ErrorCardProps {
  error: StructuredError;
  onDismiss: () => void;
}

export const ErrorCard: React.FC<ErrorCardProps> = ({ error, onDismiss }) => {
  return (
    <div className="error-card">
      <div className="error-title">
        <AlertTriangle size={18} />
        <span>Compression Notice ({error.code})</span>
      </div>

      <div className="error-message">
        <p>{error.userMessage}</p>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShieldCheck size={14} color="#10b981" />
          <span>No external upload occurred. Temporary files have been cleaned up.</span>
        </div>
      </div>

      <button type="button" className="btn-dismiss-error" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
};
