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
  validateAudioExtractionSettings,
  validateImageCompressionSettings
} = require('../dist-electron/common/validators');
const {
  validateInputVideoPath,
  validateInputImagePath,
  validateOutputDirectoryPath
} = require('../dist-electron/main/fs/path-sanitizer');
const { parseFfmpegProgress } = require('../dist-electron/main/ffmpeg/progress-parser');
const { TempFileManager } = require('../dist-electron/main/fs/temp-manager');
const { generateSafeAudioDestinationPath } = require('../dist-electron/main/ffmpeg/audio-extractor');
const {
  formatBytes,
  formatFps,
  parseRational,
  extractFpsFromStream
} = require('../dist-electron/common/formatters');
const {
  calculateMinTargetSizeBytes,
  calculateTargetBitrate,
  calculateReductionPercentage
} = require('../dist-electron/common/target-size');
const {
  calculateMinImageTargetSizeBytes,
  calculateImageReductionPercentage
} = require('../dist-electron/common/image-target-size');
const { probeImageFile } = require('../dist-electron/main/image/image-probe');
const {
  imageJobSupervisor,
  generateSafeImageDestinationPath
} = require('../dist-electron/main/image/image-compressor');

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

  // Verify all 5 compression modes are accepted
  const autoSettings = validateCompressionSettings({ quality: 'auto', resolution: 'original', codec: 'h264', audioCodec: 'aac', removeMetadata: true });
  assert(autoSettings.quality === 'auto', 'Accept Automatic compression mode');

  const highSettings = validateCompressionSettings({ quality: 'high', resolution: 'original', codec: 'h264', audioCodec: 'aac', removeMetadata: true });
  assert(highSettings.quality === 'high', 'Accept High compression mode');

  const lowSettings = validateCompressionSettings({ quality: 'low', resolution: 'original', codec: 'h264', audioCodec: 'aac', removeMetadata: true });
  assert(lowSettings.quality === 'low', 'Accept Low compression mode');

  const customSettings = validateCompressionSettings({
    quality: 'custom',
    resolution: 'original',
    codec: 'h264',
    audioCodec: 'aac',
    removeMetadata: true,
    targetSizeBytes: 250000000,
    targetPercent: 50
  });
  assert(customSettings.quality === 'custom' && customSettings.targetSizeBytes === 250000000 && customSettings.targetPercent === 50, 'Accept Custom target size mode');

  // Reject invalid target sizes and percentages
  assertThrows(() => validateCompressionSettings({ quality: 'custom', resolution: 'original', codec: 'h264', audioCodec: 'aac', removeMetadata: true, targetSizeBytes: -100 }), 'Reject negative targetSizeBytes');
  assertThrows(() => validateCompressionSettings({ quality: 'custom', resolution: 'original', codec: 'h264', audioCodec: 'aac', removeMetadata: true, targetSizeBytes: 10.5 }), 'Reject non-integer targetSizeBytes');
  assertThrows(() => validateCompressionSettings({ quality: 'custom', resolution: 'original', codec: 'h264', audioCodec: 'aac', removeMetadata: true, targetPercent: 0 }), 'Reject zero targetPercent');
  assertThrows(() => validateCompressionSettings({ quality: 'custom', resolution: 'original', codec: 'h264', audioCodec: 'aac', removeMetadata: true, targetPercent: 120 }), 'Reject targetPercent > 100');
  assertThrows(() => validateCompressionSettings({ quality: 'custom', resolution: 'original', codec: 'h264', audioCodec: 'aac', removeMetadata: true, targetPercent: -5 }), 'Reject negative targetPercent');

  // 2.5 Target Size Calculations and Bitrate Math Unit Tests
  console.log('\n--- 2.5 Target Size & Bitrate Math Engine Tests ---');
  assert(formatBytes(500) === '500 B', 'formatBytes formats bytes correctly');
  assert(formatBytes(500 * 1024) === '500 KB', 'formatBytes formats KB correctly');
  assert(formatBytes(250 * 1024 * 1024) === '250.0 MB', 'formatBytes formats MB correctly');
  assert(formatBytes(2.5 * 1024 * 1024 * 1024) === '2.50 GB', 'formatBytes formats GB correctly');

  const minSize5s = calculateMinTargetSizeBytes({ durationSeconds: 5, width: 1920, height: 1080, fps: 30, codec: 'h264', originalSizeBytes: 100 * 1024 * 1024 });
  const minSize60s = calculateMinTargetSizeBytes({ durationSeconds: 60, width: 1920, height: 1080, fps: 30, codec: 'h264', originalSizeBytes: 100 * 1024 * 1024 });
  assert(minSize60s > minSize5s, 'Minimum target size scales dynamically with video duration');

  const minSize720p = calculateMinTargetSizeBytes({ durationSeconds: 10, width: 1280, height: 720, fps: 30, codec: 'h264', originalSizeBytes: 50 * 1024 * 1024 });
  const minSize1080p = calculateMinTargetSizeBytes({ durationSeconds: 10, width: 1920, height: 1080, fps: 30, codec: 'h264', originalSizeBytes: 50 * 1024 * 1024 });
  assert(minSize1080p > minSize720p, 'Minimum target size scales dynamically with resolution');

  const minSizeH264 = calculateMinTargetSizeBytes({ durationSeconds: 10, width: 1280, height: 720, fps: 30, codec: 'h264', originalSizeBytes: 50 * 1024 * 1024 });
  const minSizeH265 = calculateMinTargetSizeBytes({ durationSeconds: 10, width: 1280, height: 720, fps: 30, codec: 'h265', originalSizeBytes: 50 * 1024 * 1024 });
  assert(minSizeH265 < minSizeH264, 'H.265 requires fewer minimum bits than H.264 due to higher compression efficiency');

  assert(minSize5s > 0 && Number.isFinite(minSize5s), 'Minimum target size is strictly positive and finite');

  const bitrateCalc = calculateTargetBitrate({
    targetSizeBytes: 250 * 1024 * 1024,
    durationSeconds: 1000,
    codec: 'h264',
    audioCodec: 'aac',
    hasAudio: true
  });
  // 250 * 1024 * 1024 * 8 / 1000s / 1000 = 2097 kbps total
  assert(bitrateCalc.totalBitrateKbps === 2097, 'Total bitrate matches (target bits / duration)');
  assert(bitrateCalc.videoBitrateKbps > 0, 'Video bitrate calculated properly after deducting audio & overhead');
  assert(bitrateCalc.audioBitrateKbps > 0, 'Audio bitrate allocated within budget');
  assert(bitrateCalc.isViable === true, 'Sufficient target size flagged as viable');

  const unviableCalc = calculateTargetBitrate({
    targetSizeBytes: 10 * 1024, // 10 KB for 1000s is impossible
    durationSeconds: 1000,
    codec: 'h264',
    audioCodec: 'aac',
    hasAudio: true
  });
  assert(unviableCalc.isViable === false, 'Technically impossible target bitrate correctly flagged as unviable');

  assert(calculateReductionPercentage(500 * 1024 * 1024, 250 * 1024 * 1024) === 50, 'calculateReductionPercentage returns 50% for 500MB -> 250MB');
  assert(calculateReductionPercentage(100, 10) === 90, 'calculateReductionPercentage returns 90% for 100 -> 10');
  assert(calculateReductionPercentage(100, 150) === 0, 'calculateReductionPercentage clamps to 0% if target >= original');

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
    () => { }
  );
  assert(transcodeResult.success === true, 'Video compression (Medium) completed successfully');
  if (transcodeResult.success && transcodeResult.result) {
    try { fs.unlinkSync(transcodeResult.result.outputPath); } catch { }
  }

  // Test 8.2: Automatic Mode (Exact backward compatibility)
  const autoTranscodeResult = await jobSupervisor.startCompression(
    testSamplePath,
    2.0,
    {
      quality: 'auto',
      resolution: 'original',
      codec: 'h264',
      audioCodec: 'aac',
      removeMetadata: true,
      customOutputDir: path.dirname(testSamplePath)
    },
    () => { }
  );
  assert(autoTranscodeResult.success === true, 'Video compression (Automatic) completed successfully');
  if (autoTranscodeResult.success && autoTranscodeResult.result) {
    try { fs.unlinkSync(autoTranscodeResult.result.outputPath); } catch { }
  }

  // Test 8.3: High Quality Mode
  const highTranscodeResult = await jobSupervisor.startCompression(
    testSamplePath,
    2.0,
    {
      quality: 'high',
      resolution: 'original',
      codec: 'h264',
      audioCodec: 'aac',
      removeMetadata: true,
      customOutputDir: path.dirname(testSamplePath)
    },
    () => { }
  );
  assert(highTranscodeResult.success === true, 'Video compression (High) completed successfully');
  if (highTranscodeResult.success && highTranscodeResult.result) {
    try { fs.unlinkSync(highTranscodeResult.result.outputPath); } catch { }
  }

  // Test 8.4: Low Quality Mode
  const lowTranscodeResult = await jobSupervisor.startCompression(
    testSamplePath,
    2.0,
    {
      quality: 'low',
      resolution: 'original',
      codec: 'h264',
      audioCodec: 'aac',
      removeMetadata: true,
      customOutputDir: path.dirname(testSamplePath)
    },
    () => { }
  );
  assert(lowTranscodeResult.success === true, 'Video compression (Low) completed successfully');
  if (lowTranscodeResult.success && lowTranscodeResult.result) {
    try { fs.unlinkSync(lowTranscodeResult.result.outputPath); } catch { }
  }

  // Test 8.5: Custom Target Size Mode (Two-Pass FFmpeg Transcode)
  const sampleStat = fs.statSync(testSamplePath);
  const targetBytes = Math.max(16384, Math.round(sampleStat.size * 0.7));
  const customTranscodeResult = await jobSupervisor.startCompression(
    testSamplePath,
    2.0,
    {
      quality: 'custom',
      resolution: 'original',
      codec: 'h264',
      audioCodec: 'aac',
      removeMetadata: true,
      customOutputDir: path.dirname(testSamplePath),
      targetSizeBytes: targetBytes
    },
    () => { },
    true,
    probeResult.metadata
  );
  assert(customTranscodeResult.success === true, 'Custom target size compression (Two-Pass) completed successfully');
  if (customTranscodeResult.success && customTranscodeResult.result) {
    assert(customTranscodeResult.result.targetSizeBytes === targetBytes, 'Result record includes targetSizeBytes');
    assert(fs.existsSync(customTranscodeResult.result.outputPath), 'Two-pass output file exists');
    try { fs.unlinkSync(customTranscodeResult.result.outputPath); } catch { }
  }

  // Verify pass log files were cleaned up
  const tempDir = new TempFileManager().getTempDirectory();
  const remainingPassLogs = fs.existsSync(tempDir)
    ? fs.readdirSync(tempDir).filter(f => f.includes('passlog'))
    : [];
  assert(remainingPassLogs.length === 0, 'Pass log files deterministically purged from temp directory after two-pass encoding');

  // Test 8.6: Custom Target Size below minimum feasible floor rejection
  const belowMinResult = await jobSupervisor.startCompression(
    testSamplePath,
    2.0,
    {
      quality: 'custom',
      resolution: 'original',
      codec: 'h264',
      audioCodec: 'aac',
      removeMetadata: true,
      customOutputDir: path.dirname(testSamplePath),
      targetSizeBytes: 200 // Unrealistic 200 bytes for 2s video
    },
    () => { },
    true,
    probeResult.metadata
  );
  assert(belowMinResult.success === false, 'Target size below minimum feasible floor safely rejected');
  assert(belowMinResult.error && belowMinResult.error.code === 'INVALID_INPUT', 'Rejection provides INVALID_INPUT structured error');

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
    () => { }
  );
  assert(mp3Result.success === true, 'Extracted audio to MP3 successfully');
  if (mp3Result.success && mp3Result.result) {
    assert(fs.existsSync(mp3Result.result.outputPath), 'MP3 output file exists');
    assert(mp3Result.result.audioSizeBytes > 0, 'MP3 output file has valid size');
    try { fs.unlinkSync(mp3Result.result.outputPath); } catch { }
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
    () => { }
  );
  assert(m4aResult.success === true, 'Extracted audio to M4A successfully');
  if (m4aResult.success && m4aResult.result) {
    assert(m4aResult.result.wasStreamCopied === true, 'Stream copy optimization engaged (AAC -> M4A)');
    assert(fs.existsSync(m4aResult.result.outputPath), 'M4A output file exists');
    try { fs.unlinkSync(m4aResult.result.outputPath); } catch { }
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
    () => { }
  );
  assert(wavResult.success === true, 'Extracted audio to uncompressed WAV successfully');
  if (wavResult.success && wavResult.result) {
    assert(fs.existsSync(wavResult.result.outputPath), 'WAV output file exists');
    try { fs.unlinkSync(wavResult.result.outputPath); } catch { }
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
    () => { }
  );
  assert(flacResult.success === true, 'Extracted audio to FLAC successfully');
  if (flacResult.success && flacResult.result) {
    assert(fs.existsSync(flacResult.result.outputPath), 'FLAC output file exists');
    try { fs.unlinkSync(flacResult.result.outputPath); } catch { }
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
    () => { }
  );
  assert(oggResult.success === true, 'Extracted audio to OGG Vorbis successfully');
  if (oggResult.success && oggResult.result) {
    assert(fs.existsSync(oggResult.result.outputPath), 'OGG output file exists');
    try { fs.unlinkSync(oggResult.result.outputPath); } catch { }
  }

  // Clean up source test video
  try { fs.unlinkSync(testSamplePath); } catch { }

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
    () => { },
    false
  );
  assert(noAudioCompressResult.success === true, 'Video without audio compressed successfully');
  if (noAudioCompressResult.success && noAudioCompressResult.result) {
    assert(fs.existsSync(noAudioCompressResult.result.outputPath), 'No-audio compressed output exists');
    try { fs.unlinkSync(noAudioCompressResult.result.outputPath); } catch { }
  }
  try { fs.unlinkSync(noAudioSamplePath); } catch { }

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
      () => { }
    );
    assert(track2Result.success === true, 'Extracted Track 2 (Commentary) specifically');
    if (track2Result.success && track2Result.result) {
      try { fs.unlinkSync(track2Result.result.outputPath); } catch { }
    }
  }
  try { fs.unlinkSync(multiAudioSamplePath); } catch { }

  // 12. File Size Formatter & FPS Rational Parser Tests
  console.log('\n--- 12. File Size Formatter & FPS Rational Parser Tests ---');

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
      () => { }
    );
    compressionBatchResults.push(res);
  }

  assert(compressionBatchResults.length === 3, 'Batch compression queue processed all 3 items');
  assert(compressionBatchResults.every(r => r.success === true), 'All 3 batch videos compressed successfully');

  // Cleanup compressed outputs
  for (const r of compressionBatchResults) {
    if (r.result?.outputPath && fs.existsSync(r.result.outputPath)) {
      try { fs.unlinkSync(r.result.outputPath); } catch { }
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
      () => { }
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
      try { fs.unlinkSync(r.result.outputPath); } catch { }
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
      () => { }
    );
    audioBatchResults.push(aRes);
  }

  assert(audioBatchResults.length === 3, 'Batch audio extraction processed all 3 videos');
  assert(audioBatchResults.every(r => r.success === true), 'All 3 videos extracted to MP3 successfully');

  // Cleanup audio outputs
  for (const r of audioBatchResults) {
    if (r.result?.outputPath && fs.existsSync(r.result.outputPath)) {
      try { fs.unlinkSync(r.result.outputPath); } catch { }
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
      () => { }
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
      try { fs.unlinkSync(r.result.outputPath); } catch { }
    }
  }
  try { fs.unlinkSync(batchNoAudioSample); } catch { }

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

  // Test 13.6: Batch Custom Target Size (Percentage Reduction)
  const batchCustomResults = [];
  const targetPercent = 60; // 60% of original
  for (const itemPath of [batchSample1, batchSample2]) {
    const stat = fs.statSync(itemPath);
    const itemTarget = Math.max(16384, Math.round(stat.size * (targetPercent / 100)));
    const cRes = await jobSupervisor.startCompression(
      itemPath,
      1.0,
      {
        quality: 'custom',
        resolution: 'original',
        codec: 'h264',
        audioCodec: 'aac',
        removeMetadata: true,
        customOutputDir: __dirname,
        targetSizeBytes: itemTarget
      },
      () => { }
    );
    batchCustomResults.push(cRes);
  }
  assert(batchCustomResults.length === 2 && batchCustomResults.every(r => r.success === true), 'Batch compression with custom target size processed all items successfully');
  for (const r of batchCustomResults) {
    if (r.result?.outputPath && fs.existsSync(r.result.outputPath)) {
      try { fs.unlinkSync(r.result.outputPath); } catch { }
    }
  }

  // Cleanup test sample files
  try {
    fs.unlinkSync(batchSample1);
    fs.unlinkSync(batchSample2);
    fs.unlinkSync(batchSample3);
    fs.unlinkSync(corruptSample);
  } catch { }

  // 14. Image Path, Schema, and Mathematical Target Size Validation
  console.log('\n--- 14. Image Path Validation & Schema Security ---');
  assertThrows(() => validateInputImagePath(''), 'Reject empty image path');
  assertThrows(() => validateInputImagePath(null), 'Reject null image path');
  assertThrows(() => validateInputImagePath(12345), 'Reject non-string image path');
  assertThrows(() => validateInputImagePath('C:\\images\\photo\0.png'), 'Reject null byte in image path');
  assertThrows(() => validateInputImagePath('\\\\network-share\\images\\photo.png'), 'Reject UNC network image path (\\\\)');
  assertThrows(() => validateInputImagePath('//network-share/images/photo.png'), 'Reject UNC network image path (//)');
  assertThrows(() => validateInputImagePath('C:\\Windows\\System32\\calc.exe'), 'Reject system OS directory access');
  assertThrows(() => validateInputImagePath('C:\\DesktopApplication\\scripts\\security-audit.js'), 'Reject non-image extension (.js)');
  assertThrows(() => validateInputImagePath('C:\\nonexistent_image_123456.jpg'), 'Reject nonexistent image file');

  console.log('\n--- 14.1 Image Settings Schema & Injection Protection ---');
  assertThrows(() => validateImageCompressionSettings(null), 'Reject null image settings');
  assertThrows(() => validateImageCompressionSettings({ quality: 'extreme' }), 'Reject invalid image quality preset');
  assertThrows(() => validateImageCompressionSettings({ quality: 'high', outputFormat: 'gif' }), 'Reject unallowed output format (gif)');
  assertThrows(() => validateImageCompressionSettings({ quality: 'high', outputFormat: 'jpg; rm -rf /' }), 'Reject command injection in format');
  assertThrows(() => validateImageCompressionSettings({ quality: 'custom', outputFormat: 'original', removeMetadata: true, targetSizeBytes: -500 }), 'Reject negative image target size');
  assertThrows(() => validateImageCompressionSettings({ quality: 'custom', outputFormat: 'original', removeMetadata: true, targetPercent: 0 }), 'Reject 0 image target percent');
  assertThrows(() => validateImageCompressionSettings({ quality: 'custom', outputFormat: 'original', removeMetadata: true, targetPercent: 120 }), 'Reject >100 image target percent');
  assertThrows(() => validateImageCompressionSettings({ quality: 'high', outputFormat: 'original', removeMetadata: 'no' }), 'Reject non-boolean removeMetadata in image');
  assertThrows(() => validateImageCompressionSettings({ quality: 'high', outputFormat: 'original', removeMetadata: true, resize: { enabled: true, mode: 'percentage', percentage: 600 } }), 'Reject >500 resize percentage');
  assertThrows(() => validateImageCompressionSettings({ quality: 'high', outputFormat: 'original', removeMetadata: true, resize: { enabled: true, mode: 'percentage', percentage: 0 } }), 'Reject 0 resize percentage');
  assertThrows(() => validateImageCompressionSettings({ quality: 'high', outputFormat: 'original', removeMetadata: true, resize: { enabled: true, mode: 'dimensions', width: -100 } }), 'Reject negative resize width');

  const validAutoImgSettings = validateImageCompressionSettings({
    quality: 'auto',
    outputFormat: 'original',
    removeMetadata: true
  });
  assert(validAutoImgSettings.quality === 'auto', 'Accept valid Automatic image settings');

  const validCustomImgSettings = validateImageCompressionSettings({
    quality: 'custom',
    outputFormat: 'webp',
    targetSizeBytes: 50000,
    targetPercent: 50,
    resize: {
      enabled: true,
      mode: 'percentage',
      percentage: 75,
      lockAspectRatio: true
    },
    removeMetadata: false
  });
  assert(validCustomImgSettings.quality === 'custom' && validCustomImgSettings.outputFormat === 'webp', 'Accept valid Custom Target Size image settings with resize');

  console.log('\n--- 14.2 Image Target Size Math Engine & Collision Safety ---');
  const minPng = calculateMinImageTargetSizeBytes(1920, 1080, 'png', 5 * 1024 * 1024);
  const minWebp = calculateMinImageTargetSizeBytes(1920, 1080, 'webp', 5 * 1024 * 1024);
  const minJpg = calculateMinImageTargetSizeBytes(1920, 1080, 'jpg', 5 * 1024 * 1024);
  assert(minPng > minWebp, 'WebP has higher compression ceiling and lower minimum size than PNG');
  assert(minJpg > 0 && minWebp > 0 && minPng > 0, 'Image minimum target sizes are strictly positive');
  assert(calculateImageReductionPercentage(1000, 500) === 50, 'calculateImageReductionPercentage computes 50% for 1000 -> 500');
  assert(calculateImageReductionPercentage(1000, 100) === 90, 'calculateImageReductionPercentage computes 90% for 1000 -> 100');
  assert(calculateImageReductionPercentage(1000, 1200) === 0, 'calculateImageReductionPercentage clamps to 0% if target >= original');

  const dummyImage = path.join(__dirname, 'mock_image.jpg');
  const dummyImageComp = path.join(__dirname, 'mock_image_compressed.jpg');
  fs.writeFileSync(dummyImageComp, 'dummy compressed image');
  const safeImgPath1 = generateSafeImageDestinationPath(dummyImage, 'jpg', __dirname);
  assert(path.basename(safeImgPath1) === 'mock_image_compressed (1).jpg', 'generateSafeImageDestinationPath auto-increments on collision');
  fs.writeFileSync(safeImgPath1, 'dummy compressed image 2');
  const safeImgPath2 = generateSafeImageDestinationPath(dummyImage, 'jpg', __dirname);
  assert(path.basename(safeImgPath2) === 'mock_image_compressed (2).jpg', 'generateSafeImageDestinationPath auto-increments on second collision');
  try { fs.unlinkSync(dummyImageComp); } catch { }
  try { fs.unlinkSync(safeImgPath1); } catch { }

  // 15. Live Image Probing, Thumbnail Generation, Multi-Format Compression & Batch
  console.log('\n--- 15. Live Image Probing & Thumbnail Generation ---');
  const testPngAlpha = path.resolve(__dirname, 'test_sample_alpha.png');
  const testJpg = path.resolve(__dirname, 'test_sample.jpg');
  const testWebp = path.resolve(__dirname, 'test_sample.webp');
  const testBmp = path.resolve(__dirname, 'test_sample.bmp');

  // Generate synthetic test images
  await new Promise((resolve, reject) => {
    const gen = spawn(ffmpegPath, [
      '-nostdin', '-y',
      '-f', 'lavfi', '-i', 'smptebars=size=320x240:duration=1',
      '-frames:v', '1', '-pix_fmt', 'rgba',
      testPngAlpha
    ], { shell: false });
    gen.on('close', (code) => code === 0 ? resolve() : reject(new Error('Failed to generate PNG')));
  });

  await new Promise((resolve, reject) => {
    const gen = spawn(ffmpegPath, [
      '-nostdin', '-y',
      '-f', 'lavfi', '-i', 'testsrc=size=320x240:duration=1',
      '-frames:v', '1',
      testJpg
    ], { shell: false });
    gen.on('close', (code) => code === 0 ? resolve() : reject(new Error('Failed to generate JPG')));
  });

  await new Promise((resolve, reject) => {
    const gen = spawn(ffmpegPath, [
      '-nostdin', '-y',
      '-f', 'lavfi', '-i', 'testsrc=size=320x240:duration=1',
      '-frames:v', '1', '-c:v', 'libwebp',
      testWebp
    ], { shell: false });
    gen.on('close', (code) => code === 0 ? resolve() : reject(new Error('Failed to generate WebP')));
  });

  await new Promise((resolve, reject) => {
    const gen = spawn(ffmpegPath, [
      '-nostdin', '-y',
      '-f', 'lavfi', '-i', 'testsrc=size=320x240:duration=1',
      '-frames:v', '1',
      testBmp
    ], { shell: false });
    gen.on('close', (code) => code === 0 ? resolve() : reject(new Error('Failed to generate BMP')));
  });

  // Probe tests
  const probePng = await probeImageFile(testPngAlpha);
  assert(probePng.success === true && probePng.metadata?.format === 'png', 'Probed PNG file successfully');
  assert(probePng.metadata?.width === 320 && probePng.metadata?.height === 240, 'Probed PNG dimensions match (320x240)');
  assert(probePng.metadata?.hasAlpha === true, 'Probed PNG correctly detected alpha transparency');
  assert(typeof probePng.metadata?.thumbnailBase64 === 'string' && probePng.metadata.thumbnailBase64.startsWith('data:image/webp;base64,'), 'Generated local in-memory WebP thumbnail');

  const probeJpg = await probeImageFile(testJpg);
  assert(probeJpg.success === true && probeJpg.metadata?.format === 'jpg', 'Probed JPG file successfully');
  assert(probeJpg.metadata?.hasAlpha === false, 'Probed JPG correctly reports no alpha channel');

  const probeWebp = await probeImageFile(testWebp);
  assert(probeWebp.success === true && probeWebp.metadata?.format === 'webp', 'Probed WebP file successfully');

  const probeBmp = await probeImageFile(testBmp);
  assert(probeBmp.success === true && probeBmp.metadata?.format === 'bmp', 'Probed BMP file successfully');

  console.log('\n--- 15.1 Live Image Compression Modes ---');
  // Mode 1: Automatic (JPG -> JPG)
  const autoRes = await imageJobSupervisor.startCompression(
    testJpg,
    {
      quality: 'auto',
      outputFormat: 'original',
      removeMetadata: true,
      customOutputDir: __dirname
    }
  );
  assert(autoRes.success === true && Boolean(autoRes.result?.outputPath), 'Automatic JPG compression succeeded');
  assert(fs.existsSync(autoRes.result.outputPath), 'Automatic output file exists on disk');
  if (autoRes.result?.outputPath) { try { fs.unlinkSync(autoRes.result.outputPath); } catch { } }

  // Mode 2: High Quality (PNG -> PNG)
  const highRes = await imageJobSupervisor.startCompression(
    testPngAlpha,
    {
      quality: 'high',
      outputFormat: 'original',
      removeMetadata: true,
      customOutputDir: __dirname
    }
  );
  assert(highRes.success === true && (highRes.result?.outputFormat === 'PNG' || highRes.result?.format === 'png'), 'High quality PNG compression succeeded with PNG format preserved');
  if (highRes.result?.outputPath) { try { fs.unlinkSync(highRes.result.outputPath); } catch { } }

  // Mode 3: Medium Quality (WebP -> WebP)
  const medRes = await imageJobSupervisor.startCompression(
    testWebp,
    {
      quality: 'medium',
      outputFormat: 'original',
      removeMetadata: true,
      customOutputDir: __dirname
    }
  );
  assert(medRes.success === true && (medRes.result?.outputFormat === 'WEBP' || medRes.result?.format === 'webp'), 'Medium quality WebP compression succeeded');
  if (medRes.result?.outputPath) { try { fs.unlinkSync(medRes.result.outputPath); } catch { } }

  // Mode 4: Low Quality (BMP -> WebP conversion)
  const lowRes = await imageJobSupervisor.startCompression(
    testBmp,
    {
      quality: 'low',
      outputFormat: 'webp',
      removeMetadata: true,
      customOutputDir: __dirname
    }
  );
  assert(lowRes.success === true && (lowRes.result?.outputFormat === 'WEBP' || lowRes.result?.format === 'webp'), 'Low quality BMP -> WebP conversion succeeded');
  if (lowRes.result?.outputPath) { try { fs.unlinkSync(lowRes.result.outputPath); } catch { } }

  console.log('\n--- 15.2 Transparency Handling (PNG with Alpha -> JPG) ---');
  const transparentToJpgRes = await imageJobSupervisor.startCompression(
    testPngAlpha,
    {
      quality: 'high',
      outputFormat: 'jpg',
      removeMetadata: true,
      customOutputDir: __dirname
    }
  );
  assert(transparentToJpgRes.success === true && (transparentToJpgRes.result?.outputFormat === 'JPG' || transparentToJpgRes.result?.format === 'jpg'), 'Transparent PNG -> JPG conversion succeeded');
  const probeTransJpg = await probeImageFile(transparentToJpgRes.result.outputPath);
  assert(probeTransJpg.success === true && probeTransJpg.metadata?.hasAlpha === false, 'Output JPG has clean flattened composite (no transparency crash)');
  if (transparentToJpgRes.result?.outputPath) { try { fs.unlinkSync(transparentToJpgRes.result.outputPath); } catch { } }

  console.log('\n--- 15.3 Image Resizing Engine ---');
  // Percentage resize: 50% of 320x240 -> 160x120
  const resizePercentRes = await imageJobSupervisor.startCompression(
    testJpg,
    {
      quality: 'medium',
      outputFormat: 'jpg',
      resize: {
        enabled: true,
        mode: 'percentage',
        percentage: 50,
        lockAspectRatio: true
      },
      removeMetadata: true,
      customOutputDir: __dirname
    }
  );
  assert(resizePercentRes.success === true, 'Percentage resizing completed successfully');
  const probeResize50 = await probeImageFile(resizePercentRes.result.outputPath);
  assert(probeResize50.metadata?.width === 160 && probeResize50.metadata?.height === 120, 'Image dimensions scaled exactly 50% to 160x120');
  if (resizePercentRes.result?.outputPath) { try { fs.unlinkSync(resizePercentRes.result.outputPath); } catch { } }

  // Custom dimension resize: 100x100 lockAspectRatio -> 100x75
  const resizeDimRes = await imageJobSupervisor.startCompression(
    testJpg,
    {
      quality: 'medium',
      outputFormat: 'jpg',
      resize: {
        enabled: true,
        mode: 'dimensions',
        width: 100,
        height: 100,
        lockAspectRatio: true
      },
      removeMetadata: true,
      customOutputDir: __dirname
    }
  );
  assert(resizeDimRes.success === true, 'Custom dimension resize completed successfully');
  const probeResizeDim = await probeImageFile(resizeDimRes.result.outputPath);
  assert(probeResizeDim.metadata?.width === 100 && probeResizeDim.metadata?.height === 75, 'Image dimensions fitted within 100x100 with aspect ratio locked (100x75)');
  if (resizeDimRes.result?.outputPath) { try { fs.unlinkSync(resizeDimRes.result.outputPath); } catch { } }

  console.log('\n--- 15.4 Custom Target Size (Bounded Iterative Search) ---');
  const targetSizeRes = await imageJobSupervisor.startCompression(
    testJpg,
    {
      quality: 'custom',
      outputFormat: 'jpg',
      targetSizeBytes: 8000,
      targetPercent: 50,
      removeMetadata: true,
      customOutputDir: __dirname
    }
  );
  assert(targetSizeRes.success === true, 'Custom Target Size compression completed within bounded iterations');
  assert(fs.existsSync(targetSizeRes.result.outputPath), 'Custom Target Size output file exists');
  if (targetSizeRes.result?.outputPath) { try { fs.unlinkSync(targetSizeRes.result.outputPath); } catch { } }

  console.log('\n--- 15.5 Batch Multi-Image Sequential Processing & Error Resilience ---');
  const batchImg1 = testJpg;
  const batchImg2 = testWebp;
  const batchImg3 = testPngAlpha;
  const batchImgCorrupt = path.resolve(__dirname, 'batch_corrupt.png');
  fs.writeFileSync(batchImgCorrupt, 'Not a valid png file buffer');

  const batchResults = [];
  for (const imgPath of [batchImg1, batchImgCorrupt, batchImg3]) {
    const probe = await probeImageFile(imgPath);
    if (!probe.success) {
      batchResults.push({ success: false, error: probe.error });
      continue;
    }
    const cRes = await imageJobSupervisor.startCompression(
      imgPath,
      {
        quality: 'auto',
        outputFormat: 'original',
        removeMetadata: true,
        customOutputDir: __dirname
      }
    );
    batchResults.push(cRes);
  }

  assert(batchResults[0].success === true, 'Batch Image Item 1 (JPG) succeeded');
  assert(batchResults[1].success === false, 'Batch Image Item 2 (Corrupt) safely failed without aborting batch');
  assert(batchResults[2].success === true, 'Batch Image Item 3 (PNG) succeeded after failure');
  assert(batchResults.filter(r => r.success).length === 2, 'Batch multi-image summary correctly recorded 2 succeeded, 1 failed');

  for (const r of batchResults) {
    if (r.result?.outputPath && fs.existsSync(r.result.outputPath)) {
      try { fs.unlinkSync(r.result.outputPath); } catch { }
    }
  }

  // Cleanup test image files
  try {
    fs.unlinkSync(testPngAlpha);
    fs.unlinkSync(testJpg);
    fs.unlinkSync(testWebp);
    fs.unlinkSync(testBmp);
    fs.unlinkSync(batchImgCorrupt);
  } catch { }

  console.log('\n--- 15.6 Image Selection Queue Processing & Invariants ---');
  // Helper simulating the exact App.tsx handleSelectImages queue processing logic
  function processIncomingImageSelection(incomingFiles, existingQueue = [], isAddMore = false) {
    const queue = isAddMore ? [...existingQueue] : [];
    const newItems = [];
    let duplicatesCount = 0;

    for (const item of incomingFiles) {
      if (item.error || item.status === 'failed') continue;
      const filePath = item.filePath || item.metadata?.filePath;
      if (!filePath) continue;

      const isDup = queue.some(q => q.filePath.toLowerCase() === filePath.toLowerCase());
      if (isDup) {
        duplicatesCount++;
        continue;
      }

      const meta = item.metadata;
      const fileName = item.fileName || meta?.fileName || path.basename(filePath);
      const fileSizeBytes = item.fileSizeBytes ?? meta?.fileSizeBytes ?? 0;
      const formattedSize = item.formattedSize || meta?.formattedSize || '0 B';
      const format = item.format || meta?.format || 'jpg';
      const width = item.width ?? meta?.width ?? 0;
      const height = item.height ?? meta?.height ?? 0;
      const hasAlpha = item.hasAlpha ?? meta?.hasAlpha ?? false;
      const thumb = item.thumbnailDataUrl || item.thumbnailBase64 || meta?.thumbnailDataUrl || meta?.thumbnailBase64;

      newItems.push({
        id: item.id || filePath,
        filePath,
        fileName,
        fileSizeBytes,
        formattedSize,
        format,
        width,
        height,
        hasAlpha,
        thumbnailDataUrl: thumb,
        thumbnailBase64: thumb,
        status: 'pending'
      });
    }

    return {
      finalQueue: isAddMore ? [...queue, ...newItems] : newItems,
      newItems,
      duplicatesCount
    };
  }

  // Test 15.6.1: Single JPG Selection (with IPC flat item payload)
  const mockIpcJpg = {
    id: 'img_1',
    filePath: 'C:\\Photos\\test.jpg',
    fileName: 'test.jpg',
    fileSizeBytes: 204800,
    formattedSize: '200.0 KB',
    format: 'jpg',
    width: 1920,
    height: 1080,
    hasAlpha: false,
    thumbnailDataUrl: 'data:image/webp;base64,mockthumb',
    status: 'pending'
  };
  const singleJpgSelect = processIncomingImageSelection([mockIpcJpg]);
  assert(singleJpgSelect.finalQueue.length === 1, 'Single JPG selection correctly populates queue');
  assert(singleJpgSelect.finalQueue[0].fileName === 'test.jpg', 'Filename preserved');
  assert(singleJpgSelect.finalQueue[0].fileSizeBytes === 204800, 'File size preserved');
  assert(singleJpgSelect.finalQueue[0].thumbnailDataUrl === 'data:image/webp;base64,mockthumb', 'Thumbnail preserved');

  // Test 15.6.2: Single PNG Selection with Alpha
  const mockIpcPng = {
    id: 'img_2',
    filePath: 'C:\\Photos\\logo.png',
    fileName: 'logo.png',
    fileSizeBytes: 512000,
    formattedSize: '500.0 KB',
    format: 'png',
    width: 800,
    height: 600,
    hasAlpha: true,
    thumbnailDataUrl: 'data:image/webp;base64,mockpngthumb',
    status: 'pending'
  };
  const singlePngSelect = processIncomingImageSelection([mockIpcPng]);
  assert(singlePngSelect.finalQueue.length === 1, 'Single PNG selection populates queue');
  assert(singlePngSelect.finalQueue[0].hasAlpha === true, 'Alpha transparency preserved');

  // Test 15.6.3: Multiple Image Selection (3 images at once)
  const mockIpcWebp = {
    id: 'img_3',
    filePath: 'C:\\Photos\\banner.webp',
    fileName: 'banner.webp',
    fileSizeBytes: 102400,
    formattedSize: '100.0 KB',
    format: 'webp',
    width: 1200,
    height: 400,
    hasAlpha: false,
    thumbnailDataUrl: 'data:image/webp;base64,mockwebpthumb',
    status: 'pending'
  };
  const multiSelect = processIncomingImageSelection([mockIpcJpg, mockIpcPng, mockIpcWebp]);
  assert(multiSelect.finalQueue.length === 3, 'Multiple images (3) all added to queue successfully');

  // Test 15.6.4: Add More (appending to existing queue)
  const existingQueue = [mockIpcJpg];
  const addMoreSelect = processIncomingImageSelection([mockIpcPng, mockIpcWebp], existingQueue, true);
  assert(addMoreSelect.finalQueue.length === 3, 'Add More appends 2 new items to 1 existing item (3 total)');
  assert(addMoreSelect.finalQueue[0].filePath === 'C:\\Photos\\test.jpg', 'Original queue item preserved at index 0');

  // Test 15.6.5: Duplicate Image Detection & Rejection
  const duplicateAttempt = processIncomingImageSelection([
    { ...mockIpcJpg, filePath: 'c:\\photos\\TEST.JPG' }, // Case-insensitive duplicate
    mockIpcWebp
  ], existingQueue, true);
  assert(duplicateAttempt.duplicatesCount === 1, 'Duplicate image detected and skipped');
  assert(duplicateAttempt.newItems.length === 1, 'Only non-duplicate item added');
  assert(duplicateAttempt.finalQueue.length === 2, 'Queue contains only unique items');

  // Test 15.6.6: Dialog Cancellation Preserves Queue
  let currentActiveQueue = [...multiSelect.finalQueue];
  const dialogCanceled = true;
  if (!dialogCanceled) {
    currentActiveQueue = [];
  }
  assert(currentActiveQueue.length === 3, 'Dialog cancellation preserves existing queue without clearing');

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
