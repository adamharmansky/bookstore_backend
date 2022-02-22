#!/bin/sh

# A simple script to upload the files to the server for debugging

scp -r * root@bookstore.harmansky.xyz:/web/bookstore/back/
ssh root@bookstore.harmansky.xyz bash -c '"cd /web/bookstore/back/; [ -d node_modules ] || npm install; sv restart bookstore"'
