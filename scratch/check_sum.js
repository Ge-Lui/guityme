const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
const sum = data.entries.reduce((s, e) => s + (e.hours || 0), 0);
console.log('Sum of hours:', sum);
console.log('Count of entries:', data.entries.length);
