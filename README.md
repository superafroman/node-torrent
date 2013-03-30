# node-torrent

A simple bittorrent client for node.

## Features
  * .torrent support
  * Resume
  * Seeding
  * UDP trackers
  * DHT peer discovery
  * Magnet links
  * Add torrent via URL (file:, https:, http:, magnet:)
  
## In progress
  * Expose nice programmatic API for interacting with torrents/peers/trackers

## TODO
  * Share ratio
  * Accurate reporting on download/upload speeds
  * Limit download/upload speeds
  * Persist?

## Usage

```javascript
var Client = require('node-torrent');
var client = new Client({logLevel: 'DEBUG'});
var torrent = client.addTorrent('a.torrent');

// when the torrent completes, move it's files to another area
torrent.on('complete', function() {
    console.log('complete!');
    torrent.files.forEach(function(file) {
        var newPath = '/new/path/' + file.path;
        fs.rename(file.path, newPath);
        // while still seeding need to make sure file.path points to the right place
        file.path = newPath;
    });
});
```

## License 

(The MIT License)

Copyright (c) 2011 Max Stewart &lt;max.stewart@superafroman.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
