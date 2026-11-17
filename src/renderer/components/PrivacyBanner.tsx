import React from 'react';
import { Shield } from 'lucide-react';

interface PrivacyBannerProps {
  mode?: 'compress' | 'audio' | 'image' | 'folder';
}

export const PrivacyBanner: React.FC<PrivacyBannerProps> = ({ mode = 'compress' }) => {
  return (
    <div className="privacy-banner">
      <Shield size={18} color="#10b981" />
      <div>
        <strong>Local Privacy Invariant:</strong>{' '}
        {mode === 'audio'
          ? 'Audio extraction happens locally using bundled engine. Your video and audio never leave this computer.'
          : mode === 'image'
          ? 'Image compression happens locally. Your images and thumbnails never leave this computer.'
          : mode === 'folder'
          ? 'Folder media compression runs 100% offline. Compressed files are written to a separate output directory, and original files are never altered.'
          : 'Your video is processed locally on this computer. Nothing is uploaded.'}
      </div>
    </div>
  );
};
