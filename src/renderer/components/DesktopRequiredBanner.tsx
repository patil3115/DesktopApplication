import React from 'react';
import { AlertOctagon, Terminal } from 'lucide-react';

export const DesktopRequiredBanner: React.FC = () => {
  return (
    <div
      style={{
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.4)',
        borderRadius: '12px',
        padding: '24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '14px',
        margin: '20px 0'
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f87171'
        }}
      >
        <AlertOctagon size={28} />
      </div>

      <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f87171' }}>
        Desktop Runtime Required
      </h2>

      <p style={{ fontSize: '14px', color: '#fca5a5', maxWidth: '540px', lineHeight: 1.6 }}>
        Secure Video Compressor must be launched as the desktop application.
        Please start the Electron application instead of opening the Vite URL directly in a browser.
      </p>

      <div
        style={{
          background: '#0a0d14',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '8px',
          padding: '10px 18px',
          fontFamily: 'monospace',
          fontSize: '13px',
          color: '#34d399',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '6px'
        }}
      >
        <Terminal size={14} />
        <span>npm run dev</span>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        This air-gapped security invariant protects your media by ensuring transcoding occurs strictly through local sandboxed worker processes.
      </p>
    </div>
  );
};
