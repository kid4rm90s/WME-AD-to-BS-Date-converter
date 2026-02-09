// ==UserScript==
// @name         WME AD to BS Converter
// @namespace    https://greasyfork.org/users/1087400
// @version      0.2.1
// @description  Converts AD dates to BS dates in WME closure panel
// @author       https://greasyfork.org/en/users/1087400-kid4rm90s
// @include 	   /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor.*$/
// @exclude      https://www.waze.com/user/*editor/*
// @exclude      https://www.waze.com/*/user/*editor/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_info
// @grant        unsafeWindow
// @icon         https://www.google.com/s2/favicons?sz=64&domain=waze.com
// @license      GNU GPL(v3)
// @connect      greasyfork.org
// @connect      githubusercontent.com
// @connect      kid4rm90s.github.io
// @require      https://greasyfork.org/scripts/560385/code/WazeToastr.js
// @downloadURL https://update.greasyfork.org/scripts/563916/WME%20AD%20to%20BS%20Converter.user.js
// @updateURL https://update.greasyfork.org/scripts/563916/WME%20AD%20to%20BS%20Converter.meta.js
// ==/UserScript==

(function main() {
    'use strict';

    // =================================================================
    // CONSTANTS
    // =================================================================
    const SCRIPT_PREFIX = 'WME_ADtoBS';
    const scriptName = GM_info.script.name;
    const scriptVersion = GM_info.script.version;
    const updateMessage = `<strong>Version ${scriptVersion} - 2026-02-09:</strong><br>
    - Now properly apply dates for both regular date inputs and closure start/end dates<br>
    - Code cleanup for various minor bugs and improved stability`;
    const downloadUrl = 'https://greasyfork.org/en/scripts/563916-wme-ad-to-bs-converter/code/WME-AD-to-BS-Converter.user.js';
    const forumURL = 'https://greasyfork.org/en/scripts/563916-wme-ad-to-bs-converter/feedback';
    
    // Timing constants (in milliseconds)
    const TIMING = {
        BOOTSTRAP_RETRY: 250,
        LIBRARY_RETRY: 500,
        FALLBACK_CHECK: 1500,
        TODAY_UPDATE: 30000,
        LIBRARY_INJECT_WAIT: 300,
        LIBRARY_RETRY_WAIT: 1000,
        REQUEST_TIMEOUT: 10000,
        LANGUAGE_UPDATE_DELAY: 100,
        POLLING_INTERVAL: 500
    };
    
    // Nepal timezone offset
    const NEPAL_TIMEZONE_OFFSET_MINUTES = 5 * 60 + 45;
    
    // Calendar configuration
    const CALENDAR_CONFIG = {
        NEPALI_MONTHS: ['बैशाख', 'जेठ', 'असार', 'श्रावण', 'भदौ', 'आश्विन', 'कार्तिक', 'मंसिर', 'पुष', 'माघ', 'फाल्गुण', 'चैत्र'],
        ENGLISH_MONTHS: ['Baisakh', 'Jestha', 'Ashar', 'Shrawan', 'Bhadau', 'Ashwin', 'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'],
        NEPALI_WEEKDAYS: ['आ', 'सो', 'मं', 'बु', 'बि', 'शु', 'श'],
        ENGLISH_WEEKDAYS: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
    };
    
    // Element IDs
    const ELEMENT_IDS = {
        ADVANCED_START: 'wmeac-advanced-closure-dialog-rangestartdate',
        ADVANCED_END: 'wmeac-advanced-closure-dialog-rangeenddate',
        SCRIPT_TAB: 'wme-ad-bs-tab',
        TODAY_DISPLAY: 'wme-ad-bs-today',
        EDIT_PANEL: 'edit-panel'
    };
    
    // =================================================================
    // STATE
    // =================================================================
    let wmeSDK;
    let calendarLang = 'ne'; // 'ne' (Nepali) or 'en' (English)
    let _wmeLocale = null;
    let _wmeRegion = null;

    // =================================================================
    // UTILITY FUNCTIONS
    // =================================================================
    
    /**
     * Logs a message with the script prefix
     * @param {string} message - The message to log
     */
    const log = (message) => console.log(`${SCRIPT_PREFIX}: ${message}`);
    
    /**
     * Converts standard digits to Devanagari numerals
     * @param {string|number} value - The value to convert
     * @returns {string} - The converted value in Devanagari
     */
    const toDevanagari = (value) => String(value).replace(/\d/g, d => '०१२३४५६७८९'[d]);
    
    /**
     * Converts Devanagari numerals to standard digits
     * @param {string} str - The string with Devanagari numerals
     * @returns {string} - The string with standard digits
     */
    const normalizeDevanagariNumerals = (str) => 
        str.replace(/[\u0966-\u096F]/g, c => String(c.charCodeAt(0) - 0x0966));
    
    /**
     * Validates if NepaliDate library is available
     * @returns {boolean} - True if library is available
     */
    const isNepaliDateAvailable = () => 
        unsafeWindow.NepaliDate && typeof unsafeWindow.NepaliDate.AD_TO_BS === 'function';
    
    /**
     * Checks if the element is an advanced closure input
     * @param {HTMLElement} element - The element to check
     * @returns {boolean} - True if it's an advanced closure input
     */
    const isAdvancedClosureInput = (element) => 
        element?.id === ELEMENT_IDS.ADVANCED_START || element?.id === ELEMENT_IDS.ADVANCED_END;
    
    /**
     * Pads a number with leading zeros
     * @param {number} num - The number to pad
     * @param {number} length - The desired length
     * @returns {string} - The padded string
     */
    const padZero = (num, length = 2) => String(num).padStart(length, '0');

    // =================================================================
    // LIBRARY MANAGEMENT
    // =================================================================
    
    /**
     * Load and inject NepaliDate library
     * @returns {Promise<void>} - Resolves when library is loaded or fails
     */
    function loadNepaliDate() {
        return new Promise((resolve) => {
            if (isNepaliDateAvailable()) {
                log('✓ NepaliDate library already available');
                resolve();
                return;
            }

            log('Fetching NepaliDate library from GitHub...');
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://kid4rm90s.github.io/NepaliBStoAD/NepaliBStoAD.js',
                timeout: TIMING.REQUEST_TIMEOUT,
                onload: function(response) {
                    try {
                        log('Library fetched, injecting into page...');
                        // Create a script element to inject into the page
                        const script = document.createElement('script');
                        script.textContent = response.responseText;
                        script.type = 'text/javascript';
                        
                        // Use a callback function to track when script is done
                        script.onload = function() {
                            log('✓ NepaliDate script loaded');
                        };
                        
                        document.head.appendChild(script);
                        
                        // Wait for the script to execute
                        setTimeout(() => {
                            if (isNepaliDateAvailable()) {
                                log('✓ NepaliDate library loaded and ready');
                                resolve();
                            } else {
                                log('⚠ NepaliDate not found after injection, retrying...');
                                // If still not available, try again after longer delay
                                setTimeout(() => {
                                    if (isNepaliDateAvailable()) {
                                        log('✓ NepaliDate library available on retry');
                                        resolve();
                                    } else {
                                        log('✗ Failed to load NepaliDate library');
                                        resolve();
                                    }
                                }, TIMING.LIBRARY_RETRY_WAIT);
                            }
                        }, TIMING.LIBRARY_INJECT_WAIT);
                    } catch (e) {
                        log('✗ Error loading NepaliDate: ' + e.message);
                        resolve();
                    }
                },
                onerror: function(error) {
                    log('✗ Failed to fetch NepaliDate: ' + error);
                    resolve();
                },
                ontimeout: function() {
                    log('✗ Timeout fetching NepaliDate');
                    resolve();
                }
            });
        });
    }

    // =================================================================
    // INITIALIZATION
    // =================================================================
    
    /**
     * Initialize the script after SDK is ready
     */
    function initScript() {
        wmeSDK = getWmeSdk({
            scriptId: SCRIPT_PREFIX,
            scriptName: 'WME AD to BS Converter',
        });
        
        // Load NepaliDate library before starting
        loadNepaliDate().then(() => {
            WME_ADtoBS_bootstrap();
        });
    }
    
    unsafeWindow.SDK_INITIALIZED.then(initScript);

    // =================================================================
    // UI COMPONENTS
    // =================================================================
    
    /**
     * Add a script tab to the WME sidebar for language selection and info
     */
    async function addScriptTab() {
        if (!wmeSDK?.Sidebar?.registerScriptTab) return;
        // Only add once
        if (document.getElementById(ELEMENT_IDS.SCRIPT_TAB)) return;

        const { tabLabel, tabPane } = await wmeSDK.Sidebar.registerScriptTab();

        tabLabel.textContent = "AD↔BS";

        const tabContent = document.createElement('div');
        tabContent.style.padding = '12px';
        tabContent.innerHTML = `
            <h3 style="margin-top:0">WME AD↔BS Converter</h3>
            <h7> Version ${scriptVersion}</h7><br><br>
            <label style="font-weight:bold;">Nepali Calendar Display:</label><br>
            <label><input type="radio" name="wme-ad-bs-lang" value="ne" checked> नेपाली (Devanagari)</label><br>
            <label><input type="radio" name="wme-ad-bs-lang" value="en"> English</label>
            <div id="wme-ad-bs-today" style="margin-top:10px; font-size:13px; font-weight:bold;"></div>
            <br><br><h8> For feedback: <a href="${forumURL}" target="_blank" style="color:#1e88e5; text-decoration:underline;">${forumURL}</a></h8><br>
        `;
        tabContent.id = ELEMENT_IDS.SCRIPT_TAB;
        tabContent.addEventListener('change', (e) => {
            if (e.target && e.target.name === 'wme-ad-bs-lang') {
                calendarLang = e.target.value;
            }
        });
        tabPane.appendChild(tabContent);

        /**
         * Updates the current Nepal date/time display
         */
        function updateTodayNPL() {
            const todayDiv = document.getElementById(ELEMENT_IDS.TODAY_DISPLAY);
            if (!todayDiv) return;
            
            const adNow = new Date();
            const nplNow = new Date(adNow.getTime() + NEPAL_TIMEZONE_OFFSET_MINUTES * 60000);
            const adStr = `${nplNow.getUTCFullYear()}-${padZero(nplNow.getUTCMonth() + 1)}-${padZero(nplNow.getUTCDate())}`;
            const timeStr = `${padZero(nplNow.getUTCHours())}:${padZero(nplNow.getUTCMinutes())}`;
            let bsHtml = '<span style="color:#1e88e5">--</span>';
            let timeHtml = '<span style="color:#1e88e5">--</span>';
            
            if (isNepaliDateAvailable()) {
                let bsStr = unsafeWindow.NepaliDate.AD_TO_BS(adStr);
                let displayTime = timeStr;
                
                // Convert to Devanagari if Nepali selected
                if (calendarLang === 'ne') {
                    displayTime = toDevanagari(timeStr);
                    bsStr = bsStr ? toDevanagari(bsStr) : '--';
                    bsHtml = `<span style="color: #1e88e5; font-weight:bold;">${bsStr}</span>`;
                    timeHtml = `<span style="color: #1e88e5; font-weight:bold;">${displayTime}</span>`;
                } else {
                    bsHtml = `<span style="color: #1e88e5">${bsStr}</span>`;
                    timeHtml = `<span style="color: #1e88e5">${displayTime}</span>`;
                }
            }
            todayDiv.innerHTML = `Current date and time (NPL): <br>${bsHtml}&nbsp;&nbsp;&nbsp;&nbsp;${timeHtml}`;
        }
        
        // Update immediately and then every 30 seconds
        updateTodayNPL();
        setInterval(updateTodayNPL, TIMING.TODAY_UPDATE);
        
        // Update display when language changes
        tabContent.addEventListener('change', (e) => {
            if (e.target?.name === 'wme-ad-bs-lang') {
                setTimeout(updateTodayNPL, TIMING.LANGUAGE_UPDATE_DELAY);
                // Update advanced closure BS displays on language change
                const advStartInput = document.getElementById(ELEMENT_IDS.ADVANCED_START);
                const advEndInput = document.getElementById(ELEMENT_IDS.ADVANCED_END);
                if (advStartInput) {
                    const advStartDisplay = document.getElementById(`${ELEMENT_IDS.ADVANCED_START}-bs-val`);
                    if (advStartDisplay) updateBSValue(advStartInput, advStartDisplay);
                }
                if (advEndInput) {
                    const advEndDisplay = document.getElementById(`${ELEMENT_IDS.ADVANCED_END}-bs-val`);
                    if (advEndDisplay) updateBSValue(advEndInput, advEndDisplay);
                }
            }
        });
    }

    /**
     * Bootstrap the script - wait for edit panel and country data
     */
    const WME_ADtoBS_bootstrap = () => {
        const editPanel = document.getElementById(ELEMENT_IDS.EDIT_PANEL);
        const topCountry = wmeSDK?.DataModel?.Countries?.getTopCountry();
        
        if (!editPanel || !topCountry) {
            setTimeout(WME_ADtoBS_bootstrap, TIMING.BOOTSTRAP_RETRY);
            return;
        }
        
        if (wmeSDK.State.isReady) {
            addScriptTab();
            WME_ADtoBS_init();
        } else {
            wmeSDK.Events.once({ eventName: 'wme-ready' }).then(() => {
                addScriptTab();
                WME_ADtoBS_init();
            });
        }
    };

    /**
     * Initialize observers and date display handlers
     */
    const WME_ADtoBS_init = () => {
        log('Initializing observer');
        
        // Log library version for debugging
        if (unsafeWindow.NepaliDate?.version) {
            log('NepaliDate library version: ' + unsafeWindow.NepaliDate.version);
        }

        /**
         * Process date picker inputs found in the DOM
         */
        const processDateInputs = (node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            
            // Native WME UI: all date-picker-inputs (by class)
            node.querySelectorAll?.('.date-picker-input').forEach(inputElem => {
                if (inputElem instanceof HTMLElement) {
                    setupDateDisplay(inputElem);
                }
            });
            
            // Advanced Closures (by ID)
            const advStartInput = node.querySelector?.(`#${ELEMENT_IDS.ADVANCED_START}`);
            const advEndInput = node.querySelector?.(`#${ELEMENT_IDS.ADVANCED_END}`);
            if (advStartInput) setupDateDisplay(advStartInput);
            if (advEndInput) setupDateDisplay(advEndInput);
        };

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach(processDateInputs);
            });
        });

        observer.observe(document.getElementById(ELEMENT_IDS.EDIT_PANEL), {
            childList: true,
            subtree: true,
            attributes: true
        });

        // Fallback: periodically check for inputs and inject if missing
        setInterval(() => {
            // Advanced Closures (by ID)
            const advStartInput = document.getElementById(ELEMENT_IDS.ADVANCED_START);
            if (advStartInput && !document.getElementById(`${ELEMENT_IDS.ADVANCED_START}-bs-val`)) {
                setupDateDisplay(advStartInput);
            }
            const advEndInput = document.getElementById(ELEMENT_IDS.ADVANCED_END);
            if (advEndInput && !document.getElementById(`${ELEMENT_IDS.ADVANCED_END}-bs-val`)) {
                setupDateDisplay(advEndInput);
            }

            // Native WME UI: all date-picker-inputs (by class)
            document.querySelectorAll('.date-picker-input').forEach(inputElem => {
                if (inputElem instanceof HTMLElement && !document.getElementById(`${inputElem.id}-bs-val`)) {
                    setupDateDisplay(inputElem);
                }
            });
        }, TIMING.FALLBACK_CHECK);

        log('Observer started on edit-panel');
    };

    // =================================================================
    // DATE DISPLAY SETUP
    // =================================================================
    
    /**
     * Gets the number of days in a BS month
     * @param {number} year - BS year
     * @param {number} month - BS month (1-12)
     * @returns {number} - Number of days in the month
     */
    function getDaysInBSMonth(year, month) {
        let d = 1;
        while (d <= 35) {
            const bsStr = `${year}-${padZero(month)}-${padZero(d)}`;
            const ad = unsafeWindow.NepaliDate.BS_TO_AD(bsStr);
            if (!ad || ad.includes('Error') || ad.includes('Invalid')) break;
            
            // Convert back to BS to verify month
            const bsBack = unsafeWindow.NepaliDate.AD_TO_BS(ad);
            if (!bsBack || bsBack.includes('Error') || bsBack.includes('Invalid')) break;
            
            const [bsy, bsm] = bsBack.split('-').map(Number);
            if (bsy !== year || bsm !== month) break;
            d++;
        }
        return d - 1;
    }
    
    /**
     * Gets the current or initial BS date
     * @param {string} currentBS - Current BS date string
     * @returns {Array<number>} - [year, month, day]
     */
    function getInitialBSDate(currentBS) {
        // Try to parse existing BS value
        if (/^\d{4}-\d{2}-\d{2}$/.test(currentBS)) {
            const [bsYear, bsMonth, bsDay] = currentBS.split('-').map(Number);
            if (bsYear && bsMonth && bsDay) {
                return [bsYear, bsMonth, bsDay];
            }
        }
        
        // Fallback: use today's AD and convert to BS
        const today = new Date();
        const adStr = `${today.getFullYear()}-${padZero(today.getMonth() + 1)}-${padZero(today.getDate())}`;
        const bsStr = unsafeWindow.NepaliDate.AD_TO_BS(adStr);
        
        if (bsStr && /^\d{4}-\d{2}-\d{2}$/.test(bsStr)) {
            return bsStr.split('-').map(Number);
        }
        
        // Final fallback
        return [2080, 1, 1];
    }
    
    /**
     * Creates the BS calendar popup element
     * @param {HTMLElement} bsDisplay - The BS display element
     * @param {HTMLElement} inputElem - The input element
     * @returns {Object} - Calendar popup components
     */
    function createCalendarPopup(bsDisplay, inputElem) {
        // Remove any existing calendar
        document.querySelectorAll('.bs-calendar-popup').forEach(el => el.remove());

        // Get current BS value
        const currentBS = bsDisplay.innerText.replace(/^BS:\s*|^बि॰सं॰:\s*/, '').trim();
        let [bsYear, bsMonth, bsDay] = getInitialBSDate(currentBS);

        // Create calendar popup
        const popup = document.createElement('div');
        popup.className = 'bs-calendar-popup';
        popup.style = 'position: absolute; z-index: 9999; background: #fff; border: 1px solid #aaa; border-radius: 6px; box-shadow: 0 2px 8px #0002; padding: 10px; font-size: 13px;';

        // Position popup below the bsDisplay
        const rect = bsDisplay.getBoundingClientRect();
        popup.style.left = `${rect.left + window.scrollX}px`;
        popup.style.top = `${rect.bottom + window.scrollY + 2}px`;

        // Create header
        const { header, prevMonth, nextMonth, ymLabel } = createCalendarHeader();
        popup.appendChild(header);

        // Create calendar grid
        const grid = document.createElement('table');
        grid.style = 'border-collapse: collapse; width: 100%;';
        popup.appendChild(grid);
        
        return { popup, grid, prevMonth, nextMonth, ymLabel, bsYear, bsMonth, bsDay };
    }
    
    /**
     * Creates the calendar header with navigation buttons
     * @returns {Object} - Header components
     */
    function createCalendarHeader() {
        const header = document.createElement('div');
        header.style = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;';
        
        const prevMonth = document.createElement('button');
        prevMonth.textContent = '<';
        prevMonth.style = 'padding:2px 6px; margin-right:4px;';
        
        const nextMonth = document.createElement('button');
        nextMonth.textContent = '>';
        nextMonth.style = 'padding:2px 6px; margin-left:4px;';
        
        const ymLabel = document.createElement('span');
        ymLabel.style = 'font-weight:bold;';
        
        header.appendChild(prevMonth);
        header.appendChild(ymLabel);
        header.appendChild(nextMonth);
        
        return { header, prevMonth, nextMonth, ymLabel };
    }
    /**
     * Renders the calendar grid for a specific month
     * @param {HTMLElement} grid - The calendar grid element
     * @param {HTMLElement} ymLabel - Year/month label element
     * @param {number} year - BS year
     * @param {number} month - BS month
     * @param {number|null} selectedDay - Currently selected day
     * @param {HTMLElement} inputElem - The input element
     * @param {HTMLElement} popup - The popup element
     */
    function renderCalendar(grid, ymLabel, year, month, selectedDay, inputElem, popup) {
        // Use selected language for month and numerals
        const isNepali = calendarLang === 'ne';
        const monthName = isNepali ? CALENDAR_CONFIG.NEPALI_MONTHS[month - 1] : CALENDAR_CONFIG.ENGLISH_MONTHS[month - 1];
        const weekdayLabels = isNepali ? CALENDAR_CONFIG.NEPALI_WEEKDAYS : CALENDAR_CONFIG.ENGLISH_WEEKDAYS;
        const numFn = isNepali ? toDevanagari : (n) => n;
        
        ymLabel.textContent = `${numFn(year)} ${monthName}`;
        
        // Clear grid
        grid.innerHTML = '';
        
        // Create header row with weekday labels
        const thead = document.createElement('thead');
        const trh = document.createElement('tr');
        weekdayLabels.forEach(wd => {
            const th = document.createElement('th');
            th.textContent = wd;
            th.style = 'padding:2px 4px; color: #000000;';
            trh.appendChild(th);
        });
        thead.appendChild(trh);
        grid.appendChild(thead);
        
        // Get number of days in month
        const days = getDaysInBSMonth(year, month);
        
        // Find first day of week
        const adFirst = unsafeWindow.NepaliDate.BS_TO_AD(`${year}-${padZero(month)}-01`);
        let firstDay = 0;
        if (adFirst && !adFirst.includes('Error')) {
            const [y, m, d] = adFirst.split('-').map(Number);
            firstDay = new Date(y, m - 1, d).getDay();
        }
        
        let tr = document.createElement('tr');
        
        // Add empty cells for days before month starts
        for (let i = 0; i < firstDay; i++) {
            const td = document.createElement('td');
            td.textContent = '';
            tr.appendChild(td);
        }
        
        // Add day cells
        for (let day = 1; day <= days; day++) {
            if ((firstDay + day - 1) % 7 === 0 && day !== 1) {
                grid.appendChild(tr);
                tr = document.createElement('tr');
            }
            
            const td = createDayCell(day, year, month, selectedDay, numFn, inputElem, popup);
            tr.appendChild(td);
        }
        
        // Fill trailing empty cells
        while (tr.children.length < 7) {
            const td = document.createElement('td');
            td.textContent = '';
            tr.appendChild(td);
        }
        grid.appendChild(tr);
    }
    
    /**
     * Creates a day cell for the calendar
     * @param {number} day - Day number
     * @param {number} year - BS year
     * @param {number} month - BS month
     * @param {number|null} selectedDay - Currently selected day
     * @param {Function} numFn - Number formatting function
     * @param {HTMLElement} inputElem - The input element
     * @param {HTMLElement} popup - The popup element
     * @returns {HTMLElement} - The day cell
     */
    function createDayCell(day, year, month, selectedDay, numFn, inputElem, popup) {
        const td = document.createElement('td');
        td.textContent = numFn(day);
        td.style = 'padding:3px 5px; text-align:center; cursor:pointer; border-radius:3px;';
        
        if (day === selectedDay) {
            td.style.background = '#1e88e5';
            td.style.color = '#fff';
        } else {
            td.addEventListener('mouseenter', () => { td.style.background = '#e3f2fd'; });
            td.addEventListener('mouseleave', () => { td.style.background = ''; });
        }
        
        td.addEventListener('click', () => handleDaySelect(day, year, month, inputElem, popup));
        
        return td;
    }
    
    /**
     * Handles day selection in the calendar
     * @param {number} day - Selected day
     * @param {number} year - BS year
     * @param {number} month - BS month
     * @param {HTMLElement} inputElem - The input element
     * @param {HTMLElement} popup - The popup element
     */
    function handleDaySelect(day, year, month, inputElem, popup) {
        const bsStr = `${year}-${padZero(month)}-${padZero(day)}`;
        const adDateStr = unsafeWindow.NepaliDate.BS_TO_AD(bsStr);
        log(`BS_TO_AD conversion: ${bsStr} -> ${adDateStr}`);
        
        if (!adDateStr || adDateStr.includes('Error') || adDateStr.includes('Invalid')) {
            alert('Conversion failed: ' + adDateStr);
            return;
        }
        
        const adParts = adDateStr.split('-');
        if (adParts.length !== 3) {
            alert('Unexpected AD date format: ' + adDateStr);
            return;
        }
        
        const [yyyy, mm, dd] = adParts.map(part => padZero(parseInt(part, 10)));
        let adInputVal;
        
        // For advanced closure inputs, use yyyy-mm-dd format
        if (isAdvancedClosureInput(inputElem)) {
            adInputVal = `${yyyy}-${mm}-${dd}`;
        } else {
            adInputVal = formatDateForInput(yyyy, mm, dd, inputElem.value);
        }
        
        // Create a Date object for the selected date
        const selectedDate = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
        
        // Simulate user interaction sequence to ensure WME accepts the change
        inputElem.focus();
        
        // Set the value
        inputElem.value = adInputVal;
        
        // Try to use daterangepicker API if available
        let daterangepickerInstance = null;
        
        // Check for daterangepicker instance in multiple ways
        if (inputElem.daterangepicker) {
            daterangepickerInstance = inputElem.daterangepicker;
        } else if (unsafeWindow.$ && unsafeWindow.$(inputElem).data('daterangepicker')) {
            daterangepickerInstance = unsafeWindow.$(inputElem).data('daterangepicker');
        }
        
        // If daterangepicker instance found, use its API
        if (daterangepickerInstance) {
            try {
                log('Setting date via daterangepicker API');
                
                // Set both start and end date to the selected date
                if (typeof daterangepickerInstance.setStartDate === 'function') {
                    daterangepickerInstance.setStartDate(selectedDate);
                }
                if (typeof daterangepickerInstance.setEndDate === 'function') {
                    daterangepickerInstance.setEndDate(selectedDate);
                }
                
                // Try to click the apply button programmatically
                const applyBtn = document.querySelector('.daterangepicker .applyBtn');
                if (applyBtn) {
                    log('Clicking apply button');
                    applyBtn.click();
                } else if (typeof daterangepickerInstance.clickApply === 'function') {
                    daterangepickerInstance.clickApply();
                } else if (typeof daterangepickerInstance.hide === 'function') {
                    // Some configurations auto-apply on hide
                    daterangepickerInstance.hide();
                }
            } catch (e) {
                log('Error using daterangepicker API: ' + e.message);
            }
        }
        
        // Dispatch multiple events that WME's date picker expects
        inputElem.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        inputElem.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        
        // Use jQuery trigger if available for better compatibility
        if (unsafeWindow.$ && unsafeWindow.$(inputElem).trigger) {
            try {
                unsafeWindow.$(inputElem).trigger('change');
                unsafeWindow.$(inputElem).trigger('apply.daterangepicker', [daterangepickerInstance, selectedDate, selectedDate]);
            } catch (e) {
                log('jQuery trigger failed: ' + e.message);
            }
        }
        
        // Trigger blur to finalize the change (with slight delay to ensure events are processed)
        setTimeout(() => {
            inputElem.blur();
            
            // Additional change event after blur for some date pickers
            inputElem.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        }, 50);
        
        popup.remove();
    }
    
    /**
     * Formats AD date according to input format or locale
     * @param {string} yyyy - Year
     * @param {string} mm - Month
     * @param {string} dd - Day
     * @param {string} currentValue - Current input value
     * @returns {string} - Formatted date string
     */
    function formatDateForInput(yyyy, mm, dd, currentValue) {
        const curVal = currentValue.trim();
        
        // Match current format if possible
        if (/^\d{4}-\d{2}-\d{2}$/.test(curVal)) {
            return `${yyyy}-${mm}-${dd}`;
        }
        
        // Use locale-based format
        const dateFormat = getDateFormatForLocale(_wmeLocale, _wmeRegion);
        return dateFormat === 'DD/MM/YYYY' ? `${dd}/${mm}/${yyyy}` : `${mm}/${dd}/${yyyy}`;
    }
    
    /**
     * Injects the BS date display below the AD input field
     * @param {HTMLElement} inputElem - The date input element
     */
    function setupDateDisplay(inputElem) {
        const containerId = `${inputElem.id}-bs-val`;
        if (document.getElementById(containerId)) return;

        // Create display element
        const bsDisplay = createBSDisplayElement(containerId);

        // Show BS calendar popup on click
        bsDisplay.addEventListener('click', () => {
            if (!isNepaliDateAvailable()) {
                log('NepaliDate library not ready for BS_TO_AD');
                return;
            }
            
            const { popup, grid, prevMonth, nextMonth, ymLabel, bsYear, bsMonth, bsDay } = 
                createCalendarPopup(bsDisplay, inputElem);
            
            let currentYear = bsYear;
            let currentMonth = bsMonth;
            
            // Helper: render calendar
            function render(year, month, selectedDay) {
                renderCalendar(grid, ymLabel, year, month, selectedDay, inputElem, popup);
            }
            
            // Navigation
            prevMonth.onclick = () => {
                if (currentMonth === 1) {
                    currentYear--;
                    currentMonth = 12;
                } else {
                    currentMonth--;
                }
                render(currentYear, currentMonth, null);
            };
            
            nextMonth.onclick = () => {
                if (currentMonth === 12) {
                    currentYear++;
                    currentMonth = 1;
                } else {
                    currentMonth++;
                }
                render(currentYear, currentMonth, null);
            };
            
            // Dismiss on outside click
            function onDocClick(ev) {
                if (!popup.contains(ev.target) && ev.target !== bsDisplay) {
                    popup.remove();
                    document.removeEventListener('mousedown', onDocClick);
                }
            }
            setTimeout(() => {
                document.addEventListener('mousedown', onDocClick);
            }, 0);
            
            // Add to body and render
            document.body.appendChild(popup);
            render(currentYear, currentMonth, bsDay);
        });

        // Insert display element into DOM
        insertBSDisplay(inputElem, bsDisplay);

        // Update initially
        updateBSValue(inputElem, bsDisplay);

        // Listen for changes
        inputElem.addEventListener('input', () => updateBSValue(inputElem, bsDisplay));
        inputElem.addEventListener('change', () => updateBSValue(inputElem, bsDisplay));

        // For advanced closure inputs, poll for value changes
        if (isAdvancedClosureInput(inputElem)) {
            let lastValue = inputElem.value;
            setInterval(() => {
                if (inputElem.value !== lastValue) {
                    lastValue = inputElem.value;
                    updateBSValue(inputElem, bsDisplay);
                }
            }, TIMING.POLLING_INTERVAL);
        }

        // Observe attribute changes for value updates
        const valObserver = new MutationObserver(() => updateBSValue(inputElem, bsDisplay));
        valObserver.observe(inputElem, { attributes: true, attributeFilter: ['value'] });
    }
    
    /**
     * Creates the BS display element
     * @param {string} containerId - The ID for the display element
     * @returns {HTMLElement} - The display element
     */
    function createBSDisplayElement(containerId) {
        const bsDisplay = document.createElement('div');
        bsDisplay.id = containerId;
        bsDisplay.style = 'color: #1e88e5; font-size: 13px; margin-top: 4px; font-weight: bold; padding-left: 5px; cursor: pointer; user-select: text; z-index: 1000; border-radius: 3px;';
        bsDisplay.innerText = 'BS Date: --';

        // Add hover effect
        bsDisplay.addEventListener('mouseenter', () => {
            bsDisplay.style.textDecoration = 'underline';
        });
        bsDisplay.addEventListener('mouseleave', () => {
            bsDisplay.style.textDecoration = '';
        });
        
        return bsDisplay;
    }
    
    /**
     * Inserts the BS display element in the appropriate location
     * @param {HTMLElement} inputElem - The input element
     * @param {HTMLElement} bsDisplay - The BS display element
     */
    function insertBSDisplay(inputElem, bsDisplay) {
        // For advanced closure inputs, insert directly after the input
        if (isAdvancedClosureInput(inputElem)) {
            inputElem.parentNode.insertBefore(bsDisplay, inputElem.nextSibling);
            return;
        }
        
        // Try to insert after .date-time-picker container
        const dateTimePicker = inputElem.closest('.date-time-picker');
        if (dateTimePicker?.parentNode) {
            dateTimePicker.parentNode.insertBefore(bsDisplay, dateTimePicker.nextSibling);
            return;
        }
        
        // Fallback: insert after wz-text-input
        const wzTextInput = inputElem.closest('wz-text-input');
        if (wzTextInput?.parentNode) {
            wzTextInput.parentNode.insertBefore(bsDisplay, wzTextInput.nextSibling);
            return;
        }
        
        // Final fallback: insert after the input element
        inputElem.parentNode.insertBefore(bsDisplay, inputElem.nextSibling);
    }

    // =================================================================
    // DATE CONVERSION
    // =================================================================

    /**
     * Gets WME locale and region information
     */
    function getWmeLocaleAndRegion() {
        try {
            const localeInfo = wmeSDK?.Settings?.getLocale?.();
            if (localeInfo?.localeCode) {
                _wmeLocale = localeInfo.localeCode;
            }
            if (localeInfo?.localeName) {
                _wmeRegion = localeInfo.localeName;
            }
            
            // Try region code as well
            const regionInfo = wmeSDK?.Settings?.getRegionCode?.();
            if (regionInfo?.regionCode) {
                _wmeRegion = regionInfo.regionCode;
            }
        } catch (e) {
            log('Error getting WME locale/region: ' + e.message);
        }
    }

    // Initialize locale/region on script load
    getWmeLocaleAndRegion();

    /**
     * Determines date format for a given locale
     * @param {string|null} locale - Locale code
     * @param {string|null} region - Region code
     * @returns {string} - 'DD/MM/YYYY' or 'MM/DD/YYYY'
     */
    function getDateFormatForLocale(locale, region) {
        if (!locale) return 'MM/DD/YYYY';
        
        const l = locale.toLowerCase();
        
        // DD/MM/YYYY locales
        const ddmmLocales = ['en-gb', 'en-au', 'en-nz', 'en-ie', 'en-za'];
        if (ddmmLocales.includes(l) || l.startsWith('hi') || l.startsWith('ne')) {
            return 'DD/MM/YYYY';
        }
        
        // MM/DD/YYYY locales
        if (l === 'en-us' || l === 'en-ca') {
            return 'MM/DD/YYYY';
        }
        
        // Try region code fallback
        if (region && typeof region === 'string') {
            const r = region.toUpperCase();
            const ddmmRegions = ['GB', 'AU', 'NZ', 'IE', 'ZA'];
            const mmddRegions = ['US', 'CA'];
            
            if (ddmmRegions.includes(r)) return 'DD/MM/YYYY';
            if (mmddRegions.includes(r)) return 'MM/DD/YYYY';
        }
        
        return 'MM/DD/YYYY';
    }

    /**
     * Parses an AD date string and returns components
     * @param {string} adValue - AD date string
     * @returns {Object|null} - {year, month, day, dateStr} or null if invalid
     */
    function parseADDate(adValue) {
        if (!adValue || adValue.length < 8) return null;
        
        let mm, dd, yyyy;
        
        // Support yyyy-mm-dd format
        if (/^\d{4}-\d{2}-\d{2}$/.test(adValue)) {
            [yyyy, mm, dd] = adValue.split('-').map(Number);
            if (isNaN(mm) || isNaN(dd) || isNaN(yyyy)) return null;
            
            return {
                year: yyyy,
                month: mm,
                day: dd,
                dateStr: `${yyyy}-${padZero(mm)}-${padZero(dd)}`
            };
        }
        
        // Support mm/dd/yyyy or dd/mm/yyyy format
        const dateParts = adValue.split('/');
        if (dateParts.length !== 3) return null;
        
        const dateFormat = getDateFormatForLocale(_wmeLocale, _wmeRegion);
        if (dateFormat === 'DD/MM/YYYY') {
            [dd, mm, yyyy] = dateParts.map(p => parseInt(p, 10));
        } else {
            [mm, dd, yyyy] = dateParts.map(p => parseInt(p, 10));
        }
        
        if (isNaN(mm) || isNaN(dd) || isNaN(yyyy)) return null;
        
        // Use UTC to avoid timezone issues
        const utcDate = new Date(Date.UTC(yyyy, mm - 1, dd));
        const dateStr = `${utcDate.getUTCFullYear()}-${padZero(utcDate.getUTCMonth() + 1)}-${padZero(utcDate.getUTCDate())}`;
        
        return { year: yyyy, month: mm, day: dd, dateStr };
    }

    /**
     * Converts AD value to BS and updates the display
     * @param {HTMLElement} inputElem - The input element
     * @param {HTMLElement} displayElem - The display element
     */
    function updateBSValue(inputElem, displayElem) {
        let adValue = inputElem.value;
        adValue = normalizeDevanagariNumerals(adValue);
        log(`Input value: ${adValue}`);
        
        if (!adValue || adValue.length < 8) {
            displayElem.innerText = 'BS Date: --';
            return;
        }

        try {
            // Check if NepaliDate library is available
            if (!isNepaliDateAvailable()) {
                displayElem.innerText = 'BS Date: ⏳ Loading...';
                log('NepaliDate not ready, retrying...');
                setTimeout(() => updateBSValue(inputElem, displayElem), TIMING.LIBRARY_RETRY);
                return;
            }

            // Get locale/region and parse date
            getWmeLocaleAndRegion();
            const parsedDate = parseADDate(adValue);
            
            if (!parsedDate) {
                displayElem.innerText = 'BS Date: Invalid format';
                log('Invalid date format: ' + adValue);
                return;
            }

            log(`Converting (UTC): ${parsedDate.dateStr}`);
            
            // Convert AD to BS
            const bsDateStr = unsafeWindow.NepaliDate.AD_TO_BS(parsedDate.dateStr);
            log(`Result: ${bsDateStr}`);
            
            if (bsDateStr && !bsDateStr.includes('Error') && !bsDateStr.includes('Invalid')) {
                if (calendarLang === 'ne') {
                    displayElem.innerText = `बि.सं.: ${toDevanagari(bsDateStr)}`;
                } else {
                    displayElem.innerText = `BS: ${bsDateStr}`;
                }
            } else {
                displayElem.innerText = `BS Date: ${bsDateStr}`;
                log('Conversion returned error: ' + bsDateStr);
            }
        } catch (e) {
            displayElem.innerText = 'BS Date: Error';
            log('Error: ' + e.message);
        }
    }

    // =================================================================
    // SCRIPT UPDATE MONITOR
    // =================================================================
    
    /**
     * Initializes the script update monitor
     */
    function scriptupdatemonitor() {
        if (WazeToastr?.Ready) {
            // Create and start the ScriptUpdateMonitor
            const updateMonitor = new WazeToastr.Alerts.ScriptUpdateMonitor(
                scriptName, 
                scriptVersion, 
                downloadUrl, 
                GM_xmlhttpRequest
            );
            updateMonitor.start(2, true); // Check every 2 hours, check immediately

            // Show the update dialog for the current version
            WazeToastr.Interface.ShowScriptUpdate(
                scriptName, 
                scriptVersion, 
                updateMessage, 
                downloadUrl, 
                forumURL
            );
        } else {
            setTimeout(scriptupdatemonitor, TIMING.BOOTSTRAP_RETRY);
        }
    }
    
    scriptupdatemonitor();
    log(`${scriptName} initialized.`);
})();

