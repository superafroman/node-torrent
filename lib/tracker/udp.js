
var dgram = require('dgram');

var BufferUtils = require('../util/bufferutils');

var CONNECTION_ID = BufferUtils.concat(
  BufferUtils.fromInt(0x417), 
  BufferUtils.fromInt(0x27101980));
  
var LOGGER = require('log4js').getLogger('udp.js');

// Actions
var Action = {
  CONNECT: 0,
  ANNOUNCE: 1,
  SCRAPE: 2,
  ERROR: 3
};

function UDP() {
}

UDP.prototype = {

  callback: null,
  
  connectionId: null,

  data: null,

  event: null,

  socket: null,

  tracker: null,

  transactionId: null,

  resolvedIp: null,

  handle: function(tracker, data, event, callback) {

    this.tracker = tracker;
    this.data = data;
    this.event = event;
    this.callback = callback;

    var self = this;
    this.socket = dgram.createSocket('udp4', function(msg, rinfo) {
      self._handleMessage(msg, rinfo);
    }).on('error', function(e) {
      self._complete(null, new Error(e.message));
    });
    this._connect();
  },

  _announce: function() {
    LOGGER.debug('Sending announce request to UDP tracker at ' + this.tracker.url.hostname + ':' + this.tracker.url.port);
    this._generateTransactionId();
    var packet = BufferUtils.concat(this.connectionId, 
      BufferUtils.fromInt(Action.ANNOUNCE), 
      this.transactionId, this.data['info_hash'], this.data['peer_id'],
      BufferUtils.fromInt(0), BufferUtils.fromInt(this.data['downloaded'] || 0), // int64, TODO: split data into two parts etc
      BufferUtils.fromInt(0), BufferUtils.fromInt(this.data['left'] || 0), // 64
      BufferUtils.fromInt(0), BufferUtils.fromInt(this.data['uploaded'] || 0), //64
      BufferUtils.fromInt(this.event),
      BufferUtils.fromInt(0), 
      BufferUtils.fromInt(Math.random() * 255),
      BufferUtils.fromInt(200),
      BufferUtils.fromInt16(this.data['port'])
    );
    this._send(packet);
  },

  _announceResponse: function(msg) {

    var trackerInfo = {
      interval: BufferUtils.readInt(msg, 8),
      leechers: BufferUtils.readInt(msg, 12),
      seeders: BufferUtils.readInt(msg, 16),
      peers: []
    };

    for (var i = 20; i < msg.length; i += 6) {
      var ip = msg[i] + '.' + msg[i + 1] + '.' + msg[i + 2] + '.' + msg[i + 3];
      var port = msg[i + 4] << 8 | msg[i + 5];
      LOGGER.debug('Parsed peer with details: ' + ip + ':' + port);
      trackerInfo.peers.push({ip: ip, port: port});
    }

    this._complete(trackerInfo);
  },

  _complete: function(trackerInfo, err) {
    try {
      this.socket.close();
    } catch(e) {}
    this.callback(trackerInfo, err);
  },

  _connect: function() {
    LOGGER.debug('sending connect request to UDP tracker at ' + this.tracker.url.hostname + ':' + this.tracker.url.port);
    this._generateTransactionId();
    var packet = BufferUtils.concat(CONNECTION_ID, BufferUtils.fromInt(Action.CONNECT), this.transactionId);
    this._send(packet);
  },

  _generateTransactionId: function() {
    LOGGER.debug('generating transaction id');
    var id = new Buffer(4);
    id[0] = Math.random() * 255;
    id[1] = Math.random() * 255;
    id[2] = Math.random() * 255;
    id[3] = Math.random() * 255;
    this.transactionId = id;
  },

  _handleMessage: function(msg, rinfo) {
    LOGGER.debug('handling message from tracker');
    var action = BufferUtils.readInt(msg);
    var responseTransactionId = BufferUtils.slice(msg, 4, 8);
    console.log(responseTransactionId, this.transactionId);
    if (BufferUtils.equal(responseTransactionId, this.transactionId)) {
      this.resolvedIp = rinfo.address;
      LOGGER.debug('transactionIds equals, action = ' + action);
      switch (action) {
        case Action.CONNECT:
          this.connectionId = BufferUtils.slice(msg, 8, 16);
          LOGGER.debug('Received connectionId from server, id = ' + this.connectionId);
          this._announce();
          break;
        case Action.ANNOUNCE:
          LOGGER.debug('Received announce response.');
          this._announceResponse(msg);
          break;
        case Action.SCRAPE:
          break;
        case Action.ERROR:
          LOGGER.debug('Received error from server.');
          var message = BufferUtils.slice(msg, 8, msg.length);
          this._complete(null, new Error(message.toString('utf8')));
          break;
        default:
          LOGGER.warn('Unknown action received from server.  Action = ' + action);
      }
    } else {
      this._complete(null, new Error('Received invalid transactionId from server.'));
    }
  },

  _send: function(packet) {
    var self = this;
    var host = this.resolvedIp || this.tracker.url.hostname;
    this.socket.send(packet, 0, packet.length, this.tracker.url.port, host, function(err) {
      LOGGER.debug('packet sent, err = ', err);
      if (err) {
        self._complete(null, err);
      }
    });
  }
};

module.exports = UDP;
