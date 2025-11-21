const express = require('express');
const path = require('path');
const app = express();
const port = 8080;

// Serve everything from the root directory
app.use(express.static(path.join(__dirname, '..')));

// Fallback to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(port, () => {
  console.log(`MicrobeTrace is running at http://localhost:${port}`);
});
