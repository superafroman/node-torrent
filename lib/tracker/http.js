
var bencode = require('../util/bencode');
var http = require('http');
  
var LOGGER = require('log4js').getLogger('http.js');

function HTTP() {
}

HTTP.prototype = {

  callback: null,
  
  data: null,

  event: null,

  tracker: null,

  handle: function(tracker, data, event, callback) {

    this.tracker = tracker;
    this.data = data;
    this.event = event;
    this.callback = callback;

    this._makeRequest();
  },

  _complete: function(trackerInfo, err) {
    this.callback(trackerInfo, err);
  },

  _makeRequest: function() {
    var query = '?info_hash=' + escape(this.data['info_hash'].toString('binary')) +
                '&peer_id=' + escape(this.data['peer_id'].toString('binary')) +
                '&port=' + this.data['port'] +
                '&uploaded=' + this.data['uploaded'] +
                '&downloaded=' + this.data['downloaded'] +
                '&left=' + this.data['left'] +
                '&compact=1' +
                '&numwant=200' +
                '&event=' + this.event || 'empty';
    
    if (this.tracker.trackerId) {
      query += '&trackerid=' + this.tracker.trackerId;
    }

    var options = {
        host: this.tracker.url.hostname,
        path: this.tracker.url.pathname + query,
        port: this.tracker.url.port };

    var self = this;

    var req = http.get(options, function(res) {
      var buffers = [];
      var length = 0;
      res.on('data', function(chunk) {
        buffers.push(chunk);
        length += chunk.length;
      });
      res.on('end', function() {
        var body = new Buffer(length);
        var pos = 0;
        for (var i = 0; i < buffers.length; i++) {
          body.write(buffers[i].toString('binary'), pos, 'binary');
          pos += buffers[i].length;
        }
        if (res.statusCode === 200) {
          var response = bencode.decode(body.toString('binary'));
          self._parseResponse(response);
        } else {
          LOGGER.debug('Unexpected status code: ' + res.statusCode + ', response: ' + body.toString());
          self._complete(null, new Error('Unexpected status code: ' + res.statusCode + ', response: ' + body.toString()));
        }
      });
    });
    req.on('error', function(e) {
      self._complete(null, new Error(e.message));
    });
  },

  _parseResponse: function(response) {
    LOGGER.debug('parsing response from tracker');
    if (response['failure reason']) {
      this._complete(null, new Error(response['failure reason']));
    } else {
      var trackerInfo = {
        trackerId: response['tracker id'],
        interval: response['interval'],
        seeders: response.complete,
        leechers: response.incomplete,
        peers: [] };

      if (response.peers) {
				if (typeof(response.peers) === 'string') {
					var peers = new Buffer(response.peers, 'binary');
					for (var i = 0; i < peers.length; i += 6) {
						var ip = peers[i] + '.' + peers[i + 1] + '.' + peers[i + 2] + '.' + peers[i + 3];
						var port = peers[i + 4] << 8 | peers[i + 5];
            LOGGER.debug('Parsed peer ip:' + ip + ', port: ' + port);
						trackerInfo.peers.push({
							ip: ip,
							port: port
						});
					}
				}
				else {
					trackerInfo.peers = response.peers;
				}
      }   
      this._complete(trackerInfo);
    }
  }
};

module.exports = HTTP;
