import React from 'react';
import { Shield } from 'lucide-react';

interface PrivacyBannerProps {
  mode?: 'compress' | 'audio' | 'image';
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
          : 'Your video is processed locally on this computer. Nothing is uploaded.'}
      </div>
    </div>
  );
};
