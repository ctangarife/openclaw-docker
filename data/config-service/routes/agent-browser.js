/**
 * Agent Browser Configuration Routes
 * Simplificado con middleware para evitar conflictos de rutas
 */

const express = require("express");
const router = express.Router();

const mongoose = require("mongoose");

// Schema for configuration storage
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true, collection: "agent_browser_config" });

const AgentBrowserConfig = mongoose.model("AgentBrowserConfig", schema);

// Default configuration
const DEFAULT_CONFIG = {
  AGENT_BROWSER_URL: "http://agent-browser:9222",
  enabled: true,
  maxConcurrentSessions: 5,
  sessionTimeout: 30,
  defaultScreenshot: {
    onNavigation: true,
    format: "png",
    quality: 90,
    fullPage: false
  }
};

/**
 * GET /api/agent-browser
 * Returns current agent-browser configuration
 */
router.get("/", async (req, res) => {
  try {
    const docs = await AgentBrowserConfig.find().lean();
    const config = {};
    Object.assign(config, DEFAULT_CONFIG);

    // Override with stored values
    docs.forEach((d) => {
      config[d.key] = d.value;
    });

    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PUT /api/agent-browser
 * Updates agent-browser configuration
 */
router.put("/", async (req, res) => {
  try {
    const body = req.body;

    if (typeof body !== "object" || body === null) {
      return res.status(400).json({ error: "JSON object required" });
    }

    const allowedKeys = [
      "AGENT_BROWSER_URL",
      "enabled",
      "maxConcurrentSessions",
      "sessionTimeout",
      "defaultScreenshot"
    ];

    // Validate AGENT_BROWSER_URL
    if (body.AGENT_BROWSER_URL !== undefined) {
      if (typeof body.AGENT_BROWSER_URL !== "string") {
        return res.status(400).json({ error: "AGENT_BROWSER_URL must be a string" });
      }
    }

    // Validate enabled
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }
    }

    // Validate maxConcurrentSessions
    if (body.maxConcurrentSessions !== undefined) {
      if (typeof body.maxConcurrentSessions !== "number" || body.maxConcurrentSessions < 1 || body.maxConcurrentSessions > 50) {
        return res.status(400).json({ error: "maxConcurrentSessions must be a number between 1 and 50" });
      }
    }

    // Validate sessionTimeout
    if (body.sessionTimeout !== undefined) {
      if (typeof body.sessionTimeout !== "number" || body.sessionTimeout < 0) {
        return res.status(400).json({ error: "sessionTimeout must be a non-negative number" });
      }
    }

    // Validate defaultScreenshot
    if (body.defaultScreenshot !== undefined) {
      if (typeof body.defaultScreenshot !== "object" || body.defaultScreenshot === null) {
        return res.status(400).json({ error: "defaultScreenshot must be an object" });
      }

      if (body.defaultScreenshot.onNavigation !== undefined && typeof body.defaultScreenshot.onNavigation !== "boolean") {
        return res.status(400).json({ error: "defaultScreenshot.onNavigation must be a boolean" });
      }

      if (body.defaultScreenshot.format !== undefined) {
        if (typeof body.defaultScreenshot.format !== "string" || !["png", "jpeg"].includes(body.defaultScreenshot.format)) {
          return res.status(400).json({ error: "defaultScreenshot.format must be 'png' or 'jpeg'" });
        }
      }

      if (body.defaultScreenshot.quality !== undefined) {
        if (typeof body.defaultScreenshot.quality !== "number" || body.defaultScreenshot.quality < 1 || body.defaultScreenshot.quality > 100) {
          return res.status(400).json({ error: "defaultScreenshot.quality must be a number between 1 and 100" });
        }
      }

      if (body.defaultScreenshot.fullPage !== undefined && typeof body.defaultScreenshot.fullPage !== "boolean") {
        return res.status(400).json({ error: "defaultScreenshot.fullPage must be a boolean" });
      }
    }

    // Update configuration - store each top-level key separately
    for (const [key, value] of Object.entries(body)) {
      if (allowedKeys.includes(key)) {
        await AgentBrowserConfig.findOneAndUpdate(
          { key },
          { $set: { value, updatedAt: new Date() } },
          { upsert: true, new: true }
        );
      }
    }

    // Return updated configuration
    const docs = await AgentBrowserConfig.find().lean();
    const config = {};
    Object.assign(config, DEFAULT_CONFIG);
    docs.forEach((d) => {
      config[d.key] = d.value;
    });

    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /api/agent-browser/reset
 * Resets configuration to defaults
 */
router.post("/reset", async (req, res) => {
  try {
    // Delete all existing configuration
    await AgentBrowserConfig.deleteMany({});

    // Return default configuration
    res.json(DEFAULT_CONFIG);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;