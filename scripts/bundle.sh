#!/bin/bash

# primaryscripts is where you put scripts that must be loaded immediately.
# It is unlikely that you should need to modify this, unless you're working on
# index.html, components/files.html, or scripts/index.js
primaryscripts=(
  "node_modules/jquery/dist/jquery.min.js"
  "node_modules/bootstrap/dist/js/bootstrap.bundle.min.js"
  "node_modules/alertifyjs/build/alertify.min.js"
  "node_modules/golden-layout/dist/goldenlayout.min.js"
  "node_modules/chosen-js/chosen.jquery.min.js"
  "node_modules/fileto/fileto.js"
  "node_modules/screenfull/dist/screenfull.js"
  "node_modules/clipboard/dist/clipboard.min.js"
  "node_modules/papaparse/papaparse.min.js"
  "node_modules/jszip/dist/jszip.min.js"
  "node_modules/xlsx/dist/xlsx.core.min.js"
  "node_modules/xss/dist/xss.min.js"
  "node_modules/tn93/dist/tn93.min.js"
  "node_modules/d3/dist/d3.min.js"
  "node_modules/tabulator-tables/dist/js/tabulator.min.js"
  "node_modules/file-saver/dist/FileSaver.min.js"
  "node_modules/devtools-detect/index.js"
  "node_modules/localforage/dist/localforage.min.js"
)

# secondaryscripts is where you put scripts that must be loaded before a
# specific view can be rendered. You should probably add your new script to this
# array.
secondaryscripts=(
  "node_modules/d3-force-attract/dist/d3-force-attract.min.js"
  "node_modules/d3-symbol-extra/build/d3-symbol-extra.min.js"
  "node_modules/plotly.js-dist-min/plotly.min.js"
  "node_modules/3d-force-graph/dist/3d-force-graph.min.js"
  "node_modules/moment/min/moment-with-locales.min.js"
  "node_modules/tidytree/dist/tidytree.min.js"
  "node_modules/leaflet/dist/leaflet.js"
  "node_modules/leaflet.markercluster/dist/leaflet.markercluster.js"
  "node_modules/leaflet-image/leaflet-image.js"
  "node_modules/marked/marked.min.js"
  "node_modules/html5sortable/dist/html5sortable.min.js"
  "node_modules/alignment-viewer/dist/alignment-viewer.min.js"
  "node_modules/save-svg-as-png/lib/saveSvgAsPng.js"
  "node_modules/pdfmake/build/pdfmake.min.js"
  "node_modules/pdfmake/build/vfs_fonts.js"
)

# primarystyles is where you put stylesheets that must be loaded immediately to
# render the page properly. You probably shouldn't put your new stylesheet here.
primarystyles=(
  "node_modules/bootstrap/dist/css/bootstrap.min.css"
  "node_modules/golden-layout/src/css/goldenlayout-base.css"
  "node_modules/golden-layout/src/css/goldenlayout-light-theme.css"
  "node_modules/alertifyjs/build/css/alertify.min.css"
  "node_modules/tabulator-tables/dist/css/tabulator.min.css"
  "node_modules/tabulator-tables/dist/css/bootstrap/tabulator_bootstrap4.min.css"
  "node_modules/open-iconic/font/css/open-iconic-bootstrap.min.css"
)

# secondarystyles is where you put stylesheets that must be loaded before a
# specific view (or views) are loaded. You should probably put your new
# stylesheet here.
secondarystyles=(
  "node_modules/chosen-js/chosen.css"
  "node_modules/leaflet/dist/leaflet.css"
  "node_modules/leaflet.markercluster/dist/MarkerCluster.css"
  "node_modules/leaflet.markercluster/dist/MarkerCluster.Default.css"
)

echo 'Assembling Stylesheets...'

touch temp.primary.css
for i in ${primarystyles[@]}; do
  cat $i >> temp.primary.css
  printf "\n" >> temp.primary.css
done

touch temp.secondary.css
for i in ${secondarystyles[@]}; do
  cat $i >> temp.secondary.css
  printf "\n" >> temp.secondary.css
done

echo 'Minifying Stylesheets...'

npx postcss temp.primary.css > dist/bundle.primary.css
npx postcss temp.secondary.css > dist/bundle.secondary.css

echo 'Copying Unbundlable Dependencies...'

cp node_modules/bioseq/dist/bioseq.min.js vendor/
cp node_modules/patristic/dist/patristic.min.js vendor/
cp node_modules/tn93/dist/tn93.min.js vendor/
cp node_modules/papaparse/papaparse.min.js vendor/
cp workers/select2.min.js vendor/
cp workers/select2.min.css vendor/
cp -r node_modules/open-iconic/font/fonts/ .

# echo 'Building Dependencies...'

# This little nightmare is a hack to add the Sankey diagram logic to Plotly's
# Cartesian build
# rm node_modules/plotly.js/lib/index-cartesian.js
# echo """'use strict';
# var Plotly = require('./core');
# Plotly.register([
#     require('./heatmap'),
#     require('./histogram'),
#     require('./scatterternary'),
#     require('./sankey')
# ]);
# module.exports = Plotly;
# """ > node_modules/plotly.js/lib/index-cartesian.js
# cd node_modules/plotly.js
# npm install
# npm run bundle
# cd ../..

echo 'Assembling Javascript Bundle...'

rm dist/bundle.primary.js && touch dist/bundle.primary.js
for i in ${primaryscripts[@]}; do
  cat $i >> dist/bundle.primary.js
  printf "\n" >> dist/bundle.primary.js
done

rm dist/bundle.secondary.js && touch dist/bundle.secondary.js
for i in ${secondaryscripts[@]}; do
  cat $i >> dist/bundle.secondary.js
  printf "\n" >> dist/bundle.secondary.js
done

echo "Cleaning up..."

rm temp.*.css
