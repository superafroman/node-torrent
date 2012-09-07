
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

  var handlerClass = protocol[self.url.protocol];

  if (handlerClass) {
    var handler = new handlerClass();
    var data = self.torrent.trackerInfo();
    self.state = CONNECTING;
    handler.handle(self, data, event, function(info, error) {
      if (error) {
        self.state = ERROR;
        self.errorMessage = error.message;
      } else {
        if (info.trackerId) {
          self.trackerId = info.trackerId;
        }
        self.state = WAITING;
        if (event === 'started') {
          var interval = info.interval;
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
        cb(info);
      }
    });
  }
};

module.exports = Tracker;
