var http = require('http');
var fs = require('fs');
var util = require('util');
var urlParser = require('url');
var log4js = require('log4js');
var LOGGER = log4js.getLogger('web-server.js');

// TODO: This weird URL probably means the web torrentClient project should be
// TODO: separate or encapsulate node-torrent in some form...
var Client = require('./../../node-torrent');

var defaultOptions = {
    "downloadPath": "C:\\Downloads",
    "portRange": {
        "start": 6881,
        "end": 6889
    },
    "logLevel": "INFO"
};

function main(argv) {
    var optionsPath = 'options.json';

    new WebServer(optionsPath).start();
}

function WebServer(optionsPath) {
    var self = this;

    this.optionsPath = optionsPath;

    if (fs.existsSync(this.optionsPath)) {
        this._watchOptionsFile();
    }

    this._readOptionsFile(function () {
        self.torrentClient = new Client(self.options);
    });

    this.server = http.createServer(this.handleRequest.bind(this));
    this.server.on('error', function(err) {
        LOGGER.error(err.message);
        setTimeout(function(){process.exit(1)}, 2);
    });

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
                case '/options':
                    this._getOptions(res);
                    break;
                default :
                    pathname = this._getFile(pathname, res);
                    break;
            }
            break;
        case 'POST':
            switch (pathname) {
                case '/torrentList':
                    this._postTorrent(req, res);
                    break;
                case '/options':
                    this._postOptions(req, res);
                    break;
                default :
                    res.writeHead(404);
                    break;
            }
            break;
        default :
            res.writeHead(501);
            res.end();

            break;
    }
};

WebServer.prototype._watchOptionsFile = function () {
    var self = this;

    if (!this.optionWatcher) {
        this.optionWatcher = fs.watch(this.optionsPath, {persistent: false}, function (event, filename) {
            if (event === 'rename') {
                LOGGER.warn('Options file was renamed to ' + filename);
                self.optionsPath = filename || self.optionsPath;
            } else if (event === 'change') {
                LOGGER.warn('The options file was changed!');

                // TODO Add callback to update node-torrent options after client will enable it.
                self._readOptionsFile();
            }
        });
    }
};

WebServer.prototype._readOptionsFile = function (/*cb*/) {
    var cb;
    if (typeof arguments[0] === 'function')
        cb = arguments[0];
    else
        cb = function () {
        };

    var self = this;
    var options = '';

    fs.createReadStream(this.optionsPath)
        .on('data', function (data) {
            options += data;
        })
        .on('close', function () {
            try {
                self.options = JSON.parse(options);
            } catch (err) {
                self.options = defaultOptions;
            } finally {
                cb();
            }
        })
        .on('error', function (err) {
            LOGGER.error(err.message);
            self.options = defaultOptions;
            cb();
        });
};

WebServer.prototype._postOptions = function (req, res) {
    var self = this;

    var body = '';
    req.on('data', function (data) {
        body += data;
    })
        .on('end', function () {
            LOGGER.info('Got an options object: ' + body + '.\nWriting into file ' + self.optionsPath);

            var optionsFile = fs.createWriteStream(self.optionsPath)
                .on('error', function () {
                    res.writeHead(400);
                    res.end();
                });
            optionsFile.write(body, function () {
                res.writeHead(204);
                res.end();

                self._watchOptionsFile();
            });
        });

    return this;
};

WebServer.prototype._postTorrent = function (req, res) {
    var self = this;

    var body = '';
    req.on('data', function (data) {
        body += data;
    })
        .on('end', function () {
            LOGGER.info('Got new torrent url: ' + body);

            var object = JSON.parse(body);
            self.torrentClient.addTorrent(object.url);
            res.writeHead(204);
            res.end();
        })
        .on('error', function (err) {
            LOGGER.error(err);
            res.writeHead(400);
            res.end();
        });

    return this;
};

WebServer.prototype._getFile = function (pathname, res) {
    // Redirection check
    pathname = (pathname === '/' ? '/index.html' : pathname);

    LOGGER.info('Redirecting to /assets' + pathname);

    // Getting the mime type for later use.
    var mimeType = pathname.split('.').pop();

    // Reading from file and responding to client
    pathname = 'assets' + pathname;
    var file = fs.createReadStream(pathname);
    file.on('open', function () {
        res.writeHead(200, {'Content-Type': WebServer.MimeMap[mimeType] || 'text/plain'});
        if (mimeType === 'json') {
            res.write(")]}',\n");
        }
    });
    file.on('data', res.write.bind(res));
    file.on('close', function () {
        res.end();
    });
    file.on('error', function (error) {
        res.writeHead(404);
        res.end(error.message);
    });

    // Returns the path that was handled.
    return pathname;
};

WebServer.prototype._getOptions = function (res) {
    WebServer._jsonResponse(this.options, res);
};

WebServer.prototype._getTorrentsList = function (res) {
    var torrentsJSON = [];
    var torrents = this.torrentClient.torrents;

    for (var hash in torrents) {
        if (torrents.hasOwnProperty(hash))
            torrentsJSON.push(WebServer._torrentStripFat(torrents[hash]));
    }

    WebServer._jsonResponse(torrentsJSON, res);
};

WebServer._jsonResponse = function (json, res) {
    LOGGER.info("Responding with json: " + JSON.stringify(json));
    res.writeHead(200, {'Content-Type': WebServer.MimeMap['json']});
    res.write(")]}',\n");
    res.write(JSON.stringify(json));
    res.end();
};

WebServer._torrentStripFat = function (torrent) {
    var json = {};

    json.name = torrent.name;
    json.size = torrent.size;
    json.downloaded = torrent.stats.downloaded;
    json.progress = (torrent.stats.downloaded / torrent.size * 100) || 0;
    json.downloadRate = torrent.stats.downloadRate;
    json.uploadRate = torrent.stats.uploadRate;

    return json;
};

main(process.argv);
