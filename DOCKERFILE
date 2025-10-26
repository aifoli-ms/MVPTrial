# Use an official Node runtime as a parent image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install app dependencies (this replaces 'npm install' in the build step)
RUN npm install

# Bundle app source code
COPY . .

# Your server listens on this port (as defined in your server.js)
EXPOSE 3001 

# Define the command to run your app
CMD [ "node", "server.js" ]
