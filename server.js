const express = require('express');
const https = require('https');
const util = require('util');
const url = require('url');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const cookieParser = require('cookie-parser');
const admin = require('./admin.js');
const BookDatabase = require('./db.js');

const config = require('./config.js');

var key = fs.readFileSync('/etc/letsencrypt/live/bookstore.harmansky.xyz/privkey.pem');
var cert = fs.readFileSync('/etc/letsencrypt/live/bookstore.harmansky.xyz/cert.pem');
var options = {
    key: key,
    cert: cert
};

const db = new BookDatabase();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true, limit: '100000kb'}));
app.use(fileUpload());
app.use(cookieParser());

app.post('/login', (req, res)         => admin.login(req, res, db));
app.post('/logout', (req, res)        => admin.logout(req, res));
app.post('/verifykey', (req, res)     => admin.verifykey(req, res));
app.post('/book/remove', (req, res)   => admin.book_remove(req, res, db));
app.post('/author/remove', (req, res) => admin.author_remove(req, res, db));
app.post('/book/new', (req, res)      => admin.book_new(req, res, db.sql));

app.post('/gallery', (req, res)       =>  admin.gallery_new(req, res, db.sql));
app.delete('/gallery', (req, res)     =>  admin.gallery_remove(req, res, db.sql));

// pictures in the gallery on the front page
app.get('/gallery', (req, res) => {
    db.gallery((err, result) => {
        if (err) {
            res.send(500);
            console.log(err);
        } else
            res.send (result);
    });
});

// detailed info on a single book
app.get('/book', (req, res) => {
    const urlObject = url.parse(req.url, true);
    if (!urlObject.query.book) {
        res.send(400);
        return;
    }
    db.book(urlObject.query.book, (err, result) => {
        if (err) {
            res.send(500);
            console.log(err);
        } else if (result) res.send(result);
        else               res.send(404);
    });
});

// List of books (with pagination)
app.get('/list', (req, res) => {
    const urlObject = url.parse(req.url, true);
    db.book_list(
        urlObject.query.q,
        isNaN(urlObject.query.page)?0:urlObject.query.page,
        urlObject.query.subject,
        urlObject.query.order_by,
        urlObject.query.reverse == "true",
        (err, result) => {
            if (err) {
                console.log(err);
                res.send(500);
                return;
            }
            db.book_count(
                urlObject.query.q,
                urlObject.query.subject, 
                (count_err, count_result) => {
                    if (count_err) {
                        console.log(count_err);
                        res.send(500);
                        return;
                    }
                    res.send({
                        books: result,
                        pageCount: Math.ceil(count_result/config.page_size)
                    });
                }
            );
        }
    );
});

// list of authors, with their books
app.get('/author/list', (req, res) => {
    const urlObject = url.parse(req.url, true);
    db.author_list(
        urlObject.query.q,
        isNaN(urlObject.query.page)?0:urlObject.query.page,
        (err, result) => {
            if (err) {
                console.log(err);
                res.send(500);
                return;
            }
            db.author_count(urlObject.query.q, (count_err, count_result) => {
                if (count_err) {
                    console.log(count_err);
                    res.send(500);
                    return;
                }
                res.send({
                    authors: result,
                    pageCount: Math.ceil(count_result/config.page_size)
                });
            });
        }
    );
});

// quick list of authors to get their names (for AddBook, etc.)
app.get('/author/short', (req, res) => {
    db.author_list_all((err, result)=> {
        if (err) {
            console.log(err);
            res.send(500);
        } else res.send(result);
    });
});

// quick list of languages to get their names (for AddBook, etc.)
app.get('/lang/short', (req, res) => {
    db.lang_list_all((err, result)=> {
        if (err) {
            console.log(err);
            res.send(500);
        } else res.send(result);
    });
});

app.get('/author', (req, res) => {
    const urlObject = url.parse(req.url, true);
    if (!urlObject.query.author) {
        res.send(400);
        return;
    }
    db.author(urlObject.query.author, (err, result) => {
        if (err) {
            console.log(err);
            res.send(500);
        } else {
            res.send(result);
        }
    });
});

app.get('/subject/list', (req, res) => {
    const sql_command = 'SELECT * FROM subjects';
    db.subject_list_all((err, result)=> {
        if (err) {
            console.log(err);
            res.send(500);
        } else res.send(result);
    });
});

app.get('/subject', (req, res) => {
    const urlObject = url.parse(req.url, true);
    if (!urlObject.query.subject) {
        res.sent(400);
        return;
    }
    db.subject(urlObject.query.subject, (err, result)=> {
        if (err) {
            console.log(err);
            res.send(500);
        } else if (result) {
            res.send(result);
        } else res.send(404);
    });

});

var server = https.createServer(options, app);

app.listen(config.port, () => {
    console.log('Server started successfully');
});
