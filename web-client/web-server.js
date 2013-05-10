var http = require('http');
var fs = require('fs');
var util = require('util');
var urlParser = require('url');
var log4js = require('log4js');
var LOGGER = log4js.getLogger('web-server.js');

// TODO: This weird URL probably means the web torrentClient project should be
// TODO: separate or encapsulate node-torrent in some form...
var Client = require('./../../node-torrent');
var options = require('./options.json');

// TODO: Add that string as prefix to json files `")]}',\n"`
function main(argv) {
    new WebServer().start();
}

function WebServer() {
    this.server = http.createServer(this.handleRequest.bind(this));
    this.torrentClient = new Client(options);
    this.torrent = this.torrentClient.addTorrent('b.torrent');
}

WebServer.MimeMap = {
    'txt': 'text/plain',
    'html': 'text/html',
    'css': 'text/css',
    'xml': 'application/xml',
    'json': 'application/json',
    'js': 'application/javascript',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'png': 'image/png',
    'svg': 'image/svg+xml'
};

WebServer.prototype.start = function () {
    this.server.listen(1337, "127.0.0.1");
    LOGGER.info('Web Server running at http://127.0.0.1:1337/');
};

WebServer.prototype.handleRequest = function (req, res) {
    var pathname = urlParser.parse(req.url).pathname;
    LOGGER.info(req.method + ' request with path name: ' + pathname);

    switch (req.method) {
        case 'GET':
            switch (pathname) {
                case '/torrentList':
                    this.getTorrentsList(res);
                    break;
                default :
                    pathname = (pathname === '/' ? '/index.html' : pathname);

                    LOGGER.info('Redirecting to /assets' + pathname);

                    res.writeHead(200, {'Content-Type': WebServer.MimeMap[pathname.split('.').pop()] || 'text/plain'});

                    var file = fs.createReadStream('assets' + pathname);
                    file.on('data', res.write.bind(res));
                    file.on('close', function () {
                        res.end();
                    });
                    file.on('error', function (error) {
                        res.end(error.message);
                    });
                    break;
            }
            break;
        default :
            break;
    }
};

WebServer.prototype.getTorrentsList = function (res) {
    LOGGER.info(JSON.stringify(this.torrentClient.listTorrents()));
    res.write(JSON.stringify(this.torrentClient.listTorrents()));
    res.end();
};

main(process.argv);
