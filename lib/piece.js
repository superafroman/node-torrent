
var util = require('util');

var BufferUtils = require('./bufferutils');
var EventEmitter = require('events').EventEmitter;

var Piece = function(index, length) {
  EventEmitter.call(this);
  
  this.index = index;
  this.data = new Buffer(length);
  this.chunks = 0;
  this.requested = 0;
  this.totalChunks = Math.ceil(length / Piece.CHUNK_LENGTH);
};
util.inherits(Piece, EventEmitter);

Piece.prototype.nextChunkBegin = function() {
  if (this.requested === this.totalChunks) {
    return -1;
  }
  var begin = this.requested * Piece.CHUNK_LENGTH;
  this.requested++;
  return begin;
};

Piece.prototype.addChunk = function(begin, data) {
  data.copy(this.data, begin, 0);
  this.chunks++;
  if (this.chunks === this.totalChunks) {
    this.emit(Piece.COMPLETE);
  }
};

Piece.CHUNK_LENGTH = 16384;

Piece.COMPLETE = 'complete';

module.exports = Piece;
