import { test, expect } from '@playwright/test';

test.describe('Haven Player UI Bug Review', () => {
  
  test('Check index.html for common UI issues', async ({ page }) => {
    // Load the HTML file directly
    await page.goto('file:///home/dev/workspace/haven-player/frontend/dist/index.html', {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });
    
    await page.waitForTimeout(2000);
    
    // Take screenshot
    await page.screenshot({ 
      path: '/home/dev/workspace/haven-player/docs/bugs/screenshots/app-overview.png',
      fullPage: true 
    });
    
    // Check for root element
    const rootExists = await page.locator('#root').count() > 0;
    console.log('Root element exists:', rootExists);
    
    // Get body background color
    const bodyStyles = await page.evaluate(() => {
      const body = document.body;
      const computed = window.getComputedStyle(body);
      return {
        backgroundColor: computed.backgroundColor,
        color: computed.color,
      };
    });
    console.log('Body styles:', bodyStyles);
  });

  test('Analyze built HTML and JS for UI patterns', async ({ page }) => {
    await page.goto('file:///home/dev/workspace/haven-player/frontend/dist/index.html', {
      waitUntil: 'domcontentloaded',
      timeout: 10000
    });
    
    await page.waitForTimeout(2000);
    
    // Check all computed styles that might affect text visibility
    const styleAnalysis = await page.evaluate(() => {
      const results: Array<{
        selector: string;
        text: string;
        color: string;
        bgColor: string;
        fontSize: string;
        opacity: string;
        hasIssue: boolean;
        issueType: string;
      }> = [];
      
      // Get all elements with text content
      const allElements = document.querySelectorAll('*');
      
      allElements.forEach((el, idx) => {
        const text = el.textContent?.trim();
        if (!text || text.length === 0 || text.length > 100) return;
        
        const computed = window.getComputedStyle(el);
        const color = computed.color;
        const bgColor = computed.backgroundColor;
        const fontSize = computed.fontSize;
        const opacity = computed.opacity;
        
        // Parse RGB values
        const colorMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        const bgMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        
        let hasIssue = false;
        let issueType = '';
        
        // Check for white text (potential visibility issue on light bg)
        if (colorMatch) {
          const [, r, g, b] = colorMatch.map(Number);
          const isWhiteOrLight = r > 200 && g > 200 && b > 200;
          
          if (isWhiteOrLight) {
            // Check if parent has white/light background
            const parent = el.parentElement;
            if (parent) {
              const parentBg = window.getComputedStyle(parent).backgroundColor;
              const parentBgMatch = parentBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
              if (parentBgMatch) {
                const [, pr, pg, pb] = parentBgMatch.map(Number);
                if (pr > 200 && pg > 200 && pb > 200) {
                  hasIssue = true;
                  issueType = 'White text on light background';
                }
              }
            }
          }
        }
        
        // Check for very small text
        if (parseFloat(fontSize) < 10) {
          hasIssue = true;
          issueType = issueType || 'Very small text';
        }
        
        // Check for low opacity
        if (parseFloat(opacity) < 0.5 && parseFloat(opacity) > 0) {
          hasIssue = true;
          issueType = issueType || 'Low opacity element';
        }
        
        if (hasIssue || results.length < 50) {
          results.push({
            selector: el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
            text: text.substring(0, 50),
            color,
            bgColor,
            fontSize,
            opacity,
            hasIssue,
            issueType
          });
        }
      });
      
      return results;
    });
    
    // Filter only issues and log them
    const issues = styleAnalysis.filter(item => item.hasIssue);
    console.log('Potential UI issues found:', issues.length);
    console.log(JSON.stringify(issues.slice(0, 20), null, 2));
    
    // Write full analysis to file
    const fs = require('fs');
    fs.writeFileSync(
      '/home/dev/workspace/haven-player/docs/bugs/style-analysis.json',
      JSON.stringify(styleAnalysis, null, 2)
    );
  });

  test('Check for Material UI specific styling issues', async ({ page }) => {
    await page.goto('file:///home/dev/workspace/haven-player/frontend/dist/index.html', {
      waitUntil: 'domcontentloaded', 
      timeout: 10000
    });
    
    await page.waitForTimeout(2000);
    
    // Check for MUI-specific classes and their styling
    const muiAnalysis = await page.evaluate(() => {
      const muiElements = document.querySelectorAll('[class*="Mui"]');
      const analysis: Array<{
        className: string;
        text?: string;
        color: string;
        backgroundColor: string;
        contrastRatio: number;
      }> = [];
      
      muiElements.forEach(el => {
        const computed = window.getComputedStyle(el);
        const color = computed.color;
        const bg = computed.backgroundColor;
        
        // Calculate relative luminance
        const getLuminance = (r: number, g: number, b: number) => {
          const [rs, gs, bs] = [r, g, b].map(c => {
            c = c / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        };
        
        const colorMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        const bgMatch = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        
        let contrastRatio = 0;
        if (colorMatch && bgMatch) {
          const l1 = getLuminance(Number(colorMatch[1]), Number(colorMatch[2]), Number(colorMatch[3]));
          const l2 = getLuminance(Number(bgMatch[1]), Number(bgMatch[2]), Number(bgMatch[3]));
          contrastRatio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        }
        
        analysis.push({
          className: el.className.split(' ').find(c => c.includes('Mui')) || '',
          text: el.textContent?.trim().substring(0, 30),
          color,
          backgroundColor: bg,
          contrastRatio: Math.round(contrastRatio * 100) / 100
        });
      });
      
      return analysis;
    });
    
    // Find elements with poor contrast
    const poorContrast = muiAnalysis.filter(el => el.contrastRatio > 0 && el.contrastRatio < 4.5);
    console.log('Elements with poor contrast (< 4.5):', poorContrast.length);
    console.log(JSON.stringify(poorContrast.slice(0, 20), null, 2));
    
    // Write MUI analysis
    const fs = require('fs');
    fs.writeFileSync(
      '/home/dev/workspace/haven-player/docs/bugs/mui-analysis.json',
      JSON.stringify(muiAnalysis, null, 2)
    );
  });
});
