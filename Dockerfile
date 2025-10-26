# --- Base Image ---
# Use an official Node.js runtime. '21-slim' is a good balance of
# small size and compatibility for your Node.js v21 project.
FROM node:21-slim

# --- Working Directory ---
# Set the working directory inside the container
WORKDIR /app

# --- Install Dependencies ---
# Copy package.json and package-lock.json (if it exists)
# This leverages Docker's layer caching. This step only re-runs
# if your package.json changes.
COPY package*.json ./

# Install app dependencies
RUN npm install

# --- Copy Application Code ---
# Copy the rest of your application code (server2.js, etc.)
# This is done *after* npm install, so Docker doesn't
# reinstall all modules every time you change a .js file.
COPY . .

# --- Expose Port ---
# Your server listens on PORT 3001 by default.
# This informs Docker that the container listens on this port.
EXPOSE 3001

# --- Volumes ---
# Define mount points for persistent data.
# This is CRITICAL for your app. It ensures that files
# uploaded to ./audio_to_process and transcripts written to
# ./transcripts are saved on your *host machine*, not
# lost inside the container when it stops.
VOLUME /app/audio_to_process
VOLUME /app/transcripts

# --- Run Command ---
# The command to run your application.
# This executes: "node server2.js" as defined in your package.json
CMD ["npm", "run", "start:v2"]
