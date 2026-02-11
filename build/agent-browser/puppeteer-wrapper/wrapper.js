#!/usr/bin/env node
/**
 * Puppeteer HTTP Wrapper
 *
 * HTTP API server for headless browser automation using Puppeteer
 * Designed to be called from OpenClaw agents
 *
 * Environment variables:
 * - PORT: HTTP server port (default: 9222)
 * - WORKSPACE: Directory for artifacts (default: /workspace)
 * - OPENCLAW_WORKSPACE: OpenClaw workspace path for screenshots (default: null)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 9222;
const WORKSPACE = process.env.WORKSPACE || '/workspace';
// OpenClaw workspace para screenshots accesibles desde el gateway
const OPENCLAW_WORKSPACE = process.env.OPENCLAW_WORKSPACE || null;

// Puppeteer browser instance
let browser = null;
let page = null;

/**
 * Launch Puppeteer browser
 */
async function ensureBrowser() {
  if (browser && browser.isConnected()) {
    return;
  }

  console.error('[puppeteer] Launching browser...');
  const puppeteer = require('puppeteer');

  browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  page = await browser.newPage();
  page.setDefaultTimeout(30000);

  console.error('[puppeteer] Browser launched');
}

/**
 * Get page snapshot with element references
 */
async function getSnapshot(interactive = false) {
  if (!page) await ensureBrowser();

  // Get page content and create interactive element references
  const snapshot = await page.evaluate(() => {
    function createSnapshot(element, depth = 0, maxDepth = 50) {
      if (depth > maxDepth) return '';

      let result = '';

      // Get tag name and attributes
      const tagName = element.tagName?.toLowerCase() || 'unknown';
      const id = element.id ? `#${element.id}` : '';
      // Handle className (can be string or DOMTokenList)
      const classList = element.classList ? Array.from(element.classList) : [];
      const classes = classList.length > 0 ? `.${classList.join('.')}` : '';

      // For interactive elements, add ref
      const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', '[onclick]', '[role="button"]'];
      let ref = '';
      if (interactiveTags.includes(tagName) ||
          element.onclick ||
          element.getAttribute('role') === 'button' ||
          element.getAttribute('type') === 'submit') {
        ref = ` [ref=e${element.getAttribute('data-ref') || ''}]`;
      }

      result += '  '.repeat(depth) + `- <${tagName}${id}${classes}>${ref}\n`;

      // Process children
      for (const child of element.children) {
        result += createSnapshot(child, depth + 1, maxDepth);
      }

      return result;
    }

    return createSnapshot(document.body);
  });

  return snapshot;
}

/**
 * Parse snapshot to extract refs
 */
function parseSnapshot(snapshot) {
  const refs = {};
  const lines = snapshot.split('\n');

  for (const line of lines) {
    const refMatch = line.match(/\[ref=e(\d+)\]/);
    if (refMatch) {
      const ref = refMatch[1];
      const elementMatch = line.match(/- <(\w+)/);
      if (elementMatch) {
        refs[`e${ref}`] = {
          element: elementMatch[1],
          line: line.trim()
        };
      }
    }
  }

  return refs;
}

/**
 * HTTP request handler
 */
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check endpoint
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        service: 'puppeteer-http-wrapper',
        browser: browser?.isConnected() || false,
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // Snapshot endpoint
    if (url.pathname === '/snapshot') {
      const interactive = url.searchParams.get('interactive') === 'true';

      const snapshot = await getSnapshot(interactive);
      const refs = parseSnapshot(snapshot);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        snapshot: snapshot,
        refs: refs,
        rawLines: snapshot.split('\n').length
      }));
      return;
    }

    // Click endpoint
    if (url.pathname === '/click' && req.method === 'POST') {
      const body = await parseBody(req);
      const selector = body.selector || body.ref;

      if (!selector) {
        throw new Error('selector or ref is required');
      }

      await ensureBrowser();
      await page.click(selector);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Fill endpoint
    if (url.pathname === '/fill' && req.method === 'POST') {
      const body = await parseBody(req);
      const selector = body.selector || body.ref;
      const text = body.text;

      if (!selector || !text) {
        throw new Error('selector/ref and text are required');
      }

      await ensureBrowser();
      await page.type(selector, text);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Get text endpoint
    if (url.pathname === '/get-text') {
      const body = req.method === 'POST' ? await parseBody(req) : Object.fromEntries(url.searchParams);
      const selector = body.selector || body.ref;

      if (!selector) {
        throw new Error('selector or ref is required');
      }

      await ensureBrowser();
      const text = await page.$eval(selector, el => el.textContent?.trim() || '');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        text: text
      }));
      return;
    }

    // Screenshot endpoint
    if (url.pathname === '/screenshot' && req.method === 'POST') {
      const body = await parseBody(req);
      const filename = body.filename || `screenshot-${Date.now()}.png`;
      const full = body.full || false;

      await ensureBrowser();

      // Usar OpenClaw workspace si está disponible, si no usar el workspace por defecto
      const targetWorkspace = OPENCLAW_WORKSPACE || WORKSPACE;
      const screenshotsDir = path.join(targetWorkspace, 'screenshots');

      // Crear directorio de screenshots si no existe
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }

      const screenshotPath = path.join(screenshotsDir, filename);
      await page.screenshot({
        path: screenshotPath,
        fullPage: full
      });

      const screenshotExists = fs.existsSync(screenshotPath);
      const screenshotBase64 = screenshotExists ? fs.readFileSync(screenshotPath, 'base64') : null;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: screenshotExists,
        path: screenshotExists ? screenshotPath : null,
        base64: screenshotBase64
      }));
      return;
    }

    // Open endpoint
    if (url.pathname === '/open' && req.method === 'POST') {
      const body = await parseBody(req);
      const url_target = body.url;

      if (!url_target) {
        throw new Error('url is required');
      }

      await ensureBrowser();
      await page.goto(url_target, { waitUntil: 'networkidle2', timeout: 30000 });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Close endpoint
    if (url.pathname === '/close' && req.method === 'POST') {
      if (browser) {
        await browser.close();
        browser = null;
        page = null;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // Generic exec endpoint
    if (url.pathname === '/exec' && req.method === 'POST') {
      const body = await parseBody(req);
      const command = body.command;

      if (!command) {
        throw new Error('command is required');
      }

      await ensureBrowser();
      const result = await page.evaluate(command);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        result: JSON.stringify(result)
      }));
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: 'Not found',
      availableEndpoints: [
        'GET /health',
        'GET /snapshot',
        'POST /click',
        'POST /fill',
        'GET /get-text',
        'POST /screenshot',
        'POST /open',
        'POST /close',
        'POST /exec'
      ]
    }));

  } catch (error) {
    console.error('[puppeteer] Error:', error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}

/**
 * Parse JSON body from request
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Create server
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`[puppeteer] HTTP wrapper listening on port ${PORT}`);
  console.log(`[puppeteer] Workspace: ${WORKSPACE}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});
