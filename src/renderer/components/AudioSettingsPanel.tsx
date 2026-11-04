import React from 'react';
import { Music, Folder, Zap, Play } from 'lucide-react';
import {
  AudioExtractionSettings,
  AudioFormat,
  AudioBitrate,
  AudioStreamInfo
} from '../../common/types';

interface AudioSettingsPanelProps {
  settings: AudioExtractionSettings;
  onChange: (updated: AudioExtractionSettings) => void;
  onExtract: () => void;
  onSelectOutputDir: () => void;
  disabled: boolean;
  selectedStream?: AudioStreamInfo;
  hasAudio: boolean;
  batchCount?: number;
}

export const AudioSettingsPanel: React.FC<AudioSettingsPanelProps> = ({
  settings,
  onChange,
  onExtract,
  onSelectOutputDir,
  disabled,
  selectedStream,
  hasAudio,
  batchCount
}) => {
  const isLossless = settings.format === 'wav' || settings.format === 'flac';

  // Check if stream copy optimization is available
  const inputCodec = selectedStream?.codec.toUpperCase();
  const isStreamCopyAvailable =
    (settings.format === 'm4a' && inputCodec === 'AAC') ||
    (settings.format === 'mp3' && inputCodec === 'MP3') ||
    (settings.format === 'flac' && inputCodec === 'FLAC');

  return (
    <div className="card">
      <h2 className="card-title">
        <Music size={16} color="#a78bfa" />
        Audio Extraction Settings
      </h2>

      <div className="settings-grid">
        {/* Output Format */}
        <div className="field-group">
          <label className="field-label" htmlFor="audio-format-select">Output Format</label>
          <select
            id="audio-format-select"
            className="field-select"
            value={settings.format}
            disabled={disabled || !hasAudio}
            onChange={(e) => {
              const newFormat = e.target.value as AudioFormat;
              // Reset bitrate to 192k if format supports it
              const defaultBitrate: AudioBitrate = '192k';
              onChange({
                ...settings,
                format: newFormat,
                bitrate: newFormat === 'wav' || newFormat === 'flac' ? undefined : defaultBitrate
              });
            }}
          >
            <option value="mp3">MP3 (Universal Compatibility)</option>
            <option value="m4a">M4A / AAC (High Quality & Efficiency)</option>
            <option value="wav">WAV (Lossless Uncompressed)</option>
            <option value="flac">FLAC (Lossless Compressed)</option>
            <option value="ogg">OGG (Vorbis Audio)</option>
          </select>
        </div>

        {/* Audio Quality / Bitrate */}
        <div className="field-group">
          <label className="field-label" htmlFor="audio-bitrate-select">Audio Quality</label>
          {isLossless ? (
            <div
              style={{
                padding: '10px 14px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-muted)',
                fontSize: 14
              }}
            >
              Lossless (No Bitrate Compression)
            </div>
          ) : (
            <select
              id="audio-bitrate-select"
              className="field-select"
              value={settings.bitrate || '192k'}
              disabled={disabled || !hasAudio}
              onChange={(e) => onChange({ ...settings, bitrate: e.target.value as AudioBitrate })}
            >
              <option value="128k">128 kbps (Standard Quality)</option>
              <option value="192k">192 kbps (High Quality - Recommended)</option>
              <option value="256k">256 kbps (Very High Quality)</option>
              {settings.format !== 'm4a' && <option value="320k">320 kbps (Maximum Quality)</option>}
            </select>
          )}
        </div>

        {/* Stream copy optimization notification */}
        {isStreamCopyAvailable && (
          <div style={{ gridColumn: '1 / -1' }} className="stream-copy-badge">
            <Zap size={16} fill="currentColor" />
            <span>
              Direct Stream Copy Active: The {inputCodec} stream will be copied directly into {settings.format.toUpperCase()} without re-encoding (Zero Quality Loss & Fast).
            </span>
          </div>
        )}

        {/* Privacy: Remove Metadata */}
        <label className="checkbox-row" htmlFor="audio-remove-metadata-checkbox">
          <input
            id="audio-remove-metadata-checkbox"
            type="checkbox"
            className="checkbox-custom"
            checked={settings.removeMetadata}
            disabled={disabled || !hasAudio}
            onChange={(e) => onChange({ ...settings, removeMetadata: e.target.checked })}
          />
          <div>
            <div className="checkbox-label-title">
              Remove metadata from extracted audio
            </div>
            <div className="checkbox-label-desc">
              Strips embedded video container tags, GPS coordinates, device identifiers, and timestamps.
            </div>
          </div>
        </label>

        {/* Destination Folder */}
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Destination Folder: <strong>{settings.customOutputDir ? settings.customOutputDir : 'Same folder as source video'}</strong>
          </div>
          <button
            type="button"
            className="btn-browse"
            style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={onSelectOutputDir}
            disabled={disabled || !hasAudio}
          >
            <Folder size={14} />
            {settings.customOutputDir ? 'Change Destination' : 'Select Destination'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          className="btn-extract-audio"
          onClick={onExtract}
          disabled={disabled || !hasAudio}
        >
          <Play size={18} fill="currentColor" />
          {batchCount && batchCount > 1 ? `Convert All Videos (${batchCount})` : 'Extract Audio'}
        </button>
      </div>
    </div>
  );
};
