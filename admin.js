const url = require('url');
const crypto = require('crypto');
const default_exp_time = 3600000;
const config = require('./config.js');

var keys = [];

function verify_key(key) {
    let verified = false;
    for (let i = 0; i < keys.length; i++) {
        if (keys[i].key === key) {
            if (keys[i].exp_time < Date.now()) {
                console.log("removing old key " + key);
                keys.splice(i);
                verified = false;
                break;
            }
            verified = true;
            break;
        }
    }
    console.log("key " + (key.substring(0,5)+"...") + (verified ? " " : " not ") + "allowed");
    return verified;
};

function hash_password(username, password) {
    const hash = crypto.createHash('sha256').update(username).update(password).digest('base64');
    return hash;
};

exports.login = (req, res, db) => {
    const hash = hash_password(req.body.username, req.body.password);
    db.verify_password(req.body.username, hash, (err, result) => {
        if (err) {
            res.send(500);
            console.log(err);
        } else if (result) {
            let key = crypto.randomBytes(48).toString('base64');
            keys.push({
                key: key,
                exp_time: Date.now() + default_exp_time
            });
            console.log("access key generated for user " + req.body.username); 
            res.send(key);
        } else {
            res.send(401);
        }
    });
};

exports.logout = (req, res) => {
    if (!verify_key(req.body.key)) {
        res.send(401);
        return;
    }
    // drop the key from the list
    for (let i = 0; i < keys.length; i++) {
        if (keys[i].key == req.body.key) {
            keys.splice(i);
            res.send(200);
            return;
        }
    }
    // if we didn't find any matchnig key, break
    res.send(404);
};

exports.verifykey = (req, res) => {
    res.send(verify_key(req.body.key) ? 200 : 401);
};

exports.book_remove = (req, res, db) => {
    const urlObject = url.parse(req.url, true);
    if (!urlObject.query.book) {
        res.send(400);
        return;
    }
    if (!verify_key(req.body.key)) {
        res.send(401);
        return;
    }
    db.remove_book(urlObject.query.book, (err, result) => {
        if (err) {
            console.log(err);
            res.send(500);
            return;
        }
        db.remove_project_by_isbn(urlObject.query.book, (project_err, project_result) => {
            if (project_err) {
                console.log(project_err);
                res.send(500);
                return;
            }
            res.send(200);
        });
    });
};

exports.author_remove = (req, res, db) => {
    const urlObject = url.parse(req.url, true);
    if (!urlObject.query.author) {
        res.send(400);
        return;
    }
    if (!verify_key(req.body.key)) {
        res.send(401);
        return;
    }
    db.remove_author(urlObject.query.author, (err, result) => {
        if (err) {
            console.log(err);
            res.send(500);
            return;
        }
        db.remove_project_by_author(urlObject.query.author, (project_err, project_result) => {
            if (project_err) {
                console.log(project_err);
                res.send(500);
                return;
            }
            res.send(200);
        });
    });
};

exports.book_new = (req, res, sql) => {
    if (!verify_key(req.body.key)) {
        res.send(401);
        return;
    }
    let iname = Date.now() + req.files.image.name.match("\.[^\.]\+$");
    if (req.files) {
        console.log("Uploading file " + iname);
        req.files.image.mv(config.filePath + iname, (err) => {
            console.log(err);
        });
    }
    sql.query(
      "INSERT INTO books (`isbn`, `title`, `subject_id`, `keywords`, `desc`, `read_time`, `pages`, `year_pub`, `lang_id`, `image`, `content`) VALUES ?",
      [[[
        req.body.isbn,
        req.body.title,
        req.body.subject,
        req.body.keywords,
        req.body.desc,
        req.body.read_time,
        req.body.pages,
        req.body.year_pub,
        req.body.lang,
        "/pub/" + iname,
        req.body.content,
      ]]], (err, result) => {
        if (err) {
            console.log(err);
            res.send(500);
            return;
        }
        console.log(typeof req.body.authors);
        console.log(req.body.authors);
        if (req.body.authors) {
            sql.query(
              "INSERT IGNORE INTO authors (`author_name`) VALUES ?",
              [[req.body.authors.split(',')]],
              (add_err, add_result) => {
                if (add_err) {
                    console.log(add_err);
                    res.send(500);
                    return;
                }
                author_command = "INSERT INTO projects (`author_id`, `isbn`) SELECT `author_id`, " + sql.escape(req.body.isbn) + " FROM authors WHERE" + req.body.authors.split(',').map((author)=>(" `author_name`=" + sql.escape(author))).join(" OR");
                console.log(author_command);
                sql.query(author_command, (author_err, author_result)=>{
                    if (author_err) {
                        console.log(author_err);
                        res.send(500);
                        return;
                    }
                    res.send(200);
                });
            });
        } else {
            res.send(200);
        }
    });
};
