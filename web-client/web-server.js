var http = require('http');
var request = require('request');
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
    this.torrentClient = new Client(options);
    this.server = http.createServer(this.handleRequest.bind(this));
//    this.torrent = this.torrentClient.addTorrent('b.torrent');
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
                    this._getTorrentsList(res);
                    break;
                default :
                    pathname = this._getFile(pathname, res);
                    break;
            }
            break;
        case 'POST':
            if (pathname === '/torrentList') {
                this._postTorrent(req);
            }

            res.writeHead(200);
            res.end();
            break;
        default :
            res.writeHead(501);
            res.end();

            break;
    }
};

WebServer.prototype._postTorrent = function (req) {
    var body = '';
    var self = this;
    var addTorrent = function (self) {
        LOGGER.info('Got new torrent url:' + body);
        var object = JSON.parse(body);
        self.torrentClient.addTorrent(object.url);
    };

    req.on('data', function (data) {
        body += data;
    });
    req.on('end', addTorrent.bind(this, self));
    req.on('error', function (err) {
        LOGGER.error(err);
    });
}

WebServer.prototype._getFile = function (pathname, res) {
    pathname = (pathname === '/' ? '/index.html' : pathname);

    LOGGER.info('Redirecting to /assets' + pathname);

    var mimeType = pathname.split('.').pop();
    res.writeHead(200, {'Content-Type': WebServer.MimeMap[mimeType] || 'text/plain'});

    if (mimeType === 'json') {
        res.write(")]}',\n");
    }

    var file = fs.createReadStream('assets' + pathname);
    file.on('data', res.write.bind(res));
    file.on('close', function () {
        res.end();
    });
    file.on('error', function (error) {
        res.end(error.message);
    });
    return pathname;
}

WebServer.prototype._getTorrentsList = function (res) {
    var torrentsJSON = [];
    var torrents = this.torrentClient.torrents;

    for (var hash in torrents) {
        torrentsJSON.push(WebServer._stripFat(torrents[hash]));
    }

    LOGGER.info("Responding with json: " + JSON.stringify(torrentsJSON));
    res.write(")]}',\n");
    res.write(JSON.stringify(torrentsJSON));
    res.end();
};

WebServer._stripFat = function (torrent) {
    var json = {};

    json.name = torrent.name;
    json.size = torrent.size;
    json.downloaded = torrent.stats.downloaded / torrent.size * 100;
    json.downloadRate = torrent.stats.downloadRate;
    json.uploadRate = torrent.stats.uploadRate;

    return json;
};

main(process.argv);
