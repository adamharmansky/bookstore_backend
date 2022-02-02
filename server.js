const express = require('express');
const https = require('https');
const mysql = require('mysql');
const util = require('util');
const url = require('url');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');

const page_size = 6;

allowed_websites = 'https://bookstore.harmansky.xyz';
const port = 3001;

var sql_connection = mysql.createConnection({ socketPath: '/run/mysqld/mysqld.sock', user: 'root' });
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

app.post('/book/new', (req, res) => {
	console.log(req.body);
	res.send(200);
});

app.get('/book', (req, res) => {
	const urlObject = url.parse(req.url, true);
	if (!urlObject.query.book) {
		res.send(400);
		return;
	}

	var sql_command = "SELECT * FROM books LEFT JOIN subjects USING (subject_id) LEFT JOIN languages USING (lang_id) WHERE isbn=" + urlObject.query.book;

	console.log(sql_command);

	sql_connection.query(sql_command, (err, result) => {
		if (err) {
			console.log(err);
			res.send(500);
			return;
		}
		if (result.length > 0) {
			let author_command = "SELECT author_name, author_id FROM projects LEFT JOIN authors USING (author_id) LEFT JOIN books USING(isbn) WHERE isbn=" + result[0].isbn;
			console.log(author_command);

			sql_connection.query(author_command, (authorErr, authorResult) => {
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

app.get('/author/list', (req, res) => {
	const urlObject = url.parse(req.url, true);
	var search = '';
	if (urlObject.query.q) search += " WHERE author_name LIKE '%" + urlObject.query.q + "%'";
	var sql_command = "SELECT * FROM authors" + search;
	var page = urlObject.query.page ? urlObject.query.page : 0;
	sql_command += " LIMIT " + (page*page_size) + ", " + page_size;

	console.log(sql_command);

	sql_connection.query(sql_command, (err, result) => {
		if (err) {
			console.log(err);
			res.send(500);
			return;
		}
		if (result.length > 0) {
			size_command = "SELECT COUNT(*) FROM authors" + search;
			sql_connection.query(size_command, (size_err, size_result) => {
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

app.get('/list', async (req, res) => {
	const urlObject = url.parse(req.url, true);
	var sql_command = "SELECT * FROM books LEFT JOIN subjects USING (subject_id) LEFT JOIN languages USING (lang_id)";

	var search = '';
	if (urlObject.query.q) search += " WHERE title LIKE '%" + urlObject.query.q + "%' OR keywords LIKE '%" + urlObject.query.q + "%'";

	sql_command += search;

	if (urlObject.query.order_by) sql_command += ' ORDER BY ' + urlObject.query.order_by;
	else                          sql_command += ' ORDER BY ' + "year_pub";
	if (urlObject.query.order) sql_command += " " + urlObject.query.order;
	else                       sql_command += " DESC";

	var page = urlObject.query.page ? urlObject.query.page : 0;
	sql_command += " LIMIT " + (page*page_size) + ", " + page_size;

	console.log(sql_command);

	sql_connection.query(sql_command, (err, result) => {
		if (err) {
			console.log(err);
			res.send(500);
			return;
		}
		if (result.length > 0) {
			sql_connection.query("SELECT COUNT(*) FROM books" + search, (pageCountErr, pageCountResult) => {
				if (pageCountErr) {
					console.log(pageCountErr);
					res.send(500);
					return;
				}
				let author_command = result.reduce((total, book, i) => {
					return " isbn='" + book.isbn + "'" + (i < result.length - 1 ? " OR" : "");
				} , "SELECT author_name, author_id, isbn FROM projects LEFT JOIN authors USING (author_id) LEFT JOIN books USING(isbn) WHERE");
				console.log(author_command);
				sql_connection.query(author_command, (authorErr, authorResult) => {
					if (authorErr) {
						console.log(pageCountErr);
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

var server = https.createServer(options, app);

// SQL connection
// requires unix socket authentication - script MUST be run as root!!!!
sql_connection.connect((err) => {
	if (err) throw err;
	console.log('Connected to SQL database');
	sql_connection.query("USE bookstore", (err, result) => {
		if (err) throw err;
		console.log('Selected database: ' + JSON.stringify(result));
	});
});

app.listen(port, () => {
	console.log('Server started successfully');
});
