import React, { useState } from 'react';
import { UploadCloud, Film } from 'lucide-react';

interface DropZoneProps {
  onBrowse: () => void;
  isLoading: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({ onBrowse, isLoading }) => {
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
    // Trigger file browse directly or handle dropped files safely
    onBrowse();
  };

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
        {isDragOver ? <Film size={48} /> : <UploadCloud size={48} />}
      </div>
      <div>
        <p className="dropzone-text-primary">
          {isLoading ? 'Inspecting video metadata...' : 'Drag & Drop Video(s) Here'}
        </p>
        <p className="dropzone-text-secondary">Supported: MP4, MKV, MOV, AVI, WEBM, M4V</p>
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
        Browse Videos
      </button>
    </div>
  );
};
