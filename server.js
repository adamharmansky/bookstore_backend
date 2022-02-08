const express = require('express');
const https = require('https');
const mysql = require('mysql');
const util = require('util');
const url = require('url');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const admin = require('./admin.js');

const page_size = 10;
const port = 3001;
const default_exp_time = 3600000;

const filePath = '/web/bookstore/files/';
const fileUrl = 'https://bookstore.harmansky.xyz/pub/';
var sql = mysql.createConnection({ socketPath: '/run/mysqld/mysqld.sock', user: 'root' });
var key = fs.readFileSync('/etc/letsencrypt/live/bookstore.harmansky.xyz/privkey.pem');
var cert = fs.readFileSync('/etc/letsencrypt/live/bookstore.harmansky.xyz/cert.pem');
var options = {
    key: key,
    cert: cert
};


const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(fileUpload());
app.use(cookieParser());

app.post('/login', (req, res)         => admin.login(req, res, sql));
app.post('/logout', (req, res)        => admin.logout(req, res, sql));
app.post('/verifykey', (req, res)     => admin.verifykey(req, res, sql));
app.post('/book/remove', (req, res)   => admin.book_remove(req, res, sql));
app.post('/author/remove', (req, res) => admin.author_remove(req, res, sql));
app.post('/book/new', (req, res)      => admin.book_new(req, res, sql));
app.post('/image/new', (req, res)     => admin.image_new(req, res, sql));

// detailed info on a single book
app.get('/book', (req, res) => {
    const urlObject = url.parse(req.url, true);
    if (!urlObject.query.book) {
        res.send(400);
        return;
    }

    sql.query(
        "SELECT * FROM books LEFT JOIN subjects USING (subject_id) LEFT JOIN languages USING (lang_id) WHERE isbn=" + sql.escape(urlObject.query.book)
    , (err, result) => {
        if (err) {
            console.log(err);
            res.send(500);
            return;
        }
        if (result.length > 0) {

            sql.query(
                "SELECT author_name, author_id FROM projects LEFT JOIN authors USING (author_id) LEFT JOIN books USING(isbn) WHERE isbn=" + sql.escape(result[0].isbn)
            , (authorErr, authorResult) => {
                if (authorErr) {
                    console.log(pageCountErr);
                    res.send(500);
                    return;
                }
                result[0].authors = authorResult;
                res.send(result[0]);
            });
        } else {
            res.send(404);
            return;
        }
    });
});

// List of books (with pagination)
app.get('/list', async (req, res) => {
    const urlObject = url.parse(req.url, true);

    var sql_command = "SELECT * FROM books LEFT JOIN subjects USING (subject_id) LEFT JOIN languages USING (lang_id)";
    var search = (urlObject.query.q) ? (" WHERE (title LIKE " + sql.escape("%" + urlObject.query.q + "%") + " OR keywords LIKE " + sql.escape("%" + urlObject.query.q + "%") + ")") : '';
    if (urlObject.query.subject) {
        search += (urlObject.query.q ? "AND" : " WHERE") + " subject_id=" + sql.escape(urlObject.query.subject);
    }
    sql_command += search;

    // Ordering of the list
    // we need to filter the options manually so we don't get an sql injection
    sql_command += ' ORDER_BY '
    switch (urlObject.query.order_by) {
        case 'isbn':
        case 'title':
        case 'subject_id':
        case 'read_time':
        case 'pages':
        case 'year_pub':
            sql_command += urlObject.query.order_by;
            break;
        default:
            sql_command += 'year_pub';
    }
    sql_command += urlObject.query.reverse ? ' DESC' : ' ASC';

    // pagination
    var page = isNaN(urlObject.query.page) ? 0 : parseInt(urlObject.query.page);
    sql_command += " LIMIT " + (page*page_size) + ", " + page_size;

    sql.query(sql_command, (err, result) => {
        if (err) {
            console.log(err);
            res.send(500);
            return;
        }
        if (result.length > 0) {
            // calculate number of pages from total number of elements
            sql.query("SELECT COUNT(*) FROM books" + search, (pageCountErr, pageCountResult) => {
                if (pageCountErr) {
                    console.log(pageCountErr);
                    res.send(500);
                    return;
                }
                sql.query(
                    "SELECT author_name, author_id, isbn FROM projects LEFT JOIN authors USING (author_id) LEFT JOIN books USING(isbn) WHERE"
                    + result.map((book) => (" isbn=" + sql.escape(book.isbn))).join(" OR")
                , (authorErr, authorResult) => {
                    if (authorErr) {
                        console.log(authorErr);
                        res.send(500);
                        return;
                    }
                    res.send({
                        books:
                            result.map((book) => {
                                book.authors = authorResult.filter((author) => {return author.isbn == book.isbn});
                                return book;
                            }),
                        pageCount: Math.ceil(pageCountResult[0]['COUNT(*)']/page_size)
                    });
                });
            });
        } else {
            res.send({
                books: [],
                pageCount: 0
            });
        }
    });
});

