
var bencode = require('./util/bencode');
var protocol = require('./protocol');

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

  var handler = protocol[self.url.protocol];

  if (handler) {
    var data = self.torrent.trackerInfo();
    self.state = CONNECTING;
    handler(self, data, function(response) {
      if (response instanceof Error) {
        self.state = ERROR;
        self.errorMessage = response.message;
      } else {
        if (response.trackerId) {
          self.trackerId = response.trackerId;
        }
        self.state = WAITING;
        if (event === 'started') {
          var interval = response.interval;
          if (self.timeoutId) {
            clearInterval(self.timeoutId);
          }
          if (interval) {
            self.timeoutId = setInterval(function() {
              announce(self, null, cb);
            }, interval * 1000);
          }
        } else if (event === 'stopped') {
          clearInterval(self.timeoutId);
          delete self.timeoutId;
          self.state = STOPPED;
        }
        cb(response);
      }
    });
  }
};

module.exports = Tracker;
