var CACHE = 'MicrobeTraceD2020-08-12R1840';

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll([
        '/',
        'index.html',
        'package.json',
        'manifest.json',
        'favicon.ico',
        'humans.txt',
        'LICENSE',
        'vendor/README.md',
        'vendor/bioseq.min.js',
        'vendor/papaparse.min.js',
        'vendor/patristic.min.js',
        'vendor/tn93.min.js',
        'dist/bundle.primary.css',
        'dist/bundle.primary.js',
        'dist/bundle.secondary.css',
        'dist/bundle.secondary.js',
        'dist/common.js',
        'dist/index.js',
        'dist/main.css',
        'workers/README.md',
        'workers/align-sw.js',
        'workers/compute-ambiguity-counts.js',
        'workers/compute-consensus-distances.js',
        'workers/compute-consensus.js',
        'workers/compute-directionality.js',
        'workers/compute-links.js',
        'workers/compute-mst.js',
        'workers/compute-nn.js',
        'workers/compute-patristic-matrix.js',
        'workers/compute-tree.js',
        'workers/compute-triangulation.js',
        'workers/parse-csv-matrix.js',
        'workers/parse-fasta.js',
        'workers/parse-mega.js',
        'components/2d_network.html',
        'components/3d_network.html',
        'components/aggregation.html',
        'components/bubbles.html',
        'components/choropleth.html',
        'components/crosstab.html',
        'components/files.html',
        'components/flow_diagram.html',
        'components/gantt.html',
        'components/geo_map.html',
        'components/globe.html',
        'components/heatmap.html',
        'components/help.html',
        'components/histogram.html',
        'components/phylogenetic_tree.html',
        'components/pixi.html',
        'components/scatterplot.html',
        'components/sequences.html',
        'components/table.html',
        'components/timeline.html',
        'components/waterfall.html',
        'fonts/open-iconic.eot',
        'fonts/open-iconic.otf',
        'fonts/open-iconic.svg',
        'fonts/open-iconic.ttf',
        'fonts/open-iconic.woff',
        'img/Molecule.svg',
        'img/android-chrome-192x192.png',
        'img/android-chrome-512x512.png',
        'img/apple-touch-icon.png',
        'img/browserconfig.xml',
        'img/favicon-16x16.png',
        'img/favicon-32x32.png',
        'img/favicon-48x48.png',
        'img/humanstxt-isolated-blank.gif',
        'img/mstile-144x144.png',
        'img/mstile-150x150.png',
        'img/mstile-310x150.png',
        'img/mstile-310x310.png',
        'img/mstile-70x70.png',
        'img/safari-pinned-tab.svg',
        'data/counties.json',
        'data/countries.json',
        'data/stars.json',
        'data/states.json',
        'data/tracts.csv',
        'data/zipcodes.csv',
      ]);
    })
  );
});

self.addEventListener('fetch', function(evt){
  evt.respondWith(fetch(evt.request).catch(function(){
    return caches.open(CACHE).then(function(cache){
      return cache.match(evt.request).then(function(matching){
        return matching || Promise.reject('No Match for ', evt.request, 'in Service Worker Cache!');
      });
    });
  }));
});

