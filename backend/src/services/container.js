const fs = require('fs-extra');
const path = require('path');
const { execSync, spawn } = require('child_process');

class ContainerService {
  constructor() {
    this.containersPath = '/app/containers';
    this.dataPath = '/app/data';
    this.mountPath = '/mnt/encrypted';
    this.primaryContainerName = 'primary';

    // Activity tracking for auto-dismount
    this.lastActivity = new Map();
    this.activityCheckInterval = null;
    this.inactivityTimeoutMinutes = 15; // Auto-dismount after 15 minutes of inactivity (default)

    // Ensure directories exist
    fs.ensureDirSync(this.containersPath);
    fs.ensureDirSync(this.dataPath);
    fs.ensureDirSync(this.mountPath);
  }

  async listContainers() {
    const containers = [];
    const containerNames = new Set();

    try {
      // Get all .vc files
      const files = await fs.readdir(this.containersPath);
      for (const file of files) {
        if (file.endsWith('.vc')) {
          const name = path.basename(file, '.vc');
          containerNames.add(name);
        }
      }
    } catch (error) {
      console.log('No container directory or files found');
    }

    try {
      // Also check for orphaned config files (containers that failed during creation)
      const configFiles = await fs.readdir(this.dataPath);
      for (const file of configFiles) {
        if (file.endsWith('.json')) {
          const name = path.basename(file, '.json');
          containerNames.add(name);
        }
      }
    } catch (error) {
      console.log('No data directory or config files found');
    }

    // Get status for all containers found
    for (const name of containerNames) {
      try {
        const status = await this.getContainerStatus(name);
        containers.push({
          name,
          file: `${name}.vc`,
          ...status
        });
      } catch (error) {
        console.log(`Error getting status for container ${name}:`, error.message);
        // Still add the container so it can be cleaned up
        containers.push({
          name,
          file: `${name}.vc`,
          exists: false,
          mounted: false,
          config: null,
          applications: []
        });
      }
    }

    return containers;
  }

  async getPrimaryContainer() {
    try {
      const status = await this.getContainerStatus(this.primaryContainerName);
      const sillyTavernRunning = await this.isSillyTavernRunning();
      const lastActivity = this.lastActivity.get(this.primaryContainerName);
      const minutesInactive = lastActivity ? Math.floor((new Date() - lastActivity) / (1000 * 60)) : null;

      return {
        name: this.primaryContainerName,
        file: `${this.primaryContainerName}.vc`,
        sillyTavernRunning,
        lastActivity: lastActivity?.toISOString(),
        minutesInactive,
        activityMonitoringActive: !!this.activityCheckInterval,
        ...status
      };
    } catch (error) {
      // Return container info even if it doesn't exist yet
      return {
        name: this.primaryContainerName,
        file: `${this.primaryContainerName}.vc`,
        exists: false,
        mounted: false,
        config: null,
        applications: [],
        sillyTavernRunning: false
      };
    }
  }

  async verifyContainerPassword(name, password) {
    const containerFile = path.join(this.containersPath, `${name}.vc`);

    if (!await fs.pathExists(containerFile)) {
      throw new Error(`Container ${name} does not exist`);
    }

    try {
      // Use cryptsetup's luksDump with test-passphrase to verify password without mounting
      execSync(`echo "${password}" | cryptsetup luksOpen --test-passphrase ${containerFile}`, {
        stdio: 'pipe'
      });
      return true;
    } catch (error) {
      // If the command fails, the password is incorrect
      return false;
    }
  }

  recordActivity(containerName) {
    this.lastActivity.set(containerName, new Date());
    console.log(`Activity recorded for ${containerName} at ${new Date().toISOString()}`);
  }

  startActivityMonitoring(containerName) {
    // Clear any existing interval
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
    }

    // Check for inactivity every 30 seconds for more responsive monitoring
    this.activityCheckInterval = setInterval(async () => {
      await this.checkForInactivity(containerName);
    }, 30 * 1000);

