
var base32 = require('base32');

var LOGGER = require('log4js').getLogger('metadata/magnet.js');

/**
 * Retrieve torrent metadata from magnet URL.
 */
var MagnetMetadata = {
	load: function(url, callback) {

		if (!url.match(/^magnet:/)) {
			callback(new Error('Given URL is not a magnet URL.'));
		}

		LOGGER.debug('Reading magnet metadata from ' + url);

		var parsedUrl = require('url').parse(url, true),
				hash;

		var urns = parsedUrl.query.xt;
		if (!Array.isArray(urns)) {
			urns = [urns];
		}
		urns.some(function(urn) {
			if (urn.match(/^urn:btih:/)) {
				hash = urn.substring(9);
				return true;
			}
		});

		if (!hash) {
			callback(new Error('No supported xt URN provided.'));
		} else {
			var infoHash;
			if (hash.length === 40) {
				infoHash = new Buffer(hash, 'hex');
			} else {
				infoHash = new Buffer(base32.decode(hash), 'binary');
			}

			if (parsedUrl.query.tr) {
				var trackers = parsedUrl.query.tr;
				if (!Array.isArray(trackers)) {
					trackers = [trackers];
				}
			}

			callback(null, {
				infoHash: infoHash,
				info: {
					name: parsedUrl.query.dn
				},
				'announce-list': trackers
			});
		}
	}
};

module.exports = exports = MagnetMetadata;

/*

var R = require('./lib/metadata/magnet')
var r = new R('magnet:?xt=urn:ed2k:354B15E68FB8F36D7CD88FF94116CDC1&dn=mediawiki-1.15.1.tar.gz');
r.retrieve(function(){console.log(arguments);});

magnet:?xt=urn:ed2k:354B15E68FB8F36D7CD88FF94116CDC1
&xl=10826029&dn=mediawiki-1.15.1.tar.gz
&xt=urn:tree:tiger:7N5OAMRNGMSSEUE3ORHOKWN4WWIQ5X4EBOOTLJY
&xt=urn:btih:QHQXPYWMACKDWKP47RRVIV7VOURXFE5Q
&tr=http%3A%2F%2Ftracker.example.org%2Fannounce.php%3Fuk%3D1111111111%26
&as=http%3A%2F%2Fdownload.wikimedia.org%2Fmediawiki%2F1.15%2Fmediawiki-1.15.1.tar.gz
&xs=http%3A%2F%2Fcache.example.org%2FXRX2PEFXOOEJFRVUCX6HMZMKS5TWG4K5
&xs=dchub://example.org

*/