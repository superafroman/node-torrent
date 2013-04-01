
var bencode = require('../util/bencode'),
    protocol = require('./protocol'),
    util = require('util');

var EventEmitter = require('events').EventEmitter;

var LOGGER = require('log4js').getLogger('tracker.js');

var CONNECTING = 'connecting';
var ERROR = 'error';
var STOPPED = 'stopped';
var WAITING = 'waiting';

var ANNOUNCE_START_INTERVAL = 5;

var Tracker = function(urls) {
  EventEmitter.call(this);
  if (!Array.isArray(urls)) {
    this._urls = [urls];
  } else {
    this._urls = urls;
  }
  // TODO: need to step through URLs as part of announce process
  this.url = require('url').parse(this._urls[0]);
  this.torrent = null;
  this.state = STOPPED;
  this.seeders = 0;
  this.leechers = 0;
};
util.inherits(Tracker, EventEmitter);

Tracker.prototype.setTorrent = function(torrent) {
  this.torrent = torrent;
};

Tracker.prototype.start = function(callback) {
  this.callback = callback;
  this._announce('started');
};

Tracker.prototype.stop = function() {
  this._announce('stopped');
};

Tracker.prototype._announce = function(event) {
  
  LOGGER.debug('Announce' + (event ? ' ' + event : ''));

  var handlerClass = protocol[this.url.protocol],
      tracker = this;

  if (handlerClass) {
    var handler = new handlerClass();
    var data = {
      peer_id: this.torrent.clientId,
      info_hash: this.torrent.infoHash,
      port: this.torrent.clientPort
    };
    this.state = CONNECTING;
    handler.handle(this, data, event, function(info, error) {
      if (error) {
        LOGGER.warn('announce error from ' + tracker.url.href + ': ' + error.message);
        tracker.state = ERROR;
        tracker.errorMessage = error.message;
        if (event === 'started') {
          LOGGER.warn('retry announce \'started\' in ' + ANNOUNCE_START_INTERVAL + 's');
          setTimeout(function() {
            tracker._announce('started');
          }, ANNOUNCE_START_INTERVAL * 1000);
        }
      } else {
        if (info.trackerId) {
          tracker.trackerId = info.trackerId;
        }
        tracker.state = WAITING;
        if (event === 'started') {
          var interval = info.interval;
          if (tracker.timeoutId) {
            clearInterval(tracker.timeoutId);
          }
          if (interval) {
            tracker.timeoutId = setInterval(function() {
              tracker._announce(null);
            }, interval * 1000);
          }
        } else if (event === 'stopped') {
          clearInterval(tracker.timeoutId);
          delete tracker.timeoutId;
          tracker.state = STOPPED;
        }
      }
      tracker._updateInfo(info);
    });
  }
};

Tracker.prototype._updateInfo = function(data) {
  LOGGER.debug('Updating details from tracker. ' + (data && data.peers ? data.peers.length : 0) + ' new peers');
  if (data) {
    this.seeders = data.seeders || 0;
    this.leechers = data.leechers || 0;
    if (data.peers) {
      for (var i = 0; i < data.peers.length; i++) {
        var peer = data.peers[i];
        this.callback(peer.peer_id, peer.ip, peer.port);
      }
    }
    this.emit('updated');
  }
};

Tracker.createTrackers = function(announce, announceList) {
  var trackers = [];
  if (announceList) {
    announceList.forEach(function(announce) {
      trackers.push(new Tracker(announce));
    });
  } else {
    trackers.push(new Tracker(announce));
  }
  return trackers;
};

module.exports = Tracker;
