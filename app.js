const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/check-json', (req, res) => {
    res.json({
        status: "success",
        message: "NodeJS get info app is running!"
    });
});

// Middleware to parse large JSON payloads
app.use(express.json({ limit: '50mb' }));

// POST endpoint for submitting the form and scraping the website
app.post('/submit', async (req, res) => {
    const { hiddenFields, cookies, BirthDate, UBRN, CaptchaInputText } = req.body;

    // Input validation
    if (!hiddenFields || !cookies || !BirthDate || !UBRN || !CaptchaInputText) {
        return res.status(400).json({
            status: "error",
            message: "All fields (hiddenFields, cookies, BirthDate, UBRN, CaptchaInputText) are required."
        });
    }

    try {
        // Launch Puppeteer browser
        const browser = await puppeteer.launch({
    headless: 'new', // Opt into the new headless mode for Chrome
    args: ['--no-sandbox', '--disable-setuid-sandbox']
});


        const page = await browser.newPage();

        // Navigate to the target website
        await page.goto('https://everify.bdris.gov.bd', { waitUntil: 'networkidle2' });

        // Set cookies on the page
        await page.setCookie(...cookies);

        // Wait for the form elements to load
        await page.waitForSelector('#BirthDate');
        await page.waitForSelector('#CaptchaInputText');
        await page.waitForSelector('#ubrn');

        // Set hidden form fields
        await page.evaluate((hiddenFields) => {
            hiddenFields.forEach(({ name, value }) => {
                const input = document.querySelector(`input[name="${name}"]`);
                if (input) {
                    input.value = value;
                }
            });
        }, hiddenFields);

        // Fill out the form fields
        await page.type('#BirthDate', BirthDate);
        await page.keyboard.press('Enter'); // Trigger any date-related events
        await page.keyboard.press('Enter'); // Ensure the date field processes

        await page.type('#ubrn', UBRN);
        await page.type('#CaptchaInputText', CaptchaInputText);

        // Submit the form
        await page.keyboard.press('Enter');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // Scrape the required data
        const data = await page.evaluate(() => {
            const getTextOrEmpty = (element) => (element ? element.innerText.trim() : '');

            // Helper function to map day number to word format
            const getDayInWord = (day) => ({
                1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', 5: 'Fifth',
                6: 'Sixth', 7: 'Seventh', 8: 'Eighth', 9: 'Ninth', 10: 'Tenth',
                11: 'Eleventh', 12: 'Twelfth', 13: 'Thirteenth', 14: 'Fourteenth',
                15: 'Fifteenth', 16: 'Sixteenth', 17: 'Seventeenth', 18: 'Eighteenth',
                19: 'Nineteenth', 20: 'Twentieth', 21: 'Twenty-first', 22: 'Twenty-second',
                23: 'Twenty-third', 24: 'Twenty-fourth', 25: 'Twenty-fifth',
                26: 'Twenty-sixth', 27: 'Twenty-seventh', 28: 'Twenty-eighth',
                29: 'Twenty-ninth', 30: 'Thirtieth', 31: 'Thirty-first'
            }[day]);

            // Helper function to map year number to word format
            const getYearInWord = (year) => {
                const digits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
                const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
                const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

                if (year < 10) return digits[year];
                if (year < 20) return teens[year - 10];
                const tensDigit = Math.floor(year / 10);
                const onesDigit = year % 10;
                return `${tens[tensDigit]} ${digits[onesDigit]}`.trim();
            };

            // Convert date to word format
            const dateToWord = (dateStr) => {
                const date = new Date(dateStr);
                const dayInWord = getDayInWord(date.getDate());
                const monthInWord = date.toLocaleString('default', { month: 'long' });
                const yearInWord = getYearInWord(date.getFullYear());
                return `${dayInWord} of ${monthInWord} ${yearInWord}`;
            };

            const convertDateToDDMMYYYY = (dateStr) => {
                const months = {
                    'january': '01', 'february': '02', 'march': '03', 'april': '04',
                    'may': '05', 'june': '06', 'july': '07', 'august': '08',
                    'september': '09', 'october': '10', 'november': '11', 'december': '12'
                };

                const [day, monthName, year] = dateStr.toLowerCase().split(' ');
                const month = months[monthName] || 'undefined';
                return `${day.padStart(2, '0')}/${month}/${year}`;
            };

            const tables = document.querySelectorAll('table.table-hover');
            const data = {};

            if (tables.length >= 2) {
                const rows1 = tables[0].querySelectorAll('tr');
                data['reg_date'] = convertDateToDDMMYYYY(getTextOrEmpty(rows1[2].cells[0]));
                data['reg_office'] = getTextOrEmpty(rows1[2].cells[1]); // Office Address
                data['issue_date'] = convertDateToDDMMYYYY(getTextOrEmpty(rows1[2].cells[2]));
                data['date_birth'] = convertDateToDDMMYYYY(getTextOrEmpty(rows1[4].cells[0]));
                data['birth_num'] = getTextOrEmpty(rows1[4].cells[1]);
                data['sex'] = getTextOrEmpty(rows1[4].cells[2]);

                const rows2 = tables[1].querySelectorAll('tr');
                data['name_bn'] = getTextOrEmpty(rows2[0].cells[1]);
                data['name_en'] = getTextOrEmpty(rows2[0].cells[3]);
                data['birth_place_bn'] = getTextOrEmpty(rows2[1].cells[1]);
                data['birth_place_en'] = getTextOrEmpty(rows2[1].cells[3]);
                data['mother_name_bn'] = getTextOrEmpty(rows2[2].cells[1]);
                data['mother_name_en'] = getTextOrEmpty(rows2[2].cells[3]);
                data['mother_nationality_bn'] = getTextOrEmpty(rows2[3].cells[1]);
                data['mother_nationality_en'] = getTextOrEmpty(rows2[3].cells[3]);
                data['father_name_bn'] = getTextOrEmpty(rows2[4].cells[1]);
                data['father_name_en'] = getTextOrEmpty(rows2[4].cells[3]);
                data['father_nationality_bn'] = getTextOrEmpty(rows2[5].cells[1]);
                data['father_nationality_en'] = getTextOrEmpty(rows2[5].cells[3]);

                data['date_birth_word'] = dateToWord(data['date_birth']);

                // Ensure ', বাংলাদেশ' is only added once for Bangla
                if (!data['birth_place_bn'].includes(', বাংলাদেশ')) {
                    data['birth_place_bn'] += ', বাংলাদেশ';
                }

                // Convert to lowercase before checking to ensure case-insensitive comparison for English
                if (!data['birth_place_en'].toLowerCase().includes(', bangladesh')) {
                    data['birth_place_en'] += ', Bangladesh';
                }

                // Extract office address from specific element
                const officeAddress = document.querySelector('span em') ? document.querySelector('span em').innerText.trim() : '';
                data['office_address'] = officeAddress;
            }

            return data;
        });

        // Close the browser after scraping
        await browser.close();

        // Send the scraped data as a JSON response
        res.json({
            status: "success",
            message: "Form submitted successfully",
            data
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            status: "error",
            message: "Something went wrong during form submission or data scraping."
        });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
