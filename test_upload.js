const http = require('http');
const fs = require('fs');
const path = require('path');

const boundary = 'TestBoundary12345';
const filePath = path.join(__dirname, 'EDIS_Implementation_Plan.docx');
const fileBuffer = fs.readFileSync(filePath);
const filename = 'EDIS_Implementation_Plan.docx';

const body = Buffer.concat([
  Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + filename + '"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n'),
  fileBuffer,
  Buffer.from('\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="category"\r\n\r\nreport\r\n--' + boundary + '--\r\n')
]);

const opts = {
  hostname: '127.0.0.1', port: 5173,
  path: '/api/upload', method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=' + boundary,
    'Content-Length': body.length
  }
};

console.log('Uploading', filename, '(' + fileBuffer.length + ' bytes) via Vite proxy...');

const r = http.request(opts, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('Upload HTTP status:', res.statusCode);
    try {
      const json = JSON.parse(d);
      if (json.error) {
        console.log('ERROR from server:', json.error);
      } else {
        console.log('SUCCESS!');
        console.log('  Doc ID:      ', json.document?.id);
        console.log('  Doc Name:    ', json.document?.name);
        console.log('  Doc Status:  ', json.document?.status);
        console.log('  Page Count:  ', json.document?.pageCount);
        console.log('  Summary:     ', json.document?.summary?.oneLine?.substring(0, 80));
      }
    } catch(e) {
      console.log('Raw response:', d.substring(0, 400));
    }
  });
});
r.on('error', e => console.error('UPLOAD FAILED:', e.message));
r.write(body);
r.end();
