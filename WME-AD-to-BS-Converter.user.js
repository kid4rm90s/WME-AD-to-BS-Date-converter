// ==UserScript==
// @name         WME AD to BS Converter
// @namespace    https://greasyfork.org/users/1087400
// @version      0.1.3
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
// @downloadURL https://raw.githubusercontent.com/kid4rm90s/WME-AD-to-BS-Date-converter/main/WME-AD-to-BS-Converter.user.js
// @updateURL https://raw.githubusercontent.com/kid4rm90s/WME-AD-to-BS-Date-converter/main/WME-AD-to-BS-Converter.user.js
// ==/UserScript==

(function main() {
    'use strict';

    const scriptName = GM_info.script.name;
    const scriptVersion = GM_info.script.version;
    let wmeSDK;

    const log = (message) => console.log('WME_ADtoBS: ' + message);

    /**
     * Load and inject NepaliDate library
     */
    function loadNepaliDate() {
        return new Promise((resolve) => {
            if (unsafeWindow.NepaliDate && typeof unsafeWindow.NepaliDate.AD_TO_BS === 'function') {
                log('✓ NepaliDate library already available');
                resolve();
                return;
            }

            log('Fetching NepaliDate library from GitHub...');
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://kid4rm90s.github.io/NepaliBStoAD/NepaliBStoAD.js',
                timeout: 10000,
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
                            if (unsafeWindow.NepaliDate && typeof unsafeWindow.NepaliDate.AD_TO_BS === 'function') {
                                log('✓ NepaliDate library loaded and ready');
                                resolve();
                            } else {
                                log('⚠ NepaliDate not found after injection, retrying...');
                                // If still not available, try again after longer delay
                                setTimeout(() => {
                                    if (unsafeWindow.NepaliDate && typeof unsafeWindow.NepaliDate.AD_TO_BS === 'function') {
                                        log('✓ NepaliDate library available on retry');
                                        resolve();
                                    } else {
                                        log('✗ Failed to load NepaliDate library');
                                        resolve();
                                    }
                                }, 1000);
                            }
                        }, 300);
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

    unsafeWindow.SDK_INITIALIZED.then(initScript);

    function initScript() {
        wmeSDK = getWmeSdk({
            scriptId: 'WME_ADtoBS',
            scriptName: 'WME AD to BS Converter',
        });
        
        // Load NepaliDate library before starting
        loadNepaliDate().then(() => {
            WME_ADtoBS_bootstrap();
        });
    }

    const WME_ADtoBS_bootstrap = () => {
        if (!document.getElementById('edit-panel') || !wmeSDK.DataModel.Countries.getTopCountry()) {
            setTimeout(WME_ADtoBS_bootstrap, 250);
            return;
        }
        if (wmeSDK.State.isReady) {
            WME_ADtoBS_init();
        } else {
            wmeSDK.Events.once({ eventName: 'wme-ready' }).then(WME_ADtoBS_init);
        }
    };

    const WME_ADtoBS_init = () => {
        log('Initing Observer');
        
        // Log library version for debugging
        if (unsafeWindow.NepaliDate && unsafeWindow.NepaliDate.version) {
            log('NepaliDate library version: ' + unsafeWindow.NepaliDate.version);
        }

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Look for Closure Date Inputs
                        const startInput = node.querySelector('#closure_startDate');
                        const endInput = node.querySelector('#closure_endDate');

                        if (startInput) setupDateDisplay(startInput);
                        if (endInput) setupDateDisplay(endInput);
                    }
                });
            });
        });

        observer.observe(document.getElementById('edit-panel'), {
            childList: true,
            subtree: true,
        });

        log('Observer started on edit-panel');
    };

    /**
     * Injects the BS date display below the AD input field
     */
    function setupDateDisplay(inputElem) {
        const containerId = inputElem.id + '-bs-val';
        if (document.getElementById(containerId)) return;


        // Create display element
        const bsDisplay = document.createElement('div');
        bsDisplay.id = containerId;
        bsDisplay.style = 'color: #1e88e5; font-size: 13px; margin-top: 4px; font-weight: bold; padding-left: 5px; cursor: pointer; user-select: text;';
        bsDisplay.innerText = 'BS Date: --';

        // Add hover effect
        bsDisplay.addEventListener('mouseenter', () => {
            bsDisplay.style.textDecoration = 'underline';
        });
        bsDisplay.addEventListener('mouseleave', () => {
            bsDisplay.style.textDecoration = '';
        });

        // Make BS date selectable and editable
        bsDisplay.addEventListener('click', () => {
            if (!unsafeWindow.NepaliDate || typeof unsafeWindow.NepaliDate.BS_TO_AD !== 'function') {
                log('NepaliDate library not ready for BS_TO_AD');
                return;
            }
            // Get current BS value (strip prefix and flag)
            let currentText = bsDisplay.innerText.replace(/^🇳🇵 BS:\s*/, '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(currentText)) {
                currentText = '';
            }
            const userBS = prompt('Enter BS date (YYYY-MM-DD):', currentText);
            if (!userBS) return;
            // Validate format
            if (!/^\d{4}-\d{2}-\d{2}$/.test(userBS)) {
                alert('Invalid format. Please use YYYY-MM-DD.');
                return;
            }
            // Convert BS to AD
            const adDateStr = unsafeWindow.NepaliDate.BS_TO_AD(userBS);
            log('BS_TO_AD conversion: ' + userBS + ' -> ' + adDateStr);
            if (!adDateStr || adDateStr.includes('Error') || adDateStr.includes('Invalid')) {
                alert('Conversion failed: ' + adDateStr);
                return;
            }
            // Convert YYYY-MM-DD to MM/DD/YYYY for the AD input
            const adParts = adDateStr.split('-');
            if (adParts.length === 3) {
                const mm = adParts[1].padStart(2, '0');
                const dd = adParts[2].padStart(2, '0');
                const yyyy = adParts[0];
                const adInputVal = `${mm}/${dd}/${yyyy}`;
                inputElem.value = adInputVal;
                // Trigger input event to update listeners/UI
                inputElem.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                alert('Unexpected AD date format: ' + adDateStr);
            }
        });

        // Insert after the .date-time-picker container
        let dateTimePicker = inputElem.closest('.date-time-picker');
        if (dateTimePicker && dateTimePicker.parentNode) {
            dateTimePicker.parentNode.insertBefore(bsDisplay, dateTimePicker.nextSibling);
        } else {
            // fallback: insert after the wz-text-input
            let wzTextInput = inputElem.closest('wz-text-input');
            if (wzTextInput && wzTextInput.parentNode) {
                wzTextInput.parentNode.insertBefore(bsDisplay, wzTextInput.nextSibling);
            } else {
                // fallback: insert after the inputElem
                inputElem.parentNode.insertBefore(bsDisplay, inputElem.nextSibling);
            }
        }

        // Update initially
        updateBSValue(inputElem, bsDisplay);

        // Listen for changes (WME updates values dynamically)
        inputElem.addEventListener('input', () => updateBSValue(inputElem, bsDisplay));

        // Waze custom elements sometimes don't fire standard input events on programmatic change
        // We use a small interval or observer if necessary, but 'input' usually catches manual changes
        const valObserver = new MutationObserver(() => updateBSValue(inputElem, bsDisplay));
        valObserver.observe(inputElem, { attributes: true, attributeFilter: ['value'] });
    }

        /**
     * Logic to convert AD value from input to BS and update the label
     */
    function updateBSValue(inputElem, displayElem) {
        const adValue = inputElem.value; // Expected: "MM/DD/YYYY"
        log(`Input value: ${adValue}`);
        if (!adValue || adValue.length < 8) {
            displayElem.innerText = 'BS Date: --';
            return;
        }

        try {
            // Check if NepaliDate library is available
            if (!unsafeWindow.NepaliDate || typeof unsafeWindow.NepaliDate.AD_TO_BS !== 'function') {
                displayElem.innerText = 'BS Date: ⏳ Loading...';
                log('NepaliDate not ready, retrying in 500ms...');
                // Retry after a short delay
                setTimeout(() => updateBSValue(inputElem, displayElem), 500);
                return;
            }

            const dateParts = adValue.split('/');
            if (dateParts.length === 3) {
                const mm = parseInt(dateParts[0], 10);
                const dd = parseInt(dateParts[1], 10);
                const yyyy = parseInt(dateParts[2], 10);

                // Validate parsed numbers
                if (isNaN(mm) || isNaN(dd) || isNaN(yyyy)) {
                    displayElem.innerText = 'BS Date: Invalid date';
                    log('Invalid date parts: mm=' + mm + ', dd=' + dd + ', yyyy=' + yyyy);
                    return;
                }

                // Construct a UTC date string to avoid timezone issues
                // Use Date.UTC to ensure the date is not shifted by local timezone
                const utcDate = new Date(Date.UTC(yyyy, mm - 1, dd));
                const adDateStr = `${utcDate.getUTCFullYear()}-${String(utcDate.getUTCMonth() + 1).padStart(2, '0')}-${String(utcDate.getUTCDate()).padStart(2, '0')}`;
                log(`Converting (UTC): ${adDateStr}`);

                // Using NepaliDate.AD_TO_BS() to convert AD to BS
                const bsDateStr = unsafeWindow.NepaliDate.AD_TO_BS(adDateStr);
                log(`Result: ${bsDateStr}`);
                
                if (bsDateStr && !bsDateStr.includes('Error') && !bsDateStr.includes('Invalid')) {
                    displayElem.innerText = `🇳🇵 BS: ${bsDateStr}`;
                } else {
                    displayElem.innerText = `BS Date: ${bsDateStr}`;
                    log('Conversion returned error: ' + bsDateStr);
                }
            } else {
                displayElem.innerText = 'BS Date: Invalid format';
                log('Invalid date format: ' + adValue);
            }
        } catch (e) {
            displayElem.innerText = 'BS Date: Error';
            log('Error: ' + e.message);
        }
    }

    // Existing update monitor logic...
    function scriptupdatemonitor() {
        if (WazeToastr?.Ready) {
            const updateMonitor = new WazeToastr.Alerts.ScriptUpdateMonitor(
                scriptName, scriptVersion, GM_info.script.downloadURL, GM_xmlhttpRequest, GM_info.script.downloadURL, /@version\s+(.+)/i
            );
            updateMonitor.start(2, true);
        } else {
            setTimeout(scriptupdatemonitor, 250);
        }
    }
    scriptupdatemonitor();
})();