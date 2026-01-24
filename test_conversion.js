// Test script to verify AD to BS date conversion
// This tests the date conversion with various dates to find any off-by-one errors

const https = require('https');

// Fetch the NepaliDate library from GitHub
https.get('https://kid4rm90s.github.io/NepaliBStoAD/NepaliBStoAD.js', (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        try {
            // Execute the library code
            eval(data);
            
            // Run tests
            if (typeof NepaliDate !== 'undefined' && typeof NepaliDate.AD_TO_BS === 'function') {
                console.log('✓ NepaliDate library loaded successfully\n');
                
                // Test cases from the issue
                const testDates = [
                    { input: '2026-01-24', current: '2082-10-10', expected: '2082-10-10' },
                    { input: '2026-03-22', current: '2082-12-07', expected: '2082-12-08' }
                ];
                
                console.log('Testing AD to BS conversion:\n');
                testDates.forEach((test, idx) => {
                    const result = NepaliDate.AD_TO_BS(test.input);
                    const matches = result === test.expected;
                    const status = matches ? '✓ PASS' : '✗ FAIL';
                    console.log(`Test ${idx + 1}: ${status}`);
                    console.log(`  Input AD:     ${test.input}`);
                    console.log(`  Library Result: ${result}`);
                    console.log(`  Expected BS:  ${test.expected}`);
                    if (!matches) {
                        console.log(`  ⚠ OFF BY: ${result === test.current ? 'MATCHES CURRENT (BUG CONFIRMED)' : 'DIFFERS'}`);
                    }
                    console.log();
                });
                
                // Additional verification: convert back to AD
                console.log('Verification - Converting BS back to AD:\n');
                testDates.forEach((test, idx) => {
                    const result = NepaliDate.AD_TO_BS(test.input);
                    const backToAD = NepaliDate.BS_TO_AD(result);
                    console.log(`Test ${idx + 1}:`);
                    console.log(`  BS: ${result} → AD: ${backToAD} (original: ${test.input})`);
                    console.log();
                });
            } else {
                console.error('✗ Failed to load NepaliDate library');
            }
        } catch (e) {
            console.error('Error executing library:', e.message);
        }
    });
}).on('error', (error) => {
    console.error('Error fetching library:', error.message);
});
