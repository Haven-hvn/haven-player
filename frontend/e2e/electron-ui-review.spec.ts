import { test, expect, ElectronApplication, Page, _electron as electron } from '@playwright/test';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Store electron app instance
let electronApp: ElectronApplication;

test.describe('Haven Player Electron UI Bug Review', () => {
  
  test.beforeAll(async () => {
    // Launch the Electron app
    electronApp = await electron.launch({
      args: ['.'],
      cwd: '/home/dev/workspace/haven-player/frontend',
      env: {
        ...process.env,
        NODE_ENV: 'development',
      },
      timeout: 120000,
    });
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  async function takeScreenshot(page: Page, name: string) {
    await page.screenshot({
      path: `/home/dev/workspace/haven-player/docs/bugs/screenshots/${name}.png`,
      fullPage: false
    });
  }

  async function analyzePageColors(page: Page) {
    return await page.evaluate(() => {
      const issues: Array<{
        text: string;
        color: string;
        backgroundColor: string;
        computedBg: string;
        element: string;
        reason: string;
        contrastIssue: boolean;
      }> = [];

      // Get all visible elements with text
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        null,
        false
      );

      const elements: Element[] = [];
      let node;
      while (node = walker.nextNode()) {
        elements.push(node as Element);
      }

      elements.forEach(el => {
        const text = el.textContent?.trim();
        const rect = el.getBoundingClientRect();
        
        // Skip hidden elements
        if (!text || text.length === 0 || rect.width === 0 || rect.height === 0) return;
        
        const computed = window.getComputedStyle(el);
        const color = computed.color;
        const bg = computed.backgroundColor;
        
        // Find actual background by walking up the tree
        let computedBg = bg;
        let parent = el.parentElement;
        while ((!computedBg || computedBg === 'rgba(0, 0, 0, 0)') && parent) {
          const parentBg = window.getComputedStyle(parent).backgroundColor;
          if (parentBg && parentBg !== 'rgba(0, 0, 0, 0)') {
            computedBg = parentBg;
            break;
          }
          parent = parent.parentElement;
        }
        
        // Parse RGB values
        const colorMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        const bgMatch = computedBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        
        let reason = '';
        let contrastIssue = false;
        
        if (colorMatch && bgMatch) {
          const [, r, g, b] = colorMatch.map(Number);
          const [, br, bgVal, bb] = bgMatch.map(Number);
          
          // Check for white text on white/light background
          const isWhiteText = r > 240 && g > 240 && b > 240;
          const isLightBg = br > 240 && bgVal > 240 && bb > 240;
          
          if (isWhiteText && isLightBg) {
            reason = 'White text on white/light background';
            contrastIssue = true;
          }
          
          // Check for black text on dark background
          const isBlackText = r < 30 && g < 30 && b < 30;
          const isDarkBg = br < 50 && bgVal < 50 && bb < 50;
          
          if (isBlackText && isDarkBg) {
            reason = 'Black text on dark background';
            contrastIssue = true;
          }
          
          // Check for very low contrast (simplified luminance check)
          const textLum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
          const bgLum = (br * 0.299 + bgVal * 0.587 + bb * 0.114) / 255;
          const contrast = Math.abs(textLum - bgLum);
          
          if (contrast < 0.3 && !reason) {
            reason = `Low contrast (${contrast.toFixed(2)})`;
            contrastIssue = true;
          }
        }
        
        // Check for very small font
        const fontSize = parseFloat(computed.fontSize);
        if (fontSize < 10) {
          reason = reason || 'Very small font size';
        }
        
        // Check for low opacity
        const opacity = parseFloat(computed.opacity);
        if (opacity < 0.4 && opacity > 0) {
          reason = reason || `Low opacity (${opacity})`;
        }
        
        if (reason || contrastIssue) {
          issues.push({
            text: text.substring(0, 60),
            color,
            backgroundColor: bg,
            computedBg,
            element: el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ').slice(0, 2).join('.') : ''),
            reason,
            contrastIssue
          });
        }
      });

      return issues;
    });
  }

  test('Dashboard - Main view screenshot and analysis', async () => {
    const page = await electronApp.firstWindow();
    await page.waitForTimeout(3000);
    
    await takeScreenshot(page, '01-dashboard-main');
    
    // Analyze colors
    const colorIssues = await analyzePageColors(page);
    console.log('Dashboard color issues:', JSON.stringify(colorIssues.slice(0, 20), null, 2));
    
    // Save analysis
    const fs = require('fs');
    fs.writeFileSync(
      '/home/dev/workspace/haven-player/docs/bugs/dashboard-issues.json',
      JSON.stringify(colorIssues, null, 2)
    );
  });

  test('Navigate to Archive view', async () => {
    const page = await electronApp.firstWindow();
    await page.waitForTimeout(2000);
    
    // Click on Archive link
    const archiveLink = page.locator('text=Archive').first();
    if (await archiveLink.isVisible().catch(() => false)) {
      await archiveLink.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '02-archive-view');
      
      const colorIssues = await analyzePageColors(page);
      const fs = require('fs');
      fs.writeFileSync(
        '/home/dev/workspace/haven-player/docs/bugs/archive-issues.json',
        JSON.stringify(colorIssues, null, 2)
      );
    }
  });

  test('Navigate to Plugins view', async () => {
    const page = await electronApp.firstWindow();
    await page.waitForTimeout(2000);
    
    const pluginsLink = page.locator('text=Plugins').first();
    if (await pluginsLink.isVisible().catch(() => false)) {
      await pluginsLink.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '03-plugins-view');
      
      const colorIssues = await analyzePageColors(page);
      const fs = require('fs');
      fs.writeFileSync(
        '/home/dev/workspace/haven-player/docs/bugs/plugins-issues.json',
        JSON.stringify(colorIssues, null, 2)
      );
    }
  });

  test('Navigate to DePin Node view', async () => {
    const page = await electronApp.firstWindow();
    await page.waitForTimeout(2000);
    
    const depinLink = page.locator('text=DePin Node').first();
    if (await depinLink.isVisible().catch(() => false)) {
      await depinLink.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '04-depin-view');
      
      const colorIssues = await analyzePageColors(page);
      const fs = require('fs');
      fs.writeFileSync(
        '/home/dev/workspace/haven-player/docs/bugs/depin-issues.json',
        JSON.stringify(colorIssues, null, 2)
      );
    }
  });

  test('Navigate to My Videos view', async () => {
    const page = await electronApp.firstWindow();
    await page.waitForTimeout(2000);
    
    const myVideosLink = page.locator('text=My Videos').first();
    if (await myVideosLink.isVisible().catch(() => false)) {
      await myVideosLink.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '05-my-videos-view');
      
      const colorIssues = await analyzePageColors(page);
      const fs = require('fs');
      fs.writeFileSync(
        '/home/dev/workspace/haven-player/docs/bugs/my-videos-issues.json',
        JSON.stringify(colorIssues, null, 2)
      );
    }
  });

  test('Open Settings modal', async () => {
    const page = await electronApp.firstWindow();
    await page.waitForTimeout(2000);
    
    const settingsLink = page.locator('text=Settings').first();
    if (await settingsLink.isVisible().catch(() => false)) {
      await settingsLink.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '06-settings-modal');
      
      const colorIssues = await analyzePageColors(page);
      const fs = require('fs');
      fs.writeFileSync(
        '/home/dev/workspace/haven-player/docs/bugs/settings-issues.json',
        JSON.stringify(colorIssues, null, 2)
      );
      
      // Close modal by pressing Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('Check for console errors', async () => {
    const page = await electronApp.firstWindow();
    
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Navigate through pages to collect errors
    await page.waitForTimeout(2000);
    
    const links = ['Archive', 'Plugins', 'DePin Node', 'Dashboard'];
    for (const linkText of links) {
      const link = page.locator(`text=${linkText}`).first();
      if (await link.isVisible().catch(() => false)) {
        await link.click();
        await page.waitForTimeout(1000);
      }
    }
    
    const fs = require('fs');
    fs.writeFileSync(
      '/home/dev/workspace/haven-player/docs/bugs/console-errors.json',
      JSON.stringify(consoleErrors, null, 2)
    );
  });
});
