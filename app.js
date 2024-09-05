const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON body
app.use(express.json());

// POST endpoint for scraping the website and capturing the captcha screenshot
app.post('/verify', async (req, res) => {
  const { BirthDate, UBRN } = req.body;

  // Validate input
  if (!BirthDate || !UBRN || !/^\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$/.test(BirthDate) || !/^\d{17}$/.test(UBRN)) {
    return res.status(400).send('Invalid input format');
  }

  try {
    // Launch Puppeteer browser with --no-sandbox and new headless mode
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Go to the website
    await page.goto('https://everify.bdris.gov.bd', { waitUntil: 'networkidle2' });

    // Fill the form
    await page.type('#BirthDate', BirthDate);  // Enter BirthDate
    await page.type('#ubrn', UBRN);            // Enter UBRN

    // Wait for the Captcha image to be visible
    await page.waitForSelector('#CaptchaImage');

    // Select the element for the captcha image
    const captchaElement = await page.$('#CaptchaImage');

    // Take a screenshot of the captcha element only
    const screenshot = await captchaElement.screenshot({ encoding: 'base64' });

    // Close the browser
    await browser.close();

    // Send the screenshot with the appropriate MIME type (base64 with data URL format)
    res.status(200).json({
      image: `data:image/png;base64,${screenshot}`
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Something went wrong while processing your request.');
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
