const express = require('express');
const https = require('https');
const mysql = require('mysql');
const util = require('util');
const url = require('url');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');

const page_size = 6;
const port = 3001;

const filePath='/web/bookstore/files/';
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

// Incomplete
app.post('/book/new', (req, res) => { 
    console.log(req.body);
    res.send(200);
    // TODO: check for matchong ISBN when adding a book
});

// Api for getting info about 1 book
app.get('/book', (req, res) => { const urlObject = url.parse(req.url, true);
    if (!urlObject.query.book) { // '?book=' is empty
        res.send(400);
        return;
    }

    var sql_command = "SELECT * FROM books LEFT JOIN subjects USING (subject_id) LEFT JOIN languages USING (lang_id) WHERE isbn=" + urlObject.query.book;
    console.log(sql_command);

    sql.query(sql_command, (err, result) => {
        if (err) {
            console.log(err);
            res.send(500);
            return;
        }
        if (result.length > 0) {
            let author_command = "SELECT author_name, author_id FROM projects LEFT JOIN authors USING (author_id) LEFT JOIN books USING(isbn) WHERE isbn=" + result[0].isbn;
            console.log(author_command);

            sql.query(author_command, (authorErr, authorResult) => {
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

// Api for getting info about the list of books - in multiple pages
app.get('/list', async (req, res) => {
    const urlObject = url.parse(req.url, true);

    // SQL command for searching
    var sql_command = "SELECT * FROM books LEFT JOIN subjects USING (subject_id) LEFT JOIN languages USING (lang_id)";
    var search = (urlObject.query.q) ? (" WHERE title LIKE '%" + urlObject.query.q + "%' OR keywords LIKE '%" + urlObject.query.q + "%'") : '';
    sql_command += search;

    // Ordering of the list
    if (urlObject.query.order_by) sql_command += ' ORDER BY ' + urlObject.query.order_by;
    else                          sql_command += ' ORDER BY ' + "year_pub";
    if (urlObject.query.order) sql_command += " " + urlObject.query.order;
    else                       sql_command += " DESC";

    // Pagination - using LIMIT to chop up list into pages
    var page = urlObject.query.page ? urlObject.query.page : 0;
    sql_command += " LIMIT " + (page*page_size) + ", " + page_size;

    console.log(sql_command);

    sql.query(sql_command, (err, result) => {
        if (err) {
            console.log(err);
            res.send(500);
            return;
        }
        if (result.length > 0) {
            sql.query("SELECT COUNT(*) FROM books" + search, (pageCountErr, pageCountResult) => {
                if (pageCountErr) {
                    console.log(pageCountErr);
                    res.send(500);
                    return;
                }
                let author_command = "SELECT author_name, author_id, isbn FROM projects LEFT JOIN authors USING (author_id) LEFT JOIN books USING(isbn) WHERE" + result.map((book) => {
                    return " isbn='" + book.isbn + "'";
                }).join(" OR");
                console.log(author_command);
                sql.query(author_command, (authorErr, authorResult) => {
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

    const search = (urlObject.query.q) ? (" WHERE author_name LIKE '%" + urlObject.query.q + "%'") : "";
    var sql_command = "SELECT * FROM authors" + search;
    const page = urlObject.query.page ? urlObject.query.page : 0;
    sql_command += " LIMIT " + (page*page_size) + ", " + page_size;

    console.log(sql_command);

    sql.query(sql_command, (err, result) => {
        if (err) {
            console.log(err);
            res.send(500);
            return;
        }
        if (result.length > 0) {
            // calculate number of pages from total number of elements
            size_command = "SELECT COUNT(*) FROM authors" + search;
            sql.query(size_command, (size_err, size_result) => {
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

    // TODO: maybe return 400 if urlObject.query.author is null
    const search = urlObject.query.author ? " WHERE author_id='" + urlObject.query.author + "'" : "";
    var sql_command = "SELECT * FROM authors" + search;

    console.log(sql_command);

    sql.query(sql_command, (err, result) => {
        if (err) {
            console.log(err);
            res.send(500);
            return;
        }
        if (result.length > 0) {
            // Getting the authors books 
            const book_command = "SELECT * FROM projects LEFT JOIN books USING (isbn)" + search;
            sql.query(book_command, (book_err, books) => {
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
    const sql_command = 'SELECT * FROM subjects WHERE subject_id=' + urlObject.query.subject;
    sql.query(sql_command, (err, result) => {
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

app.post('/image/new', (req, res) => {
    if (!req.files || Object.keys(req.files).length === 0) {
        res.send(400);
    }
    console.log("Uploading file into " + filePath + req.files.image.name);
    req.files.image.mv(filePath + req.files.image.name, (err) => {
        if (err) {
            res.send(500);
            console.log(err);
            return;
        }
        res.send(200);
    });
});

var server = https.createServer(options, app);

// SQL connection
// requires unix socket authentication - script MUST be run as root!!!!
sql.connect((err) => {
    if (err) throw err;
    console.log('Connected to SQL database');
    sql.query("USE bookstore", (err, result) => {
        if (err) throw err;
        console.log('Selected database: ' + JSON.stringify(result));
    });
});

app.listen(port, () => {
    console.log('Server started successfully');
});
