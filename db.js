const mysql = require('mysql');
const config = require('./config.js');

module.exports = class BookDatabase {
    constructor() {
        // SQL connection
        // requires unix socket authentication - script MUST be run as root!!!!
        this.sql = mysql.createConnection({ socketPath: '/run/mysqld/mysqld.sock', user: 'root' });
        this.sql.connect((err) => {
            if (err) throw err;
            console.log('Connected to SQL server');
            this.sql.query("USE bookstore", (err, result) => {
                if (err) throw err;
                console.log('Selected database: ' + JSON.stringify(result));
            });
        });
    }

    book(book, then) {
        try {
            this.sql.query("SELECT * FROM books LEFT JOIN subjects USING (subject_id) LEFT JOIN languages USING (lang_id) WHERE isbn=?", [book], (err, result) => {
                if (err) {
                    then(err, null);
                    return;
                }
                /* avoid making more queries if we didn't find the book */
                if (result.length > 0) {
                    this.sql.query("SELECT author_name, author_id FROM projects LEFT JOIN authors USING (author_id) LEFT JOIN books USING(isbn) WHERE isbn=?", [result[0].isbn], (authorErr, authorResult) => {
                        if (authorErr) {
                            then(authorErr, null);
                            return;
                        }
                        result[0].authors = authorResult;
                        then(null, result[0]);
                    });
                } else {
                    then(null, null);
                }
            });
        } catch (err) {
            then(err, null);
        }
    }

    book_search_str(query, subject) {
        var search = ' ';
        if (query) {
            search += "WHERE (title LIKE " + this.sql.escape("%" + query + "%") + " OR keywords LIKE " + this.sql.escape("%" + query + "%") + ")";
        }
        if (subject) {
            search += (query ? "AND" : "WHERE") + " subject_id=" + this.sql.escape(subject);
        }

        return search;
    }

    book_order_str(order_by, reverse) {
        // we need to filter the options manually so we don't get an sql injection
        var sql_command = ' ORDER BY ';
        switch (order_by) {
            case 'isbn':
            case 'title':
            case 'subject_id':
            case 'read_time':
            case 'pages':
            case 'year_pub':
                sql_command += order_by;
                break;
            default:
                sql_command += 'year_pub';
        }
        sql_command += reverse ? ' ASC' : ' DESC';
        return sql_command;
    }

    book_count(query, subject, then) {
        this.sql.query("SELECT COUNT(*) FROM books" + this.book_search_str(query, subject), (err, result) => {
            if (err) {
                then(err, null);
                return;
            }
            then(null, result[0]['COUNT(*)']);
        });
    }

    book_list(query, page, subject, order_by, reverse, then) {
        var sql_command = "SELECT * FROM books LEFT JOIN subjects USING (subject_id) LEFT JOIN languages USING (lang_id)";
        sql_command += this.book_search_str(query, subject);
        sql_command += this.book_order_str(order_by, reverse);

        // pagination
        sql_command += " LIMIT " + (page*config.page_size) + ", " + config.page_size;
        console.log(sql_command);
        this.sql.query(sql_command, (err, result) => {
            if (err) {
                then(err, null);
                return;
            }
            if (result.length > 0) {
                this.sql.query("SELECT author_name, author_id, isbn FROM projects LEFT JOIN authors USING (author_id) LEFT JOIN books USING(isbn) WHERE"
                  + result.map((book) => (" isbn=" + this.sql.escape(book.isbn))).join(" OR"),
                  (authorErr, authorResult) => {
                    if (authorErr) {
                        then(authorErr, null);
                        return;
                    }
                    then(null, result.map((book) => {
                        book.authors = authorResult.filter((author) => {return author.isbn == book.isbn});
                        return book;
                    }));
                });
            } else {
                then(null, []);
            }
        });
    }

    author_search_str(query) {
        return query ? " WHERE author_name LIKE " + sql.escape('%' + query + '%') : "";
    }

    author_count(query, then) {
        this.sql.query("SELECT COUNT(*) FROM authors" + this.author_search_str(query), (err, result) => {
            if (err) then(err, null);
            else then(err, result[0]['COUNT(*)']);
        });
    }

    author_list(query, page, then) {
        var sql_command = "SELECT * FROM authors" + this.author_search_str(query);
        sql_command += " LIMIT " + (page*config.page_size) + ", " + config.page_size;

        this.sql.query(sql_command, then);
    }

    author_list_all(then) {
        this.sql.query("SELECT * FROM authors", then);
    }

    lang_list_all(then) {
        this.sql.query("SELECT * FROM languages", then);
    }

    subject_list_all(then) {
        this.sql.query("SELECT * FROM subjects", then);
    }

    author(author_id, then) {
        const search = author_id ? " WHERE author_id=" + this.sql.escape(author_id) : "";

        this.sql.query("SELECT * FROM authors" + search, (err, result) => {
            if (err) {
                then(err, null);
                return;
            }
            if (result.length > 0) {
                // Get the authors books
                this.sql.query("SELECT * FROM projects LEFT JOIN books USING (isbn)" + search, (book_err, books) => {
                    if (book_err) {
                        then(book_err, null);
                    } else {
                        result[0].books = books;
                        then(null, result[0]);
                    }
                })
            } else {
                then(null, []);
            }
        });
    }

    subject(subject_id, then) {
        this.sql.query('SELECT * FROM subjects WHERE subject_id=' + this.sql.escape(subject_id), (err, result) => {
            if (err) {
                then(err, null);
            } else if (result.length == 0) {
                then(null, null);
            } else then(null, result[0]);
        });
    }
};
