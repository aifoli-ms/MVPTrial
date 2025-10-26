# Use an official Node runtime as a parent image
FROM node:20-alpine

# Install Python and pip
RUN apk add --no-cache python3 py3-pip

# Set the working directory in the container
WORKDIR /usr/src/app

# --- Node.js Setup ---
COPY package*.json ./
RUN npm install

# --- Python Setup ---
COPY requirements.txt ./
RUN pip install -r requirements.txt --break-system-packages

# --- Application Code ---
COPY . .
RUN chmod +x ./start.sh

# --- Expose the correct port ---
# Your app is running on 8080, so expose 8080
EXPOSE 8080

# Define the command to run your app
CMD [ "./start.sh" ]
EXPOSE 8080

# Define the command to run your app
CMD [ "./start.sh" ]
