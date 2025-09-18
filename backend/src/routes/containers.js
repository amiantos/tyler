const express = require('express');
const router = express.Router();
const containerService = require('../services/container');

// Primary container routes (simplified UX)
router.get('/primary', async (req, res) => {
  try {
    const container = await containerService.getPrimaryContainer();
    res.json(container);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/primary/create', async (req, res) => {
  try {
    const { password, size } = req.body;

    if (!password || !size) {
      return res.status(400).json({ error: 'Missing required fields: password, size' });
    }

    const result = await containerService.createContainer('primary', password, size);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/primary/mount', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    const result = await containerService.mountContainer('primary', password);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/primary/unmount', async (req, res) => {
  try {
    const result = await containerService.unmountContainer('primary');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/primary/start', async (req, res) => {
  try {
    const result = await containerService.startApplications('primary');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/primary/stop', async (req, res) => {
  try {
    const result = await containerService.stopApplications('primary');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/primary/verify-password', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    const result = await containerService.verifyContainerPassword('primary', password);
    res.json({ valid: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/primary', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required for deletion' });
    }

    // Verify password before deletion
    const isValidPassword = await containerService.verifyContainerPassword('primary', password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const result = await containerService.deleteContainer('primary');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/primary/sillytavern-status', async (req, res) => {
  try {
    const isRunning = await containerService.isSillyTavernRunning();
    res.json({ running: isRunning });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



module.exports = router;