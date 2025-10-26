// --- IMPORTS ---
import express from "express";
import multer from "multer";
import cors from "cors";
import { createClient } from "@deepgram/sdk";
import fsp from "fs/promises"; // For async file operations
import fs from "fs"; // For sync/callback operations
import path from "path";
import chokidar from "chokidar";
import "dotenv/config"; // Loads .env file variables into process.env

// --- CONFIGURATION ---
// Get API key from environment variables (loads from .env file)
const apiKey = "380b6d99705e632e64b1cdfb76f91874117205b6";

// Directory to watch for new audio files (and for uploads)
const WATCH_DIRECTORY = "./audio_to_process";
// Directory to save the resulting transcript text files
const TRANSCRIPT_DIRECTORY = "./transcripts";
// Server port
const PORT = process.env.PORT || 3001;

// Allowed audio file extensions (using a Set for fast lookups)
const ALLOWED_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".m4a",
  ".webm",
]);

// --- DEEPGRAM CLIENT ---
// We initialize this once
let deepgram;

// --- DEEPGRAM TRANSCRIPTION LOGIC ---

/**
 * Handles the transcription of a single audio file using Deepgram.
 * @param {string} filepath - The full path to the audio file.
 * @param {object} dgClient - An initialized Deepgram client instance.
 */
const transcribeFile = async (filepath, dgClient) => {
  const filename = path.basename(filepath);
  console.log(`\n[Processing] Starting transcription for: ${filename}`);

  try {
    // 1. Read the audio file into a buffer
    const fileBuffer = await fsp.readFile(filepath);

    // 2. Call the Deepgram API
    const { result, error } = await dgClient.listen.prerecorded.transcribeFile(
      fileBuffer,
      {
        model: "nova-3", // Use the newer model
        smart_format: true,
        diarize: true,
      }
    );

    if (error) {
      throw new Error(`[Error] Deepgram API failed: ${error.message}`);
    }

    // 3. Extract the transcript
    const transcript = result.results.channels[0].alternatives[0].transcript;

    // 4. Save the transcript to a file
    const transcriptFilename = `${path.parse(filename).name}_transcript.txt`;
    const outputPath = path.join(TRANSCRIPT_DIRECTORY, transcriptFilename);

    await fsp.writeFile(outputPath, transcript, "utf-8");

    console.log(`[Success] Transcript saved to: ${outputPath}`);
    console.log(`Transcript: ${transcript.substring(0, 80)}...`); // Print a snippet
  } catch (e) {
    console.error(
      `[Error] An unexpected error occurred while processing ${filename}: ${e.message}`
    );
  }
};

// --- FILE MONITOR LOGIC ---

/**
 * Sets up directory checks and starts the file monitor.
 */
