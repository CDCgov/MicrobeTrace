#!/bin/sh

scripts/cleanup.sh

rm dist/common.js dist/index.js dist/main.css

mv src/* dist

rm -rf demo/ docs/ node_modules/ scripts/ src/ test/ \
      .* *.md *.sh package-lock.json \
      cache.extra Dockerfile sonar-project.properties\
      postcss.config.js server.js
