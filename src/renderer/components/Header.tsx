import React from 'react';
import { ShieldCheck, Lock } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="app-header">
      <div className="brand-section">
        <div className="brand-icon" title="Air-gapped local encryption and processing">
          <ShieldCheck size={24} />
        </div>
        <div>
          <h1 className="brand-title">Secure Video Compressor</h1>
          <p className="brand-subtitle">Offline-First • Zero Cloud • Local FFmpeg Processing</p>
        </div>
      </div>
      <div className="privacy-badge" title="No network sockets or remote analytics exist in this application">
        <span className="privacy-badge-dot"></span>
        <Lock size={12} />
        <span>100% Offline & Private</span>
      </div>
    </header>
  );
};