// list of authors, with their books
app.get('/author/list', (req, res) => {
    const urlObject = url.parse(req.url, true);

    const search = (urlObject.query.q) ? (" WHERE author_name LIKE " + sql.escape('%' + urlObject.query.q + '%')) : "";
    var sql_command = "SELECT * FROM authors" + search;

    // pagination
    var page = isNaN(urlObject.query.page) ? 0 : parseInt(urlObject.query.page);
    sql_command += " LIMIT " + (page*page_size) + ", " + page_size;

    sql.query(sql_command, (err, result) => {
        if (err) {
            console.log(err);
            res.send(500);
            return;
        }
        if (result.length > 0) {
            // calculate number of pages from total number of elements
            sql.query("SELECT COUNT(*) FROM authors" + search, (size_err, size_result) => {
                if (size_err) {
                    console.log(size_err);
                    res.send(500);
                    return;
                }
                res.send({
                    authors: result,
                    pageCount: Math.ceil(size_result[0]['COUNT(*)']/page_size)
                });
            });
        } else {
            res.send(404);
            return;
        }
    });
});

// quick list of authors to get their names (for AddBook, etc.)
app.get('/author/short', (req, res) => {
    sql.query("SELECT * FROM authors", (err, result) => {
        if (err) {
            console.log(err);
            res.send(500);
            return;
        }
        res.send(result);
    });
});

// quick list of languages to get their names (for AddBook, etc.)
app.get('/lang/short', (req, res) => {
    sql.query("SELECT * FROM languages", (err, result) => {
        if (err) {
            console.log(err);
            res.send(500);
            return;
        }
        res.send(result);
    });
});

app.get('/author', (req, res) => {
    const urlObject = url.parse(req.url, true);

    if (!urlObject.query.author) {
        res.send(400);
        return;
    }

    const search = urlObject.query.author ? " WHERE author_id=" + sql.escape(urlObject.query.author) : "";

    sql.query("SELECT * FROM authors" + search, (err, result) => {
        if (err) {
            console.log(err);
            res.send(500);
            return;
        }
        if (result.length > 0) {
            // Get the authors books
            sql.query("SELECT * FROM projects LEFT JOIN books USING (isbn)" + search, (book_err, books) => {
                if (book_err) {
                    console.log(book_err);
                    res.send(500);
                    return;
                }
                result[0].books = books;
                res.send(result[0])
            })
        } else {
            res.send(404);
            return;
        }
    });
});

app.get('/subject/list', (req, res) => {
    const sql_command = 'SELECT * FROM subjects';
    sql.query(sql_command, (err, result) => {
        if (err) {
            res.send(500);
            return;
        }
        res.send(result);
    });
});

app.get('/subject', (req, res) => {
    const urlObject = url.parse(req.url, true);
    if (!urlObject.query.subject) {
        res.sent(400);
        return;
    }

    sql.query('SELECT * FROM subjects WHERE subject_id=' + urlObject.query.subject, (err, result) => {
        if (err) {
            res.send(500);
            return;
        }
        if (result.length == 0) {
            res.send(404);
            return;
        }
        res.send(result[0]);
    });
});

var server = https.createServer(options, app);

// SQL connection
// requires unix socket authentication - script MUST be run as root!!!!
sql.connect((err) => {
    if (err) throw err;
    console.log('Connected to SQL server');
    sql.query("USE bookstore", (err, result) => {
        if (err) throw err;
        console.log('Selected database: ' + JSON.stringify(result));
    });
});

app.listen(port, () => {
    console.log('Server started successfully');
});
