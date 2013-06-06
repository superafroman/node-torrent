var http = require('http'),
    https = require('https'),
    bencode = require('../util/bencode');

var LOGGER = require('log4js').getLogger('metadata/http.js');

/**
 * Retrieve torrent metadata over http/https.
 */
var HttpMetadata = {
    load: function (url, callback) {

        if (!url.match(/^https?:/)) {
            callback(new Error('Given URL is not an http URL.'));
        }

        LOGGER.debug('Reading http metadata from ' + url);

        var request;

        if (url.match(/^http:/)) {
            request = http;
        } else {
            request = https;
        }

        request.get(url,function (response) {

            LOGGER.debug('Response recieved from metadata request.  status = ' + response.statusCode);

            var buffers = [];
            var length = 0;

            response.on('data', function (chunk) {
                buffers.push(chunk);
                length += chunk.length;
            });

            response.on('end', function () {
                var body = new Buffer(length);
                var pos = 0;
                for (var i = 0; i < buffers.length; i++) {
                    body.write(buffers[i].toString('binary'), pos, 'binary');
                    pos += buffers[i].length;
                }
                if (response.statusCode === 200) {
                    var metadata = bencode.decode(body.toString('binary'));
                    callback(null, metadata);
                } else if (response.statusCode >= 300 && response.statusCode < 400) {
                    var location = response.headers['location'];
                    if (location) {
                        HttpMetadata.load(location, callback);
                    } else {
                        callback(new Error('Received redirect response with no location header. status = '
                            + response.statusCode));
                    }
                } else {
                    callback(new Error('Unknown response code recieved from metadata request. code = '
                        + response.statusCode + ', message = ' + body.toString()));
                }
            });
        }).on('error', function (e) {
                callback(e);
            });
    }
};

module.exports = exports = HttpMetadata;

/*

 var R = require('./lib/metadata/http')
 var r = new R('http://releases.ubuntu.com/12.10/ubuntu-12.10-desktop-amd64.iso.torrent');
 r.retrieve(function(){console.log(arguments);});

 */