const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
// --- NEW: Import Deepgram ---
const { DeepgramClient, createClient } = require('@deepgram/sdk');

const app = express();
const PORT = process.env.PORT || 3001;

// --- NEW: Initialize Deepgram ---
// Get your API key from Vercel's Environment Variables
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

app.use(cors());

// --- UPDATED: Use /tmp directory ---
// Vercel's only writeable directory is /tmp
const audioToProcessDir = path.join('/tmp', 'audio_to_process');
const transcriptsDir = path.join('/tmp', 'transcripts');

// Function to ensure directories exist (since /tmp can be cleared)
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
};

// Ensure directories exist on startup
ensureDir(audioToProcessDir);
ensureDir(transcriptsDir);

// --- UPDATED: Multer storage setup to use /tmp ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDir(audioToProcessDir); // Check again just in case
    cb(null, audioToProcessDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    // Use the prefix from the body if available, otherwise use timestamp
    const prefix = req.body.prefix || timestamp;
    const safeName = (file.originalname || 'audio').replace(/[^a-z0-9.-_]/gi, '_');
    // We'll use the prefix in the filename for easier lookup
    cb(null, `${prefix}_${safeName}`);
  }
});
const upload = multer({ storage });

// --- NEW: Background Transcription Function ---
const transcribeAudio = async (filePath, originalFilename) => {
  try {
    console.log(`[Transcribing] Starting transcription for ${originalFilename}`);
    
    // 1. Read the file buffer from /tmp
    const fileBuffer = fs.readFileSync(filePath);

    // 2. Call Deepgram API
    const { result, error } = await deepgram.listen.v1.prerecorded.transcribeFile(
      fileBuffer,
      {
        model: 'nova-2', // You can also use 'nova-3'
        smart_format: true,
        diarize: true
      }
    );

    if (error) {
      throw new Error(`Deepgram API Error: ${error.message}`);
    }

    // 3. Get the transcript text
    const transcript = result.results.channels[0].alternatives[0].transcript;
    
    // 4. Save the transcript file to /tmp
    // This creates the [prefix]_voice_transcript.txt file
    const transcriptFilename = `${path.parse(originalFilename).name}_transcript.txt`;
    const transcriptPath = path.join(transcriptsDir, transcriptFilename);
    
    fs.writeFileSync(transcriptPath, transcript, 'utf8');
    
    console.log(`[Success] Transcript saved to: ${transcriptPath}`);
    
    // 5. Clean up the original audio file from /tmp
    fs.unlinkSync(filePath);
    console.log(`[Cleanup] Removed original audio: ${filePath}`);

  } catch (err) {
    console.error(`[Error] Transcription failed for ${originalFilename}: ${err.message}`);
    // Optional: Write an error file to /tmp so the client knows it failed
    const errorFilename = `${path.parse(originalFilename).name}_error.txt`;
    const errorPath = path.join(transcriptsDir, errorFilename);
    fs.writeFileSync(errorPath, `Transcription failed: ${err.message}`, 'utf8');
  }
};

// --- ROUTES ---

app.get('/', (req, res) => {
  res.send('Audio upload and transcription server running on Vercel.');
});

// --- UPDATED: /upload-audio endpoint ---
app.post('/upload-audio', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  console.log(`File uploaded successfully to ${req.file.path}`);
  
  // --- NEW: Trigger transcription in the background ---
  // We DO NOT 'await' this. We let it run asynchronously.
  // This sends an immediate response to the client,
  // so their request doesn't time out (Vercel has short timeouts).
  transcribeAudio(req.file.path, req.file.filename);
  
  // Return the original file info. The client will poll for the transcript.
  return res.json({ filename: req.file.filename, path: req.file.path });
});

// --- UPDATED: /transcripts/find endpoint ---
// This logic now correctly checks the /tmp/transcripts directory.
app.get('/transcripts/find/:prefix', (req, res) => {
  const { prefix } = req.params;
  if (!prefix) {
    return res.status(400).json({ error: 'Prefix is required' });
  }

  const expectedFilename = `${prefix}_voice_transcript.txt`;
  // Check the /tmp directory
  const fullPath = path.join(transcriptsDir, expectedFilename);

  // Check for an error file first
  const errorPath = path.join(transcriptsDir, `${prefix}_voice_error.txt`);
  if (fs.existsSync(errorPath)) {
    console.log(`[DEBUG] Sending transcription error for ${prefix}`);
    const errorData = fs.readFileSync(errorPath, 'utf8');
    return res.status(500).json({ error: 'Transcription failed', details: errorData });
  }

  // Check if the transcript file exists
  fs.access(fullPath, fs.constants.F_OK, (err) => {
    if (err) {
      // File not found, this is normal during polling
      console.log(`[DEBUG] Polling for ${expectedFilename}, not found yet.`);
      return res.status(404).json({ error: 'Transcript not yet available' });
    }

    // File exists! Read it and send its content.
    fs.readFile(fullPath, 'utf8', (rErr, data) => {
      if (rErr) {
        console.error(`[ERROR] Found ${fullPath} but failed to read:`, rErr);
        return res.status(500).json({ error: 'Unable to read transcript file' });
      }
      
      console.log(`[DEBUG] Successfully found and sent ${expectedFilename}.`);
      
      fs.stat(fullPath, (sErr, stats) => {
          return res.json({
            filename: expectedFilename,
            transcript: data,
            mtime: sErr ? 0 : stats.mtimeMs
          });
      });
    });
  });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Audio upload server listening on http://localhost:${PORT}`);
});


app.listen(PORT, () => {
  console.log(`Audio upload server listening on http://localhost:${PORT}`);
});
