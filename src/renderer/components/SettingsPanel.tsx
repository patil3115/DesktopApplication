import React from 'react';
import { Sliders, Folder, Play, Check } from 'lucide-react';
import {
  CompressionSettings,
  QualityPreset,
  ResolutionOption,
  VideoCodecOption,
  AudioCodecOption
} from '../../common/types';

interface SettingsPanelProps {
  settings: CompressionSettings;
  onChange: (updated: CompressionSettings) => void;
  onCompress: () => void;
  onSelectOutputDir: () => void;
  disabled: boolean;
  batchCount?: number;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onChange,
  onCompress,
  onSelectOutputDir,
  disabled,
  batchCount
}) => {
  return (
    <div className="card">
      <h2 className="card-title">
        <Sliders size={16} />
        Compression Settings
      </h2>

      <div className="settings-grid">
        <div className="field-group">
          <label className="field-label" htmlFor="quality-select">Quality</label>
          <select
            id="quality-select"
            className="field-select"
            value={settings.quality}
            disabled={disabled}
            onChange={(e) => onChange({ ...settings, quality: e.target.value as QualityPreset })}
          >
            <option value="high">High (Visually Near-Lossless)</option>
            <option value="medium">Medium (Recommended)</option>
            <option value="low">Low (Maximum Space Saving)</option>
          </select>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="resolution-select">Resolution</label>
          <select
            id="resolution-select"
            className="field-select"
            value={settings.resolution}
            disabled={disabled}
            onChange={(e) => onChange({ ...settings, resolution: e.target.value as ResolutionOption })}
          >
            <option value="original">Keep Original</option>
            <option value="1080p">1080p (Full HD)</option>
            <option value="720p">720p (HD)</option>
            <option value="480p">480p (SD)</option>
          </select>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="codec-select">Video Codec</label>
          <select
            id="codec-select"
            className="field-select"
            value={settings.codec}
            disabled={disabled}
            onChange={(e) => onChange({ ...settings, codec: e.target.value as VideoCodecOption })}
          >
            <option value="h264">H.264 (Universal Compatibility)</option>
            <option value="h265">H.265 / HEVC (Modern Efficiency)</option>
          </select>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="audio-select">Audio</label>
          <select
            id="audio-select"
            className="field-select"
            value={settings.audioCodec}
            disabled={disabled}
            onChange={(e) => onChange({ ...settings, audioCodec: e.target.value as AudioCodecOption })}
          >
            <option value="aac">AAC (Re-encode)</option>
            <option value="copy">Copy Stream (Lossless Audio)</option>
            <option value="none">Mute / Remove Audio</option>
          </select>
        </div>

        {/* Privacy Feature: Remove Metadata */}
        <label className="checkbox-row" htmlFor="remove-metadata-checkbox">
          <input
            id="remove-metadata-checkbox"
            type="checkbox"
            className="checkbox-custom"
            checked={settings.removeMetadata}
            disabled={disabled}
            onChange={(e) => onChange({ ...settings, removeMetadata: e.target.checked })}
          />
          <div>
            <div className="checkbox-label-title">
              Remove metadata from compressed video
            </div>
            <div className="checkbox-label-desc">
              Strips embedded GPS coordinates, device serial numbers, camera make, and author timestamps.
            </div>
          </div>
        </label>

        {/* Output Directory Option */}
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Destination Folder: <strong>{settings.customOutputDir ? settings.customOutputDir : 'Same folder as source video'}</strong>
          </div>
          <button
            type="button"
            className="btn-browse"
            style={{ padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={onSelectOutputDir}
            disabled={disabled}
          >
            <Folder size={14} />
            {settings.customOutputDir ? 'Change Destination' : 'Select Destination'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          className="btn-compress"
          onClick={onCompress}
          disabled={disabled}
        >
          <Play size={18} fill="currentColor" />
          {batchCount && batchCount > 1 ? `Compress All Videos (${batchCount})` : 'Compress Video'}
        </button>
      </div>
    </div>
  );
};
