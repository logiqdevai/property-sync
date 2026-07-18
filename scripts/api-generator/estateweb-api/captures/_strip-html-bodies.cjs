const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'session-2.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

data.entries = (data.entries ?? []).map((entry) => ({
  id: entry.id,
  timestamp: entry.timestamp,
  duration: entry.duration,
  request: {
    method: entry.request?.method,
    url: entry.request?.url,
    path: entry.request?.path,
    body: entry.request?.body,
  },
}));

data.entryCount = data.entries.length;

fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
console.log(`Slimmed ${data.entryCount} entries to id/timestamp/duration/request.{method,url,path,body}.`);
