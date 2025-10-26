const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
// Ensure absolute directory path inside backend/audio_to_process
const audioToProcessDir = path.resolve(__dirname, 'audio_to_process');

if (!fs.existsSync(audioToProcessDir)) {
  fs.mkdirSync(audioToProcessDir, { recursive: true });
  console.log(`Created audio_to_process directory at ${audioToProcessDir}`);
}

// Multer storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('Saving file to directory:', audioToProcessDir);
    cb(null, audioToProcessDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeName = (file.originalname || 'audio').replace(/[^a-z0-9.-_]/gi, '_');
    cb(null, `${timestamp}_${safeName}`);
  }
});
const upload = multer({ storage });

app.get('/', (req, res) => {
  res.send('Audio upload server running');
});

app.post('/upload-audio', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  console.log(`File uploaded successfully to ${req.file.path}`);
  return res.json({ filename: req.file.filename, path: req.file.path });
});

// Serve transcripts directory content
const transcriptsDir = path.resolve(__dirname, 'transcripts');
if (!fs.existsSync(transcriptsDir)) {
  fs.mkdirSync(transcriptsDir, { recursive: true });
  console.log(`Created transcripts directory at ${transcriptsDir}`);
}

app.get('/transcripts/find/:prefix', (req, res) => {
  const { prefix } = req.params;
  if (!prefix) {
    return res.status(400).json({ error: 'Prefix is required' });
  }

  // --- NEW, MORE EFFICIENT LOGIC ---
  // Construct the exact filename we expect.
  // This is based on:
  // 1. The client hardcoding 'voice.webm' (which creates the [prefix]_voice.webm name)
  // 2. Your backend script creating '[prefix]_voice_transcript.txt'
  const expectedFilename = `${prefix}_voice_transcript.txt`;
  const fullPath = path.join(transcriptsDir, expectedFilename);

  // Check if this *specific* file exists using fs.access (fast)
  fs.access(fullPath, fs.constants.F_OK, (err) => {
    if (err) {
      // 'err' means file not found (or no access). This is normal.
      // The client will see the 404 and poll again.
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
      
      // Send the successful response
      // We can use fs.stat to get the mtime, but fs.access is enough to find it
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


app.listen(PORT, () => {
  console.log(`Audio upload server listening on http://localhost:${PORT}`);
});
