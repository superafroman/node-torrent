
var bencode = require('./util/bencode');
var protocol = require('./protocol');

var LOGGER = require('log4js').getLogger('tracker.js');

var CONNECTING = 'connecting';
var ERROR = 'error';
var STOPPED = 'stopped';
var WAITING = 'waiting';

var ANNOUNCE_START_INTERVAL = 5;

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
        LOGGER.warn('announce error from ' + self.url.href + ': ' + error.message);
        self.state = ERROR;
        self.errorMessage = error.message;
        if (event === 'started') {
          LOGGER.warn('retry announce \'started\' in ' + ANNOUNCE_START_INTERVAL + 's');
          setTimeout(function() {
            announce(self, 'started', cb);
          }, ANNOUNCE_START_INTERVAL * 1000);
        }
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
      }
      if (cb) {
        cb(info);
      }
    });
  }
};

module.exports = Tracker;
