var fs = require('fs'),
		bencode = require('../util/bencode');

var LOGGER = require('log4js').getLogger('metadata/file.js');

/**
 * Retrieve torrent metadata from the filesystem.
 */
var FileMetadata = {

	load: function(url, callback) {

		var path;
		if (url.match(/^file:/)) {
			path = url.substring(7);
		} else {
			path = url;
		}

		LOGGER.debug('Reading file metadata from ' + path);

		fs.readFile(path, 'binary', function(error, data) {
			if (error) {
				callback(error);
			} else {
				try {
					var metadata = bencode.decode(data.toString('binary'));
					callback(null, metadata);
				} catch(e) {
					callback(e);
				}
			}
		});
	}
};

module.exports = exports = FileMetadata;

/*

var R = require('./lib/metadata/file')
var r = new R('file:///home/mstewar/Downloads/ubuntu-12.10-desktop-amd64.iso.torrent');
r.retrieve(function(){console.log(arguments);});

*/