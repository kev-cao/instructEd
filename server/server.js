const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const app = express();
const db = require('./queries');
const { withAuth } = require('./middleware');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.resolve(__dirname, '../react-ui/build')));

app.post('/users', db.createUser);
app.post('/authenticate', db.loginUser);
app.post('/forgotPassword', db.forgotPassword);
app.post('/updatePassword', db.updatePassword);
app.get('/resetPassword/:token', db.resetPassword);
app.get('/dashboard', withAuth, (req, res) => {
  res.send('HI');
});

// Catch All
app.use('/static', express.static(path.join(__dirname, '../react-ui/build/static')));

app.get('*', (req, res) => {
  res.sendFile('index.html', { root: path.join(__dirname, '../../react-ui/build/') }, (err) => {
    if (err) {
      res.status(500).send(err);
    }
  });
});

app.listen(process.env.PORT || 5000);
console.log(`Server started. Listening on port ${process.env.PORT || 5000}`);
