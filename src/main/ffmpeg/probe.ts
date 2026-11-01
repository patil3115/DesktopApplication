import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { VideoMetadata, AudioStreamInfo, StructuredError } from '../../common/types';
import { formatBytes, formatDuration, extractFpsFromStream } from '../../common/formatters';
import { binaryResolver } from './binary-resolver';
import { logger } from '../utils/logger';

export async function probeVideoFile(
  filePath: string
): Promise<{ success: true; metadata: VideoMetadata } | { success: false; error: StructuredError }> {
  let ffprobePath: string;
  try {
    ffprobePath = binaryResolver.getFfprobePath();
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'FFMPEG_NOT_FOUND',
        userMessage: 'Bundled FFprobe binary could not be found or verified.'
      }
    };
  }

  const stat = fs.statSync(filePath);
  const args = [
    '-v',
    'error',
    '-show_entries',
    'format=duration,size,bit_rate:stream=index,codec_name,codec_type,width,height,r_frame_rate,avg_frame_rate,time_base,bit_rate,channels,channel_layout,sample_rate:stream_tags',
    '-of',
    'json',
    filePath
  ];

  logger.info('Executing safe FFprobe probe on video');

  return new Promise((resolve) => {
    let stdoutData = '';
    let stderrData = '';
    let isSettled = false;

    const child = spawn(ffprobePath, args, {
      shell: false,
      windowsHide: true,
      env: {
        SYSTEMROOT: process.env['SYSTEMROOT'] || 'C:\\Windows',
        PATH: '' // Strip PATH from child process environment
      }
    });

    // 10 second timeout on metadata probing
    const timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore
        }
        resolve({
          success: false,
          error: {
            code: 'PROBE_FAILED',
            userMessage: 'Video probe timed out. The file may be corrupted or unreadable.'
          }
        });
      }
    }, 10000);

    child.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.on('error', (err) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timer);
      logger.error('FFprobe execution error', err);
      resolve({
        success: false,
        error: {
          code: 'PROBE_FAILED',
          userMessage: 'Failed to inspect video metadata.'
        }
      });
    });

    child.on('close', (code) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timer);

      if (code !== 0) {
        logger.warn('FFprobe exited with non-zero code', code, stderrData);
        return resolve({
          success: false,
          error: {
            code: 'PROBE_FAILED',
            userMessage: 'Unsupported or unreadable video file format.'
          }
        });
      }

      try {
        const parsed = JSON.parse(stdoutData) as {
          streams?: Array<{
            index?: number;
            codec_type?: string;
            codec_name?: string;
            width?: number;
            height?: number;
            r_frame_rate?: string;
            avg_frame_rate?: string;
            time_base?: string;
            bit_rate?: string;
            channels?: number;
            channel_layout?: string;
            sample_rate?: string;
            tags?: {
              title?: string;
              name?: string;
              language?: string;
            };
          }>;
          format?: {
            duration?: string;
            size?: string;
            bit_rate?: string;
          };
        };

        const streams = parsed.streams || [];
        const videoStream = streams.find((s) => s.codec_type === 'video');
        const audioStreamsRaw = streams.filter((s) => s.codec_type === 'audio');

        if (!videoStream && audioStreamsRaw.length === 0) {
          return resolve({
            success: false,
            error: {
              code: 'INVALID_INPUT',
              userMessage: 'The selected file does not contain valid audio or video streams.'
            }
          });
        }

        const width = videoStream?.width || 0;
        const height = videoStream?.height || 0;
        const durationSec = parsed.format?.duration ? parseFloat(parsed.format.duration) : 0;
        const fpsInfo = extractFpsFromStream(videoStream);
        const fps = fpsInfo.fps;
        const formattedFps = fpsInfo.formattedFps;
        const bitrateKbps = parsed.format?.bit_rate
          ? Math.round(parseFloat(parsed.format.bit_rate) / 1000)
          : 0;

        // Parse individual audio streams
        const audioStreams: AudioStreamInfo[] = audioStreamsRaw.map((s, idx) => {
          const sampleRate = s.sample_rate ? parseInt(s.sample_rate, 10) : 44100;
          const formattedSampleRate =
            sampleRate >= 1000
              ? `${(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)} kHz`
              : `${sampleRate} Hz`;
          const channels = s.channels || 2;
          const channelLayout =
            s.channel_layout || (channels === 1 ? 'Mono' : channels === 2 ? 'Stereo' : `${channels} Channels`);
          const codec = (s.codec_name || 'unknown').toUpperCase();
          const bitRate = s.bit_rate ? Math.round(parseFloat(s.bit_rate) / 1000) : 0;
          const title = s.tags?.title || s.tags?.name;
          const language = s.tags?.language && s.tags.language !== 'und' ? s.tags.language : undefined;

          let label = `Track ${idx + 1}: ${codec} (${channelLayout}, ${formattedSampleRate})`;
          if (title) label += ` - ${title}`;
          else if (language) label += ` [${language.toUpperCase()}]`;

          return {
            index: s.index ?? idx,
            audioIndex: idx,
            codec,
            channels,
            channelLayout,
            sampleRate,
            formattedSampleRate,
            bitrateKbps: bitRate,
            title,
            language,
            label
          };
        });

        const primaryAudio = audioStreams[0];

        const metadata: VideoMetadata = {
          fileName: path.basename(filePath),
          filePath,
          fileSizeBytes: stat.size,
          formattedSize: formatBytes(stat.size),
          durationSeconds: durationSec,
          formattedDuration: formatDuration(durationSec),
          width,
          height,
          resolutionLabel: width && height ? `${width}x${height}` : (videoStream ? 'Unknown' : 'Audio-Only'),
          videoCodec: videoStream ? (videoStream.codec_name || 'unknown').toUpperCase() : 'NONE',
          audioCodec: primaryAudio ? primaryAudio.codec : null,
          fps,
          formattedFps,
          bitrateKbps,
          audioStreams,
          hasAudio: audioStreams.length > 0
        };

        resolve({ success: true, metadata });
      } catch (err) {
        logger.error('Failed to parse FFprobe JSON output', err);
        resolve({
          success: false,
          error: {
            code: 'PROBE_FAILED',
            userMessage: 'Failed to parse video metadata structure.'
          }
        });
      }
    });
  });
}
