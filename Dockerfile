# Use an official Node.js runtime as a parent image
FROM node:16

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install the app dependencies
RUN npm install

# Install Puppeteer dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libgconf-2-4 \
    libgbm-dev \
    libgtk-3-0 \
    libasound2  # This is the missing dependency

# Install Puppeteer
RUN npm install puppeteer

# Copy the rest of the app code into the container
COPY . .

# Expose port 3000 for the API
EXPOSE 3000

# Define the command to run the app
CMD ["node", "app.js"]
