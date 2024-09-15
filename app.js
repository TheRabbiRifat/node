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
            // Function to convert a number to a day in word form
            function getDayInWord(day) {
                const dayInWord = {
                    1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', 5: 'Fifth',
                    6: 'Sixth', 7: 'Seventh', 8: 'Eighth', 9: 'Ninth', 10: 'Tenth',
                    11: 'Eleventh', 12: 'Twelfth', 13: 'Thirteenth', 14: 'Fourteenth',
                    15: 'Fifteenth', 16: 'Sixteenth', 17: 'Seventeenth', 18: 'Eighteenth',
                    19: 'Nineteenth', 20: 'Twentieth', 21: 'Twenty-first', 22: 'Twenty-second',
                    23: 'Twenty-third', 24: 'Twenty-fourth', 25: 'Twenty-fifth',
                    26: 'Twenty-sixth', 27: 'Twenty-seventh', 28: 'Twenty-eighth',
                    29: 'Twenty-ninth', 30: 'Thirtieth', 31: 'Thirty-first'
                };
                return dayInWord[day];
            }

            // Function to convert a number to its corresponding year in words
            function getYearInWord(year) {
                const digits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
                const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
                const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

                function twoDigitInWord(num) {
                    if (num < 10) {
                        return digits[num];
                    } else if (num < 20) {
                        return teens[num - 10];
                    } else {
                        const tensDigit = Math.floor(num / 10);
                        const onesDigit = num % 10;
                        return `${tens[tensDigit]} ${digits[onesDigit]}`.trim();
                    }
                }

                function threeDigitInWord(num) {
                    const hundredsDigit = Math.floor(num / 100);
                    const remaining = num % 100;
                    if (remaining === 0) {
                        return `${digits[hundredsDigit]} Hundred`;
                    } else {
                        return `${digits[hundredsDigit]} Hundred ${twoDigitInWord(remaining)}`;
                    }
                }

                if (year < 1000) {
                    if (year < 100) {
                        return twoDigitInWord(year);
                    } else {
                        return threeDigitInWord(year);
                    }
                } else {
                    if (year < 2000) {
                        return `Nineteen ${twoDigitInWord(year % 100)}`.trim();
                    } else if (year >= 2000 && year < 2100) {
                        if (year >= 2000 && year < 2010) {
                            return `Two Thousand ${digits[year % 2000]}`.trim();
                        } else {
                            return `Two Thousand ${twoDigitInWord(year % 2000)}`.trim();
                        }
                    } else if (year >= 2100) {
                        return `Twenty-one Hundred ${getYearInWord(year % 2100)}`.trim();
                    }
                }
            }

            // Convert the date to words
            function dateToWord(dateStr) {
                const dateObj = new Date(dateStr);
                const day = dateObj.getDate();
                const month = dateObj.toLocaleString('default', { month: 'long' });
                const year = dateObj.getFullYear();

                const dayInWord = getDayInWord(day);
                const monthInWord = month;
                const yearInWord = getYearInWord(year);

                return `${dayInWord} of ${monthInWord} ${yearInWord}`;
            }

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
                data['reg_office'] = getTextOrEmpty(rows1[2].cells[1]);
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
            }

            return data;
        });

        // Close the browser
        await browser.close();

        // Return the scraped data
        res.json(data);
    } catch (error) {
        console.error('Error submitting form and scraping the website:', error);
        res.status(500).send('An error occurred during form submission and scraping');
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
