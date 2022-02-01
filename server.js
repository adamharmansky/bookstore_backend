const express = require('express')
const https = require('https')
const mysql = require('mysql')
const util = require('util')
const url = require('url')
const fs = require('fs')
const cors = require('cors')
const bodyParser = require('body-parser')

const page_size = 6

allowed_websites = 'https://bookstore.harmansky.xyz'
const port = 3001

var sql_connection = mysql.createConnection({ socketPath: '/run/mysqld/mysqld.sock', user: 'root' })
var key = fs.readFileSync('/etc/letsencrypt/live/bookstore.harmansky.xyz/privkey.pem')
var cert = fs.readFileSync('/etc/letsencrypt/live/bookstore.harmansky.xyz/cert.pem')
var options = {
	key: key,
	cert: cert
}
const app = express()
app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
	extended: true
}))

app.get('/book', (req, res) => {
	const urlObject = url.parse(req.url, true)
	if (!urlObject.query.book) {
		res.send(400)
		return
	}

	var sql_command = "SELECT * FROM books LEFT JOIN subjects USING (subject_id) LEFT JOIN languages USING (lang_id) WHERE isbn=" + urlObject.query.book

	console.log(sql_command);

	sql_connection.query(sql_command, (err, result) => {
		if (err) {
			console.log(err)
			res.send(500)
			return
		}
		if (result.length > 0) {
			let author_command = "SELECT author_name, author_id FROM projects LEFT JOIN authors USING (author_id) LEFT JOIN books USING(isbn) WHERE isbn=" + result[0].isbn
			result[0].authors = []
			console.log(author_command);

			sql_connection.query(author_command, (authorErr, authorResult) => {
				if (authorErr) {
					console.log(pageCountErr)
					res.send(500)
					return
				}
				for (let i = 0; i < authorResult.length; i++) {
					result[0].authors.push(authorResult[i])
				}
				res.send(result[0])
			})
		} else {
			res.send(404)
			return
		}
	})
})

app.post('/book/new', (req, res) => {
	console.log(req.body);
	res.send(200);
})

app.get('/list', async (req, res) => {
	const urlObject = url.parse(req.url, true)
	var sql_command = "SELECT * FROM books LEFT JOIN subjects USING (subject_id) LEFT JOIN languages USING (lang_id)"

	const search = ''
	if (urlObject.query.q) search += " WHERE title LIKE '%" + urlObject.query.q + "%' OR keywords LIKE '%" + urlObject.query.q + "%'"

	sql_command += search

	if (urlObject.query.order_by) sql_command += ' ORDER BY ' + urlObject.query.order_by
	else                          sql_command += ' ORDER BY ' + "year_pub"
	if (urlObject.query.order) sql_command += " " + urlObject.query.order
	else                       sql_command += " DESC"

	var page = urlObject.query.page ? urlObject.query.page : 0;
	sql_command += " LIMIT " + (page*page_size) + ", " + page_size;

	console.log(sql_command);

	sql_connection.query(sql_command, (err, result) => {
		if (err) {
			console.log(err)
			res.send(500)
			return
		}
		if (result.length > 0) {
			sql_connection.query("SELECT COUNT(*) FROM books" + search, (pageCountErr, pageCountResult) => {
				if (pageCountErr) {
					console.log(pageCountErr)
					res.send(500)
					return
				}
				let author_command = "SELECT author_name, author_id, isbn FROM projects LEFT JOIN authors USING (author_id) LEFT JOIN books USING(isbn) WHERE"
				for (let i = 0; i < result.length; i++) {
					result[i].authors = []
					author_command += " isbn='" + result[i].isbn + "'"
					if (i < result.length - 1) {
						author_command += " OR"
					}
				}
				console.log(author_command);
				sql_connection.query(author_command, (authorErr, authorResult) => {
					if (authorErr) {
						console.log(pageCountErr)
						res.send(500)
						return
					}
					for (let i = 0; i < authorResult.length; i++) {
						for (let j = 0; j < result.length; j++) {
							if (result[j].isbn == authorResult[i].isbn) {
								result[j].authors.push(authorResult[i])
								delete  result[j].authors[result[j].authors.length-1].isbn
							}
						}
					}
					res.send({
						books: result,
						pageCount: Math.ceil(pageCountResult[0]['COUNT(*)']/page_size)
					})
				})
			})
		} else {
			res.send({
				books: [],
				pageCount: 0
			})
		}
	})
})

var server = https.createServer(options, app)

// SQL connection
// requires unix socket authentication - script MUST be run as root!!!!
sql_connection.connect((err) => {
	if (err) throw err
	console.log('Connected to SQL database')
	sql_connection.query("USE bookstore", (err, result) => {
		if (err) throw err
		console.log('Selected database: ' + JSON.stringify(result))
	})
})

app.listen(port, () => {
	console.log('Server started successfully')
})
