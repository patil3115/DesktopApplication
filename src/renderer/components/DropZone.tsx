import React, { useState } from 'react';
import { UploadCloud, Film, Image as ImageIcon } from 'lucide-react';

interface DropZoneProps {
  onBrowse: () => void;
  isLoading: boolean;
  mode?: 'video' | 'image';
}

export const DropZone: React.FC<DropZoneProps> = ({ onBrowse, isLoading, mode = 'video' }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    onBrowse();
  };

  const isImage = mode === 'image';

  return (
    <div
      className={`dropzone ${isDragOver ? 'active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onBrowse}
      role="button"
      tabIndex={0}
    >
      <div className="dropzone-icon">
        {isDragOver ? (
          isImage ? <ImageIcon size={48} /> : <Film size={48} />
        ) : isImage ? (
          <ImageIcon size={48} />
        ) : (
          <UploadCloud size={48} />
        )}
      </div>
      <div>
        <p className="dropzone-text-primary">
          {isLoading
            ? (isImage ? 'Inspecting image metadata...' : 'Inspecting video metadata...')
            : (isImage ? 'Drag & Drop Image(s) Here' : 'Drag & Drop Video(s) Here')}
        </p>
        <p className="dropzone-text-secondary">
          {isImage ? 'Supported: JPG, JPEG, PNG, WebP, BMP' : 'Supported: MP4, MKV, MOV, AVI, WEBM, M4V'}
        </p>
      </div>
      <button
        type="button"
        className="btn-browse"
        onClick={(e) => {
          e.stopPropagation();
          onBrowse();
        }}
        disabled={isLoading}
      >
        {isLoading ? 'Reading File...' : isImage ? 'Browse Images' : 'Browse Videos'}
      </button>
    </div>
  );
};
