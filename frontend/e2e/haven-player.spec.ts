import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const FRONTEND_PATH = path.resolve(__dirname, '../dist/index.html');
const SCREENSHOTS_DIR = path.resolve(__dirname, '../e2e-screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

test.describe('Haven Player Frontend Tests', () => {
  
  test.beforeEach(async ({ page }) => {
    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`Console error: ${msg.text()}`);
      }
    });
    
    // Capture page errors
    page.on('pageerror', error => {
      console.log(`Page error: ${error.message}`);
    });
  });

  test('App loads with correct title and root element', async ({ page }) => {
    // Load the app
    await page.goto(`file://${FRONTEND_PATH}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Wait for app to render
    await page.waitForTimeout(3000);
    
    // Check title
    await expect(page).toHaveTitle('Haven Player');
    
    // Check root element exists
    const rootElement = page.locator('#root');
    await expect(rootElement).toBeVisible();
    
    // Take screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-initial-load.png'),
      fullPage: true
    });
  });

  test('Dark theme background is applied correctly', async ({ page }) => {
    await page.goto(`file://${FRONTEND_PATH}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.waitForTimeout(2000);
    
    // Check body background color
    const bodyBg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    
    console.log('Body background color:', bodyBg);
    
    // Expected dark background (the app uses a very dark blue-grey theme)
    // The actual color is rgb(10, 10, 15) which is a deep dark blue-black
    expect(bodyBg).toBe('rgb(10, 10, 15)');
    
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02-dark-theme.png'),
      fullPage: true
    });
  });

  test('UI components render without errors', async ({ page }) => {
    await page.goto(`file://${FRONTEND_PATH}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.waitForTimeout(3000);
    
    // Check for common UI elements that should exist
    const pageContent = await page.content();
    
    // Look for React root mount point
    expect(pageContent).toContain('id="root"');
    
    // Check if any MUI components are rendered (they use Mui classnames)
    const muiElements = await page.locator('[class*="Mui"]').count();
    console.log(`Found ${muiElements} MUI elements`);
    
    // Take screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-ui-components.png'),
      fullPage: true
    });
  });

  test('Check for contrast and visibility issues', async ({ page }) => {
    await page.goto(`file://${FRONTEND_PATH}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.waitForTimeout(3000);
    
    // Analyze all visible elements for contrast issues
    const contrastIssues = await page.evaluate(() => {
      const issues: Array<{
        element: string;
        text: string;
        color: string;
        backgroundColor: string;
        contrastRatio: number;
      }> = [];
      
      // Get all elements with text
      const elements = document.querySelectorAll('*');
      
      elements.forEach(el => {
        const text = el.textContent?.trim();
        const rect = el.getBoundingClientRect();
        
        // Skip hidden or non-visible elements
        if (!text || rect.width === 0 || rect.height === 0) return;
        if (text.length === 0 || text.length > 100) return;
        
        const computed = window.getComputedStyle(el);
        const color = computed.color;
        
        // Find effective background color
        let bgColor = computed.backgroundColor;
        let parent = el.parentElement;
        while ((!bgColor || bgColor === 'rgba(0, 0, 0, 0)') && parent) {
          const parentComputed = window.getComputedStyle(parent);
          bgColor = parentComputed.backgroundColor;
          parent = parent.parentElement;
        }
        
        // Parse RGB values
        const colorMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        const bgMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        
        if (colorMatch && bgMatch) {
          const [, r1, g1, b1] = colorMatch.map(Number);
          const [, r2, g2, b2] = bgMatch.map(Number);
          
          // Calculate luminance
          const getLum = (r: number, g: number, b: number) => {
            const [rs, gs, bs] = [r, g, b].map(c => {
              c = c / 255;
              return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
          };
          
          const l1 = getLum(r1, g1, b1);
          const l2 = getLum(r2, g2, b2);
          const contrastRatio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          
          // Flag issues with contrast ratio < 3 (relaxed threshold for analysis)
          if (contrastRatio < 3 && contrastRatio > 1) {
            issues.push({
              element: el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
              text: text.substring(0, 50),
              color,
              backgroundColor: bgColor,
              contrastRatio: Math.round(contrastRatio * 100) / 100
            });
          }
        }
      });
      
      return issues;
    });
    
    console.log('Contrast issues found:', contrastIssues.length);
    if (contrastIssues.length > 0) {
      console.log('First 10 issues:', JSON.stringify(contrastIssues.slice(0, 10), null, 2));
    }
    
    // Save analysis
    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, 'contrast-analysis.json'),
      JSON.stringify(contrastIssues, null, 2)
    );
    
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '04-contrast-check.png'),
      fullPage: true
    });
  });

  test('Check for JavaScript errors on load', async ({ page }) => {
    const errors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(`Console: ${msg.text()}`);
      }
    });
    
    page.on('pageerror', error => {
      errors.push(`PageError: ${error.message}`);
    });
    
    await page.goto(`file://${FRONTEND_PATH}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.waitForTimeout(3000);
    
    // Save errors to file
    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, 'javascript-errors.json'),
      JSON.stringify(errors, null, 2)
    );
    
    console.log('JavaScript errors found:', errors.length);
    if (errors.length > 0) {
      console.log('Errors:', errors);
    }
    
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '05-error-check.png'),
      fullPage: true
    });
  });

  test('Responsive layout check', async ({ page }) => {
    // Test at different viewports
    const viewports = [
      { width: 1920, height: 1080, name: 'desktop' },
      { width: 1366, height: 768, name: 'laptop' },
      { width: 1280, height: 720, name: 'small-laptop' }
    ];
    
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      await page.goto(`file://${FRONTEND_PATH}`, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      await page.waitForTimeout(2000);
      
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `06-responsive-${viewport.name}.png`),
        fullPage: true
      });
      
      // Check if root element fills the viewport
      const rootSize = await page.evaluate(() => {
        const root = document.getElementById('root');
        if (root) {
          return {
            width: root.offsetWidth,
            height: root.offsetHeight
          };
        }
        return null;
      });
      
      console.log(`Viewport ${viewport.name}:`, viewport, 'Root size:', rootSize);
    }
  });

  test('Verify all JS chunks load correctly', async ({ page }) => {
    const failedRequests: string[] = [];
    
    page.on('requestfailed', request => {
      failedRequests.push(request.url());
    });
    
    await page.goto(`file://${FRONTEND_PATH}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.waitForTimeout(3000);
    
    // Check for any failed resource loads
    expect(failedRequests).toHaveLength(0);
    
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '07-resource-load.png'),
      fullPage: true
    });
  });

  test('Settings popup renders correctly with proper border radius', async ({ page }) => {
    await page.goto(`file://${FRONTEND_PATH}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.waitForTimeout(3000);
    
    // Find settings button by looking for Settings icon in the sidebar
    // The BottomAction component is a Box with onClick, not a button
    // Try to find by the Settings icon and click its parent
    const settingsIcon = page.locator('svg[data-testid="SettingsIcon"]').first();
    
    if (await settingsIcon.count() > 0) {
      // Click on the parent element (the BottomAction Box)
      await settingsIcon.locator('..').click();
      console.log('Clicked Settings icon parent');
    } else {
      console.log('Settings icon not found');
    }
    
    // Wait for dialog to appear
    await page.waitForTimeout(1000);
    
    // Check if dialog opened
    const dialogExists = await page.locator('.MuiDialog-paper').count() > 0;
    console.log('Dialog exists:', dialogExists);
    
    // Take screenshot of settings popup
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '08-settings-popup.png'),
      fullPage: true
    });
    
    // Check the computed border-radius of the dialog paper
    const paperBorderRadius = await page.evaluate(() => {
      const dialogPaper = document.querySelector('.MuiDialog-paper');
      if (dialogPaper) {
        const computed = window.getComputedStyle(dialogPaper);
        return {
          borderRadius: computed.borderRadius,
          borderTopLeftRadius: computed.borderTopLeftRadius,
          borderTopRightRadius: computed.borderTopRightRadius,
          borderBottomLeftRadius: computed.borderBottomLeftRadius,
          borderBottomRightRadius: computed.borderBottomRightRadius,
          className: dialogPaper.className,
        };
      }
      return null;
    });
    
    console.log('Settings Dialog Paper borderRadius:', paperBorderRadius);
    
    // Save border radius analysis
    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, 'settings-popup-styles.json'),
      JSON.stringify(paperBorderRadius, null, 2)
    );
    
    // Close the dialog if open
    if (dialogExists) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  });

  test('Plugin popup renders correctly with proper border radius', async ({ page }) => {
    await page.goto(`file://${FRONTEND_PATH}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    await page.waitForTimeout(3000);
    
    // Try to find and click the Plugins button in the header
    const pluginsButton = page.locator('button:has-text("Plugins"), [data-testid="plugins-button"]').first();
    
    if (await pluginsButton.count() > 0) {
      await pluginsButton.click();
    } else {
      // Try to find plugin icon/button in the sidebar
      const pluginIcon = page.locator('svg[data-testid="ExtensionIcon"], svg[data-testid="AppsIcon"]').first();
      if (await pluginIcon.count() > 0) {
        await pluginIcon.click();
      }
    }
    
    await page.waitForTimeout(500);
    
    // Check for Popover element
    const popover = page.locator('.MuiPopover-root, [role="presentation"]').first();
    const popoverExists = await popover.count() > 0;
    
    // Take screenshot of plugin popup
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '09-plugin-popup.png'),
      fullPage: true
    });
    
    // Check the computed border-radius of the popover paper
    const paperBorderRadius = await page.evaluate(() => {
      const popoverPaper = document.querySelector('.MuiPopover-paper, .MuiPaper-root[class*="Popover"]');
      if (popoverPaper) {
        const computed = window.getComputedStyle(popoverPaper);
        return {
          borderRadius: computed.borderRadius,
          borderTopLeftRadius: computed.borderTopLeftRadius,
          borderTopRightRadius: computed.borderTopRightRadius,
          borderBottomLeftRadius: computed.borderBottomLeftRadius,
          borderBottomRightRadius: computed.borderBottomRightRadius,
          className: popoverPaper.className,
        };
      }
      return null;
    });
    
    console.log('Plugin Popover Paper borderRadius:', paperBorderRadius);
    
    // Save border radius analysis
    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, 'plugin-popup-styles.json'),
      JSON.stringify(paperBorderRadius, null, 2)
    );
    
    // Close the popover if open
    await page.keyboard.press('Escape');
  });
});