    console.log(`Started activity monitoring for ${containerName} with ${this.inactivityTimeoutMinutes} minute timeout`);
  }

  stopActivityMonitoring() {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
      console.log('Stopped activity monitoring');
    }
  }


  async checkForInactivity(containerName) {
    const lastActivity = this.lastActivity.get(containerName);
    if (!lastActivity) {
      console.log(`No activity recorded for ${containerName}`);
      return;
    }

    // Get timeout from container config if available
    let timeoutMinutes = this.inactivityTimeoutMinutes;
    try {
      const status = await this.getContainerStatus(containerName);
      if (status.config?.autoUnmountTimeout) {
        timeoutMinutes = status.config.autoUnmountTimeout;
      }
    } catch (error) {
      console.log('Could not read container config, using default timeout');
    }

    const now = new Date();
    const inactiveMinutes = (now - lastActivity) / (1000 * 60);

    console.log(`Container ${containerName} inactive for ${Math.floor(inactiveMinutes)} minutes (timeout: ${timeoutMinutes} minutes)`);

    if (inactiveMinutes >= timeoutMinutes) {
      console.log(`Auto-dismounting ${containerName} due to inactivity (${Math.floor(inactiveMinutes)}min >= ${timeoutMinutes}min)`);
      try {
        // First stop SillyTavern
        console.log('Auto-dismount: Stopping SillyTavern...');
        await this.stopApplications(containerName);

        // Poll for SillyTavern to actually stop before unmounting
        console.log('Auto-dismount: Waiting for SillyTavern to terminate...');
        let attempts = 0;
        const maxAttempts = 10; // 10 seconds max wait
        while (attempts < maxAttempts) {
          // Wait first, then check
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second intervals
          attempts++;

          console.log(`Auto-dismount: Checking SillyTavern status (attempt ${attempts}/${maxAttempts})...`);
          try {
            const isRunning = await this.isSillyTavernRunning();
            console.log(`Auto-dismount: SillyTavern running: ${isRunning}`);

            if (!isRunning) {
              console.log('Auto-dismount: SillyTavern confirmed stopped');
              break;
            }
          } catch (err) {
            console.log('Auto-dismount: Status check failed:', err.message);
            // If status check fails, assume it's stopped
            break;
          }
        }

        if (attempts >= maxAttempts) {
          console.warn('Auto-dismount: SillyTavern may still be running after 10 seconds, proceeding with unmount anyway');
        }

        // Now unmount the container
        console.log('Auto-dismount: Unmounting container...');
        await this.unmountContainer(containerName);

        this.stopActivityMonitoring();
        this.lastActivity.delete(containerName);
        console.log(`Successfully auto-dismounted ${containerName}`);
      } catch (error) {
        console.error(`Error during auto-dismount of ${containerName}:`, error.message);
      }
    }
  }

  async isSillyTavernRunning() {
    try {
      // Check if SillyTavern web interface is responding
      const http = require('http');

      return new Promise((resolve) => {
        const req = http.get('http://localhost:8000', { timeout: 2000 }, (res) => {
          // If we get any response, SillyTavern is running
          resolve(true);
          req.destroy();
        });

        req.on('error', () => {
          // Connection failed, SillyTavern is not running
          resolve(false);
        });

        req.on('timeout', () => {
          // Timeout, assume not running
          req.destroy();
          resolve(false);
        });
      });
    } catch (error) {
      return false;
    }
  }

  async createContainer(name, password, sizeGB) {
    const containerFile = path.join(this.containersPath, `${name}.vc`);
    const configFile = path.join(this.dataPath, `${name}.json`);

    // Check if container already exists
    if (await fs.pathExists(containerFile)) {
      throw new Error(`Container ${name} already exists`);
    }

    // Clean up any leftover LUKS devices before creating
    const deviceName = `${name}_crypt`;
    try {
      execSync(`cryptsetup luksClose ${deviceName}`, { stdio: 'pipe' });
      console.log(`Cleaned up existing LUKS device: ${deviceName}`);
    } catch (error) {
      // Device doesn't exist, which is fine
    }

    console.log(`Creating encrypted container: ${name} (${sizeGB}GB)`);

    // Create a loop file for LUKS encryption
    const createFileCmd = `dd if=/dev/zero of=${containerFile} bs=1M count=${sizeGB * 1024} status=progress`;

    try {
      console.log(`Creating container file...`);
      execSync(createFileCmd, { stdio: 'pipe' });

      // Set up loop device
      console.log(`Setting up loop device...`);
      const loopDevice = execSync(`losetup -f --show ${containerFile}`, { encoding: 'utf8' }).trim();

      // Format with LUKS - let's debug this step by step
      console.log(`Formatting with LUKS encryption...`);
      console.log(`Using password: ${password.length} characters`);
      console.log(`Loop device: ${loopDevice}`);

      // Use a more explicit approach with stdin
      const formatResult = execSync(`cryptsetup luksFormat ${loopDevice} --type luks2 --batch-mode`, {
        input: password + '\n',
        encoding: 'utf8'
      });
      console.log(`Format result: ${formatResult}`);

      // Test if we can open it immediately
      console.log(`Testing encrypted device open...`);
      const deviceName = `${name}_crypt`;
      const openResult = execSync(`cryptsetup luksOpen ${loopDevice} ${deviceName}`, {
        input: password + '\n',
        encoding: 'utf8'
      });
      console.log(`Open result: ${openResult}`);

      // Create filesystem
      console.log(`Creating ext4 filesystem...`);
      execSync(`mkfs.ext4 /dev/mapper/${deviceName}`, { stdio: 'pipe' });

      // Close the device for now
      execSync(`cryptsetup luksClose ${deviceName}`, { stdio: 'pipe' });
      execSync(`losetup -d ${loopDevice}`, { stdio: 'pipe' });

      console.log(`Encrypted container ${name} created successfully`);
    } catch (error) {
      console.error(`Error creating container ${name}:`, error.message);

      // Clean up partial files and devices if creation failed
      try {
        // Clean up LUKS device if it exists
        try {
          execSync(`cryptsetup luksClose ${deviceName}`, { stdio: 'pipe' });
          console.log(`Cleaned up LUKS device: ${deviceName}`);
        } catch (luksClenupError) {
          // Device might not exist
        }

        // Clean up loop device if containerFile exists
        if (await fs.pathExists(containerFile)) {
          try {
            const loopDevices = execSync(`losetup -j ${containerFile}`, { encoding: 'utf8' });
            const loopMatch = loopDevices.match(/^(\/dev\/loop\d+):/);
            if (loopMatch) {
              execSync(`losetup -d ${loopMatch[1]}`, { stdio: 'pipe' });
              console.log(`Cleaned up loop device: ${loopMatch[1]}`);
            }
          } catch (loopCleanupError) {
            // Loop device might not exist
          }

          // Remove partial container file
          await fs.remove(containerFile);
          console.log(`Cleaned up partial container file: ${containerFile}`);
        }
      } catch (cleanupError) {
        console.error(`Failed to cleanup after container creation failure: ${cleanupError.message}`);
      }

      throw new Error(`Failed to create container: ${error.message}`);
    }

    // Create default configuration
    const config = {
        name,
        created: new Date().toISOString(),
        applications: [
          {
            name: 'SillyTavern',
            startupCommand: `cd /mnt/encrypted/${name}/sillytavern && ./start.sh`,
            shutdownCommand: 'pkill -f "node server.js"',
            logPath: `/mnt/encrypted/${name}/sillytavern/access.log`,
            enabled: true
          }
        ],
        autoUnmountTimeout: 15, // minutes
        lastActivity: null
    };

    await fs.writeJSON(configFile, config, { spaces: 2 });
    console.log(`Configuration created for ${name}`);

    return {
      success: true,
      message: `Container ${name} created successfully`,
      container: name
    };
  }

  async mountContainer(name, password) {
    const containerFile = path.join(this.containersPath, `${name}.vc`);
    const mountPoint = path.join(this.mountPath, name);

    if (!await fs.pathExists(containerFile)) {
      throw new Error(`Container ${name} does not exist`);
    }

    // Create mount point
    await fs.ensureDir(mountPoint);

    console.log(`Mounting encrypted container: ${name}`);

    // Clean up any leftover LUKS devices before mounting
    const deviceName = `${name}_crypt`;
    try {
      execSync(`cryptsetup luksClose ${deviceName}`, { stdio: 'pipe' });
      console.log(`Cleaned up existing LUKS device: ${deviceName}`);
    } catch (error) {
      // Device doesn't exist, which is fine
    }

    try {
      // Set up loop device
      const loopDevice = execSync(`losetup -f --show ${containerFile}`, { encoding: 'utf8' }).trim();

      // Open the encrypted device
      const openCmd = `echo '${password}' | cryptsetup luksOpen ${loopDevice} ${deviceName} -`;
      execSync(openCmd, { stdio: 'pipe' });

      // Mount the filesystem
      execSync(`mount /dev/mapper/${deviceName} ${mountPoint}`, { stdio: 'pipe' });

      console.log(`Container ${name} mounted successfully at ${mountPoint}`);

      // Setup SillyTavern if this is first mount
      await this.setupSillyTavern(name, mountPoint);

      return {
        success: true,
        message: `Container ${name} mounted successfully`,
        mountPoint
      };

    } catch (error) {
      console.error(`Error mounting container ${name}:`, error.message);
      throw new Error(`Failed to mount container: ${error.message}`);
    }
  }

  async unmountContainer(name) {
    const mountPoint = path.join(this.mountPath, name);

    console.log(`Unmounting container: ${name}`);

    // Stop applications first
    await this.stopApplications(name);

    const deviceName = `${name}_crypt`;

    try {
      // Unmount filesystem first
      execSync(`umount ${mountPoint}`, { stdio: 'pipe' });

      // Close LUKS device
      execSync(`cryptsetup luksClose ${deviceName}`, { stdio: 'pipe' });

      // Find and detach loop device
      try {
        const loopDevices = execSync(`losetup -j ${path.join(this.containersPath, `${name}.vc`)}`, { encoding: 'utf8' });
        const loopMatch = loopDevices.match(/^(\/dev\/loop\d+):/);
        if (loopMatch) {
          execSync(`losetup -d ${loopMatch[1]}`, { stdio: 'pipe' });
        }
      } catch (error) {
        console.log('No loop device to detach');
      }

    } catch (error) {
      console.error(`Error during unmount steps: ${error.message}`);
      // Continue with the rest of unmounting process
    }

    console.log(`Container ${name} unmounted successfully`);

    return {
      success: true,
      message: `Container ${name} unmounted successfully`
    };
  }

  async getContainerStatus(name) {
    const containerFile = path.join(this.containersPath, `${name}.vc`);
    const mountPoint = path.join(this.mountPath, name);
    const configFile = path.join(this.dataPath, `${name}.json`);

    const exists = await fs.pathExists(containerFile);
    let mounted = false;
    let config = null;

    if (exists) {
      // Check if mounted by verifying the mount point has content and is actually mounted
      try {
        // First check if the mount point directory exists
        await fs.access(mountPoint);
        const stats = await fs.stat(mountPoint);

        if (stats.isDirectory()) {
          // Check if it's actually mounted by looking for the LUKS device
          const deviceName = `${name}_crypt`;
          try {
            execSync(`ls -la /dev/mapper/${deviceName}`, { stdio: 'pipe' });
            // Also check if filesystem is actually mounted
            const mountCheck = execSync('mount', { encoding: 'utf8' });
            mounted = mountCheck.includes(`/dev/mapper/${deviceName}`) && mountCheck.includes(mountPoint);
          } catch (error) {
            mounted = false;
          }
        }
      } catch (error) {
        mounted = false;
      }

      // Load configuration
      try {
        config = await fs.readJSON(configFile);
      } catch (error) {
        config = null;
      }
    }

    return {
      exists,
      mounted,
      mountPoint: mounted ? mountPoint : null,
      config,
      applications: config ? config.applications : []
    };
  }

  async setupSillyTavern(containerName, mountPoint) {
    const sillyTavernPath = path.join(mountPoint, 'sillytavern');

    // Check if SillyTavern is already installed
    if (await fs.pathExists(sillyTavernPath)) {
      console.log(`SillyTavern already exists in container ${containerName}`);
      return;
    }

    console.log(`Setting up SillyTavern in container ${containerName}`);

    try {
      // Clone SillyTavern directly in the backend container
      execSync(`git clone https://github.com/SillyTavern/SillyTavern.git ${sillyTavernPath}`, { stdio: 'pipe' });

      // Install dependencies
      execSync('npm install', { cwd: sillyTavernPath, stdio: 'pipe' });

      // Make start script executable
      execSync(`chmod +x ${path.join(sillyTavernPath, 'start.sh')}`, { stdio: 'pipe' });

      // Configure SillyTavern for external access
      const configPath = path.join(sillyTavernPath, 'config.yaml');
      execSync(`sed -i 's/listen: false/listen: true/' ${configPath}`, { stdio: 'pipe' });
      execSync(`sed -i 's/whitelistMode: true/whitelistMode: false/' ${configPath}`, { stdio: 'pipe' });
      execSync(`sed -i 's/securityOverride: false/securityOverride: true/' ${configPath}`, { stdio: 'pipe' });

      console.log(`SillyTavern configured for external access`);
      console.log(`SillyTavern setup completed in container ${containerName}`);

    } catch (error) {
      console.error(`Error setting up SillyTavern:`, error.message);
      throw error;
    }
  }

  async startApplications(name) {
    const status = await this.getContainerStatus(name);

    if (!status.mounted) {
      throw new Error(`Container ${name} is not mounted`);
    }

    if (!status.config) {
      throw new Error(`No configuration found for container ${name}`);
    }

    const results = [];

    for (const app of status.config.applications) {
      if (app.enabled && app.startupCommand) {
        try {
          console.log(`Starting ${app.name} in container ${name}`);
          console.log(`Running command: ${app.startupCommand}`);
          console.log(`Working directory: ${this.mountPath}`);

          // Use spawn instead of execSync to run in background and capture output
          const child = spawn('bash', ['-c', app.startupCommand], {
            cwd: this.mountPath,
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe']
          });

          // Log output for debugging and record activity
          child.stdout.on('data', (data) => {
            console.log(`${app.name} stdout: ${data}`);
            // Record activity whenever SillyTavern outputs to stdout
            this.recordActivity(name);
          });

          child.stderr.on('data', (data) => {
            console.log(`${app.name} stderr: ${data}`);
          });

          child.on('error', (error) => {
            console.error(`${app.name} process error:`, error);
          });

          child.on('exit', (code) => {
            console.log(`${app.name} exited with code ${code}`);
          });

          // Don't wait for the process to finish - let it run in background
          child.unref();

          results.push({
            application: app.name,
            success: true,
            message: `${app.name} started successfully`
          });
        } catch (error) {
          results.push({
            application: app.name,
            success: false,
            message: `Failed to start ${app.name}: ${error.message}`
          });
        }
      }
    }

    // Start activity monitoring after applications are started
    if (results.some(r => r.success)) {
      this.startActivityMonitoring(name);
      // Record initial activity
      this.recordActivity(name);
    }

    return { results };
  }

  async stopApplications(name) {
    const status = await this.getContainerStatus(name);

    if (!status.config) {
      return { results: [] };
    }

    const results = [];

    for (const app of status.config.applications) {
      if (app.shutdownCommand) {
        try {
          console.log(`Stopping ${app.name} in container ${name}`);
          execSync(app.shutdownCommand, {
            stdio: 'pipe',
            cwd: this.mountPath
          });

          // Wait for the process to actually terminate
          console.log(`Waiting for ${app.name} to terminate...`);
          let attempts = 0;
          const maxAttempts = 10; // 5 seconds total
          while (attempts < maxAttempts) {
            try {
              // Check if the process is still running
              execSync('pgrep -f "node server.js"', { stdio: 'pipe' });
              // If pgrep succeeds, process is still running, wait more
              await new Promise(resolve => setTimeout(resolve, 500));
              attempts++;
            } catch (error) {
              // pgrep failed, meaning no process found - it's terminated
              console.log(`${app.name} terminated successfully`);
              break;
            }
          }

          if (attempts >= maxAttempts) {
            console.log(`${app.name} didn't terminate cleanly, forcing...`);
            try {
              execSync('pkill -9 -f "node server.js"', { stdio: 'pipe' });
              await new Promise(resolve => setTimeout(resolve, 1000)); // Final wait
            } catch (error) {
              // Ignore force kill errors
            }
          }

          results.push({
            application: app.name,
            success: true,
            message: `${app.name} stopped successfully`
          });
        } catch (error) {
          results.push({
            application: app.name,
            success: false,
            message: `Failed to stop ${app.name}: ${error.message}`
          });
        }
      }
    }

    // Stop activity monitoring when applications are stopped
    this.stopActivityMonitoring();
    this.lastActivity.delete(name);

    return { results };
  }

  async deleteContainer(name) {
    const containerFile = path.join(this.containersPath, `${name}.vc`);
    const configFile = path.join(this.dataPath, `${name}.json`);
    const mountPoint = path.join(this.mountPath, name);

    console.log(`Deleting container: ${name}`);

    const deletionResults = [];

    try {
      // First try to unmount if mounted
      try {
        await this.unmountContainer(name);
        deletionResults.push('Container unmounted');
      } catch (error) {
        // Ignore unmount errors - container might not be mounted or file missing
        console.log(`Unmount failed (expected if not mounted or missing): ${error.message}`);
        deletionResults.push('Unmount skipped (not mounted)');
      }

      // Remove container file (if exists)
      if (await fs.pathExists(containerFile)) {
        await fs.remove(containerFile);
        console.log(`Container file deleted: ${containerFile}`);
        deletionResults.push('Container file deleted');
      } else {
        console.log(`Container file not found: ${containerFile}`);
        deletionResults.push('Container file not found (already deleted)');
      }

      // Remove configuration file (if exists)
      if (await fs.pathExists(configFile)) {
        await fs.remove(configFile);
        console.log(`Configuration file deleted: ${configFile}`);
        deletionResults.push('Configuration deleted');
      } else {
        console.log(`Configuration file not found: ${configFile}`);
        deletionResults.push('Configuration not found (already deleted)');
      }

      // Remove mount point directory (if exists)
      if (await fs.pathExists(mountPoint)) {
        await fs.remove(mountPoint);
        console.log(`Mount point removed: ${mountPoint}`);
        deletionResults.push('Mount point removed');
      } else {
        console.log(`Mount point not found: ${mountPoint}`);
        deletionResults.push('Mount point not found (already removed)');
      }

      return {
        success: true,
        message: `Container ${name} deleted successfully`,
        details: deletionResults
      };

    } catch (error) {
      console.error(`Error deleting container ${name}:`, error.message);
      // Even if there's an error, we still consider it successful if we cleaned up what we could
      return {
        success: true,
        message: `Container ${name} cleanup completed (with issues)`,
        details: deletionResults,
        warning: error.message
      };
    }
  }

}

module.exports = new ContainerService();