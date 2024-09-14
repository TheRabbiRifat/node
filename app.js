const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/check-json', (req, res) => {
    res.json({
        status: "success",
        message: "NodeJS get info app is running!"
    });
});

// Middleware to parse JSON body
app.use(express.json({ limit: '50mb' }));  // Increase limit for handling large payloads

// POST endpoint for scraping the website, handling cookies, hidden values, and form submission
app.post('/submit', async (req, res) => {
    const { hiddenFields, cookies, BirthDate, UBRN, CaptchaInputText } = req.body;

    // Validate input
    if (!hiddenFields || !cookies || !BirthDate || !UBRN || !CaptchaInputText) {
        return res.status(400).send('Hidden fields, cookies, BirthDate, UBRN, and CaptchaInputText are required');
    }

    try {
        // Launch the browser
        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Go to the target website
        await page.goto('https://everify.bdris.gov.bd', { waitUntil: 'networkidle2' });

        // Set cookies for the target page
        await page.setCookie(...cookies);

        // Wait for the form elements to load
        await page.waitForSelector('#BirthDate');
        await page.waitForSelector('#CaptchaInputText');
        await page.waitForSelector('#ubrn');

        // Set hidden fields using the provided hiddenFields data
        await page.evaluate((hiddenFields) => {
            hiddenFields.forEach(field => {
                const input = document.querySelector(`input[name="${field.name}"]`);
                if (input) {
                    input.value = field.value;
                }
            });
        }, hiddenFields);

        // Type the date of birth first and press Enter twice
        await page.type('#BirthDate', BirthDate);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');

        // Fill in the other fields (UBRN and Captcha)
        await page.type('#ubrn', UBRN);
        await page.type('#CaptchaInputText', CaptchaInputText);

        // Submit the form by pressing Enter
        await page.keyboard.press('Enter');
        await page.waitForNavigation();

        // Scrape the data and convert it to JSON
        const data = await page.evaluate(() => {
            // Define toTitleCase function inside page.evaluate
            const toTitleCase = (text) => {
                return text.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            };

            const convertDateToDDMMYYYY = (dateStr) => {
                const months = {
                    'january': '01',
                    'february': '02',
                    'march': '03',
                    'april': '04',
                    'may': '05',
                    'june': '06',
                    'july': '07',
                    'august': '08',
                    'september': '09',
                    'october': '10',
                    'november': '11',
                    'december': '12'
                };

                const cleanedDateStr = dateStr.replace(/\s+/g, ' ').trim().toLowerCase();
                const [day, monthName, year] = cleanedDateStr.split(' ');
                const month = months[monthName];

                if (!month) {
                    console.error('Month not found in mapping:', monthName);
                    return `${day}/undefined/${year}`;
                }

                return `${day.padStart(2, '0')}/${month}/${year}`;
            };

            const getTextOrEmpty = (element) => {
                return element ? element.innerText.trim() : '';
            };

            const data = {};
            const tables = document.querySelectorAll('table.table-hover');

            if (tables.length >= 2) {
                const rows1 = tables[0].querySelectorAll('tr');
                data['reg_date'] = convertDateToDDMMYYYY(getTextOrEmpty(rows1[2].cells[0]));
                data['reg_office'] = toTitleCase(getTextOrEmpty(rows1[2].cells[1]));
                data['issue_date'] = convertDateToDDMMYYYY(getTextOrEmpty(rows1[2].cells[2]));
                data['date_birth'] = convertDateToDDMMYYYY(getTextOrEmpty(rows1[4].cells[0]));
                data['birth_num'] = getTextOrEmpty(rows1[4].cells[1]);
                data['sex'] = toTitleCase(getTextOrEmpty(rows1[4].cells[2]));

                const rows2 = tables[1].querySelectorAll('tr');
                data['name_bn'] = toTitleCase(getTextOrEmpty(rows2[0].cells[1]));
                data['name_en'] = toTitleCase(getTextOrEmpty(rows2[0].cells[3]));
                data['birth_place_bn'] = toTitleCase(getTextOrEmpty(rows2[1].cells[1]));
                data['birth_place_en'] = toTitleCase(getTextOrEmpty(rows2[1].cells[3]));
                data['mother_name_bn'] = toTitleCase(getTextOrEmpty(rows2[2].cells[1]));
                data['mother_name_en'] = toTitleCase(getTextOrEmpty(rows2[2].cells[3]));
                data['mother_nationality_bn'] = toTitleCase(getTextOrEmpty(rows2[3].cells[1]));
                data['mother_nationality_en'] = toTitleCase(getTextOrEmpty(rows2[3].cells[3]));
                data['father_name_bn'] = toTitleCase(getTextOrEmpty(rows2[4].cells[1]));
                data['father_name_en'] = toTitleCase(getTextOrEmpty(rows2[4].cells[3]));
                data['father_nationality_bn'] = toTitleCase(getTextOrEmpty(rows2[5].cells[1]));
                data['father_nationality_en'] = toTitleCase(getTextOrEmpty(rows2[5].cells[3]));

                // Office address
                const officeAddress = toTitleCase(document.querySelector('span em').innerText.trim());
                data['office_address'] = officeAddress;
            }

            // Ensure 'বাংলাদেশ' is only added once for Bangla
            if (!data['birth_place_bn'].includes('বাংলাদেশ')) {
                data['birth_place_bn'] += ' বাংলাদেশ';
            }

            // Ensure 'Bangladesh' is only added once for English
            if (!data['birth_place_en'].includes('Bangladesh')) {
                data['birth_place_en'] += ' Bangladesh';
            }

            return data;
        });

        // Save the response data as a JSON file
        fs.writeFileSync('response_data.json', JSON.stringify(data, null, 4));
        console.log('Response data saved as response_data.json');

        // Save the response page as a PDF
        await page.pdf({ path: 'response_page.pdf', format: 'A4' });
        console.log('Response page saved as response_page.pdf');

        // Close the browser
        await browser.close();

        // Return the scraped data as the response
        res.json({ status: 'success', data });

    } catch (error) {
        console.error('Error scraping:', error);
        res.status(500).json({ status: 'error', message: 'Failed to scrape data.' });
    }
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
