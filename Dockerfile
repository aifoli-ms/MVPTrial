# --- Base Image ---
FROM node:21-slim

# --- Working Directory ---
WORKDIR /app

# --- Install Dependencies ---
COPY package*.json ./
RUN npm install

# --- Copy Application Code ---
COPY . .

# --- Expose Port ---
# Railway automatically detects this, but it's good practice.
EXPOSE 3001

# --- Run Command ---
# This executes: "node server2.js"
CMD ["npm", "run", "start:v2"]

# --- Run Command ---
# The command to run your application.
# This executes: "node server2.js" as defined in your package.json
CMD ["npm", "run", "start:v2"]
