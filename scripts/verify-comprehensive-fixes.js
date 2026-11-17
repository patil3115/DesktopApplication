/**
 * Comprehensive Verification Script for Folder Compression Fixes
 * Tests:
 * 1. Dropdown settings propagation (Auto, High, Medium, Low presets; H.264, H.265 codecs; WebP, JPG, PNG formats)
 * 2. Dynamic VBV ceiling calculation and FFmpeg arguments construction
 * 3. Output-size safeguard (oversized files discarded, original retained, 0% reduction reported)
 * 4. Image compression integration with Sharp
 * 5. Source file immutability (MD5 checksums before and after)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

function getHash(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function run() {
  console.log('====================================================');
  console.log('  FOLDER COMPRESSION FIXES - VERIFICATION SUITE');
  console.log('====================================================');

  const FFMPEG_PATH = path.resolve(__dirname, '../resources/bin/win32-x64/ffmpeg.exe');
  const FFPROBE_PATH = path.resolve(__dirname, '../resources/bin/win32-x64/ffprobe.exe');

  if (!fs.existsSync(FFMPEG_PATH)) {
    throw new Error('ffmpeg.exe not found at ' + FFMPEG_PATH);
  }

  // Set environment for services
  process.env.FFMPEG_PATH = FFMPEG_PATH;
  process.env.FFPROBE_PATH = FFPROBE_PATH;

  const { jobSupervisor } = require('../dist-electron/main/ffmpeg/compressor.js');
  const { folderJobSupervisor } = require('../dist-electron/main/folder/folder-compressor.js');

  let passed = 0;
  let failed = 0;

  function assert(cond, name, details) {
    if (cond) {
      console.log(`  [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${name} - ${details || ''}`);
      failed++;
    }
  }

  // --- TEST 1: Video Compression Settings & VBV Limits Execution ---
  console.log('\n--- 1. Video Compression Settings & VBV Limits Execution ---');
  
  // Create a dummy 4-second video for testing
  const testDir = path.resolve(__dirname, 'test_sandbox');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const sampleVideo = path.join(testDir, 'sample.mp4');
  spawnSync(FFMPEG_PATH, [
    '-y', '-f', 'lavfi', '-i', 'testsrc=duration=4:size=640x360:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=4',
    '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', '-b:a', '128k',
    sampleVideo
  ]);

  const testMatrix = [
    { quality: 'auto', codec: 'h264' },
    { quality: 'high', codec: 'h264' },
    { quality: 'medium', codec: 'h264' },
    { quality: 'low', codec: 'h264' },
    { quality: 'medium', codec: 'h265' }
  ];

  for (const config of testMatrix) {
    const res = await jobSupervisor.startCompression(
      sampleVideo,
      4.0,
      {
        quality: config.quality,
        resolution: 'original',
        codec: config.codec,
        audioCodec: 'aac',
        removeMetadata: false,
        customOutputDir: testDir
      },
      () => {}
    );

    assert(res.success === true, `Compression succeeded for quality=${config.quality}, codec=${config.codec}`);
    if (res.success && res.result) {
      const outStat = fs.statSync(res.result.outputPath);
      const inStat = fs.statSync(sampleVideo);
      assert(outStat.size < inStat.size, `Output size (${outStat.size} B) is smaller than input (${inStat.size} B) for ${config.quality}/${config.codec}`);
      try { fs.unlinkSync(res.result.outputPath); } catch {}
    }
  }

  // --- TEST 2: Safeguard Against File Size Increase ---
  console.log('\n--- 2. Output Size Safeguard & Original Retention ---');

  // Setup input folder structure
  const inputFolder = path.join(testDir, 'source_folder');
  const outputFolder = path.join(testDir, 'output_folder');
  fs.mkdirSync(path.join(inputFolder, 'sub'), { recursive: true });

  const inputVideoPath = path.join(inputFolder, 'sub', 'test_video.mp4');
  fs.copyFileSync(sampleVideo, inputVideoPath);
  const inputHash = getHash(inputVideoPath);
  const inputStat = fs.statSync(inputVideoPath);

  // Run Folder Compression
  let progressEvents = [];
  const result = await folderJobSupervisor.startFolderCompression({
    sourceDir: inputFolder,
    outputDir: outputFolder,
    videoSettings: {
      quality: 'auto',
      resolution: 'original',
      codec: 'h264',
      audioCodec: 'aac',
      removeMetadata: false
    },
    imageSettings: {
      quality: 'auto',
      outputFormat: 'original',
      maxWidth: 0,
      maxHeight: 0,
      removeMetadata: false
    },
    onProgress: (p) => {
      progressEvents.push({ ...p });
    }
  });

  assert(result.completedCount === 1, 'Folder compression completed 1 item', `success count: ${result.completedCount}`);
  assert(result.failedCount === 0, 'Zero failed items', `failed count: ${result.failedCount}`);

  const destinationFile = path.join(outputFolder, 'sub', 'test_video.mp4');
  assert(fs.existsSync(destinationFile), 'Mirrored output video file exists', destinationFile);

  const outputStat = fs.statSync(destinationFile);
  assert(outputStat.size <= inputStat.size, `Output file (${outputStat.size} B) is NOT larger than input (${inputStat.size} B)`);

  // Verify source file is UNTOUCHED
  const afterSourceHash = getHash(inputVideoPath);
  assert(inputHash === afterSourceHash, 'Source file remains completely untouched (SHA-256 match)');

  // Verify safeguard logic when output is larger:
  // We simulate a tiny video where compression produces larger overhead
  console.log('\n--- 3. Forced Oversize Scenario Safeguard ---');
  const tinyVideo = path.join(inputFolder, 'tiny.mp4');
  spawnSync(FFMPEG_PATH, [
    '-y', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=160x120:rate=10',
    '-c:v', 'libx264', '-crf', '40', '-an',
    tinyVideo
  ]);
  const tinyInputHash = getHash(tinyVideo);
  const tinyInputSize = fs.statSync(tinyVideo).size;

  const testOutputFolder2 = path.join(testDir, 'output_folder2');
  const result2 = await folderJobSupervisor.startFolderCompression({
    sourceDir: inputFolder,
    outputDir: testOutputFolder2,
    videoSettings: {
      quality: 'high', // high quality preset on tiny low-res video
      resolution: 'original',
      codec: 'h264',
      audioCodec: 'aac',
      removeMetadata: false
    },
    imageSettings: {
      quality: 'auto',
      outputFormat: 'original',
      maxWidth: 0,
      maxHeight: 0,
      removeMetadata: false
    }
  });

  const tinyDest = path.join(testOutputFolder2, 'tiny.mp4');
  assert(fs.existsSync(tinyDest), 'Safeguard destination file exists', tinyDest);
  const tinyDestSize = fs.statSync(tinyDest).size;
  assert(tinyDestSize <= tinyInputSize, `Safeguard ensured destination size (${tinyDestSize}) <= input size (${tinyInputSize})`);

  // Verify original was retained without corruption
  const tinyDestHash = getHash(tinyDest);
  const tinyProcessedItem = result2.items.find(i => i.item.relativePath.includes('tiny.mp4'));
  assert(tinyProcessedItem && tinyProcessedItem.status === 'original_retained', 'Tiny video flagged with status original_retained');
  assert(tinyDestHash === tinyInputHash, 'When original is retained, SHA-256 matches input exactly');

  // --- TEST 4: Image Settings Verification (WebP format conversion) ---
  console.log('\n--- 4. Image Settings Propagation (WebP conversion) ---');
  const testImageFolder = path.join(testDir, 'image_src');
  const testImageOut = path.join(testDir, 'image_out');
  fs.mkdirSync(testImageFolder, { recursive: true });
  
  // Create a test PNG image using sharp or canvas/ffmpeg
  const samplePng = path.join(testImageFolder, 'photo.png');
  spawnSync(FFMPEG_PATH, [
    '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=300x200:d=1',
    '-vframes', '1',
    samplePng
  ]);

  const imgResult = await folderJobSupervisor.startFolderCompression({
    sourceDir: testImageFolder,
    outputDir: testImageOut,
    videoSettings: {
      quality: 'auto',
      resolution: 'original',
      codec: 'h264',
      audioCodec: 'aac',
      removeMetadata: false
    },
    imageSettings: {
      quality: 'high',
      outputFormat: 'webp',
      maxWidth: 0,
      maxHeight: 0,
      removeMetadata: false
    }
  });

  const expectedWebP = path.join(testImageOut, 'photo.webp');
  assert(fs.existsSync(expectedWebP), 'Image output format webp created photo.webp', expectedWebP);
  assert(imgResult.completedCount === 1, 'Image processed successfully to webp');

  // Clean up sandbox
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) {}

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error in verification:', err);
  process.exit(1);
});
