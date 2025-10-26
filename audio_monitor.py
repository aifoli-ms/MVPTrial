import os
import time
import json
from deepgram import DeepgramClient
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# --- CONFIGURATION ---
# IMPORTANT: For security, it is highly recommended to use an environment variable (e.g., os.environ.get("DEEPGRAM_API_KEY"))
# Prefer getting the API key from an environment variable for safety. If not set,
# fall back to the hardcoded value (not recommended for production).
api_key = os.environ.get("DEEPGRAM_API_KEY") or "380b6d99705e632e64b1cdfb76f91874117205b6"

# Directory to watch for new audio files
WATCH_DIRECTORY = "/tmp/audio_to_process"
# Directory to save the resulting transcript text files
TRANSCRIPT_DIRECTORY = "/tmp/transcripts"

# Allowed audio file extensions (add more as needed)
ALLOWED_EXTENSIONS = ('.mp3', '.wav', '.flac', '.m4a', '.webm')

# --- DEEPGRAM TRANSCRIPTION LOGIC ---

def transcribe_file(filepath: str, deepgram: DeepgramClient):
    """
    Handles the transcription of a single audio file using Deepgram.

    Args:
        filepath (str): The full path to the audio file.
        deepgram (DeepgramClient): An initialized Deepgram client instance.
    """
    filename = os.path.basename(filepath)
    print(f"\n[Processing] Starting transcription for: {filename}")

    try:
        # 1. Read the audio file into memory
        with open(filepath, "rb") as file:
            buffer_data = file.read()

        # 2. Call the Deepgram API
        response = deepgram.listen.v1.media.transcribe_file(
            request=buffer_data, # The binary content of the file
            model="nova-3",      # Use a specific model for accuracy
            smart_format=True,   # Helps with punctuation and capitalization
            diarize=True         # Optional: Recognize different speakers
        )

        # 3. Extract the transcript
        transcript = response.results.channels[0].alternatives[0].transcript
        
        # 4. Save the transcript to a file
        transcript_filename = f"{os.path.splitext(filename)[0]}_transcript.txt"
        output_path = os.path.join(TRANSCRIPT_DIRECTORY, transcript_filename)
        
        with open(output_path, "w", encoding="utf-8") as outfile:
            outfile.write(transcript)

        print(f"[Success] Transcript saved to: {output_path}")
        print(f"Transcript: {transcript[:80]}...") # Print a snippet

    except Exception as e:
        # The deepgram package used here doesn't expose a DeepgramError class in some
        # versions so catch broad exceptions and report them. If you'd like a
        # more specific handler, install/update the Deepgram SDK and adjust.
        print(f"[Error] Deepgram API failed for {filename}: {e}")
    except Exception as e:
        print(f"[Error] An unexpected error occurred while processing {filename}: {e}")
        
# --- FILESYSTEM WATCHDOG HANDLER ---

class AudioHandler(FileSystemEventHandler):
    """
    Custom handler to process new files created in the watch directory.
    """
    def __init__(self, deepgram_client):
        self.deepgram = deepgram_client

    def on_created(self, event):
        """Called when a file or directory is created."""
        if event.is_directory:
            return # Ignore directory creation events

        filepath = event.src_path
        filename = os.path.basename(filepath)
        file_extension = os.path.splitext(filename)[1].lower()

        # Check if the file has an allowed audio extension
        if file_extension in ALLOWED_EXTENSIONS:
            print(f"\n[New File Detected] {filename}")
            
            # Watchdog sometimes triggers before the file is fully written.
            # A brief pause helps ensure the file is complete and available.
            time.sleep(1) 
            
            transcribe_file(filepath, self.deepgram)
        else:
            print(f"[Ignored] File {filename} has an unsupported extension.")

# --- MAIN EXECUTION ---

def run_monitor():
    """Sets up the Deepgram client, checks directories, and starts the file monitor."""
    
    # 1. Setup Deepgram Client
    try:
        deepgram = DeepgramClient(api_key=api_key)
        # DeepgramClient will handle the TypeError internally now, so simplified initialization is fine
    except Exception as e:
        print(f"CRITICAL: Failed to initialize Deepgram Client. Please check API Key. Error: {e}")
        return

    # 2. Check Directories
    if not os.path.exists(WATCH_DIRECTORY):
        os.makedirs(WATCH_DIRECTORY)
        print(f"Created monitoring directory: {WATCH_DIRECTORY}")
    
    if not os.path.exists(TRANSCRIPT_DIRECTORY):
        os.makedirs(TRANSCRIPT_DIRECTORY)
        print(f"Created transcript output directory: {TRANSCRIPT_DIRECTORY}")

    # 3. Setup Watchdog Observer
    event_handler = AudioHandler(deepgram)
    observer = Observer()
    observer.schedule(event_handler, WATCH_DIRECTORY, recursive=False)
    
    print("-" * 50)
    print(f"Starting audio file monitor on: {WATCH_DIRECTORY}")
    print("Add new audio files (e.g., .mp3, .wav) to this folder to trigger transcription.")
    print("Press Ctrl+C to stop.")
    print("-" * 50)

    # 4. Start Monitoring Loop
    observer.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
    
    print("\nMonitor stopped.")

if __name__ == "__main__":
    run_monitor()
