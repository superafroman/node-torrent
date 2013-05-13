# node-torrent WebApp

An angular.js web application for node-torrent

## Features
  * .torrent support
  * Resume
  * Seeding
  * UDP trackers
  * DHT peer discovery
  * Magnet links
  * Add torrent via URL (file:, https:, http:, magnet:)
  * Simple web server that runs locally and hosts web interface
  
## In progress
  * Mobile support

## TODO
  * Share ratio
  * Accurate reporting on download/upload speeds
  * Limit download/upload speeds
  * Persist?
  * Secure login and mac address filtering
  * dyndns.com integrated support for remote controlling the app.

## Usage
    * Download
        $ git clone git://github.com/davidyaha/node-torrent.git
        $ cd node-torrent

    * Install
        $ npm install

    * Run
        $ cd web-client
        $ node web-server.js

    * Now open your browser and go to 127.0.0.1:1337.

## License 

(The MIT License)

Copyright (c) 2011 Max Stewart &lt;max.stewart@superafroman.com&gt;
Copyright (c) 2013 David Yahalomi &lt;davidyaha@gmail.com&gt;

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
