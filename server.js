const express = require('express')
const https = require('https')
const mysql = require('mysql')
const util = require('util')
const url = require('url')
const fs = require('fs')

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

app.get('/book', (req, res) => {
	res.setHeader('Access-Control-Allow-Origin', allowed_websites);
	const urlObject = url.parse(req.url, true)
	if (!urlObject.query.book) {
		res.send(404)
		return
	}
	const sql_command = "SELECT * FROM books WHERE isbn=" + urlObject.query.book
	console.log(sql_command);
	sql_connection.query(sql_command, (err, result) => {
		try {
			if (err) throw 400
			if (result.length == 0) throw 404
			res.send(result)
		} catch (err) {
			res.send(err)
		}
	})
})

app.get('/list', (req, res) => {
	res.setHeader('Access-Control-Allow-Origin', allowed_websites);
	const urlObject = url.parse(req.url, true)
	var sql_command = "SELECT * FROM books"
	var page = urlObject.query.page ? urlObject.query.page : 0;

	if (urlObject.query.q) {
		sql_command += " WHERE title LIKE '%" + urlObject.query.q + "%' OR keywords LIKE '%" + urlObject.query.q + "%' OR author LIKE '%" + urlObject.query.q + "%'"
	}

	sql_command += ' ORDER BY '

	if (urlObject.query.order_by) sql_command += urlObject.query.order_by
	else                          sql_command += "year_pub"

	sql_command += " "

	if (urlObject.query.order) sql_command += urlObject.query.order
	else                       sql_command += "DESC"

	sql_command += " LIMIT " + (page*16) + ", 16";

	console.log(sql_command);

	sql_connection.query(sql_command, (err, result) => {
		if (err) {
			console.log("Epic bruh moment " + err)
			res.send(500)
		}
		var sql_command = "SELECT COUNT(*) FROM books"
		if (urlObject.query.q) {
			sql_command += " WHERE title LIKE '%" + urlObject.query.q + "%' OR keywords LIKE '%" + urlObject.query.q + "%' OR author LIKE '%" + urlObject.query.q + "%'"
		}
		sql_connection.query(sql_command, (errr, resultt) => {
			if (err) {
				console.log("Epic bruh moment " + err)
				res.send(500)
			}
			res.send( {
				books: result,
				pageCount: resultt
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
	sql_connection.query("USE kniznica", (err, result) => {
		if (err) throw err
		console.log('Selected database: ' + JSON.stringify(result))
	})
})

app.listen(port, () => {
	console.log('Server started successfully')
})
