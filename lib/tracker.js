
var bencode = require('./bencode');

var CONNECTING = 'TRACKER_CONNECTING';
var ERROR = 'TRACKER_ERROR';
var STOPPED = 'TRACKER_STOPPED';
var WAITING = 'TRACKER_WAITING';

var Tracker = function(url, torrent) {
  this.url = require('url').parse(url);
  this.torrent = torrent;
  this.state = STOPPED;
};

Tracker.prototype.complete = function(cb) {
  this.announce('completed', cb);
};

Tracker.prototype.start = function(cb) {
  this.announce('started', cb);
};

Tracker.prototype.stop = function(cb) {
  this.announce('stopped', cb);
};

Tracker.prototype.announce = function(event, cb) {
  var data = this.torrent.trackerInfo();
  var query = '?info_hash=' + escape(data['info_hash'].toString('binary')) +
              '&peer_id=' + escape(data['peer_id'].toString('binary')) +
              '&port=' + data['port'] +
              '&uploaded=' + data['uploaded'] +
              '&downloaded=' + data['downloaded'] +
              '&left=' + data['left'] +
              '&compact=1' +
              '&event=' + event || 'empty';
  
  if (this.trackerId) {
    query += '&trackerid=' + this.trackerId;
  }

  var options = {
      host: this.url.host,
      path: this.url.pathname + query,
      port: this.url.port
  };

  // TODO: UDP, maybe https?
  // https://github.com/pquerna/node-examples/blob/master/udp/chat-client.js

  if (this.url.protocol === 'http:') {
    this.state = CONNECTING;
    var http = require('http');
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
        var response = bencode.decode(body.toString('binary'));
        if (response['failure reason']) {
          this.state = ERROR;
          this.errorMessage = response['failure reason'];
        } else {
          if (response['tracker id']) {
            this.trackerId = response['tracker id'];
          }
          if (data.event === 'started') {
            var interval = response['interval'];
            var self = this;
            this.timeoutId = setTimeout(function() {
              self.announce(null, cb);
            }, interval);
          } else if (data.event === 'stopped') {
            clearTimeout(this.timeoutId);
            delete this.timeoutId;
          }
          this.state = WAITING;
          cb(response);
        }
      });
    });
    req.on('error', function(e) {
      this.state = ERROR;
      this.errorMessage = e.message;
    });
  }
};

module.exports = Tracker;