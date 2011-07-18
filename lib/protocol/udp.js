
var dgram = require('dgram');

var BufferUtils = require('../util/bufferutils');

var CONNECTION_ID = BufferUtils.concat(BufferUtils.fromInt(0x417), BufferUtils.fromInt(0x27101980));

// Events
var CONNECT = BufferUtils.fromInt(0x0);
var ANNOUNCE = BufferUtils.fromInt(0x1);
var SCRAPE = BufferUtils.fromInt(0x2);
var ERROR = BufferUtils.fromInt(0x3);

module.exports = function(tracker, data, cb) {

  var socket = dgram.createSocket('udp4', function(msg, peer){
  });

  socket.send(packet, 0, packet.length, tracker.url.port, tracker.url.host);
}