const runMonitor = () => {
  // 1. Check Directories (using synchronous check on startup)
  if (!fs.existsSync(WATCH_DIRECTORY)) {
    fs.mkdirSync(WATCH_DIRECTORY, { recursive: true });
    console.log(`Created monitoring directory: ${WATCH_DIRECTORY}`);
  }

  if (!fs.existsSync(TRANSCRIPT_DIRECTORY)) {
    fs.mkdirSync(TRANSCRIPT_DIRECTORY, { recursive: true });
    console.log(`Created transcript output directory: ${TRANSCRIPT_DIRECTORY}`);
  }

  // 2. Setup Watchdog (Chokidar) Observer
  console.log("-" * 50);
  console.log(`Starting audio file monitor on: ${WATCH_DIRECTORY}`);
  console.log(
    "Watching for new audio files (e.g., .mp3, .wav) to transcribe."
  );
  console.log("-" * 50);

  const watcher = chokidar.watch(WATCH_DIRECTORY, {
    ignored: /^\./, // ignore dotfiles
    persistent: true,
    ignoreInitial: true, // Don't process files already in the folder on startup
    awaitWriteFinish: {
      // Wait for the file to be fully written
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  // 3. Start Monitoring
  watcher
    .on("add", (filepath) => {
      const filename = path.basename(filepath);
      const fileExtension = path.extname(filename).toLowerCase();

      // Check if the file has an allowed audio extension
      if (ALLOWED_EXTENSIONS.has(fileExtension)) {
        console.log(`\n[New File Detected] ${filename}`);
        // Pass the initialized deepgram client
        transcribeFile(filepath, deepgram);
      } else {
        console.log(`[Ignored] File ${filename} has an unsupported extension.`);
      }
    })
    .on("error", (error) => console.error(`[Watcher Error] ${error}`));

  // 4. Handle server shutdown (optional, but good practice)
  process.on("SIGINT", () => {
    console.log("\nShutting down monitor...");
    watcher.close();
    process.exit(0);
  });
};

// --- MAIN EXECUTION ---

/**
 * Starts the entire application (Server + Monitor)
 */
const startApp = () => {
  // 1. Check for API Key
  if (!apiKey) {
    console.error(
      "CRITICAL: DEEPGRAM_API_KEY not found. Please create a .env file or set the environment variable."
    );
    return; // Stop the app from starting
  }

  // 2. Setup Deepgram Client
  deepgram = createClient(apiKey);

  // 3. Initialize Express App
  const app = express();

  // 4. Configure Middleware
  app.use(cors()); // Enable CORS for all routes
  app.use(express.json()); // Parse JSON request bodies
  app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

  // 5. Configure Multer for File Uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      // Save files to the same directory Chokidar is watching
      cb(null, WATCH_DIRECTORY);
    },
    filename: (req, file, cb) => {
      // IMPORTANT: Use the file's original name.
      // This assumes the client sends "my_prefix_voice.webm"
      // which then gets transcribed to "my_prefix_voice_transcript.txt"
      cb(null, file.originalname);
    },
  });

  const upload = multer({ storage: storage });

  // 6. Define API Routes

  /**
   * Route to upload a single audio file.
   * The file is saved to the WATCH_DIRECTORY, which triggers Chokidar.
   */
  app.post("/upload-audio", upload.single("file"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    console.log(`File uploaded successfully to ${req.file.path}`);
    return res.json({ filename: req.file.filename, path: req.file.path });
  });

  /**
   * Route to poll for and retrieve a transcript.
   * Uses the 'prefix' (the original audio filename without extension)
   * to find the corresponding _transcript.txt file.
   */
  app.get("/transcripts/find/:prefix", (req, res) => {
    const { prefix } = req.params;
    if (!prefix) {
      return res.status(400).json({ error: "Prefix is required" });
    }

    // Construct the exact filename we expect.
    // e.g., if prefix is "user1_voice", filename is "user1_voice_transcript.txt"
    const expectedFilename = `${prefix}_transcript.txt`;
    const fullPath = path.join(TRANSCRIPT_DIRECTORY, expectedFilename);

    // Check if this *specific* file exists using fs.access (fast)
    fs.access(fullPath, fs.constants.F_OK, (err) => {
      if (err) {
        // 'err' means file not found (or no access). This is normal.
        // The client will see the 404 and poll again.
        console.log(`[DEBUG] Polling for ${expectedFilename}, not found yet.`);
        return res.status(404).json({ error: "Transcript not yet available" });
      }

      // File exists! Read it and send its content.
      fs.readFile(fullPath, "utf8", (rErr, data) => {
        if (rErr) {
          console.error(`[ERROR] Found ${fullPath} but failed to read:`, rErr);
          return res.status(500).json({ error: "Unable to read transcript file" });
        }

        console.log(`[DEBUG] Successfully found and sent ${expectedFilename}.`);

        // Send the successful response
        // We can use fs.stat to get the mtime
        fs.stat(fullPath, (sErr, stats) => {
          return res.json({
            filename: expectedFilename,
            transcript: data,
            mtime: sErr ? 0 : stats.mtimeMs,
          });
        });
      });
    });
  });

  // 7. Start the Express Server
  app.listen(PORT, () => {
    console.log(`Audio upload server listening on http://localhost:${PORT}`);
  });

  // 8. Start the File Monitor
  // This runs in the background, watching for files added by the server
  runMonitor();
};

// Run the application
startApp();