/******** Version changelog  ********
Version 0.2.1 - 2026-02-09:
    - Now properly apply dates for both regular date inputs and closure start/end dates<br>
    - Code cleanup for various minor bugs and improved stability
Version 0.2.0 - 2026-01-26:
    - Now it will able to convert all the native WME calenders into BS calenders<br>
    - Fixed date conversion format issue<br>
    - Fixed various minor bugs and improved stability
Version 0.1.9 - 2026-01-26:
    - Added support for WME Advanced Closures script's calender date to BS conversion<br>
    - Fixed date conversion format issue<br>
    - Fixed various minor bugs and improved stability
Version 0.1.6-8 - 2026-01-25:
    - Added Nepali calendar display support
    - Added an option to choose between Nepali and English calendar display in the script tab
    - Fixed date conversion issues due to timezone discrepancies
    - Fixed various minor bugs and improved stability
Version 0.1.6-7 - 2026-01-25:
    - Added support for various WME Locales
    - Added Nepali calendar display support
    - Added an option to choose between Nepali and English calendar display in the script tab
    - Fixed date conversion issues due to timezone discrepancies
    - Fixed various minor bugs and improved stability
Version 0.1.5 - 2026-01-24
    - Fixed issue where calender was showing wrong dates for BS
    - Will add support for more date inputs in future updates
Version 0.1.4 - 2026-01-24
    - Currently supports for native UI for closure segment
    - Will add support for more date inputs in future updates
    
*********************/