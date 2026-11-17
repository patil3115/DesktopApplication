import React, { useState } from 'react';
import { UploadCloud, Film, Image as ImageIcon, Folder } from 'lucide-react';

interface DropZoneProps {
  onBrowse: () => void;
  isLoading: boolean;
  mode?: 'video' | 'image' | 'folder';
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
  const isFolder = mode === 'folder';

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
          isFolder ? <Folder size={48} /> : isImage ? <ImageIcon size={48} /> : <Film size={48} />
        ) : isFolder ? (
          <Folder size={48} />
        ) : isImage ? (
          <ImageIcon size={48} />
        ) : (
          <UploadCloud size={48} />
        )}
      </div>
      <div>
        <p className="dropzone-text-primary">
          {isLoading
            ? (isFolder ? 'Scanning folder for media...' : isImage ? 'Inspecting image metadata...' : 'Inspecting video metadata...')
            : (isFolder ? 'Drag & Drop Media Folder Here' : isImage ? 'Drag & Drop Image(s) Here' : 'Drag & Drop Video(s) Here')}
        </p>
        <p className="dropzone-text-secondary">
          {isFolder
            ? 'Recursively scans and compresses nested videos & images with original filenames preserved'
            : isImage
            ? 'Supported: JPG, JPEG, PNG, WebP, BMP'
            : 'Supported: MP4, MKV, MOV, AVI, WEBM, M4V'}
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
        {isLoading
          ? (isFolder ? 'Scanning...' : 'Reading File...')
          : isFolder
          ? 'Browse Folder'
          : isImage
          ? 'Browse Images'
          : 'Browse Videos'}
      </button>
    </div>
  );
};
