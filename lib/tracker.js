
var bencode = require('./bencode');

var CONNECTING = 'connecting';
var ERROR = 'error';
var STOPPED = 'stopped';
var WAITING = 'waiting';

var Tracker = function(url, torrent) {
  this.url = require('url').parse(url);
  this.torrent = torrent;
  this.state = STOPPED;
};

Tracker.prototype.complete = function(cb) {
  announce(this, 'completed', cb);
};

Tracker.prototype.start = function(cb) {
  announce(this, 'started', cb);
};

Tracker.prototype.stop = function(cb) {
  announce(this, 'stopped', cb);
};

function announce(self, event, cb) {
  var data = self.torrent.trackerInfo();
  var query = '?info_hash=' + escape(data['info_hash'].toString('binary')) +
              '&peer_id=' + escape(data['peer_id'].toString('binary')) +
              '&port=' + data['port'] +
              '&uploaded=' + data['uploaded'] +
              '&downloaded=' + data['downloaded'] +
              '&left=' + data['left'] +
              '&compact=1' +
              '&numwant=200' +
              '&event=' + event || 'empty';
  
  if (self.trackerId) {
    query += '&trackerid=' + self.trackerId;
  }

  var options = {
      host: self.url.host,
      path: self.url.pathname + query,
      port: self.url.port
  };

  // TODO: UDP, maybe https?
  // https://github.com/pquerna/node-examples/blob/master/udp/chat-client.js

  if (self.url.protocol === 'http:') {
    self.state = CONNECTING;
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
          self.state = ERROR;
          self.errorMessage = response['failure reason'];
        } else {
          if (response['tracker id']) {
            self.trackerId = response['tracker id'];
          }
          self.state = WAITING;
          if (event === 'started') {
            var interval = response['interval'];
            if (self.timeoutId) {
              clearTimeout(self.timeoutId);
            }
            if (interval) {
              console.log('setting tracker update to', interval);
              self.timeoutId = setTimeout(function() {
                announce(self, null, cb);
              }, interval * 1000);
            }
          } else if (event === 'stopped') {
            clearTimeout(self.timeoutId);
            delete self.timeoutId;
            self.state = STOPPED;
          }
          cb(response);
        }
      });
    });
    req.on('error', function(e) {
      self.state = ERROR;
      self.errorMessage = e.message;
    });
  }
};

module.exports = Tracker;