
var util = require('util');

var BitField = require('./util/bitfield');
var BufferUtils = require('./util/bufferutils');
var EventEmitter = require('events').EventEmitter;

var Piece = function(index, length, hash) {
  EventEmitter.call(this);

  this.index = index;
  this.hash = hash;
  this.complete = new BitField(length / Piece.CHUNK_LENGTH);
  this.requested = new BitField(this.complete.length);
  this.data = new Buffer(length);
  this.position = index * length;
};
util.inherits(Piece, EventEmitter);

Piece.prototype.hasRequestedAllChunks = function() {
  return this.requested.cardinality() === this.requested.length;
};

Piece.prototype.cancelRequest = function(begin) {
  var index = begin / Piece.CHUNK_LENGTH;
  this.requested.unset(index);
};

Piece.prototype.nextChunkBegin = function() {
  var indices = this.requested.or(this.complete).unsetIndices();
  if (indices.length === 0) {
    return -1;
  }
  this.requested.set(indices[0]);
  return indices[0] * Piece.CHUNK_LENGTH;
};

Piece.prototype.addChunk = function(begin, data) {
  var index = begin / Piece.CHUNK_LENGTH;
  if (!this.complete.isSet(index)) {
    data.copy(this.data, begin, 0);
    this.complete.set(index);
    if (this.complete.cardinality() === this.complete.length) {
      this.emit(Piece.COMPLETE);
    }
  } else {
    console.log('duplicate chunk received');
  }
};

Piece.CHUNK_LENGTH = 16384;

Piece.COMPLETE = 'complete';

module.exports = Piece;
