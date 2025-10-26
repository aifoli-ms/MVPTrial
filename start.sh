#!/bin/sh

# Make sure the script exits if any command fails
set -e

# Start the Node.js server in the background
echo "Starting Node.js server..."
node server.js &

# Start the Python monitor in the foreground
echo "Starting Python audio monitor..."
python3 audio_monitor.py
