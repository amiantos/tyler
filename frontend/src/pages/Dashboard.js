import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  PlusIcon,
  PlayIcon,
  StopIcon,
  LockClosedIcon,
  LockOpenIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';
import { containerService } from '../services/api';

const SetupWizard = ({ onComplete }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [size, setSize] = useState('5');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!password) {
      setError('Password is required');
      return;
    }

    try {
      setCreating(true);
      setError(null);
      await containerService.createPrimary(password, parseInt(size));
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-8">
      <div className="bg-gray-900 overflow-hidden shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-800">
          <h3 className="text-lg font-medium text-white">Welcome to Tyler</h3>
          <p className="mt-2 text-sm text-gray-400">
            Tyler keeps your SillyTavern installation safe from prying eyes by creating an encrypted, isolated environment using LUKS encryption.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Encryption Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tyler-blue focus:border-transparent"
              placeholder="Choose a strong password"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tyler-blue focus:border-transparent"
              placeholder="Confirm your password"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Container Size (GB)
            </label>
            <input
              type="number"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tyler-blue focus:border-transparent"
              min="5"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Recommended: 5GB minimum for SillyTavern
            </p>
          </div>

          {error && (
            <div className="bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="pt-4">
            <button
              type="submit"
              disabled={creating}
              className="btn-primary w-full"
            >
              {creating ? 'Creating encrypted container...' : "Let's Do It"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AnimatedDots = () => {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '') return '.';
        if (prev === '.') return '..';
        if (prev === '..') return '...';
        return '';
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return <span className="inline-block w-6 text-left">{dots}</span>;
};

const ActivityIndicator = ({ activityStatus }) => {
  if (!activityStatus) return null;

  const { minutesInactive, secondsInactive, timeoutMinutes, monitoringActive } = activityStatus;
  const remainingMinutes = timeoutMinutes - minutesInactive;

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const getStatusColor = () => {
    const percentRemaining = (timeoutMinutes - minutesInactive) / timeoutMinutes;

    if (percentRemaining <= 0.1) return 'text-red-400'; // Less than 10% remaining
    if (percentRemaining <= 0.3) return 'text-yellow-400'; // Less than 30% remaining
    return 'text-gray-400'; // More than 30% remaining (normal)
  };

  return (
    <div className="text-center mt-2 text-xs">
      <div className={getStatusColor()}>
        {monitoringActive ? (
          <>
            <div>Inactive for: {formatTime(secondsInactive)}</div>
            {remainingMinutes > 0 ? (
              <div className="mt-1">Auto-dismount in: ~{remainingMinutes}m</div>
            ) : (
              <div className="mt-1">Auto-dismounting soon...</div>
            )}
          </>
        ) : (
          <div className="text-gray-500">Activity monitoring inactive</div>
        )}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const [container, setContainer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [password, setPassword] = useState('');
  const [starting, setStarting] = useState(false);
  const [startupStatus, setStartupStatus] = useState('');
  const [notification, setNotification] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [activityStatus, setActivityStatus] = useState(null);

  useEffect(() => {
    loadContainer();
  }, []);

  // Refresh container data every 5 seconds when running to get updated activity info
  useEffect(() => {
    let interval = null;

    if (container?.mounted && container?.sillyTavernRunning && !starting) {
      interval = setInterval(() => {
        loadContainer(); // Refresh container data to get latest activity timestamps
      }, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [container?.mounted, container?.sillyTavernRunning, starting]);

  // Update activity status every second for real-time display when SillyTavern is running
  useEffect(() => {
    let interval = null;

    if (container?.mounted && container?.sillyTavernRunning && !starting) {
      const updateActivityStatus = () => {
        if (container.lastActivity) {
          const lastActivity = new Date(container.lastActivity);
          const now = new Date();
          const minutesInactive = Math.floor((now - lastActivity) / (1000 * 60));
          const secondsInactive = Math.floor((now - lastActivity) / 1000);

          setActivityStatus({
            minutesInactive,
            secondsInactive,
            lastActivity,
            monitoringActive: container.activityMonitoringActive,
            timeoutMinutes: container.config?.autoUnmountTimeout || 15
          });
        }
      };

      // Update immediately
      updateActivityStatus();

      // Then update every second for real-time display
      interval = setInterval(updateActivityStatus, 1000);
    } else {
      setActivityStatus(null);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [container?.mounted, container?.sillyTavernRunning, container?.lastActivity, container?.config?.autoUnmountTimeout, starting]);

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };


  const loadContainer = async () => {
    try {
      setLoading(true);
      const response = await containerService.getPrimary();
      setContainer(response.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    if (!password) {
      setError('Password required');
      return;
    }

    try {
      setStarting(true);
      setError(null);

      // First mount the container (initial install happens here)
      setStartupStatus('Mounting container...');

      const mountPromise = containerService.mountPrimary(password);
      const timeoutPromise = new Promise(resolve => {
        setTimeout(() => {
          setStartupStatus('SillyTavern is installing...');
          resolve();
        }, 2000);
      });

      // Start both promises, but only wait for the mount to complete
      Promise.race([mountPromise, timeoutPromise]);
      await mountPromise;

      // Then start SillyTavern
      setStartupStatus('Starting SillyTavern...');
      await containerService.startPrimary();


      // Poll for SillyTavern to be ready (no timeout for initial setup)
      setStartupStatus('Waiting for SillyTavern to be ready...');
      let attempts = 0;
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds
        attempts++;

        console.log(`Checking if SillyTavern is ready (attempt ${attempts})...`);
        try {
          const statusResponse = await containerService.getSillyTavernStatus();

          if (statusResponse.data.running) {
            setStartupStatus('SillyTavern accessible, launching...');
            window.open(`http://${window.location.hostname}:8000`, '_blank');
            break;
          }
        } catch (err) {
          console.log('Status check failed:', err.message);
        }

        // Update status message to show we're still waiting after initial attempts
        if (attempts === 15) { // After 30 seconds
          setStartupStatus('SillyTavern is starting (this may take a few minutes on first setup)...');
        } else if (attempts === 60) { // After 2 minutes
          setStartupStatus('Still setting up SillyTavern (initial setup can take several minutes)...');
        }
      }

      loadContainer();
    } catch (err) {
      setError(err.message);
      setStartupStatus('');
    } finally {
      setStarting(false);
      setPassword('');
    }
  };

  const handleStop = async () => {
    try {
      // First stop SillyTavern
      console.log('Stopping SillyTavern...');
      await containerService.stopPrimary();

      // Poll for SillyTavern to actually stop
      console.log('Waiting for SillyTavern to terminate...');
      let attempts = 0;
      const maxAttempts = 10; // 10 seconds max wait
      while (attempts < maxAttempts) {
        // Wait first, then check
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second intervals
        attempts++;

        console.log(`Checking SillyTavern status (attempt ${attempts}/${maxAttempts})...`);
        try {
          const statusResponse = await containerService.getSillyTavernStatus();
          console.log(`SillyTavern running: ${statusResponse.data.running}`);

          if (!statusResponse.data.running) {
            console.log('SillyTavern confirmed stopped');
            break;
          }
        } catch (err) {
          console.log('Status check failed:', err.message);
          // If status check fails, assume it's stopped
          break;
        }
      }

      if (attempts >= maxAttempts) {
        console.warn('SillyTavern may still be running after 10 seconds, proceeding with unmount anyway');
      }

      // Now unmount the container
      console.log('Unmounting container...');
      await containerService.unmountPrimary();

      showNotification('SillyTavern stopped and container unmounted successfully!', 'success');
      loadContainer();
    } catch (err) {
      showNotification(`Error stopping: ${err.message}`, 'error');
      loadContainer(); // Refresh state even on error
    }
    setShowStopConfirm(false);
  };

  const handleLaunch = () => {
    window.open(`http://${window.location.hostname}:8000`, '_blank');
  };

  const handleDelete = async () => {
    if (!deletePassword) {
      showNotification('Password required for deletion', 'error');
      return;
    }

    try {
      await containerService.deletePrimary(deletePassword);
      showNotification('Container deleted successfully', 'success');
      loadContainer();
      setShowDeleteConfirm(false);
      setDeletePassword('');
    } catch (err) {
      if (err.response?.status === 401) {
        showNotification('Invalid password', 'error');
      } else {
        showNotification(`Error deleting container: ${err.message}`, 'error');
      }
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-tyler-blue"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 ${
          notification.type === 'error'
            ? 'bg-red-900 border border-red-700 text-red-100'
            : notification.type === 'success'
            ? 'bg-green-900 border border-green-700 text-green-100'
            : 'bg-blue-900 border border-blue-700 text-blue-100'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-medium text-white mb-4">Delete Container</h3>
            <p className="text-gray-300 mb-4">
              Are you sure you want to permanently delete the container? This action cannot be undone.
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Enter container password to confirm
              </label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tyler-blue focus:border-transparent"
                placeholder="Container password"
                onKeyPress={(e) => e.key === 'Enter' && handleDelete()}
                autoFocus
              />
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleDelete}
                className="btn-danger flex-1"
                disabled={!deletePassword}
              >
                Delete
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletePassword('');
                }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stop Confirmation Modal */}
      {showStopConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-sm mx-4">
            <h3 className="text-lg font-medium text-white mb-4">Stop SillyTavern</h3>
            <p className="text-gray-300 mb-6">
              This will stop SillyTavern and unmount the container. Continue?
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleStop}
                className="btn-stop flex-1 inline-flex items-center justify-center"
              >
                <XCircleIcon className="h-4 w-4 mr-2" />
                Stop
              </button>
              <button
                onClick={() => setShowStopConfirm(false)}
                className="btn-primary flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 bg-red-900 border border-red-700 text-red-100 px-4 py-3 rounded">
          Error: {error}
        </div>
      )}

      {!container || !container.exists ? (
        <SetupWizard onComplete={loadContainer} />
      ) : (
        <div className="max-w-md mx-auto">
          {starting ? (
            <div className="bg-gray-900 overflow-hidden shadow rounded-lg p-6">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tyler-blue mx-auto mb-4"></div>
                <p className="text-white text-lg mb-2">{startupStatus}</p>
                {container.mounted && container.sillyTavernRunning && (
                  <div className="mt-4 space-y-2">
                    <button
                      onClick={handleLaunch}
                      className="btn-primary w-full inline-flex items-center justify-center"
                    >
                      <ArrowTopRightOnSquareIcon className="h-4 w-4 mr-2" />
                      Launch SillyTavern
                    </button>
                    <button
                      onClick={() => setShowStopConfirm(true)}
                      className="btn-stop w-full inline-flex items-center justify-center"
                    >
                      <XCircleIcon className="h-4 w-4 mr-2" />
                      Stop
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : container.mounted && container.sillyTavernRunning ? (
            <div className="bg-gray-900 overflow-hidden shadow rounded-lg p-6">
              <div className="text-center space-y-4">
                <div>
                  <p className="text-green-400 text-lg">SillyTavern is running<AnimatedDots /></p>
                  <ActivityIndicator activityStatus={activityStatus} />
                </div>
                <div className="space-y-3">
                  <button
                    onClick={handleLaunch}
                    className="btn-primary w-full inline-flex items-center justify-center"
                  >
                    <ArrowTopRightOnSquareIcon className="h-4 w-4 mr-2" />
                    Launch SillyTavern
                  </button>
                  <button
                    onClick={() => setShowStopConfirm(true)}
                    className="btn-stop w-full inline-flex items-center justify-center"
                  >
                    <XCircleIcon className="h-4 w-4 mr-2" />
                    Stop
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 overflow-hidden shadow rounded-lg p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Container Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tyler-blue focus:border-transparent"
                    placeholder="Enter password to start"
                    onKeyPress={(e) => e.key === 'Enter' && handleStart()}
                  />
                </div>
                <div className="space-y-3">
                  <button
                    onClick={handleStart}
                    className="btn-primary w-full inline-flex items-center justify-center"
                    disabled={!password}
                  >
                    <PlayIcon className="h-4 w-4 mr-2" />
                    Start
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="btn-danger w-full inline-flex items-center justify-center"
                  >
                    <TrashIcon className="h-4 w-4 mr-2" />
                    Delete Container
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Dashboard;