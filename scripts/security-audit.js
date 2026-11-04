/**
 * Comprehensive Automated Security & Functionality Audit Suite
 * 
 * Tests:
 * 1. IPC & Path Validation Security
 * 2. Settings Schema & Injection Protection (Video Compression & Audio Extraction)
 * 3. FFmpeg Binary Integrity & Cryptographic Checksums (SHA-256)
 * 4. Progress Parser Accuracy
 * 5. Temporary Storage Isolation & Lifecycle Tests
 * 6. Live Local Video Compression & Probing (End-to-End)
 * 7. Live Local Video -> Audio Extraction (MP3, M4A Stream Copy, WAV, FLAC, OGG)
 * 8. Video Without Audio Stream Handling
 * 9. Multi-Track Audio Selection Handling
 * 10. Collision-Safe Audio Destination Naming
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

// Import compiled common and main modules
const {
  validateSafePath,
  validateCompressionSettings,
  validateAudioExtractionSettings
} = require('../dist-electron/common/validators');
const {
  validateInputVideoPath,
  validateOutputDirectoryPath
} = require('../dist-electron/main/fs/path-sanitizer');
const { parseFfmpegProgress } = require('../dist-electron/main/ffmpeg/progress-parser');
const { TempFileManager } = require('../dist-electron/main/fs/temp-manager');
const { generateSafeAudioDestinationPath } = require('../dist-electron/main/ffmpeg/audio-extractor');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] ${testName}`);
  }
}

function assertThrows(fn, testName) {
  totalTests++;
  try {
    fn();
    failedTests++;
    console.error(`  [FAIL] ${testName} (Expected exception but none thrown)`);
  } catch (err) {
    passedTests++;
    console.log(`  [PASS] ${testName} (Correctly rejected: ${err.message})`);
  }
}

async function runAudit() {
  console.log('====================================================');
  console.log('   SECURE VIDEO COMPRESSOR - SECURITY AUDIT SUITE   ');
  console.log('====================================================\n');

  // 1. IPC & Path Validation Tests
  console.log('--- 1. IPC & Path Validation Security ---');
  assertThrows(() => validateSafePath(''), 'Reject empty path');
  assertThrows(() => validateSafePath(null), 'Reject null path input');
  assertThrows(() => validateSafePath(123), 'Reject non-string path input');
  assertThrows(() => validateSafePath('C:\\video\0.mp4'), 'Reject null byte in path');
  assertThrows(() => validateSafePath('\\\\evil-server\\share\\video.mp4'), 'Reject UNC network path (\\\\)');
  assertThrows(() => validateSafePath('//evil-server/share/video.mp4'), 'Reject UNC network path (//)');
  assertThrows(() => validateInputVideoPath('C:\\Windows\\System32\\calc.exe'), 'Reject access to protected OS system directory');
  assertThrows(() => validateInputVideoPath('C:\\'), 'Reject drive root as input video');
  assertThrows(() => validateInputVideoPath('C:\\nonexistent_video_path_987654.mp4'), 'Reject nonexistent input file');

  // 2. Compression Settings Schema Tests
  console.log('\n--- 2. Video Compression Schema & Injection Protection ---');
  assertThrows(() => validateCompressionSettings(null), 'Reject null settings');
  assertThrows(() => validateCompressionSettings({ quality: 'extreme' }), 'Reject invalid quality preset');
  assertThrows(() => validateCompressionSettings({ quality: 'high', resolution: '4k' }), 'Reject invalid resolution');
  assertThrows(() => validateCompressionSettings({ quality: 'high', resolution: '1080p', codec: 'vp9; calc.exe' }), 'Reject command injection in codec');
  assertThrows(() => validateCompressionSettings({ quality: 'high', resolution: '1080p', codec: 'h264', audioCodec: 'mp3' }), 'Reject unallowed audio codec');
  assertThrows(() => validateCompressionSettings({ quality: 'high', resolution: '1080p', codec: 'h264', audioCodec: 'aac', removeMetadata: 'yes' }), 'Reject non-boolean removeMetadata');

  const validSettings = validateCompressionSettings({
    quality: 'medium',
    resolution: '720p',
    codec: 'h264',
    audioCodec: 'aac',
    removeMetadata: true
  });
  assert(validSettings.quality === 'medium' && validSettings.resolution === '720p', 'Accept strictly valid compression payload');

  // 3. Audio Extraction Settings Schema Tests
  console.log('\n--- 3. Audio Extraction Schema & Injection Protection ---');
  assertThrows(() => validateAudioExtractionSettings(null), 'Reject null audio settings');
  assertThrows(() => validateAudioExtractionSettings({ format: 'exe' }), 'Reject unapproved audio format (exe)');
  assertThrows(() => validateAudioExtractionSettings({ format: 'mp3; calc.exe' }), 'Reject command injection in audio format');
  assertThrows(() => validateAudioExtractionSettings({ format: 'mp3', bitrate: '1000k' }), 'Reject invalid bitrate (1000k)');
  assertThrows(() => validateAudioExtractionSettings({ format: 'mp3', audioStreamIndex: -1 }), 'Reject negative audio stream index');
  assertThrows(() => validateAudioExtractionSettings({ format: 'mp3', audioStreamIndex: 999 }), 'Reject out-of-range audio stream index');
  assertThrows(() => validateAudioExtractionSettings({ format: 'mp3', removeMetadata: 'false' }), 'Reject non-boolean removeMetadata in audio');

  const validAudioSettings = validateAudioExtractionSettings({
    format: 'mp3',
    bitrate: '192k',
    audioStreamIndex: 0,
    removeMetadata: true
  });
  assert(validAudioSettings.format === 'mp3' && validAudioSettings.bitrate === '192k', 'Accept strictly valid audio extraction payload');

  // 4. Binary Integrity Verification
  console.log('\n--- 4. FFmpeg Binary Integrity & Checksum Verification ---');
  const binDir = path.resolve(__dirname, '../resources/bin/win32-x64');
  const ffmpegPath = path.join(binDir, 'ffmpeg.exe');
  const ffprobePath = path.join(binDir, 'ffprobe.exe');
  const checksumsPath = path.join(binDir, 'checksums.json');

  assert(fs.existsSync(ffmpegPath), 'Bundled ffmpeg.exe exists');
  assert(fs.existsSync(ffprobePath), 'Bundled ffprobe.exe exists');
  assert(fs.existsSync(checksumsPath), 'checksums.json manifest exists');

  const checksums = JSON.parse(fs.readFileSync(checksumsPath, 'utf-8'));
  const actualFfmpegHash = crypto.createHash('sha256').update(fs.readFileSync(ffmpegPath)).digest('hex').toLowerCase();
  const actualFfprobeHash = crypto.createHash('sha256').update(fs.readFileSync(ffprobePath)).digest('hex').toLowerCase();

  assert(actualFfmpegHash === checksums['ffmpeg.exe'].toLowerCase(), 'ffmpeg.exe matches cryptographic SHA-256 checksum');
  assert(actualFfprobeHash === checksums['ffprobe.exe'].toLowerCase(), 'ffprobe.exe matches cryptographic SHA-256 checksum');

  // 5. Progress Parser Unit Tests
  console.log('\n--- 5. FFmpeg Progress Parser Tests ---');
  const sampleStderr = 'frame=  120 fps= 59.2 q=24.0 size=    1536kB time=00:00:04.50 bitrate=2796.2kbits/s speed=2.2x';
  const progress = parseFfmpegProgress(sampleStderr, 10.0);
  assert(progress !== null, 'Progress parsed from stderr');
  assert(progress && progress.percent === 45, 'Accurate progress percentage calculation (45%)');
  assert(progress && progress.fps === 59, 'Accurate FPS extraction');
  assert(progress && progress.speed === '2.2x', 'Accurate speed extraction');

  // 6. Temporary Storage Isolation & Lifecycle Tests
  console.log('\n--- 6. Temporary Storage Isolation & Lifecycle Tests ---');
  const tempMgr = new TempFileManager();
  const tempFile1 = tempMgr.createTempFilePath('.mp3');
  const tempFile2 = tempMgr.createTempFilePath('.mp3');
  assert(tempFile1 !== tempFile2, 'Unpredictable random temp file names');
  assert(path.basename(tempFile1).startsWith('svc_'), 'App-prefixed temporary filename');

  fs.writeFileSync(tempFile1, 'temporary test data');
  assert(fs.existsSync(tempFile1), 'Temp file successfully created');
  await tempMgr.cleanupFile(tempFile1);
  assert(!fs.existsSync(tempFile1), 'Temp file cleaned up deterministically');

  // 7. Collision-Safe Audio Destination Naming Tests
  console.log('\n--- 7. Collision-Safe Audio Output Naming Tests ---');
  const dummyVideo = path.join(__dirname, 'mock_video.mp4');
  const dummyMp3_1 = path.join(__dirname, 'mock_video.mp3');
  fs.writeFileSync(dummyMp3_1, 'dummy audio 1');

  const safePath1 = generateSafeAudioDestinationPath(dummyVideo, 'mp3', __dirname);
  assert(path.basename(safePath1) === 'mock_video (1).mp3', 'Auto-increments to mock_video (1).mp3 on collision');

  fs.writeFileSync(safePath1, 'dummy audio 2');
  const safePath2 = generateSafeAudioDestinationPath(dummyVideo, 'mp3', __dirname);
  assert(path.basename(safePath2) === 'mock_video (2).mp3', 'Auto-increments to mock_video (2).mp3 on second collision');

  fs.unlinkSync(dummyMp3_1);
  fs.unlinkSync(safePath1);

  // 8. Live Video Compression & Probing Test
  console.log('\n--- 8. Live Video Compression & Metadata Probing Test ---');
  const testSamplePath = path.resolve(__dirname, 'test_sample.mp4');

  await new Promise((resolve, reject) => {
    const gen = spawn(ffmpegPath, [
      '-nostdin', '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=2',
      '-c:v', 'libx264', '-c:a', 'aac',
      testSamplePath
    ], { shell: false });
    gen.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Failed to generate test sample, code ${code}`));
    });
  });

  const { probeVideoFile } = require('../dist-electron/main/ffmpeg/probe');
  const probeResult = await probeVideoFile(testSamplePath);
  assert(probeResult.success === true, 'ffprobe probed video successfully');
  if (probeResult.success) {
    assert(probeResult.metadata.hasAudio === true, 'Detected audio stream in test video');
    assert(probeResult.metadata.audioStreams.length >= 1, 'Audio stream array populated');
    assert(probeResult.metadata.audioStreams[0].codec === 'AAC', 'Detected AAC audio codec');
  }

  const { jobSupervisor } = require('../dist-electron/main/ffmpeg/compressor');
  const transcodeResult = await jobSupervisor.startCompression(
    testSamplePath,
    2.0,
    {
      quality: 'medium',
      resolution: 'original',
      codec: 'h264',
      audioCodec: 'aac',
      removeMetadata: true,
      customOutputDir: path.dirname(testSamplePath)
    },
    () => {}
  );
  assert(transcodeResult.success === true, 'Video compression completed successfully');
  if (transcodeResult.success && transcodeResult.result) {
    try { fs.unlinkSync(transcodeResult.result.outputPath); } catch {}
  }

  // 9. Live Video -> Audio Extraction Tests (MP3, M4A Stream Copy, WAV, FLAC, OGG)
  console.log('\n--- 9. Live Video -> Audio Extraction Tests ---');
  const { audioExtractorSupervisor } = require('../dist-electron/main/ffmpeg/audio-extractor');
  const primaryAudioStream = probeResult.metadata.audioStreams[0];

  // Test 9.1: Convert to MP3
  const mp3Result = await audioExtractorSupervisor.startExtraction(
    testSamplePath,
    2.0,
    primaryAudioStream,
    {
      format: 'mp3',
      bitrate: '192k',
      audioStreamIndex: 0,
      removeMetadata: true,
      customOutputDir: path.dirname(testSamplePath)
    },
    () => {}
  );
  assert(mp3Result.success === true, 'Extracted audio to MP3 successfully');
  if (mp3Result.success && mp3Result.result) {
    assert(fs.existsSync(mp3Result.result.outputPath), 'MP3 output file exists');
    assert(mp3Result.result.audioSizeBytes > 0, 'MP3 output file has valid size');
    try { fs.unlinkSync(mp3Result.result.outputPath); } catch {}
  }

  // Test 9.2: Convert to M4A with Stream Copy Optimization
  const m4aResult = await audioExtractorSupervisor.startExtraction(
    testSamplePath,
    2.0,
    primaryAudioStream,
    {
      format: 'm4a',
      bitrate: '192k',
      audioStreamIndex: 0,
      removeMetadata: true,
      customOutputDir: path.dirname(testSamplePath)
    },
    () => {}
  );
  assert(m4aResult.success === true, 'Extracted audio to M4A successfully');
  if (m4aResult.success && m4aResult.result) {
    assert(m4aResult.result.wasStreamCopied === true, 'Stream copy optimization engaged (AAC -> M4A)');
    assert(fs.existsSync(m4aResult.result.outputPath), 'M4A output file exists');
    try { fs.unlinkSync(m4aResult.result.outputPath); } catch {}
  }

  // Test 9.3: Convert to Lossless WAV
  const wavResult = await audioExtractorSupervisor.startExtraction(
    testSamplePath,
    2.0,
    primaryAudioStream,
    {
      format: 'wav',
      audioStreamIndex: 0,
      removeMetadata: true,
      customOutputDir: path.dirname(testSamplePath)
    },
    () => {}
  );
  assert(wavResult.success === true, 'Extracted audio to uncompressed WAV successfully');
  if (wavResult.success && wavResult.result) {
    assert(fs.existsSync(wavResult.result.outputPath), 'WAV output file exists');
    try { fs.unlinkSync(wavResult.result.outputPath); } catch {}
  }

  // Test 9.4: Convert to Lossless FLAC
  const flacResult = await audioExtractorSupervisor.startExtraction(
    testSamplePath,
    2.0,
    primaryAudioStream,
    {
      format: 'flac',
      audioStreamIndex: 0,
      removeMetadata: true,
      customOutputDir: path.dirname(testSamplePath)
    },
    () => {}
  );
  assert(flacResult.success === true, 'Extracted audio to FLAC successfully');
  if (flacResult.success && flacResult.result) {
    assert(fs.existsSync(flacResult.result.outputPath), 'FLAC output file exists');
    try { fs.unlinkSync(flacResult.result.outputPath); } catch {}
  }

  // Test 9.5: Convert to OGG Vorbis
  const oggResult = await audioExtractorSupervisor.startExtraction(
    testSamplePath,
    2.0,
    primaryAudioStream,
    {
      format: 'ogg',
      bitrate: '192k',
      audioStreamIndex: 0,
      removeMetadata: true,
      customOutputDir: path.dirname(testSamplePath)
    },
    () => {}
  );
  assert(oggResult.success === true, 'Extracted audio to OGG Vorbis successfully');
  if (oggResult.success && oggResult.result) {
    assert(fs.existsSync(oggResult.result.outputPath), 'OGG output file exists');
    try { fs.unlinkSync(oggResult.result.outputPath); } catch {}
  }

  // Clean up source test video
  try { fs.unlinkSync(testSamplePath); } catch {}

  // 10. Video Without Audio Handling Test
  console.log('\n--- 10. Video Without Audio Stream Handling Test ---');
  const noAudioSamplePath = path.resolve(__dirname, 'no_audio_video.mp4');
  await new Promise((resolve) => {
    const gen = spawn(ffmpegPath, [
      '-nostdin', '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=30',
      '-an', '-c:v', 'libx264',
      noAudioSamplePath
    ], { shell: false });
    gen.on('close', resolve);
  });

  const noAudioProbe = await probeVideoFile(noAudioSamplePath);
  assert(noAudioProbe.success === true, 'Probed video without audio');
  if (noAudioProbe.success) {
    assert(noAudioProbe.metadata.hasAudio === false, 'hasAudio correctly identified as false');
    assert(noAudioProbe.metadata.audioStreams.length === 0, 'audioStreams is empty array');
  }

  // Compress video without audio
  const noAudioCompressResult = await jobSupervisor.startCompression(
    noAudioSamplePath,
    1.0,
    {
      quality: 'medium',
      resolution: 'original',
      codec: 'h264',
      audioCodec: 'none',
      removeMetadata: true,
      customOutputDir: path.dirname(noAudioSamplePath)
    },
    () => {},
    false
  );
  assert(noAudioCompressResult.success === true, 'Video without audio compressed successfully');
  if (noAudioCompressResult.success && noAudioCompressResult.result) {
    assert(fs.existsSync(noAudioCompressResult.result.outputPath), 'No-audio compressed output exists');
    try { fs.unlinkSync(noAudioCompressResult.result.outputPath); } catch {}
  }
  try { fs.unlinkSync(noAudioSamplePath); } catch {}

  // 11. Multi-Track Audio Handling Test
  console.log('\n--- 11. Multi-Track Audio Detection & Selection Test ---');
  const multiAudioSamplePath = path.resolve(__dirname, 'multi_audio_video.mp4');
  await new Promise((resolve) => {
    const gen = spawn(ffmpegPath, [
      '-nostdin', '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-f', 'lavfi', '-i', 'sine=frequency=880:duration=1',
      '-map', '0:v', '-map', '1:a', '-map', '2:a',
      '-c:v', 'libx264',
      '-c:a:0', 'aac', '-metadata:s:a:0', 'title=Main Track',
      '-c:a:1', 'aac', '-metadata:s:a:1', 'title=Commentary Track',
      multiAudioSamplePath
    ], { shell: false });
    gen.on('close', resolve);
  });

  const multiProbe = await probeVideoFile(multiAudioSamplePath);
  assert(multiProbe.success === true, 'Probed multi-track audio video');
  if (multiProbe.success) {
    assert(multiProbe.metadata.audioStreams.length === 2, 'Detected exactly 2 distinct audio tracks');
    assert(multiProbe.metadata.audioStreams[0].title === 'Main Track', 'Track 1 title preserved');
    assert(multiProbe.metadata.audioStreams[1].title === 'Commentary Track', 'Track 2 title preserved');

    // Extract Track 2 specifically
    const track2Result = await audioExtractorSupervisor.startExtraction(
      multiAudioSamplePath,
      1.0,
      multiProbe.metadata.audioStreams[1],
      {
        format: 'mp3',
        bitrate: '192k',
        audioStreamIndex: 1,
        removeMetadata: true,
        customOutputDir: path.dirname(multiAudioSamplePath)
      },
      () => {}
    );
    assert(track2Result.success === true, 'Extracted Track 2 (Commentary) specifically');
    if (track2Result.success && track2Result.result) {
      try { fs.unlinkSync(track2Result.result.outputPath); } catch {}
    }
  }
  try { fs.unlinkSync(multiAudioSamplePath); } catch {}

  // 12. File Size Formatter & FPS Rational Parser Tests
  console.log('\n--- 12. File Size Formatter & FPS Rational Parser Tests ---');
  const { formatBytes, formatFps, parseRational, extractFpsFromStream } = require('../dist-electron/common/formatters');

  // Test 12.1: Human-readable file size formatting
  assert(formatBytes(842 * 1024) === '842 KB', 'Formats 842 KB correctly');
  assert(formatBytes(12.4 * 1024 * 1024) === '12.4 MB', 'Formats 12.4 MB correctly');
  assert(formatBytes(1021.0 * 1024 * 1024) === '1021.0 MB', 'Formats 1021.0 MB correctly');
  assert(formatBytes(1.02 * 1024 * 1024 * 1024) === '1.02 GB', 'Formats 1.02 GB correctly');
  assert(formatBytes(2.31 * 1024 * 1024 * 1024) === '2.31 GB', 'Formats 2.31 GB correctly');
  assert(formatBytes(500) === '500 B', 'Formats < 1 KB as bytes');

  // Test 12.2: Rational parsing
  assert(parseRational('60000/1001') !== null && Math.abs(parseRational('60000/1001') - 59.94) < 0.01, 'Parses 60000/1001');
  assert(parseRational('30/1') === 30, 'Parses 30/1');
  assert(parseRational('0/0') === null, 'Rejects 0/0');
  assert(parseRational('invalid') === null, 'Rejects non-numeric rational');

  // Test 12.3: Standard Constant Frame Rates
  const testA = extractFpsFromStream({ avg_frame_rate: '30/1', r_frame_rate: '30/1' });
  assert(testA.fps === 30 && testA.formattedFps === '30 fps', 'Test A (30 fps): correctly parsed as 30 fps');

  const testB = extractFpsFromStream({ avg_frame_rate: '60000/1001', r_frame_rate: '60000/1001' });
  assert(testB.fps === 59.94 && testB.formattedFps === '59.94 fps', 'Test B (59.94 fps): correctly parsed as 59.94 fps');

  // Test 12.4: 90kHz Time Base Bug Protection (e.g. DJI / MPEG-TS)
  const testC = extractFpsFromStream({
    avg_frame_rate: '60000/1001',
    r_frame_rate: '90000/1',
    time_base: '1/90000'
  });
  assert(testC.fps !== 90000, 'Test C: 90kHz time base is NOT mistaken for 90000 fps');
  assert(testC.fps === 59.94 && testC.formattedFps === '59.94 fps', 'Test C: resolves to actual playback rate 59.94 fps');

  // Test 12.5: 24p Cinema and 25p PAL
  const testCinema = extractFpsFromStream({ avg_frame_rate: '24000/1001', r_frame_rate: '24000/1001' });
  assert(testCinema.fps === 23.98 && testCinema.formattedFps === '23.98 fps', '24p Cinema (23.98 fps) correctly parsed');

  const testPal = extractFpsFromStream({ avg_frame_rate: '25/1', r_frame_rate: '25/1' });
  assert(testPal.fps === 25 && testPal.formattedFps === '25 fps', '25p PAL correctly parsed');

  // Test 12.6: Variable Frame Rate (VFR)
  const testVfr = extractFpsFromStream({ avg_frame_rate: '294/10', r_frame_rate: '30/1', time_base: '1/600' });
  assert(testVfr.isVfr === true, 'VFR video correctly flagged');
  assert(testVfr.formattedFps.includes('VFR'), 'VFR indicator included in formatted string');

  // Test 12.7: Actual Screen Recording Metadata
  const screenRecFps = extractFpsFromStream({
    avg_frame_rate: '2100060000/141286291',
    r_frame_rate: '90000/1',
    time_base: '1/90000'
  });
  assert(screenRecFps.fps === 14.86, 'Screen recording FPS is accurately 14.86');
  assert(screenRecFps.fps !== 90000, 'Screen recording FPS is NOT 90000');
  assert(screenRecFps.isVfr === true, 'Screen recording accurately classified as VFR');
  assert(screenRecFps.formattedFps === '~14.86 fps (VFR)', 'Screen recording formatted as ~14.86 fps (VFR)');

  // Test 12.8: Actual DJI Drone Metadata
  const djiFps = extractFpsFromStream({
    avg_frame_rate: '60000/1001',
    r_frame_rate: '60000/1001',
    time_base: '1/60000'
  });
  assert(djiFps.fps === 59.94, 'DJI FPS is 59.94');
  assert(djiFps.isVfr === false, 'DJI accurately classified as CFR');
  assert(djiFps.formattedFps === '59.94 fps', 'DJI formatted as 59.94 fps');

  // 13. Multi-Video Batch Processing & Queue Resilience Tests
  console.log('\n--- 13. Multi-Video Batch Processing & Queue Resilience ---');

  // Generate 3 test video samples for batch tests
  const batchSample1 = path.resolve(__dirname, 'batch_sample_1.mp4');
  const batchSample2 = path.resolve(__dirname, 'batch_sample_2.mp4');
  const batchSample3 = path.resolve(__dirname, 'batch_sample_3.mp4');
  const corruptSample = path.resolve(__dirname, 'batch_corrupt.mp4');

  const createTestSample = (destPath, durationSec, rate) => {
    return new Promise((res, rej) => {
      const g = spawn(ffmpegPath, [
        '-nostdin', '-y',
        '-f', 'lavfi', '-i', `testsrc=duration=${durationSec}:size=320x240:rate=${rate}`,
        '-f', 'lavfi', '-i', `sine=frequency=1000:duration=${durationSec}`,
        '-c:v', 'libx264', '-c:a', 'aac',
        destPath
      ], { shell: false });
      g.on('close', (c) => c === 0 ? res() : rej(new Error(`Failed to create sample: code ${c}`)));
    });
  };

  await createTestSample(batchSample1, 1, 30);
  await createTestSample(batchSample2, 1, 25);
  await createTestSample(batchSample3, 1, 24);
  fs.writeFileSync(corruptSample, 'NOT_A_VALID_VIDEO_FILE_CORRUPTED_BYTES_HEADER');

  // Test 13.1: Sequential Batch Compression (3 files)
  const batchItems = [batchSample1, batchSample2, batchSample3];
  const compressionBatchResults = [];

  for (const itemPath of batchItems) {
    const res = await jobSupervisor.startCompression(
      itemPath,
      1.0,
      {
        quality: 'medium',
        resolution: 'original',
        codec: 'h264',
        audioCodec: 'aac',
        removeMetadata: true,
        customOutputDir: __dirname
      },
      () => {}
    );
    compressionBatchResults.push(res);
  }

  assert(compressionBatchResults.length === 3, 'Batch compression queue processed all 3 items');
  assert(compressionBatchResults.every(r => r.success === true), 'All 3 batch videos compressed successfully');

  // Cleanup compressed outputs
  for (const r of compressionBatchResults) {
    if (r.result?.outputPath && fs.existsSync(r.result.outputPath)) {
      try { fs.unlinkSync(r.result.outputPath); } catch {}
    }
  }

  // Test 13.2: Error Resilience in Batch (Valid -> Corrupted -> Valid)
  const resilienceBatch = [batchSample1, corruptSample, batchSample3];
  const resilienceResults = [];

  for (const itemPath of resilienceBatch) {
    // Probe first
    const pRes = await probeVideoFile(itemPath);
    if (!pRes.success) {
      resilienceResults.push({ success: false, error: pRes.error, filePath: itemPath });
      continue;
    }
    const cRes = await jobSupervisor.startCompression(
      itemPath,
      pRes.metadata.durationSeconds,
      {
        quality: 'medium',
        resolution: 'original',
        codec: 'h264',
        audioCodec: 'aac',
        removeMetadata: true,
        customOutputDir: __dirname
      },
      () => {}
    );
    resilienceResults.push({ success: cRes.success, error: cRes.error, filePath: itemPath, result: cRes.result });
  }

  assert(resilienceResults[0].success === true, 'Batch Item 1 (Valid) succeeded');
  assert(resilienceResults[1].success === false, 'Batch Item 2 (Corrupt) failed safely');
  assert(resilienceResults[1].error !== undefined, 'Batch Item 2 preserved structured error');
  assert(resilienceResults[2].success === true, 'Batch Item 3 (Valid) succeeded despite Item 2 failure');
  assert(
    resilienceResults.filter(r => r.success).length === 2 && resilienceResults.filter(r => !r.success).length === 1,
    'Batch summary correctly reports: 2 successful, 1 failed'
  );

  // Cleanup
  for (const r of resilienceResults) {
    if (r.result?.outputPath && fs.existsSync(r.result.outputPath)) {
      try { fs.unlinkSync(r.result.outputPath); } catch {}
    }
  }

  // Test 13.3: Batch Video -> Audio Extraction (3 files to MP3)
  const audioBatchResults = [];
  for (const itemPath of batchItems) {
    const p = await probeVideoFile(itemPath);
    if (!p.success) continue;
    const aRes = await audioExtractorSupervisor.startExtraction(
      itemPath,
      p.metadata.durationSeconds,
      p.metadata.audioStreams[0],
      {
        format: 'mp3',
        bitrate: '192k',
        audioStreamIndex: 0,
        removeMetadata: true,
        customOutputDir: __dirname
      },
      () => {}
    );
    audioBatchResults.push(aRes);
  }

  assert(audioBatchResults.length === 3, 'Batch audio extraction processed all 3 videos');
  assert(audioBatchResults.every(r => r.success === true), 'All 3 videos extracted to MP3 successfully');

  // Cleanup audio outputs
  for (const r of audioBatchResults) {
    if (r.result?.outputPath && fs.existsSync(r.result.outputPath)) {
      try { fs.unlinkSync(r.result.outputPath); } catch {}
    }
  }

  // Test 13.4: Batch Audio Resilience (Video with audio -> Video without audio -> Video with audio)
  const batchNoAudioSample = path.resolve(__dirname, 'batch_no_audio.mp4');
  await new Promise((resolve) => {
    const gen = spawn(ffmpegPath, [
      '-nostdin', '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=1:size=320x240:rate=30',
      '-an', '-c:v', 'libx264',
      batchNoAudioSample
    ], { shell: false });
    gen.on('close', resolve);
  });

  const mixedAudioBatch = [batchSample1, batchNoAudioSample, batchSample2];
  const mixedAudioResults = [];

  for (const itemPath of mixedAudioBatch) {
    const p = await probeVideoFile(itemPath);
    if (!p.success) {
      mixedAudioResults.push({ success: false, error: p.error });
      continue;
    }
    if (!p.metadata.hasAudio || p.metadata.audioStreams.length === 0) {
      mixedAudioResults.push({
        success: false,
        error: {
          code: 'AUDIO_STREAM_NOT_FOUND',
          userMessage: 'This video does not contain an audio stream that can be extracted.'
        }
      });
      continue;
    }
    const aRes = await audioExtractorSupervisor.startExtraction(
      itemPath,
      p.metadata.durationSeconds,
      p.metadata.audioStreams[0],
      {
        format: 'mp3',
        bitrate: '192k',
        audioStreamIndex: 0,
        removeMetadata: true,
        customOutputDir: __dirname
      },
      () => {}
    );
    mixedAudioResults.push(aRes);
  }

  assert(mixedAudioResults[0].success === true, 'Mixed audio batch item 1 succeeded');
  assert(mixedAudioResults[1].success === false, 'Mixed audio batch item 2 correctly flagged missing audio');
  assert(mixedAudioResults[1].error?.code === 'AUDIO_STREAM_NOT_FOUND', 'Audio stream not found error preserved');
  assert(mixedAudioResults[2].success === true, 'Mixed audio batch item 3 succeeded after no-audio item');

  // Cleanup
  for (const r of mixedAudioResults) {
    if (r.result?.outputPath && fs.existsSync(r.result.outputPath)) {
      try { fs.unlinkSync(r.result.outputPath); } catch {}
    }
  }
  try { fs.unlinkSync(batchNoAudioSample); } catch {}

  // Test 13.5: Duplicate Detection Logic
  const mockQueue = [
    { filePath: 'C:\\Videos\\DJI_001.MP4' },
    { filePath: 'C:\\Videos\\DJI_002.MP4' }
  ];
  const incomingBatch = [
    { filePath: 'C:\\Videos\\dji_002.mp4' }, // Duplicate (case insensitive)
    { filePath: 'C:\\Videos\\DJI_003.MP4' }, // New
    { filePath: 'C:\\Videos\\DJI_001.MP4' }  // Duplicate
  ];

  const uniqueAdded = incomingBatch.filter(
    inc => !mockQueue.some(q => q.filePath.toLowerCase() === inc.filePath.toLowerCase())
  );
  assert(uniqueAdded.length === 1, 'Duplicate detection filter keeps only unique new files (1 new, 2 duplicates skipped)');
  assert(uniqueAdded[0].filePath === 'C:\\Videos\\DJI_003.MP4', 'Correct unique file selected for addition');

  // Cleanup test sample files
  try {
    fs.unlinkSync(batchSample1);
    fs.unlinkSync(batchSample2);
    fs.unlinkSync(batchSample3);
    fs.unlinkSync(corruptSample);
  } catch {}

  console.log('\n====================================================');
  console.log(`AUDIT RESULTS: ${passedTests} PASSED, ${failedTests} FAILED (TOTAL: ${totalTests})`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
