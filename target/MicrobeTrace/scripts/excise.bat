#!/bin/sh

echo 'Removing Compressed Files...'

rm components/*.br components/*.gz
rm data/*.br data/*.gz
rm dist/*.br dist/*.gz
rm vendor/*.br vendor/*.gz
rm workers/*.br workers/*.gz

rmdir /s .git demo/ docs/ node_modules/ test/ \
      *.md *.sh package-lock.json\
      cache.extra Dockerfile postcss.config.js
