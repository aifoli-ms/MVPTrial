# Use an official Node runtime as a parent image
FROM node:20-alpine

# Install Python and pip
RUN apk add --no-cache python3 py3-pip

# Set the working directory in the container
WORKDIR /usr/src/app

# --- Node.js Setup ---
# Copy package.json and package-lock.json (if available)
COPY package*.json ./
# Install app dependencies
RUN npm install

# --- Python Setup ---
# Copy requirements.txt
COPY requirements.txt ./
# Install Python dependencies
# Install Python dependencies
RUN pip install -r requirements.txt --break-system-packages

# --- Application Code ---
# Bundle app source code (copies server.js, audio_monitor.py, etc.)
COPY . .

# Make the start script executable
RUN chmod +x ./start.sh

# Define the command to run your app
CMD [ "./start.sh" ]
