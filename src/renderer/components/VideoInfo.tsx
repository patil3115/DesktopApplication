import React from 'react';
import { Info, RefreshCw, Volume2, AlertCircle } from 'lucide-react';
import { VideoMetadata } from '../../common/types';

interface VideoInfoProps {
  metadata: VideoMetadata;
  onChangeFile: () => void;
  disabled: boolean;
  mode?: 'compress' | 'audio';
  selectedAudioTrackIndex?: number;
  onSelectAudioTrack?: (index: number) => void;
}

export const VideoInfo: React.FC<VideoInfoProps> = ({
  metadata,
  onChangeFile,
  disabled,
  mode = 'compress',
  selectedAudioTrackIndex = 0,
  onSelectAudioTrack
}) => {
  const currentAudioStream = metadata.audioStreams[selectedAudioTrackIndex] || metadata.audioStreams[0];

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="card-title" style={{ margin: 0 }}>
          <Info size={16} />
          {mode === 'audio' ? 'Source Video & Audio Details' : 'Video Information'}
        </h2>
        <button
          type="button"
          className="btn-browse"
          style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={onChangeFile}
          disabled={disabled}
        >
          <RefreshCw size={12} />
          Change Video
        </button>
      </div>

      {!metadata.hasAudio && mode === 'audio' && (
        <div className="no-audio-card" style={{ marginBottom: 16 }}>
          <AlertCircle size={20} />
          <div>
            <strong>No Audio Track</strong>
            <div>This video does not contain an audio stream that can be extracted.</div>
          </div>
        </div>
      )}

      <div className="info-grid">
        <div className="info-item">
          <div className="info-label">File</div>
          <div className="info-value" title={metadata.fileName}>
            {metadata.fileName}
          </div>
        </div>

        <div className="info-item">
          <div className="info-label">Size</div>
          <div className="info-value">{metadata.formattedSize}</div>
        </div>

        <div className="info-item">
          <div className="info-label">Duration</div>
          <div className="info-value">{metadata.formattedDuration}</div>
        </div>

        <div className="info-item">
          <div className="info-label">Resolution</div>
          <div className="info-value">{metadata.resolutionLabel}</div>
        </div>

        <div className="info-item">
          <div className="info-label">Video Codec</div>
          <div className="info-value">{metadata.videoCodec}</div>
        </div>

        <div className="info-item">
          <div className="info-label">Audio Codec</div>
          <div className="info-value">
            {metadata.hasAudio ? (currentAudioStream ? currentAudioStream.codec : metadata.audioCodec || 'None') : 'None'}
          </div>
        </div>

        <div className="info-item">
          <div className="info-label">FPS</div>
          <div className="info-value">
            {metadata.formattedFps || (metadata.fps ? `${metadata.fps} fps` : 'Unknown')}
          </div>
        </div>

        {mode === 'audio' && metadata.hasAudio && (
          <div className="info-item">
            <div className="info-label">Channels & Rate</div>
            <div className="info-value">
              {currentAudioStream
                ? `${currentAudioStream.channelLayout} · ${currentAudioStream.formattedSampleRate}`
                : 'None'}
            </div>
          </div>
        )}
      </div>

      {/* Multiple Audio Stream Track Selector */}
      {mode === 'audio' && metadata.audioStreams.length > 1 && onSelectAudioTrack && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          <label
            className="field-label"
            htmlFor="audio-track-select"
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}
          >
            <Volume2 size={14} color="#a78bfa" />
            <span>Select Audio Track ({metadata.audioStreams.length} available)</span>
          </label>
          <select
            id="audio-track-select"
            className="field-select"
            style={{ width: '100%' }}
            value={selectedAudioTrackIndex}
            disabled={disabled}
            onChange={(e) => onSelectAudioTrack(parseInt(e.target.value, 10))}
          >
            {metadata.audioStreams.map((stream, idx) => (
              <option key={stream.index} value={idx}>
                {stream.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
