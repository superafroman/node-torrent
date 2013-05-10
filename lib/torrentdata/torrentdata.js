
var Metadata = require('../metadata')
  , Tracker = require('../tracker')
  ;

var LOGGER = require('log4js').getLogger('torrentdata/torrentdata.js');

var loaders = {
  'http:': require('./http'),
  'https:': require('./http'),
  'file:': require('./file'),
  'magnet:': require('./magnet')
};

TorrentData = {
  load: function(url, callback) {
    var parsedUrl = require('url').parse(url),
        protocol = parsedUrl.protocol || 'file:'
        loader = loaders[protocol];

    if (!loader) {
      callback(new Error('No metadata parser for given URL, URL = ' + url));
    } else {
      loader.load(url, function(error, torrentData) {
        if (error) {
          callback(error);
        } else {
          callback(null, 
            new Metadata(torrentData.infoHash, torrentData.info), 
            Tracker.createTrackers(torrentData['announce'], torrentData['announce-list']));
        }
      });
    }
  }
};

module.exports = exports = TorrentData;
